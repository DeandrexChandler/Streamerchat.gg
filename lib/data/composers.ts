import type { ResponseEntry } from "../engine/types";

/**
 * Composed message shapes.
 *
 * The measured problem was that 71% of the pool corpus was three words or
 * fewer and nothing exceeded twelve, so no depth system could produce a real
 * sentence — the data simply did not exist.
 *
 * The fix is not one enormous file of finished sentences. That is the failure
 * mode CLAUDE.md names explicitly, and it repeats badly over a long stream.
 * Instead a small number of *shapes* are crossed with fragment banks, the
 * topic's keywords, the loaded emote set and other viewers' names, so a few
 * dozen lines of data cover a large space.
 *
 * Slots reuse the existing filler in generators/pool.ts — `{kw}`, `{user}`,
 * `{streamer}`, `{topic}` — plus the banks below, which are substituted here.
 * An entry whose slots cannot be filled is simply ineligible, so a shape
 * mentioning a keyword never fires when the classifier found none.
 */

/** Sentence openers. Most lines in real chat start with one of these. */
const OPENERS = [
  "bro", "nah", "ngl", "chat", "okay but", "wait", "honestly", "lowkey",
  "i swear", "not gonna lie", "man", "yo", "deadass", "fr",
];

/** Softeners that make a claim read as a person rather than a caption. */
const HEDGES = [
  "i genuinely thought", "i really thought", "i was convinced",
  "i actually believed", "i was sure", "i thought for a second",
];

const INTENSIFIERS = [
  "actually", "genuinely", "legitimately", "straight up", "really", "so",
];

/** Trailing reactions. Kept separate so any shape can pick one up. */
const TAILS = ["💀", "😭", "fr", "lmao", "istg", "no cap", ""];

/**
 * Shapes, by the kind of moment they suit.
 *
 * `text` goes through the normal template filler, so `{kw}` gates on the
 * classifier having found a keyword and `{user}` on there being someone to
 * reply to — the same machinery the short pools already use.
 */
export const COMPOSED_HYPE: readonly ResponseEntry[] = [
  { text: "{open} that was {int} insane", length: "medium", tags: ["hype"] },
  { text: "{open} i {hedge} you were about to lose that", length: "long", tags: ["hype"] },
  { text: "{open} chat we were NOT supposed to survive that", length: "long", tags: ["hype"] },
  { text: "{open} the {kw} play was {int} clean", length: "medium", tags: ["hype"] },
  { text: "i was not ready for that at all {tail}", length: "long", tags: ["hype"] },
  { text: "{open} that {kw} was {int} unreal", length: "medium", tags: ["hype"] },
  { text: "chat did everyone else just see that {tail}", length: "long", tags: ["hype"] },
  { text: "{open} how do you even do that", length: "medium", tags: ["hype"] },
  { text: "that might be the cleanest one yet {tail}", length: "long", tags: ["hype"] },
  { text: "{open} we are so back", length: "short", tags: ["hype"] },
  // Longer thoughts. Rare by weight, but without them nothing above about a
  // dozen words exists in the corpus at all.
  { text: "{open} i {hedge} that was completely over and then you just pulled it off {tail}", weight: 0.5, length: "long", tags: ["hype"] },
  { text: "chat i need everyone to understand how {int} difficult that actually was", weight: 0.5, length: "long", tags: ["hype"] },
  { text: "{open} i have watched a lot of people try that and none of them made it look like that", weight: 0.4, length: "long", tags: ["hype"] },
];

export const COMPOSED_STRUGGLE: readonly ResponseEntry[] = [
  { text: "{open} why did that {int} take five attempts {tail}", length: "long" },
  { text: "{open} this game gets harder every single time you play it", length: "long" },
  { text: "i {hedge} that one was going to work {tail}", length: "long" },
  { text: "{open} the {kw} is not cooperating today", length: "medium" },
  { text: "that was {int} not your fault {tail}", length: "medium", tags: ["warm"] },
  { text: "{open} we go again i guess", length: "short" },
  { text: "chat we have been here before {tail}", length: "medium", tags: ["joke"] },
  { text: "{open} i felt that one through the screen", length: "long", tags: ["warm"] },
  { text: "{open} i swear this game waits until you are doing well and then decides you are not allowed to", weight: 0.4, length: "long", tags: ["joke"] },
  { text: "honestly the fact that you are still trying this after that many attempts is impressive {tail}", weight: 0.5, length: "long", tags: ["warm"] },
];

export const COMPOSED_CURIOUS: readonly ResponseEntry[] = [
  { text: "{open} how long have you been working on the {kw}", length: "long", tags: ["question"] },
  { text: "wait is this the same {kw} as last stream", length: "long", tags: ["question"] },
  { text: "{open} what made you go with that", length: "medium", tags: ["question"] },
  { text: "genuinely curious how you figured that out", length: "long", tags: ["question"] },
  { text: "{open} is that supposed to happen", length: "medium", tags: ["question"] },
  { text: "chat does anyone know what the {kw} does", length: "long", tags: ["question"] },
  { text: "{open} i have been wondering this the whole stream but how did you learn to do that", weight: 0.4, length: "long", tags: ["question"] },
  { text: "genuinely how much of that was planned and how much of it was you improvising {tail}", weight: 0.5, length: "long", tags: ["question"] },
];

/** Callbacks — what makes a topic feel remembered rather than replayed. */
export const COMPOSED_CALLBACK: readonly ResponseEntry[] = [
  { text: "{open} still thinking about the {kw} {tail}", length: "medium", tags: ["joke"] },
  { text: "i cannot get over that {kw} {tail}", length: "medium", tags: ["joke"] },
  { text: "{open} that {kw} is going to live in my head", length: "long", tags: ["joke"] },
  { text: "@{user} you called it earlier {tail}", length: "medium" },
  { text: "{open} @{user} was right about the {kw}", length: "long" },
  { text: "we are all still recovering from that {tail}", length: "long", tags: ["joke"] },
];

/** Ordinary conversation, so the baseline is not all one-word reactions. */
export const COMPOSED_AMBIENT: readonly ResponseEntry[] = [
  { text: "{open} this stream is exactly what i needed today", length: "long", tags: ["warm"] },
  { text: "{open} i have been lurking this whole time", length: "medium" },
  { text: "chat is unusually calm today {tail}", length: "medium", tags: ["joke"] },
  { text: "{open} how is everyone doing", length: "medium", tags: ["warm"] },
  { text: "just got here what did i miss", length: "medium", tags: ["question"] },
  { text: "{open} i should probably be asleep", length: "medium", tags: ["joke"] },
  { text: "the vibes are {int} good right now", length: "medium", tags: ["warm"] },
  { text: "{open} i put this on while doing something else and now i am just watching properly", weight: 0.4, length: "long", tags: ["warm"] },
  { text: "chat we are all just sitting here at this hour watching someone play a video game {tail}", weight: 0.4, length: "long", tags: ["joke"] },
];

/** Banks the filler substitutes, keyed by slot name. */
export const FRAGMENT_BANKS: Readonly<Record<string, readonly string[]>> = {
  open: OPENERS,
  hedge: HEDGES,
  int: INTENSIFIERS,
  tail: TAILS,
};

/**
 * The middle register: a real reply, but not a paragraph.
 *
 * This tier was entirely missing. The corpus jumped from one-word reactions
 * straight to nothing, so `light` depth — a quarter of all messages — had
 * only "hm", "back" and "zzz" to draw on, and short lines dominated by
 * default rather than by choice.
 */
export const COMPOSED_LIGHT: readonly ResponseEntry[] = [
  { text: "{open} that was clean", length: "short" },
  { text: "{open} no shot", length: "short" },
  { text: "that {kw} though", length: "short" },
  { text: "{open} i felt that", length: "short" },
  { text: "okay that was {int} good", length: "medium" },
  { text: "{open} not the {kw}", length: "medium", tags: ["joke"] },
  { text: "chat are we seeing this", length: "medium" },
  { text: "{open} that is wild", length: "short" },
  { text: "i was just about to say that", length: "medium" },
  { text: "{open} you love to see it", length: "medium", tags: ["warm"] },
  { text: "that is exactly what i expected {tail}", length: "medium", tags: ["joke"] },
  { text: "{open} here we go again", length: "medium" },
  { text: "@{user} same", length: "short" },
  { text: "@{user} thats what im saying", length: "medium" },
  { text: "{open} good call on the {kw}", length: "medium" },
  { text: "nah that is actually crazy", length: "medium", tags: ["hype"] },
  { text: "{open} how did nobody notice that", length: "medium", tags: ["question"] },
  { text: "genuinely did not expect that {tail}", length: "medium" },
];
