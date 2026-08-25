import type { Classification, Intent, Viewer } from "./types";
import type { Rng } from "./rng";

/**
 * Whether chat cares, and how much effort it puts in.
 *
 * Two ideas live here, both aimed at the same failure: an engine that treats
 * every utterance as a prompt and every message as a statement produces a wall
 * of articulate 4-6 word observations reacting to literally everything the
 * streamer says. Real chat mostly does not do that. It ignores you, and when
 * it does respond it usually posts an emote.
 */

// ------------------------------------------------------------------ the gate

/**
 * Base probability that chat reacts at all, per intent.
 *
 * Anything aimed directly at chat always gets an answer — being ignored after
 * asking a direct question is the one failure that would read as broken rather
 * than as realistic. Everything else is fair game to skip.
 */
const BASE_ATTENTION: Record<Intent, number> = {
  question_to_chat: 1.0, // directly addressed — always
  greeting: 0.95,
  farewell: 0.95,
  achievement: 0.85,
  excitement: 0.85,
  struggle: 0.7, // messing up is a real moment — chat sympathises
  showing: 0.7,
  confusion: 0.55,
  story: 0.5, // chat listens to stories more than it interrupts them
  mundane: 0.18, // background talk mostly slides by
};

export interface AttentionContext {
  /** Messages emitted in roughly the last half minute. */
  recentVolume: number;
  /** True if this utterance's intent repeats the previous one. */
  repeatsPrevious: boolean;
}

/**
 * Decides whether an utterance is worth reacting to.
 *
 * Beyond intent, two dampers matter:
 *
 *  - Fatigue. Chat that just posted twenty messages does not immediately post
 *    twenty more. Sustained reaction to everything is what makes generated
 *    chat feel relentless.
 *  - Repetition. If the streamer keeps saying similar things, chat stops
 *    treating each one as an event.
 */
export function shouldReact(
  classification: Classification,
  context: AttentionContext,
  rng: Rng,
): boolean {
  // Never ignore a direct question, regardless of fatigue.
  if (classification.intent === "question_to_chat") return true;

  let attention = BASE_ATTENTION[classification.intent] ?? 0.3;

  // Genuine excitement cuts through everything else.
  attention += classification.energy * 0.35;

  // A confident read means we actually understood it; a guess is more likely
  // to produce a generic, pointless reaction.
  attention *= 0.65 + 0.35 * classification.confidence;

  // Repeating yourself makes chat stop treating each utterance as an event —
  // but not when you're visibly escalating, which is its own kind of moment.
  if (context.repeatsPrevious && classification.energy < 0.5) {
    attention *= 0.7;
  }

  // Fatigue ramps once chat has been *reacting* a lot. Idle chatter is
  // deliberately excluded by the caller: counting it meant a long quiet
  // stretch built up enough fatigue to suppress the reaction to whatever
  // finally broke the silence, which is exactly backwards.
  const fatigue = Math.min(0.5, context.recentVolume / 45);
  attention *= 1 - fatigue;

  return rng.chance(Math.max(0.02, Math.min(1, attention)));
}

// ----------------------------------------------------------------- the depth

/**
 * How much effort one viewer puts into one message.
 *
 *   ambient   an emote or a single word — "W", "LOL", "oof", "💀"
 *   light     two or three words
 *   engaged   a short statement
 *   invested  an actual sentence
 */
export type Depth = "ambient" | "light" | "engaged" | "invested";

/**
 * Target mix, tuned against how real chat actually reads. Roughly half of all
 * messages are a single word or an emote; full sentences are rare enough to
 * feel like someone made an effort.
 */
const BASE_MIX: Record<Depth, number> = {
  ambient: 0.5,
  light: 0.28,
  engaged: 0.17,
  invested: 0.05,
};

export interface DepthContext {
  viewer: Viewer;
  energy: number;
  /** Index within the burst. Early responders are reflexive. */
  position: number;
}

export function pickDepth(context: DepthContext, rng: Rng): Depth {
  const { viewer, energy, position } = context;

  const weights: Record<Depth, number> = { ...BASE_MIX };

  // Verbosity is the main lever: a lurker posts emotes, a chatty regular
  // writes sentences.
  weights.ambient *= 1.8 - viewer.verbosity * 1.4;
  weights.light *= 1.1 - viewer.verbosity * 0.2;
  weights.engaged *= 0.35 + viewer.verbosity * 1.5;
  weights.invested *= 0.1 + viewer.verbosity * 2.2;

  // High-energy moments produce MORE short reflexive reactions, not fewer —
  // nobody writes a paragraph while shouting.
  weights.ambient *= 1 + energy * 0.8;
  weights.invested *= 1 - energy * 0.6;

  // The first people to respond are reacting, not composing.
  if (position === 0) {
    weights.ambient *= 1.6;
    weights.invested *= 0.3;
  } else if (position >= 3) {
    // Later arrivals had time to type something.
    weights.engaged *= 1.3;
    weights.invested *= 1.5;
  }

  const entries = Object.entries(weights) as Array<[Depth, number]>;
  return rng.weighted(entries, ([, weight]) => Math.max(0, weight))[0];
}
