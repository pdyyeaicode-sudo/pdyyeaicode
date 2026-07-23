from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Final, Iterable, Optional

from shared.models import (
    DesignOperation,
    DesignRequest,
    DesignSpec,
    ElementSpec,
    LayoutBox,
    LayoutPlannerOutput,
    LayoutRole,
    LayoutTree,
)


logger = logging.getLogger("printrocket.layout")

MM_TO_PX_FACTOR: Final[float] = 96.0 / 25.4
SAFE_ZONE_MM: Final[float] = 5.0
BLEED_MM: Final[float] = 3.0
SINGLE_COLUMN_BREAKPOINT: Final[float] = 400.0
SINGLE_COLUMN_GAP: Final[float] = 12.0
COLLISION_SHIFT: Final[float] = 8.0
MAX_COLLISION_SHIFTS: Final[int] = 10
TEXT_ROLES: Final[set[LayoutRole]] = {"headline", "subheading", "body", "cta"}
Z_INDEX_MAP: Final[dict[LayoutRole, int]] = {
    "background": 0,
    "shape": 1,
    "image": 2,
    "body": 3,
    "subheading": 4,
    "cta": 5,
    "headline": 6,
    "logo": 7,
}
CONTENT_ROLE_ORDER: Final[list[LayoutRole]] = ["logo", "headline", "subheading", "image", "body", "cta"]


def plan(spec: DesignSpec, request: DesignRequest) -> LayoutPlannerOutput:
    canvas_width: float
    canvas_height: float
    canvas_width, canvas_height = _canvas_dimensions_in_px(request)

    safe_inset: float = _snap(_mm_to_px(SAFE_ZONE_MM))
    bleed: float = _snap(_mm_to_px(BLEED_MM))
    safe_left: float = safe_inset + bleed
    safe_top: float = safe_inset + bleed
    safe_right: float = canvas_width - safe_inset - bleed
    safe_bottom: float = canvas_height - safe_inset - bleed

    content_boxes: list[LayoutBox]
    if canvas_width < SINGLE_COLUMN_BREAKPOINT:
        content_boxes = _single_column_boxes(spec, request, canvas_width, canvas_height, safe_left, safe_top, safe_right)
    else:
        content_boxes = _standard_layout_boxes(spec, request, canvas_width, canvas_height, safe_left, safe_top, safe_right, safe_bottom)

    _resolve_text_collisions(content_boxes)

    boxes: list[LayoutBox] = [
        LayoutBox(
            id="background-auto",
            role="background",
            x=0.0,
            y=0.0,
            width=_snap(canvas_width),
            height=_snap(canvas_height),
            zIndex=Z_INDEX_MAP["background"],
        ),
        LayoutBox(
            id="shape-auto",
            role="shape",
            x=0.0,
            y=0.0,
            width=_snap(canvas_width),
            height=_snap(canvas_height * 0.10),
            zIndex=Z_INDEX_MAP["shape"],
        ),
    ]
    boxes.extend(sorted(content_boxes, key=lambda box: (box.zIndex, box.id)))

    layout_tree: LayoutTree = LayoutTree(
        canvasWidth=_snap(canvas_width),
        canvasHeight=_snap(canvas_height),
        boxes=boxes,
    )
    operations: list[DesignOperation] = [_operation_for_box(box) for box in boxes]
    _write_operations_log(spec.requestId, operations)
    return LayoutPlannerOutput(layoutTree=layout_tree, operations=operations)


def _canvas_dimensions_in_px(request: DesignRequest) -> tuple[float, float]:
    width: float = float(request.targetSize.width)
    height: float = float(request.targetSize.height)
    if request.targetSize.unit == "mm":
        return _snap(_mm_to_px(width)), _snap(_mm_to_px(height))
    return _snap(width), _snap(height)


def _mm_to_px(value_mm: float) -> float:
    return value_mm * MM_TO_PX_FACTOR


def _single_column_boxes(
    spec: DesignSpec,
    request: DesignRequest,
    canvas_width: float,
    canvas_height: float,
    safe_left: float,
    safe_top: float,
    safe_right: float,
) -> list[LayoutBox]:
    content_width: float = _snap(safe_right - safe_left)
    current_y: float = _snap(safe_top)
    boxes: list[LayoutBox] = []

    for element in _ordered_elements(spec):
        height: float = _single_column_height(element.role, canvas_height)
        box: LayoutBox = LayoutBox(
            id=f"{element.role}-{len(boxes) + 1}",
            role=element.role,
            x=_snap(safe_left),
            y=current_y,
            width=content_width,
            height=height,
            zIndex=Z_INDEX_MAP[element.role],
            content=element.text,
            imageUrl=_image_url_for_role(element.role, request),
        )
        boxes.append(box)
        current_y = _snap(current_y + height + SINGLE_COLUMN_GAP)

    return boxes


def _single_column_height(role: LayoutRole, canvas_height: float) -> float:
    if role == "logo":
        return 48.0
    if role == "headline":
        return max(60.0, _snap(canvas_height * 0.12))
    if role == "subheading":
        return max(40.0, _snap(canvas_height * 0.08))
    if role == "image":
        return max(140.0, _snap(canvas_height * 0.28))
    if role == "body":
        return max(72.0, _snap(canvas_height * 0.12))
    if role == "cta":
        return max(40.0, _snap(canvas_height * 0.07))
    return 48.0


def _standard_layout_boxes(
    spec: DesignSpec,
    request: DesignRequest,
    canvas_width: float,
    canvas_height: float,
    safe_left: float,
    safe_top: float,
    safe_right: float,
    safe_bottom: float,
) -> list[LayoutBox]:
    boxes: list[LayoutBox] = []
    headline_box: Optional[LayoutBox] = None
    subheading_box: Optional[LayoutBox] = None
    image_box: Optional[LayoutBox] = None

    for element in _ordered_elements(spec):
        if element.role == "logo":
            logo_width: float = _snap(min(canvas_width * 0.20, 120.0))
            logo_height: float = _snap(max(logo_width * 0.4, 40.0))
            boxes.append(
                LayoutBox(
                    id=f"{element.role}-{len(boxes) + 1}",
                    role="logo",
                    x=_snap(safe_left),
                    y=_snap(safe_top),
                    width=logo_width,
                    height=logo_height,
                    zIndex=Z_INDEX_MAP["logo"],
                    imageUrl=_image_url_for_role("logo", request),
                )
            )
            continue

        if element.role == "headline":
            headline_width: float = _snap(canvas_width * 0.80)
            headline_height: float = max(60.0, _estimated_text_height(element.text, headline_width, 30.0))
            headline_box = LayoutBox(
                id=f"{element.role}-{len(boxes) + 1}",
                role="headline",
                x=_snap((canvas_width - headline_width) / 2.0),
                y=_snap(safe_top + 20.0),
                width=headline_width,
                height=_snap(headline_height),
                zIndex=Z_INDEX_MAP["headline"],
                content=element.text,
            )
            boxes.append(headline_box)
            continue

        if element.role == "subheading":
            subheading_width: float = _snap(canvas_width * 0.70)
            subheading_height: float = max(40.0, _estimated_text_height(element.text, subheading_width, 20.0))
            headline_bottom: float = headline_box.y + headline_box.height if headline_box is not None else safe_top + 90.0
            subheading_box = LayoutBox(
                id=f"{element.role}-{len(boxes) + 1}",
                role="subheading",
                x=_snap((canvas_width - subheading_width) / 2.0),
                y=_snap(headline_bottom + 16.0),
                width=subheading_width,
                height=_snap(subheading_height),
                zIndex=Z_INDEX_MAP["subheading"],
                content=element.text,
            )
            boxes.append(subheading_box)
            continue

        if element.role == "image":
            image_width: float = _snap(canvas_width * 0.60)
            image_height: float = _snap(canvas_height * 0.40)
            image_x: float = _snap((canvas_width - image_width) / 2.0)
            image_y: float = _snap((canvas_height - image_height) / 2.0)
            anchor_bottom: float = safe_top
            if subheading_box is not None:
                anchor_bottom = max(anchor_bottom, subheading_box.y + subheading_box.height)
            elif headline_box is not None:
                anchor_bottom = max(anchor_bottom, headline_box.y + headline_box.height)
            image_y = _snap(max(image_y, anchor_bottom + 24.0))
            image_box = LayoutBox(
                id=f"{element.role}-{len(boxes) + 1}",
                role="image",
                x=image_x,
                y=image_y,
                width=image_width,
                height=image_height,
                zIndex=Z_INDEX_MAP["image"],
                imageUrl=_image_url_for_role("image", request),
            )
            boxes.append(image_box)
            continue

        if element.role == "body":
            body_width: float = _snap(canvas_width * 0.65)
            body_height: float = max(72.0, _estimated_text_height(element.text, body_width, 16.0))
            body_y: float
            if image_box is not None:
                body_y = _snap(image_box.y + image_box.height + 20.0)
            elif subheading_box is not None:
                body_y = _snap(subheading_box.y + subheading_box.height + 20.0)
            elif headline_box is not None:
                body_y = _snap(headline_box.y + headline_box.height + 24.0)
            else:
                body_y = _snap(safe_top + 120.0)
            boxes.append(
                LayoutBox(
                    id=f"{element.role}-{len(boxes) + 1}",
                    role="body",
                    x=_snap(safe_left),
                    y=body_y,
                    width=body_width,
                    height=_snap(body_height),
                    zIndex=Z_INDEX_MAP["body"],
                    content=element.text,
                )
            )
            continue

        if element.role == "cta":
            cta_width: float = _snap(max(120.0, min(canvas_width * 0.22, safe_right - safe_left)))
            cta_height: float = _snap(max(40.0, canvas_height * 0.06))
            cta_x: float = _snap((canvas_width - cta_width) / 2.0)
            cta_y: float = _snap(safe_bottom - cta_height)
            boxes.append(
                LayoutBox(
                    id=f"{element.role}-{len(boxes) + 1}",
                    role="cta",
                    x=cta_x,
                    y=cta_y,
                    width=cta_width,
                    height=cta_height,
                    zIndex=Z_INDEX_MAP["cta"],
                    content=element.text,
                )
            )

    return boxes


def _ordered_elements(spec: DesignSpec) -> list[ElementSpec]:
    ordered: list[ElementSpec] = []
    for role in CONTENT_ROLE_ORDER:
        ordered.extend(element for element in spec.requiredElements if element.role == role)
    ordered.extend(element for element in spec.requiredElements if element.role not in CONTENT_ROLE_ORDER)
    return ordered


def _estimated_text_height(content: Optional[str], width: float, font_size: float) -> float:
    text: str = (content or "").strip()
    if not text:
        return _snap(font_size * 1.6)
    approximate_char_width: float = max(font_size * 0.55, 1.0)
    max_chars_per_line: int = max(1, int(width / approximate_char_width))
    line_count: int = 1
    current_line_length: int = 0
    for word in text.split():
        proposed_length: int = len(word) if current_line_length == 0 else current_line_length + 1 + len(word)
        if proposed_length > max_chars_per_line:
            line_count += 1
            current_line_length = len(word)
        else:
            current_line_length = proposed_length
    line_height: float = font_size * 1.3
    return _snap(max(line_height * line_count, font_size * 2.0))


def _image_url_for_role(role: LayoutRole, request: DesignRequest) -> Optional[str]:
    if role == "logo":
        brandkit = request.brandKit
        if brandkit is None:
            return None
        return brandkit.logoUrl
    return None


def _resolve_text_collisions(boxes: list[LayoutBox]) -> None:
    text_boxes: list[LayoutBox] = [box for box in boxes if box.role in TEXT_ROLES]
    for index, first_box in enumerate(text_boxes):
        for second_box in text_boxes[index + 1 :]:
            _resolve_pair_collision(first_box, second_box)


def _resolve_pair_collision(first_box: LayoutBox, second_box: LayoutBox) -> None:
    if not _boxes_overlap(first_box, second_box):
        return

    lower_box: LayoutBox = first_box if first_box.zIndex < second_box.zIndex else second_box
    higher_box: LayoutBox = second_box if lower_box is first_box else first_box

    for _ in range(MAX_COLLISION_SHIFTS):
        if not _boxes_overlap(lower_box, higher_box):
            return
        lower_box.y = _snap(lower_box.y + COLLISION_SHIFT)

    if _boxes_overlap(lower_box, higher_box):
        raise ValueError(f"Text boxes overlap after collision resolution: {first_box.id}, {second_box.id}")


def _boxes_overlap(first_box: LayoutBox, second_box: LayoutBox) -> bool:
    first_right: float = first_box.x + first_box.width
    second_right: float = second_box.x + second_box.width
    first_bottom: float = first_box.y + first_box.height
    second_bottom: float = second_box.y + second_box.height
    horizontal_overlap: bool = first_box.x < second_right and first_right > second_box.x
    vertical_overlap: bool = first_box.y < second_bottom and first_bottom > second_box.y
    return horizontal_overlap and vertical_overlap


def _operation_for_box(box: LayoutBox) -> DesignOperation:
    operation_name: str
    if box.role in {"background", "shape"}:
        operation_name = "AddShape"
    elif box.role in {"headline", "subheading", "body", "cta"}:
        operation_name = "PlaceText"
    elif box.role == "image":
        operation_name = "PlaceImage"
    elif box.role == "logo":
        operation_name = "PlaceLogo"
    else:
        operation_name = "AddFrame"

    return DesignOperation(
        op=operation_name,
        params={
            "id": box.id,
            "role": box.role,
            "x": box.x,
            "y": box.y,
            "width": box.width,
            "height": box.height,
            "zIndex": box.zIndex,
            "content": box.content,
            "imageUrl": box.imageUrl,
        },
    )


def _write_operations_log(request_id: str, operations: Iterable[DesignOperation]) -> None:
    log_directory: Path = Path(__file__).resolve().parents[2] / "logs" / "layout_ops"
    log_path: Path = log_directory / f"{request_id}.json"

    try:
        log_directory.mkdir(parents=True, exist_ok=True)
        payload: list[dict[str, object]] = [operation.dict() for operation in operations]
        with log_path.open("w", encoding="utf-8") as log_file:
            json.dump(payload, log_file, ensure_ascii=False, indent=2)
    except OSError as exc:
        logger.exception("Failed to write layout operations log for request %s", request_id)
        logger.warning(
            {
                "requestId": request_id,
                "stage": "layout-ops-log",
                "status": "fallback",
                "error": str(exc),
            }
        )


def _snap(value: float) -> float:
    return round(value * 2.0) / 2.0
