from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from typing import Any, Optional

from shared.models import DesignRequest, DesignSpec, ElementSpec


logger = logging.getLogger("printrocket.encoder")

CONTROL_CHARACTER_PATTERN = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")
ALLOWED_ROLES = {"headline", "subheading", "body", "cta", "logo", "image"}
HEX_COLOR_PATTERN = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})")
DISCOUNT_PATTERN = re.compile(r"\b\d+\s*%\s*(?:off|discount)?\b", re.IGNORECASE)
QUOTED_TEXT_PATTERN = re.compile(r"['\"]([^'\"]{3,120})['\"]")
BACKGROUND_STYLE_CONSTRAINTS = (
    "flat vector illustration style, "
    "solid color fills only, "
    "minimal gradients only in background, "
    "hard edges between elements, "
    "no photorealistic textures, "
    "no complex shadows, "
    "simple geometric shapes, "
    "2D flat design, "
    "clean separation between elements, "
    "NO TEXT, NO LETTERS"
)

NAMED_COLOR_MAP: dict[str, str] = {
    "red": "#FF3B30",
    "gold": "#D4AF37",
    "yellow": "#FFD60A",
    "orange": "#FF7A00",
    "blue": "#2563EB",
    "green": "#16A34A",
    "purple": "#7C3AED",
    "pink": "#EC4899",
    "black": "#111111",
    "white": "#F9FAFB",
    "silver": "#C0C0C0",
    "gray": "#6B7280",
    "grey": "#6B7280",
    "brown": "#8B5E3C",
}
FONT_CANDIDATES: tuple[str, ...] = (
    "Arial",
    "Helvetica",
    "Futura",
    "Garamond",
    "Times New Roman",
    "Montserrat",
    "Poppins",
    "Roboto",
)
CTA_PHRASES: tuple[str, ...] = (
    "shop now",
    "buy now",
    "order now",
    "learn more",
    "book now",
    "register now",
    "call now",
    "scan now",
)
IMAGE_HINTS: tuple[str, ...] = (
    "poster",
    "flyer",
    "banner",
    "ad",
    "campaign",
    "electronics",
    "product",
    "photo",
    "image",
    "festival",
    "diwali",
    "fashion",
    "food",
)
NON_CONTENT_WORDS: set[str] = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "be",
    "bold",
    "buy",
    "call",
    "cta",
    "create",
    "design",
    "for",
    "from",
    "graphic",
    "in",
    "into",
    "layout",
    "learn",
    "make",
    "of",
    "now",
    "order",
    "on",
    "poster",
    "register",
    "scan",
    "shop",
    "style",
    "text",
    "the",
    "to",
    "use",
    "with",
}

SYSTEM_PROMPT = (
    "You are a design spec extractor for a print design platform.\n"
    "CRITICAL CONSTRAINT: You must ensure that the requested design has clear boundaries between elements. "
    "Photorealistic elements and gradients are allowed, but they MUST be distinct and easily separable. "
    "Avoid overly complex blended scenes where foreground and background merge. Maintain clean separation for our layering engine.\n"
    "Extract ALL design decisions purely from the user prompt.\n"
    "Do not use any defaults. If user says red and gold, \n"
    "palette is red and gold. If user says dark moody background,\n"
    "tone is dark. Everything comes from the prompt.\n\n"
    "Return JSON only, no markdown, exactly this shape:\n"
    "{\n"
    "  requestId: string,\n"
    "  requiredElements: [\n"
    "    {\n"
    "      role: 'headline'|'subheading'|'body'|'cta'|'logo'|'image',\n"
    "      text?: string,\n"
    "      imageDescription?: string\n"
    "    }\n"
    "  ],\n"
    "  styleTokens: {\n"
    "    mood: string,\n"
    "    tone: string,\n"
    "    palette: [\n"
    "      extracted hex colors from prompt,\n"
    "      if no colors mentioned derive from mood\n"
    "    ],\n"
    "    fontFamily: string,\n"
    "    backgroundDescription: string,\n"
    "    shapes: string\n"
    "  },\n"
    "  conditioningVector: []\n"
    "}"
)


def encode(request: DesignRequest, request_id: Optional[str] = None) -> DesignSpec:
    normalized_prompt: str = _normalize_text(request.prompt)
    user_message: str = _build_user_message(request)
    fallback_reason: Optional[str] = None

    try:
        raw_content: str = _request_design_spec(user_message)
    except Exception as exc:
        logger.error(
            {
                "stage": "encoder-api",
                "status": "error",
                "error": str(exc),
            }
        )
        fallback_reason = str(exc)
    else:
        try:
            response_payload: dict[str, Any] = json.loads(raw_content)
        except json.JSONDecodeError as exc:
            logger.error(
                {
                    "stage": "encoder-parse",
                    "status": "error",
                    "error": str(exc),
                    "response": raw_content,
                }
            )
            fallback_reason = f"JSON parse failed: {exc}"
        else:
            try:
                design_spec: DesignSpec = _coerce_design_spec(response_payload, request, normalized_prompt, request_id)
            except Exception as exc:
                logger.error(
                    {
                        "stage": "encoder-validation",
                        "status": "error",
                        "error": str(exc),
                        "payload": response_payload,
                    }
                )
                fallback_reason = f"Validation failed: {exc}"
            else:
                return design_spec

    logger.warning(
        {
            "requestId": request_id,
            "stage": "encoder-fallback",
            "status": "fallback",
            "error": fallback_reason or "Unknown encoder failure.",
        }
    )
    return _build_fallback_design_spec(request, normalized_prompt, request_id)


def _request_design_spec(user_message: str) -> str:
    api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")

    client: Any = _create_openai_client(api_key)
    completion: Any = client.with_options(timeout=20.0).chat.completions.create(
        model=os.getenv("TEXT_MODEL", "gpt-4o"),
        temperature=0.0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )
    choices: Any = getattr(completion, "choices", None)
    if not choices:
        raise ValueError("OpenAI chat completion returned no choices.")

    message_content: Any = getattr(choices[0].message, "content", None)
    if not isinstance(message_content, str) or not message_content.strip():
        raise ValueError("OpenAI chat completion returned empty message content.")
    return message_content


def _create_openai_client(api_key: str) -> Any:
    from openai import OpenAI

    return OpenAI(
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )


def _build_user_message(
    request: DesignRequest,
) -> str:
    user_message: str = (
        f"Prompt: {request.prompt}\n"
        f"Size: {request.targetSize.width}x{request.targetSize.height}\n"
        f"Session history: {'; '.join(request.sessionHistory[-3:])}"
    )
    return user_message


def _coerce_design_spec(
    payload: dict[str, Any],
    request: DesignRequest,
    normalized_prompt: str,
    request_id: Optional[str],
) -> DesignSpec:
    normalized_request_id: str = _normalize_text(str(request_id or payload.get("requestId") or ""))
    if not normalized_request_id:
        raise ValueError("Encoder requestId is missing.")

    required_elements_payload: Any = payload.get("requiredElements")
    if not isinstance(required_elements_payload, list):
        raise ValueError("requiredElements must be a list.")

    required_elements: list[ElementSpec] = []
    for item in required_elements_payload:
        if not isinstance(item, dict):
            raise ValueError("Each required element must be an object.")
        role: str = _normalize_text(str(item.get("role", ""))).lower()
        if role not in ALLOWED_ROLES:
            raise ValueError(f"Unsupported required element role '{role}'.")
        text_value: Optional[str] = _optional_normalized_text(item.get("text"))
        image_prompt: Optional[str] = _optional_normalized_text(item.get("imageDescription"))
        required_elements.append(
            ElementSpec(
                role=role,
                text=text_value,
                imagePrompt=image_prompt,
                required=True,
            )
        )

    style_tokens_payload: Any = payload.get("styleTokens")
    if not isinstance(style_tokens_payload, dict):
        raise ValueError("styleTokens must be an object.")

    extracted_tone: str = _normalize_text(str(style_tokens_payload.get("tone", "")))
    palette_tokens: list[str] = _extract_palette_tokens(style_tokens_payload.get("palette"))
    use_brandkit: bool = _prompt_explicitly_mentions_brandkit(normalized_prompt, request)
    brandkit: Any = getattr(request, "brandKit", None)
    if not palette_tokens and use_brandkit and brandkit is not None:
        palette_tokens = [
            color
            for color in (
                getattr(brandkit, "primaryColor", ""),
                getattr(brandkit, "secondaryColor", ""),
            )
            if color
        ]

    font_family: str = _normalize_text(str(style_tokens_payload.get("fontFamily", "")))
    if not font_family and use_brandkit and brandkit is not None:
        font_family = _normalize_text(str(getattr(brandkit, "fontFamily", "")))

    style_tokens: dict[str, Any] = {
        "mood": _normalize_text(str(style_tokens_payload.get("mood", ""))),
        "tone": extracted_tone,
        "palette": palette_tokens,
        "fontFamily": font_family,
        "backgroundDescription": _append_background_style_constraints(
            _normalize_text(str(style_tokens_payload.get("backgroundDescription", ""))),
        ),
        "shapes": _normalize_text(str(style_tokens_payload.get("shapes", ""))),
    }

    conditioning_vector_payload: Any = payload.get("conditioningVector", [])
    if not isinstance(conditioning_vector_payload, list):
        raise ValueError("conditioningVector must be a list.")
    conditioning_vector: list[float] = [float(value) for value in conditioning_vector_payload]

    return DesignSpec(
        requestId=normalized_request_id,
        requiredElements=required_elements,
        styleTokens=style_tokens,
        conditioningVector=conditioning_vector,
    )


def _prompt_explicitly_mentions_brandkit(prompt: str, request: DesignRequest) -> bool:
    prompt_lower: str = prompt.lower()
    direct_markers: tuple[str, ...] = (
        "brand",
        "brandkit",
        "brand kit",
        "brand color",
        "brand colors",
        "brand font",
        "logo",
    )
    if any(marker in prompt_lower for marker in direct_markers):
        return True

    brandkit: Any = getattr(request, "brandKit", None)
    if brandkit is None:
        return False

    brand_values: tuple[str, ...] = (
        str(getattr(brandkit, "primaryColor", "")),
        str(getattr(brandkit, "secondaryColor", "")),
        str(getattr(brandkit, "fontFamily", "")),
        str(getattr(brandkit, "tone", "")),
    )
    return any(_normalize_text(value).lower() in prompt_lower for value in brand_values if value)


def _extract_palette_tokens(value: Any) -> list[str]:
    colors: list[str] = []
    if isinstance(value, str):
        colors.extend(re.findall(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value))
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            colors.extend(_extract_palette_tokens(item))
    elif isinstance(value, dict):
        for item in value.values():
            colors.extend(_extract_palette_tokens(item))

    deduplicated_colors: list[str] = []
    for color in colors:
        normalized_color: str = color.upper()
        if normalized_color not in deduplicated_colors:
            deduplicated_colors.append(normalized_color)
    return deduplicated_colors


def _optional_normalized_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized_value: str = _normalize_text(str(value))
    return normalized_value or None


def _normalize_text(value: str) -> str:
    normalized_unicode: str = unicodedata.normalize("NFC", value)
    without_controls: str = CONTROL_CHARACTER_PATTERN.sub("", normalized_unicode)
    return without_controls.strip()


def _build_fallback_design_spec(
    request: DesignRequest,
    normalized_prompt: str,
    request_id: Optional[str],
) -> DesignSpec:
    fallback_request_id: str = _normalize_text(str(request_id or "fallback-design-request"))
    style_tokens: dict[str, Any] = _fallback_style_tokens(normalized_prompt)
    required_elements: list[ElementSpec] = _fallback_required_elements(normalized_prompt, request)
    return DesignSpec(
        requestId=fallback_request_id,
        requiredElements=required_elements,
        styleTokens=style_tokens,
        conditioningVector=[],
    )


def _fallback_required_elements(prompt: str, request: DesignRequest) -> list[ElementSpec]:
    headline_text: Optional[str] = _fallback_headline(prompt)
    supporting_text: Optional[str] = _fallback_supporting_text(prompt, headline_text)
    cta_text: str = _fallback_cta(prompt)
    prompt_lower: str = prompt.lower()
    brandkit: Any = getattr(request, "brandKit", None)

    required_elements: list[ElementSpec] = []
    if brandkit is not None and getattr(brandkit, "logoUrl", "") and "logo" in prompt_lower:
        required_elements.append(ElementSpec(role="logo", required=True))
    if headline_text:
        required_elements.append(ElementSpec(role="headline", text=headline_text, required=True))
    if supporting_text:
        required_elements.append(ElementSpec(role="body", text=supporting_text, required=True))
    required_elements.append(ElementSpec(role="cta", text=cta_text, required=True))
    if _needs_image_slot(prompt_lower):
        required_elements.append(
            ElementSpec(
                role="image",
                imagePrompt=_fallback_image_description(prompt),
                required=True,
            )
        )

    if required_elements:
        return required_elements
    return [
        ElementSpec(role="headline", text="Special Offer", required=True),
        ElementSpec(role="body", text="Premium product promotion", required=True),
        ElementSpec(role="cta", text="Order Now", required=True),
    ]


def _fallback_headline(prompt: str) -> Optional[str]:
    quoted_match: Optional[re.Match[str]] = QUOTED_TEXT_PATTERN.search(prompt)
    if quoted_match is not None:
        return _truncate_words(_normalize_text(quoted_match.group(1)).title(), 5)

    discount_match: Optional[re.Match[str]] = DISCOUNT_PATTERN.search(prompt)
    if discount_match is not None:
        headline_text: str = discount_match.group(0).upper().replace("DISCOUNT", "OFF")
        return _truncate_words(_normalize_text(headline_text), 5)

    keywords: list[str] = _prompt_keywords(prompt)
    if not keywords:
        return None
    return _truncate_words(" ".join(keyword.title() for keyword in keywords[:5]), 5)


def _fallback_supporting_text(prompt: str, headline_text: Optional[str]) -> Optional[str]:
    headline_tokens: set[str] = {
        token.lower()
        for token in re.findall(r"[A-Za-z0-9%]+", headline_text or "")
    }
    supporting_keywords: list[str] = [
        keyword
        for keyword in _prompt_keywords(prompt)
        if keyword.lower() not in headline_tokens
    ]
    if not supporting_keywords:
        return None
    supporting_text: str = _truncate_words(" ".join(supporting_keywords[:10]), 10)
    if not supporting_text:
        return None
    if headline_text and supporting_text.lower() == headline_text.lower():
        return None
    return supporting_text


def _fallback_cta(prompt: str) -> str:
    prompt_lower: str = prompt.lower()
    for phrase in CTA_PHRASES:
        if phrase in prompt_lower:
            return phrase.title()
    if "get" in prompt_lower and "yours" in prompt_lower:
        return "Get Yours"
    return "Order Now"


def _fallback_image_description(prompt: str) -> str:
    cleaned_prompt: str = re.sub(
        r"\b(poster|flyer|banner|svg|layout|headline|subheading|cta|body|text)\b",
        "",
        prompt,
        flags=re.IGNORECASE,
    )
    normalized_description: str = _normalize_text(" ".join(cleaned_prompt.split()))
    if normalized_description:
        return normalized_description
    return prompt


def _fallback_style_tokens(prompt: str) -> dict[str, Any]:
    prompt_lower: str = prompt.lower()
    mood: str = _fallback_mood(prompt_lower)
    tone: str = _fallback_tone(prompt_lower, mood)
    return {
        "mood": mood,
        "tone": tone,
        "palette": _fallback_palette(prompt_lower, mood),
        "fontFamily": _fallback_font_family(prompt),
        "backgroundDescription": _append_background_style_constraints(_fallback_background_description(prompt, mood)),
        "shapes": _fallback_shapes(prompt_lower, mood),
    }


def _fallback_mood(prompt_lower: str) -> str:
    if "dark" in prompt_lower or "moody" in prompt_lower:
        return "dark"
    if "minimal" in prompt_lower:
        return "minimal"
    if "corporate" in prompt_lower:
        return "corporate"
    if "diwali" in prompt_lower or "festive" in prompt_lower:
        return "festive"
    if "bold" in prompt_lower:
        return "bold"
    return "clean"


def _fallback_tone(prompt_lower: str, mood: str) -> str:
    if "dark" in prompt_lower:
        return "dark"
    if "bold" in prompt_lower:
        return "bold"
    if "minimal" in prompt_lower:
        return "minimal"
    if "corporate" in prompt_lower:
        return "corporate"
    if "festive" in prompt_lower or "diwali" in prompt_lower:
        return "festive"
    return mood


def _fallback_palette(prompt_lower: str, mood: str) -> list[str]:
    colors: list[str] = [color.upper() for color in HEX_COLOR_PATTERN.findall(prompt_lower)]
    for color_name, hex_value in NAMED_COLOR_MAP.items():
        if re.search(rf"\b{re.escape(color_name)}\b", prompt_lower):
            colors.append(hex_value)

    if "diwali" in prompt_lower:
        colors.extend(["#FF6B00", "#FFD700"])
    elif mood == "dark":
        colors.extend(["#111827", "#374151"])
    elif mood == "minimal":
        colors.extend(["#111111", "#F3F4F6"])
    elif mood == "corporate":
        colors.extend(["#0F4C81", "#D9E2F2"])
    elif mood == "bold":
        colors.extend(["#0F172A", "#F97316"])
    elif mood == "festive":
        colors.extend(["#FF6B00", "#FFD700"])

    deduplicated_colors: list[str] = []
    for color in colors:
        normalized_color: str = color.upper()
        if normalized_color not in deduplicated_colors:
            deduplicated_colors.append(normalized_color)
    return deduplicated_colors[:4]


def _fallback_font_family(prompt: str) -> str:
    prompt_lower: str = prompt.lower()
    for font_name in FONT_CANDIDATES:
        if font_name.lower() in prompt_lower:
            return font_name
    return ""


def _fallback_background_description(prompt: str, mood: str) -> str:
    if "background" in prompt.lower():
        return prompt
    if mood == "dark":
        return f"{prompt} with a dark moody background"
    if mood == "festive":
        return f"{prompt} with a festive illuminated background"
    if mood == "minimal":
        return f"{prompt} with a minimal clean background"
    return prompt


def _append_background_style_constraints(background_description: str) -> str:
    normalized_description = _normalize_text(background_description)
    if normalized_description:
        return f"{normalized_description}, {BACKGROUND_STYLE_CONSTRAINTS}"
    return BACKGROUND_STYLE_CONSTRAINTS


def _fallback_shapes(prompt_lower: str, mood: str) -> str:
    discovered_shapes: list[str] = []
    for shape_keyword in ("circle", "circles", "square", "squares", "triangle", "triangles", "lines", "ribbons"):
        if shape_keyword in prompt_lower:
            discovered_shapes.append(shape_keyword)

    if "diwali" in prompt_lower:
        discovered_shapes.extend(["rangoli patterns", "light flares"])
    elif mood == "bold":
        discovered_shapes.append("large geometric blocks")
    elif mood == "minimal":
        discovered_shapes.append("clean lines")

    return ", ".join(dict.fromkeys(discovered_shapes))


def _needs_image_slot(prompt_lower: str) -> bool:
    if "text only" in prompt_lower or "typography only" in prompt_lower or "no image" in prompt_lower:
        return False
    return any(keyword in prompt_lower for keyword in IMAGE_HINTS)


def _prompt_keywords(prompt: str) -> list[str]:
    extracted_words: list[str] = re.findall(r"[A-Za-z0-9%]+", prompt)
    keywords: list[str] = []
    for word in extracted_words:
        normalized_word: str = _normalize_text(word)
        if not normalized_word:
            continue
        lowered_word: str = normalized_word.lower()
        if lowered_word in NON_CONTENT_WORDS:
            continue
        if lowered_word in CTA_PHRASES:
            continue
        if lowered_word not in [item.lower() for item in keywords]:
            keywords.append(normalized_word)
    return keywords


def _truncate_words(text: str, max_words: int) -> str:
    normalized_text: str = _normalize_text(text)
    if not normalized_text:
        return ""
    return " ".join(normalized_text.split()[:max_words])
