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
import type {
  Classification,
  Emote,
  LengthClass,
  MessageKind,
  PendingMessage,
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

/**
 * Chance that a message continues from the previous speaker rather than
 * picking someone new.
 *
 * Low on purpose: this should read as someone typing fast, not as a small
 * audience where the same handful of names dominate.
 */
const RAPID_FIRE_CHANCE = 0.09;

/** How many messages a burst is worth, before the speed multiplier. */
function burstSize(classification: Classification, rng: Rng): number {
  const { intent, energy } = classification;

  // Baseline by intent — a direct question to chat pulls far more replies than
  // background muttering.
  const base: Record<string, [number, number]> = {
    question_to_chat: [5, 10],
    // An instruction is the one moment chat acts in unison. This is the
    // largest burst in the table on purpose — "spam W" answered by two
    // messages is the feature visibly not working.
    directive: [8, 16],
    excitement: [4, 9],
    achievement: [3, 7],
    greeting: [3, 6],
    struggle: [2, 6],
    showing: [3, 6],
    story: [2, 5],
    confusion: [2, 4],
    farewell: [3, 6],
    mundane: [2, 4],
  };

  const [min, max] = base[intent] ?? [1, 3];
  // Energy pushes toward the top of the range rather than widening it.
  return Math.round(
    min + (max - min) * (0.35 + 0.65 * energy) * rng.float(0.75, 1.15),
  );
}

/**
 * Offsets within a burst, in ms.
 *
 * Real chat is *bursty*, not evenly paced. Two people mash enter within 200ms
 * of each other, then nothing for four seconds, then a straggler who took a
 * while to type. An earlier version spread messages along a smooth ease-out
 * curve, which produced a metronomic ~2s gap that read as obviously machine-
 * generated even though the text itself was fine.
 *
 * So gaps are drawn from a three-way mixture instead of a curve:
 *
 *   pile-on   120-450ms   simultaneous reactions to the same moment
 *   normal    500-1700ms  ordinary typing pace
 *   straggler 2200-5500ms someone slow, distracted, or writing more
 *
 * Energy shifts the mixture rather than scaling it uniformly: an exciting
 * moment produces more pile-ons and fewer stragglers, which is what makes a
 * hype spike feel different from idle conversation.
 */
function burstOffsets(
  count: number,
  energy: number,
  speed: number,
  rng: Rng,
): number[] {
  // Weights shift toward simultaneity as energy rises.
  const pileOn = 0.22 + 0.34 * energy;
  const straggler = 0.28 - 0.16 * energy;

  /**
   * Speed compresses the gaps, not just the message count.
   *
   * Multiplying burst size alone was the bug behind "chaos doesn't feel like
   * chaos": more messages were generated but still spaced a second apart, so
   * they simply queued and hit the rate limiter. A busy chat isn't a calm
   * chat with more people — the gaps themselves collapse.
   *
   * Sub-linear (^0.75) so the low end stays gentle while the top end is
   * genuinely unreadable.
   */
  const compress = 1 / Math.pow(Math.max(0.1, speed), 0.75);

  // The first reaction lands fast when something exciting just happened.
  let cursor = rng.float(250, 900) * (1.3 - 0.6 * energy) * compress;
  const offsets: number[] = [Math.round(cursor)];

  for (let i = 1; i < count; i++) {
    const roll = rng.next();
    let gap: number;

    if (roll < pileOn) {
      gap = rng.float(120, 450);
    } else if (roll < pileOn + straggler) {
      gap = rng.float(2200, 5500);
    } else {
      gap = rng.float(500, 1700);
    }

    cursor += gap * compress;
    offsets.push(Math.round(cursor));
  }

  return offsets;
}

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

  const emote = pickEmote(
    emotes,
    classification.intent,
    classification.sentiment,
    rng,
  );
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

  const emote = pickEmote(
    emotes,
    classification.intent,
    classification.sentiment,
    rng,
  );
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
    const emote = pickEmote(emotes, classification.intent, classification.sentiment, rng);
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

export interface DirectOptions {
  classification: Classification;
  population: Population;
  settings: SimulationSettings;
  emotes: readonly Emote[];
  /** Candidate lines pre-generated by the AI tier, drained as available. */
  aiCandidates?: string[];
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

/** Turns one classified utterance into an ordered burst of pending messages. */
export function directReaction(options: DirectOptions): DirectResult {
  const { classification, population, settings, emotes, now, rng } = options;
  const aiCandidates = options.aiCandidates ?? [];

  const pool = REACTIONS[classification.intent] ?? REACTIONS.mundane ?? [];
  if (pool.length === 0) return { messages: [], templates: [] };

  const count = Math.max(
    1,
    Math.round(burstSize(classification, rng) * settings.chatSpeed),
  );
  const offsets = burstOffsets(
    count,
    classification.energy,
    settings.chatSpeed,
    rng,
  );

  const messages: PendingMessage[] = [];
  const templates: string[] = [];
  const used = new Set<string>();
  // Seeded from the caller's memory, then extended within this burst so a
  // single burst can't repeat itself either.
  const seen = new Set(options.recentTexts);
  let lastTemplate = options.lastTemplate;

  const decorateContext = {
    intent: classification.intent,
    sentiment: classification.sentiment,
  };

  for (let i = 0; i < count; i++) {
    /**
     * Occasionally the previous speaker keeps typing.
     *
     * pickSpeaker damps anyone who just spoke down to ~8% weight, which is
     * right most of the time but means one person firing off two or three
     * quick lines — "WAIT" / "no way" / "did that just work" — essentially
     * never happened. This carves out that case explicitly.
     *
     * The text still passes through the same dedup, so a rapid-fire run is
     * always different lines rather than a repeat.
     */
    const previous = messages.at(-1);
    const continuing =
      previous !== undefined && i > 0 && rng.chance(RAPID_FIRE_CHANCE)
        ? population.get(previous.viewerId)
        : undefined;

    const speaker = continuing ?? population.pickSpeaker(now, used);
    if (!speaker) break;
    used.add(speaker.id);

    // Later messages may answer an earlier one rather than the streamer —
    // this is what produces side threads. Never reply to yourself.
    const replyCandidates = messages.filter((m) => m.viewerId !== speaker.id);
    const replyTarget =
      replyCandidates.length > 0 && rng.chance(settings.sideConversationChance)
        ? rng.pick(replyCandidates)
        : undefined;

    const depth = pickDepth(
      { viewer: speaker, energy: classification.energy, position: i },
      rng,
    );

    let text: string | null = null;
    let source: PendingMessage["source"] = "pool";

    // Spend an AI line only when one is already pooled, and only on a message
    // that was going to be substantive anyway — an AI call to produce "W"
    // would be pure waste. The director never blocks on a network call.
    const wantsAi =
      aiCandidates.length > 0 &&
      !replyTarget &&
      (depth === "engaged" || depth === "invested") &&
      rng.chance(settings.aiShare);

    if (wantsAi) {
      text = aiCandidates.shift() ?? null;
      source = "ai";
    }

    if (settings.emoteOnlyMode) {
      const only = forcedEmoteOnly(emotes, classification, rng);
      if (only === null) continue; // no emotes — skip, never emit a blank
      text = only;
      source = "pool";
    }

    // Chat was told to do something. Most of the room does it.
    if (text === null && classification.intent === "directive" && !replyTarget) {
      text = complyWithDirective(
        classification.directiveTarget,
        speaker,
        emotes,
        classification,
        rng,
      );
      if (text !== null) source = "pool";
    }

    /**
     * An emote on its own, which is what a large share of real chat is —
     * except when a question is waiting for an actual answer. Someone asking
     * whether their mic works does not need six people posting catJAM.
     */
    const owesAnAnswer = answersFor(classification.subject) !== null;
    if (
      text === null &&
      !replyTarget &&
      !owesAnAnswer &&
      depth === "ambient" &&
      settings.emotesEnabled
    ) {
      text = maybeEmoteOnly(speaker, emotes, classification, rng);
    }

    if (text === null) {
      source = replyTarget ? "template" : "pool";

      /**
       * A question with a real answer gets answered.
       *
       * Without this, "can you hear me" drew from the generic
       * question_to_chat pool and came back with "hm" or "wait what was the
       * question" — which is the single most obviously broken thing chat can
       * do, because the streamer is standing there waiting to be told yes.
       */
      const answers = replyTarget ? null : answersFor(classification.subject);

      /**
       * The minority who did not just do as they were told.
       *
       * They still have to be reacting to the instruction — falling back to
       * the generic pool put "i feel that" and "ngl same" in the middle of a
       * "spam W", which reads as chat not having heard it.
       */
      const asides =
        !replyTarget && classification.intent === "directive"
          ? DIRECTIVE_ASIDES
          : null;

      const entries = replyTarget
        ? SIDE_REPLIES
        : (answers ?? asides ?? entriesForDepth(depth, pool, classification));

      const result = generateFromPool(
        entries,
        speaker,
        population.tagBias(speaker),
        {
          keywords: classification.keywords,
          emotes,
          replyTo: replyTarget?.username,
          // || undefined because the schema defaults these to "", which would
          // pass canFill's truthiness gate and then substitute nothing.
          streamer: settings.streamerName || undefined,
          topic: settings.streamTopic || undefined,
          recentTexts: seen,
          lastTemplate,
        },
        rng,
      );
      if (result === null) continue;
      text = result.text;
      seen.add(result.template);
      lastTemplate = result.template;
      templates.push(result.template);

      // Ambient lines are already one word; appending an emote to them turns
      // every short reaction into a two-token message and defeats the point.
      if (settings.emotesEnabled && depth !== "ambient") {
        text = decorateWithEmotes(text, speaker, emotes, decorateContext, rng);
      }
    }

    const kind: MessageKind = replyTarget
      ? "reply"
      : classification.intent === "greeting"
        ? "greeting"
        : classification.intent === "question_to_chat"
          ? "question"
          : "reaction";

    messages.push({
      id: `m${now}-${i}-${speaker.id}`,
      viewerId: speaker.id,
      username: speaker.name,
      color: speaker.color,
      text,
      kind,
      source,
      offset: offsets[i],
      replyTo: replyTarget?.username,
    });
  }

  return { messages, templates };
}

/** Picks the idle pool matching how long the silence has run. */
function idlePoolFor(silentMs: number): readonly ResponseEntry[] {
  if (silentMs < 25_000) return IDLE_SETTLING;
  if (silentMs < 60_000) return IDLE_NOTICING;
  return IDLE_RESTLESS;
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

/**
 * Produces a single idle message, or null if nobody feels like talking.
 *
 * Idle output is intentionally sparse and *slows down* as silence drags on —
 * a chat that gets louder the longer nothing happens reads as a bot.
 */
export function directIdle(options: IdleOptions): IdleResult | null {
  const { silentMs, population, settings, emotes, now, rng } = options;

  if (!settings.idleEnabled) return null;

  /**
   * Two different jobs share this function.
   *
   * Below `idleAfterSeconds` the streamer is still talking, and this is
   * *background flow* — the constant low murmur a real chat has whether or not
   * anything was just said. Above it, this is idle escalation, which notices
   * the silence and comments on it.
   *
   * The two were previously one thing gated on silence, which meant talking
   * continuously switched the background off entirely and chat went dead for
   * the whole time the app was actually in use.
   */
  const settled = silentMs >= settings.idleAfterSeconds * 1000;

  // Chance of speaking decays as the room settles into the silence.
  const minutes = silentMs / 60_000;
  const baseChance = settled
    ? Math.max(0.18, 0.62 - minutes * 0.12)
    : // Runs *underneath* whatever the streamer's utterances are already
      // producing. Tuned by how many seconds of a session are completely
      // still rather than by messages per minute: a chat that emits the right
      // hourly total in tight clusters, with dead air between, still reads as
      // frozen.
      0.5;
  const speakChance = baseChance * settings.chatSpeed;
  if (!rng.chance(Math.min(0.9, speakChance))) return null;

  const speaker = population.pickSpeaker(now);
  if (!speaker) return null;

  // Occasionally someone answers a recent speaker instead of the void — but
  // never themselves.
  const targets = options.recentSpeakers.filter(([id]) => id !== speaker.id);
  const replyTo =
    targets.length > 0 && rng.chance(settings.sideConversationChance)
      ? rng.pick(targets)[1]
      : undefined;

  // Idle has no strong intent; "mundane"/"neutral" keeps emotes calm.
  const idleClassification: Classification = {
    intent: "mundane",
    sentiment: "neutral",
    energy: 0,
    keywords: [],
    confidence: 0,
  };

  // Idle goes through the same depth mix as reactions. Without this it
  // bypassed the length distribution entirely and, because the idle pools are
  // written as whole thoughts, quietly became the main source of medium-length
  // messages in a session.
  const depth = pickDepth(
    { viewer: speaker, energy: 0, position: 1 },
    rng,
  );

  let text: string | null = null;
  let template = "";

  if (settings.emoteOnlyMode) {
    const only = forcedEmoteOnly(emotes, idleClassification, rng);
    if (only === null) return null; // no emotes — skip, never emit a blank
    text = only;
  } else if (!replyTo && depth === "ambient" && settings.emotesEnabled) {
    text = maybeEmoteOnly(speaker, emotes, idleClassification, rng);
  }

  if (text === null) {
    const entries = replyTo
      ? SIDE_REPLIES
      : entriesForDepth(
          depth,
          // Background flow stays on the settling vocabulary. The escalation
          // tiers say things like "did the stream freeze", which is nonsense
          // while the streamer is mid-sentence.
          settled ? idlePoolFor(silentMs) : IDLE_SETTLING,
          idleClassification,
          IDLE_AMBIENT,
        );

    const result = generateFromPool(
      entries,
      speaker,
      population.tagBias(speaker),
      {
        keywords: [],
        emotes,
        replyTo,
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
        { intent: "mundane", sentiment: "neutral" },
        rng,
      );
    }
  }

  return {
    template,
    message: {
      id: `i${now}-${options.attempt ?? 0}-${speaker.id}`,
      viewerId: speaker.id,
      username: speaker.name,
      color: speaker.color,
      text,
      kind: replyTo ? "reply" : "idle",
      source: replyTo ? "template" : "pool",
      offset: 0,
      replyTo,
    },
  };
}
