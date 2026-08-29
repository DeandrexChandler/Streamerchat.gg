import type { EmoteMood } from "../engine/types";

/**
 * Assigns an emotional connotation to an imported emote, from its name.
 *
 * The director needs a mood for every emote or it can't keep a burst tonally
 * coherent — random selection is what produced "monkaS Sadge PogU", mixing
 * grief and hype in one breath.
 *
 * This is deliberately a lookup rather than a model call. Emote names are
 * short, highly conventional, and reused across thousands of channels: "KEKW"
 * means the same thing everywhere. Classifying a 500-emote pack with a
 * language model would be slow, cost money, and produce a different answer
 * every run, in exchange for accuracy on a handful of genuinely novel names.
 *
 * Rules are ordered — the first match wins — so put specific patterns above
 * the general ones they'd otherwise be swallowed by.
 */

interface Rule {
  mood: EmoteMood;
  /** Lowercase substrings. Matched against the lowercased emote name. */
  match: readonly string[];
}

const RULES: readonly Rule[] = [
  // Anxiety reads as distress, and "monka" would otherwise hit nothing.
  { mood: "sad", match: ["monka", "pepehands", "feelsbad", "sadge", "sadeg"] },

  // "peepoSad", "widepeepoSad", "Despair", "PepeCry"…
  {
    mood: "sad",
    match: ["sad", "cry", "sob", "tear", "despair", "pain", "hurt", "rip", "grief", "cope", "mald", "copium", "hopium", "madge", "rage", "nooo"],
  },

  // Laughter. "KEKW", "OMEGALUL", "ICANT", "PLZ", "xdd", "Joel"…
  {
    mood: "funny",
    match: ["kek", "lul", "lol", "lmao", "icant", "xdd", "haha", "laugh", "joker", "clown", "kappa", "4head", "plz", "roflan", "cringe", "pepega", "bruh", "troll"],
  },

  // Warmth. Checked before hype so "peepoHappy" doesn't land as excitement.
  {
    mood: "love",
    match: ["love", "heart", "hug", "happy", "comfy", "wholesome", "blush", "kiss", "cute", "uwu", "aww", "bless", "peepoye", "hearts", "pet", "pat", "snug", "cuddl", "smile", "wave", "pray", "praise"],
  },

  // Excitement.
  {
    mood: "hype",
    match: ["pog", "hype", "letsgo", "lesgo", "ez", "clap", "gigachad", "chad", "based", "sheesh", "wicked", "fire", "hooray", "cheer", "yay", "win", "goat", "banger", "approve", "yes", "hyper", "raid", "boom", "lit", "rock", "flex", "strong", "yep", "cook", "yesyes"],
  },

  // Puzzlement. "susge" and "clueless" are suspicion, close enough to fit.
  {
    mood: "confused",
    match: ["think", "thonk", "hmm", "5head", "galaxybrain", "wut", "what", "huh", "clueless", "susge", "sus", "stare", "erm", "wat", "confus", "aintnoway", "aware"],
  },

  // Ambient / vibing. Broad on purpose — this is the fallback flavour.
  {
    mood: "chill",
    match: ["jam", "vibe", "bop", "dance", "danc", "groove", "nod", "sleep", "bedge", "sleepo", "lurk", "sip", "chill", "cat", "relax", "afk", "wave", "peace", "hi", "bye", "o7", "okayge", "okay"],
  },
];

/**
 * Best-guess mood for an emote name, or "unknown".
 *
 * Returning "unknown" rather than defaulting to a real mood matters at scale:
 * a large channel pack is mostly channel-specific names that match nothing,
 * and filing all of them under "chill" would mean 86% of an imported pack only
 * ever appeared in calm moments. As "unknown" they stay usable everywhere.
 */
export function classifyEmote(name: string): EmoteMood {
  const lower = name.toLowerCase();

  for (const rule of RULES) {
    for (const needle of rule.match) {
      if (lower.includes(needle)) return rule.mood;
    }
  }

  return "unknown";
}
