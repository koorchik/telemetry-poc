/**
 * Simple pub/sub event bus for component communication.
 * Uses native EventTarget for zero dependencies.
 * @module browser/components/event-bus
 */

class TelemetryEventBus extends EventTarget {
  /**
   * Emit an event with optional detail payload.
   * @param {string} eventName
   * @param {Object} detail
   */
  emit(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  /**
   * Subscribe to an event.
   * @param {string} eventName
   * @param {Function} handler - Receives event detail as argument
   * @returns {Function} Unsubscribe function
   */
  on(eventName, handler) {
    const wrappedHandler = (e) => handler(e.detail);
    this.addEventListener(eventName, wrappedHandler);
    return () => this.removeEventListener(eventName, wrappedHandler);
  }

  /**
   * Subscribe once to an event.
   * @param {string} eventName
   * @param {Function} handler
   */
  once(eventName, handler) {
    const wrappedHandler = (e) => handler(e.detail);
    this.addEventListener(eventName, wrappedHandler, { once: true });
  }
}

export const eventBus = new TelemetryEventBus();
