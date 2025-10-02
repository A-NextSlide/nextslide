// Cross-browser friendly scheduling helpers

type IdleDeadlineLike = { didTimeout?: boolean; timeRemaining?: () => number };

const hasRIC = typeof window !== 'undefined' && 'requestIdleCallback' in window;

export function runWhenIdle(cb: () => void, timeoutMs: number = 32): number {
  if (hasRIC) {
    // @ts-ignore - requestIdleCallback exists at runtime when hasRIC is true
    return window.requestIdleCallback(cb as any, { timeout: timeoutMs } as any) as unknown as number;
  }
  // Fallback: schedule after a short delay to yield to input
  return window.setTimeout(cb, timeoutMs);
}

export function cancelIdle(id: number): void {
  if (hasRIC) {
    // @ts-ignore
    window.cancelIdleCallback(id);
    return;
  }
  clearTimeout(id);
}

// Schedule a microtask-like callback after next frame paint
export function afterNextFrame(cb: () => void): number {
  return requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

export function throttle<T extends (...args: any[]) => void>(fn: T, minIntervalMs: number): T {
  let lastTs = 0;
  let scheduled = false;
  let lastArgs: any[] | null = null;
  const wrapped = ((...args: any[]) => {
    lastArgs = args;
    const now = Date.now();
    if (!scheduled && now - lastTs >= minIntervalMs) {
      lastTs = now;
      fn.apply(null, lastArgs);
      lastArgs = null;
    } else if (!scheduled) {
      scheduled = true;
      const delay = Math.max(0, minIntervalMs - (now - lastTs));
      setTimeout(() => {
        lastTs = Date.now();
        scheduled = false;
        if (lastArgs) {
          fn.apply(null, lastArgs);
          lastArgs = null;
        }
      }, delay);
    }
  }) as T;
  return wrapped;
}



