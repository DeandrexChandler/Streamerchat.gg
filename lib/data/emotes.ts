import type { Emote, EmoteMood } from "../engine/types";

/**
 * Built-in emote set.
 *
 * Text-only by design — these render as styled tokens, so they work with zero
 * network dependency and are safe inside an OBS browser source. Real image
 * emotes are layered on top via the 7TV/BTTV channel import; this set is the
 * always-available floor.
 *
 * The mood tag matters: picking emotes at random produces lines like
 * "monkaS Sadge PogU", which mixes grief and hype in one breath and instantly
 * reads as generated. Moods let the director reach for emotes that match what
 * just happened.
 */
const BUILT_IN: ReadonlyArray<[name: string, mood: EmoteMood]> = [
  // Laughter
  ["KEKW", "funny"], ["LULW", "funny"], ["OMEGALUL", "funny"],
  ["LUL", "funny"], ["ICANT", "funny"], ["PLZ", "funny"],
  // Warmth
  ["peepoHappy", "love"], ["peepoLove", "love"], ["HUGGIES", "love"],
  ["peepoCheer", "love"], ["peepoSip", "love"],
  // Hype
  ["Pog", "hype"], ["POGGERS", "hype"], ["PogU", "hype"],
  ["Clap", "hype"], ["GIGACHAD", "hype"], ["WICKED", "hype"], ["EZ", "hype"],
  // Sympathy
  ["Sadge", "sad"], ["peepoSad", "sad"], ["PepeHands", "sad"],
  ["widepeepoSad", "sad"], ["monkaS", "sad"], ["monkaW", "sad"],
  // Thinking
  ["Hmm", "confused"], ["peepoThink", "confused"],
  ["5Head", "confused"], ["Thonk", "confused"], ["modCheck", "confused"],
  // Calm / ambient
  ["catJAM", "chill"], ["VIBE", "chill"], ["bedge", "chill"],
  ["peepoSleep", "chill"], ["peepoLeave", "chill"], ["o7", "chill"],
];

export const DEFAULT_EMOTES: readonly Emote[] = BUILT_IN.map(
  ([name, mood], i) => ({ id: `builtin_${i}`, name, mood }),
);

/** Case-insensitive lookup used by the message renderer. */
export function buildEmoteIndex(
  emotes: readonly Emote[],
): ReadonlyMap<string, Emote> {
  const index = new Map<string, Emote>();
  for (const emote of emotes) index.set(emote.name.toLowerCase(), emote);
  return index;
}

/** Splits a message into text runs and emote tokens for rendering. */
export type MessageSegment =
  | { type: "text"; value: string }
  | { type: "emote"; emote: Emote };

export function segmentMessage(
  text: string,
  index: ReadonlyMap<string, Emote>,
): MessageSegment[] {
  if (index.size === 0) return [{ type: "text", value: text }];

  const segments: MessageSegment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ type: "text", value: buffer.join(" ") });
      buffer = [];
    }
  };

  for (const token of text.split(" ")) {
    const emote = index.get(token.toLowerCase());
    if (emote) {
      flush();
      segments.push({ type: "emote", emote });
    } else {
      buffer.push(token);
    }
  }

  flush();
  return segments;
}
