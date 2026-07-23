import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCanvasDrag } from "./useCanvasDrag";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasDragHarnessProps {
  snappingEnabled?: boolean;
  onGuides: (guides: unknown[]) => void;
  onTransform: (layerId: string, dx: number, dy: number, options?: { disableSnap?: boolean }) => void;
}

interface PointerCoordinates {
  clientX: number;
  clientY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

function CanvasDragHarness({
  snappingEnabled,
  onGuides,
  onTransform,
}: CanvasDragHarnessProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useCanvasDrag({
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    zoom: 1,
    onLayerTransform: onTransform,
    onSnapGuidesChange: onGuides,
    artboardBounds: { width: 100, height: 100 },
    snappingEnabled,
  });

  return (
    <div ref={containerRef} data-testid="canvas-drag-host">
      <svg aria-label="canvas">
        <g data-role="shapes" data-editable="true">
          <rect data-layer-id="dragged" />
          <rect data-layer-id="reference" />
        </g>
      </svg>
    </div>
  );
}

function setBoundingBox(element: SVGElement, box: BoundingBox): void {
  Object.defineProperty(element, "getBBox", {
    configurable: true,
    value: (): BoundingBox => box,
  });
}

function dispatchPointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  coordinates: PointerCoordinates,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: coordinates.clientX },
    clientY: { value: coordinates.clientY },
    ctrlKey: { value: coordinates.ctrlKey ?? false },
    metaKey: { value: coordinates.metaKey ?? false },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  target.dispatchEvent(event);
}

function configureDragGeometry(container: HTMLElement): SVGElement {
  const dragged = container.querySelector<SVGElement>("[data-layer-id='dragged']");
  const reference = container.querySelector<SVGElement>("[data-layer-id='reference']");
  if (!dragged || !reference) {
    throw new Error("Canvas drag test markup is incomplete.");
  }

  Object.defineProperty(container, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  setBoundingBox(dragged, { x: 0, y: 0, width: 10, height: 10 });
  setBoundingBox(reference, { x: 14, y: 50, width: 10, height: 10 });
  return dragged;
}

function beginMove(container: HTMLElement, dragged: SVGElement, coordinates: PointerCoordinates): void {
  dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
  dispatchPointer(container, "pointermove", { clientX: 4, clientY: 0 });
  dispatchPointer(container, "pointermove", coordinates);
}

describe("useCanvasDrag snapping preference", () => {
  it("defaults to snapping and Ctrl bypasses that enabled preference", () => {
    const onGuides = vi.fn<(guides: unknown[]) => void>();
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId, rerender } = render(
      <CanvasDragHarness onGuides={onGuides} onTransform={onTransform} />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    beginMove(container, dragged, { clientX: 10, clientY: 0 });
    expect(dragged.style.transform).toBe("translate(9px, 0px)");
    expect(onGuides).toHaveBeenLastCalledWith(expect.any(Array));

    dispatchPointer(container, "pointerup", { clientX: 10, clientY: 0 });
    expect(onTransform).toHaveBeenLastCalledWith("dragged", 9, 0, { disableSnap: true });

    rerender(<CanvasDragHarness onGuides={onGuides} onTransform={onTransform} />);
    const nextDragged = configureDragGeometry(container);
    beginMove(container, nextDragged, { clientX: 10, clientY: 0, ctrlKey: true });
    expect(nextDragged.style.transform).toBe("translate(10px, 0px)");
    expect(onGuides).toHaveBeenLastCalledWith([]);
  });

  it("bypasses snap movement and smart-guide updates when disabled", () => {
    const onGuides = vi.fn<(guides: unknown[]) => void>();
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        onGuides={onGuides}
        onTransform={onTransform}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    beginMove(container, dragged, { clientX: 10, clientY: 0 });

    expect(dragged.style.transform).toBe("translate(10px, 0px)");
    expect(onGuides).not.toHaveBeenCalled();

    dispatchPointer(container, "pointerup", { clientX: 10, clientY: 0 });
    expect(onTransform).toHaveBeenLastCalledWith("dragged", 10, 0, { disableSnap: true });
    expect(onGuides).not.toHaveBeenCalled();
  });

  it("clears active guides when snapping is turned off", () => {
    const onGuides = vi.fn<(guides: unknown[]) => void>();
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { rerender } = render(
      <CanvasDragHarness snappingEnabled onGuides={onGuides} onTransform={onTransform} />,
    );

    rerender(<CanvasDragHarness snappingEnabled={false} onGuides={onGuides} onTransform={onTransform} />);

    expect(onGuides).toHaveBeenLastCalledWith([]);
  });
});
