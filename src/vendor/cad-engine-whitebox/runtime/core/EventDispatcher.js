export class EventDispatcher {
  constructor() {
    this._listeners = {};
  }

  addEventListener(type, listener) {
    if (!type || typeof listener !== 'function') return;
    if (!this._listeners[type]) {
      this._listeners[type] = [];
    }
    this._listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    const list = this._listeners[type];
    if (!list || !list.length) return;
    this._listeners[type] = list.filter((item) => item !== listener);
  }

  dispatchEvent(event) {
    if (!event || !event.type) return;
    const list = this._listeners[event.type];
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i += 1) {
      try {
        list[i](event);
      } catch {
        // ignore listener errors to keep render loop alive
      }
    }
  }
}
