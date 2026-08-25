import type { ChatMessage, PendingMessage } from "./types";

/**
 * Releases messages at wall-clock times.
 *
 * Everything the user ever sees passes through here, which makes this the one
 * place that enforces the global rate limit and the one place the OBS overlay
 * needs to subscribe to. The director can be as enthusiastic as it likes; the
 * scheduler is what guarantees the UI never floods.
 *
 * Deliberately clock-agnostic: `tick(now)` is driven by the caller, so tests
 * can step time forward instantly instead of waiting on real timers.
 */
export class Scheduler {
  /** Sorted ascending by `at`. Bursts are small, so insertion sort is fine. */
  private queue: ChatMessage[] = [];

  /** Release timestamps inside the current rate-limit window. */
  private released: number[] = [];

  constructor(private maxPerMinute: number) {}

  get pending(): number {
    return this.queue.length;
  }

  setRateLimit(maxPerMinute: number): void {
    this.maxPerMinute = Math.max(1, maxPerMinute);
  }

  /** Queues a burst, resolving each message's offset against `startAt`. */
  enqueueBurst(messages: readonly PendingMessage[], startAt: number): void {
    for (const message of messages) {
      const { offset, ...rest } = message;
      this.insert({ ...rest, at: startAt + offset });
    }
  }

  enqueueAt(message: PendingMessage, at: number): void {
    const { offset, ...rest } = message;
    this.insert({ ...rest, at: at + offset });
  }

  private insert(message: ChatMessage): void {
    let low = 0;
    let high = this.queue.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.queue[mid].at <= message.at) low = mid + 1;
      else high = mid;
    }
    this.queue.splice(low, 0, message);
  }

  /**
   * Returns every message due at or before `now`, oldest first.
   *
   * Messages held back by the rate limit stay queued and are re-offered on a
   * later tick rather than being dropped — a hype spike gets stretched out, not
   * truncated.
   */
  tick(now: number): ChatMessage[] {
    this.released = this.released.filter((t) => now - t < 60_000);

    const out: ChatMessage[] = [];
    while (this.queue.length > 0 && this.queue[0].at <= now) {
      if (this.released.length >= this.maxPerMinute) break;
      const message = this.queue.shift()!;
      this.released.push(now);
      out.push(message);
    }
    return out;
  }

  /**
   * Drops everything still queued. Used when the streamer interrupts — a
   * reaction to what they said 8 seconds ago is worse than no reaction, so a
   * new utterance flushes the tail of the previous burst.
   */
  flush(): void {
    this.queue = [];
  }

  /** Drops queued messages beyond `keepMs` in the future. */
  trimBeyond(now: number, keepMs: number): void {
    this.queue = this.queue.filter((m) => m.at <= now + keepMs);
  }

  reset(): void {
    this.queue = [];
    this.released = [];
  }
}
