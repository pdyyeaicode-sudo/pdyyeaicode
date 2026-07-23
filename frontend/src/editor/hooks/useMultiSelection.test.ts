/**
 * useMultiSelection — unit tests
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useMultiSelection } from "./useMultiSelection";
import type { SelectionSet, DocumentLayer } from "../types/documentModel";

const mockLayers: DocumentLayer[] = [
  {
    id: "layer1",
    kind: "rect",
    role: "shapes",
    name: "Rectangle 1",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    field: "rect1",
    geometry: { type: "rect", x: 0, y: 0, width: 100, height: 100 },
  },
  {
    id: "layer2",
    kind: "rect",
    role: "shapes",
    name: "Rectangle 2",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    field: "rect2",
    geometry: { type: "rect", x: 100, y: 100, width: 100, height: 100 },
  },
  {
    id: "layer3",
    kind: "rect",
    role: "shapes",
    name: "Rectangle 3",
    editable: true,
    locked: true, // Locked layer
    visible: true,
    opacity: 100,
    field: "rect3",
    geometry: { type: "rect", x: 200, y: 200, width: 100, height: 100 },
  },
  {
    id: "logo1",
    kind: "image",
    role: "logo", // Role-locked layer
    name: "Logo",
    editable: false,
    locked: true,
    visible: true,
    opacity: 100,
    href: "data:image/png;base64,test",
    x: 300,
    y: 300,
    width: 50,
    height: 50,
  },
] as DocumentLayer[];

describe("useMultiSelection", () => {
  it("should add layer to selection", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = { layerIds: [] };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    act(() => {
      result.current.add("layer1");
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer1"],
      primaryLayerId: "layer1",
    });
  });

  it("should not add layer if already selected", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = { layerIds: ["layer1"], primaryLayerId: "layer1" };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    act(() => {
      result.current.add("layer1");
    });

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("should remove layer from selection", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = {
      layerIds: ["layer1", "layer2"],
      primaryLayerId: "layer2",
    };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    act(() => {
      result.current.remove("layer2");
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer1"],
      primaryLayerId: "layer1",
    });
  });

  it("should toggle layer in selection", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = { layerIds: ["layer1"], primaryLayerId: "layer1" };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    // Toggle unselected layer (add)
    act(() => {
      result.current.toggle("layer2");
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer1", "layer2"],
      primaryLayerId: "layer2",
    });
  });

  it("should clear selection", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = {
      layerIds: ["layer1", "layer2"],
      primaryLayerId: "layer2",
    };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    act(() => {
      result.current.clear();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: [],
      primaryLayerId: undefined,
    });
  });

  it("should select all editable layers excluding locked and role-locked", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = { layerIds: [] };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    act(() => {
      result.current.selectAll();
    });

    // Should only select layer1 and layer2 (layer3 is locked, logo1 is role-locked)
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer1", "layer2"],
      primaryLayerId: "layer2",
    });
  });

  it("should replace selection with single layer", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = {
      layerIds: ["layer1", "layer2"],
      primaryLayerId: "layer2",
    };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    act(() => {
      result.current.replaceWith("layer3");
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer3"],
      primaryLayerId: "layer3",
    });
  });

  it("should check if layer is selected", () => {
    const onSelectionChange = vi.fn();
    const selection: SelectionSet = {
      layerIds: ["layer1", "layer2"],
      primaryLayerId: "layer2",
    };

    const { result } = renderHook(() =>
      useMultiSelection({ selection, onSelectionChange, layers: mockLayers })
    );

    expect(result.current.isSelected("layer1")).toBe(true);
    expect(result.current.isSelected("layer2")).toBe(true);
    expect(result.current.isSelected("layer3")).toBe(false);
  });
});
