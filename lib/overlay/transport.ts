import type { ChatMessage } from "@/lib/engine/types";
import { MAX_MESSAGES_PER_PUBLISH } from "./protocol";

/**
 * Client side of the OBS relay: batches released messages and posts them to
 * the server, which fans them out to attached browser sources.
 *
 * A plain class, not a hook. It is driven by the simulator's existing 200ms
 * tick, so it needs no timers of its own, and keeping it out of React means
 * a re-render can never drop a batch or open a second publisher.
 *
 * Three behaviours are worth knowing about:
 *
 *  1. **Nothing is sent while nobody is watching.** Every publish response
 *     reports the live subscriber count. At zero the transport stops posting
 *     chat and falls back to an empty probe every few seconds, purely to learn
 *     when a browser source shows up. Running the simulator with no overlay
 *     attached costs one small request every 3 seconds, not five a second.
 *
 *  2. **A backlog is dropped, never replayed.** If a post fails or nobody is
 *     listening, the queued messages are discarded rather than flushed later.
 *     This is the same rule the engine applies when the streamer interrupts:
 *     chat reacting to something said thirty seconds ago is worse than chat
 *     that missed it.
 *
 *  3. **Failures back off.** A dead server degrades to an occasional retry.
 *     The simulator itself never blocks on any of this.
 */

/** How often a probe is sent while no browser source is attached. */
const IDLE_PROBE_MS = 3_000;

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;

export interface OverlayTransportOptions {
  key: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export class OverlayTransport {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  private queue: ChatMessage[] = [];
  private clearPending = false;
  private inFlight = false;
  /**
   * Negative infinity, not 0: a transport constructed at t=0 in a test — or
   * simply on a fast-starting page — must consider its first probe overdue,
   * not wait out a full idle interval before saying hello.
   */
  private lastPostAt = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private nextAttemptAt = 0;

  /** Browser sources attached as of the last response. */
  private attached = 0;

  constructor(private readonly options: OverlayTransportOptions) {
    this.endpoint = options.endpoint ?? "/api/overlay/publish";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get subscribers(): number {
    return this.attached;
  }

  /** Queues messages the scheduler has just released. */
  push(messages: readonly ChatMessage[]): void {
    if (messages.length === 0) return;
    this.queue.push(...messages);

    // Bound the queue even if flushes are failing. Newest wins: if only some
    // messages can go out, the recent ones are the ones still worth showing.
    if (this.queue.length > MAX_MESSAGES_PER_PUBLISH) {
      this.queue = this.queue.slice(-MAX_MESSAGES_PER_PUBLISH);
    }
  }

  /** Wipes the overlay. Sent even when no messages are pending. */
  clear(): void {
    this.queue = [];
    this.clearPending = true;
  }

  /**
   * Sends whatever is due. Safe to call every tick; returns immediately when
   * there is nothing to do, a request is in flight, or backoff is active.
   */
  flush(now: number = Date.now()): void {
    if (this.inFlight || now < this.nextAttemptAt) return;

    const idle = this.attached === 0 && !this.clearPending;
    const dueForProbe = now - this.lastPostAt >= IDLE_PROBE_MS;

    if (idle) {
      // Nobody is watching. Drop the backlog rather than banking it, and only
      // reach out often enough to notice a browser source connecting.
      this.queue = [];
      if (!dueForProbe) return;
    } else if (this.queue.length === 0 && !this.clearPending) {
      return;
    }

    const messages = this.queue;
    const clear = this.clearPending;
    this.queue = [];
    this.clearPending = false;

    this.inFlight = true;
    this.lastPostAt = now;

    void this.post(messages, clear, now);
  }

  private async post(
    messages: readonly ChatMessage[],
    clear: boolean,
    now: number,
  ): Promise<void> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: this.options.key, messages, clear }),
        // The tab can be closed mid-flush; this is fire-and-forget either way.
        cache: "no-store",
      });

      if (!response.ok) {
        this.fail(now);
        return;
      }

      const body = (await response.json()) as { subscribers?: number };
      this.attached = Math.max(0, Number(body?.subscribers) || 0);
      this.failures = 0;
      this.nextAttemptAt = 0;
    } catch {
      this.fail(now);
    } finally {
      this.inFlight = false;

      // A clear raised while this post was in flight has no tick left to carry
      // it: clear() also stops the simulator. Without this, the browser source
      // stays frozen showing the messages the streamer just wiped.
      if (this.clearPending) this.flush(Date.now());
    }
  }

  private fail(now: number): void {
    this.failures += 1;
    // Assume nothing is attached until a response says otherwise, so a long
    // outage settles into the cheap probe cadence.
    this.attached = 0;
    const delay = Math.min(
      BACKOFF_MAX_MS,
      BACKOFF_BASE_MS * 2 ** Math.min(this.failures - 1, 6),
    );
    this.nextAttemptAt = now + delay;
  }
}
