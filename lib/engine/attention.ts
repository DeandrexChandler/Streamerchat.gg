import type { Classification, Intent } from "./types";
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
  directive: 1.0, // an instruction to chat — ignoring it reads as broken
  greeting: 0.95,
  farewell: 0.95,
  achievement: 0.85,
  excitement: 0.85,
  struggle: 0.7, // messing up is a real moment — chat sympathises
  showing: 0.7,
  confusion: 0.75,
  story: 0.6, // chat listens to stories more than it interrupts them
  /**
   * Casual talk with no strong signal.
   *
   * This was 0.18, which sounded reasonable in isolation and was badly wrong
   * in practice: roughly 60% of how people actually speak lands in `mundane`,
   * so that number set the response rate for the whole product. Combined with
   * the multipliers below it produced a chat that ignored about three
   * quarters of everything said to it.
   */
  mundane: 0.65,
};

export interface AttentionContext {
  /** Messages emitted in roughly the last half minute. */
  recentVolume: number;
  /** True if this utterance's intent repeats the previous one. */
  repeatsPrevious: boolean;
  /**
   * True if the streamer repeated an utterance that chat just ignored.
   *
   * Deliberately narrower than "said the same words again". Repeating an
   * *intent* is what talking normally looks like, and repeating a sentence
   * twenty times is not a signal at all — but saying something again
   * immediately after being ignored almost always means it did not land, and
   * that specific case deserves an answer.
   */
  repeatedAfterIgnore: boolean;
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
  if (
    classification.intent === "question_to_chat" ||
    classification.intent === "directive"
  ) {
    return true;
  }

  // Said again right after being ignored — it did not land. Answered before
  // anything else can damp it.
  if (context.repeatedAfterIgnore) return true;

  let attention = BASE_ATTENTION[classification.intent] ?? 0.4;

  // Genuine excitement cuts through everything else.
  attention += classification.energy * 0.35;

  /**
   * A confident read means we actually understood it.
   *
   * Softened from `0.65 + 0.35 * confidence`. `mundane` carries a fixed
   * confidence of 0.15, so the old curve billed it twice — once through its
   * low base rate and again here — for the single fact of being unremarkable.
   */
  attention *= 0.85 + 0.15 * classification.confidence;

  /**
   * Talking about the same kind of thing for a while is mildly less eventful.
   *
   * Only mildly. This used to be 0.7, and because `mundane` is the majority
   * bucket the condition was true for most consecutive sentences — so normal
   * speech carried a permanent penalty for not changing subject.
   */
  if (context.repeatsPrevious && classification.energy < 0.5) {
    attention *= 0.92;
  }

  // Fatigue ramps once chat has been *reacting* a lot. Idle chatter is
  // deliberately excluded by the caller: counting it meant a long quiet
  // stretch built up enough fatigue to suppress the reaction to whatever
  // finally broke the silence, which is exactly backwards.
  // Capped at 0.3: busy chat should thin out, not go quiet. The previous 0.5
  // cap meant a lively moment actively suppressed the reaction to whatever
  // the streamer said next.
  const fatigue = Math.min(0.3, context.recentVolume / 90);
  attention *= 1 - fatigue;

  return rng.chance(Math.max(0.02, Math.min(1, attention)));
}

// ----------------------------------------------------------------- the depth
