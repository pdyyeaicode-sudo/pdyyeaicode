/**
 * Tests for the typography and compositing validators.
 *
 * These exist because each of these properties was already implemented by BOTH
 * renderers and asserted by the cross-language parity harness, while no UI could
 * reach it. A validator that rejects a value the engine renders is the same
 * defect as a control that is missing, so the accepted set is pinned to what the
 * renderers actually support.
 */

import { describe, expect, it } from "vitest";

import {
  BLEND_MODES,
  TEXT_DECORATIONS,
  TEXT_DIRECTIONS,
  TEXT_TRANSFORMS,
  validateBlendMode,
  validateLetterSpacing,
  validateLineHeight,
  validateTextDecoration,
  validateTextDirection,
  validateTextTransform,
  validateWordSpacing,
} from "./propertyEditing";
import { RENDER_BLEND_MODES } from "./renderer/renderScene";

describe("blend modes", () => {
  it("accepts every mode the render scene models", () => {
    // The scene type, the wire encoder and this validator must agree, or a mode
    // is either unsettable or encodes to something the decoder rejects.
    for (const mode of RENDER_BLEND_MODES) {
      expect(validateBlendMode(mode).ok).toBe(true);
    }
    expect(BLEND_MODES).toHaveLength(RENDER_BLEND_MODES.size);
  });

  it("accepts plus-lighter, which the engine renders as SkBlendMode::kPlus", () => {
    expect(validateBlendMode("plus-lighter")).toEqual({ ok: true, value: "plus-lighter" });
  });

  it("normalises case and whitespace", () => {
    expect(validateBlendMode("  Multiply ")).toEqual({ ok: true, value: "multiply" });
  });

  it("rejects an unknown mode rather than passing it through", () => {
    expect(validateBlendMode("plusdarker").ok).toBe(false);
    expect(validateBlendMode("").ok).toBe(false);
  });
});

describe("text decoration", () => {
  it("accepts both decorations the engine draws", () => {
    expect(TEXT_DECORATIONS).toEqual(["none", "underline", "line-through"]);
    expect(validateTextDecoration("line-through").ok).toBe(true);
    expect(validateTextDecoration("underline").ok).toBe(true);
    expect(validateTextDecoration("none").ok).toBe(true);
  });

  it("rejects a decoration neither renderer implements", () => {
    expect(validateTextDecoration("overline").ok).toBe(false);
    expect(validateTextDecoration("underline line-through").ok).toBe(false);
  });
});

describe("text transform", () => {
  it("accepts the four CSS values applied at encode time", () => {
    expect(TEXT_TRANSFORMS).toEqual(["none", "uppercase", "lowercase", "capitalize"]);
    for (const value of TEXT_TRANSFORMS) {
      expect(validateTextTransform(value).ok).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(validateTextTransform("smallcaps").ok).toBe(false);
  });
});

describe("direction", () => {
  it("accepts ltr and rtl only", () => {
    expect(TEXT_DIRECTIONS).toEqual(["ltr", "rtl"]);
    expect(validateTextDirection("rtl").ok).toBe(true);
    expect(validateTextDirection("auto").ok).toBe(false);
  });
});

describe("spacing", () => {
  it("allows negative letter spacing, because tight tracking is legitimate", () => {
    expect(validateLetterSpacing("-2.5")).toEqual({ ok: true, value: -2.5 });
    expect(validateWordSpacing("-1")).toEqual({ ok: true, value: -1 });
  });

  it("rejects a non-finite or non-numeric value rather than letting NaN through", () => {
    expect(validateLetterSpacing("NaN").ok).toBe(false);
    expect(validateLetterSpacing("Infinity").ok).toBe(false);
    expect(validateLetterSpacing("12px").ok).toBe(false);
    expect(validateLineHeight("").ok).toBe(false);
  });

  it("treats line height as a non-negative absolute advance", () => {
    expect(validateLineHeight("0")).toEqual({ ok: true, value: 0 });
    expect(validateLineHeight("24.5")).toEqual({ ok: true, value: 24.5 });
    expect(validateLineHeight("-1").ok).toBe(false);
  });
});
