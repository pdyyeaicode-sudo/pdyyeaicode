/**
 * debounce.test.ts — Tests for debounce utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce, throttle, rafBatch } from "./debounce";

describe("debounce utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("debounce", () => {
    it("should delay function execution", () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);
      
      debounced();
      expect(func).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it("should cancel previous call when called again", () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);
      
      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      
      expect(func).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(50);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments to function", () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);
      
      debounced("arg1", "arg2");
      vi.advanceTimersByTime(100);
      
      expect(func).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("should handle multiple rapid calls", () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);
      
      debounced();
      debounced();
      debounced();
      debounced();
      
      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
    });
  });

  describe("throttle", () => {
    it("should execute immediately on first call", () => {
      const func = vi.fn();
      const throttled = throttle(func, 100);
      
      throttled();
      expect(func).toHaveBeenCalledTimes(1);
    });

    it("should throttle subsequent calls", () => {
      const func = vi.fn();
      const throttled = throttle(func, 100);
      
      throttled(); // Immediate
      expect(func).toHaveBeenCalledTimes(1);
      
      throttled(); // Scheduled
      expect(func).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(2);
    });

    it("should allow execution after delay period", () => {
      const func = vi.fn();
      const throttled = throttle(func, 100);
      
      throttled();
      expect(func).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(100);
      
      throttled();
      expect(func).toHaveBeenCalledTimes(2);
    });

    it("should pass latest arguments", () => {
      const func = vi.fn();
      const throttled = throttle(func, 100);
      
      throttled("arg1");
      throttled("arg2");
      
      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenLastCalledWith("arg2");
    });
  });

  describe("rafBatch", () => {
    it("should batch multiple calls to single RAF", () => {
      const func = vi.fn();
      const batched = rafBatch(func);
      
      batched();
      batched();
      batched();
      
      expect(func).not.toHaveBeenCalled();
      
      // Simulate RAF callback
      vi.runAllTimers();
      expect(func).toHaveBeenCalledTimes(1);
    });

    it("should use latest arguments", () => {
      const func = vi.fn();
      const batched = rafBatch(func);
      
      batched("arg1");
      batched("arg2");
      batched("arg3");
      
      vi.runAllTimers();
      expect(func).toHaveBeenCalledWith("arg3");
    });

    it("should reset after RAF executes", () => {
      const func = vi.fn();
      const batched = rafBatch(func);
      
      batched();
      vi.runAllTimers();
      expect(func).toHaveBeenCalledTimes(1);
      
      batched();
      vi.runAllTimers();
      expect(func).toHaveBeenCalledTimes(2);
    });
  });
});
