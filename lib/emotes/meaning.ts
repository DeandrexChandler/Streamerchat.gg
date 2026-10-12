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
const SUFFIXES = ["ge", "w", "s", "e", "ing", "ed", "hd", "x", "xd"];

/**
 * The vocabulary, tag by tag.
 *
 * Deliberately overlapping: `w` is four things, `o7` is both a greeting and
 * a farewell and respect, `rip` is sadness and respect depending on the
 * moment. Words of four letters or more also match as the start of a word,
 * so `laugh` finds `Laughing` and `danc` finds `dancin`.
 */
const MEANINGS: Readonly<Record<EmoteTag, readonly string[]>> = {
  // Feelings.
  happy: ["happy", "happi", "smile", "smiling", "glad", "joy", "nice", "pleased", "content", "grin", "yay"],
  love: ["love", "heart", "hearts", "kiss", "cute", "uwu", "aww", "blush", "wholesome", "bless", "peepoye", "ily", "adore"],
  hype: ["clap", "pog", "poggers", "pogu", "pogchamp", "pogo", "hype", "hypers", "letsgo", "lesgo", "sheesh", "fire", "boom", "cheer", "hooray", "banger", "raid", "wicked", "bussin", "insane", "yoo", "ayy", "lets"],
  laugh: ["kek", "kekw", "kekl", "lul", "lulw", "omegalul", "lol", "lolol", "lmao", "icant", "xd", "xdd", "haha", "hehe", "laugh", "giggl", "rofl", "pft", "pepega", "bruh", "roflan", "joel", "funny", "silly", "goofy", "dead"],
  shock: ["shock", "shocked", "omg", "wtf", "woah", "whoah", "wow", "noway", "gasp", "omgbruh", "jaw", "surprise", "surprised", "ohshit", "ohshi", "speechless", "cantbelieve", "flashbang", "myeyes", "o", "what"],
  scared: ["scared", "scawy", "scary", "monka", "fear", "afraid", "nervous", "sweat", "panic", "spook", "jumpscare", "alert", "alarm", "scream", "shake", "shaking", "stressed", "cortisol", "ohno", "help", "saveme", "gulp"],
  relief: ["relief", "relieved", "phew", "whew", "finally", "healed", "saved", "safe", "survived"],
  sad: ["sad", "sadge", "sadeg", "cry", "sob", "tear", "tears", "pepehands", "feelsbad", "despair", "grief", "hurt", "rip", "pain", "ripbozo", "emotional", "lonely", "lone", "depressed", "agony", "widepeeposad", "naur", "crying"],
  comfort: ["hug", "hugs", "hugg", "pat", "pet", "pats", "cuddl", "comfort", "there", "snuggl"],
  angry: ["angry", "anger", "mad", "madge", "rage", "ragey", "reee", "ree", "mald", "malding", "fume", "furious", "triggered", "seethe"],
  frustrated: ["tilt", "tilted", "smh", "facepalm", "sigh", "ugh", "no", "aaa", "annoyed", "deadass", "why"],
  disgust: ["ew", "eww", "gross", "disgust", "disgusted", "stinky", "stink", "smell", "yuck", "vomit", "puke", "bleh", "nasty"],
  cringe: ["cringe", "awkward", "weird", "weirdge", "weirdchamp", "nerd", "creep", "yikes", "embarrass", "glazing", "erm"],
  confused: ["huh", "hmm", "hmmge", "wut", "wat", "confus", "think", "thonk", "5head", "galaxybrain", "uh", "uhm", "um", "wdym", "que", "buh", "wuh", "juh", "guh", "tuh", "ponder", "pondering", "err", "lost"],
  sus: ["sus", "susge", "sussy", "sideeye", "suspicious", "pause", "ayo", "ayoo", "judg", "caught", "sneak", "devious", "scheming", "plot", "plotge", "aware"],
  aura: ["aura", "gigachad", "chad", "based", "goat", "goated", "flex", "strong", "sturdy", "cool", "kool", "imhim", "lockin", "focus", "sigma", "swag", "drip", "king", "cook", "cooked"],
  respect: ["o7", "salute", "respect", "bow", "pray", "prayge", "praise", "thankyou", "thanku", "thanks", "ty", "f", "honor"],
  chill: ["chill", "relax", "comfy", "cozy", "snug", "sip", "coffee", "calm", "smoke", "peaceful", "zen"],
  crazy: ["crazy", "schizo", "tweak", "tweaker", "tweaking", "crashout", "tripout", "trip", "unhinged", "adhd", "cte", "wild", "chaos", "deranged"],
  troll: ["troll", "kappa", "4head", "clown", "joker", "smug", "evil", "instigate", "gotem", "yougotme", "laughingatyou", "ez"],
  cope: ["cope", "copium", "hopium", "clueless", "surely", "delusional", "denial", "copege"],
  idle: ["afk", "sleep", "sleepo", "bedge", "zzz", "lurk", "lurkge", "bored", "wait", "waiting", "idle", "nap", "tired", "yawn", "offline", "unfocus"],

  // What chat is doing.
  greeting: ["hi", "hii", "hiya", "hello", "henlo", "hey", "heyy", "wave", "waving", "o7", "welcome", "sup", "yo", "gm", "morning", "arrive"],
  farewell: ["bye", "byebye", "goodbye", "gn", "gnight", "goodnight", "cya", "seeya", "later", "peace", "o7", "leave"],
  agreement: ["w", "yes", "yep", "yup", "ye", "agree", "approve", "facts", "true", "truth", "trueing", "this", "nod", "nodders", "ok", "okay", "okayge", "same", "real", "valid", "bet", "mhm", "mmm", "ofcourse", "fair", "fairs", "noted", "classic", "alright", "olrite", "wegood", "np"],
  disagree: ["nah", "nahh", "nope", "nuhuh", "nono", "disagree", "wrong", "enough", "thatsenough", "stop", "getout", "backoff", "dontdoit", "skip"],
  question: ["hmm", "think", "thonk", "huh", "wut", "ask", "question", "5head", "wonder", "wdym"],
  victory: ["gg", "ggs", "win", "winner", "victory", "ezclap", "champ", "trophy", "clutch", "dub", "dubs", "w", "first", "maxwin", "crown", "wedidit", "celebrat"],
  spam: ["w", "l", "spam", "ratio", "pump", "wall"],

  // What it is about.
  watching: ["watch", "watching", "listening", "stare", "staring", "eyes", "popcorn", "reacting", "reaction", "noticing", "notice", "peek", "cinema", "pov", "chatting", "reading", "notes"],
  dance: ["jam", "bop", "danc", "dans", "groove", "vibe", "pls", "rave", "bass", "dj", "dwerk", "twerk", "bounce", "wiggle", "slide", "cripwalk", "jiggy", "edm", "party", "headbang", "mosh"],
  money: ["money", "mymoney", "gamba", "gamble", "dollar", "cash", "paid", "bank", "rich", "broke", "poor", "cases", "jackpot", "coins", "roulette", "slots", "bets"],
  food: ["food", "eat", "eating", "hungry", "drool", "snack", "nom", "chew", "full", "celery", "nugget", "burger", "pizza", "tomato", "munch"],
  freaky: ["sexo", "booba", "freaky", "zesty", "licka", "lick", "goon", "gyatt", "horny", "rizz", "thicc", "flirt", "simp", "spank"],
  // Never guessed: "general" means the streamer said "use this anywhere",
  // which is not something a name can say.
  general: [],
};

/** Lowercased, punctuation and separators stripped: `peepo_Hi!` -> `peepohi`. */
export function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Stretched letters squeezed out: `NOOOOO` -> `no`, `LOLLL` -> `lol`, `WWW` -> `w`. */
function squeeze(word: string): string {
  return word.replace(/(.)\1+/g, "$1");
}

/**
 * The words a name is made of.
 *
 * `wideSpeedLaugh4` is wide / speed / laugh: the casing says where the words
 * break, and a number on the end is a variant, not a word. Matching words
 * rather than the end of the whole name is what keeps `SpeedLaugh` from
 * reading as frustrated because "laugh" ends in "ugh", and `BANGER` from
 * reading as angry because it ends in "anger".
 */
function words(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 2);
}

/**
 * The whole name, in the forms worth matching.
 *
 * For names with no casing to split on — `peepohi`, `sadge` — the pack's
 * decoration comes off one layer at each end, or `swipe` becomes `i`.
 */
function forms(name: string): string[] {
  // A number on the end is a variant (`Laugh4`), unless it is the name (`o7`).
  const stripped = normalise(name).replace(/\d+$/, "");
  const base = stripped.length >= 2 ? stripped : normalise(name);
  const out = new Set<string>([base, squeeze(base)]);

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
  return [...out].filter(Boolean);
}

/**
 * Whether a name carries a word's meaning.
 *
 * The whole name, a decorated form of it, or one of its words — exactly, or
 * as the start of it for a word of four letters or more. Never the end of
 * a name: that is how `thinking` turned into a greeting and `BANGER` into
 * anger.
 */
function carries(name: string, word: string): boolean {
  /**
   * A word of three letters or fewer has to be a whole name or a whole word.
   *
   * As a prefix, `w` makes every emote beginning with the letter w a spam
   * token, `wat` reads `SillyCatTryingToDrinkWater` as confused and `tea`
   * reads a team as chill.
   */
  const exact = word.length <= 3;
  const candidates = [...forms(name), ...words(name).flatMap((w) => [w, squeeze(w)])];
  return candidates.some((form) => form === word || (!exact && form.startsWith(word)));
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
