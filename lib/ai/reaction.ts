import { z } from "zod";
import type { EmoteMood, Intent } from "../engine/types";
import type { GenerationPhase } from "./provider";

/**
 * One audience reaction, as the model returns it.
 *
 * Structured rather than a bare string because the division of labour is the
 * whole point: the AI decides *what* the audience says and roughly how it
 * feels, and the deterministic side decides who says it, when, and which
 * emote fits. The model never picks an image URL.
 */

/**
 * Emotional colour, reused verbatim from the emote system's own moods so the
 * selector needs no translation table.
 */
export const REACTION_EMOTIONS = [
  "hype",
  "funny",
  "sad",
  "confused",
  "love",
  "chill",
] as const satisfies readonly EmoteMood[];

export const ReactionSchema = z.object({
  text: z.string().min(1).max(200),
  emotion: z.enum(REACTION_EMOTIONS).optional(),
  kind: z
    .enum(["answer", "reaction", "question", "opinion", "joke", "callback", "agree", "disagree", "emote"])
    .optional(),
  /**
   * How eager this viewer is, 0..1.
   *
   * A hint, not a schedule. The simulation owns timing; this only orders
   * reflexive one-word replies ahead of the person who took a moment to type
   * a sentence, which is what makes a batch read as a room rather than a list.
   */
  eagerness: z.number().min(0).max(1).optional(),
  /**
   * The emote the model thinks this line wants, by name.
   *
   * A preference, not a decision: the deterministic side checks it against
   * what is actually loaded and falls back to its own selection when the
   * name is not in the pack. The model never picks an image.
   */
  emote: z.string().max(60).optional(),
});

export type Reaction = z.infer<typeof ReactionSchema>;

/** A reaction plus the bookkeeping the queue needs. */
export interface QueuedReaction extends Reaction {
  /** Which utterance produced it, so stale batches can be aged out. */
  batchId: number;
  /** When the batch was created. */
  createdAt: number;
  /**
   * What the streamer was doing when this batch was generated.
   *
   * Carried on the reaction because a batch outlives the topic it answers —
   * topics die on momentum decay, a batch drains on its own timer — and the
   * per-viewer action rules still need to know that a line released late is
   * part of the greeting, not idle chatter.
   */
  intent?: Intent;
  /** Which phase asked for it, so the director can shape it accordingly. */
  phase?: GenerationPhase;
  /** Times nobody eligible could say it. Two and it is dropped. */
  attempts?: number;
  /** Part of the first reply to an input: one line per person. */
  wave?: boolean;
}
