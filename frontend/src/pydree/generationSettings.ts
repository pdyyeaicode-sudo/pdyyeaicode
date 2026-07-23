import type { TargetSize } from "../types";

export const GENERATION_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export const GENERATION_ASPECT_RATIOS = ["1:1", "3:4", "9:16", "4:3", "16:9"] as const;

export type GenerationResolution = typeof GENERATION_RESOLUTIONS[number];
export type GenerationAspectRatio = typeof GENERATION_ASPECT_RATIOS[number];

const LONG_EDGE_BY_RESOLUTION: Record<GenerationResolution, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
};

const RATIO_PARTS: Record<GenerationAspectRatio, readonly [width: number, height: number]> = {
  "1:1": [1, 1],
  "3:4": [3, 4],
  "9:16": [9, 16],
  "4:3": [4, 3],
  "16:9": [16, 9],
};

/** Resolve image-generation presets to deterministic pixel dimensions. */
export function resolveGenerationTargetSize(
  resolution: GenerationResolution,
  aspectRatio: GenerationAspectRatio,
): TargetSize {
  const longEdge = LONG_EDGE_BY_RESOLUTION[resolution];
  const [ratioWidth, ratioHeight] = RATIO_PARTS[aspectRatio];

  if (ratioWidth >= ratioHeight) {
    return {
      width: longEdge,
      height: Math.round(longEdge * ratioHeight / ratioWidth),
      unit: "px",
    };
  }

  return {
    width: Math.round(longEdge * ratioWidth / ratioHeight),
    height: longEdge,
    unit: "px",
  };
}
