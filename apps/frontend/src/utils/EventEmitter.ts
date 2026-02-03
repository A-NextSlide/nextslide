/**
 * Minimal browser-compatible EventEmitter.
 * Drop-in replacement for Node.js 'events' module in frontend code.
 */
export class EventEmitter {
  private _listeners: Record<string, ((...args: any[]) => void)[]> = {};

  on(event: string, fn: (...args: any[]) => void) {
    (this._listeners[event] ??= []).push(fn);
    return this;
  }

  off(event: string, fn: (...args: any[]) => void) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter(f => f !== fn);
    return this;
  }

  emit(event: string, ...args: any[]) {
    for (const fn of this._listeners[event] ?? []) fn(...args);
    return true;
  }

  listenerCount(event: string) {
    return (this._listeners[event] ?? []).length;
  }

  removeAllListeners(event?: string) {
    if (event) delete this._listeners[event];
    else this._listeners = {};
    return this;
  }
}

export default EventEmitter;
