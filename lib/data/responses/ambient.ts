import type { ResponseEntry, Sentiment } from "../../engine/types";

/**
 * Ambient reactions — the bulk of real chat.
 *
 * The single biggest structural error in an early version of this engine was
 * treating every message as a *statement*. That produced a wall of 4-6 word
 * observations where every viewer seemed to be competing to say something
 * clever, which is nothing like a real chat.
 *
 * Actual chat is mostly noise: emotes, single words, and reflexive one-beat
 * reactions. Someone says something substantive occasionally, and rarely
 * writes a whole sentence. These pools are the noise floor, and the director
 * draws from them for roughly half of all messages.
 *
 * Keep entries to one or two words. Anything longer belongs in reactions.ts.
 */

const POSITIVE: readonly ResponseEntry[] = [
  { text: "W", weight: 3, length: "tiny", tags: ["short", "hype"] },
  { text: "LOL", weight: 3, length: "tiny", tags: ["short", "joke"] },
  { text: "LMAO", weight: 2, length: "tiny", tags: ["short", "joke"] },
  { text: "yes", weight: 2, length: "tiny", tags: ["short"] },
  { text: "fr", weight: 2, length: "tiny", tags: ["short"] },
  { text: "real", weight: 3, length: "tiny", tags: ["short"] },
  { text: "facts", weight: 2, length: "tiny", tags: ["short"] },
  { text: "same", weight: 2, length: "tiny", tags: ["short"] },
  { text: "nice", weight: 2, length: "tiny", tags: ["short", "warm"] },
  { text: "yep", length: "tiny", tags: ["short"] },
  { text: "ayy", length: "tiny", tags: ["short", "hype"] },
  { text: "sheesh", length: "tiny", tags: ["short", "hype"] },
  { text: "clean", length: "tiny", tags: ["short", "compliment"] },
  { text: "huge", length: "tiny", tags: ["short", "hype"] },
  { text: "based", length: "tiny", tags: ["short"] },
  { text: "goated", length: "tiny", tags: ["short", "hype"] },
  { text: "lets go", weight: 2, length: "tiny", tags: ["short", "hype"] },
  { text: "yooo", weight: 2, length: "tiny", tags: ["short", "hype"] },
  { text: "no way", weight: 2, length: "tiny", tags: ["short"] },
  { text: "so good", length: "tiny", tags: ["short", "compliment"] },
  { text: "love it", length: "tiny", tags: ["short", "warm"] },
  { text: "yesss", length: "tiny", tags: ["short", "hype"] },
  { text: "😭", weight: 2, length: "tiny", tags: ["short", "joke"] },
  { text: "🔥", weight: 2, length: "tiny", tags: ["short", "hype"] },
  { text: "💀", weight: 2, length: "tiny", tags: ["short", "joke"] },
  { text: "🙌", length: "tiny", tags: ["short", "hype"] },
];

const NEGATIVE: readonly ResponseEntry[] = [
  { text: "oof", weight: 3, length: "tiny", tags: ["short"] },
  { text: "rip", weight: 2, length: "tiny", tags: ["short"] },
  { text: "nooo", weight: 2, length: "tiny", tags: ["short"] },
  { text: "pain", weight: 2, length: "tiny", tags: ["short"] },
  { text: "brutal", length: "tiny", tags: ["short"] },
  { text: "bruh", weight: 2, length: "tiny", tags: ["short"] },
  { text: "damn", length: "tiny", tags: ["short"] },
  { text: "yikes", length: "tiny", tags: ["short"] },
  { text: "unlucky", weight: 2, length: "tiny", tags: ["short", "warm"] },
  { text: "so close", weight: 2, length: "tiny", tags: ["short", "warm"] },
  { text: "aw", length: "tiny", tags: ["short", "warm"] },
  { text: "nah", length: "tiny", tags: ["short"] },
  { text: "welp", length: "tiny", tags: ["short"] },
  { text: "😭", weight: 3, length: "tiny", tags: ["short"] },
  { text: "💀", weight: 2, length: "tiny", tags: ["short"] },
  { text: "😩", length: "tiny", tags: ["short"] },
];

const NEUTRAL: readonly ResponseEntry[] = [
  { text: "yeah", weight: 3, length: "tiny", tags: ["short"] },
  { text: "hm", weight: 3, length: "tiny", tags: ["short"] },
  { text: "mm", weight: 2, length: "tiny", tags: ["short"] },
  { text: "ok", weight: 2, length: "tiny", tags: ["short"] },
  { text: "true", weight: 3, length: "tiny", tags: ["short"] },
  { text: "fair", weight: 2, length: "tiny", tags: ["short"] },
  { text: "oh", weight: 2, length: "tiny", tags: ["short"] },
  { text: "wait", weight: 2, length: "tiny", tags: ["short"] },
  { text: "huh", weight: 2, length: "tiny", tags: ["short"] },
  { text: "sure", length: "tiny", tags: ["short"] },
  { text: "ah", length: "tiny", tags: ["short"] },
  { text: "k", length: "tiny", tags: ["short"] },
  { text: "i see", length: "tiny", tags: ["short"] },
  { text: "gotcha", length: "tiny", tags: ["short"] },
  { text: "makes sense", length: "tiny", tags: ["short"] },
  { text: "?", weight: 2, length: "tiny", tags: ["short", "question"] },
  { text: "???", weight: 2, length: "tiny", tags: ["short", "question"] },
  { text: "wat", length: "tiny", tags: ["short", "question"] },
  { text: "o7", length: "tiny", tags: ["short", "emote"] },
  { text: "o/", length: "tiny", tags: ["short", "emote"] },
];

export const AMBIENT: Readonly<Record<Sentiment, readonly ResponseEntry[]>> = {
  positive: POSITIVE,
  negative: NEGATIVE,
  neutral: NEUTRAL,
};

/**
 * Ambient chatter for silence.
 *
 * The reaction ambient pools are full of affirmations — "true", "fair",
 * "gotcha", "makes sense". Those only mean something as a *response*; posted
 * into silence they read as chat agreeing with nobody. Idle needs its own
 * short vocabulary of things that stand alone.
 */
export const IDLE_AMBIENT: readonly ResponseEntry[] = [
  { text: "hi", weight: 2, length: "tiny", tags: ["short", "warm"] },
  { text: "o/", weight: 2, length: "tiny", tags: ["short", "emote"] },
  { text: "hello?", weight: 2, length: "tiny", tags: ["short", "question"] },
  { text: "?", weight: 2, length: "tiny", tags: ["short", "question"] },
  { text: "hm", weight: 2, length: "tiny", tags: ["short"] },
  { text: "lurking", weight: 2, length: "tiny", tags: ["short"] },
  { text: "still here", weight: 2, length: "tiny", tags: ["short"] },
  { text: "chillin", weight: 2, length: "tiny", tags: ["short"] },
  { text: "zzz", length: "tiny", tags: ["short", "joke"] },
  { text: "quiet", length: "tiny", tags: ["short"] },
  { text: "anyone?", length: "tiny", tags: ["short", "question"] },
  { text: "😴", length: "tiny", tags: ["short", "joke"] },
  { text: "👀", weight: 2, length: "tiny", tags: ["short"] },
  { text: "hellooo", length: "tiny", tags: ["short", "question"] },
  { text: "yo", length: "tiny", tags: ["short"] },
  { text: "back", length: "tiny", tags: ["short"] },
];
