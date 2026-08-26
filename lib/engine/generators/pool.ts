import type { Rng } from "../rng";
import type {
  Emote,
  EmoteMood,
  Intent,
  LengthClass,
  ResponseEntry,
  Sentiment,
  Viewer,
} from "../types";

/**
 * Tier 1 + 2: weighted pool sampling and template slot-filling.
 *
 * Carries ~95% of all messages. Pure, synchronous, and free — the AI tier only
 * tops up variety, it never keeps chat moving.
 */

/**
 * Length class derived from the text itself rather than the authored tag.
 *
 * Hand-applied `length` tags drift: entries marked "short" in the reaction
 * pools were routinely four or five words, which quietly broke every
 * length-based decision downstream. Measuring the string removes a whole class
 * of authoring mistake, and means adding a pool entry requires no judgement
 * about which bucket it belongs in.
 */
export function measureLength(text: string): LengthClass {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 1) return "tiny";
  if (words <= 3) return "short";
  if (words <= 6) return "medium";
  return "long";
}

/** How strongly a viewer's verbosity should favour each length class. */
const LENGTH_AFFINITY: Record<LengthClass, (verbosity: number) => number> = {
  tiny: (v) => 1.6 - v,
  short: () => 1.0,
  medium: (v) => 0.4 + v,
  long: (v) => Math.max(0.05, v * 1.6 - 0.4),
};

/**
 * Emote moods that fit each intent, best first. Sentiment breaks ties for the
 * intents that can swing either way.
 */
const INTENT_MOODS: Record<Intent, readonly EmoteMood[]> = {
  greeting: ["love", "chill", "hype"],
  farewell: ["love", "chill", "sad"],
  question_to_chat: ["confused", "funny", "chill"],
  excitement: ["hype", "funny", "love"],
  achievement: ["hype", "love", "funny"],
  struggle: ["sad", "funny", "love"],
  confusion: ["confused", "funny", "sad"],
  showing: ["love", "hype", "chill"],
  story: ["funny", "confused", "chill"],
  mundane: ["chill", "funny", "confused"],
};

export function scoreEntry(
  entry: ResponseEntry,
  viewer: Viewer,
  tagBias: Readonly<Partial<Record<string, number>>>,
): number {
  let score = entry.weight ?? 1;
  for (const tag of entry.tags ?? []) score *= tagBias[tag] ?? 1;
  score *= LENGTH_AFFINITY[measureLength(entry.text)](viewer.verbosity);
  return Math.max(0.001, score);
}

export interface FillContext {
  keywords: readonly string[];
  emotes: readonly Emote[];
  /** Username to substitute into `{user}` slots. */
  replyTo?: string;
  /**
   * Template texts used recently. Entries in this set are held back so chat
   * doesn't say "that's so pretty" three times in six seconds — by far the
   * most obvious tell that messages are being sampled from a list.
   */
  recentTexts?: ReadonlySet<string>;
}

/** True if every slot in `entry` can actually be filled from `context`. */
export function canFill(entry: ResponseEntry, context: FillContext): boolean {
  if (entry.text.includes("{kw}") && context.keywords.length === 0) return false;
  if (entry.text.includes("{user}") && !context.replyTo) return false;
  return true;
}

/** Substitutes `{kw}` and `{user}` slots. Assumes canFill() already passed. */
export function fill(entry: ResponseEntry, context: FillContext, rng: Rng): string {
  let text = entry.text;
  if (text.includes("{kw}")) {
    text = text.replace(/\{kw\}/g, rng.pick(context.keywords));
  }
  if (text.includes("{user}") && context.replyTo) {
    text = text.replace(/\{user\}/g, context.replyTo);
  }
  return text;
}

export interface PoolResult {
  text: string;
  /** The unfilled template, for recent-use tracking. */
  template: string;
}

/**
 * Picks and fills one entry for `viewer`, avoiding recently-used templates.
 * Returns null when nothing in the pool is usable in this context.
 */
export function generateFromPool(
  entries: readonly ResponseEntry[],
  viewer: Viewer,
  tagBias: Readonly<Partial<Record<string, number>>>,
  context: FillContext,
  rng: Rng,
): PoolResult | null {
  const fillable = entries.filter((entry) => canFill(entry, context));
  if (fillable.length === 0) return null;

  const recent = context.recentTexts;
  const fresh = recent
    ? fillable.filter((entry) => !recent.has(entry.text))
    : fillable;

  // If everything has been used recently the pool is exhausted; allow a repeat
  // rather than falling silent.
  const usable = fresh.length > 0 ? fresh : fillable;

  const entry = rng.weighted(usable, (e) => scoreEntry(e, viewer, tagBias));
  return { text: fill(entry, context, rng), template: entry.text };
}

/**
 * How many copies of an emote go in one message.
 *
 * Real chat almost never posts a single emote. Looking at an actual Twitch
 * chat: three laughing emotes, four in a row, five identical, and one viewer
 * posting a twelve-emote block. A lone emote is the exception, not the rule,
 * and generating one every time was a big part of why the output read as
 * synthetic.
 */
export function emoteSpamCount(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.12) return 1;          // rare — a single, deliberate emote
  if (roll < 0.38) return rng.int(2, 3);
  if (roll < 0.78) return rng.int(4, 6);  // the common case
  return rng.int(7, 12);              // someone going all in
}

/** Picks an emote matching the moment's mood, falling back to any emote. */
export function pickEmote(
  emotes: readonly Emote[],
  intent: Intent,
  sentiment: Sentiment,
  rng: Rng,
): Emote | null {
  if (emotes.length === 0) return null;

  const preferred = INTENT_MOODS[intent] ?? ["chill"];
  return rng.weighted(emotes, (emote) => {
    const rank = preferred.indexOf(emote.mood);
    // Strong preference for the best-fitting mood, but never zero — an
    // occasional off-mood emote is what real chat looks like.
    let weight = rank === -1 ? 0.15 : [6, 2.5, 1.2][rank] ?? 1;
    if (sentiment === "negative" && emote.mood === "hype") weight *= 0.3;
    if (sentiment === "positive" && emote.mood === "sad") weight *= 0.3;
    return weight;
  });
}

export interface DecorateContext {
  intent: Intent;
  sentiment: Sentiment;
}

/**
 * Optionally appends an emote, or replaces the message with emotes entirely.
 *
 * Emote-only messages are a large share of real chat traffic and the cheapest
 * way to make a burst feel populated. Note the repeat: real spam is "KEKW KEKW
 * KEKW", not three different emotes in a row.
 */
export function decorateWithEmotes(
  text: string,
  viewer: Viewer,
  emotes: readonly Emote[],
  context: DecorateContext,
  rng: Rng,
): string {
  if (emotes.length === 0) return text;

  const emote = pickEmote(emotes, context.intent, context.sentiment, rng);
  if (!emote) return text;

  // Low-verbosity, high-affinity viewers sometimes skip words altogether.
  if (viewer.verbosity < 0.15 && rng.chance(viewer.emoteAffinity * 0.5)) {
    const count = emoteSpamCount(rng);
    return Array.from({ length: count }, () => emote.name).join(" ");
  }

  if (rng.chance(viewer.emoteAffinity * 0.4)) {
    return `${text} ${emote.name}`;
  }

  return text;
}
