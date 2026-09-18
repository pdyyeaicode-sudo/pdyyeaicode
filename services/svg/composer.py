from __future__ import annotations

import logging
import math
import re
from html import escape
from typing import Final, Optional

from shared.models import DesignOutput, LayoutBox, LayoutRole, PrintMeta, RealizedBlueprint, SVGLayer, StyleDecision


logger = logging.getLogger("printrocket.svg.composer")

DEFAULT_BLEED_MM: Final[float] = 3.0
MAX_SVG_BYTES: Final[int] = 500 * 1024
TEXT_ROLES: Final[set[LayoutRole]] = {"headline", "subheading", "body", "cta"}
IMAGE_ROLES: Final[set[LayoutRole]] = {"image", "logo"}
RECT_ROLES: Final[set[LayoutRole]] = {"shape", "background"}
ROLE_TO_LAYER: Final[dict[LayoutRole, str]] = {
    "headline": "headline",
    "subheading": "body",
    "body": "body",
    "cta": "cta",
    "logo": "logo",
    "image": "image-slots",
    "background": "shapes",
    "shape": "shapes",
}
LAYER_SEQUENCE: Final[list[tuple[str, bool, LayoutRole]]] = [
    ("background", False, "background"),
    ("shapes", True, "shape"),
    ("image-slots", True, "image"),
    ("body", True, "body"),
    ("cta", True, "cta"),
    ("headline", True, "headline"),
    ("logo", False, "logo"),
    ("print-marks", False, "shape"),
]
HEX_COLOR_PATTERN: Final[re.Pattern[str]] = re.compile(r"^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
PRINT_MARKS_PATTERN: Final[re.Pattern[str]] = re.compile(
    r'(<g data-role="print-marks" data-editable="false" data-layer-id="print-marks" visibility="hidden">)(.*?)(</g>)',
    re.DOTALL,
)


def compose_svg(blueprint: RealizedBlueprint) -> DesignOutput:
    style_by_element: dict[str, StyleDecision] = {style.elementId: style for style in blueprint.styleMap}
    gradient_defs: dict[str, str] = {}
    layer_content: dict[str, list[str]] = {layer_name: [] for layer_name, _, _ in LAYER_SEQUENCE}

    layer_content["background"].append(_build_background_layer_image(blueprint.backgroundImageUrl))

    for box in sorted(blueprint.layoutTree.boxes, key=lambda item: (item.zIndex, item.id)):
        style_decision: StyleDecision = _style_for_box(style_by_element, box)
        layer_name: str = ROLE_TO_LAYER[box.role]
        rendered_elements: list[str] = _render_box(box, style_decision, gradient_defs)
        layer_content[layer_name].extend(rendered_elements)

    layer_content["print-marks"].append(_build_print_marks_comment(DEFAULT_BLEED_MM))

    defs_block: str = _build_defs_block(gradient_defs)
    group_markup: dict[str, str] = {
        layer_name: _wrap_group(layer_name, is_editable, "\n".join(elements))
        for layer_name, is_editable, _ in LAYER_SEQUENCE
        for elements in [layer_content[layer_name]]
    }
    svg_layers: list[SVGLayer] = [
        SVGLayer(
            id=layer_name,
            role=layer_role,
            svgElement=group_markup[layer_name],
            isEditable=is_editable,
        )
        for layer_name, is_editable, layer_role in LAYER_SEQUENCE
    ]

    canvas_width: str = _format_number(_snap(blueprint.layoutTree.canvasWidth))
    canvas_height: str = _format_number(_snap(blueprint.layoutTree.canvasHeight))
    composed_svg: str = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{canvas_width}" height="{canvas_height}" '
        f'data-printrocket="true" data-version="1.0">\n'
        f"{defs_block}\n"
        f"{chr(10).join(group_markup[layer_name] for layer_name, _, _ in LAYER_SEQUENCE)}\n"
        "</svg>"
    )
    composed_svg = apply_print_meta(composed_svg, DEFAULT_BLEED_MM)

    if len(composed_svg.encode("utf-8")) > MAX_SVG_BYTES:
        raise ValueError("Composed SVG exceeds the 500KB markup limit before raster assets.")

    logger.info(
        {
            "requestId": blueprint.requestId,
            "stage": "svg-compose",
            "status": "success",
            "layerCount": len(svg_layers),
            "boxCount": len(blueprint.layoutTree.boxes),
        }
    )
    return DesignOutput(
        requestId=blueprint.requestId,
        svgLayers=svg_layers,
        composedSVG=composed_svg,
        backgroundImageUrl=blueprint.backgroundImageUrl,
        printMeta=PrintMeta(
            bleed=DEFAULT_BLEED_MM,
            cmykSafe=True,
            trimMarks=DEFAULT_BLEED_MM > 0,
        ),
    )


def apply_print_meta(svg: str, bleed_mm: float) -> str:
    if bleed_mm < 0:
        raise ValueError("Bleed cannot be negative.")

    print_marks_content: str = _build_print_marks_comment(bleed_mm)
    match: re.Match[str] | None = PRINT_MARKS_PATTERN.search(svg)
    if match is None:
        raise ValueError("Print marks layer is missing from the SVG payload.")

    replaced_svg: str = PRINT_MARKS_PATTERN.sub(
        rf'\1{print_marks_content}\3',
        svg,
        count=1,
    )
    
    # Apply CMYK safe conversion to all hex colors
    def replacer(match: re.Match[str]) -> str:
        return hex_to_cmyk_safe(match.group(0))
        
    cmyk_svg: str = re.sub(r'#(?:[0-9a-fA-F]{6})', replacer, replaced_svg)
    return cmyk_svg


def hex_to_cmyk_safe(hex_color: str) -> str:
    red, green, blue = _hex_to_rgb(hex_color)

    red_unit: float = red / 255.0
    green_unit: float = green / 255.0
    blue_unit: float = blue / 255.0
    black: float = 1.0 - max(red_unit, green_unit, blue_unit)

    if math.isclose(black, 1.0):
        cyan = 0.0
        magenta = 0.0
        yellow = 0.0
    else:
        denominator: float = 1.0 - black
        cyan = (1.0 - red_unit - black) / denominator
        magenta = (1.0 - green_unit - black) / denominator
        yellow = (1.0 - blue_unit - black) / denominator

    safe_red: int = _channel_from_cmyk(cyan, black)
    safe_green: int = _channel_from_cmyk(magenta, black)
    safe_blue: int = _channel_from_cmyk(yellow, black)
    return f"#{safe_red:02X}{safe_green:02X}{safe_blue:02X}"


def _channel_from_cmyk(channel: float, black: float) -> int:
    safe_value: float = 255.0 * (1.0 - channel) * (1.0 - black)
    return max(0, min(255, int(round(safe_value))))


def _style_for_box(style_by_element: dict[str, StyleDecision], box: LayoutBox) -> StyleDecision:
    style_decision: StyleDecision | None = style_by_element.get(box.id)
    if style_decision is None:
        raise ValueError(f"Missing StyleDecision for layout box '{box.id}'.")
    return style_decision


def _render_box(
    box: LayoutBox,
    style_decision: StyleDecision,
    gradient_defs: dict[str, str],
) -> list[str]:
    if box.role in TEXT_ROLES:
        return _render_text_box(box, style_decision, gradient_defs)
    if box.role in IMAGE_ROLES:
        return [_render_image_box(box, style_decision)]
    if box.role in RECT_ROLES:
        return [_render_rect_box(box, style_decision, gradient_defs)]
    raise ValueError(f"Unsupported layout role '{box.role}'.")


def _render_text_box(
    box: LayoutBox,
    style_decision: StyleDecision,
    gradient_defs: dict[str, str],
) -> list[str]:
    if box.content is None:
        raise ValueError(f"Text layout box '{box.id}' is missing content.")

    if box.role == "cta":
        cta_rect: str = _render_cta_background(box, style_decision, gradient_defs)
        cta_text: str = _render_text_element(box, style_decision, gradient_defs)
        return [cta_rect, cta_text]
    return [_render_text_element(box, style_decision, gradient_defs)]


def _render_text_element(
    box: LayoutBox,
    style_decision: StyleDecision,
    gradient_defs: dict[str, str],
) -> str:
    font_size: float = _estimate_font_size(box)
    line_height: float = max(font_size * 1.2, font_size + 2.0)
    lines: list[str] = _wrap_text(box.content or "", box.width, font_size, box.role)
    x_value: str = _format_number(_snap(box.x))
    y_base: float = _snap(box.y)
    y_value: str = _format_number(y_base)
    width_value: str = _format_number(_snap(box.width))
    fill_value: str = _resolve_text_fill(style_decision, box.id, gradient_defs)
    shadow_attribute: str = _shadow_attribute(style_decision.shadow)
    class_value: str = f"printrocket-text printrocket-text--{box.role}"

    if len(lines) == 1:
        text_content: str = escape(lines[0])
    else:
        tspans: list[str] = []
        for index, line in enumerate(lines):
            line_y: str = _format_number(_snap(y_base + (index * line_height)))
            tspans.append(f'<tspan x="{x_value}" y="{line_y}">{escape(line)}</tspan>')
        text_content = "".join(tspans)

    return (
        f'<text data-field="{escape(box.role, quote=True)}" '
        f'data-element-id="{escape(box.id, quote=True)}" '
        f'x="{x_value}" y="{y_value}" width="{width_value}" '
        f'fill="{fill_value}" font-size="{_format_number(font_size)}" '
        f'class="{class_value}" dominant-baseline="text-before-edge"{shadow_attribute}>'
        f"{text_content}</text>"
    )


def _render_cta_background(
    box: LayoutBox,
    style_decision: StyleDecision,
    gradient_defs: dict[str, str],
) -> str:
    fill_value: str = _resolve_rect_fill(style_decision, box.id, gradient_defs)
    shadow_attribute: str = _shadow_attribute(style_decision.shadow)
    radius: float = min(max(box.height * 0.2, 4.0), 12.0)
    return (
        f'<rect data-field="cta-bg" data-element-id="{escape(box.id, quote=True)}" '
        f'x="{_format_number(_snap(box.x))}" y="{_format_number(_snap(box.y))}" '
        f'width="{_format_number(_snap(box.width))}" height="{_format_number(_snap(box.height))}" '
        f'rx="{_format_number(_snap(radius))}" fill="{fill_value}"{shadow_attribute}/>'
    )


def _render_rect_box(
    box: LayoutBox,
    style_decision: StyleDecision,
    gradient_defs: dict[str, str],
) -> str:
    fill_value: str = _resolve_rect_fill(style_decision, box.id, gradient_defs)
    shadow_attribute: str = _shadow_attribute(style_decision.shadow)
    return (
        f'<rect data-field="{escape(box.role, quote=True)}" '
        f'data-element-id="{escape(box.id, quote=True)}" '
        f'x="{_format_number(_snap(box.x))}" y="{_format_number(_snap(box.y))}" '
        f'width="{_format_number(_snap(box.width))}" height="{_format_number(_snap(box.height))}" '
        f'fill="{fill_value}"{shadow_attribute}/>'
    )


def _render_image_box(box: LayoutBox, style_decision: StyleDecision) -> str:
    if box.imageUrl is None or not box.imageUrl.strip():
        return _render_image_placeholder(box, style_decision)

    editable_field: str = ""
    if box.role == "image":
        editable_field = ' data-field="image"'
    shadow_attribute: str = _shadow_attribute(style_decision.shadow)
    return (
        f'<image{editable_field} data-element-id="{escape(box.id, quote=True)}" '
        f'href="{escape(box.imageUrl, quote=True)}" '
        f'x="{_format_number(_snap(box.x))}" y="{_format_number(_snap(box.y))}" '
        f'width="{_format_number(_snap(box.width))}" height="{_format_number(_snap(box.height))}" '
        f'preserveAspectRatio="xMidYMid slice"{shadow_attribute}/>'
    )


def _render_image_placeholder(box: LayoutBox, style_decision: StyleDecision) -> str:
    placeholder_fill: str = "#E5E7EB"
    placeholder_stroke: str = hex_to_cmyk_safe(style_decision.fontColor)
    label_color: str = hex_to_cmyk_safe(style_decision.fontColor)
    center_x: str = _format_number(_snap(box.x + (box.width / 2.0)))
    center_y: str = _format_number(_snap(box.y + (box.height / 2.0)))
    label_size: str = _format_number(max(12.0, min(box.width, box.height) * 0.12))
    return (
        f'<g data-element-id="{escape(box.id, quote=True)}">'
        f'<rect data-field="image" x="{_format_number(_snap(box.x))}" y="{_format_number(_snap(box.y))}" '
        f'width="{_format_number(_snap(box.width))}" height="{_format_number(_snap(box.height))}" '
        f'fill="{placeholder_fill}" stroke="{placeholder_stroke}" stroke-width="1.5" '
        'stroke-dasharray="6 4"/>'
        f'<text data-field="image-label" x="{center_x}" y="{center_y}" fill="{label_color}" '
        f'font-size="{label_size}" text-anchor="middle" dominant-baseline="middle" '
        'class="printrocket-text">Image Slot</text>'
        "</g>"
    )


def _resolve_text_fill(
    style_decision: StyleDecision,
    element_id: str,
    gradient_defs: dict[str, str],
) -> str:
    if style_decision.gradient:
        return _register_gradient(style_decision.gradient, element_id, gradient_defs)
    return hex_to_cmyk_safe(style_decision.fontColor)


def _resolve_rect_fill(
    style_decision: StyleDecision,
    element_id: str,
    gradient_defs: dict[str, str],
) -> str:
    if style_decision.gradient:
        return _register_gradient(style_decision.gradient, element_id, gradient_defs)
    if style_decision.backgroundColor is None:
        raise ValueError(f"Element '{element_id}' requires backgroundColor or gradient.")
    return hex_to_cmyk_safe(style_decision.backgroundColor)


def _register_gradient(
    gradient: str,
    element_id: str,
    gradient_defs: dict[str, str],
) -> str:
    gradient_id: str = f"gradient-{_sanitize_identifier(element_id)}"
    if gradient_id not in gradient_defs:
        gradient_defs[gradient_id] = _build_linear_gradient(gradient_id, gradient)
    return f"url(#{gradient_id})"


def _build_linear_gradient(gradient_id: str, gradient: str) -> str:
    source: str = gradient.strip()
    if not source.startswith("linear-gradient(") or not source.endswith(")"):
        raise ValueError(f"Unsupported gradient syntax '{gradient}'.")

    inner_value: str = source[len("linear-gradient(") : -1]
    parts: list[str] = _split_css_arguments(inner_value)
    angle_degrees: float = 0.0
    stop_index: int = 0

    if parts and parts[0].strip().endswith("deg"):
        angle_degrees = float(parts[0].strip()[:-3])
        stop_index = 1

    stop_parts: list[str] = [part.strip() for part in parts[stop_index:] if part.strip()]
    if len(stop_parts) < 2:
        raise ValueError(f"Gradient '{gradient}' requires at least two color stops.")

    stops: list[str] = []
    total_stops: int = len(stop_parts)
    for index, stop_part in enumerate(stop_parts):
        color_value, offset_value = _parse_gradient_stop(stop_part, index, total_stops)
        stops.append(
            f'<stop offset="{escape(offset_value, quote=True)}" '
            f'stop-color="{escape(color_value, quote=True)}"/>'
        )

    return (
        f'<linearGradient id="{gradient_id}" x1="0%" y1="0%" x2="100%" y2="0%" '
        f'gradientTransform="rotate({_format_number(angle_degrees)})">'
        f"{''.join(stops)}</linearGradient>"
    )


def _parse_gradient_stop(stop_value: str, index: int, total_stops: int) -> tuple[str, str]:
    tokens: list[str] = stop_value.split()
    if not tokens:
        raise ValueError("Gradient stop cannot be empty.")
    color_value: str = hex_to_cmyk_safe(tokens[0])
    if len(tokens) > 1:
        offset_value = tokens[1]
    elif total_stops == 1:
        offset_value = "0%"
    else:
        offset_value = f"{round((index / (total_stops - 1)) * 100)}%"
    return color_value, offset_value


def _split_css_arguments(value: str) -> list[str]:
    parts: list[str] = []
    buffer: list[str] = []
    depth: int = 0

    for character in value:
        if character == "(":
            depth += 1
        elif character == ")":
            depth = max(depth - 1, 0)

        if character == "," and depth == 0:
            part: str = "".join(buffer).strip()
            if part:
                parts.append(part)
            buffer = []
            continue
        buffer.append(character)

    trailing_part: str = "".join(buffer).strip()
    if trailing_part:
        parts.append(trailing_part)
    return parts


def _build_background_layer_image(background_image_url: str) -> str:
    return (
        f'<image href="{escape(background_image_url, quote=True)}" x="0" y="0" '
        'width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/>'
    )


def _build_defs_block(gradient_defs: dict[str, str]) -> str:
    gradient_markup: str = "".join(gradient_defs.values())
    return (
        "<defs>\n"
        "  <style><![CDATA[\n"
        "    @font-face {\n"
        "      font-family: 'PrintRocketEmbedded';\n"
        "      src: local('DejaVu Sans'), local('Arial');\n"
        "    }\n"
        "    .printrocket-text {\n"
        "      font-family: 'PrintRocketEmbedded', sans-serif;\n"
        "      white-space: pre;\n"
        "    }\n"
        "  ]]></style>\n"
        f"  {gradient_markup}\n"
        "</defs>"
    )


def _wrap_group(layer_name: str, is_editable: bool, content: str) -> str:
    editable_value: str = "true" if is_editable else "false"
    visibility_attribute: str = ' visibility="hidden"' if layer_name == "print-marks" else ""
    stripped_content: str = content.strip()
    if stripped_content:
        return (
            f'<g data-role="{layer_name}" data-editable="{editable_value}" '
            f'data-layer-id="{layer_name}"{visibility_attribute}>\n'
            f"{stripped_content}\n"
            "</g>"
        )
    return (
        f'<g data-role="{layer_name}" data-editable="{editable_value}" '
        f'data-layer-id="{layer_name}"{visibility_attribute}></g>'
    )


def _build_print_marks_comment(bleed_mm: float) -> str:
    trim_marks_status: str = "true" if bleed_mm > 0 else "false"
    return f"<!-- bleed-box: {bleed_mm:g}mm; trim-marks: {trim_marks_status} -->"


def _estimate_font_size(box: LayoutBox) -> float:
    proposed_size: float = max(12.0, min(_snap(box.height * 0.68), _snap(box.height)))
    if box.role == "headline":
        return max(24.0, proposed_size)
    if box.role == "cta":
        return max(14.0, min(proposed_size, _snap(box.height * 0.5)))
    return proposed_size


def _wrap_text(content: str, box_width: float, font_size: float, role: LayoutRole) -> list[str]:
    normalized_content: str = " ".join(content.split())
    if not normalized_content:
        return [""]

    approx_character_width: float = max(font_size * 0.58, 1.0)
    max_characters: int = max(1, int(box_width / approx_character_width))
    if role in {"body", "subheading"}:
        max_characters = min(max_characters, 60)

    words: list[str] = normalized_content.split(" ")
    lines: list[str] = []
    current_line: str = ""

    for word in words:
        candidate: str = word if not current_line else f"{current_line} {word}"
        if len(candidate) <= max_characters:
            current_line = candidate
            continue
        if current_line:
            lines.append(current_line)
        current_line = word

    if current_line:
        lines.append(current_line)
    return lines or [normalized_content]


def _shadow_attribute(shadow: Optional[str]) -> str:
    if shadow is None or not shadow.strip():
        return ""
    return f' style="filter: drop-shadow({escape(shadow.strip(), quote=True)})"'


def _sanitize_identifier(value: str) -> str:
    sanitized_value: str = re.sub(r"[^a-zA-Z0-9_-]+", "-", value)
    return sanitized_value.strip("-") or "gradient"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    normalized_color: str = _normalize_hex(hex_color)
    return (
        int(normalized_color[1:3], 16),
        int(normalized_color[3:5], 16),
        int(normalized_color[5:7], 16),
    )


def _normalize_hex(hex_color: str) -> str:
    candidate: str = hex_color.strip()
    if not HEX_COLOR_PATTERN.fullmatch(candidate):
        raise ValueError(f"Invalid hex color '{hex_color}'.")
    stripped_candidate: str = candidate.lstrip("#")
    if len(stripped_candidate) == 3:
        stripped_candidate = "".join(character * 2 for character in stripped_candidate)
    return f"#{stripped_candidate.upper()}"


def _snap(value: float) -> float:
    return round(value * 2.0) / 2.0


def _format_number(value: float) -> str:
    if math.isclose(value, round(value)):
        return str(int(round(value)))
    return f"{value:.1f}"
