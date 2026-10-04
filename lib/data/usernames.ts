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

/**
 * There is no keyboard-mash style.
 *
 * There used to be — "every chat has a couple" — and it was capped, then
 * capped per cohort, and a live session still saw ujmgfwi, vldykh and
 * sidygxm scroll past at a busy tier. Real random handles are rarer than
 * that and do not read as broken; generated ones do. When the word lists run
 * low the generator reuses vocabulary, then falls back to a word and a
 * number, both of which read as names.
 */
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
 * Username colour palette.
 *
 * This is the original palette, restored verbatim. An earlier version swapped
 * it for "more readable" variants, which changed the look of the product — the
 * whole point is that it reads as a real Twitch chat, and these are the colours
 * Twitch actually assigns. Do not "improve" these.
 */
export const USERNAME_COLORS = [
  "#FF0000", // Red
  "#3333FF", // Blue
  "#00FF00", // Green (Lime)
  "#B22222", // FireBrick
  "#FF7F50", // Coral
  "#9ACD32", // YellowGreen
  "#FF4500", // OrangeRed
  "#2E8B57", // SeaGreen
  "#DAA520", // GoldenRod
  "#D2691E", // Chocolate
  "#5F9EA0", // CadetBlue
  "#1E90FF", // DodgerBlue
  "#FF69B4", // HotPink
  "#8A2BE2", // BlueViolet
  "#00FF7F", // SpringGreen
] as const;
