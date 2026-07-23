import { removeBackground } from "@imgly/background-removal";
import type { ImageLayer, Command } from "../types/documentModel";
import { mapLayerInDoc } from "../commands/helpers";

/**
 * Remove the background of an ImageLayer using Client-Side Edge AI (WASM).
 * @param layer The ImageLayer to process
 * @param onProgress Callback for loading progress (0 to 100)
 * @returns A command that replaces the image with the extracted subject
 */
export async function removeImageBackground(
  layer: ImageLayer,
  onProgress?: (progress: number) => void
): Promise<{ ok: boolean; command?: Command; error?: string }> {
  try {
    // 1. Convert base64 href to a Blob
    const response = await fetch(layer.href);
    if (!response.ok) {
      throw new Error(`Unable to read the selected image (${response.status}).`);
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error("The selected image is empty.");
    }

    // 2. Run Edge AI Model
    // Note: The first run downloads the ONNX model (~30MB) into IndexedDB cache.
    const resultBlob = await removeBackground(blob, {
      progress: (key, current, total) => {
        if (onProgress && total > 0 && Number.isFinite(current)) {
          const progress = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
          try {
            onProgress(progress);
          } catch (progressError) {
            console.error("Background removal progress callback failed", progressError);
          }
        }
      },
      ...(import.meta.env.VITE_IMGLY_PUBLIC_PATH
        ? { publicPath: import.meta.env.VITE_IMGLY_PUBLIC_PATH }
        : {}),
      // Configuration for optimal quality/speed
      model: "isnet_fp16", // Optimized for web
      output: {
        format: "image/png",
        quality: 1.0,
      }
    });

    // 3. Convert result back to base64
    const newHref = await blobToDataUrl(resultBlob);
    onProgress?.(100);

    // 4. Return an undoable command
    const oldHref = layer.href;
    const command = createBackgroundRemovalCommand(layer.id, oldHref, newHref);

    return { ok: true, command };
  } catch (error: unknown) {
    console.error("AI Background Removal failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to remove background.",
    };
  }
}

export function createBackgroundRemovalCommand(
  layerId: string,
  oldHref: string,
  newHref: string,
): Command {
  return {
    type: "remove-background",
    label: "AI Remove Background",
    apply: (doc) =>
      mapLayerInDoc(doc, layerId, (current) =>
        current.kind === "image" && current.href === oldHref
          ? { ...current, href: newHref }
          : current,
      ),
    undo: (doc) =>
      mapLayerInDoc(doc, layerId, (current) =>
        current.kind === "image" && current.href === newHref
          ? { ...current, href: oldHref }
          : current,
      ),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.length > 0) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Background removal returned an invalid image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the processed image."));
    reader.onabort = () => reject(new Error("Reading the processed image was cancelled."));
    reader.readAsDataURL(blob);
  });
}
