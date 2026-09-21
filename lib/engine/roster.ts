/**
 * How many people are talking, and how often one of them may speak again.
 *
 * The displayed viewer count and the speaking roster are different things.
 * A real stream with a thousand viewers has a dozen people talking, drawn
 * from a huge silent pool. The roster is that dozen: small enough that the
 * same names recur and the streamer learns who they are, which is most of
 * what makes a chat feel like a room rather than a feed.
 */

/**
 * Regulars and strangers by tier.
 *
 * Measured against two real mid-size channels: the ten most active chatters
 * carried about 40% of messages, and 64 to 68 distinct names appeared in
 * four minutes. A flat roster of ten cannot produce that — ten names
 * carrying 100% is a cast, not a chat.
 *
 * So the room is two populations. Regulars persist, accumulate history and
 * are who the streamer learns; strangers pass through once. A small stream
 * is all regulars, because three viewers who each turn up once are not a
 * chat at all. The tail grows with the tier until most of the noise at
 * CHAOS comes from names nobody will see twice.
 */
const BY_RATE: ReadonlyArray<readonly [rate: number, regulars: number, strangerShare: number]> = [
  [0.2, 3, 0],
  [0.5, 4, 0.1],
  [1, 6, 0.25],
  [1.5, 8, 0.35],
  [2, 10, 0.45],
  [4, 12, 0.55],
];

function tierFor(messagesPerSecond: number) {
  let best = BY_RATE[0];
  for (const entry of BY_RATE) {
    if (Math.abs(entry[0] - messagesPerSecond) < Math.abs(best[0] - messagesPerSecond)) {
      best = entry;
    }
  }
  return best;
}

/** Persistent names: the people the streamer comes to recognise. */
export function rosterSizeFor(messagesPerSecond: number): number {
  return tierFor(messagesPerSecond)[1];
}

/** Share of messages from one-off names passing through. */
export function strangerShareFor(messagesPerSecond: number): number {
  return tierFor(messagesPerSecond)[2];
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
  // Against the regulars' own share of the traffic: strangers take messages
  // off their plate, so a small roster at a fast tier is not being asked to
  // carry every line.
  const roster = rosterSizeFor(messagesPerSecond) / (1 - strangerShareFor(messagesPerSecond));
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
