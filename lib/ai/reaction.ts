import { z } from "zod";
import type { EmoteMood, Intent } from "../engine/types";

/**
 * One audience reaction, as the model returns it.
 *
 * Structured rather than a bare string because the division of labour is the
 * whole point: the AI decides *what* the audience says and roughly how it
 * feels, and the deterministic side decides who says it, when, and which
 * emote fits. The model never picks an image URL.
 */

export type ReactionKind =
  | "reaction"
  | "question"
  | "joke"
  | "callback"
  | "agree"
  | "disagree"
  | "emote";

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
    .enum(["reaction", "question", "joke", "callback", "agree", "disagree", "emote"])
    .optional(),
  /**
   * How eager this viewer is, 0..1.
   *
   * A hint, not a schedule. The simulation owns timing; this only orders
   * reflexive one-word replies ahead of the person who took a moment to type
   * a sentence, which is what makes a batch read as a room rather than a list.
   */
  eagerness: z.number().min(0).max(1).optional(),
});

export type Reaction = z.infer<typeof ReactionSchema>;

export const ReactionBatchSchema = z.array(ReactionSchema).max(40);

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
}
