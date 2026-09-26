import type { Rng } from "../engine/rng";
import type { PersonalityId, Voice } from "../engine/types";

/**
 * How one viewer's typing differs from the next.
 *
 * Measured, not invented. `npm run sample -- <channel> <secs> voices` prints
 * per-chatter traits from a real chat; these ranges are centred between two
 * channels sampled on 2026-09-23, which sit either side of what this product
 * simulates:
 *
 *                 silky (1.3/sec)     ironmouse (0.5/sec)
 *   median words  2.6  (1 → 5)        6.0  (1 → 13)
 *   emote-only    35%  (9 → 73%)      42%  (0 → 83%)
 *   ALL CAPS      29%  (0 → 73%)       2%  (0 → 8%)
 *   punctuation    3%  (0 → 14%)       3%  (0 → 0%)
 *   questions      2%  (0 → 11%)       3%  (0 → 6%)
 *   stretching    11%  (0 → 27%)       0%
 *
 * The important number is not the average — it is how far apart two people
 * in the same room are. A room where everyone sits on the mean is the bot
 * farm. The ranges below are deliberately the middle of the two channels:
 * strong enough to tell two regulars apart over a session, not so strong
 * that anyone reads as a costume.
 */

/** Trait ranges before the archetype nudges them. */
const BASE = {
  /** Shouting as a habit. Between silky's 29% and ironmouse's 2%. */
  caps: [0, 0.3],
  /** Almost nobody punctuates; the ones who do are noticeable. */
  punctuation: [0, 0.06],
  questions: [0, 0.08],
  stretch: [0, 0.12],
} as const;

/** What a person brings up when there is nothing else to talk about. */
const INTERESTS = [
  "their own terrible sleep schedule",
  "snacks",
  "their cat",
  "the gym",
  "night shifts at work",
  "whatever they are meant to be revising",
  "football",
  "their broken setup",
  "the weather where they are",
  "a game they are stuck on",
  "cooking badly",
  "their commute",
  "the streamer's old VODs",
  "music they have on in the background",
  "their dog",
  "being broke until payday",
] as const;

/**
 * Archetype nudges, as multipliers.
 *
 * Small on purpose: the archetype already decides how often someone talks
 * and how emote-heavy they are. This only tilts *how* they type.
 */
const NUDGE: Record<PersonalityId, Partial<Record<keyof typeof BASE, number>>> = {
  lurker: { caps: 0.6, stretch: 0.6 },
  chatty: { questions: 1.4, punctuation: 1.3 },
  hype: { caps: 2.2, stretch: 1.8, punctuation: 0.3 },
  wholesome: { stretch: 1.6, punctuation: 1.4, caps: 0.5 },
  curious: { questions: 3.2, punctuation: 1.6, caps: 0.4 },
  jokester: { caps: 1.3, stretch: 1.4 },
  emoter: { caps: 1.6, punctuation: 0.2, questions: 0.3 },
  regular: { punctuation: 1.5, questions: 1.2 },
  newcomer: { questions: 2.0, punctuation: 1.3, caps: 0.5 },
};

/** Builds one person's typing habits. Seeded, so a session is reproducible. */
export function buildVoice(rng: Rng, personality: PersonalityId, verbosity: number): Voice {
  const nudge = NUDGE[personality] ?? {};
  const trait = (name: keyof typeof BASE): number => {
    const [low, high] = BASE[name];
    return Math.min(0.45, rng.float(low, high) * (nudge[name] ?? 1));
  };

  const interests = [...INTERESTS];
  const first = interests.splice(Math.floor(rng.float(0, interests.length)), 1)[0];
  const second = interests.splice(Math.floor(rng.float(0, interests.length)), 1)[0];

  return {
    // One to twelve words, off the archetype's own verbosity, which is what
    // the measured medians span.
    words: Math.max(1, Math.round(1 + verbosity * 11)),
    caps: trait("caps"),
    punctuation: trait("punctuation"),
    questions: trait("questions"),
    stretch: trait("stretch"),
    interests: [first, second],
  };
}

/**
 * The voice as a phrase the model can write in.
 *
 * Only habits that are actually pronounced get mentioned: listing every
 * trait on every person would fill the prompt with "sometimes punctuates",
 * which is not a voice and costs tokens on every call.
 */
export function describeVoice(voice: Voice): string {
  const habits: string[] = [];

  if (voice.words <= 2) habits.push("posts a word or two at a time");
  else if (voice.words <= 5) habits.push("short lines");
  else if (voice.words >= 9) habits.push("writes whole paragraphs for a chat message");
  else habits.push("writes proper sentences");

  if (voice.caps >= 0.22) habits.push("shouts in caps when something happens");
  if (voice.punctuation >= 0.05) habits.push("actually punctuates");
  if (voice.questions >= 0.12) habits.push("asks questions constantly");
  if (voice.stretch >= 0.1) habits.push("stretches wordsss");

  habits.push(`brings up ${voice.interests[0]} and ${voice.interests[1]}`);
  return habits.join(", ");
}
