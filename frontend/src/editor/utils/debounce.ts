/**
 * debounce.ts — Debounce utility for performance optimization
 * 
 * Custom implementation to avoid lodash dependency.
 */

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function debounced(...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle: ensures function is called at most once per delay period
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function throttled(...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      // Call immediately
      lastCall = now;
      func(...args);
    } else {
      // Schedule for later
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * Request animation frame batching: batches updates to next frame
 */
export function rafBatch<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let latestArgs: Parameters<T> | null = null;
  
  return function batched(...args: Parameters<T>): void {
    latestArgs = args;
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (latestArgs !== null) {
          func(...latestArgs);
        }
        rafId = null;
        latestArgs = null;
      });
    }
  };
}
