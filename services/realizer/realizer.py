from __future__ import annotations

import logging
import base64
import os
import re
from typing import Any, Iterable, Optional
from urllib.parse import quote

from shared.models import DesignSpec, LayoutBox, LayoutTree, RealizedBlueprint, StyleDecision


logger = logging.getLogger("printrocket.realizer")
CF_WORKER_URL = os.getenv("CF_WORKER_URL")
CF_API_KEY = os.getenv("CF_API_KEY")

HEX_COLOR_PATTERN = re.compile(r"^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
MIN_CONTRAST_RATIO = 4.5
LIGHT_TEXT = "#FFFFFF"
DARK_TEXT = "#111111"
NEUTRAL_DARK = "#1A1A1A"
NEUTRAL_LIGHT = "#F4F4F4"


def realize(layout: LayoutTree, spec: DesignSpec) -> RealizedBlueprint:
    primary_color, secondary_color = _extract_palette_base_colors(spec.styleTokens)
    palette_colors: list[str] = _palette_colors(spec.styleTokens, primary_color, secondary_color)
    background_image_url: str = _generate_background_image(layout, spec, palette_colors)
    style_map: list[StyleDecision] = [
        _style_for_box(
            box=box,
            style_tokens=spec.styleTokens,
            primary_color=primary_color,
            secondary_color=secondary_color,
            palette_colors=palette_colors,
        )
        for box in sorted(layout.boxes, key=lambda item: (item.zIndex, item.id))
    ]
    return RealizedBlueprint(
        requestId=spec.requestId,
        layoutTree=layout,
        backgroundImageUrl=background_image_url,
        styleMap=style_map,
    )


def check_contrast(fg: str, bg: str) -> bool:
    return _contrast_ratio(fg, bg) >= MIN_CONTRAST_RATIO


def generate_background_image(prompt: str) -> Optional[str]:
    api_key = os.getenv("OPENAI_API_KEY")
    image_model = os.getenv("IMAGE_MODEL", "gemini-3-pro-image-preview")
    
    if not api_key:
        logger.error("No API key defined.")
        return None
        
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        # Native direct API call to Gemini image models (Nano Banana Pro)
        # Using generateContent as these models output multimodal inline_data payloads
        response = client.models.generate_content(
            model=image_model,
            contents=prompt,
        )
        
        url = _extract_google_image_data_url(response)
        if url:
             return url
             
        logger.warning("No inline_data found in Gemini response.")
        return None
    except Exception as exc:
        logger.error(f"Google GenAI image generation failed: {exc}")
        return None


def _generate_background_image(
    layout: LayoutTree,
    spec: DesignSpec,
    palette_colors: list[str],
) -> str:
    background_prompt: str = _build_background_prompt(spec, palette_colors)
    background_url: Optional[str] = generate_background_image(background_prompt)
    if background_url:
        return background_url

    logger.warning(
        {
            "requestId": spec.requestId,
            "stage": "realizer-background",
            "status": "fallback",
            "error": "Cloudflare Worker image generation unavailable.",
        }
    )
    return _gradient_background_data_uri(layout, palette_colors)


def _build_background_prompt(spec: DesignSpec, palette_colors: list[str]) -> str:
    return (
        f"""
{spec.styleTokens.get('backgroundDescription', '')}
Style: {spec.styleTokens.get('mood', '')}
Colors: {', '.join(spec.styleTokens.get('palette', []))}
Shapes and elements: {spec.styleTokens.get('shapes', '')}
CRITICAL CONSTRAINT: You must generate an image with extremely CLEAR and DISTINCT boundaries between elements. Photorealism and gradients are allowed, but the image MUST NOT contain complex blended scenes where foreground and background merge. It must be easily cut out and separated into distinct layers.
NO TEXT. NO LETTERS. Purely visual background only.
"""
    ).strip()


def _extract_google_image_data_url(response: Any) -> Optional[str]:
    candidates: Any = getattr(response, "candidates", None)
    if not candidates:
        return None
    first_candidate: Any = candidates[0]
    content: Any = getattr(first_candidate, "content", None)
    if content is None:
        return None
    parts: Any = getattr(content, "parts", None)
    if not parts:
        return None

    for part in parts:
        inline_data: Any = getattr(part, "inline_data", None)
        if inline_data is None:
            continue
        image_data: Any = getattr(inline_data, "data", None)
        mime_type: str = str(getattr(inline_data, "mime_type", "image/png"))
        if image_data is None:
            continue
        if isinstance(image_data, bytes):
            encoded_image: str = base64.b64encode(image_data).decode("ascii")
        else:
            encoded_image = str(image_data)
        if encoded_image:
            return f"data:{mime_type};base64,{encoded_image}"
    return None


def _image_size_for_layout(layout: LayoutTree) -> str:
    if layout.canvasWidth <= 0 or layout.canvasHeight <= 0:
        raise ValueError("Layout canvas dimensions must be positive.")
    aspect_ratio: float = layout.canvasWidth / layout.canvasHeight
    if aspect_ratio > 1.1:
        return "1536x1024"
    if aspect_ratio < 0.9:
        return "1024x1536"
    return "1024x1024"


def _style_for_box(
    box: LayoutBox,
    style_tokens: dict[str, Any],
    primary_color: str,
    secondary_color: str,
    palette_colors: list[str],
) -> StyleDecision:
    text_surface_color: str = _text_surface_color(style_tokens, secondary_color)
    palette_text_color: str = _choose_text_color([text_surface_color], preferred=None)

    if box.role == "headline":
        headline_color: str = _choose_text_color([text_surface_color], preferred=primary_color)
        return StyleDecision(
            elementId=box.id,
            fontColor=headline_color,
            fontSize=max(24.0, box.width / 10.0),
        )

    if box.role == "cta":
        cta_font_color: str = _choose_text_color([primary_color], preferred=LIGHT_TEXT)
        return StyleDecision(
            elementId=box.id,
            backgroundColor=primary_color,
            fontColor=cta_font_color,
            fontSize=max(24.0, box.height * 0.45),
        )

    if box.role in {"body", "subheading"}:
        return StyleDecision(
            elementId=box.id,
            fontColor=palette_text_color,
            fontSize=max(12.0, min(box.width / 18.0, box.height * 0.4)),
        )

    if box.role in {"shape", "background"}:
        return StyleDecision(
            elementId=box.id,
            backgroundColor=secondary_color,
            fontColor=palette_text_color,
        )

    if box.role in {"image", "logo"}:
        return StyleDecision(
            elementId=box.id,
            fontColor=palette_text_color,
        )

    raise ValueError(f"Unsupported layout role '{box.role}'.")


def _choose_text_color(backgrounds: Iterable[str], preferred: Optional[str]) -> str:
    normalized_backgrounds: list[str] = [_normalize_hex(background) for background in backgrounds]
    candidates: list[str] = []
    for candidate in [preferred, LIGHT_TEXT, DARK_TEXT, "#000000"]:
        if candidate is None:
            continue
        normalized_candidate: str = _normalize_hex(candidate)
        if normalized_candidate not in candidates:
            candidates.append(normalized_candidate)

    for candidate in candidates:
        if all(check_contrast(candidate, background) for background in normalized_backgrounds):
            return candidate

    best_candidate: str = LIGHT_TEXT
    best_score: float = -1.0
    for candidate in candidates:
        minimum_ratio: float = min(_contrast_ratio(candidate, background) for background in normalized_backgrounds)
        if minimum_ratio > best_score:
            best_candidate = candidate
            best_score = minimum_ratio
    return best_candidate


def _contrast_ratio(fg: str, bg: str) -> float:
    fg_luminance: float = _relative_luminance(fg)
    bg_luminance: float = _relative_luminance(bg)
    lighter: float = max(fg_luminance, bg_luminance)
    darker: float = min(fg_luminance, bg_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def _relative_luminance(hex_color: str) -> float:
    red, green, blue = _hex_to_rgb(hex_color)
    red_channel: float = _linearize_channel(red / 255.0)
    green_channel: float = _linearize_channel(green / 255.0)
    blue_channel: float = _linearize_channel(blue / 255.0)
    return (0.2126 * red_channel) + (0.7152 * green_channel) + (0.0722 * blue_channel)


def _linearize_channel(value: float) -> float:
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def _extract_palette_base_colors(style_tokens: dict[str, Any]) -> tuple[str, str]:
    palette_candidates: list[str] = _extract_palette_candidates(style_tokens.get("palette"))

    primary_color: str = palette_candidates[0] if palette_candidates else NEUTRAL_DARK
    secondary_color: str = (
        palette_candidates[1] if len(palette_candidates) > 1 else _derive_secondary_color(primary_color)
    )
    return _normalize_hex(primary_color), _normalize_hex(secondary_color)


def _palette_colors(style_tokens: dict[str, Any], primary_color: str, secondary_color: str) -> list[str]:
    palette_candidates: list[str] = _extract_palette_candidates(style_tokens.get("palette"))
    colors: list[str] = [_normalize_hex(primary_color), _normalize_hex(secondary_color)]
    for candidate in palette_candidates:
        normalized_candidate: str = _normalize_hex(candidate)
        if normalized_candidate not in colors:
            colors.append(normalized_candidate)
    return colors


def _extract_palette_candidates(value: Any) -> list[str]:
    colors: list[str] = []
    if isinstance(value, str):
        colors.extend(_hex_matches(value))
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            colors.extend(_extract_palette_candidates(item))
    elif isinstance(value, dict):
        for item in value.values():
            colors.extend(_extract_palette_candidates(item))
    return [_normalize_hex(color) for color in colors]


def _first_valid_color(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and HEX_COLOR_PATTERN.fullmatch(value.strip()):
            return _normalize_hex(value)
    return None


def _hex_matches(value: str) -> list[str]:
    return re.findall(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value)


def _derive_secondary_color(primary_color: str) -> str:
    red, green, blue = _hex_to_rgb(primary_color)
    primary_luminance: float = _relative_luminance(primary_color)
    if primary_luminance < 0.35:
        mixed: tuple[int, int, int] = _mix_rgb((red, green, blue), _hex_to_rgb(NEUTRAL_LIGHT), 0.45)
    else:
        mixed = _mix_rgb((red, green, blue), _hex_to_rgb(NEUTRAL_DARK), 0.35)
    return _rgb_to_hex(mixed)


def _text_surface_color(style_tokens: dict[str, Any], secondary_color: str) -> str:
    explicit_background: Optional[str] = _first_valid_color(
        style_tokens.get("backgroundColor"),
        style_tokens.get("canvasBackground"),
    )
    return explicit_background or secondary_color


def _mix_rgb(first: tuple[int, int, int], second: tuple[int, int, int], weight: float) -> tuple[int, int, int]:
    clamped_weight: float = max(0.0, min(1.0, weight))
    return (
        round((first[0] * (1.0 - clamped_weight)) + (second[0] * clamped_weight)),
        round((first[1] * (1.0 - clamped_weight)) + (second[1] * clamped_weight)),
        round((first[2] * (1.0 - clamped_weight)) + (second[2] * clamped_weight)),
    )


def _gradient_background_data_uri(layout: LayoutTree, palette_colors: list[str]) -> str:
    start_color: str = palette_colors[0]
    end_color: str = palette_colors[1] if len(palette_colors) > 1 else _derive_secondary_color(start_color)
    svg_markup: str = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(layout.canvasWidth)}" '
        f'height="{int(layout.canvasHeight)}" viewBox="0 0 {int(layout.canvasWidth)} {int(layout.canvasHeight)}">'
        '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">'
        f'<stop offset="0%" stop-color="{start_color}"/>'
        f'<stop offset="100%" stop-color="{end_color}"/>'
        "</linearGradient></defs>"
        '<rect width="100%" height="100%" fill="url(#bg)"/>'
        "</svg>"
    )
    return f"data:image/svg+xml;utf8,{quote(svg_markup)}"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    normalized: str = _normalize_hex(hex_color)
    return (
        int(normalized[1:3], 16),
        int(normalized[3:5], 16),
        int(normalized[5:7], 16),
    )


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def _normalize_hex(value: str) -> str:
    candidate: str = value.strip()
    if not HEX_COLOR_PATTERN.fullmatch(candidate):
        raise ValueError(f"Invalid hex color '{value}'.")
    stripped: str = candidate.lstrip("#")
    if len(stripped) == 3:
        stripped = "".join(character * 2 for character in stripped)
    return f"#{stripped.upper()}"
