import type { ResponseEntry } from "../../engine/types";

/**
 * Answers to questions that have a correct answer.
 *
 * Separate from `reactions.ts` because these are not reactions — asking "can
 * you hear me" and getting "hm" or "wait what was the question" back is the
 * single most obviously broken thing chat can do. Someone checking their mic
 * needs to be told yes.
 *
 * A few dissenting voices are included on purpose. A chat where forty people
 * reply "yes" in perfect unison reads as a script; one person saying "a bit
 * quiet" is what makes the rest believable.
 */

export const AUDIO_ANSWERS: readonly ResponseEntry[] = [
  { text: "yes", weight: 4, length: "tiny", tags: ["short"] },
  { text: "yeah", weight: 4, length: "tiny", tags: ["short"] },
  { text: "we can hear you", weight: 3, length: "short", tags: ["warm"] },
  { text: "loud and clear", weight: 3, length: "short" },
  { text: "audio is fine", weight: 3, length: "short" },
  { text: "sounds good", weight: 3, length: "short" },
  { text: "yep all good", weight: 2, length: "short" },
  { text: "mic is good", weight: 2, length: "short" },
  { text: "o7", weight: 2, length: "tiny", tags: ["short"] },
  { text: "clear", weight: 2, length: "tiny", tags: ["short"] },
  // Dissent, so the yeses read as people rather than a chorus.
  { text: "a bit quiet", weight: 1, length: "short" },
  { text: "little low but fine", weight: 1, length: "medium" },
  { text: "kinda loud actually", weight: 1, length: "short" },
];

export const VISUAL_ANSWERS: readonly ResponseEntry[] = [
  { text: "yes", weight: 4, length: "tiny", tags: ["short"] },
  { text: "we can see it", weight: 3, length: "short", tags: ["warm"] },
  { text: "looks good", weight: 3, length: "short" },
  { text: "yep", weight: 3, length: "tiny", tags: ["short"] },
  { text: "clear as day", weight: 2, length: "short" },
  { text: "all good", weight: 2, length: "short" },
  { text: "bit blurry", weight: 1, length: "short" },
  { text: "kinda small", weight: 1, length: "short" },
];

export const PRESENCE_ANSWERS: readonly ResponseEntry[] = [
  { text: "here", weight: 4, length: "tiny", tags: ["short"] },
  { text: "o/", weight: 4, length: "tiny", tags: ["short"] },
  { text: "im here", weight: 3, length: "short" },
  { text: "always", weight: 2, length: "tiny", tags: ["short"] },
  { text: "we never left", weight: 2, length: "short", tags: ["warm"] },
  { text: "yes", weight: 3, length: "tiny", tags: ["short"] },
  { text: "lurking", weight: 2, length: "tiny", tags: ["short"] },
  { text: "still watching", weight: 2, length: "short" },
];

/**
 * Reactions to being told to do something, for the minority who comment on the
 * instruction instead of just following it.
 */
export const DIRECTIVE_ASIDES: readonly ResponseEntry[] = [
  { text: "on it", weight: 3, length: "tiny", tags: ["short"] },
  { text: "say less", weight: 2, length: "short" },
  { text: "bet", weight: 2, length: "tiny", tags: ["short"] },
  { text: "you heard him", weight: 2, length: "short" },
  { text: "chat do it", weight: 2, length: "short" },
  { text: "no", weight: 1, length: "tiny", tags: ["short", "joke"] },
  { text: "make me", weight: 1, length: "short", tags: ["joke"] },
  { text: "why", weight: 1, length: "tiny", tags: ["short", "joke"] },
];
