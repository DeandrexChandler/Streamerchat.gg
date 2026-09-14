import type { IdleStage } from "../ai/provider";

/**
 * When to ask the AI for more, and how much.
 *
 * Deterministic on purpose. The engine decides that a batch is needed and how
 * big it should be; the network layer only carries the request. That keeps
 * the whole planning path testable with a scripted provider.
 */

/** Silence before chat stops reacting and starts noticing. */
export const IDLE_AFTER_MS = 60_000;

/**
 * How long a batch should last, in seconds of chat at the configured rate,
 * on top of however long the provider is taking to answer.
 *
 * Twenty seconds of chat per call keeps a long session inside a few dollars
 * — measured at four to six calls a minute at every tier. The latency term
 * is what keeps the room continuous when the provider is slow: a batch has
 * to outlast the wait for the next one, or the queue runs dry while the
 * refill is still on the wire. Gemini answered in about a second when the
 * model was chosen and in ten to fifteen on a bad day; the engine measures
 * which day it is and sizes accordingly. At the lowest tier the floor keeps
 * a batch from being a single line.
 */
/**
 * Twenty-four seconds gives the sizes the product asks for by tier —
 * about 10 / 14 / 28 / 42 / 56 / 70 at 0.2 through CHAOS with a quick
 * provider — and a slow one pushes each up.
 */
const BATCH_SECONDS = 24;
const MIN_BATCH = 10;
const MAX_BATCH = 70;

/**
 * Lines left in the queue when the next batch is requested: enough to
 * cover the provider's latency plus a margin, but never so many that the
 * refill fires the moment a batch lands.
 */
const LOW_WATER_MARGIN_S = 5;
const MIN_LOW_WATER = 2;
const LOW_WATER_MAX_SHARE = 0.75;

/** What to assume before any reply has been measured. */
export const INITIAL_LATENCY_MS = 4_000;

/**
 * How long to wait after a failed generation before asking again.
 *
 * Without this a dead key would be retried every tick. With it, an outage
 * costs one quiet stretch per attempt and the session keeps trying on its
 * own. Short, because the server already retried once before saying no:
 * by the time this fires two attempts have failed, and a third is likely
 * to succeed a few seconds later (Gemini's 503s are brief). Eight seconds
 * here, on top of a slow first call, was most of why a room could stay
 * quiet for a minute after Play.
 */
export const FAILURE_BACKOFF_MS = 3_000;

export function batchSizeFor(messagesPerSecond: number, latencyMs = INITIAL_LATENCY_MS): number {
  const seconds = BATCH_SECONDS + latencyMs / 1000;
  return Math.max(MIN_BATCH, Math.min(MAX_BATCH, Math.round(messagesPerSecond * seconds)));
}

export function lowWaterFor(messagesPerSecond: number, latencyMs = INITIAL_LATENCY_MS): number {
  const runway = Math.round(messagesPerSecond * (latencyMs / 1000 + LOW_WATER_MARGIN_S));
  const ceiling = Math.floor(batchSizeFor(messagesPerSecond, latencyMs) * LOW_WATER_MAX_SHARE);
  return Math.max(MIN_LOW_WATER, Math.min(runway, ceiling));
}

/**
 * Idle stages by silence.
 *
 * Coarse on purpose: each stage is a different prompt, and a stage change
 * invalidates the current batch. Boundaries far enough apart that chat
 * settles into one before moving on.
 */
const IDLE_STAGES: ReadonlyArray<readonly [afterMs: number, stage: IdleStage]> = [
  [600_000, 4],
  [300_000, 3],
  [150_000, 2],
  [IDLE_AFTER_MS, 1],
];

export function idleStageFor(silenceMs: number): IdleStage | null {
  for (const [afterMs, stage] of IDLE_STAGES) {
    if (silenceMs >= afterMs) return stage;
  }
  return null;
}
