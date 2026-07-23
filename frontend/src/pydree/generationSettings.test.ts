import { describe, expect, it } from "vitest";

import {
  GENERATION_ASPECT_RATIOS,
  GENERATION_RESOLUTIONS,
  resolveGenerationTargetSize,
} from "./generationSettings";

describe("resolveGenerationTargetSize", () => {
  it.each([
    ["1K", "1:1", 1024, 1024],
    ["1K", "3:4", 768, 1024],
    ["1K", "9:16", 576, 1024],
    ["1K", "4:3", 1024, 768],
    ["1K", "16:9", 1024, 576],
    ["2K", "3:4", 1536, 2048],
    ["4K", "16:9", 4096, 2304],
  ] as const)("maps %s %s to %sx%s", (resolution, ratio, width, height) => {
    expect(resolveGenerationTargetSize(resolution, ratio)).toEqual({ width, height, unit: "px" });
  });

  it("covers every exposed resolution and aspect-ratio combination", () => {
    for (const resolution of GENERATION_RESOLUTIONS) {
      for (const ratio of GENERATION_ASPECT_RATIOS) {
        const result = resolveGenerationTargetSize(resolution, ratio);
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
        expect(Math.max(result.width, result.height)).toBe(Number.parseInt(resolution, 10) * 1024);
      }
    }
  });
});
