/**
 * What is happening on screen, as a label chat can react to.
 *
 * Deliberately a closed list. The model looks at a frame and picks one, and
 * the deterministic side turns it into a composition: how emote-heavy the
 * batch is, how long the lines run. An open label space would be untunable
 * and untestable — every new word the model invented would fall through to
 * a default nobody chose.
 *
 * Game-agnostic on purpose. "boss" and "death" happen in a shooter and a
 * farming sim alike; anything more specific would bake in assumptions about
 * what is being played.
 */
export const GAME_EVENTS = [
  "death",
  "win",
  "close-call",
  "boss",
  "discovery",
  "struggling",
  "downtime",
  "menu",
  "unknown",
] as const;

export type GameEvent = (typeof GAME_EVENTS)[number];

/**
 * What chat looks like for each event.
 *
 * `emoteShare` is the fraction of lines rendered as emotes alone, `short`
 * the fraction that are one to three words. Taken from measurement: a real
 * mid-size chat ran about 40% emote-only through a hype beat and under 10%
 * through conversation, and the difference tracks what is on screen rather
 * than how fast chat is moving.
 *
 * `rate` multiplies the configured message rate. The speed slider stays the
 * baseline and events push against it, so a death is louder than downtime
 * at every tier without any tier becoming a different product.
 */
export interface EventProfile {
  emoteShare: number;
  short: number;
  rate: number;
}

const PROFILES: Record<GameEvent, EventProfile> = {
  // The loudest moments, and the most emote-driven: nobody types a sentence
  // while it is happening, they react.
  death: { emoteShare: 0.4, short: 0.4, rate: 1.9 },
  win: { emoteShare: 0.42, short: 0.38, rate: 2.0 },
  "close-call": { emoteShare: 0.38, short: 0.42, rate: 1.8 },
  boss: { emoteShare: 0.3, short: 0.4, rate: 1.5 },

  // Something new to look at. Chat talks about it rather than spamming.
  discovery: { emoteShare: 0.18, short: 0.3, rate: 1.2 },
  struggling: { emoteShare: 0.25, short: 0.35, rate: 1.2 },

  // Nothing is happening, which is when chat talks to the streamer and to
  // itself. The conversational end of the range.
  downtime: { emoteShare: 0.1, short: 0.25, rate: 1 },
  menu: { emoteShare: 0.12, short: 0.3, rate: 0.9 },

  // No frame, or the model could not tell. Middle of the road.
  unknown: { emoteShare: 0.15, short: 0.27, rate: 1 },
};

export function profileFor(event: GameEvent | undefined): EventProfile {
  return PROFILES[event ?? "unknown"];
}
