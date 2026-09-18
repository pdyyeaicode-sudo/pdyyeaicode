/**
 * liveTransformStore tests.
 *
 * The behaviours worth pinning are the three that make the hot path cheap and
 * correct: many samples in one frame produce ONE notification, `end` is
 * synchronous so no frame can apply the preview on top of the commit, and a
 * throwing listener cannot strand the gesture in another renderer.
 */

import { describe, expect, it, vi } from "vitest";

import {
  createLiveTransformStore,
  type FrameScheduler,
  type LiveTransform,
} from "./liveTransformStore";
import { IDENTITY, translation } from "../renderer/matrix2d";

/** A scheduler whose frames only run when the test says so. */
function manualScheduler(): FrameScheduler & { runFrame: () => void; pending: () => number } {
  const queue = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    request(callback) {
      const handle = nextHandle++;
      queue.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    runFrame() {
      const entries = [...queue.entries()];
      queue.clear();
      for (const [, callback] of entries) {
        callback();
      }
    },
    pending() {
      return queue.size;
    },
  };
}

const sample = (dx: number, dy: number): LiveTransform => ({
  layerId: "layer-1",
  kind: "move",
  localTransform: translation(dx, dy),
  worldDelta: { dx, dy },
  localBounds: null,
  corners: null,
});

describe("rAF coalescing", () => {
  it("notifies once per frame however many samples arrive", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    for (let index = 1; index <= 60; index += 1) {
      store.set(sample(index, 0));
    }
    // Nothing has been delivered yet: pointer handlers did no rendering work.
    expect(listener).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(1);

    scheduler.runFrame();

    // One notification for sixty samples, carrying the LATEST state.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ worldDelta: { dx: 60, dy: 0 } });
  });

  it("schedules a new frame after the previous one ran", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(sample(1, 0));
    scheduler.runFrame();
    store.set(sample(2, 0));
    scheduler.runFrame();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toMatchObject({ worldDelta: { dx: 2, dy: 0 } });
  });

  it("delivers every sample when the scheduler runs callbacks synchronously", () => {
    // A synchronously-invoking scheduler (a test harness, or setTimeout under fake
    // timers) used to break coalescing: the callback cleared the handle, then
    // `request` returned and re-assigned it, so the store thought a frame was still
    // outstanding and dropped every sample after the first.
    const inline: FrameScheduler = {
      request: (callback) => {
        callback();
        return 0;
      },
      cancel: () => undefined,
    };
    const store = createLiveTransformStore(inline);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(sample(1, 0));
    store.set(sample(2, 0));
    store.set(sample(3, 0));

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2][0]).toMatchObject({ worldDelta: { dx: 3, dy: 0 } });
  });

  it("peek returns the newest state without waiting for a frame", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    store.set(sample(7, 3));
    expect(store.peek()).toMatchObject({ worldDelta: { dx: 7, dy: 3 } });
  });

  it("flush delivers a pending frame immediately and only once", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(sample(4, 4));
    store.flush();
    expect(listener).toHaveBeenCalledTimes(1);

    // The frame was cancelled by the flush, so running it changes nothing.
    scheduler.runFrame();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("flush is a no-op when nothing is pending", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    store.flush();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("end is synchronous", () => {
  it("clears the preview in the same task, with no frame in between", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(sample(10, 0));
    store.end();

    // Delivered immediately with null. Deferring this to the next frame would let
    // that frame apply the preview ON TOP of the committed document position, so
    // the object would jump by twice the drag and settle back.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBeNull();
    expect(store.peek()).toBeNull();
  });

  it("cancels the pending frame so no stale state is delivered after it", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(sample(10, 0));
    store.end();
    scheduler.runFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBeNull();
  });

  it("is a no-op when idle, so a stray pointerup cannot clear twice", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const listener = vi.fn();
    store.subscribe(listener);
    store.end();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("listener isolation", () => {
  it("a throwing listener does not prevent the others from being notified", () => {
    const scheduler = manualScheduler();
    const onError = vi.fn();
    const store = createLiveTransformStore(scheduler, onError);
    const healthy = vi.fn();

    store.subscribe(() => {
      throw new Error("renderer exploded");
    });
    store.subscribe(healthy);

    store.set(sample(5, 5));
    scheduler.runFrame();

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("unsubscribing during dispatch cannot skip another listener", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    const second = vi.fn();
    let unsubscribeFirst = (): void => {};
    unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);

    store.set(sample(1, 1));
    scheduler.runFrame();

    expect(second).toHaveBeenCalledTimes(1);
    expect(store.listenerCount()).toBe(1);
  });

  it("reports its listener count so wiring is assertable", () => {
    const store = createLiveTransformStore(manualScheduler());
    expect(store.listenerCount()).toBe(0);
    const unsubscribe = store.subscribe(() => {});
    expect(store.listenerCount()).toBe(1);
    unsubscribe();
    expect(store.listenerCount()).toBe(0);
  });
});

describe("the state it carries", () => {
  it("keeps the matrix, the displacement and the corners as separate facts", () => {
    const scheduler = manualScheduler();
    const store = createLiveTransformStore(scheduler);
    store.set({
      layerId: "l",
      kind: "resize",
      localTransform: IDENTITY,
      worldDelta: { dx: 0, dy: 0 },
      localBounds: { x: 1, y: 2, width: 30, height: 40 },
      corners: [
        { x: 1, y: 2 },
        { x: 31, y: 2 },
        { x: 31, y: 42 },
        { x: 1, y: 42 },
      ],
    });
    const state = store.peek();
    // A resize has no displacement but does have new bounds and new corners; a move
    // is the reverse. None of them is derived from another, which is why all three
    // are carried rather than reconstructed by whoever needs one.
    expect(state?.worldDelta).toEqual({ dx: 0, dy: 0 });
    expect(state?.localBounds).toEqual({ x: 1, y: 2, width: 30, height: 40 });
    expect(state?.corners?.length).toBe(4);
    expect(state?.kind).toBe("resize");
  });
});
