import { type EmoteTag } from "../engine/types";

/**
 * What an emote means, guessed from its name.
 *
 * Packs are uploaded per channel and no two are alike, so requiring the
 * streamer to tag six hundred emotes before chat can use them sensibly is
 * not a product. This reads the name instead: `KEKW` is laughter in every
 * chat on the platform, `peepoHi` is a greeting, `Sadge` is sad.
 *
 * Two rules make it safe to trust:
 *
 *  - **An emote with no match gets no tags**, and an emote with no tags is
 *    never chosen for a moment. A channel in-joke whose name means nothing
 *    to anyone outside it should not be posted because it happened to be in
 *    the pack — a relevant line of text beats an unrelated picture.
 *  - **Matching is anchored**, never a loose substring. `hi` matching
 *    anywhere would fire on `thinking` and `whip`.
 *
 * A name can mean several things at once, which is the point: `W` is
 * agreement and victory and hype and the thing chat spams, and a moment
 * wanting any of those should find it.
 */

/** Decoration packs put around a word: `peepoHi`, `widePog`, `catJAM`. */
const PREFIXES = [
  "peepo", "pepe", "wide", "cat", "mono", "modded", "hyper", "giga",
  "forsen", "xqc", "pogg", "o7", "7tv", "bttv", "ffz",
];

/** Suffixes packs add that do not change what the word means. */
const SUFFIXES = ["ge", "w", "s", "e", "ing", "ed", "hd", "2", "3", "x", "xd"];

/**
 * The vocabulary, tag by tag.
 *
 * Deliberately overlapping: `w` is four things, `o7` is both a greeting and
 * a farewell, `rip` is sadness and a joke depending on the moment.
 */
const MEANINGS: Readonly<Record<EmoteTag, readonly string[]>> = {
  greeting: ["hi", "hii", "hiya", "hello", "henlo", "hey", "heyy", "wave", "waving", "o7", "welcome", "sup", "yo", "gm", "morning"],
  farewell: ["bye", "byebye", "goodbye", "gn", "gnight", "goodnight", "cya", "seeya", "later", "peace", "o7", "leave"],
  hype: ["clap", "pog", "poggers", "pogu", "pogchamp", "pogo", "hype", "hypers", "letsgo", "lesgo", "sheesh", "fire", "lit", "boom", "cheer", "hooray", "yay", "banger", "chad", "gigachad", "based", "raid", "wicked", "cook", "goat", "flex", "strong"],
  agreement: ["w", "yes", "yep", "yup", "ye", "agree", "approve", "facts", "true", "truth", "this", "nod", "ok", "okay", "okayge", "same", "real", "valid", "bet"],
  victory: ["gg", "ggs", "win", "winner", "victory", "ez", "ezclap", "champ", "trophy", "clutch", "dub", "dubs", "w", "first", "crown"],
  spam: ["w", "l", "spam", "ratio", "pump", "wall"],
  laugh: ["kek", "kekw", "kekl", "lul", "lulw", "omegalul", "lol", "lmao", "icant", "xd", "xdd", "haha", "laugh", "giggl", "joker", "clown", "kappa", "4head", "pepega", "bruh", "troll", "plz", "roflan", "cringe", "joel"],
  sad: ["sad", "sadge", "sadeg", "cry", "crying", "sob", "tear", "pepehands", "feelsbad", "despair", "grief", "hurt", "rip", "pain", "copium", "hopium", "monka", "widepeeposad", "awkward"],
  frustrated: ["mald", "madge", "rage", "angry", "anger", "mad", "reee", "ree", "tilt", "cope", "smh", "facepalm", "sigh", "ugh", "nooo", "aaa", "anger"],
  confused: ["huh", "hmm", "hmmge", "wut", "what", "wat", "confus", "think", "thonk", "5head", "galaxybrain", "clueless", "susge", "sus", "erm", "aintnoway", "stare", "aware", "pause"],
  question: ["hmm", "think", "thonk", "huh", "wut", "ask", "question", "5head", "wonder"],
  love: ["love", "heart", "hearts", "hug", "comfy", "wholesome", "blush", "kiss", "cute", "uwu", "aww", "bless", "pat", "pet", "snug", "cuddl", "smile", "happy", "pray", "praise", "peepoye", "nice"],
  idle: ["afk", "sleep", "sleepo", "bedge", "zzz", "lurk", "lurkge", "bored", "wait", "waiting", "sip", "chill", "vibe", "jam", "bop", "danc", "groove", "relax", "idle", "nap"],
  // Never guessed: "general" means the streamer said "use this anywhere",
  // which is not something a name can say.
  general: [],
};

/** Lowercased, punctuation and separators stripped: `peepo_Hi!` -> `peepohi`. */
export function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The forms of a name worth matching against.
 *
 * `widePeepoHappy` should find `happy`, and `Sadge` should find `sad`, so
 * the decoration comes off — but only one layer at each end, or `swipe`
 * becomes `i` and matches nothing useful.
 */
function forms(name: string): string[] {
  const base = normalise(name);
  const out = new Set<string>([base]);

  // `WWW` and `wwwww` are the same word as `W`, and chat types all three.
  if (/^(.)\1+$/.test(base)) out.add(base[0]);

  for (const prefix of PREFIXES) {
    if (base.length > prefix.length + 1 && base.startsWith(prefix)) {
      out.add(base.slice(prefix.length));
    }
  }
  for (const form of [...out]) {
    for (const suffix of SUFFIXES) {
      if (form.length > suffix.length + 1 && form.endsWith(suffix)) {
        out.add(form.slice(0, -suffix.length));
      }
    }
  }
  return [...out];
}

/**
 * Whether a name carries a word's meaning.
 *
 * Anchored: the whole name, or the name with pack decoration removed, or the
 * word at one end of it. `peepoHi` and `hiThere` are greetings; `thinking`
 * is not, however much of `hi` it contains.
 */
function carries(name: string, word: string): boolean {
  /**
   * A one or two letter word has to be the whole name.
   *
   * Anchoring is not enough for them: `w` as a prefix match makes every
   * emote beginning with the letter w a spam token — `widePog`, `whip`,
   * `WeirdChamp` — and `KEKW` a victory because it happens to end in one.
   */
  const whole = word.length <= 2;
  return forms(name).some((form) =>
    whole ? form === word : form === word || form.startsWith(word) || form.endsWith(word),
  );
}

/**
 * Everything this emote appears to mean, or an empty list.
 *
 * Empty is a real answer and the important one: it keeps channel in-jokes
 * out of contextual selection instead of letting them stand in for emotes
 * that actually fit.
 */
export function meaningsOf(name: string): readonly EmoteTag[] {
  const key = normalise(name);
  const hit = cache.get(key);
  if (hit) return hit;

  const found: EmoteTag[] = [];
  for (const [tag, words] of Object.entries(MEANINGS) as Array<[EmoteTag, readonly string[]]>) {
    if (words.some((word) => carries(name, word))) found.push(tag);
  }
  cache.set(key, found);
  return found;
}

/**
 * Names are a fixed, small set and the answer never changes, but the
 * selector asks about every emote in the pack on every line — six hundred
 * names times three hundred messages a minute. Measured without this: a
 * one-hour test run went from seconds to eight minutes.
 */
const cache = new Map<string, readonly EmoteTag[]>();

/** Whether anything at all is known about this emote's meaning. */
export function hasMeaning(name: string): boolean {
  return meaningsOf(name).length > 0;
}
