/**
 * Username generation.
 *
 * Two things matter more for realism than the word lists themselves:
 *
 *  1. Style weights. Real chat names are mostly lowercase and mostly boring;
 *     the "EpicShadowSlayer420" pattern is rare. A chat where every name is
 *     Adjective+Noun+Number reads as synthetic within seconds.
 *  2. Component reuse. Even with unique full names, seeing `bramble`,
 *     `littlebramble` and `wobbly_bramble` in the same chat is an obvious
 *     tell. The generator tracks individual *words*, not just finished names,
 *     and won't reuse one until the vocabulary is exhausted.
 */

import type { Rng } from "../engine/rng";

/** Everyday handles — the bulk of any real chat. */
const PLAIN = [
  "marcus", "jenna", "toby", "priya", "devon", "sam", "kira", "noah", "lena",
  "omar", "riley", "june", "hana", "eli", "mira", "jonas", "tess", "arun",
  "cleo", "nate", "yuki", "beck", "iris", "milo", "faye", "dre", "sasha",
  "quinn", "theo", "wren", "otis", "nadia", "cole", "ines", "bo", "leni",
  "asha", "reid", "esme", "kian", "vera", "hugo", "nora", "dash", "opal",
  "linus", "maya", "roan", "sena", "tariq", "elka", "bodhi", "wynn", "ravi",
  "clara", "finn", "greta", "idris", "juno", "kaz", "lior", "mae", "nils",
];

/** Soft/cozy vocabulary — fits chill and creative streams. */
const COZY = [
  "moss", "fern", "clover", "bramble", "willow", "pebble", "sprout", "acorn",
  "dandelion", "mushroom", "toadstool", "lantern", "quilt", "cocoa", "muffin",
  "biscuit", "marmalade", "pudding", "waffle", "honey", "maple", "cinnamon",
  "peach", "plum", "sage", "juniper", "birch", "meadow", "drizzle", "puddle",
  "mitten", "blanket", "teacup", "kettle", "porridge", "crumpet", "scone",
  "thistle", "heather", "nettle", "barley", "hazel", "aspen", "cedar",
  "pinecone", "conker", "bracken", "harvest", "lichen", "burrow", "hollow",
];

const COZY_PREFIX = [
  "sleepy", "soft", "cozy", "tiny", "little", "quiet", "gentle", "warm",
  "fuzzy", "sunny", "misty", "dozy", "wobbly", "silly", "smol", "round",
  "snug", "murky", "dusty", "damp", "crisp", "hazy", "mellow", "plump",
];

/** Slightly more online-brained names. */
const NET = [
  "bloop", "hex", "static", "glitch", "pixel", "byte", "loop", "null", "void",
  "echo", "vapor", "neon", "flux", "ember", "onyx", "cinder", "drift", "haze",
  "rust", "corvid", "moth", "crow", "fox", "otter", "heron", "newt", "shrike",
  "vex", "quark", "lumen", "cobalt", "argon", "flint", "quill", "tundra",
];

const SUFFIX = ["_", "__", "xd", "ttv", "irl", "zzz", "uwu", "ish", "eh"];

/** A candidate name plus the vocabulary words it consumed. */
interface Candidate {
  name: string;
  words: string[];
}

type Style = { build: (rng: Rng) => Candidate; weight: number };

const STYLES: Style[] = [
  // A plain lowercase first name. Extremely common and easy to forget.
  {
    weight: 20,
    build: (r) => {
      const word = r.pick(PLAIN);
      return { name: word, words: [word] };
    },
  },

  // Name plus a number — often a birth year, sometimes just noise.
  {
    weight: 14,
    build: (r) => {
      const word = r.pick(PLAIN);
      const n = r.chance(0.5) ? r.int(88, 99) : r.int(1, 999);
      return { name: `${word}${n}`, words: [word] };
    },
  },

  // Two cozy words smashed together.
  {
    weight: 16,
    build: (r) => {
      const prefix = r.pick(COZY_PREFIX);
      const noun = r.pick(COZY);
      return { name: `${prefix}${noun}`, words: [prefix, noun] };
    },
  },

  // A single cozy noun, sometimes with a trailing underscore.
  {
    weight: 12,
    build: (r) => {
      const word = r.pick(COZY);
      return { name: `${word}${r.chance(0.3) ? "_" : ""}`, words: [word] };
    },
  },

  // Underscore-separated.
  {
    weight: 10,
    build: (r) => {
      const prefix = r.pick(COZY_PREFIX);
      const noun = r.pick(COZY);
      return { name: `${prefix}_${noun}`, words: [prefix, noun] };
    },
  },

  // Net-flavored single word.
  {
    weight: 9,
    build: (r) => {
      const word = r.pick(NET);
      return {
        name: `${word}${r.chance(0.4) ? r.int(1, 99) : ""}`,
        words: [word],
      };
    },
  },

  // Something with a suffix tacked on.
  {
    weight: 8,
    build: (r) => {
      const word = r.pick([...PLAIN, ...COZY, ...NET]);
      return { name: `${word}${r.pick(SUFFIX)}`, words: [word] };
    },
  },

  // Keyboard-mash names. Rare, but every chat has a couple. These consume no
  // vocabulary, so they're always available as a pressure valve.
  {
    weight: 5,
    build: (r) => {
      const letters = "abcdefghijklmnopqrstuvwxyz".split("");
      const len = r.int(4, 7);
      let name = "";
      for (let i = 0; i < len; i++) name += r.pick(letters);
      return { name, words: [] };
    },
  },

  // The classic gamer tag — deliberately the rarest style.
  {
    weight: 6,
    build: (r) => {
      const prefix = r.pick(COZY_PREFIX);
      const noun = r.pick(NET);
      const capped = noun.charAt(0).toUpperCase() + noun.slice(1);
      return {
        name: `${prefix}${capped}${r.int(10, 99)}`,
        words: [prefix, noun],
      };
    },
  },
];

const TOTAL_STYLE_WEIGHT = STYLES.reduce((sum, s) => sum + s.weight, 0);

function pickStyle(rng: Rng): Style {
  let roll = rng.next() * TOTAL_STYLE_WEIGHT;
  for (const style of STYLES) {
    roll -= style.weight;
    if (roll < 0) return style;
  }
  return STYLES[STYLES.length - 1];
}

export interface NameResult {
  name: string;
  /** Vocabulary consumed — the caller must add these to `usedWords`. */
  words: string[];
}

/**
 * Generates a username whose full form and component words are both unused.
 *
 * Tries hard for a fully fresh name, then relaxes to allowing word reuse (the
 * vocabulary is finite and a large audience will exhaust it), then falls back
 * to a numeric suffix that always terminates.
 */
export function generateUsername(
  rng: Rng,
  takenNames: ReadonlySet<string>,
  usedWords: ReadonlySet<string>,
): NameResult {
  // Pass 1: fresh name AND fresh vocabulary.
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = pickStyle(rng).build(rng);
    if (takenNames.has(candidate.name.toLowerCase())) continue;
    if (candidate.words.some((w) => usedWords.has(w))) continue;
    return candidate;
  }

  // Pass 2: vocabulary is running out — accept a repeat word, not a repeat name.
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = pickStyle(rng).build(rng);
    if (!takenNames.has(candidate.name.toLowerCase())) return candidate;
  }

  // Pass 3: guaranteed to terminate.
  let n = rng.int(100, 9999);
  const word = rng.pick(PLAIN);
  let name = `${word}${n}`;
  while (takenNames.has(name.toLowerCase())) name = `${word}${++n}`;
  return { name, words: [] };
}

/**
 * Twitch's default username palette, filtered to colors that stay readable on
 * a dark background. The stock palette includes a near-black blue that is
 * genuinely unreadable, which is why this isn't just a copy of it.
 */
export const USERNAME_COLORS = [
  "#FF4A4A", "#FF7F50", "#FF69B4", "#FFAA00", "#F0C674",
  "#9ACD32", "#5CD65C", "#2ED9A0", "#5F9EA0", "#4FC3F7",
  "#5B8DFF", "#B39DFF", "#D291FF", "#FF8FD6", "#E8A87C",
] as const;
