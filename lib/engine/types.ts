/** Shared vocabulary for the simulation engine. */

// ---------------------------------------------------------------- classifier

/**
 * What the streamer just did, as far as the deterministic classifier can tell.
 * This drives which response pools are eligible.
 */
export type Intent =
  | "greeting"
  | "question_to_chat" // streamer asked chat something — chat should answer
  | "directive" // streamer told chat to do something — chat should comply
  | "excitement" // something good happened
  | "struggle" // something went wrong, streamer is frustrated
  | "achievement" // streamer succeeded at something
  | "story" // extended talking, a bit of narrative
  | "confusion" // streamer is lost or puzzled
  | "showing" // "look at this", presenting something on screen
  | "farewell"
  | "mundane"; // filler talk with no strong signal

export type Sentiment = "positive" | "negative" | "neutral";

export interface Classification {
  intent: Intent;
  sentiment: Sentiment;
  /** 0..1 — how animated the streamer is. Drives message volume. */
  energy: number;
  /** Nouns/topics lifted from the transcript, usable as template slots. */
  keywords: string[];
  /** 0..1 — how sure we are. Low confidence is what invites the AI tier in. */
  confidence: number;
  /**
   * What chat was told to post, for `directive` intents.
   *
   * Undefined when the instruction had no quotable target ("let me hear it"),
   * which chat answers with enthusiasm rather than a specific token.
   */
  directiveTarget?: string;
  /**
   * What a `question_to_chat` is actually asking about.
   *
   * Intent alone cannot separate "can you hear me" from "roof or walls", and
   * they need completely different answers — one has a correct response and
   * the other is an opinion.
   */
  subject?: "audio" | "visual" | "presence";
}

// --------------------------------------------------------------- population

export type PersonalityId =
  | "hype"
  | "lurker"
  | "chatty"
  | "curious"
  | "wholesome"
  | "jokester"
  | "newcomer"
  | "regular"
  | "emoter";

export interface Personality {
  id: PersonalityId;
  label: string;
  /** Relative frequency when building a population. */
  weight: number;
  /** [min, max] ranges, sampled per viewer so no two are identical. */
  activity: readonly [number, number];
  verbosity: readonly [number, number];
  emoteAffinity: readonly [number, number];
  /** Multipliers applied to pool entries carrying these tags. */
  tagBias: Readonly<Partial<Record<string, number>>>;
}

export interface Viewer {
  id: string;
  name: string;
  /** Vocabulary this name consumed, released back to the pool on removal. */
  nameWords: string[];
  color: string;
  personality: PersonalityId;
  /** 0..1 — relative likelihood of being the one who speaks. */
  activity: number;
  /** 0..1 — bias toward longer messages. */
  verbosity: number;
  /** 0..1 — likelihood of reaching for an emote. */
  emoteAffinity: number;
  /** Wall-clock ms of this viewer's last message; throttles repeat speakers. */
  lastSpokeAt: number;
}

// ----------------------------------------------------------------- messages

export type MessageKind =
  | "reaction"
  | "idle"
  | "greeting"
  | "question"
  | "reply"
  | "system";

/**
 * Where a message's words came from. Tracked for the dev trace.
 *
 *   ai         the model wrote it
 *   emote      the model's line was rendered as an emote instead
 *   directive  the token the streamer asked chat to spam
 *   system     the app itself
 */
export type MessageSource = "ai" | "emote" | "directive" | "system";

export interface ChatMessage {
  id: string;
  viewerId: string;
  username: string;
  color: string;
  text: string;
  kind: MessageKind;
  source: MessageSource;
  /** Wall-clock ms at which this message should appear. */
  at: number;
  /** Username this message is answering, when it's part of a side thread. */
  replyTo?: string;
}

/** A message the director has decided on but the scheduler hasn't released. */
export interface PendingMessage extends Omit<ChatMessage, "at"> {
  /** Ms after the burst's start at which this should land. */
  offset: number;
}

// ------------------------------------------------------------------ emotes

/**
 * What an emote expresses. Used to keep a burst tonally coherent — random
 * emote selection produces nonsense like "monkaS Sadge PogU".
 */
export type EmoteMood =
  | "funny"
  | "love"
  | "hype"
  | "sad"
  | "confused"
  | "chill"
  /**
   * Mood could not be determined from the name.
   *
   * Imported packs are full of channel-specific names ("xqcWOT", "GAMBA")
   * that match no keyword. Filing those under a real mood would be a guess
   * that locks most of a pack to one kind of moment; treating them as a
   * wildcard lets them appear anywhere at moderate weight, which is both
   * honest and makes the pack actually usable.
   */
  | "unknown";

/**
 * What a moment an emote suits.
 *
 * Deliberately the same vocabulary as Intent plus "idle" and "general", so a
 * tag can be matched against the classifier's output with no translation.
 */
export type EmoteTag =
  | "greeting"
  | "farewell"
  | "hype"
  | "achievement"
  | "struggle"
  | "confusion"
  | "question"
  | "showing"
  | "story"
  | "idle"
  | "general";

export const EMOTE_TAGS: readonly EmoteTag[] = [
  "greeting",
  "farewell",
  "hype",
  "achievement",
  "struggle",
  "confusion",
  "question",
  "showing",
  "story",
  "idle",
  "general",
];

export interface Emote {
  id: string;
  /** The token as typed in chat, e.g. "KEKW". */
  name: string;
  mood: EmoteMood;
  /**
   * Tags the user assigned by hand.
   *
   * Absent on every emote until someone edits one, and checked before mood —
   * guessing a category from a name like "GAMBA" or "xqcWOT" is unreliable, so
   * the person who imported the pack gets the final say.
   */
  tags?: readonly EmoteTag[];
  /** Image URL. Required — there is no text-only emote tier. */
  url: string;
  width?: number;
  height?: number;
}
