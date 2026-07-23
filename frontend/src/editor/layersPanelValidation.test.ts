import { describe, expect, it } from "vitest";

import {
  LAYER_NAME_MAX_LENGTH,
  validateLayerName,
  validateOpacityInput,
  validateOpacityPercent,
} from "./layersPanelValidation";

/**
 * Unit tests for the Layers_Panel pure validators (task 9.1, Req 3.4, 3.7,
 * 3.10, 3.11). These guard the panel's rename and opacity edits before any
 * Command is built.
 */

describe("validateLayerName", () => {
  it("accepts a normal 1..100 character name unchanged", () => {
    expect(validateLayerName("Headline")).toEqual({ ok: true, value: "Headline" });
  });

  it("accepts a single character (lower bound)", () => {
    expect(validateLayerName("A")).toEqual({ ok: true, value: "A" });
  });

  it("accepts exactly 100 characters (upper bound)", () => {
    const name = "a".repeat(LAYER_NAME_MAX_LENGTH);
    expect(validateLayerName(name)).toEqual({ ok: true, value: name });
  });

  it("preserves significant interior spacing", () => {
    expect(validateLayerName("Hero  Banner")).toEqual({ ok: true, value: "Hero  Banner" });
  });

  it("rejects an empty string (Req 3.10)", () => {
    const result = validateLayerName("");
    expect(result.ok).toBe(false);
  });

  it("rejects a whitespace-only string (Req 3.10)", () => {
    const result = validateLayerName("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects a name over 100 characters (Req 3.10)", () => {
    const result = validateLayerName("a".repeat(LAYER_NAME_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});

describe("validateOpacityPercent", () => {
  it("accepts 0 and 100 (bounds)", () => {
    expect(validateOpacityPercent(0)).toEqual({ ok: true, value: 0 });
    expect(validateOpacityPercent(100)).toEqual({ ok: true, value: 100 });
  });

  it("accepts a mid-range integer", () => {
    expect(validateOpacityPercent(42)).toEqual({ ok: true, value: 42 });
  });

  it("rejects values below 0 (Req 3.11)", () => {
    expect(validateOpacityPercent(-1).ok).toBe(false);
  });

  it("rejects values above 100 (Req 3.11)", () => {
    expect(validateOpacityPercent(150).ok).toBe(false);
  });

  it("rejects non-integers (Req 3.11)", () => {
    expect(validateOpacityPercent(33.3).ok).toBe(false);
    expect(validateOpacityPercent(Number.NaN).ok).toBe(false);
  });
});

describe("validateOpacityInput", () => {
  it("parses and accepts an in-range integer string", () => {
    expect(validateOpacityInput("75")).toEqual({ ok: true, value: 75 });
  });

  it("rejects an empty string", () => {
    expect(validateOpacityInput("").ok).toBe(false);
  });

  it("rejects non-numeric text", () => {
    expect(validateOpacityInput("abc").ok).toBe(false);
  });

  it("rejects fractional input", () => {
    expect(validateOpacityInput("50.5").ok).toBe(false);
  });

  it("rejects out-of-range input (Req 3.11)", () => {
    expect(validateOpacityInput("150").ok).toBe(false);
    expect(validateOpacityInput("-5").ok).toBe(false);
  });
});
