/**
 * Minimal typed event emitter.
 *
 * The audio and transcription layers are plain classes rather than React
 * hooks, so they need a way to notify the UI without importing React. This is
 * that, and nothing more — no wildcards, no once(), no bubbling.
 */
export class Emitter<Events> {
  private handlers: {
    [K in keyof Events]?: Set<(payload: Events[K]) => void>;
  } = {};

  /** Subscribes. Returns an unsubscribe function. */
  on<K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void,
  ): () => void {
    (this.handlers[event] ??= new Set()).add(handler);
    return () => {
      this.handlers[event]?.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    // Copy before iterating: a handler may unsubscribe itself.
    const listeners = this.handlers[event];
    if (!listeners) return;
    for (const handler of [...listeners]) {
      try {
        handler(payload);
      } catch (error) {
        // One bad subscriber must not break the others or stall the audio loop.
        console.error(`Emitter: handler for "${String(event)}" threw`, error);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}
