from __future__ import annotations

import base64
import io
import logging
import os
from functools import lru_cache
from html import escape
from typing import Any, Final, Optional
from uuid import uuid4

from PIL import Image as PILImage

from shared.models import DesignOutput, PrintMeta, SVGLayer


FONT_DEFS: Final[str] = (
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
    "</defs>"
)
LAYER_SEQUENCE: Final[list[tuple[str, bool, str]]] = [
    ("background", False, "background"),
    ("shapes", True, "shape"),
    ("image-slots", True, "image"),
    ("body", True, "body"),
    ("cta", True, "cta"),
    ("headline", True, "headline"),
    ("logo", False, "logo"),
    ("print-marks", False, "shape"),
]
MIN_REGION_AREA_RATIO: Final[float] = 0.02
MAX_COLOR_CLUSTERS: Final[int] = 6
OCR_CONFIDENCE_THRESHOLD: Final[float] = 0.3
PROCESSING_MAX_DIMENSION: Final[int] = 800
TEXT_MASK_PADDING_PX: Final[int] = 3
SAM_MIN_AREA_PIXELS: Final[int] = 500
SAM_MAX_DECORATION_MASKS: Final[int] = 7
FASTSAM_MAX_MASKS: Final[int] = 7
FASTSAM_MODEL_PATH: Final[str] = os.getenv("FASTSAM_MODEL_PATH", "FastSAM-s.pt")
FASTSAM_DEVICE: Final[str] = os.getenv("FASTSAM_DEVICE", "cpu")


logger = logging.getLogger("printrocket.svg.image_to_layers")


def analyze_image_with_gemini(
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict[str, Any]:
    import json
    import os

    import httpx

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"type": "unknown", "has_people": False}

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    prompt = """Analyze this image and return JSON only.
No explanation. Exactly this shape:
{
  "type": "flat_illustration" | "corporate_photo" |
          "product_photo" | "realistic_photo" | "mixed",
  "has_people": true | false,
  "has_faces": true | false,
  "has_text": true | false,
  "detected_text": ["list", "of", "text", "found"],
  "background_type": "solid" | "gradient" |
                     "complex" | "transparent",
  "main_elements": ["element1", "element2"],
  "dominant_colors": ["#hex1", "#hex2", "#hex3"],
  "recommended_processing": "vectorize" |
                            "segment" |
                            "remove_background"
}"""

    try:
        response = httpx.post(
            "https://generativelanguage.googleapis.com/"
            f"v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
            json={
                "contents": [
                    {
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": mime_type,
                                    "data": image_b64,
                                }
                            },
                            {"text": prompt},
                        ]
                    }
                ]
            },
            timeout=30.0,
        )
        response.raise_for_status()
        raw_response = response.json()
        text = raw_response["candidates"][0]["content"]["parts"][0]["text"]
        text = text.replace("```json", "").replace("```", "").strip()
        return json.loads(text)
    except Exception as exc:
        logger.error("Gemini analysis failed: %s", exc)
        return {
            "type": "flat_illustration",
            "has_people": False,
            "has_faces": False,
            "has_text": False,
            "detected_text": [],
            "background_type": "complex",
            "main_elements": [],
            "dominant_colors": [],
            "recommended_processing": "vectorize",
        }


def image_to_svg_layers(image_bytes: bytes, mime_type: str) -> DesignOutput:
    img = PILImage.open(io.BytesIO(image_bytes))
    width, height = img.size
    request_id: str = str(uuid4())
    background_image_url: str = _image_data_uri(image_bytes, mime_type)
    return _build_upload_design_output(
        request_id=request_id,
        width=width,
        height=height,
        background_image_url=background_image_url,
        background_inner_markup=(
            f'<image href="{escape(background_image_url, quote=True)}" x="0" y="0" '
            'width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/>'
        ),
        shapes_inner_markup="",
        image_slots_inner_markup="",
        data_mode="overlay-edit",
    )


def smart_image_to_layers(image_bytes: bytes, mime_type: str = "image/png") -> DesignOutput:
    """Extract editable upload layers with Dreamer's FastSAM pipeline.

    A failed segmentation must be reported to the caller. Returning one flattened
    image here makes a failed extraction look successful and prevents the editor
    from telling the user what actually needs attention.
    """
    return _extract_upload_layers(image_bytes, mime_type)


@lru_cache(maxsize=1)
def _get_easyocr_reader() -> Any:
    import easyocr

    logger.info("Loading EasyOCR reader on CPU")
    return easyocr.Reader(["en"], gpu=False, verbose=False)


def _extract_upload_layers(image_bytes: bytes, mime_type: str) -> DesignOutput:
    import cv2
    import numpy as np
    from rembg import remove

    image_rgba = PILImage.open(io.BytesIO(image_bytes)).convert("RGBA")
    image_rgba.load()
    processed_rgba = _resize_for_processing(image_rgba)
    width, height = processed_rgba.size
    request_id: str = str(uuid4())

    rgba_array = np.array(processed_rgba.convert("RGBA"))
    original_rgba_array = rgba_array.copy()
    img_rgb = cv2.cvtColor(rgba_array, cv2.COLOR_RGBA2RGB)
    master_erase_mask = np.zeros((height, width), dtype=np.uint8)

    headline_layers, body_layers, master_erase_mask = _extract_text_layers(
        image_rgba=processed_rgba,
        master_erase_mask=master_erase_mask,
        np_module=np,
    )

    subject_layer_markup, binary_diya_mask = _extract_subject_layer(
        original_image_rgba=processed_rgba,
        remove_fn=remove,
        cv2_module=cv2,
        np_module=np,
    )
    master_erase_mask = cv2.bitwise_or(master_erase_mask, binary_diya_mask)
    master_erase_mask = cv2.dilate(master_erase_mask, np.ones((3, 3), np.uint8), iterations=1)
    clean_bg_rgb = cv2.inpaint(img_rgb, master_erase_mask, 3, cv2.INPAINT_TELEA)
    clean_bg_rgba = PILImage.fromarray(cv2.cvtColor(clean_bg_rgb, cv2.COLOR_RGB2RGBA), mode="RGBA")
    background_inner_markup, background_image_url, shapes_inner_markup = _extract_fastsam_background_layers(
        inpainted_background_rgba=clean_bg_rgba,
        original_image_rgba=original_rgba_array,
        exclusion_mask=master_erase_mask,
        np_module=np,
    )

    return _build_upload_design_output(
        request_id=request_id,
        width=width,
        height=height,
        background_image_url=background_image_url,
        background_inner_markup=background_inner_markup,
        shapes_inner_markup=shapes_inner_markup,
        image_slots_inner_markup=subject_layer_markup,
        headline_inner_markup="\n".join(headline_layers),
        body_inner_markup="\n".join(body_layers),
        data_mode="layered-extract",
    )


def _resize_for_processing(image_rgba: PILImage.Image) -> PILImage.Image:
    width, height = image_rgba.size
    max_dimension = max(width, height)
    if max_dimension <= PROCESSING_MAX_DIMENSION:
        return image_rgba

    scale = PROCESSING_MAX_DIMENSION / float(max_dimension)
    resized_width = max(1, int(round(width * scale)))
    resized_height = max(1, int(round(height * scale)))
    logger.info(
        "Downscaling upload for extraction from %sx%s to %sx%s.",
        width,
        height,
        resized_width,
        resized_height,
    )
    return image_rgba.resize((resized_width, resized_height), PILImage.Resampling.LANCZOS)


def _extract_text_layers(
    image_rgba: PILImage.Image,
    master_erase_mask: Any,
    np_module: Any,
) -> tuple[list[str], list[str], Any]:
    reader = _get_easyocr_reader()
    rgb_array = np_module.array(image_rgba.convert("RGB"))
    raw_results = reader.readtext(rgb_array)
    headline_layers: list[str] = []
    body_layers: list[str] = []

    for index, result in enumerate(raw_results):
        try:
            bbox, text, confidence = result
        except ValueError:
            logger.warning("Skipping malformed OCR result: %s", result)
            continue

        if not isinstance(text, str) or not text.strip() or float(confidence) < OCR_CONFIDENCE_THRESHOLD:
            continue

        x1 = max(0, min(image_rgba.width, int(min(point[0] for point in bbox))))
        y1 = max(0, min(image_rgba.height, int(min(point[1] for point in bbox))))
        x2 = max(0, min(image_rgba.width, int(max(point[0] for point in bbox))))
        y2 = max(0, min(image_rgba.height, int(max(point[1] for point in bbox))))
        if x2 <= x1 or y2 <= y1:
            continue

        padded_x1 = max(0, x1 - TEXT_MASK_PADDING_PX)
        padded_y1 = max(0, y1 - TEXT_MASK_PADDING_PX)
        padded_x2 = min(image_rgba.width, x2 + TEXT_MASK_PADDING_PX)
        padded_y2 = min(image_rgba.height, y2 + TEXT_MASK_PADDING_PX)
        master_erase_mask[padded_y1:padded_y2, padded_x1:padded_x2] = 255
        crop_rgb = rgb_array[y1:y2, x1:x2]
        dominant_color = _estimate_dominant_hex(crop_rgb, np_module)
        text_content = text.strip()
        box_height = max(12, y2 - y1)
        font_size = _format_number(_snap(float(box_height)))
        role = _classify_text_role({"font_size": box_height}, image_rgba.height)
        text_markup = (
            f'<text data-field="extracted-text" data-element-id="ocr-text-{index}" data-editable="true" '
            f'x="{_format_number(_snap(float(x1)))}" y="{_format_number(_snap(float(y1)))}" '
            f'fill="{dominant_color}" font-size="{font_size}" opacity="1" font-family="sans-serif" '
            'class="printrocket-text" dominant-baseline="text-before-edge">'
            f"{escape(text_content)}</text>"
        )
        if role == "headline":
            headline_layers.append(text_markup)
        else:
            body_layers.append(text_markup)

    return headline_layers, body_layers, master_erase_mask.astype(np_module.uint8)


def _extract_subject_layer(
    original_image_rgba: PILImage.Image,
    remove_fn: Any,
    cv2_module: Any,
    np_module: Any,
) -> tuple[str, Any]:
    original_image_bytes = _image_to_png_bytes(original_image_rgba)
    subject_bytes = remove_fn(original_image_bytes)
    subject_image = PILImage.open(io.BytesIO(subject_bytes)).convert("RGBA")
    subject_image.load()
    if subject_image.size != original_image_rgba.size:
        subject_image = subject_image.resize(original_image_rgba.size, PILImage.Resampling.LANCZOS)

    subject_array = np_module.array(subject_image)
    diya_alpha = subject_array[:, :, 3].astype(np_module.uint8)
    _threshold, binary_diya_mask = cv2_module.threshold(diya_alpha, 10, 255, cv2_module.THRESH_BINARY)
    if int(binary_diya_mask.sum()) == 0:
        raise ValueError("rembg did not isolate a subject.")

    original_rgba_array = np_module.array(original_image_rgba)
    left, top, width, height = cv2_module.boundingRect(binary_diya_mask)
    right = left + width
    bottom = top + height
    crop_rgba = original_rgba_array[top:bottom, left:right].copy()
    mask_crop = binary_diya_mask[top:bottom, left:right]
    crop_rgba[:, :, 3] = mask_crop
    subject_image_url = _png_data_uri(_image_to_png_bytes(PILImage.fromarray(crop_rgba, mode="RGBA")))
    subject_markup = (
        f'<image href="{escape(subject_image_url, quote=True)}" '
        f'x="{_format_number(_snap(float(left)))}" y="{_format_number(_snap(float(top)))}" '
        f'width="{_format_number(_snap(float(width)))}" height="{_format_number(_snap(float(height)))}" '
        'data-element-id="subject-main" preserveAspectRatio="xMidYMid meet"/>'
    )
    return subject_markup, binary_diya_mask


@lru_cache(maxsize=1)
def _get_fastsam_model() -> Any:
    from ultralytics import FastSAM

    logger.info("Loading Dreamer FastSAM model from %s on %s.", FASTSAM_MODEL_PATH, FASTSAM_DEVICE)
    return FastSAM(FASTSAM_MODEL_PATH)


def _extract_fastsam_background_layers(
    inpainted_background_rgba: PILImage.Image,
    original_image_rgba: Any,
    exclusion_mask: Any,
    np_module: Any,
) -> tuple[str, str, str]:
    model = _get_fastsam_model()
    results = model.predict(
        inpainted_background_rgba,
        device=FASTSAM_DEVICE,
        retina_masks=True,
        verbose=False,
    )
    try:
        mask_entries = _normalize_fastsam_masks(results, np_module)
    except ValueError:
        # A valid image can have no meaningful decorative region (for example a
        # plain product shot). Keep the real foreground/OCR layers produced by
        # Dreamer and use the inpainted canvas as its background; never replace
        # the whole result with the original flattened upload.
        logger.info("FastSAM found no decorative masks; retaining the extracted foreground and text layers.")
        width, height = inpainted_background_rgba.size
        background_image_url = _png_data_uri(_image_to_png_bytes(inpainted_background_rgba))
        background_inner_markup = (
            f'<image href="{escape(background_image_url, quote=True)}" x="0" y="0" '
            f'width="{_format_number(_snap(float(width)))}" height="{_format_number(_snap(float(height)))}" '
            'preserveAspectRatio="xMidYMid slice"/>'
        )
        return background_inner_markup, background_image_url, ""

    sorted_entries = sorted(mask_entries, key=lambda entry: entry["area"], reverse=True)
    background_entry = sorted_entries[0]
    background_image_url = _build_masked_image_data_uri(
        image_rgba=inpainted_background_rgba,
        mask=background_entry["mask"],
        np_module=np_module,
    )
    width, height = inpainted_background_rgba.size
    background_inner_markup = (
        f'<image href="{escape(background_image_url, quote=True)}" x="0" y="0" '
        f'width="{_format_number(_snap(float(width)))}" height="{_format_number(_snap(float(height)))}" '
        'preserveAspectRatio="xMidYMid slice"/>'
    )

    selected_shape_masks: list[dict[str, Any]] = []
    exclusion_mask_bool = exclusion_mask > 0
    for entry in sorted_entries[1:]:
        if entry["area"] < SAM_MIN_AREA_PIXELS:
            continue
        overlap = int(np_module.logical_and(entry["mask"], exclusion_mask_bool).sum())
        if overlap > int(entry["area"] * 0.2):
            continue
        if any(_mask_iou(entry["mask"], selected["mask"], np_module) > 0.9 for selected in selected_shape_masks):
            continue
        selected_shape_masks.append(entry)
        if len(selected_shape_masks) >= SAM_MAX_DECORATION_MASKS:
            break

    shape_markup_parts: list[str] = []
    for shape_index, entry in enumerate(selected_shape_masks):
        layer_markup = _build_masked_object_markup(PILImage.fromarray(original_image_rgba, mode="RGBA"), entry["mask"], shape_index, np_module)
        if layer_markup:
            shape_markup_parts.append(layer_markup)

    return background_inner_markup, background_image_url, "\n".join(shape_markup_parts)


def _normalize_sam_pipeline_output(raw_output: Any, np_module: Any) -> list[dict[str, Any]]:
    if isinstance(raw_output, dict) and "masks" in raw_output:
        raw_masks = raw_output["masks"]
        if not isinstance(raw_masks, list):
            raw_masks = list(raw_masks)
        return [
            {
                "index": index,
                "mask": _mask_to_bool_array(raw_mask, np_module),
                "area": int(_mask_to_bool_array(raw_mask, np_module).sum()),
            }
            for index, raw_mask in enumerate(raw_masks)
            if int(_mask_to_bool_array(raw_mask, np_module).sum()) > 0
        ]

    if isinstance(raw_output, list):
        normalized: list[dict[str, Any]] = []
        for index, item in enumerate(raw_output):
            raw_mask = item.get("mask") if isinstance(item, dict) and "mask" in item else item
            mask = _mask_to_bool_array(raw_mask, np_module)
            area = int(item.get("area", int(mask.sum()))) if isinstance(item, dict) else int(mask.sum())
            if area <= 0:
                continue
            normalized.append({"index": index, "mask": mask, "area": area})
        return normalized

    raise ValueError("Unexpected SAM pipeline output.")


def _build_masked_image_data_uri(image_rgba: PILImage.Image, mask: Any, np_module: Any) -> str:
    rgba_array = np_module.array(image_rgba)
    isolated = np_module.zeros_like(rgba_array)
    isolated[mask] = rgba_array[mask]
    isolated[:, :, 3] = np_module.where(mask, rgba_array[:, :, 3], 0)
    return _png_data_uri(_image_to_png_bytes(PILImage.fromarray(isolated, mode="RGBA")))


def _build_background_cluster_markup(
    clean_base_bg_rgb: Any,
    cluster_mask: Any,
    np_module: Any,
) -> tuple[str, str]:
    height, width = cluster_mask.shape
    background_rgba = np_module.zeros((height, width, 4), dtype=np_module.uint8)
    active_mask = cluster_mask > 0
    background_rgba[:, :, :3][active_mask] = clean_base_bg_rgb[active_mask]
    background_rgba[:, :, 3][active_mask] = 255
    background_image_url = _png_data_uri(_image_to_png_bytes(PILImage.fromarray(background_rgba, mode="RGBA")))
    background_inner_markup = (
        f'<image href="{escape(background_image_url, quote=True)}" x="0" y="0" '
        f'width="{_format_number(_snap(float(width)))}" height="{_format_number(_snap(float(height)))}" '
        'preserveAspectRatio="xMidYMid slice"/>'
    )
    return background_inner_markup, background_image_url


def _build_cluster_layer_markup(
    clean_base_bg_rgb: Any,
    cluster_mask: Any,
    cluster_id: int,
    np_module: Any,
) -> str:
    coordinates = np_module.argwhere(cluster_mask > 0)
    if coordinates.size == 0:
        return ""

    top = int(coordinates[:, 0].min())
    left = int(coordinates[:, 1].min())
    bottom = int(coordinates[:, 0].max()) + 1
    right = int(coordinates[:, 1].max()) + 1
    if bottom <= top or right <= left:
        return ""

    cropped_rgb = clean_base_bg_rgb[top:bottom, left:right]
    cropped_mask = cluster_mask[top:bottom, left:right] > 0
    isolated_rgba = np_module.zeros((bottom - top, right - left, 4), dtype=np_module.uint8)
    isolated_rgba[:, :, :3][cropped_mask] = cropped_rgb[cropped_mask]
    isolated_rgba[:, :, 3][cropped_mask] = 255
    layer_image_url = _png_data_uri(_image_to_png_bytes(PILImage.fromarray(isolated_rgba, mode="RGBA")))
    return (
        f'<image href="{escape(layer_image_url, quote=True)}" '
        f'x="{_format_number(_snap(float(left)))}" y="{_format_number(_snap(float(top)))}" '
        f'width="{_format_number(_snap(float(right - left)))}" height="{_format_number(_snap(float(bottom - top)))}" '
        f'data-element-id="shape-cluster-{cluster_id}" preserveAspectRatio="xMidYMid meet"/>'
    )


def _estimate_dominant_hex(crop_rgb: Any, np_module: Any) -> str:
    if crop_rgb.size == 0:
        return "#111111"
    pixels = crop_rgb.reshape(-1, 3)
    mean_rgb = pixels.mean(axis=0)
    return "#{:02x}{:02x}{:02x}".format(int(mean_rgb[0]), int(mean_rgb[1]), int(mean_rgb[2]))


def _build_upload_design_output(
    request_id: str,
    width: int,
    height: int,
    background_image_url: str,
    background_inner_markup: str,
    shapes_inner_markup: str,
    image_slots_inner_markup: str,
    data_mode: str,
    headline_inner_markup: str = "",
    body_inner_markup: str = "",
) -> DesignOutput:
    headline_x: float = _snap(width / 2.0)
    headline_y: float = _snap(height * 0.12)
    body_x: float = _snap(width / 2.0)
    body_y: float = _snap(height * 0.5)
    cta_width: float = _snap(max(120.0, width * 0.22))
    cta_height: float = _snap(max(40.0, height * 0.08))
    cta_x: float = _snap((width - cta_width) / 2.0)
    cta_y: float = _snap(height - cta_height - (height * 0.08))
    cta_text_x: float = _snap(cta_x + (cta_width / 2.0))
    cta_text_y: float = _snap(cta_y + (cta_height / 2.0))
    body_markup = body_inner_markup or (
        f'<text data-field="body" data-element-id="body-placeholder" x="{_format_number(body_x)}" '
        f'y="{_format_number(body_y)}" fill="#FFFFFF" font-size="{_format_number(max(14.0, height * 0.04))}" '
        'class="printrocket-text printrocket-text--body" text-anchor="middle" dominant-baseline="middle">'
        "Add Subtext</text>"
    )
    headline_markup = headline_inner_markup or (
        f'<text data-field="headline" data-element-id="headline-placeholder" x="{_format_number(headline_x)}" '
        f'y="{_format_number(headline_y)}" fill="#FFFFFF" font-size="{_format_number(max(24.0, height * 0.075))}" '
        'class="printrocket-text printrocket-text--headline" text-anchor="middle" dominant-baseline="middle">'
        "Add Headline</text>"
    )

    group_markup: dict[str, str] = {
        "background": (
            '<g data-role="background" data-editable="false" data-layer-id="background">\n'
            f"{background_inner_markup}\n"
            "</g>"
        ),
        "shapes": (
            '<g data-role="shapes" data-editable="true" data-layer-id="shapes">\n'
            f"{shapes_inner_markup}\n"
            "</g>"
        ),
        "image-slots": (
            '<g data-role="image-slots" data-editable="true" data-layer-id="image-slots">\n'
            f"{image_slots_inner_markup}\n"
            "</g>"
        ),
        "body": (
            '<g data-role="body" data-editable="true" data-layer-id="body">\n'
            f"{body_markup}\n"
            "</g>"
        ),
        "cta": (
            '<g data-role="cta" data-editable="true" data-layer-id="cta">\n'
            f'<rect data-field="cta-bg" data-element-id="cta-placeholder" x="{_format_number(cta_x)}" '
            f'y="{_format_number(cta_y)}" width="{_format_number(cta_width)}" '
            f'height="{_format_number(cta_height)}" rx="{_format_number(_snap(min(12.0, cta_height * 0.2)))}" '
            'fill="#FF6B00"/>\n'
            f'<text data-field="cta" data-element-id="cta-placeholder" x="{_format_number(cta_text_x)}" '
            f'y="{_format_number(cta_text_y)}" fill="#FFFFFF" font-size="{_format_number(max(14.0, cta_height * 0.38))}" '
            'class="printrocket-text printrocket-text--cta" text-anchor="middle" dominant-baseline="middle">'
            "Add CTA</text>\n"
            "</g>"
        ),
        "headline": (
            '<g data-role="headline" data-editable="true" data-layer-id="headline">\n'
            f"{headline_markup}\n"
            "</g>"
        ),
        "logo": '<g data-role="logo" data-editable="false" data-layer-id="logo"></g>',
        "print-marks": '<g data-role="print-marks" data-editable="false" data-layer-id="print-marks" visibility="hidden"></g>',
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
    composed_svg: str = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_format_number(_snap(float(width)))}" '
        f'height="{_format_number(_snap(float(height)))}" data-printrocket="true" data-version="1.0" '
        f'data-mode="{escape(data_mode, quote=True)}">\n'
        f"{FONT_DEFS}\n"
        f"{chr(10).join(group_markup[layer_name] for layer_name, _, _ in LAYER_SEQUENCE)}\n"
        "</svg>"
    )

    return DesignOutput(
        requestId=request_id,
        svgLayers=svg_layers,
        composedSVG=composed_svg,
        backgroundImageUrl=background_image_url,
        printMeta=PrintMeta(
            bleed=3.0,
            cmykSafe=True,
            trimMarks=True,
        ),
    )


def _normalize_sam_masks(raw_masks: Any, np_module: Any) -> list[dict[str, Any]]:
    mask_payload = raw_masks.get("masks", raw_masks) if isinstance(raw_masks, dict) else raw_masks
    if not isinstance(mask_payload, list):
        raise ValueError("Unexpected SAM mask payload.")

    normalized_masks: list[dict[str, Any]] = []
    for index, raw_mask in enumerate(mask_payload):
        mask_array = _mask_to_bool_array(raw_mask, np_module)
        area = int(mask_array.sum())
        if area <= 0:
            continue
        normalized_masks.append({"index": index, "mask": mask_array, "area": area})
    return normalized_masks


def _normalize_fastsam_masks(results: Any, np_module: Any) -> list[dict[str, Any]]:
    if not results or results[0].masks is None or getattr(results[0].masks, "data", None) is None:
        raise ValueError("FastSAM did not detect any masks.")

    raw_masks = results[0].masks.data
    if hasattr(raw_masks, "detach"):
        raw_masks = raw_masks.detach().cpu().numpy()
    else:
        raw_masks = np_module.asarray(raw_masks)

    normalized_masks: list[dict[str, Any]] = []
    for index, raw_mask in enumerate(raw_masks):
        mask_array = _mask_to_bool_array(raw_mask, np_module)
        area = int(mask_array.sum())
        if area <= 0:
            continue
        normalized_masks.append({"index": index, "mask": mask_array, "area": area})
    return normalized_masks


def _mask_to_bool_array(raw_mask: Any, np_module: Any) -> Any:
    if hasattr(raw_mask, "detach"):
        raw_mask = raw_mask.detach().cpu().numpy()
    elif hasattr(raw_mask, "numpy"):
        raw_mask = raw_mask.numpy()
    elif isinstance(raw_mask, PILImage.Image):
        raw_mask = np_module.array(raw_mask)

    mask_array = np_module.asarray(raw_mask)
    if mask_array.ndim > 2:
        mask_array = np_module.squeeze(mask_array)
    if mask_array.ndim != 2:
        raise ValueError("SAM mask array must be 2D after squeezing.")
    return mask_array.astype(bool)


def _select_sam_masks(mask_entries: list[dict[str, Any]], image_area: int, np_module: Any) -> list[dict[str, Any]]:
    sorted_masks = sorted(mask_entries, key=lambda entry: entry["area"], reverse=True)
    selected_masks: list[dict[str, Any]] = []
    minimum_area = max(1, int(image_area * SAM_MIN_AREA_RATIO))

    for mask_entry in sorted_masks:
        if mask_entry["area"] < minimum_area and selected_masks:
            continue
        if any(_mask_iou(mask_entry["mask"], selected["mask"], np_module) > 0.9 for selected in selected_masks):
            continue
        selected_masks.append(mask_entry)
        if len(selected_masks) >= FASTSAM_MAX_MASKS:
            break
    return selected_masks


def _mask_iou(mask_a: Any, mask_b: Any, np_module: Any) -> float:
    intersection = int(np_module.logical_and(mask_a, mask_b).sum())
    union = int(np_module.logical_or(mask_a, mask_b).sum())
    if union == 0:
        return 0.0
    return intersection / union


def _build_background_mask_markup(image_rgba: PILImage.Image, mask: Any, width: int, height: int, np_module: Any) -> str:
    rgba_array = np_module.array(image_rgba)
    isolated = np_module.zeros_like(rgba_array)
    isolated[mask] = rgba_array[mask]
    isolated[:, :, 3] = np_module.where(mask, rgba_array[:, :, 3], 0)
    image_uri = _png_data_uri(_image_to_png_bytes(PILImage.fromarray(isolated, mode="RGBA")))
    return (
        f'<image href="{escape(image_uri, quote=True)}" x="0" y="0" '
        f'width="{_format_number(_snap(float(width)))}" height="{_format_number(_snap(float(height)))}" '
        'preserveAspectRatio="xMidYMid slice"/>'
    )


def _build_masked_object_markup(
    image_rgba: PILImage.Image,
    mask: Any,
    index: int,
    np_module: Any,
) -> Optional[str]:
    coordinates = np_module.argwhere(mask)
    if coordinates.size == 0:
        return None

    top = int(coordinates[:, 0].min())
    left = int(coordinates[:, 1].min())
    bottom = int(coordinates[:, 0].max()) + 1
    right = int(coordinates[:, 1].max()) + 1

    rgba_array = np_module.array(image_rgba)
    mask_crop = mask[top:bottom, left:right]
    cropped_rgba = rgba_array[top:bottom, left:right].copy()
    cropped_rgba[:, :, 3] = np_module.where(mask_crop, 255, 0).astype(np_module.uint8)

    image_uri = _png_data_uri(_image_to_png_bytes(PILImage.fromarray(cropped_rgba, mode="RGBA")))
    return (
        f'<image href="{escape(image_uri, quote=True)}" '
        f'x="{_format_number(_snap(float(left)))}" y="{_format_number(_snap(float(top)))}" '
        f'width="{_format_number(_snap(float(right - left)))}" height="{_format_number(_snap(float(bottom - top)))}" '
        f'data-element-id="sam-object-{index}" preserveAspectRatio="xMidYMid meet"/>'
    )


def _image_data_uri(image_bytes: bytes, mime_type: str) -> str:
    encoded_image: str = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded_image}"


def _snap(value: float) -> float:
    return round(value * 2.0) / 2.0


def _format_number(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return f"{value:.1f}"


def _open_image_rgba(image_bytes: bytes) -> PILImage.Image:
    try:
        image = PILImage.open(io.BytesIO(image_bytes)).convert("RGBA")
        image.load()
        return image
    except Exception as exc:
        logger.exception("Unable to open uploaded image for smart layering.")
        raise ValueError("Unable to open uploaded image.") from exc


def _remove_background(image_bytes: bytes, remove_fn: Any) -> PILImage.Image:
    try:
        foreground_bytes: bytes = remove_fn(image_bytes)
        foreground = PILImage.open(io.BytesIO(foreground_bytes)).convert("RGBA")
        foreground.load()
        return foreground
    except Exception as exc:
        logger.exception("Background removal failed during smart layering.")
        raise ValueError("Unable to separate the foreground from the background.") from exc


def _compute_background_mask(foreground_rgba: PILImage.Image, np_module: Any) -> Any:
    foreground_array = np_module.array(foreground_rgba)
    return foreground_array[:, :, 3] < 10


def _detect_text_layers(image_rgba: PILImage.Image, easyocr_module: Any, np_module: Any) -> list[dict[str, Any]]:
    try:
        reader = easyocr_module.Reader(["en", "hi"], gpu=False, verbose=False)
        raw_results = reader.readtext(np_module.array(image_rgba.convert("RGB")))
    except Exception as exc:
        logger.exception("OCR failed during smart layering.")
        raise ValueError("Unable to detect text in the uploaded image.") from exc

    text_layers: list[dict[str, Any]] = []
    width, height = image_rgba.size
    rgb_array = np_module.array(image_rgba.convert("RGB"))
    for index, result in enumerate(raw_results):
        bbox: Any
        text: Any
        confidence: Any
        try:
            bbox, text, confidence = result
        except ValueError:
            logger.warning("Skipping malformed OCR result: %s", result)
            continue
        if not isinstance(text, str) or not text.strip():
            continue
        if float(confidence) < OCR_CONFIDENCE_THRESHOLD:
            continue

        x1 = max(0, min(width, int(min(point[0] for point in bbox))))
        y1 = max(0, min(height, int(min(point[1] for point in bbox))))
        x2 = max(0, min(width, int(max(point[0] for point in bbox))))
        y2 = max(0, min(height, int(max(point[1] for point in bbox))))
        if x2 <= x1 or y2 <= y1:
            continue

        crop = rgb_array[y1:y2, x1:x2]
        fill = _estimate_text_color(crop, np_module)
        box_height = max(1, y2 - y1)
        text_layers.append(
            {
                "index": index,
                "text": text.strip(),
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "center_x": x1 + ((x2 - x1) / 2.0),
                "baseline_y": y2,
                "font_size": max(12, box_height),
                "fill": fill,
            }
        )
    return text_layers


def _build_text_cutout_mask(width: int, height: int, text_regions: list[dict[str, Any]], np_module: Any) -> Any:
    mask = np_module.zeros((height, width), dtype=np_module.uint8)
    for region in text_regions:
        mask[region["y1"]:region["y2"], region["x1"]:region["x2"]] = 1
    return mask.astype(bool)


def _extract_background_layer(
    image_rgba: PILImage.Image,
    background_mask: Any,
    text_cutout_mask: Any,
    np_module: Any,
) -> PILImage.Image:
    rgba = np_module.array(image_rgba)
    layer = np_module.zeros_like(rgba)
    keep_mask = background_mask & ~text_cutout_mask
    layer[keep_mask] = rgba[keep_mask]
    return PILImage.fromarray(layer, mode="RGBA")


def _build_content_mask(background_mask: Any, text_cutout_mask: Any, np_module: Any) -> Any:
    return np_module.logical_not(background_mask) & np_module.logical_not(text_cutout_mask)


def _estimate_text_color(crop: Any, np_module: Any) -> str:
    if crop.size == 0:
        return "#111111"
    mean_rgb = crop.reshape(-1, 3).mean(axis=0)
    return "#{:02x}{:02x}{:02x}".format(int(mean_rgb[0]), int(mean_rgb[1]), int(mean_rgb[2]))


def _classify_text_role(text_region: dict[str, Any], canvas_height: int) -> str:
    if text_region["font_size"] >= max(24, canvas_height * 0.06):
        return "headline"
    return "body"


def _mask_to_png_bytes(mask: Any, np_module: Any) -> bytes:
    rgba_mask = np_module.zeros((mask.shape[0], mask.shape[1], 4), dtype=np_module.uint8)
    rgba_mask[:, :, 0] = 255
    rgba_mask[:, :, 1] = 255
    rgba_mask[:, :, 2] = 255
    rgba_mask[:, :, 3] = mask
    return _image_to_png_bytes(PILImage.fromarray(rgba_mask, mode="RGBA"))


def _image_to_png_bytes(image: PILImage.Image) -> bytes:
    try:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()
    except Exception as exc:
        logger.exception("Failed to encode image layer as PNG.")
        raise ValueError("Unable to encode image layers.") from exc


def _png_data_uri(image_bytes: bytes) -> str:
    return f"data:image/png;base64,{base64.b64encode(image_bytes).decode('ascii')}"


def _strip_outer_defs(markup: str) -> str:
    stripped = markup.strip()
    if stripped.startswith("<defs>") and stripped.endswith("</defs>"):
        return stripped[6:-7]
    return stripped
