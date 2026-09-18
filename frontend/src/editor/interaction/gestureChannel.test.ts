/**
 * Tests for the gesture channel.
 *
 * The properties that matter are the ones a drag depends on: every subscriber
 * sees every phase, unsubscribing during a dispatch cannot skip a sibling, and
 * one failing subscriber cannot strand the drag in another.
 */

import { describe, expect, it, vi } from "vitest";

import { createGestureChannel, type DragGestureEvent } from "./gestureChannel";

function moveEvent(dx: number, dy: number): DragGestureEvent {
  return { phase: "move", layerId: "layer-1", dx, dy };
}

describe("createGestureChannel", () => {
  it("delivers events to every subscriber", () => {
    const channel = createGestureChannel();
    const first: DragGestureEvent[] = [];
    const second: DragGestureEvent[] = [];

    channel.subscribe((event) => first.push(event));
    channel.subscribe((event) => second.push(event));

    channel.emit({ phase: "begin", layerId: "layer-1", dx: 0, dy: 0 });
    channel.emit(moveEvent(4, 8));

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[1]).toEqual({ phase: "move", layerId: "layer-1", dx: 4, dy: 8 });
  });

  it("stops delivering after unsubscribe", () => {
    const channel = createGestureChannel();
    const received: DragGestureEvent[] = [];
    const unsubscribe = channel.subscribe((event) => received.push(event));

    channel.emit(moveEvent(1, 1));
    unsubscribe();
    channel.emit(moveEvent(2, 2));

    expect(received).toHaveLength(1);
    expect(channel.listenerCount()).toBe(0);
  });

  it("still reaches later subscribers when one unsubscribes mid-dispatch", () => {
    const channel = createGestureChannel();
    const reached: string[] = [];

    const unsubscribeFirst = channel.subscribe(() => {
      reached.push("first");
      unsubscribeFirst();
    });
    channel.subscribe(() => reached.push("second"));

    channel.emit(moveEvent(1, 1));

    expect(reached).toEqual(["first", "second"]);
  });

  it("isolates a throwing subscriber so the drag reaches the others", () => {
    const onError = vi.fn();
    const channel = createGestureChannel(onError);
    const reached: string[] = [];

    channel.subscribe(() => {
      throw new Error("renderer exploded");
    });
    channel.subscribe(() => reached.push("survivor"));

    channel.emit(moveEvent(1, 1));

    expect(reached).toEqual(["survivor"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keeps two channels independent, so there is no shared global state", () => {
    const left = createGestureChannel();
    const right = createGestureChannel();
    const leftEvents: DragGestureEvent[] = [];

    left.subscribe((event) => leftEvents.push(event));
    right.emit(moveEvent(9, 9));

    expect(leftEvents).toHaveLength(0);
    expect(left.listenerCount()).toBe(1);
    expect(right.listenerCount()).toBe(0);
  });
});
