/**
 * How many people are talking, and how often one of them may speak again.
 *
 * The displayed viewer count and the speaking roster are different things.
 * A real stream with a thousand viewers has a dozen people talking, drawn
 * from a huge silent pool. The roster is that dozen: small enough that the
 * same names recur and the streamer learns who they are, which is most of
 * what makes a chat feel like a room rather than a feed.
 */

/** Never more visible personalities than this, at any tier. */
export const MAX_ROSTER = 10;

/**
 * Roster size by tier.
 *
 * The slowest tier is a handful of regulars; everything from one a second up
 * is the full ten, reused more heavily as the rate climbs.
 */
const ROSTER_BY_RATE: ReadonlyArray<readonly [rate: number, size: number]> = [
  [0.2, 5],
  [0.5, 8],
  [1, 10],
  [1.5, 10],
  [2, 10],
  [4, 10],
];

export function rosterSizeFor(messagesPerSecond: number): number {
  let best = ROSTER_BY_RATE[0];
  for (const entry of ROSTER_BY_RATE) {
    if (Math.abs(entry[0] - messagesPerSecond) < Math.abs(best[0] - messagesPerSecond)) {
      best = entry;
    }
  }
  return Math.min(MAX_ROSTER, best[1]);
}

/**
 * How long a viewer sits out after speaking.
 *
 * Thirty seconds is about right for a slow stream: one person does not post
 * twice in half a minute unless something is happening. It cannot hold at
 * speed — ten people at four messages a second is one message each every
 * two and a half seconds — so the cooldown scales with the room's throughput
 * and floors where a burst stops reading as one person spamming.
 */
const COOLDOWN_CEILING_MS = 30_000;
const COOLDOWN_FLOOR_MS = 1_000;

export function speakingCooldownFor(messagesPerSecond: number): number {
  const roster = rosterSizeFor(messagesPerSecond);
  // About half the time it takes the whole roster to speak once each, which
  // leaves the weighted pick enough rested people to choose between at every
  // tier. Measured: 70% of the configured rate at 2/sec with a longer factor.
  const natural = (roster / Math.max(0.05, messagesPerSecond)) * 500;
  return Math.max(COOLDOWN_FLOOR_MS, Math.min(COOLDOWN_CEILING_MS, natural));
}

/**
 * How often one regular leaves and a new name arrives, by tier.
 *
 * Null at the slow tiers: a small stream is the same handful every session,
 * and turnover there would read as the roster being randomised. Faster tiers
 * are busier rooms where new names appearing now and then is the realism.
 * The roster size never changes — one out, one in.
 */
export function turnoverIntervalFor(messagesPerSecond: number): number | null {
  if (messagesPerSecond < 1.5) return null;
  if (messagesPerSecond < 4) return 120_000;
  return 60_000;
}

/**
 * The most messages one viewer may post back to back.
 *
 * Someone can fire off a few lines in a row during a hype moment — that is
 * what excitement looks like — but past this it is one person monopolising
 * the room.
 */
export const MAX_CONSECUTIVE = 5;
