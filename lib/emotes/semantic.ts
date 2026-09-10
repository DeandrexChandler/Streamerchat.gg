import type { Emote, EmoteMood, EmoteTag, Intent } from "../engine/types";
import type { Rng } from "../engine/rng";

/**
 * Picking the emote a moment is actually *about*.
 *
 * Mood matching alone is too indirect. A pack containing an emote literally
 * named `hi` would classify it as `chill`, a greeting prefers warm or hype
 * moods, and weighted randomness across a hundred candidates made the one
 * obviously right emote no likelier than any other. Saying "hi" to a chat that
 * owns a `hi` emote and getting `catJAM` is the failure this fixes.
 *
 * Priority, highest first:
 *
 *   1. The emote the model asked for by name, when the pack has it
 *   2. A tag the user assigned by hand
 *   3. A name that semantically matches the intent — `hi`, `wave`, `peepoHi`
 *   4. A strong mood match for the intent
 *   5. Unknown-mood wildcards, which are most of any imported pack
 *   6. Anything at all, rarely, so variation survives — but only once the
 *      semantic tiers have come up empty, so nothing unrelated is posted
 *      where something related exists
 *
 * Names are matched on a normalised form, because packs are full of `Hi`,
 * `peepoHi`, `helloThere` and `HYPERS` and none of them are typed the way the
 * classifier would guess.
 */

/**
 * The tag that suits each intent.
 *
 * Checked before names and before moods: a user who took the trouble to mark
 * an emote as a greeting has said something more reliable than any guess we
 * can make from "GAMBA" or "xqcWOT".
 */
/**
 * What a message is for, as far as emote choice is concerned.
 *
 * The classifier's intents plus "idle", which is not something the streamer
 * did but is very much a moment chat has emotes for.
 */
export type EmoteMoment = Intent | "idle";

const INTENT_TAG: Partial<Record<EmoteMoment, EmoteTag>> = {
  greeting: "greeting",
  farewell: "farewell",
  achievement: "achievement",
  excitement: "hype",
  directive: "hype",
  struggle: "struggle",
  confusion: "confusion",
  question_to_chat: "question",
  showing: "showing",
  story: "story",
  mundane: "general",
  idle: "idle",
};

/**
 * Name fragments that mean each intent, best first.
 *
 * Order matters: within a tier the earliest fragment with any match wins, so
 * `hi` beats `wave` for a greeting even when the pack has both.
 */
const SEMANTIC_NAMES: Partial<Record<EmoteMoment, readonly string[]>> = {
  greeting: ["hi", "hello", "hey", "hii", "wave", "o7", "welcome", "yo"],
  farewell: ["bye", "goodbye", "gn", "o7", "cya", "later", "peace"],
  achievement: ["pog", "poggers", "letsgo", "hype", "yay", "win", "gg", "clap", "w"],
  excitement: ["pog", "poggers", "letsgo", "hype", "yay", "gg", "sheesh", "fire"],
  struggle: ["sad", "cry", "pepehands", "monka", "pain", "rip", "copium", "sadge"],
  confusion: ["huh", "what", "wut", "confused", "sus", "hmm", "think", "clueless"],
  question_to_chat: ["hmm", "think", "huh", "what", "sus"],
  showing: ["pog", "look", "eyes", "peek", "stare", "wow"],
  story: ["listen", "popcorn", "chill", "sip", "cozy"],
  directive: ["pog", "clap", "hype", "letsgo", "w"],
  idle: ["afk", "sleep", "zzz", "bored", "wait", "waiting", "hmm", "sip", "lurk", "peek", "stare"],
};

/** Moods that suit each intent when no name matches, best first. */
const INTENT_MOODS: Record<EmoteMoment, readonly EmoteMood[]> = {
  greeting: ["love", "chill", "hype"],
  farewell: ["love", "chill", "sad"],
  question_to_chat: ["confused", "funny", "chill"],
  directive: ["hype", "funny", "love"],
  excitement: ["hype", "funny", "love"],
  achievement: ["hype", "love", "funny"],
  struggle: ["sad", "funny", "love"],
  confusion: ["confused", "funny", "sad"],
  showing: ["love", "hype", "chill"],
  story: ["chill", "funny", "love"],
  mundane: ["chill", "funny", "unknown"],
  idle: ["chill", "confused", "funny"],
};

/** How often to ignore everything above and take any emote at all. */
const WILDCARD_ESCAPE = 0.08;

/** Lowercased, punctuation and separators stripped: `peepo_Hi!` -> `peepohi`. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Whether an emote's name carries a fragment's meaning.
 *
 * Exact match first, then a prefix or suffix, which is how packs actually
 * compose names — `peepoHi`, `hiThere`, `catWave`. A bare substring match
 * would let `hi` fire on `thinking` and `whip`, which is worse than missing.
 */
function nameMatches(emoteName: string, fragment: string): boolean {
  const name = normalise(emoteName);
  return name === fragment || name.startsWith(fragment) || name.endsWith(fragment);
}

export interface SemanticEmoteOptions {
  emotes: readonly Emote[];
  intent: EmoteMoment;
  /** The reaction's own emotion, when the AI supplied one. Overrides intent moods. */
  emotion?: EmoteMood;
  /**
   * The emote the AI asked for by name, if any.
   *
   * Honoured when the pack actually has it — the model only ever saw names
   * from the loaded pack, but it can still misspell one or invent one, and
   * an invented name renders as bare text on stream.
   */
  preferred?: string;
  rng: Rng;
}

/**
 * The emote that best fits this moment, or null when the pack has nothing.
 *
 * Deterministic given the seed: every choice among equally suitable candidates
 * goes through the injected Rng, never Math.random.
 */
export function pickSemanticEmote({
  emotes,
  intent,
  emotion,
  preferred,
  rng,
}: SemanticEmoteOptions): Emote | null {
  if (emotes.length === 0) return null;

  // 0. What the model asked for, if it exists.
  if (preferred) {
    const wanted = preferred.toLowerCase();
    const exact = emotes.find((emote) => emote.name.toLowerCase() === wanted);
    if (exact) return exact;
  }

  // 1. What the user said this emote is for.
  const wanted = INTENT_TAG[intent];
  if (wanted) {
    const tagged = emotes.filter((emote) => emote.tags?.includes(wanted));
    if (tagged.length > 0) return rng.pick(tagged);
  }

  // 2. A name that means this moment.
  for (const fragment of SEMANTIC_NAMES[intent] ?? []) {
    const matches = emotes.filter((emote) => nameMatches(emote.name, fragment));
    if (matches.length > 0) return rng.pick(matches);
  }

  /**
   * Nothing in the pack is *about* this moment, so the choice below is a
   * mood guess. A rare escape hatch here keeps a pack's best mood match from
   * becoming the only thing chat ever posts. It sits below the semantic
   * tiers on purpose: when the pack owns a `hi` emote, a greeting never
   * posts Sadge instead.
   */
  if (rng.chance(WILDCARD_ESCAPE)) return rng.pick([...emotes]);

  /**
   * The AI's stated emotion outranks the intent's mood list.
   *
   * It describes the specific line being posted; the intent only describes
   * what the streamer did. A joke about a loss is funny, not sad.
   */
  const moods = emotion ? [emotion, ...INTENT_MOODS[intent]] : INTENT_MOODS[intent];
  for (const mood of moods) {
    const matches = emotes.filter((emote) => emote.mood === mood);
    if (matches.length > 0) return rng.pick(matches);
  }

  const wildcards = emotes.filter((emote) => emote.mood === "unknown");
  if (wildcards.length > 0) return rng.pick(wildcards);

  return rng.pick([...emotes]);
}
