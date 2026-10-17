

const WINDOW_POSITION_PERSIST_DEBOUNCE_MS = 350;
const systemClock$1 = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle)
};
class WindowPositionPersistence {
  constructor(persist, delayMs = WINDOW_POSITION_PERSIST_DEBOUNCE_MS, clock = systemClock$1) {
    this.persist = persist;
    this.delayMs = delayMs;
    this.clock = clock;
  }
  pending = null;
  timer = null;
  schedule(position) {
    this.pending = { ...position };
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.commitPending();
    }, this.delayMs);
  }
  flush() {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    this.commitPending();
  }
  commitPending() {
    const position = this.pending;
    this.pending = null;
    if (position) this.persist(position);
  }
}

export { WINDOW_POSITION_PERSIST_DEBOUNCE_MS, systemClock$1, WindowPositionPersistence };
