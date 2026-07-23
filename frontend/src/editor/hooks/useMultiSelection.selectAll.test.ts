/**
 * useMultiSelection.selectAll.test.ts — Tests for selectAll() method (Task 1.5)
 * 
 * Validates that selectAll() correctly filters layers:
 * - Includes editable layers
 * - Excludes locked layers
 * - Excludes role-locked layers (logo, print-marks)
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiSelection } from "./useMultiSelection";
import type { SelectionSet, DocumentLayer } from "../types/documentModel";

describe("useMultiSelection.selectAll() (Task 1.5)", () => {
  function createLayer(overrides: Partial<DocumentLayer>): DocumentLayer {
    return {
      id: overrides.id || "layer-1",
      kind: overrides.kind || "rect",
      role: overrides.role || "shape",
      editable: overrides.editable !== undefined ? overrides.editable : true,
      locked: overrides.locked || false,
      visible: overrides.visible !== undefined ? overrides.visible : true,
      opacity: overrides.opacity || 1,
      ...overrides,
    } as DocumentLayer;
  }

  it("should select all editable layers", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true }),
      createLayer({ id: "layer-2", editable: true }),
      createLayer({ id: "layer-3", editable: true }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-2", "layer-3"],
      primaryLayerId: "layer-3", // Last layer becomes primary
    });
  });

  it("should exclude locked layers", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true, locked: false }),
      createLayer({ id: "layer-2", editable: true, locked: true }), // Locked
      createLayer({ id: "layer-3", editable: true, locked: false }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-3"],
      primaryLayerId: "layer-3",
    });
  });

  it("should exclude role-locked layers (logo)", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true, role: "headline" }),
      createLayer({ id: "layer-2", editable: true, role: "logo" }), // Logo locked by role
      createLayer({ id: "layer-3", editable: true, role: "body" }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-3"],
      primaryLayerId: "layer-3",
    });
  });

  it("should exclude role-locked layers (print-marks)", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true, role: "headline" }),
      createLayer({ id: "layer-2", editable: true, role: "print-marks" }), // Print marks locked by role
      createLayer({ id: "layer-3", editable: true, role: "cta" }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-3"],
      primaryLayerId: "layer-3",
    });
  });

  it("should exclude non-editable layers", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true }),
      createLayer({ id: "layer-2", editable: false }), // Not editable
      createLayer({ id: "layer-3", editable: true }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-3"],
      primaryLayerId: "layer-3",
    });
  });

  it("should handle mixed scenarios correctly", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "headline", editable: true, role: "headline" }), // ✓ Selectable
      createLayer({ id: "logo", editable: true, role: "logo" }), // ✗ Role-locked
      createLayer({ id: "locked-text", editable: true, locked: true }), // ✗ Locked
      createLayer({ id: "background", editable: false, role: "background" }), // ✗ Not editable
      createLayer({ id: "cta", editable: true, role: "cta" }), // ✓ Selectable
      createLayer({ id: "print", editable: true, role: "print-marks" }), // ✗ Role-locked
      createLayer({ id: "body", editable: true, role: "body" }), // ✓ Selectable
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["headline", "cta", "body"],
      primaryLayerId: "body",
    });
  });

  it("should handle empty layer list", () => {
    const layers: DocumentLayer[] = [];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: [],
      primaryLayerId: undefined,
    });
  });

  it("should replace existing selection", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true }),
      createLayer({ id: "layer-2", editable: true }),
      createLayer({ id: "layer-3", editable: true }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: ["layer-1"], primaryLayerId: "layer-1" }, // Pre-existing selection
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-2", "layer-3"],
      primaryLayerId: "layer-3",
    });
  });

  it("should select only editable layers when all have different properties", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "visible-rect", kind: "rect", editable: true, visible: true }),
      createLayer({ id: "hidden-text", kind: "text", editable: true, visible: false }), // Hidden but selectable
      createLayer({ id: "locked-image", kind: "image", editable: true, locked: true }), // Locked - not selectable
      createLayer({ id: "logo-layer", kind: "image", editable: true, role: "logo" }), // Role-locked - not selectable
      createLayer({ id: "editable-ellipse", kind: "ellipse", editable: true }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["visible-rect", "hidden-text", "editable-ellipse"],
      primaryLayerId: "editable-ellipse",
    });
  });

  it("should set primaryLayerId to last layer when single layer is selectable", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "only-layer", editable: true }),
    ];

    const onSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    act(() => {
      result.current.selectAll();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["only-layer"],
      primaryLayerId: "only-layer",
    });
  });
});
