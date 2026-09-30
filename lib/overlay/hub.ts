import type { OverlayEventName } from "./protocol";

/**
 * In-process fan-out from the simulator to attached OBS browser sources.
 *
 * The problem this solves: OBS runs its browser source inside its own embedded
 * CEF process, which shares nothing with the Chrome profile the simulator is
 * open in — no BroadcastChannel, no localStorage, no window handle. The only
 * thing both processes can reach is the server they both loaded the page from,
 * so the relay lives here.
 *
 * Deliberately in-memory. This is a single-process local app: the streamer
 * runs `npm run dev`, opens the simulator in Chrome and points OBS at the same
 * localhost. A session only has to outlive a connection, not a deploy. Running
 * this on serverless with more than one instance would need a real broker
 * (Redis, or Vercel's own pub/sub) — that is a deployment decision, not a
 * reason to add a broker to something running on a laptop.
 *
 * A session exists exactly while at least one subscriber is attached. That is
 * what keeps the map bounded without a sweeper: publishes never create
 * sessions, and the last unsubscribe deletes one.
 */

export interface OverlayFrame {
  event: OverlayEventName;
  /** Already-serialised JSON payload. */
  data: string;
}

export type OverlayListener = (frame: OverlayFrame) => void;

export interface OverlayHubLimits {
  /** Distinct keys with live subscribers. */
  maxSessions: number;
  /** Browser sources per key — a couple of scenes plus a preview tab. */
  maxListenersPerSession: number;
}

export const DEFAULT_HUB_LIMITS: OverlayHubLimits = {
  maxSessions: 32,
  maxListenersPerSession: 8,
};

export class OverlayHub {
  private sessions = new Map<string, Set<OverlayListener>>();
  /**
   * The last emote pack published per key.
   *
   * OBS attaches whenever the streamer switches scenes, long after the pack
   * was sent. Without retaining it, a source that connects mid-session
   * renders emote names as text until the streamer happens to change packs.
   */
  private packs = new Map<string, OverlayFrame>();

  constructor(private readonly limits: OverlayHubLimits = DEFAULT_HUB_LIMITS) {}

  /**
   * Attaches a browser source.
   *
   * Returns an unsubscribe function, or `null` when a limit is hit — the
   * caller turns that into a 503 rather than silently accepting a connection
   * that will never receive anything.
   */
  subscribe(key: string, listener: OverlayListener): (() => void) | null {
    const existing = this.sessions.get(key);

    if (existing && existing.size >= this.limits.maxListenersPerSession) {
      return null;
    }
    if (!existing && this.sessions.size >= this.limits.maxSessions) {
      return null;
    }

    const listeners = existing ?? new Set<OverlayListener>();
    listeners.add(listener);
    this.sessions.set(key, listeners);

    // Hand the newcomer whatever the pack was, before any chat arrives.
    const pack = this.packs.get(key);
    if (pack) {
      try {
        listener(pack);
      } catch {
        // A stream that dies on its first frame is handled by publish().
      }
    }

    let released = false;
    return () => {
      // Unsubscribe has to be idempotent: an aborted request can fire the
      // signal handler and the stream's cancel() for the same connection.
      if (released) return;
      released = true;

      const current = this.sessions.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.sessions.delete(key);
        // Nothing is watching; the next publisher sends its pack again.
        this.packs.delete(key);
      }
    };
  }

  /** Fans a frame out. Returns how many subscribers it reached. */
  publish(key: string, frame: OverlayFrame): number {
    if (frame.event === "emotes") this.packs.set(key, frame);

    const listeners = this.sessions.get(key);
    if (!listeners || listeners.size === 0) return 0;

    let delivered = 0;
    // Copy before iterating: a listener whose stream has closed unsubscribes
    // itself from inside this loop.
    for (const listener of [...listeners]) {
      try {
        listener(frame);
        delivered += 1;
      } catch {
        // A dead connection must not take the other browser sources down with
        // it. Drop it and keep going.
        listeners.delete(listener);
      }
    }
    if (listeners.size === 0) this.sessions.delete(key);
    return delivered;
  }

  /**
   * Whether another browser source could attach to this key right now.
   *
   * Split out so a route can refuse with a real status code before it has
   * opened a stream — erroring a ReadableStream after the 200 has gone out
   * just looks like a dropped connection to EventSource, which retries it
   * forever.
   */
  canSubscribe(key: string): boolean {
    const existing = this.sessions.get(key);
    if (existing) return existing.size < this.limits.maxListenersPerSession;
    return this.sessions.size < this.limits.maxSessions;
  }

  subscriberCount(key: string): number {
    return this.sessions.get(key)?.size ?? 0;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}

/**
 * Process-wide instance.
 *
 * Pinned to globalThis rather than a module-level `const` because `next dev`
 * re-evaluates modules on hot reload. A fresh hub per reload would strand
 * every live SSE connection on an orphaned instance: OBS stays connected,
 * publishes go to the new hub, and chat silently stops mid-stream.
 */
const globalRef = globalThis as typeof globalThis & {
  __streamerchatOverlayHub?: OverlayHub;
};

export function overlayHub(): OverlayHub {
  return (globalRef.__streamerchatOverlayHub ??= new OverlayHub());
}
