/** Shared vocabulary for the simulation engine. */

// ---------------------------------------------------------------- classifier

/**
 * What the streamer just did, as far as the deterministic classifier can tell.
 * This drives which response pools are eligible.
 */
export type Intent =
  | "greeting"
  | "question_to_chat" // streamer asked chat something — chat should answer
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

/** Which generator produced a message. Tracked for cost/debug visibility. */
export type MessageSource = "pool" | "template" | "ai" | "system";

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

// ------------------------------------------------------------------- pools

export type LengthClass = "tiny" | "short" | "medium" | "long";

export interface ResponseEntry {
  /** May contain `{keyword}` / `{emote}` slots for the template generator. */
  text: string;
  weight?: number;
  length?: LengthClass;
  /** Personality affinity hooks — see Personality.tagBias. */
  tags?: readonly string[];
}

export type ResponsePool = Readonly<Partial<Record<Intent, readonly ResponseEntry[]>>>;

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

export interface Emote {
  id: string;
  /** The token as typed in chat, e.g. "KEKW". */
  name: string;
  mood: EmoteMood;
  /** Image URL, or undefined for a text-only emote. */
  url?: string;
  width?: number;
  height?: number;
}
