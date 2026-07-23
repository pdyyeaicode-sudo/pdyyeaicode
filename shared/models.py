from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


Tone = Literal["bold", "minimal", "festive", "corporate"]
OutputFormat = Literal["svg", "pdf", "png"]
CanvasUnit = Literal["px", "mm"]
LayoutRole = Literal["headline", "subheading", "body", "cta", "logo", "image", "background", "shape"]
FeedbackEventType = Literal["edit", "rating", "print_outcome", "ab_choice"]
PrintOutcome = Literal["success", "rejected_contrast", "rejected_bleed", "other"]


class PrintRocketModel(BaseModel):
    class Config:
        extra = "forbid"


class BrandKit(PrintRocketModel):
    primaryColor: str
    secondaryColor: str
    fontFamily: str
    logoUrl: str
    tone: Tone


class TargetSize(PrintRocketModel):
    width: float
    height: float
    unit: CanvasUnit


class DesignRequest(PrintRocketModel):
    prompt: str
    brandKit: Optional[BrandKit] = None
    targetSize: TargetSize
    outputFormat: OutputFormat
    sessionHistory: list[str]


class LayoutBox(PrintRocketModel):
    id: str
    role: LayoutRole
    x: float
    y: float
    width: float
    height: float
    zIndex: int
    content: Optional[str] = None
    imageUrl: Optional[str] = None


class LayoutTree(PrintRocketModel):
    canvasWidth: float
    canvasHeight: float
    boxes: list[LayoutBox]


DesignOperationType = Literal["AddFrame", "AddGrid", "PlaceText", "PlaceImage", "PlaceLogo", "AddShape"]


class DesignOperation(PrintRocketModel):
    op: DesignOperationType
    params: dict[str, Any]


class LayoutPlannerOutput(PrintRocketModel):
    layoutTree: LayoutTree
    operations: list[DesignOperation]


class SVGLayer(PrintRocketModel):
    id: str
    role: LayoutRole
    svgElement: str
    isEditable: bool


class PrintMeta(PrintRocketModel):
    bleed: float
    cmykSafe: bool
    trimMarks: bool


class DesignOutput(PrintRocketModel):
    requestId: str
    svgLayers: list[SVGLayer]
    composedSVG: str
    backgroundImageUrl: Optional[str] = None
    printMeta: PrintMeta


class PrintExportRequest(PrintRocketModel):
    composedSVG: str
    bleed_mm: float = 3.0


class ElementSpec(PrintRocketModel):
    role: LayoutRole
    text: Optional[str] = None
    imagePrompt: Optional[str] = None
    required: bool = True


class DesignSpec(PrintRocketModel):
    requestId: str
    requiredElements: list[ElementSpec]
    styleTokens: dict[str, Any]
    conditioningVector: list[float]


class StyleDecision(PrintRocketModel):
    elementId: str
    backgroundColor: Optional[str] = None
    gradient: Optional[str] = None
    fontColor: str
    fontSize: Optional[float] = None
    shadow: Optional[str] = None


class RealizedBlueprint(PrintRocketModel):
    requestId: str
    layoutTree: LayoutTree
    backgroundImageUrl: str
    styleMap: list[StyleDecision]


class FeedbackEvent(PrintRocketModel):
    requestId: str
    eventType: FeedbackEventType
    elementId: Optional[str] = None
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    printOutcome: Optional[PrintOutcome] = None
    timestamp: datetime
