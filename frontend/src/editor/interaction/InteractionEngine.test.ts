/**
 * Tests for the InteractionEngine.
 *
 * These pin the properties that make dragging feel continuous rather than
 * stepped, and that keep the document authoritative:
 *
 *  - many pointer samples collapse into one painted frame
 *  - a drag issues transform patches, never a scene rebuild
 *  - one gesture produces exactly one undoable transaction
 *  - cancelling restores the transforms the gesture started from
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY, translation, type Matrix2D } from "../renderer/matrix2d";
import { InteractionEngine, type GestureSurface, type ViewSettings } from "./InteractionEngine";

/**
 * Last element of an array. Written explicitly rather than with `Array.at`,
 * which this project's `lib` target does not include.
 */
function last<T>(items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[items.length - 1];
}

/** Records every call the engine makes into the surface. */
function makeFakeSurface() {
  const transforms: Array<{ id: string; matrix: Matrix2D }> = [];
  const translations: Array<{ id: string; dx: number; dy: number }> = [];
  let renders = 0;

  const surface: GestureSurface = {
    setNodeTransform(id, a, b, c, d, e, f) {
      transforms.push({ id, matrix: { a, b, c, d, e, f } });
      return true;
    },
    setNodeDocumentTranslation(id, dx, dy) {
      translations.push({ id, dx, dy });
      return true;
    },
    render() {
      renders += 1;
      return 1;
    },
  };

  return {
    surface,
    transforms,
    translations,
    get renders() {
      return renders;
    },
  };
}

/** Manual frame scheduler so frame boundaries are explicit in tests. */
function makeScheduler() {
  let pending: (() => void) | null = null;
  let nextHandle = 1;
  let cancelled = 0;

  return {
    requestFrame: (callback: () => void) => {
      pending = callback;
      return nextHandle++;
    },
    cancelFrame: () => {
      pending = null;
      cancelled += 1;
    },
    /** Run the pending frame, if one was scheduled. */
    flush(): boolean {
      const callback = pending;
      pending = null;
      if (callback === null) {
        return false;
      }
      callback();
      return true;
    },
    get hasPending() {
      return pending !== null;
    },
    get cancelledCount() {
      return cancelled;
    },
  };
}

const VIEW: ViewSettings = {
  viewTransform: IDENTITY,
  pixelRatio: 1,
  backgroundColor: 0xffffffff,
  useBackground: true,
};

let clock = 0;
const now = () => clock;

beforeEach(() => {
  clock = 0;
});

function makeEngine() {
  const fake = makeFakeSurface();
  const scheduler = makeScheduler();
  const engine = new InteractionEngine({
    surface: fake.surface,
    view: VIEW,
    requestFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
    now,
  });
  return { engine, fake, scheduler };
}

describe("InteractionEngine frame pacing", () => {
  it("collapses many pointer samples into a single painted frame", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    // Fourteen samples arrive before the display can present a frame.
    for (let i = 1; i <= 14; i += 1) {
      clock = i;
      engine.applyDelta(translation(i, 0));
    }
    expect(fake.renders).toBe(0);

    scheduler.flush();

    expect(fake.renders).toBe(1);
    // Only the newest transform is pushed, not one per sample.
    expect(fake.transforms).toHaveLength(1);
    expect(fake.transforms[0].matrix.e).toBe(14);

    const stats = engine.getStats();
    expect(stats.pointerSamples).toBe(14);
    expect(stats.framesRendered).toBe(1);
    expect(stats.coalescedSamples).toBe(13);
    expect(stats.lastFrame?.coalescedSamples).toBe(14);
  });

  it("renders once per frame across several frames", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    for (let frame = 0; frame < 3; frame += 1) {
      engine.applyDelta(translation(frame, 0));
      engine.applyDelta(translation(frame + 0.5, 0));
      scheduler.flush();
    }

    expect(fake.renders).toBe(3);
    expect(engine.getStats().framesRendered).toBe(3);
  });

  it("does not schedule a frame when no sample arrived", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    expect(scheduler.hasPending).toBe(false);
  });

  it("ignores samples outside a gesture", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.applyDelta(translation(10, 10));
    expect(scheduler.hasPending).toBe(false);
    expect(fake.renders).toBe(0);
  });
});

describe("InteractionEngine hot path", () => {
  it("patches transforms and never rebuilds the scene during a gesture", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    for (let i = 0; i < 40; i += 1) {
      clock = i;
      engine.applyDelta(translation(i, i));
      scheduler.flush();
    }

    const stats = engine.getStats();
    // Exactly one transform patch per painted frame.
    expect(stats.patchCalls).toBe(40);
    expect(fake.renders).toBe(40);
    // The decisive assertion: a drag must not re-serialise the document.
    expect(stats.sceneRebuildsDuringGesture).toBe(0);
  });

  it("reports a scene rebuild that happens during a gesture as a regression", () => {
    const { engine } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    engine.noteSceneRebuild();
    expect(engine.getStats().sceneRebuildsDuringGesture).toBe(1);
  });

  it("does not count rebuilds that happen outside a gesture", () => {
    const { engine } = makeEngine();
    engine.noteSceneRebuild();
    expect(engine.getStats().sceneRebuildsDuringGesture).toBe(0);
  });

  it("composes the delta onto each node's own base transform", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([
      { layerId: "a", baseTransform: translation(100, 0) },
      { layerId: "b", baseTransform: translation(0, 50) },
    ]);

    engine.applyDelta(translation(10, 10));
    scheduler.flush();

    const byId = new Map(fake.transforms.map((entry) => [entry.id, entry.matrix]));
    expect(byId.get("a")).toMatchObject({ e: 110, f: 10 });
    expect(byId.get("b")).toMatchObject({ e: 10, f: 60 });
  });

  it("supports setting one node's transform directly for handles", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    engine.setTransientTransform("a", { a: 2, b: 0, c: 0, d: 2, e: 5, f: 5 });
    scheduler.flush();

    expect(fake.transforms[0].matrix).toMatchObject({ a: 2, d: 2, e: 5, f: 5 });
    expect(engine.getTransientTransform("a")).toMatchObject({ a: 2, d: 2 });
  });
});

describe("InteractionEngine transactions", () => {
  it("produces one undoable transaction for a whole drag", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: translation(10, 10) }]);

    for (let i = 1; i <= 200; i += 1) {
      clock = i;
      engine.applyDelta(translation(i, 0));
      scheduler.flush();
    }

    clock = 250;
    const transaction = engine.endGesture();

    expect(transaction.layerIds).toEqual(["a"]);
    expect(transaction.before.get("a")).toMatchObject({ e: 10, f: 10 });
    expect(transaction.after.get("a")).toMatchObject({ e: 210, f: 10 });
    expect(transaction.unchanged).toBe(false);
    expect(transaction.pointerSamples).toBe(200);
    expect(transaction.framesRendered).toBe(200);
    expect(transaction.durationMs).toBe(250);
    expect(engine.isGestureActive()).toBe(false);
  });

  it("flags a gesture that moved nothing so no command is recorded", () => {
    const { engine } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: translation(10, 10) }]);
    const transaction = engine.endGesture();

    expect(transaction.unchanged).toBe(true);
    expect(transaction.before.get("a")).toEqual(transaction.after.get("a"));
  });

  it("treats a drag that returns to its origin as unchanged", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    engine.applyDelta(translation(50, 50));
    scheduler.flush();
    engine.applyDelta(IDENTITY);
    scheduler.flush();

    expect(engine.endGesture().unchanged).toBe(true);
  });

  it("restores the starting transforms when cancelled", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: translation(7, 7) }]);

    engine.applyDelta(translation(300, 300));
    scheduler.flush();
    expect(last(fake.transforms)?.matrix).toMatchObject({ e: 307, f: 307 });

    engine.cancelGesture();

    expect(last(fake.transforms)?.matrix).toMatchObject({ e: 7, f: 7 });
    expect(engine.isGestureActive()).toBe(false);
  });

  it("paints the released position and cancels the pending frame", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    engine.applyDelta(translation(5, 5));

    expect(scheduler.hasPending).toBe(true);
    engine.endGesture();
    // The final sample must not be dropped with the frame, or the drag would
    // visibly stutter back one frame on release.
    expect(last(fake.transforms)?.matrix).toMatchObject({ e: 5, f: 5 });
    expect(scheduler.hasPending).toBe(false);
  });
});

describe("InteractionEngine instrumentation", () => {
  it("measures input-to-render latency from the newest sample", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    clock = 100;
    engine.applyDelta(translation(1, 0));
    clock = 108; // frame runs 8ms after the sample
    scheduler.flush();

    expect(engine.getStats().lastFrame?.inputLatencyMs).toBe(8);
  });

  it("counts frames that exceed the frame budget", () => {
    const fake = makeFakeSurface();
    const scheduler = makeScheduler();
    // A surface whose render takes 40ms of simulated time.
    const slowSurface: GestureSurface = {
      setNodeTransform: fake.surface.setNodeTransform,
      render(...args) {
        clock += 40;
        return fake.surface.render(...args);
      },
    };
    const engine = new InteractionEngine({
      surface: slowSurface,
      view: VIEW,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      now,
    });

    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    engine.applyDelta(translation(1, 0));
    scheduler.flush();

    expect(engine.getStats().slowFrames).toBe(1);
    expect(engine.getStats().lastFrame?.frameDurationMs).toBe(40);
  });

  it("notifies a listener after each painted frame", () => {
    const fake = makeFakeSurface();
    const scheduler = makeScheduler();
    const onFramePainted = vi.fn();
    const engine = new InteractionEngine({
      surface: fake.surface,
      view: VIEW,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      now,
      onFramePainted,
    });

    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    engine.applyDelta(translation(1, 0));
    scheduler.flush();

    expect(onFramePainted).toHaveBeenCalledTimes(1);
    expect(onFramePainted.mock.calls[0][0]).toMatchObject({ patchCalls: 1, nodesDrawn: 1 });
  });

  it("stops scheduling after dispose", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    engine.applyDelta(translation(1, 0));
    engine.dispose();

    expect(scheduler.hasPending).toBe(false);
    expect(engine.isGestureActive()).toBe(false);
  });
});


describe("document-space translation path", () => {
  it("hands the offset to the engine instead of composing a matrix", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: translation(100, 100) }]);

    engine.setTransientTranslation("a", 12, -4);
    scheduler.flush();

    // The engine resolves the ancestor chain, so no matrix is composed here.
    expect(last(fake.translations)).toEqual({ id: "a", dx: 12, dy: -4 });
    expect(fake.transforms).toHaveLength(0);
  });

  it("coalesces many offsets into one painted frame", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    for (let step = 1; step <= 20; step += 1) {
      engine.setTransientTranslation("a", step, step);
    }
    expect(fake.renders).toBe(0);

    scheduler.flush();

    // One frame, one patch, carrying only the newest offset.
    expect(fake.renders).toBe(1);
    expect(fake.translations).toHaveLength(1);
    expect(fake.translations[0]).toEqual({ id: "a", dx: 20, dy: 20 });
  });

  it("reports the final offset in the transaction so the document can commit it", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    engine.setTransientTranslation("a", 3, 4);
    scheduler.flush();
    engine.setTransientTranslation("a", 30, 40);

    const transaction = engine.endGesture();
    expect(transaction.unchanged).toBe(false);
    expect(transaction.translations.get("a")).toEqual({ dx: 30, dy: 40 });
    expect(transaction.layerIds).toEqual(["a"]);
  });

  it("treats a zero offset as an unchanged gesture", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    engine.setTransientTranslation("a", 0, 0);
    scheduler.flush();

    expect(engine.endGesture().unchanged).toBe(true);
  });

  it("returns the node to its loaded transform when cancelled", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: translation(9, 9) }]);

    engine.setTransientTranslation("a", 250, 250);
    scheduler.flush();
    expect(last(fake.translations)).toEqual({ id: "a", dx: 250, dy: 250 });

    engine.cancelGesture();

    // A zero offset is what restores it: the loaded transform lives in the
    // engine, so it is not restorable from this side.
    expect(last(fake.translations)).toEqual({ id: "a", dx: 0, dy: 0 });
    expect(fake.transforms).toHaveLength(0);
  });

  it("never rebuilds the scene during a translation gesture", () => {
    const { engine, scheduler } = makeEngine();
    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);

    for (let step = 1; step <= 10; step += 1) {
      engine.setTransientTranslation("a", step, 0);
      scheduler.flush();
    }
    engine.endGesture();

    expect(engine.getStats().sceneRebuildsDuringGesture).toBe(0);
  });

  it("ignores offsets outside a gesture", () => {
    const { engine, fake, scheduler } = makeEngine();
    engine.setTransientTranslation("a", 5, 5);

    expect(scheduler.hasPending).toBe(false);
    scheduler.flush();
    expect(fake.translations).toHaveLength(0);
  });
});


describe("frame scheduling robustness", () => {
  it("keeps painting with a scheduler that runs its callback synchronously", () => {
    const fake = makeFakeSurface();
    const engine = new InteractionEngine({
      surface: fake.surface,
      view: {
        viewTransform: IDENTITY,
        pixelRatio: 1,
        backgroundColor: 0,
        useBackground: false,
      },
      // Some harnesses invoke the callback inline. If the pending handle were
      // recorded after that call, it would never clear and every frame after the
      // first would be silently dropped.
      requestFrame: (callback) => {
        callback();
        return 1;
      },
      cancelFrame: () => {},
      now: () => 0,
    });

    engine.beginGesture([{ layerId: "a", baseTransform: IDENTITY }]);
    for (let step = 1; step <= 5; step += 1) {
      engine.setTransientTranslation("a", step, 0);
    }

    expect(fake.renders).toBe(5);
    expect(last(fake.translations)).toEqual({ id: "a", dx: 5, dy: 0 });
  });
});
