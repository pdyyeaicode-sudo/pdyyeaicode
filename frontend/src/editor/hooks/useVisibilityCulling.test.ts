/**
 * useVisibilityCulling.test.ts — Tests for visibility culling hook
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVisibilityCulling, type ViewportBounds } from "./useVisibilityCulling";
import type { DocumentLayer } from "../types/documentModel";

describe("useVisibilityCulling", () => {
  const viewport: ViewportBounds = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    zoom: 1,
  };

  it("should return all layers when culling disabled", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true } as any,
      { id: "layer2", kind: "rect", geometry: { type: "rect", x: 1000, y: 1000, width: 50, height: 30 }, editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, false));
    
    expect(result.current.size).toBe(2);
    expect(result.current.has("layer1")).toBe(true);
    expect(result.current.has("layer2")).toBe(true);
  });

  it("should return only visible layers", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true } as any,
      { id: "layer2", kind: "rect", geometry: { type: "rect", x: 1000, y: 1000, width: 50, height: 30 }, editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.size).toBe(1);
    expect(result.current.has("layer1")).toBe(true);
    expect(result.current.has("layer2")).toBe(false);
  });

  it("should include layers slightly outside viewport (margin)", () => {
    const layers: DocumentLayer[] = [
      // Just outside left edge (within margin)
      { id: "layer1", kind: "rect", geometry: { type: "rect", x: -80, y: 20, width: 50, height: 30 }, editable: true } as any,
      // Far outside left edge (beyond margin)
      { id: "layer2", kind: "rect", geometry: { type: "rect", x: -200, y: 20, width: 50, height: 30 }, editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.has("layer1")).toBe(true); // Within margin
    expect(result.current.has("layer2")).toBe(false); // Beyond margin
  });

  it("should handle image layers", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "image", x: 10, y: 20, width: 100, height: 80, href: "test.jpg", editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.has("layer1")).toBe(true);
  });

  it("should handle text layers", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "text", x: 10, y: 20, width: 100, height: 30, content: "Hello", editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.has("layer1")).toBe(true);
  });

  it("should handle ellipse layers", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "ellipse", geometry: { type: "ellipse", cx: 50, cy: 50, rx: 30, ry: 20 }, editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.has("layer1")).toBe(true);
  });

  it("should handle group layers with children", () => {
    const layers: DocumentLayer[] = [
      {
        id: "group1",
        kind: "group",
        editable: true,
        children: [
          { id: "child1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true } as any,
          { id: "child2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true } as any,
        ],
      } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.has("group1")).toBe(true);
    expect(result.current.has("child1")).toBe(true);
    expect(result.current.has("child2")).toBe(true);
  });

  it("should exclude group if all children are outside viewport", () => {
    const layers: DocumentLayer[] = [
      {
        id: "group1",
        kind: "group",
        editable: true,
        children: [
          { id: "child1", kind: "rect", geometry: { type: "rect", x: 2000, y: 2000, width: 50, height: 30 }, editable: true } as any,
          { id: "child2", kind: "rect", geometry: { type: "rect", x: 2100, y: 2100, width: 40, height: 60 }, editable: true } as any,
        ],
      } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, viewport, true));
    
    expect(result.current.has("group1")).toBe(false);
    expect(result.current.has("child1")).toBe(false);
    expect(result.current.has("child2")).toBe(false);
  });

  it("should return all layers when viewport is null", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true } as any,
      { id: "layer2", kind: "rect", geometry: { type: "rect", x: 1000, y: 1000, width: 50, height: 30 }, editable: true } as any,
    ];
    
    const { result } = renderHook(() => useVisibilityCulling(layers, null, true));
    
    expect(result.current.size).toBe(2);
  });

  it("should update when viewport changes", () => {
    const layers: DocumentLayer[] = [
      { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true } as any,
      { id: "layer2", kind: "rect", geometry: { type: "rect", x: 1000, y: 1000, width: 50, height: 30 }, editable: true } as any,
    ];
    
    const { result, rerender } = renderHook(
      ({ vp }) => useVisibilityCulling(layers, vp, true),
      { initialProps: { vp: viewport } }
    );
    
    expect(result.current.has("layer1")).toBe(true);
    expect(result.current.has("layer2")).toBe(false);
    
    // Pan viewport to show layer2
    const newViewport: ViewportBounds = {
      x: 900,
      y: 900,
      width: 800,
      height: 600,
      zoom: 1,
    };
    
    rerender({ vp: newViewport });
    
    expect(result.current.has("layer1")).toBe(false);
    expect(result.current.has("layer2")).toBe(true);
  });
});
