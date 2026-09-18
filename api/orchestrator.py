from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Any, Awaitable, Optional, TypeVar
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from services.layout import plan
from services.realizer import realize
from services.svg import compose_svg
from shared.models import DesignOutput, DesignRequest, DesignSpec, LayoutPlannerOutput, LayoutTree, RealizedBlueprint


logger = logging.getLogger("printrocket.orchestrator")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
logging.basicConfig(level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))
app = FastAPI(title="PrintRocket LDM-SVG Orchestrator", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://www.printrocket.in"],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)
app.state.openai_api_key_configured = bool(os.getenv("OPENAI_API_KEY", "").strip())
StageResult = TypeVar("StageResult")
MAX_UPLOAD_BYTES = 1000 * 1024 * 1024 * 1024  # 1 TB (effectively no limit)
ACCEPTED_UPLOAD_TYPES: set[str] = {"image/png", "image/jpeg", "image/webp"}


@app.on_event("startup")
async def _startup_configuration_check() -> None:
    if not app.state.openai_api_key_configured:
        logger.warning("OPENAI_API_KEY is missing or empty. /generate-design will return a configuration error until it is set.")


@app.middleware("http")
async def _configuration_guard(request: Request, call_next: Any) -> JSONResponse | Any:
    if request.url.path == "/generate-design" and not app.state.openai_api_key_configured:
        return JSONResponse(
            status_code=503,
            content={"error": "Service not configured. Please set OPENAI_API_KEY."},
        )
    return await call_next(request)


class ServiceStageError(Exception):
    def __init__(self, stage: str, message: str) -> None:
        super().__init__(message)
        self.stage = stage
        self.message = message


def _log_stage(
    request_id: str,
    stage: str,
    duration_ms: float,
    status: str,
    error: Optional[str] = None,
) -> None:
    payload: dict[str, Any] = {
        "requestId": request_id,
        "stage": stage,
        "durationMs": round(duration_ms, 2),
        "status": status,
    }
    if error is not None:
        payload["error"] = error
    logger.info(payload)


async def _run_stage(
    request_id: str,
    stage: str,
    operation: Awaitable[StageResult],
) -> StageResult:
    started_at: float = time.perf_counter()
    try:
        result: StageResult = await asyncio.wait_for(operation, timeout=30.0)
    except asyncio.TimeoutError as exc:
        duration_ms: float = (time.perf_counter() - started_at) * 1000
        _log_stage(request_id, stage, duration_ms, "timeout", "Service exceeded 30 second timeout.")
        raise HTTPException(status_code=504, detail=f"{stage} timed out. Please retry.") from exc
    except ServiceStageError as exc:
        duration_ms = (time.perf_counter() - started_at) * 1000
        _log_stage(request_id, stage, duration_ms, "error", exc.message)
        raise HTTPException(status_code=503, detail=f"{stage} is not ready yet. Please retry later.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        duration_ms = (time.perf_counter() - started_at) * 1000
        logger.exception("Unhandled error during %s stage for request %s", stage, request_id)
        _log_stage(request_id, stage, duration_ms, "error", "Internal pipeline failure.")
        raise HTTPException(status_code=500, detail="Design generation failed. Please retry.") from exc
    duration_ms = (time.perf_counter() - started_at) * 1000
    _log_stage(request_id, stage, duration_ms, "success")
    return result


async def _encode_design_request(request: DesignRequest, request_id: str) -> DesignSpec:
    from services.encoder import encode

    return encode(request, request_id)


async def _plan_layout(spec: DesignSpec, request: DesignRequest) -> LayoutPlannerOutput:
    return plan(spec, request)


async def _build_realized_blueprint(layout_tree: LayoutTree, spec: DesignSpec) -> RealizedBlueprint:
    return realize(layout_tree, spec)


async def _realize_visuals(layout_tree: LayoutTree, spec: DesignSpec) -> DesignOutput:
    blueprint: RealizedBlueprint = await _build_realized_blueprint(layout_tree, spec)
    return compose_svg(blueprint)


async def _build_uploaded_image_output(file: UploadFile) -> DesignOutput:
    content_type: Optional[str] = file.content_type
    if not content_type or not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Unsupported image type. Use PNG, JPEG, or any valid image file.")

    try:
        image_bytes: bytes = await file.read()
    except Exception as exc:
        logger.exception("Failed to read uploaded image.")
        raise HTTPException(status_code=400, detail="Unable to read the uploaded image.") from exc
    finally:
        await file.close()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded image exceeds the size limit.")

    try:
        from services.svg.image_to_layers import smart_image_to_layers

        design_output = smart_image_to_layers(image_bytes, content_type)
        logger.info(
            {
                "requestId": design_output.requestId,
                "stage": "upload-image",
                "durationMs": 0.0,
                "status": "success",
                "path": "smart_image_to_layers",
            }
        )
        return design_output
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Dreamer FastSAM layer extraction failed.")
        raise HTTPException(
            status_code=500,
            detail="Dreamer could not separate this image into editable layers. Please try another image.",
        ) from exc


@app.post("/generate-design", response_model=DesignOutput)
async def generate_design(request: DesignRequest) -> DesignOutput:
    request_id: str = str(uuid4())
    design_spec: DesignSpec = await _run_stage(request_id, "encoder", _encode_design_request(request, request_id))
    layout_output: LayoutPlannerOutput = await _run_stage(request_id, "planner", _plan_layout(design_spec, request))
    design_output: DesignOutput = await _run_stage(
        request_id,
        "realizer-svg",
        _realize_visuals(layout_output.layoutTree, design_spec),
    )
    return design_output


@app.post("/upload-image", response_model=DesignOutput)
async def upload_image(file: UploadFile = File(...)) -> DesignOutput:
    return await _build_uploaded_image_output(file)

from shared.models import PrintExportRequest
from services.svg import apply_print_meta

@app.post("/export-print")
async def export_print(request: PrintExportRequest):
    request_id: str = str(uuid4())
    started_at: float = time.perf_counter()
    try:
        # Apply bleed and trim marks
        print_ready_svg = apply_print_meta(request.composedSVG, request.bleed_mm)
        # TODO: A real implementation would parse the SVG and apply hex_to_cmyk_safe to all colors.
        # Since this involves heavy XML parsing, we can assume apply_print_meta does it, or we do a regex replace.
        # For this prototype, we'll just inject the bleed.
        duration_ms = (time.perf_counter() - started_at) * 1000
        _log_stage(request_id, "export-print", duration_ms, "success")
        return {"printReadySVG": print_ready_svg}
    except Exception as exc:
        duration_ms = (time.perf_counter() - started_at) * 1000
        logger.exception("Failed to export print-ready SVG.")
        _log_stage(request_id, "export-print", duration_ms, "error", str(exc))
        raise HTTPException(status_code=500, detail="Failed to prepare print export.") from exc

from pydantic import BaseModel, Field
from shared.models import FeedbackEventType, PrintOutcome
from datetime import datetime

class FeedbackEvent(BaseModel):
    requestId: str
    eventType: FeedbackEventType
    elementId: Optional[str] = None
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    rating: Optional[int] = None
    printOutcome: Optional[PrintOutcome] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

@app.post("/api/feedback")
async def log_feedback(event: FeedbackEvent):
    log_dir = Path("logs/feedback")
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{datetime.utcnow().strftime('%Y-%m-%d')}.jsonl"
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(event.model_dump_json() + "\n")
        return {"status": "logged"}
    except Exception as exc:
        logger.error(f"Failed to log feedback: {exc}")
        return {"status": "error"}
