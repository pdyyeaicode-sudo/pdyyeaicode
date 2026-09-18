/**
 * Tests for the gradient authoring model.
 *
 * The properties that matter are the ones that keep authoring and rendering in
 * agreement: every attribute is written explicitly so no default can drift,
 * offsets are non-decreasing so the engine's decoder cannot reject the scene, and
 * unrelated `<defs>` content survives an edit.
 */

import { describe, expect, it } from "vitest";

import {
  angleForEndpoints,
  createGradient,
  endpointsForAngle,
  gradientFillReference,
  gradientIdFromFill,
  gradientPreviewCss,
  normaliseStops,
  parseGradientFromDefs,
  removeGradientFromDefs,
  serializeGradient,
  upsertGradientInDefs,
} from "./gradientModel";

describe("fill references", () => {
  it("round-trips a url(#id) fill", () => {
    expect(gradientFillReference("grad-1")).toBe("url(#grad-1)");
    expect(gradientIdFromFill("url(#grad-1)")).toBe("grad-1");
    expect(gradientIdFromFill("  url( #grad-1 ) ")).toBe("grad-1");
  });

  it("returns null for anything that is not a paint-server reference", () => {
    expect(gradientIdFromFill("#ff0000")).toBeNull();
    expect(gradientIdFromFill("none")).toBeNull();
    expect(gradientIdFromFill(undefined)).toBeNull();
  });
});

describe("angle conversion", () => {
  it("maps 0 degrees to a left-to-right ramp", () => {
    expect(endpointsForAngle(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
  });

  it("maps 90 degrees to a top-to-bottom ramp", () => {
    const { x1, y1, x2, y2 } = endpointsForAngle(90);
    expect(x1).toBeCloseTo(0.5, 6);
    expect(y1).toBeCloseTo(0, 6);
    expect(x2).toBeCloseTo(0.5, 6);
    expect(y2).toBeCloseTo(1, 6);
  });

  it("round-trips through the inverse", () => {
    for (const angle of [0, 45, 90, 135, 200, 315]) {
      const { x1, y1, x2, y2 } = endpointsForAngle(angle);
      expect(angleForEndpoints(x1, y1, x2, y2)).toBeCloseTo(angle, 2);
    }
  });
});

describe("serialization", () => {
  it("writes every attribute explicitly, including SVG defaults", () => {
    const markup = serializeGradient(createGradient("g1"));

    // Nothing is left implicit, so the independent C++ parser has no default to
    // disagree with.
    expect(markup).toContain('id="g1"');
    expect(markup).toContain('gradientUnits="objectBoundingBox"');
    expect(markup).toContain('spreadMethod="pad"');
    expect(markup).toContain("x1=");
    expect(markup).toContain("y2=");
    expect(markup).toContain('stop-opacity="1"');
  });

  it("emits a radial gradient with a focal point", () => {
    const markup = serializeGradient({
      ...createGradient("g2", "radial"),
      cx: 0.4,
      cy: 0.6,
      r: 0.25,
      fx: 0.45,
      fy: 0.6,
      spread: "reflect",
    });

    expect(markup).toContain("<radialGradient");
    expect(markup).toContain('cx="0.4"');
    expect(markup).toContain('r="0.25"');
    expect(markup).toContain('fx="0.45"');
    expect(markup).toContain('spreadMethod="reflect"');
  });

  it("escapes a hostile colour value rather than emitting raw markup", () => {
    const markup = serializeGradient({
      ...createGradient("g3"),
      stops: [{ offset: 0, color: '"><script>x()</script>', opacity: 1 }],
    });

    expect(markup).not.toContain("<script");
    expect(markup).toContain("&quot;");
  });

  it("clamps a negative radius so the markup is always valid", () => {
    const markup = serializeGradient({ ...createGradient("g4", "radial"), r: -3 });
    expect(markup).toContain('r="0"');
  });
});

describe("stop normalisation", () => {
  it("sorts stops and forces offsets to be non-decreasing", () => {
    // The engine's decoder rejects a descending offset outright, failing the
    // whole scene, so the panel must not be able to produce one.
    const normalised = normaliseStops([
      { offset: 0.8, color: "#fff", opacity: 1 },
      { offset: 0.2, color: "#000", opacity: 1 },
    ]);

    expect(normalised.map((stop) => stop.offset)).toEqual([0.2, 0.8]);
  });

  it("clamps offsets into 0..1", () => {
    const normalised = normaliseStops([
      { offset: -1, color: "#fff", opacity: 1 },
      { offset: 5, color: "#000", opacity: 2 },
    ]);

    expect(normalised[0].offset).toBe(0);
    expect(normalised[1].offset).toBe(1);
  });

  it("survives non-finite input instead of emitting NaN", () => {
    const normalised = normaliseStops([
      { offset: Number.NaN, color: "#fff", opacity: Number.NaN },
    ]);
    expect(normalised[0].offset).toBe(0);
  });
});

describe("defs editing", () => {
  const OTHER = '<style>@font-face{font-family:X}</style><filter id="f1"></filter>';

  it("inserts a gradient without disturbing existing defs content", () => {
    const defs = upsertGradientInDefs(OTHER, createGradient("g1"));

    expect(defs).toContain("<style>");
    expect(defs).toContain('id="f1"');
    expect(defs).toContain('id="g1"');
  });

  it("replaces a gradient in place, leaving neighbours alone", () => {
    const first = upsertGradientInDefs(OTHER, createGradient("g1"));
    const withSecond = upsertGradientInDefs(first, createGradient("g2"));
    const updated = upsertGradientInDefs(withSecond, {
      ...createGradient("g1"),
      spread: "repeat",
    });

    expect(updated).toContain('spreadMethod="repeat"');
    expect(updated).toContain('id="g2"');
    expect(updated).toContain('id="f1"');
    // Exactly one definition of g1, not two.
    expect(updated.match(/id="g1"/g)).toHaveLength(1);
  });

  it("removes a gradient and nothing else", () => {
    const defs = upsertGradientInDefs(upsertGradientInDefs(OTHER, createGradient("g1")), createGradient("g2"));
    const removed = removeGradientFromDefs(defs, "g1");

    expect(removed).not.toContain('id="g1"');
    expect(removed).toContain('id="g2"');
    expect(removed).toContain("<style>");
  });

  it("is a no-op when removing an id that is not there", () => {
    expect(removeGradientFromDefs(OTHER, "nope")).toBe(OTHER);
  });
});

describe("reading a gradient back", () => {
  it("recovers everything the panel authored", () => {
    const original = {
      ...createGradient("g1"),
      angle: 135,
      spread: "reflect" as const,
      stops: [
        { offset: 0, color: "#112233", opacity: 1 },
        { offset: 0.5, color: "#445566", opacity: 0.5 },
        { offset: 1, color: "#778899", opacity: 0.25 },
      ],
    };
    const parsed = parseGradientFromDefs(upsertGradientInDefs("", original), "g1");

    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("linear");
    expect(parsed?.spread).toBe("reflect");
    expect(parsed?.angle).toBeCloseTo(135, 1);
    expect(parsed?.stops).toHaveLength(3);
    expect(parsed?.stops[1].color).toBe("#445566");
    expect(parsed?.stops[1].opacity).toBeCloseTo(0.5, 6);
  });

  it("recovers a radial gradient's geometry", () => {
    const original = { ...createGradient("g2", "radial"), cx: 0.25, cy: 0.75, r: 0.4, fx: 0.3, fy: 0.75 };
    const parsed = parseGradientFromDefs(upsertGradientInDefs("", original), "g2");

    expect(parsed?.kind).toBe("radial");
    expect(parsed?.cx).toBeCloseTo(0.25, 4);
    expect(parsed?.r).toBeCloseTo(0.4, 4);
    expect(parsed?.fx).toBeCloseTo(0.3, 4);
  });

  it("reads percentage attributes, which an imported document may use", () => {
    const defs = '<linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="50%" stop-color="#f00"/></linearGradient>';
    const parsed = parseGradientFromDefs(defs, "g3");

    expect(parsed?.angle).toBeCloseTo(0, 4);
    expect(parsed?.stops[0].offset).toBeCloseTo(0.5, 4);
  });

  it("returns null for an id that is absent", () => {
    expect(parseGradientFromDefs("<filter id=\"f1\"></filter>", "g1")).toBeNull();
  });
});

describe("preview", () => {
  it("produces CSS that carries stop alpha", () => {
    const css = gradientPreviewCss({
      ...createGradient("g1"),
      angle: 0,
      stops: [
        { offset: 0, color: "#ff0000", opacity: 1 },
        { offset: 1, color: "#0000ff", opacity: 0.5 },
      ],
    });

    expect(css).toContain("linear-gradient(");
    expect(css).toContain("rgba(255,0,0,1) 0%");
    expect(css).toContain("rgba(0,0,255,0.5) 100%");
  });

  it("produces a radial preview centred where the gradient is", () => {
    const css = gradientPreviewCss({ ...createGradient("g1", "radial"), cx: 0.25, cy: 0.75 });
    expect(css).toContain("radial-gradient(circle at 25% 75%");
  });
});
