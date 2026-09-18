import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CREATE_DRAG_THRESHOLD_PX,
  createShapeCreateSession,
  type ShapeCreateSession,
} from "./shapeCreateSession";
import type {
  ShapeCreateAppearance,
  ShapeCreateBridge,
  ShapeOutline,
} from "./shapeCreateBridge";

/**
 * The guarantees under test are about SEQUENCE, so they are asserted on the call log of
 * a recording bridge rather than on pixels:
 *
 *   zero commits during the drag, exactly one on release;
 *   a cancel commits nothing and leaves nothing in the engine;
 *   a press with no travel is a click, and never begins a gesture at all.
 *
 * The bridge is faked, not the engine: the real engine is exercised by
 * engine/tests/wasm_smoke_test.mjs, which asserts the same lifecycle against the actual
 * WASM module. Here the point is the ordering that TypeScript owns.
 */

const APPEARANCE: ShapeCreateAppearance = {
  fillArgb: 0xff3b82f6,
  strokeArgb: 0,
  strokeWidth: 0,
};

interface RecordingBridge extends ShapeCreateBridge {
  readonly calls: string[];
  /** Set to false to make `begin` refuse, as the engine does for an unknown kind. */
  acceptBegin: boolean;
  /** Set to null to make `update`/`commit` produce no outline. */
  nextOutline: ShapeOutline | null;
}

function makeBridge(): RecordingBridge {
  const calls: string[] = [];
  let active = false;
  const bridge: RecordingBridge = {
    calls,
    acceptBegin: true,
    nextOutline: { kind: "triangle", d: "M 0 0 L 10 10 Z", bounds: { x: 0, y: 0, width: 10, height: 10 } },
    clientToDocument: (x, y) => ({ x, y }),
    begin(shapeType, x, y) {
      calls.push(`begin ${shapeType} ${x},${y}`);
      if (!bridge.acceptBegin) {
        return false;
      }
      active = true;
      return true;
    },
    update(x, y, modifiers) {
      calls.push(
        `update ${x},${y} aspect=${modifiers.preserveAspect} centre=${modifiers.fromCenter}`,
      );
      return bridge.nextOutline;
    },
    preview: () => bridge.nextOutline,
    commit() {
      calls.push("commit");
      active = false;
      return bridge.nextOutline;
    },
    cancel() {
      calls.push("cancel");
      const wasActive = active;
      active = false;
      return wasActive;
    },
    isActive: () => active,
    setParameters: () => true,
    build: () => bridge.nextOutline,
  };
  return bridge;
}

describe("createShapeCreateSession", () => {
  let bridge: RecordingBridge;
  let committed: Array<{ outline: ShapeOutline; shapeType: string }>;
  let clicks: Array<{ x: number; y: number }>;
  let phases: string[];
  let session: ShapeCreateSession;

  beforeEach(() => {
    bridge = makeBridge();
    committed = [];
    clicks = [];
    phases = [];
    session = createShapeCreateSession({
      bridge,
      // Identity, so client coordinates ARE document coordinates in these tests and a
      // wrong number cannot hide behind a conversion.
      toDocument: (x, y) => ({ x, y }),
      onCommit: (outline, shapeType) => committed.push({ outline, shapeType }),
      onClick: (point) => clicks.push(point),
      onPhaseChange: (snapshot) => phases.push(snapshot.phase),
    });
  });

  it("starts idle and does nothing on a move it never saw a press for", () => {
    expect(session.snapshot().phase).toBe("idle");
    session.pointerMove(50, 50, { preserveAspect: false, fromCenter: false });
    expect(bridge.calls).toEqual([]);
  });

  it("does not begin an engine gesture until the press has travelled", () => {
    session.pointerDown("triangle", 20, 20, APPEARANCE);
    expect(session.snapshot().phase).toBe("arming");
    // A click on the canvas must not put an ephemeral node in the engine's scene.
    expect(bridge.calls).toEqual([]);

    session.pointerMove(20 + CREATE_DRAG_THRESHOLD_PX / 2, 20, {
      preserveAspect: false,
      fromCenter: false,
    });
    expect(bridge.calls).toEqual([]);
    expect(session.snapshot().phase).toBe("arming");
  });

  it("begins from the PRESS point, so the threshold consumes no travel", () => {
    session.pointerDown("triangle", 20, 20, APPEARANCE);
    session.pointerMove(60, 90, { preserveAspect: false, fromCenter: false });

    expect(bridge.calls[0]).toBe("begin triangle 20,20");
    expect(bridge.calls[1]).toBe("update 60,90 aspect=false centre=false");
  });

  it("commits exactly once, on release, and never during the drag", () => {
    session.pointerDown("triangle", 20, 20, APPEARANCE);
    for (const [x, y] of [
      [40, 50],
      [60, 70],
      [80, 90],
    ] as const) {
      session.pointerMove(x, y, { preserveAspect: false, fromCenter: false });
    }
    expect(bridge.calls.filter((call) => call === "commit")).toEqual([]);
    expect(committed).toEqual([]);

    session.pointerUp(80, 90, { preserveAspect: false, fromCenter: false });

    expect(bridge.calls.filter((call) => call === "commit")).toEqual(["commit"]);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.shapeType).toBe("triangle");
    expect(session.snapshot().phase).toBe("idle");
  });

  it("applies the release sample before committing", () => {
    // Otherwise the shape lands where the last animation frame happened to sample rather
    // than where the pointer was let go.
    session.pointerDown("triangle", 0, 0, APPEARANCE);
    session.pointerMove(10, 10, { preserveAspect: false, fromCenter: false });
    session.pointerUp(99, 77, { preserveAspect: false, fromCenter: false });

    const updates = bridge.calls.filter((call) => call.startsWith("update"));
    expect(updates[updates.length - 1]).toBe("update 99,77 aspect=false centre=false");
    expect(bridge.calls[bridge.calls.length - 1]).toBe("commit");
  });

  it("forwards the modifiers verbatim, because they are geometry", () => {
    session.pointerDown("rectangle", 0, 0, APPEARANCE);
    session.pointerMove(50, 20, { preserveAspect: true, fromCenter: true });
    expect(bridge.calls[bridge.calls.length - 1]).toBe("update 50,20 aspect=true centre=true");
  });

  it("treats a press and release with no travel as a click, not a zero-size shape", () => {
    session.pointerDown("triangle", 30, 30, APPEARANCE);
    session.pointerUp(30, 30, { preserveAspect: false, fromCenter: false });

    // No gesture was begun, so there is nothing to cancel and nothing to commit.
    expect(bridge.calls).toEqual([]);
    expect(committed).toEqual([]);
    expect(clicks).toEqual([{ x: 30, y: 30 }]);
    expect(session.snapshot().phase).toBe("idle");
  });

  it("cancels with no commit and no document change", () => {
    session.pointerDown("star", 10, 10, APPEARANCE);
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });
    session.cancel();

    expect(bridge.calls).toContain("cancel");
    expect(bridge.calls).not.toContain("commit");
    expect(committed).toEqual([]);
    expect(bridge.isActive()).toBe(false);
    expect(session.snapshot().phase).toBe("idle");
  });

  it("ignores a release that follows a cancel, so a gesture cannot commit twice", () => {
    session.pointerDown("star", 10, 10, APPEARANCE);
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });
    session.cancel();
    session.pointerUp(60, 60, { preserveAspect: false, fromCenter: false });

    expect(bridge.calls.filter((call) => call === "commit")).toEqual([]);
    expect(committed).toEqual([]);
  });

  it("is idempotent when cancelled twice", () => {
    session.pointerDown("star", 10, 10, APPEARANCE);
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });
    session.cancel();
    session.cancel();
    expect(bridge.calls.filter((call) => call === "cancel")).toHaveLength(1);
  });

  it("abandons a running gesture when a second press arrives", () => {
    session.pointerDown("star", 10, 10, APPEARANCE);
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });
    session.pointerDown("triangle", 200, 200, APPEARANCE);

    // Cancelled rather than left behind: an orphan outline would stay in the engine's
    // scene for the rest of the session.
    expect(bridge.calls).toContain("cancel");
    expect(bridge.calls.filter((call) => call === "commit")).toEqual([]);
    expect(session.snapshot().shapeType).toBe("triangle");
  });

  it("returns to idle when the engine refuses the gesture", () => {
    bridge.acceptBegin = false;
    session.pointerDown("no-such-shape", 10, 10, APPEARANCE);
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });

    expect(session.snapshot().phase).toBe("idle");
    // And no update is attempted against a gesture that never started.
    expect(bridge.calls.filter((call) => call.startsWith("update"))).toEqual([]);
  });

  it("commits nothing when the gesture produced no outline", () => {
    // A drag that shrinks back to a zero-extent box: the engine reports no outline, and
    // there is nothing to turn into a layer.
    bridge.nextOutline = null;
    session.pointerDown("triangle", 10, 10, APPEARANCE);
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });
    session.pointerUp(10, 10, { preserveAspect: false, fromCenter: false });

    expect(bridge.calls).toContain("commit");
    expect(committed).toEqual([]);
    expect(session.snapshot().outline).toBeNull();
  });

  it("refuses a press it cannot convert to a document point", () => {
    const offSurface = createShapeCreateSession({
      bridge,
      toDocument: () => null,
      onCommit: () => undefined,
    });
    expect(offSurface.pointerDown("triangle", 0, 0, APPEARANCE)).toBe(false);
    expect(bridge.calls).toEqual([]);
  });

  it("reports each phase change once, and not per frame", () => {
    session.pointerDown("triangle", 0, 0, APPEARANCE);
    session.pointerMove(50, 50, { preserveAspect: false, fromCenter: false });
    session.pointerMove(60, 60, { preserveAspect: false, fromCenter: false });
    session.pointerMove(70, 70, { preserveAspect: false, fromCenter: false });
    session.pointerUp(70, 70, { preserveAspect: false, fromCenter: false });

    // arming -> previewing -> idle. Three, for three transitions, not one per sample:
    // a per-frame notification would re-render React on the interaction hot path.
    expect(phases).toEqual(["arming", "previewing", "idle"]);
  });

  it("keeps coordinates in floating point", () => {
    session.pointerDown("triangle", 0.5, 0.25, APPEARANCE);
    session.pointerMove(10.0625, 20.125, { preserveAspect: false, fromCenter: false });
    expect(bridge.calls[0]).toBe("begin triangle 0.5,0.25");
    expect(bridge.calls[1]).toBe("update 10.0625,20.125 aspect=false centre=false");
  });

  it("does not warn on the normal no-outline case", () => {
    // A degenerate box at the start of every drag is expected, not a fault, so it must
    // not fill the console.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    bridge.nextOutline = null;
    session.pointerDown("triangle", 0, 0, APPEARANCE);
    session.pointerMove(5, 5, { preserveAspect: false, fromCenter: false });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
