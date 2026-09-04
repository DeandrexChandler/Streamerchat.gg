import { AMBIENT, IDLE_AMBIENT } from "../data/responses/ambient";
import { REACTIONS } from "../data/responses/reactions";
import {
  IDLE_NOTICING,
  IDLE_RESTLESS,
  IDLE_SETTLING,
  SIDE_REPLIES,
} from "../data/responses/idle";
import {
  AUDIO_ANSWERS,
  DIRECTIVE_ASIDES,
  PRESENCE_ANSWERS,
  VISUAL_ANSWERS,
} from "../data/responses/answers";
import {
  COMPOSED_AMBIENT,
  COMPOSED_CALLBACK,
  COMPOSED_CURIOUS,
  COMPOSED_HYPE,
  COMPOSED_LIGHT,
  COMPOSED_STRUGGLE,
} from "../data/composers";
import type { SimulationSettings } from "../config/settings";
import { pickDepth, type Depth } from "./attention";
import {
  decorateWithEmotes,
  emoteSpamCount,
  generateFromPool,
  measureLength,
  pickEmote,
} from "./generators/pool";
import type { Population } from "./population";
import type { Rng } from "./rng";
import type { MomentumBand, Topic, TopicStage } from "./topics";
import type { QueuedReaction } from "../ai/reaction";
import { pickSemanticEmote } from "../emotes/semantic";
import type {
  Classification,
  Emote,
  Intent,
  LengthClass,
  MessageKind,
  PendingMessage,
  MessageSource,
  ResponseEntry,
  Viewer,
} from "./types";

/**
 * The director decides *what a moment is worth* — how many people react, over
 * how long, and in what order. The scheduler decides when each lands.
 *
 * Keeping these separate prevents the classic failure mode where a model
 * returns twelve comments and the UI dumps all twelve at once. The director
 * never touches the clock; it only produces offsets.
 */




/** Length classes each depth is willing to draw from. */
const DEPTH_LENGTHS: Record<Exclude<Depth, "ambient">, readonly LengthClass[]> = {
  light: ["tiny", "short"],
  engaged: ["short", "medium"],
  invested: ["medium", "long"],
};

/**
 * Resolves a depth into the entries it may draw from.
 *
 * `ambient` short-circuits to the one-word pools rather than filtering the
 * reaction pools, because those pools contain almost nothing that short — the
 * ambient tier is a separate vocabulary, not a subset of the same one.
 */
function entriesForDepth(
  depth: Depth,
  intentPool: readonly ResponseEntry[],
  classification: Classification,
  ambientPool?: readonly ResponseEntry[],
): readonly ResponseEntry[] {
  const ambient = ambientPool ?? AMBIENT[classification.sentiment];
  if (depth === "ambient") return ambient;

  const allowed = DEPTH_LENGTHS[depth];
  const filtered = intentPool.filter((entry) =>
    allowed.includes(measureLength(entry.text)),
  );

  // Not every intent has entries at every length; fall back rather than
  // dropping the message entirely.
  if (filtered.length > 0) return filtered;
  return depth === "invested" ? intentPool : ambient;
}

/**
 * Emote-only messages, the cheapest and most common thing in real chat.
 *
 * Handled here rather than in decorateWithEmotes so that ambient-depth
 * messages from emote-happy viewers can bypass text generation completely.
 */
function maybeEmoteOnly(
  viewer: Viewer,
  emotes: readonly Emote[],
  classification: Classification,
  rng: Rng,
): string | null {
  if (emotes.length === 0) return null;
  if (!rng.chance(viewer.emoteAffinity * 0.55)) return null;

  const emote = pickSemanticEmote({
    emotes,
    intent: classification.intent,
    rng,
  });
  if (!emote) return null;

  // Repeats one emote rather than mixing several — "KEKW KEKW KEKW", not
  // three different emotes in a row.
  const count = emoteSpamCount(rng);
  return Array.from({ length: count }, () => emote.name).join(" ");
}

/**
 * Emote-only mode: every message, every speaker, regardless of depth or
 * emote affinity.
 *
 * Returns null when there are no emotes, which callers must treat as "skip
 * this speaker". A blank message on a live stream is worse than a missing one,
 * and the UI gate alone cannot be trusted — a stale localStorage blob could
 * turn this on with an empty pack.
 */
function forcedEmoteOnly(
  emotes: readonly Emote[],
  classification: Classification,
  rng: Rng,
): string | null {
  if (emotes.length === 0) return null;

  // Semantic first here too: told to post emotes after saying hi, chat should
  // reach for the `hi` emote rather than whatever the mood table suggests.
  const emote = pickSemanticEmote({
    emotes,
    intent: classification.intent,
    rng,
  });
  if (!emote) return null;

  const count = emoteSpamCount(rng);
  return Array.from({ length: count }, () => emote.name).join(" ");
}

/**
 * What one viewer posts when chat has been told to do something.
 *
 * Most people just do it, with the natural variation of a real room: some post
 * the token once, some spam it, a few say something about it instead. The
 * spam is what makes a "spam W" actually look like chat obeying rather than
 * chat discussing.
 */
function complyWithDirective(
  target: string | undefined,
  viewer: Viewer,
  emotes: readonly Emote[],
  classification: Classification,
  rng: Rng,
): string | null {
  // A minority comments instead of complying. Small — the point of a
  // directive is that chat mostly does it — but never zero, because a room
  // obeying in perfect unison reads as scripted.
  if (rng.chance(0.12)) return null;

  if (!target) {
    // "let me hear it" — no token to post, so the room just gets loud.
    const emote = pickSemanticEmote({ emotes, intent: classification.intent, rng });
    if (!emote) return null;
    return Array.from({ length: emoteSpamCount(rng) }, () => emote.name).join(" ");
  }

  // Repeat count tracks how emote-happy the viewer is, so the same instruction
  // produces a ragged wall rather than forty identical lines.
  const repeats = rng.chance(0.45 + viewer.emoteAffinity * 0.4)
    ? rng.int(2, 6)
    : 1;

  return Array.from({ length: repeats }, () => target).join(" ");
}

/** The answer pool for a question that actually has an answer. */
function answersFor(
  subject: Classification["subject"],
): readonly ResponseEntry[] | null {
  if (subject === "audio") return AUDIO_ANSWERS;
  if (subject === "visual") return VISUAL_ANSWERS;
  if (subject === "presence") return PRESENCE_ANSWERS;
  return null;
}

/**
 * How often a message for this intent should be an emote instead of a sentence.
 *
 * Some things chat says are not sentences. Nobody types "hello, welcome to the
 * stream" — they post the wave emote. Nobody answers "spam W" in prose. These
 * are the moments where a wall of words reads as fake, so most of the room
 * posts an emote and the rest talk.
 *
 * Everything absent here stays text-first: a story or a question deserves an
 * actual reply.
 */
const EMOTE_FORWARD: Partial<Record<Intent, number>> = {
  greeting: 0.65,
  farewell: 0.5,
  directive: 0.75,
  achievement: 0.5,
  excitement: 0.45,
};

/**
 * An emote-only message, shaped a few different ways.
 *
 * The shapes matter more than they look. Forty viewers posting one identical
 * token is a bot net; the same forty mixing singles, spam and pairs is a room.
 */
function emoteReply(
  emotes: readonly Emote[],
  intent: Intent,
  emotion: QueuedReaction["emotion"] | undefined,
  rng: Rng,
): string | null {
  const emote = pickSemanticEmote({ emotes, intent, emotion, rng });
  if (!emote) return null;

  const roll = rng.next();
  if (roll < 0.4) return emote.name;
  if (roll < 0.75) {
    return Array.from({ length: rng.int(2, 5) }, () => emote.name).join(" ");
  }

  // A second, independently chosen emote. When the pack only owns one emote
  // for this moment it comes back the same, and a bare single is the better
  // line than the same token twice.
  const second = pickSemanticEmote({ emotes, intent, emotion, rng });
  return second && second.name !== emote.name
    ? `${emote.name} ${second.name}`
    : emote.name;
}

export interface DirectOptions {
  classification: Classification;
  population: Population;
  settings: SimulationSettings;
  emotes: readonly Emote[];
  /** Candidate lines pre-generated by the AI tier, drained as available. */
  /** Templates used recently, held back to avoid verbatim repeats. */
  recentTexts: ReadonlySet<string>;
  /** The most recent template, never repeated immediately. */
  lastTemplate?: string;
  now: number;
  rng: Rng;
}

export interface DirectResult {
  messages: PendingMessage[];
  /** Templates consumed, for the caller to fold into its recent-text memory. */
  templates: string[];
}



export interface IdleOptions {
  silentMs: number;
  /**
   * Attempt index within this poll.
   *
   * Part of the message id. Several idle messages can be produced in one tick
   * and the same viewer can be picked twice, so without this two messages
   * share an id — which React turns into duplicated or omitted chat lines.
   */
  attempt?: number;
  population: Population;
  settings: SimulationSettings;
  emotes: readonly Emote[];
  /** Recent speakers, as [viewerId, username], for side replies. */
  recentSpeakers: ReadonlyArray<readonly [string, string]>;
  recentTexts: ReadonlySet<string>;
  lastTemplate?: string;
  now: number;
  rng: Rng;
}

export interface IdleResult {
  message: PendingMessage;
  template: string;
}



// ------------------------------------------------------------- single message

export interface DirectOneOptions {
  /** The conversation this message belongs to, or null for off-topic chatter. */
  topic: Topic | null;
  stage: TopicStage;
  band: MomentumBand;
  population: Population;
  settings: SimulationSettings;
  emotes: readonly Emote[];
  /**
   * A generated reaction to use for this message, if the engine chose one.
   *
   * The engine owns the 90/10 split — this only renders what it was handed.
   */
  reaction?: QueuedReaction;
  recentTexts: ReadonlySet<string>;
  lastTemplate?: string;
  /** Recent speakers as [viewerId, username], for side replies. */
  recentSpeakers: ReadonlyArray<readonly [string, string]>;
  /** Viewers who may not speak again in this phase. Used during arrival. */
  excludeSpeakers?: ReadonlySet<string>;
  now: number;
  /** Milliseconds since the streamer last spoke, for idle escalation. */
  silentMs: number;
  /** Monotonic counter, so two messages in one millisecond cannot share an id. */
  sequence: number;
  rng: Rng;
}

export interface DirectOneResult {
  message: PendingMessage;
  /** Template consumed, for the caller's recent-text memory. Empty if none. */
  template: string;
  /** Viewer who spoke, so the caller can record participation. */
  viewerId: string;
}

/**
 * Produces exactly one message.
 *
 * This replaces the old burst model. Generation used to happen once per
 * utterance, emitting a fixed count and then forgetting the event — which is
 * why a clutch win and fetching a glass of water produced interchangeable
 * output. Now the engine asks for one message at a time, whenever its rate
 * governor says one should happen, and this decides who says what based on
 * where the conversation actually is.
 */
export function directOne(options: DirectOneOptions): DirectOneResult | null {
  const {
    topic, stage, population, settings, emotes,
    reaction, recentSpeakers, now, sequence, rng,
  } = options;

  const speaker = pickTopicSpeaker(options);
  if (!speaker) return null;

  /**
   * Replies target someone who has actually spoken recently, rather than
   * another message in the same burst — bursts no longer exist, so the
   * conversation partner has to come from the room's memory.
   */
  const replyCandidates = recentSpeakers.filter(([id]) => id !== speaker.id);
  const replyTarget =
    replyCandidates.length > 0 && rng.chance(settings.sideConversationChance)
      ? rng.pick(replyCandidates)
      : undefined;

  const classification = classificationFor(topic);
  const depth = pickDepth(
    { viewer: speaker, energy: classification.energy, position: stage === "reacting" ? 0 : 3 },
    rng,
  );

  let text: string | null = null;
  let source: MessageSource = "pool";
  let template = "";

  if (settings.emoteOnlyMode) {
    text = forcedEmoteOnly(emotes, classification, rng);
    if (text === null) return null;
  }

  /**
   * Compliance fades with the topic.
   *
   * "spam W" should fill the screen with W and then move on to people talking
   * *about* the spam, which is what a real chat does. Holding compliance at
   * 100% for the topic's whole life is the wall-of-identical-tokens failure.
   */
  if (
    text === null &&
    topic?.intent === "directive" &&
    !replyTarget &&
    rng.chance(stage === "reacting" ? 0.85 : stage === "developing" ? 0.45 : 0.15)
  ) {
    text = complyWithDirective(topic.directiveTarget, speaker, emotes, classification, rng);
  }

  const answers = topic && !replyTarget ? answersFor(topic.subject) : null;

  /**
   * A generated reaction, when the engine picked one for this message.
   *
   * Taken before anything else can claim the slot: this is what the audience
   * actually said about what the streamer actually said, and every other tier
   * exists to fill the gaps around it.
   */
  if (text === null && reaction) {
    text = reaction.text;
    source = "ai";

    /**
     * For the moments chat answers with an emote, most of them do.
     *
     * The generated line is dropped for this message, not for the batch: the
     * rest of the room still says the words. And this only runs where a
     * reaction exists at all, so a provider failure still produces silence
     * rather than a screen of emotes standing in for an answer.
     */
    const forward = EMOTE_FORWARD[classification.intent] ?? 0;
    const only =
      settings.emotesEnabled && forward > 0 && rng.chance(forward)
        ? emoteReply(emotes, classification.intent, reaction.emotion, rng)
        : null;
    if (only) text = only;

    /**
     * Emotes chosen from the reaction's own emotion, not at random.
     *
     * The model says how the line feels; the deterministic side picks a 7TV
     * emote matching that mood from whatever pack is loaded. The model never
     * sees an image URL, and a laughing line never picks up a sad emote —
     * which is what random insertion produced.
     */
    // Skipped when the message is already nothing but emotes: appending a
    // second, independently chosen one there is how "peepoBye" turned into
    // "NOWAYING NOWAYING NOWAYING peepoBye".
    if (!only && settings.emotesEnabled && rng.chance(0.3)) {
      const emote = pickSemanticEmote({
        emotes,
        intent: classification.intent,
        emotion: reaction.emotion,
        rng,
      });
      if (emote) text = `${text} ${emote.name}`;
    }
  }

  if (
    text === null &&
    !replyTarget &&
    answers === null &&
    depth === "ambient" &&
    settings.emotesEnabled
  ) {
    text = maybeEmoteOnly(speaker, emotes, classification, rng);
  }

  /**
   * Everything below is idle chatter only.
   *
   * Active conversation is AI or nothing: when a topic is live but no
   * generated reaction was supplied, the room stays quiet rather than reaching
   * for a canned line. Pools filling those gaps is what let deterministic text
   * dilute and repeat over the top of real answers.
   */
  if (text === null && topic !== null) return null;

  if (text === null) {
    source = replyTarget ? "template" : "pool";
    const asides =
      !replyTarget && topic?.intent === "directive" && stage !== "reacting"
        ? DIRECTIVE_ASIDES
        : null;

    const entries = replyTarget
      ? SIDE_REPLIES
      : (answers ??
        asides ??
        /**
         * Depth decides whether this message is a reaction or a thought.
         * `engaged` and `invested` draw on composed shapes, which is the only
         * place messages longer than a few words come from.
         */
        (depth === "engaged" || depth === "invested"
          ? composedFor(topic, stage)
          : depth === "light"
            ? COMPOSED_LIGHT
            : entriesForTopic(topic, depth, classification, options.silentMs)));

    const result = generateFromPool(
      entries,
      speaker,
      population.tagBias(speaker),
      {
        keywords: classification.keywords,
        emotes,
        replyTo: replyTarget?.[1],
        streamer: settings.streamerName || undefined,
        topic: settings.streamTopic || undefined,
        recentTexts: options.recentTexts,
        lastTemplate: options.lastTemplate,
      },
      rng,
    );
    if (result === null) return null;
    text = result.text;
    template = result.template;

    if (settings.emotesEnabled && depth !== "ambient") {
      text = decorateWithEmotes(
        text,
        speaker,
        emotes,
        { intent: classification.intent, sentiment: classification.sentiment },
        rng,
      );
    }
  }

  const kind: MessageKind = replyTarget
    ? "reply"
    : topic === null
      ? "idle"
      : topic.intent === "greeting"
        ? "greeting"
        : topic.intent === "question_to_chat"
          ? "question"
          : "reaction";

  return {
    viewerId: speaker.id,
    template,
    message: {
      id: `${topic?.id ?? "amb"}-${now}-${sequence}-${speaker.id}`,
      viewerId: speaker.id,
      username: speaker.name,
      color: speaker.color,
      text,
      kind,
      source,
      replyTo: replyTarget?.[1],
      offset: 0,
    },
  };
}

/**
 * Who speaks next in a topic.
 *
 * Early on the room piles in, so people who have not spoken yet are favoured.
 * Later the same few voices develop the thought, so repeat participants become
 * likelier. That difference is most of what separates a crowd reacting from a
 * conversation happening.
 */
function pickTopicSpeaker(options: DirectOneOptions) {
  const { topic, stage, population, now, rng, excludeSpeakers } = options;

  /**
   * Viewers barred from this message.
   *
   * Composed rather than short-circuiting: the caller's exclusions are the
   * engine saying "not this person" — they already said this, or they already
   * greeted — and that has to hold *alongside* the topic's own speaker
   * choice, not instead of it. Replacing the topic logic whenever an
   * exclusion existed is how a retry lost its conversation.
   */
  const barred = new Set(excludeSpeakers ?? []);
  if (!topic) return population.pickSpeaker(now, barred);

  const participants = [...topic.participants.keys()];

  /**
   * Some things you only say once.
   *
   * Saying hello twice in the same arrival is the tell that gave the
   * simulation away — "quinn: sup" followed four lines later by
   * "quinn: heyyyy". A viewer who has greeted has greeted; if everyone in the
   * room already has, the topic goes quiet rather than looping.
   */
  if (ONE_SHOT_INTENTS.has(topic.intent)) {
    for (const id of participants) barred.add(id);
    return population.pickSpeaker(now, barred);
  }

  const repeatable = participants.filter((id) => !barred.has(id));
  const wantsRepeat =
    repeatable.length > 0 &&
    rng.chance(stage === "reacting" ? 0.1 : stage === "developing" ? 0.35 : 0.5);

  if (wantsRepeat) {
    const viewer = population.get(rng.pick(repeatable));
    if (viewer) return viewer;
  }
  for (const id of participants) barred.add(id);
  return population.pickSpeaker(now, barred);
}

/** Intents where one message per viewer is the whole of what a person says. */
const ONE_SHOT_INTENTS = new Set<Intent>(["greeting", "farewell"]);

/** A topic's classification, or a neutral one for off-topic chatter. */
function classificationFor(topic: Topic | null): Classification {
  if (!topic) {
    return {
      intent: "mundane",
      sentiment: "neutral",
      energy: 0.15,
      keywords: [],
      confidence: 0.4,
    };
  }
  return {
    intent: topic.intent,
    sentiment: topic.sentiment,
    energy: topic.seed,
    keywords: [...topic.keywords],
    confidence: 0.8,
    directiveTarget: topic.directiveTarget,
    subject: topic.subject,
  };
}

/** Pool entries appropriate to a topic, falling back to ambient chatter. */
/**
 * Longer shapes appropriate to where a conversation is.
 *
 * Mixed into the pool rather than replacing it, so short reactions still
 * happen — they are what a pile-on is made of. The point is that they stop
 * being the only thing available.
 */
function composedFor(
  topic: Topic | null,
  stage: TopicStage,
): readonly ResponseEntry[] {
  if (!topic) return COMPOSED_AMBIENT;
  // Late in a topic's life chat references it rather than reacting to it.
  if (stage === "referencing") return COMPOSED_CALLBACK;

  switch (topic.intent) {
    case "achievement":
    case "excitement":
    case "directive":
      return COMPOSED_HYPE;
    case "struggle":
    case "confusion":
      return COMPOSED_STRUGGLE;
    case "question_to_chat":
    case "showing":
    case "story":
      return COMPOSED_CURIOUS;
    default:
      return COMPOSED_AMBIENT;
  }
}

function entriesForTopic(
  topic: Topic | null,
  depth: Depth,
  classification: Classification,
  silentMs: number,
): readonly ResponseEntry[] {
  if (!topic) {
    /**
     * Off-topic chatter escalates with real silence.
     *
     * The settling tier is what chat says while the streamer is mid-sentence;
     * "is your mic on?" and "chat we're on our own" only make sense once the
     * room has actually been left alone for a while.
     */
    const pool =
      silentMs < 25_000
        ? IDLE_SETTLING
        : silentMs < 60_000
          ? IDLE_NOTICING
          : IDLE_RESTLESS;
    return entriesForDepth(depth, pool, classification, IDLE_AMBIENT);
  }
  const pool = REACTIONS[topic.intent] ?? REACTIONS.mundane ?? [];
  return entriesForDepth(depth, pool, classification, IDLE_AMBIENT);
}
