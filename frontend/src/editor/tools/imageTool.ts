/**
 * imageTool — image placement for Creative Studio (v1).
 *
 * Responsibilities (Req 7.1–7.5):
 *  - Validate a selected `File`: accept PNG/JPEG/WEBP that is <= 10MB, otherwise
 *    reject with a reason-specific error distinguishing unsupported *type* from
 *    exceeded *size* (Req 7.3).
 *  - For a file within limits, read it to an inline `data:` URI with no network
 *    request (Req 7.2) and build an `ImageLayer` for the `image-slots` group
 *    with a `data-layer-id` unique among the supplied existing identifiers
 *    (Req 7.1), wrapped in a reversible `createLayerCommand` (Req 7.5).
 *  - A file within limits that cannot be read or decoded produces a load error
 *    and no command (Req 7.4).
 *
 * Design notes:
 *  - Validation is a pure, synchronous function so it is trivially testable.
 *  - The async read/decode step is isolated behind the `ImageLoader` seam so
 *    tests can inject a fake reader (jsdom has no real image decoder). The
 *    default loader uses `FileReader` + `Image`, replicating the existing
 *    `fileToDataUrl` pattern in `useDesignStudio.ts` (which is left untouched).
 *  - Building the layer/command never mutates shared state; the unique-id
 *    inputs are passed in by the caller (final wiring is task 14.1).
 *
 * One responsibility per file: image validation + placement command building.
 */

import { createLayerCommand } from "../commands";
import type { Command, ImageLayer } from "../types/documentModel";

/** Maximum accepted image size in bytes (10MB), per Req 7.1/7.3. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Accepted MIME types for image placement, per Req 7.1/7.3. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** The two reasons a file is rejected at validation time (Req 7.3). */
export type ImageRejectionReason = "type" | "size";

export interface ImageValidationOk {
  readonly ok: true;
}

export interface ImageValidationError {
  readonly ok: false;
  readonly reason: ImageRejectionReason;
  readonly message: string;
}

export type ImageValidationResult = ImageValidationOk | ImageValidationError;

/**
 * Pure validation of a selected image file (Req 7.3).
 *
 * Type is checked before size so an unsupported format is always reported as a
 * `type` rejection regardless of its byte length, and a supported format that
 * is too large is reported as a `size` rejection. The returned message names
 * the specific reason for rejection.
 */
export function validateImageFile(file: File): ImageValidationResult {
  if (!isAcceptedImageType(file.type)) {
    return {
      ok: false,
      reason: "type",
      message: `Unsupported file type "${file.type || "unknown"}". Use PNG, JPEG, or WEBP.`,
    };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      reason: "size",
      message: `File is too large (${formatBytes(file.size)}). The maximum image size is 10MB.`,
    };
  }
  return { ok: true };
}

function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1)}MB`;
}

/** A successfully read + decoded image: its inline data URI and pixel size. */
export interface LoadedImage {
  readonly dataUrl: string; // inline `data:` URI — no external request (Req 7.2)
  readonly width: number;
  readonly height: number;
}

/**
 * The async read/decode seam. The default implementation uses the browser
 * `FileReader` and `Image`; tests inject a fake to exercise success and the
 * undecodable/unreadable failure path (Req 7.4) deterministically.
 */
export type ImageLoader = (file: File) => Promise<LoadedImage>;

/**
 * Default loader: reads the file to a `data:` URI (no network, Req 7.2) and
 * decodes it via an `Image` element to obtain natural pixel dimensions. Rejects
 * when the file cannot be read or cannot be decoded (Req 7.4).
 */
export const defaultImageLoader: ImageLoader = (file: File): Promise<LoadedImage> =>
  new Promise<LoadedImage>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image file could not be loaded."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The image file could not be loaded."));
        return;
      }
      const dataUrl = reader.result;
      const image = new Image();
      image.onload = () =>
        resolve({ dataUrl, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("The image file could not be decoded."));
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

/** Options for {@link placeImageFile}. */
export interface PlaceImageOptions {
  /**
   * All layer identifiers already present in the Document_Model. The new image
   * layer receives a `data-layer-id` guaranteed unique against this set
   * (Req 7.1). Passed in by the caller; this module owns no document state.
   */
  readonly existingLayerIds: readonly string[];
  /** Top-left placement position in px. Defaults to the artboard origin. */
  readonly position?: { readonly x: number; readonly y: number };
  /** Injectable read/decode seam; defaults to {@link defaultImageLoader}. */
  readonly loader?: ImageLoader;
}

export interface ImagePlacementSuccess {
  readonly ok: true;
  /** The reversible command that inserts the image into `image-slots` (Req 7.5). */
  readonly command: Command;
  /** The built image layer (for selection/inspection by the caller). */
  readonly layer: ImageLayer;
}

export interface ImagePlacementFailure {
  readonly ok: false;
  /** `validation` for type/size rejection (Req 7.3); `load` for read/decode failure (Req 7.4). */
  readonly kind: "validation" | "load";
  /** Present only for validation failures, distinguishing the rejection cause. */
  readonly reason?: ImageRejectionReason;
  readonly message: string;
}

export type ImagePlacementResult = ImagePlacementSuccess | ImagePlacementFailure;

/**
 * Validate, read, and build a placement command for an image file.
 *
 * On success returns a `createLayerCommand` that adds exactly one `<image>` to
 * the `image-slots` group with a unique `data-layer-id` and an inline `data:`
 * href (Req 7.1, 7.2, 7.5). On any failure returns a descriptive error and no
 * command, so the caller leaves the Document_Model unchanged (Req 7.3, 7.4).
 *
 * This function performs no document mutation itself; the caller dispatches the
 * returned command through the history system (final wiring is task 14.1).
 */
export async function placeImageFile(
  file: File,
  options: PlaceImageOptions,
): Promise<ImagePlacementResult> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    return {
      ok: false,
      kind: "validation",
      reason: validation.reason,
      message: validation.message,
    };
  }

  const loader = options.loader ?? defaultImageLoader;
  let loaded: LoadedImage;
  try {
    loaded = await loader(file);
  } catch (loadError) {
    // No silent fallback: log the reason, surface a load error, build no command.
    const detail = loadError instanceof Error ? loadError.message : String(loadError);
    console.error(`Image placement failed to load "${file.name}": ${detail}`);
    return {
      ok: false,
      kind: "load",
      message: "The image could not be loaded. The file may be corrupt or unreadable.",
    };
  }

  const layer = buildImageLayer(file, loaded, options);
  return { ok: true, command: createLayerCommand(layer), layer };
}

/**
 * Build the `ImageLayer` for the `image-slots` group with a unique id and an
 * inline data URI. Pure: depends only on its inputs.
 */
export function buildImageLayer(
  file: File,
  loaded: LoadedImage,
  options: PlaceImageOptions,
): ImageLayer {
  const id = uniqueImageLayerId(options.existingLayerIds);
  const position = options.position ?? { x: 0, y: 0 };
  return {
    id,
    role: "image-slots",
    name: toLayerName(file.name),
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "image",
    href: loaded.dataUrl,
    field: "image",
    elementId: id,
    x: position.x,
    y: position.y,
    width: loaded.width,
    height: loaded.height,
  };
}

/**
 * Produce an `image-slot-N` identifier not present among `existing` ids
 * (Req 7.1). Deterministic for a given set of existing ids.
 */
export function uniqueImageLayerId(existing: readonly string[]): string {
  const taken = new Set(existing);
  let index = 1;
  let candidate = `image-slot-${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `image-slot-${index}`;
  }
  return candidate;
}

/**
 * Derive a display name (data-name, 1..100 chars per Req 3.4) from the file
 * name, falling back to a default and truncating overly long names.
 */
function toLayerName(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    return "Image";
  }
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}
