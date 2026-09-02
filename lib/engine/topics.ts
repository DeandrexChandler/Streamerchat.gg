import type { Classification, Intent, Sentiment } from "./types";

/**
 * What chat is currently talking about, and how much it cares.
 *
 * This is the layer the engine was missing. Reactions used to be generated in
 * a single call per utterance — a fixed number of messages, queued, and then
 * the event ceased to exist. Measured, that made a clutch win and fetching a
 * glass of water produce interchangeable output: after about five seconds
 * nothing in the system remembered what had been said, so everything after
 * that was generic background noise.
 *
 * A topic persists that memory and gives it a magnitude, so the rest of the
 * engine can ask "is anything going on, and how much" rather than "was a
 * message just generated".
 */

export type TopicStage = "reacting" | "developing" | "referencing";
export type MomentumBand = "low" | "medium" | "high" | "viral";

export interface Topic {
  id: string;
  startedAt: number;
  /** Reset whenever chat's attention is renewed. Decay measures from here. */
  lastReinforcedAt: number;
  intent: Intent;
  sentiment: Sentiment;
  keywords: readonly string[];
  /** What was actually said, for callbacks and for AI context. */
  utterance: string;
  directiveTarget?: string;
  /** Which answerable thing a question was about, if any. */
  subject?: Classification["subject"];
  /** Peak momentum, 0..1. Sets both intensity and lifetime. */
  seed: number;
  halfLifeMs: number;
  /** Viewer id to how many times they have spoken in this topic. */
  participants: Map<string, number>;
  messagesEmitted: number;
}

/** Concurrent conversations. Three is enough to interleave without mush. */
export const MAX_TOPICS = 3;

/**
 * Momentum below which a topic is finished.
 *
 * Exponential decay never reaches zero, so without a floor a five minute old
 * joke stays technically alive at a vanishing weight, cluttering selection and
 * occasionally resurfacing.
 */
export const TOPIC_FLOOR = 0.12;

/** Nothing survives this long, however hard chat keeps feeding it. */
export const MAX_TOPIC_AGE_MS = 180_000;

/** How interesting each kind of moment is before energy and confidence apply. */
const INTENT_WEIGHT: Record<Intent, number> = {
  directive: 1.0,
  question_to_chat: 0.9,
  achievement: 0.85,
  excitement: 0.85,
  struggle: 0.6,
  showing: 0.6,
  story: 0.5,
  greeting: 0.5,
  farewell: 0.5,
  confusion: 0.45,
  mundane: 0.2,
};

/**
 * Floor for things addressed straight at chat.
 *
 * Being told to do something is interesting because it was aimed at the room,
 * not because it was shouted — so a flatly delivered "spam W" must not decay
 * like background muttering.
 */
const ADDRESSED_FLOOR = 0.75;
const ADDRESSED: ReadonlySet<Intent> = new Set<Intent>(["directive", "question_to_chat"]);

const MIN_HALF_LIFE_MS = 8_000;
const HALF_LIFE_RANGE_MS = 26_000;

const REACTING_UNTIL_MS = 3_000;
const DEVELOPING_UNTIL_MS = 12_000;

export class TopicTracker {
  private topics: Topic[] = [];
  private nextId = 0;

  /**
   * Folds an utterance into the conversation.
   *
   * Returns the topic it belongs to — either a new one, or an existing one it
   * reinforced. Reinforcement is what lets someone keep talking about the same
   * thing without spawning five parallel conversations about it.
   */
  observe(
    classification: Classification,
    utterance: string,
    now: number,
  ): Topic | null {
    const seed = seedFor(classification);

    const existing = this.findRelated(classification, now);
    if (existing) {
      // Take the higher of the two: a stronger restatement should lift a
      // fading topic, but a passing mention should not flatten a hot one.
      existing.seed = Math.max(existing.seed, seed);
      existing.halfLifeMs = halfLifeFor(existing.seed);
      existing.lastReinforcedAt = now;
      existing.utterance = utterance;
      existing.keywords = mergeKeywords(existing.keywords, classification.keywords);
      if (classification.directiveTarget) {
        existing.directiveTarget = classification.directiveTarget;
      }
      if (classification.subject) existing.subject = classification.subject;
      return existing;
    }

    const topic: Topic = {
      id: `t${this.nextId++}`,
      startedAt: now,
      lastReinforcedAt: now,
      intent: classification.intent,
      sentiment: classification.sentiment,
      keywords: [...classification.keywords],
      utterance,
      directiveTarget: classification.directiveTarget,
      subject: classification.subject,
      seed,
      halfLifeMs: halfLifeFor(seed),
      participants: new Map(),
      messagesEmitted: 0,
    };

    this.topics.push(topic);
    this.evictIfNeeded(now);
    return this.topics.includes(topic) ? topic : null;
  }

  /** Current momentum, derived rather than stored so it can never drift. */
  momentumOf(topic: Topic, now: number): number {
    const elapsed = Math.max(0, now - topic.lastReinforcedAt);
    return topic.seed * Math.pow(0.5, elapsed / topic.halfLifeMs);
  }

  band(momentum: number): MomentumBand {
    if (momentum >= 0.8) return "viral";
    if (momentum >= 0.55) return "high";
    if (momentum >= 0.3) return "medium";
    return "low";
  }

  /**
   * Where a topic is in its life, which governs what kind of message it
   * produces — reflexive at first, then developed, then referenced. This is
   * what stops a directive from being a wall of the same token.
   */
  stageOf(topic: Topic, now: number): TopicStage {
    const age = now - topic.startedAt;
    if (age < REACTING_UNTIL_MS) return "reacting";
    if (age < DEVELOPING_UNTIL_MS) return "developing";
    return "referencing";
  }

  active(now: number): Topic[] {
    return this.topics.filter(
      (topic) =>
        this.momentumOf(topic, now) >= TOPIC_FLOOR &&
        now - topic.startedAt <= MAX_TOPIC_AGE_MS,
    );
  }

  /** Total momentum across live topics — the engine's "how busy is it" signal. */
  activity(now: number): number {
    return this.active(now).reduce(
      (sum, topic) => sum + this.momentumOf(topic, now),
      0,
    );
  }

  /** Drops finished topics. Cheap, and called on the engine's normal tick. */
  prune(now: number): void {
    this.topics = this.active(now);
  }

  recordParticipation(topic: Topic, viewerId: string): void {
    topic.participants.set(viewerId, (topic.participants.get(viewerId) ?? 0) + 1);
    topic.messagesEmitted += 1;
  }

  reset(): void {
    this.topics = [];
  }

  /**
   * An existing topic the utterance continues.
   *
   * Same intent plus any shared keyword. Deliberately loose: the cost of
   * merging two related thoughts is one conversation instead of two, while
   * the cost of splitting them is chat appearing to forget mid-sentence.
   */
  private findRelated(
    classification: Classification,
    now: number,
  ): Topic | undefined {
    return this.active(now).find((topic) => {
      if (topic.intent !== classification.intent) return false;
      if (classification.keywords.length === 0 || topic.keywords.length === 0) {
        // No keywords either side — treat a repeat of the same intent within
        // the reacting window as the same thought.
        return now - topic.lastReinforcedAt < REACTING_UNTIL_MS * 2;
      }
      return classification.keywords.some((word) => topic.keywords.includes(word));
    });
  }

  /**
   * Keeps the roster at MAX_TOPICS by dropping the weakest.
   *
   * Something addressed to chat is never evicted by background muttering —
   * being told to spam W and then having it dropped because the streamer
   * muttered about the weather is exactly the forgetfulness this layer exists
   * to remove.
   */
  private evictIfNeeded(now: number): void {
    if (this.topics.length <= MAX_TOPICS) return;

    const ranked = [...this.topics].sort(
      (a, b) => this.weightForEviction(a, now) - this.weightForEviction(b, now),
    );
    const doomed = new Set(ranked.slice(0, this.topics.length - MAX_TOPICS));
    this.topics = this.topics.filter((topic) => !doomed.has(topic));
  }

  private weightForEviction(topic: Topic, now: number): number {
    const momentum = this.momentumOf(topic, now);
    return ADDRESSED.has(topic.intent) ? momentum + 1 : momentum;
  }
}

function seedFor(classification: Classification): number {
  const { intent, energy, confidence } = classification;
  const raw =
    INTENT_WEIGHT[intent] *
    (0.55 + 0.45 * energy) *
    (0.6 + 0.4 * confidence);

  const seed = ADDRESSED.has(intent) ? Math.max(ADDRESSED_FLOOR, raw) : raw;
  return Math.max(0, Math.min(1, seed));
}

/** Interesting things stay interesting for longer. */
function halfLifeFor(seed: number): number {
  return MIN_HALF_LIFE_MS + seed * HALF_LIFE_RANGE_MS;
}

function mergeKeywords(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  return [...new Set([...existing, ...incoming])].slice(0, 8);
}
