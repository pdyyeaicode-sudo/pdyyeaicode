import { describe, expect, it } from "vitest";

import {
  gradientFillToCss,
  gradientIdForFill,
  gradientVector,
  parseGradientFill,
  serializeGradientFill,
} from "./gradientFill";

describe("gradientFill", () => {
  const value = "gradient:linear,90,#ff0080:0,#7928ca:100";

  it("parses and serializes the editor gradient contract", () => {
    expect(parseGradientFill(value)).toEqual({
      kind: "linear",
      angle: 90,
      stops: [
        { color: "#ff0080", offset: 0 },
        { color: "#7928ca", offset: 100 },
      ],
    });
    expect(serializeGradientFill(90, [
      { color: "#FF0080", offset: 0 },
      { color: "#7928CA", offset: 100 },
    ])).toBe(value);
  });

  it("builds CSS and SVG representations from the same payload", () => {
    expect(gradientFillToCss(value)).toBe(
      "linear-gradient(90deg, #ff0080 0%, #7928ca 100%)",
    );
    expect(gradientVector(90)).toEqual({
      x1: "0%",
      y1: "50%",
      x2: "100%",
      y2: "50%",
    });
  });

  it("creates a stable SVG definition id", () => {
    expect(gradientIdForFill(value)).toBe(gradientIdForFill(value));
    expect(gradientIdForFill(value)).toMatch(/^printrocket-gradient-/);
  });
});
