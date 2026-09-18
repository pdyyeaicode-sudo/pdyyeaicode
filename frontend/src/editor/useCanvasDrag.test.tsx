import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCanvasDrag } from "./useCanvasDrag";
import { createLiveTransformStore } from "./interaction/liveTransformStore";
import type { DragGestureEvent } from "./interaction/gestureChannel";

/**
 * A store whose "animation frame" runs immediately.
 *
 * In production the preview is written once per rAF, which is the whole point:
 * pointer handlers do arithmetic only. These tests dispatch pointer events
 * synchronously and assert the resulting attribute in the same tick, so they
 * supply a scheduler that fires inline. The value written is unchanged — only WHEN
 * it is written differs, and that timing is covered by
 * interaction/liveTransformStore.test.ts.
 */
function immediateStore() {
  return createLiveTransformStore({
    request: (callback) => {
      callback();
      return 0;
    },
    cancel: () => undefined,
  });
}

/** One store per mounted harness, so its identity is stable across renders. */
function useImmediateStore() {
  const ref = useRef<ReturnType<typeof immediateStore> | null>(null);
  if (ref.current === null) {
    ref.current = immediateStore();
  }
  return ref.current;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasDragHarnessProps {
  snappingEnabled?: boolean;
  zoom?: number;
  onGuides: (guides: unknown[]) => void;
  onTransform: (layerId: string, dx: number, dy: number, options?: { disableSnap?: boolean }) => void;
  onDragGesture?: (event: DragGestureEvent) => void;
}

interface PointerCoordinates {
  clientX: number;
  clientY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

function CanvasDragHarness({  snappingEnabled,
  zoom = 1,
  onGuides,
  onTransform,
  onDragGesture,
}: CanvasDragHarnessProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveStore = useImmediateStore();

  useCanvasDrag({
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    zoom,
    onLayerTransform: onTransform,
    onSnapGuidesChange: onGuides,
    artboardBounds: { width: 100, height: 100 },
    snappingEnabled,
    onDragGesture,
    liveTransforms: liveStore,
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
  it("commits a text-layer drag when the threshold is crossed on its first move", () => {
    const onGuides = vi.fn<(guides: unknown[]) => void>();
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId } = render(
      <CanvasDragHarness snappingEnabled={false} onGuides={onGuides} onTransform={onTransform} />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    // A normal human drag often produces just one pointermove before release.
    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 24, clientY: 12 });
    expect(dragged.getAttribute("transform")).toBe("translate(24 12)");

    dispatchPointer(container, "pointerup", { clientX: 24, clientY: 12 });
    expect(onTransform).toHaveBeenCalledWith("dragged", 24, 12, { disableSnap: true });
  });

  it("defaults to snapping and Ctrl bypasses that enabled preference", () => {
    const onGuides = vi.fn<(guides: unknown[]) => void>();
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId, rerender } = render(
      <CanvasDragHarness onGuides={onGuides} onTransform={onTransform} />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    beginMove(container, dragged, { clientX: 10, clientY: 0 });
    expect(dragged.getAttribute("transform")).toBe("translate(9 0)");
    expect(onGuides).toHaveBeenLastCalledWith(expect.any(Array));

    dispatchPointer(container, "pointerup", { clientX: 10, clientY: 0 });
    expect(onTransform).toHaveBeenLastCalledWith("dragged", 9, 0, { disableSnap: true });

    rerender(<CanvasDragHarness onGuides={onGuides} onTransform={onTransform} />);
    const nextDragged = configureDragGeometry(container);
    beginMove(container, nextDragged, { clientX: 10, clientY: 0, ctrlKey: true });
    expect(nextDragged.getAttribute("transform")).toBe("translate(10 0)");
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

    expect(dragged.getAttribute("transform")).toBe("translate(10 0)");
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


describe("useCanvasDrag live gesture reporting", () => {
  it("emits begin, move and end exactly once each, in order", () => {
    const events: DragGestureEvent[] = [];
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        onGuides={vi.fn()}
        onTransform={vi.fn()}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    // Below the 1px precision threshold: nothing has started yet.
    dispatchPointer(container, "pointermove", { clientX: 0.4, clientY: 0 });
    expect(events).toHaveLength(0);

    dispatchPointer(container, "pointermove", { clientX: 24, clientY: 12 });
    dispatchPointer(container, "pointermove", { clientX: 30, clientY: 15 });
    dispatchPointer(container, "pointerup", { clientX: 30, clientY: 15 });

    expect(events.map((event) => event.phase)).toEqual(["begin", "move", "move", "end"]);
    expect(events[0]).toEqual({ phase: "begin", layerId: "dragged", dx: 0, dy: 0 });
    expect(events[3]).toEqual({ phase: "end", layerId: "dragged", dx: 30, dy: 15 });
  });

  it("emits nothing when the gesture never crosses the drag threshold", () => {
    const events: DragGestureEvent[] = [];
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        onGuides={vi.fn()}
        onTransform={vi.fn()}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 0.5, clientY: 0.2 });
    dispatchPointer(container, "pointerup", { clientX: 0.5, clientY: 0.2 });

    // A click, not a drag. A subscriber must not see a stray begin/end pair.
    expect(events).toHaveLength(0);
  });

  it("registers a single-pixel nudge from a precision device", () => {
    const events: DragGestureEvent[] = [];
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        onGuides={vi.fn()}
        onTransform={onTransform}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 1, clientY: 0 });
    dispatchPointer(container, "pointerup", { clientX: 1, clientY: 0 });

    // One pixel is a deliberate nudge on a mouse or pen. The old 4px threshold
    // discarded it entirely.
    expect(events.map((event) => event.phase)).toEqual(["begin", "move", "end"]);
    expect(onTransform).toHaveBeenCalledWith("dragged", 1, 0, { disableSnap: true });
  });

  it("carries a sub-pixel offset once the gesture has started", () => {
    const events: DragGestureEvent[] = [];
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        zoom={8}
        onGuides={vi.fn()}
        onTransform={onTransform}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    // At zoom 8 a single screen pixel is 0.125 document px — below the old 0.5px
    // serialization grid, so this movement used to vanish entirely.
    dispatchPointer(container, "pointermove", { clientX: 2, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 3, clientY: 0 });
    dispatchPointer(container, "pointerup", { clientX: 3, clientY: 0 });

    const moves = events.filter((event) => event.phase === "move");
    expect(moves[moves.length - 1]?.dx).toBeCloseTo(0.375, 6);
    expect(onTransform).toHaveBeenCalledWith("dragged", 0.375, 0, { disableSnap: true });
  });

  it("reports offsets in document pixels, not screen pixels", () => {
    const events: DragGestureEvent[] = [];
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        zoom={2}
        onGuides={vi.fn()}
        onTransform={onTransform}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 40, clientY: 20 });
    dispatchPointer(container, "pointerup", { clientX: 40, clientY: 20 });

    // 40 screen px at zoom 2 is 20 document px. Emitting 40 here would move a
    // renderer twice as far as the pointer, and the mistake would be invisible
    // in any test that only covers zoom 1.
    const moves = events.filter((event) => event.phase === "move");
    expect(moves[moves.length - 1]).toEqual({
      phase: "move",
      layerId: "dragged",
      dx: 20,
      dy: 10,
    });
    // The reported offset is exactly what gets committed to the document.
    expect(onTransform).toHaveBeenCalledWith("dragged", 20, 10, { disableSnap: true });
  });

  it("reports the snapped offset, so a renderer shows what will be committed", () => {
    const events: DragGestureEvent[] = [];
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { getByTestId } = render(
      <CanvasDragHarness
        onGuides={vi.fn()}
        onTransform={onTransform}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    beginMove(container, dragged, { clientX: 10, clientY: 0 });
    dispatchPointer(container, "pointerup", { clientX: 10, clientY: 0 });

    // The reference edge at x = 14 snaps a 10px move to 9 (see the snapping
    // tests above). The gesture must report the snapped value, not the raw one.
    const moves = events.filter((event) => event.phase === "move");
    expect(moves[moves.length - 1]?.dx).toBe(9);
    expect(onTransform).toHaveBeenCalledWith("dragged", 9, 0, { disableSnap: true });
  });
});


/**
 * A harness whose container mounts on a LATER render, reproducing the real
 * sequence: SVGCanvas calls this hook before its own early return for a null
 * designOutput, so on first mount there is no container to attach to.
 */
function DeferredContainerHarness({
  ready,
  onTransform,
}: {
  ready: boolean;
  onTransform: CanvasDragHarnessProps["onTransform"];
}): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveStore = useImmediateStore();

  useCanvasDrag({
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    zoom: 1,
    onLayerTransform: onTransform,
    snappingEnabled: false,
    liveTransforms: liveStore,
  });

  if (!ready) {
    return null;
  }
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

describe("useCanvasDrag listener attachment", () => {
  it("attaches listeners when the container mounts on a later render", () => {
    const onTransform = vi.fn<CanvasDragHarnessProps["onTransform"]>();
    const { rerender, getByTestId } = render(
      <DeferredContainerHarness ready={false} onTransform={onTransform} />,
    );

    // The container did not exist on the first render. The listener effect has a
    // stable ref in its deps, so without a mount signal it would never run again
    // and dragging would be dead for the life of this component.
    rerender(<DeferredContainerHarness ready onTransform={onTransform} />);

    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);
    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 24, clientY: 12 });
    dispatchPointer(container, "pointerup", { clientX: 24, clientY: 12 });

    expect(onTransform).toHaveBeenCalledWith("dragged", 24, 12, { disableSnap: true });
  });

  it("removes the measurement badge and reverts when unmounted mid-drag", () => {
    const events: DragGestureEvent[] = [];
    const { getByTestId, unmount } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        onGuides={vi.fn()}
        onTransform={vi.fn()}
        onDragGesture={(event) => events.push(event)}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 24, clientY: 12 });
    expect(container.querySelector(".pydee-canvas-move-measurement")).not.toBeNull();

    unmount();

    // No orphaned badge, and subscribers are told to revert rather than being
    // left holding a stale offset.
    expect(document.querySelector(".pydee-canvas-move-measurement")).toBeNull();
    expect(events[events.length - 1]?.phase).toBe("cancel");
  });
});


describe("drag preview coordinate space", () => {
  /**
   * Fast guard for the formula, complementing the browser tests.
   *
   * jsdom computes no layout, so it cannot tell us whether a `px` translate on an
   * SVG child is scaled again by an ancestor `scale(zoom)` — that question is
   * answered in `browser-tests/dragCoordinateSpace.spec.ts`, measured in Chromium:
   * it IS scaled again. Given that, the preview must be written in DOCUMENT pixels.
   *
   * The preview is written to the `transform` ATTRIBUTE, not `style.transform`,
   * because an inline style overrides the attribute outright and would drop a
   * rotated layer's rotation for the duration of the drag
   * (browser-tests/nestedTransformDrag.spec.ts). jsdom reads attributes back
   * faithfully, so the value written is assertable here. That makes this the cheap
   * regression guard: re-introducing the `* zoom` factor fails in `npm test`
   * rather than only in the browser suite.
   */
  it("writes the document-space delta, not the screen-space delta", () => {
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        zoom={2}
        onGuides={vi.fn()}
        onTransform={vi.fn()}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 60, clientY: 20 });

    // 60 screen px at zoom 2 is 30 document px. The wrapper's scale(zoom) turns
    // that back into 60 screen px. Writing 60 here would travel 120.
    expect(dragged.getAttribute("transform")).toBe("translate(30 10)");
  });

  it("is unaffected by zoom when zoom is 1, which is why zoom must be varied", () => {
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        zoom={1}
        onGuides={vi.fn()}
        onTransform={vi.fn()}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 60, clientY: 20 });

    // Identical under both the correct and the incorrect formula. A suite that
    // only covered zoom 1 is exactly why the defect survived.
    expect(dragged.getAttribute("transform")).toBe("translate(60 20)");
  });

  it("re-resolves the element when the SVG subtree is replaced mid-drag", () => {
    const { getByTestId } = render(
      <CanvasDragHarness
        snappingEnabled={false}
        zoom={2}
        onGuides={vi.fn()}
        onTransform={vi.fn()}
      />,
    );
    const container = getByTestId("canvas-drag-host");
    const dragged = configureDragGeometry(container);

    dispatchPointer(dragged, "pointerdown", { clientX: 0, clientY: 0 });
    dispatchPointer(container, "pointermove", { clientX: 40, clientY: 0 });
    expect(dragged.getAttribute("transform")).toBe("translate(20 0)");

    // Simulate what React does: rebuild the markup, replacing the node the drag
    // captured at pointerdown. React renders from the DOCUMENT, which has not
    // changed mid-gesture, so the fresh node carries no preview — hence both the
    // style and the transform attribute are stripped from the clone.
    const svg = container.querySelector("svg")!;
    const group = svg.querySelector('[data-layer-id="dragged"]')!;
    const replacement = group.cloneNode(true) as SVGElement;
    replacement.removeAttribute("style");
    replacement.removeAttribute("transform");
    group.replaceWith(replacement);

    dispatchPointer(container, "pointermove", { clientX: 80, clientY: 0 });

    // The preview must follow onto the new node, not stay on the detached one.
    expect(replacement.getAttribute("transform")).toBe("translate(40 0)");
    expect(dragged.getAttribute("transform")).toBeNull();
  });
});
