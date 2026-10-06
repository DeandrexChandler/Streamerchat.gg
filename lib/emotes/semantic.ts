import type { GameEvent } from "../ai/moment";
import type { Emote, EmoteMood, EmoteTag, Intent } from "../engine/types";
import type { Rng } from "../engine/rng";
import { meaningsOf, normalise } from "./meaning";

/**
 * Picking the emote a moment is actually *about*.
 *
 * Mood matching alone is too indirect. A pack containing an emote literally
 * named `hi` would classify it as `chill`, a greeting prefers warm or hype
 * moods, and weighted randomness across a hundred candidates made the one
 * obviously right emote no likelier than any other. Saying "hi" to a chat
 * that owns a `hi` emote and getting `catJAM` is the failure this fixes.
 *
 * Priority, highest first:
 *
 *   1. A tag the streamer assigned by hand — the only source that is not a
 *      guess, so nothing outranks it
 *   2. The emote the model asked for by name, when the pack has it
 *   3. What the moment is: the token chat was told to spam, then what is on
 *      screen, then the intent — matched against meanings read off names
 *   4. The feeling the model said the line wants, when it named one
 *   5. A mood match, which is the weakest signal and the last one
 *   6. Nothing. A relevant line of text beats an unrelated picture
 *
 * There is no wildcard tier. An emote nobody has tagged and whose name says
 * nothing — most of a large channel pack — is never posted into a moment it
 * does not fit, because "it exists in the pack" is not a reason.
 */

/**
 * What a message is for, as far as emote choice is concerned.
 *
 * The classifier's intents plus "idle", which is not something the streamer
 * did but is very much a moment chat has emotes for.
 */
export type EmoteMoment = Intent | "idle";

/**
 * The meanings each moment wants, as groups of equivalents.
 *
 * Within a group the choice is free, which is where variety comes from: a
 * win can be answered with GG or W or Pog and all three are right. Between
 * groups it is strictly ordered, which is where accuracy comes from: a
 * greeting reaches for a wave before it reaches for a heart, and never
 * reaches for a heart while the pack owns a wave.
 */
const MOMENT_TAGS: Record<EmoteMoment, ReadonlyArray<readonly EmoteTag[]>> = {
  greeting: [["greeting"], ["love"]],
  farewell: [["farewell"], ["love"]],
  achievement: [["victory", "hype"], ["agreement"]],
  excitement: [["hype", "victory"], ["laugh"]],
  directive: [["agreement", "victory", "hype", "spam"]],
  struggle: [["sad", "frustrated"]],
  confusion: [["confused"], ["question"]],
  question_to_chat: [["question"], ["confused"]],
  showing: [["hype"], ["love"]],
  story: [["laugh"], ["love"], ["idle"]],
  mundane: [["agreement", "laugh"], ["idle"]],
  idle: [["idle"], ["laugh"]],
};

/**
 * What chat was told to post, as meanings.
 *
 * "spam W" is not a request for an emote literally named W — a pack without
 * one still has GG, EZ and PogChamp, and chat spamming those is the same
 * moment. The token still goes out as text from the rest of the room; this
 * is only what the emote half reaches for.
 */
const DIRECTIVE_TAGS: ReadonlyArray<readonly [RegExp, ReadonlyArray<readonly EmoteTag[]>]> = [
  [/^w+$/i, [["agreement", "victory", "hype", "spam"]]],
  [/^(gg|ggs|ez|ezclap)$/i, [["victory", "hype", "agreement"]]],
  [/^l+$/i, [["sad", "frustrated"]]],
  [/^(f|rip)$/i, [["sad"]]],
  [/^(hi|hello|hey|wave)$/i, [["greeting"]]],
  [/^(bye|gn|o7)$/i, [["farewell"]]],
  [/^(kekw|lul|lmao|lol)$/i, [["laugh"]]],
];

/** What is on screen, as meanings. Only when capture is on. */
const EVENT_TAGS: Partial<Record<GameEvent, ReadonlyArray<readonly EmoteTag[]>>> = {
  // Chat does laugh at a death, but grief leads when the pack has any:
  // posting LUL over Sadge three times out of four reads as mockery.
  death: [["sad", "frustrated"], ["laugh"]],
  win: [["victory", "hype", "agreement"]],
  "close-call": [["hype", "confused"]],
  boss: [["hype", "confused"]],
  discovery: [["hype", "love"]],
  struggling: [["frustrated", "sad"]],
  downtime: [["idle"]],
  menu: [["idle"]],
};

/** Moods that suit each moment when nothing better matched, best first. */
const MOMENT_MOODS: Record<EmoteMoment, readonly EmoteMood[]> = {
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
  mundane: ["chill", "funny"],
  idle: ["chill", "confused", "funny"],
};

export interface SemanticEmoteOptions {
  emotes: readonly Emote[];
  intent: EmoteMoment;
  /** The reaction's own emotion, when the AI supplied one. */
  emotion?: EmoteMood;
  /**
   * The emote the AI asked for by name, if any.
   *
   * Honoured when the pack actually has it. When it does not — the model
   * misremembered a name, or invented one — the request is not dropped:
   * `emoteIntent` and the moment find the best equivalent instead.
   */
  preferred?: string;
  /** The feeling the AI said the line wants, in the shared vocabulary. */
  emoteIntent?: EmoteTag;
  /** The token chat was told to post, for a directive. */
  directive?: string;
  /** What the screen is doing, when capture is on. */
  event?: GameEvent;
  rng: Rng;
}

/** Everything known about an emote's meaning: hand-tagged first, then read. */
export function tagsFor(emote: Emote): readonly EmoteTag[] {
  if (emote.tags && emote.tags.length > 0) return emote.tags;
  return meaningsOf(emote.name);
}

/** The first group of equivalents the pack can answer with, picked freely. */
function bestMatch(
  emotes: readonly Emote[],
  groups: ReadonlyArray<readonly EmoteTag[]>,
  rng: Rng,
): Emote | null {
  for (const group of groups) {
    const pool = matching(emotes, group);
    if (pool.length > 0) return rng.pick(pool);
  }
  return null;
}

function matching(emotes: readonly Emote[], tags: readonly EmoteTag[]): Emote[] {
  return emotes.filter((emote) => {
    const known = tagsFor(emote);
    return tags.some((tag) => known.includes(tag));
  });
}

/**
 * The emote that best fits this moment, or null when nothing in the pack
 * does.
 *
 * Deterministic given the seed: every choice among equally suitable
 * candidates goes through the injected Rng, never Math.random.
 */
export function pickSemanticEmote({
  emotes,
  intent,
  emotion,
  preferred,
  emoteIntent,
  directive,
  event,
  rng,
}: SemanticEmoteOptions): Emote | null {
  if (emotes.length === 0) return null;

  /**
   * What the moment explicitly is, and what it is only generally.
   *
   * The token chat was told to post and what is on screen are statements
   * about *this* message. The intent behind it is a weaker claim, which is
   * why the model's own stated feeling sits between them: for an ordinary
   * line, "this one wants a laugh" beats "people are chatting".
   */
  const explicit = [
    ...(directive ? directiveTags(directive) : []),
    ...(event ? (EVENT_TAGS[event] ?? []) : []),
  ];
  const wanted = [...explicit, ...MOMENT_TAGS[intent]].flat();

  // 1. What the streamer said this emote is for. Never overruled by a guess.
  const handTagged = emotes.filter((emote) => (emote.tags?.length ?? 0) > 0);
  for (const tag of wanted) {
    const picked = handTagged.filter((emote) => emote.tags?.includes(tag));
    if (picked.length > 0) return rng.pick(picked);
  }
  // A "general" emote is the streamer saying "use this anywhere".
  const general = handTagged.filter((emote) => emote.tags?.includes("general"));

  // 2. What the model asked for, if the pack has it.
  if (preferred) {
    const target = normalise(preferred);
    const exact = emotes.find((emote) => normalise(emote.name) === target);
    if (exact) return exact;
  }

  // 3. What chat was told to post, and what is on screen.
  const explicitly = bestMatch(emotes, explicit, rng);
  if (explicitly) return explicitly;

  // 4. The feeling the model said this line wants.
  if (emoteIntent) {
    const picked = matching(emotes, [emoteIntent]);
    if (picked.length > 0) return rng.pick(picked);
  }

  // 5. What the intent generally calls for.
  const generally = bestMatch(emotes, MOMENT_TAGS[intent], rng);
  if (generally) return generally;

  // 6. Mood, the weakest signal. "unknown" is not a mood, it is the absence
  //    of one, and posting those is how an in-joke ends up answering a death.
  const moods = emotion ? [emotion, ...MOMENT_MOODS[intent]] : MOMENT_MOODS[intent];
  for (const mood of moods) {
    if (mood === "unknown") continue;
    const picked = emotes.filter((emote) => emote.mood === mood);
    if (picked.length > 0) return rng.pick(picked);
  }

  // 7. Anything the streamer marked usable anywhere, and otherwise nothing.
  return general.length > 0 ? rng.pick(general) : null;
}

/** The meanings a directive token asks for, or none if it is just a word. */
function directiveTags(token: string): ReadonlyArray<readonly EmoteTag[]> {
  for (const [pattern, tags] of DIRECTIVE_TAGS) {
    if (pattern.test(token.trim())) return tags;
  }
  return [];
}
