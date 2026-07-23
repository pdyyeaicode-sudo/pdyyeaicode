import axios, { AxiosError } from "axios";

import { DesignOutput, DesignRequest } from "../types";

const DESIGN_API_URL = "/api/generate-design";
const UPLOAD_IMAGE_API_URL = "/api/upload-image";
const DESIGN_REQUEST_TIMEOUT_MS = 300_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 300_000;

interface ErrorResponseBody {
  error?: string | { message?: string; stage?: string };
  detail?: string | { message?: string; stage?: string };
  stage?: string;
}

export class DesignApiError extends Error {
  public readonly stage?: string;
  public readonly statusCode?: number;

  public constructor(message: string, stage?: string, statusCode?: number) {
    super(message);
    this.name = "DesignApiError";
    this.stage = stage;
    this.statusCode = statusCode;
  }
}

export async function generateDesign(request: DesignRequest): Promise<DesignOutput> {
  try {
    const response = await axios.post<DesignOutput>(DESIGN_API_URL, request, {
      timeout: DESIGN_REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!isDesignOutput(response.data)) {
      throw new DesignApiError("API returned an invalid DesignOutput payload.", "response", response.status);
    }

    return response.data;
  } catch (error) {
    if (error instanceof DesignApiError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      throw toDesignApiError(error);
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DesignApiError("Design generation timed out after 300 seconds.", "request", 408);
    }

    throw new DesignApiError(
      error instanceof Error ? error.message : "Unable to contact the design generation service.",
      "network",
    );
  }
}

export async function uploadImage(file: File): Promise<DesignOutput> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post<DesignOutput>(UPLOAD_IMAGE_API_URL, formData, {
      timeout: UPLOAD_REQUEST_TIMEOUT_MS,
    });

    if (!isDesignOutput(response.data)) {
      throw new DesignApiError("API returned an invalid DesignOutput payload.", "response", response.status);
    }

    return response.data;
  } catch (error) {
    if (error instanceof DesignApiError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      throw toDesignApiError(error);
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DesignApiError("Image upload timed out after 300 seconds.", "request", 408);
    }

    throw new DesignApiError(
      error instanceof Error ? error.message : "Unable to upload the image right now.",
      "network",
    );
  }
}

function toDesignApiError(error: AxiosError<ErrorResponseBody>): DesignApiError {
  if (error.code === "ECONNABORTED") {
    const timedOutUrl = error.config?.url ?? "";
    const isUploadRequest = timedOutUrl.includes(UPLOAD_IMAGE_API_URL);
    return new DesignApiError(
      isUploadRequest ? "Image upload timed out after 300 seconds." : "Design generation timed out after 300 seconds.",
      "request",
      408,
    );
  }

  const statusCode = error.response?.status;
  const statusText = error.response?.statusText ?? error.message;
  const payload = error.response?.data;

  if (payload && typeof payload === "object") {
    const primaryError = payload.error ?? payload.detail;

    if (typeof primaryError === "string") {
      return new DesignApiError(primaryError, payload.stage, statusCode);
    }

    if (primaryError && typeof primaryError === "object") {
      return new DesignApiError(
        primaryError.message ?? statusText,
        primaryError.stage ?? payload.stage,
        statusCode,
      );
    }
  }

  return new DesignApiError(statusText || "Design generation failed.", undefined, statusCode);
}

function isDesignOutput(payload: unknown): payload is DesignOutput {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<DesignOutput>;
  return (
    typeof candidate.requestId === "string"
    && Array.isArray(candidate.svgLayers)
    && typeof candidate.composedSVG === "string"
    && candidate.printMeta !== undefined
  );
}
