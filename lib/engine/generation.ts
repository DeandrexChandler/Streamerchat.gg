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
 * How long a batch should last, in seconds of chat at the configured rate.
 *
 * Twenty seconds at the configured rate. Momentum pushes the real rate
 * above the setting during a busy stretch, so a batch drains in more like
 * fifteen — long enough that one call covers a moment, short enough that it
 * never goes stale before it is used. Measured on the harness with a
 * talkative script: four to six calls a minute at every tier, which is what
 * keeps a long session inside a few dollars. At the lowest tier the floor keeps a batch
 * from being a single line.
 */
const BATCH_SECONDS = 20;
const MIN_BATCH = 8;
const MAX_BATCH = 60;

/** Lines left in the queue when the next batch is requested. */
const LOW_WATER_SECONDS = 4;
const MIN_LOW_WATER = 2;

/**
 * How long to wait after a failed generation before asking again.
 *
 * Without this a dead key would be retried at the server's cooldown rate
 * forever. With it, an outage costs one quiet stretch per attempt and the
 * session keeps trying on its own.
 */
export const FAILURE_BACKOFF_MS = 8_000;

export function batchSizeFor(messagesPerSecond: number): number {
  return Math.max(MIN_BATCH, Math.min(MAX_BATCH, Math.round(messagesPerSecond * BATCH_SECONDS)));
}

export function lowWaterFor(messagesPerSecond: number): number {
  return Math.max(MIN_LOW_WATER, Math.round(messagesPerSecond * LOW_WATER_SECONDS));
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
