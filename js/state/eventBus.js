// ===========================================================
// EventBus — tiny pub/sub used to wire UI <-> engine together
// so any change (slider, console command, drag-drop) propagates
// instantly to whichever systems care, without tight coupling.
// ===========================================================

class EventBus {
  constructor() {
    this.listeners = new Map(); // eventName -> Set<fn>
  }

  on(eventName, fn) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(fn);
    return () => this.off(eventName, fn); // returns unsubscribe fn
  }

  off(eventName, fn) {
    const set = this.listeners.get(eventName);
    if (set) set.delete(fn);
  }

  emit(eventName, payload) {
    const set = this.listeners.get(eventName);
    if (!set) return;
    // copy to array in case a handler unsubscribes mid-emit
    [...set].forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${eventName}" threw:`, err);
      }
    });
  }
}

// Singleton shared across the whole app.
export const bus = new EventBus();
