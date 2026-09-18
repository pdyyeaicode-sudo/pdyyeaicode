/**
 * pointerSample — which position an event actually reports.
 *
 * When input outruns the display, Chromium delivers several physical samples as a single
 * `pointermove` and exposes the individuals through `getCoalescedEvents()`. Direct
 * manipulation wants the most recent of those: the object should be where the pointer
 * IS, not where it was partway through the frame.
 *
 * The last entry is taken, never an average and never a replay of the whole list.
 * Averaging places the object behind the pointer. Replaying applies intermediate states
 * the display cannot show anyway, at the cost of doing the work several times. Both are
 * smoothing, and smoothing is latency — for a design editor the object FOLLOWS the
 * pointer, it does not ease toward it.
 *
 * ## Sub-pixel precision is preserved deliberately
 *
 * `clientX`/`clientY` are doubles. A pen, a precision trackpad and any zoomed view all
 * produce fractional deltas — at 4x zoom one screen pixel is a quarter of a document
 * pixel — and rounding anywhere on this path turns continuous manipulation into steps.
 * Nothing here rounds, and `browser-tests/subPixelFidelity.spec.ts` drives 0.25px
 * increments through the real editor to prove it end to end.
 *
 * The gesture-start threshold is a separate concern: it decides WHEN a gesture begins,
 * and once it has, every sample is applied at full precision.
 *
 * One responsibility per file: reading the newest position out of a pointer event.
 */

/** A position in client (viewport) coordinates, at full double precision. */
export interface PointerSample {
  readonly clientX: number;
  readonly clientY: number;
}

/** True when this engine exposes the higher-rate raw position stream. */
export function supportsRawPointerUpdates(): boolean {
  return typeof window !== "undefined" && "onpointerrawupdate" in window;
}

/**
 * The newest position `event` carries.
 *
 * Falls back to the event's own coordinates when the coalesced list is empty — which is
 * the case for synthetic events — or when the method is absent, as on engines that do
 * not implement it. That is a documented fallback, not an error path: on Chromium the
 * last coalesced sample and the event's own position normally agree, and taking the last
 * one is what makes that a guarantee rather than an assumption about one engine.
 */
export function newestPointerSample(event: PointerEvent | MouseEvent | TouchEvent): PointerSample {
  const candidate = event as PointerEvent & {
    getCoalescedEvents?: () => PointerEvent[];
  };
  if (typeof candidate.getCoalescedEvents === "function") {
    const samples = candidate.getCoalescedEvents();
    const newest = samples.length > 0 ? samples[samples.length - 1] : undefined;
    if (
      newest !== undefined
      && Number.isFinite(newest.clientX)
      && Number.isFinite(newest.clientY)
    ) {
      return { clientX: newest.clientX, clientY: newest.clientY };
    }
  }

  if ("changedTouches" in event && event.changedTouches.length > 0) {
    const touch = event.changedTouches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  const pointer = event as PointerEvent;
  return { clientX: pointer.clientX, clientY: pointer.clientY };
}
