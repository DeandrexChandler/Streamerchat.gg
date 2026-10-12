import type { GameEvent } from "../ai/moment";
import type { Emote, EmoteMeaning, EmoteMood, EmoteTag, Intent, Sentiment } from "../engine/types";
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
 * Priority, highest first — and within each, an emote the streamer tagged
 * with that meaning before one whose name merely suggests it:
 *
 *   1. What chat was told to post ("spam W")
 *   2. What THIS line is: the emote the model named, when it fits the
 *      feeling the model gave the line (`emoteIntent`), then that feeling
 *   3. What is on screen, when capture is on
 *   4. What the moment generally is: the intent, leaning sad when what was
 *      said was bad news, then the line's coarse emotion
 *   5. A mood match, the weakest signal
 *   6. Something the streamer marked usable anywhere, or nothing — a
 *      relevant line of text beats an unrelated picture
 *
 * Hand tags used to outrank everything, across meanings: an emote tagged
 * for the general moment beat what the line actually felt, so a sad line in
 * casual chat got the streamer's laugh emote. A tag says what an emote
 * means, not that it should win.
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
  greeting: [["greeting"], ["love", "happy"]],
  farewell: [["farewell"], ["love", "respect"]],
  achievement: [["victory", "hype"], ["aura", "agreement"]],
  excitement: [["hype", "victory"], ["shock"], ["laugh"]],
  directive: [["agreement", "victory", "hype", "spam"]],
  // Chat backs the streamer up when it goes wrong: grief, frustration on
  // their behalf, a hug. Never a laugh.
  struggle: [["sad", "frustrated", "comfort"], ["cope"]],
  confusion: [["confused"], ["question", "sus"]],
  question_to_chat: [["question"], ["confused"]],
  showing: [["hype", "watching"], ["love", "aura"]],
  story: [["watching", "laugh"], ["love"], ["chill", "idle"]],
  mundane: [["agreement", "laugh", "happy"], ["chill", "idle"]],
  idle: [["idle", "chill"], ["dance", "laugh"]],
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
  [/^(f|rip)$/i, [["respect", "sad"]]],
  [/^(hi|hello|hey|wave)$/i, [["greeting"]]],
  [/^(bye|gn|o7)$/i, [["farewell"]]],
  [/^(kekw|lul|lmao|lol)$/i, [["laugh"]]],
];

/** What is on screen, as meanings. Only when capture is on. */
const EVENT_TAGS: Partial<Record<GameEvent, ReadonlyArray<readonly EmoteTag[]>>> = {
  // Chat does laugh at a death, but grief leads when the pack has any:
  // posting LUL over Sadge three times out of four reads as mockery.
  death: [["sad", "frustrated", "respect"], ["shock"], ["laugh"]],
  win: [["victory", "hype", "agreement"], ["aura", "relief"]],
  "close-call": [["shock", "scared", "relief"], ["hype"]],
  boss: [["scared", "hype"], ["shock"]],
  discovery: [["hype", "shock", "love"], ["watching"]],
  struggling: [["frustrated", "sad", "angry"], ["comfort", "cope"]],
  downtime: [["idle", "chill"], ["dance"]],
  menu: [["idle", "chill"]],
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

/** The model's coarse emotion for a line, as meanings. */
const EMOTION_TAGS: Partial<Record<EmoteMood, readonly EmoteTag[]>> = {
  hype: ["hype", "victory"],
  funny: ["laugh"],
  sad: ["sad", "comfort"],
  confused: ["confused"],
  love: ["love", "happy"],
  chill: ["chill", "happy"],
};

/**
 * Bad news reads as bad news whatever its shape.
 *
 * "my dog died" classifies as a story, and a story reaches for watching and
 * laugh emotes. When what was said was negative, grief and comfort come
 * first for the moments that do not already carry a feeling of their own.
 */
const LEANS_ON_SENTIMENT: ReadonlySet<EmoteMoment> = new Set(["story", "mundane", "showing", "question_to_chat"]);
const BAD_NEWS: ReadonlyArray<readonly EmoteTag[]> = [["sad", "comfort"], ["frustrated"]];

/**
 * Never posted after bad news, whatever the line or the model asked for.
 *
 * Measured live: "my dog passed away this morning" got three laughing
 * emotes among the grief. A laugh there reads as chat laughing at the
 * streamer, which is the one thing chat never does. The same rule as the
 * streamer's own "never post it when the moment is sad", applied for them.
 */
const NOT_AFTER_BAD_NEWS: ReadonlySet<EmoteMeaning> = new Set(["laugh", "troll", "hype", "dance", "freaky"]);

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
  emoteIntent?: EmoteMeaning;
  /** The token chat was told to post, for a directive. */
  directive?: string;
  /** What the screen is doing, when capture is on. */
  event?: GameEvent;
  /** How what the streamer said felt, from the classifier. */
  sentiment?: Sentiment;
  rng: Rng;
}

/** Everything known about an emote's meaning: hand-tagged first, then read. */
export function tagsFor(emote: Emote): readonly EmoteMeaning[] {
  if (emote.tags && emote.tags.length > 0) return emote.tags;
  return meaningsOf(emote.name);
}

/**
 * The first group of equivalents the pack can answer with.
 *
 * Within a group, emotes the streamer tagged with it come first, and the
 * choice among them is free — that is where variety comes from. Only when
 * nobody tagged anything for it do emotes whose names suggest it compete.
 */
function bestMatch(
  emotes: readonly Emote[],
  groups: ReadonlyArray<readonly EmoteMeaning[]>,
  rng: Rng,
): Emote | null {
  for (const group of groups) {
    const pool = matching(emotes, group);
    if (pool.length === 0) continue;
    const tagged = pool.filter((emote) => emote.tags?.some((tag) => group.includes(tag)));
    return rng.pick(tagged.length > 0 ? tagged : pool);
  }
  return null;
}

function matching(emotes: readonly Emote[], tags: readonly EmoteMeaning[]): Emote[] {
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
  sentiment,
  rng,
}: SemanticEmoteOptions): Emote | null {
  if (emotes.length === 0) return null;

  const moment: ReadonlyArray<readonly EmoteMeaning[]> =
    sentiment === "negative" && LEANS_ON_SENTIMENT.has(intent)
      ? [...BAD_NEWS, ...MOMENT_TAGS[intent]]
      : MOMENT_TAGS[intent];

  /** Every group of equivalents, in priority order. */
  const groups: ReadonlyArray<readonly EmoteMeaning[]> = [
    ...(directive ? directiveTags(directive) : []),
    ...(emoteIntent ? [[emoteIntent]] : []),
    ...(event ? (EVENT_TAGS[event] ?? []) : []),
    ...moment,
    // The coarse emotion every line carries — one of six — ranks below the
    // moment; the specific emoteIntent above it is what speaks for the line.
    ...(emotion && EMOTION_TAGS[emotion] ? [EMOTION_TAGS[emotion]!] : []),
  ];

  /**
   * The streamer's "never" comes before every tier, the model's own pick
   * included. A blocked emote is gone; a `notFor` emote is gone for any
   * moment that wants one of the meanings it is barred from — which is what
   * keeps KEKW out of a death even when the model asks for it by name.
   */
  const barred = new Set<EmoteMeaning>(groups.flat());
  emotes = emotes.filter(
    (emote) =>
      !emote.blocked &&
      !emote.notFor?.some((tag) => barred.has(tag)) &&
      !(sentiment === "negative" && tagsFor(emote).some((tag) => NOT_AFTER_BAD_NEWS.has(tag))),
  );
  if (emotes.length === 0) return null;

  // 1. What chat was told to post comes first: the streamer asked for it.
  const told = directive ? bestMatch(emotes, directiveTags(directive), rng) : null;
  if (told) return told;

  /**
   * 2. The emote the model named, when the pack has it and it fits what the
   * line is. A name it picked against its own stated feeling — KEKW on a
   * line it called sad — is a slip, and the feeling wins.
   */
  if (preferred) {
    const target = normalise(preferred);
    const exact = emotes.find((emote) => normalise(emote.name) === target);
    const known = exact ? tagsFor(exact) : [];
    // Only one whose meaning is known: an emote nothing is known about is
    // never posted, and the model naming it does not make it mean anything.
    if (exact && known.length > 0 && (!emoteIntent || known.includes(emoteIntent))) return exact;
  }

  // 2–4. The line, then the screen, then the moment.
  const found = bestMatch(emotes, groups.slice(directive ? directiveTags(directive).length : 0), rng);
  if (found) return found;

  // 5. Mood, the weakest signal. "unknown" is not a mood, it is the absence
  //    of one, and posting those is how an in-joke ends up answering a death.
  const moods = emotion ? [emotion, ...MOMENT_MOODS[intent]] : MOMENT_MOODS[intent];
  for (const mood of moods) {
    if (mood === "unknown") continue;
    const picked = emotes.filter((emote) => emote.mood === mood);
    if (picked.length > 0) return rng.pick(picked);
  }

  // 6. Anything the streamer marked usable anywhere, and otherwise nothing.
  const general = emotes.filter((emote) => emote.tags?.includes("general"));
  return general.length > 0 ? rng.pick(general) : null;
}

/** The meanings a directive token asks for, or none if it is just a word. */
function directiveTags(token: string): ReadonlyArray<readonly EmoteTag[]> {
  for (const [pattern, tags] of DIRECTIVE_TAGS) {
    if (pattern.test(token.trim())) return tags;
  }
  return [];
}

/** A meaning and the emotes offered to the model for it. */
export interface EmoteGroup {
  meaning: EmoteMeaning;
  names: string[];
}

/**
 * The emotes the model is shown, by what they mean.
 *
 * It used to see the first forty in pack order — in a real channel pack
 * `DinkDonk`, `dudWhat`, `NOOOO`, `COCKA`, `LOSER` — and an emote it named
 * was attached almost unconditionally, so chat posted whatever happened to
 * sit at the front of the pack. Now every meaning the pack can answer gets
 * a turn, the streamer's own tags first, a different pick each batch so the
 * whole pack is reachable over a session, and emotes nothing is known about
 * are not offered at all.
 */
export function emotesForPrompt(
  emotes: readonly Emote[],
  meanings: readonly EmoteMeaning[],
  rng: Rng,
  max: number,
): EmoteGroup[] {
  const usable = emotes.filter((emote) => !emote.blocked);
  const pools = meanings
    .map((meaning) => {
      const pool = usable.filter((emote) => tagsFor(emote).includes(meaning));
      const tagged = pool.filter((emote) => emote.tags?.includes(meaning));
      const read = pool.filter((emote) => !emote.tags?.includes(meaning));
      return { meaning, pool: [...rng.shuffle(tagged), ...rng.shuffle(read)] };
    })
    .filter(({ pool }) => pool.length > 0);

  const groups = new Map<EmoteMeaning, string[]>();
  const offered = new Set<string>();
  // Round-robin, so a pack's thin meanings are offered before its deep
  // ones are offered twice.
  for (let round = 0; round < 3 && offered.size < max; round += 1) {
    for (const { meaning, pool } of pools) {
      if (offered.size >= max) break;
      const next = pool.find((emote) => !offered.has(emote.name));
      if (!next) continue;
      offered.add(next.name);
      groups.set(meaning, [...(groups.get(meaning) ?? []), next.name]);
    }
  }
  return pools.filter(({ meaning }) => groups.has(meaning)).map(({ meaning }) => ({ meaning, names: groups.get(meaning)! }));
}
