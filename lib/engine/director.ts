import type { SimulationSettings } from "../config/settings";
import type { GenerationPhase } from "../ai/provider";
import type { QueuedReaction } from "../ai/reaction";
import { pickSemanticEmote, type EmoteMoment } from "../emotes/semantic";
import type { Population } from "./population";
import { strangerShareFor } from "./roster";
import { profileFor, type GameEvent } from "../ai/moment";
import type { Rng } from "./rng";
import type { MomentumBand, Topic, TopicStage } from "./topics";
import type {
  Emote,
  Intent,
  MessageKind,
  MessageSource,
  PendingMessage,
  Viewer,
} from "./types";

/** What else is known about the moment, for emote choice. */
interface EmoteContext {
  /** The token chat was told to post, when this is a directive. */
  directive?: string;
  /** What the screen is doing, when capture is on. */
  event?: GameEvent;
}

/**
 * The director turns one generated line into one chat message.
 *
 * It decides who says it, whether they say it in words or with an emote,
 * and which emote. It does not decide *what* is said — that arrived from
 * the AI — and it does not decide when; the engine's rate governor asked
 * for this message and the scheduler will release it.
 *
 * There is no pool of text in here. If the caller has no generated line,
 * there is no message.
 */

/**
 * How often a message for this intent should be an emote instead of a
 * sentence.
 *
 * Some things chat says are not sentences. Nobody types "hello, welcome to
 * the stream" — they post the wave emote. Nobody answers "spam W" in prose.
 * These are the moments where a wall of words reads as fake, so most of the
 * room posts an emote and the rest talk.
 *
 * Everything absent here stays text-first: a story or a question deserves an
 * actual reply.
 */
const EMOTE_FORWARD: Partial<Record<EmoteMoment, number>> = {
  /**
   * Targets about 15% emote-only lines on screen for ordinary talk, with
   * the model's own one or two bare emotes per batch on top. Every intent
   * gets some: only five were listed, so showing, story, questions and
   * casual talk had none, and a normal sentence got back a wall of full
   * sentences. Hype moments run a little higher.
   *
   * Directives are low on purpose. The spam itself comes from
   * complyWithDirective; converting the talk around it to emotes as well is
   * how "spam W" became 84% token-or-emote with nothing readable in it.
   */
  greeting: 0.3,
  farewell: 0.3,
  achievement: 0.32,
  excitement: 0.32,
  directive: 0.1,
  idle: 0.22,
};

/**
 * Emote-only share for every intent not listed above.
 *
 * A quarter, not an eighth. At 12% the average gap between emotes was
 * eight messages, so chat read as a block of sentences with an occasional
 * emote dropped in — and no amount of steering fixes that, because the
 * share itself sets how far apart they land. A quarter puts one every
 * three or four messages, which is what interleaving actually looks like,
 * and sits well under what both real channels measured.
 */
const DEFAULT_EMOTE_FORWARD = 0.25;

/**
 * How hard the emote share is pushed back toward its target.
 *
 * At 1 the correction is gentle and long runs of both kinds survive. At 2
 * a run of three has already driven the chance to nothing and a dry
 * stretch has tripled it, which interleaves the two without forbidding
 * anything.
 */
const STEER_GAIN = 2;

/**
 * Chance a worded line gets an emote appended when the model did not ask
 * for one but did say how the line feels. Only then: an emote chosen with
 * no feeling to match is the "random emote after unrelated text" the
 * streamer notices.
 */
const EMOTE_TRAILER = 0.22;

/** How many times an emote is repeated in an emote-only line. */
function emoteSpamCount(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.55) return 1;
  if (roll < 0.85) return rng.int(2, 3);
  return rng.int(4, 6);
}

/**
 * An emote-only line, shaped a few different ways.
 *
 * The shapes matter more than they look. Forty viewers posting one identical
 * token is a bot net; the same forty mixing singles, spam and pairs is a room.
 */
function emoteReply(
  emotes: readonly Emote[],
  moment: EmoteMoment,
  reaction: QueuedReaction,
  rng: Rng,
  context: EmoteContext = {},
): string | null {
  const emote = pickSemanticEmote({
    emotes,
    intent: moment,
    emotion: reaction.emotion,
    preferred: reaction.emote,
    emoteIntent: reaction.emoteIntent,
    ...context,
    rng,
  });
  if (!emote) return null;

  const roll = rng.next();
  if (roll < 0.4) return emote.name;
  if (roll < 0.75) {
    return Array.from({ length: rng.int(2, 5) }, () => emote.name).join(" ");
  }

  // A second, independently chosen emote. When the pack only owns one emote
  // for this moment it comes back the same, and a bare single is the better
  // line than the same token twice.
  const second = pickSemanticEmote({
    emotes,
    intent: moment,
    emotion: reaction.emotion,
    emoteIntent: reaction.emoteIntent,
    ...context,
    rng,
  });
  return second && second.name !== emote.name
    ? `${emote.name} ${second.name}`
    : emote.name;
}

/**
 * What one viewer posts when chat has been told to do something.
 *
 * Most people just do it, with the natural variation of a real room: some
 * post the token once, some spam it. The spam is what makes a "spam W"
 * actually look like chat obeying rather than chat discussing.
 *
 * This is the one place a message's words do not come from the model, and
 * it is the streamer's own words: the token they asked for.
 */
function complyWithDirective(
  target: string | undefined,
  viewer: Viewer,
  emotes: readonly Emote[],
  reaction: QueuedReaction,
  rng: Rng,
  context: EmoteContext = {},
): string | null {
  if (!target) {
    // "let me hear it" — no token to post, so the room just gets loud.
    return emoteReply(emotes, "directive", reaction, rng, context);
  }

  // Repeat count tracks how emote-happy the viewer is, so the same
  // instruction produces a ragged wall rather than forty identical lines.
  const repeats = rng.chance(0.45 + viewer.emoteAffinity * 0.4) ? rng.int(2, 6) : 1;
  return Array.from({ length: repeats }, () => target).join(" ");
}

export interface DirectOneOptions {
  /** The conversation this message belongs to, or null outside active chat. */
  topic: Topic | null;
  stage: TopicStage;
  band: MomentumBand;
  population: Population;
  settings: SimulationSettings;
  emotes: readonly Emote[];
  /** The generated line this message renders. Required: no line, no message. */
  reaction: QueuedReaction;
  phase: GenerationPhase;
  /** Recent speakers as [viewerId, username]. */
  recentSpeakers: ReadonlyArray<readonly [string, string]>;
  /** Viewers who may not speak this message. */
  excludeSpeakers?: ReadonlySet<string>;
  /**
   * The viewer the model wrote this line as.
   *
   * Honoured when they are allowed to speak, and refused otherwise — the
   * line waits for them rather than being put in someone else's mouth,
   * because the whole point of the name is that it is theirs.
   */
  speaker?: Viewer;
  /** A hype moment: the speaking cooldown is waived. */
  burst?: boolean;
  /** What the screen is doing, when capture is on. Drives composition. */
  event?: GameEvent;
  /** How many messages in a row have been emotes alone. */
  emoteRun?: number;
  /** Share of the recent window that was emotes alone, 0..1. */
  recentEmoteShare?: number;
  now: number;
  /** Monotonic counter, so two messages in one millisecond cannot share an id. */
  sequence: number;
  rng: Rng;
}

export interface DirectOneResult {
  message: PendingMessage;
  /** Viewer who spoke, so the caller can record participation. */
  viewerId: string;
}

export function directOne(options: DirectOneOptions): DirectOneResult | null {
  const { topic, stage, settings, emotes, reaction, phase, now, sequence, rng } = options;

  const speaker = pickTopicSpeaker(options);
  if (!speaker) return null;

  const intent: Intent = reaction.intent ?? topic?.intent ?? "mundane";
  const moment: EmoteMoment = phase === "idle" ? "idle" : intent;
  /**
   * What else the moment is, for emote choice.
   *
   * The token chat was told to post and what is on screen both say more
   * about which emote fits than the intent alone: "spam W" wants agreement
   * and victory emotes, a death wants grief or a laugh.
   */
  const context: EmoteContext = {
    ...(topic?.directiveTarget ? { directive: topic.directiveTarget } : {}),
    ...(options.event ? { event: options.event } : {}),
  };

  let text: string | null = null;
  let source: MessageSource = "ai";

  /**
   * Emote-only mode: every message, every speaker.
   *
   * Returns null when there are no emotes, which the caller treats as "wait".
   * A blank message on a live stream is worse than a missing one, and the UI
   * gate alone cannot be trusted — a stale localStorage blob could turn this
   * on with an empty pack.
   */
  if (settings.emoteOnlyMode) {
    const emote = pickSemanticEmote({
      emotes,
      intent: moment,
      emotion: reaction.emotion,
      preferred: reaction.emote,
      emoteIntent: reaction.emoteIntent,
      ...context,
      rng,
    });
    if (!emote) return null;
    text = Array.from({ length: emoteSpamCount(rng) }, () => emote.name).join(" ");
    source = "emote";
  }

  /**
   * About half the room complies, then fewer.
   *
   * "spam W" should put W all over the screen with people visibly talking
   * around it, then move on to people talking *about* it. It was 85% then
   * 45%, which with emote conversion on top made the first ten seconds 84%
   * token-or-emote. Tuned for about half.
   */
  if (
    text === null &&
    topic?.intent === "directive" &&
    rng.chance(stage === "reacting" ? 0.6 : stage === "developing" ? 0.45 : 0.1)
  ) {
    const complied = complyWithDirective(
      topic.directiveTarget,
      speaker,
      emotes,
      reaction,
      rng,
      context,
    );
    if (complied) {
      text = complied;
      source = "directive";
    }
  }

  if (text === null) {
    text = reaction.text;

    /**
     * For the moments chat answers with an emote, most of them do.
     *
     * The generated line is dropped for this message, not for the batch: the
     * rest of the room still says the words.
     */
    /**
     * What is on screen decides how emote-heavy the room is, when it is
     * known. That is the whole point of looking at the screen: a wall of
     * emotes over a menu is noise, the same wall over a death is chat.
     * Without capture this falls back to the intent, as before.
     */
    const target = options.event
      ? profileFor(options.event).emoteShare
      : (EMOTE_FORWARD[moment] ?? DEFAULT_EMOTE_FORWARD);

    /**
     * Steered toward the target rather than sampled at it, or capped.
     *
     * An independent coin flip hits the right average and still clumps,
     * because runs are what independent draws do. A hard cap fixes that and
     * replaces it with a different tell: emotes that can never appear twice
     * running is a rule you can feel. The chance is pushed against whatever
     * just went out instead — hard enough that a fifth emote in a row is
     * vanishingly unlikely, loose enough that three or four happen when the
     * moment carries them.
     *
     * The same correction shortens the other kind of run: a stretch with no
     * emotes drives the chance up, which stops five sentences running as
     * surely as it stops five emotes.
     */
    const recent = options.recentEmoteShare ?? target;
    const forward = Math.max(0, Math.min(0.85, target + STEER_GAIN * (target - recent)));
    // Same rule as the trailer below: only when the model said how the line
    // feels, so the emote chosen has something to match.
    const only =
      forward > 0 && (reaction.emotion || reaction.emote || reaction.emoteIntent) && rng.chance(forward)
        ? emoteReply(emotes, moment, reaction, rng, context)
        : null;

    if (only) {
      text = only;
      source = "emote";
    } else if (
      !isEmoteOnly(text, emotes) &&
      (reaction.emote ||
        ((reaction.emotion || reaction.emoteIntent) && rng.chance(EMOTE_TRAILER)))
    ) {
      /**
       * Emotes chosen from the reaction's own emotion, not at random.
       *
       * The model says how the line feels, or names the emote it wants; the
       * deterministic side picks a real one from whatever pack is loaded.
       * The model never sees an image URL, and a laughing line never picks
       * up a sad emote.
       */
      const emote = pickSemanticEmote({
        emotes,
        intent: moment,
        emotion: reaction.emotion,
        preferred: reaction.emote,
        emoteIntent: reaction.emoteIntent,
        ...context,
        rng,
      });
      if (emote && !text.includes(emote.name)) text = `${text} ${emote.name}`;
    }
  }

  const kind: MessageKind =
    phase === "startup"
      ? "greeting"
      : phase === "idle"
        ? "idle"
        : intent === "greeting"
          ? "greeting"
          : intent === "question_to_chat"
            ? "question"
            : "reaction";

  return {
    viewerId: speaker.id,
    message: {
      id: `${topic?.id ?? phase}-${now}-${sequence}-${speaker.id}`,
      viewerId: speaker.id,
      username: speaker.name,
      color: speaker.color,
      text,
      kind,
      source,
      offset: 0,
    },
  };
}

/**
 * Whether a line is nothing but emote names.
 *
 * Appending a trailer to one of these is how "KEKW KEKW" turned into
 * "KEKW KEKW Sadge" — an emote block with an unrelated mood stapled on.
 */
function isEmoteOnly(text: string, emotes: readonly Emote[]): boolean {
  const names = new Set(emotes.map((emote) => emote.name));
  const words = text.trim().split(/\s+/);
  return words.length > 0 && words.every((word) => names.has(word));
}

/** Intents where one message per viewer is the whole of what a person says. */
export const ONE_SHOT_INTENTS: ReadonlySet<Intent> = new Set<Intent>(["greeting", "farewell"]);

/**
 * Who speaks next in a topic.
 *
 * Early on the room piles in, so people who have not spoken yet are favoured.
 * Later the same few voices develop the thought, so repeat participants become
 * likelier. That difference is most of what separates a crowd reacting from a
 * conversation happening.
 */
function pickTopicSpeaker(options: DirectOneOptions): Viewer | undefined {
  const { topic, stage, population, now, rng, excludeSpeakers, burst } = options;
  const pick = { burst };

  // The model wrote this line as a specific person. Either they may speak or
  // the line waits; handing their words to someone else defeats the point.
  if (options.speaker) {
    return excludeSpeakers?.has(options.speaker.id) ? undefined : options.speaker;
  }

  /**
   * Viewers barred from this message.
   *
   * Composed rather than short-circuiting: the caller's exclusions are the
   * engine saying "not this person" — they already said this, or they already
   * greeted — and that has to hold *alongside* the topic's own speaker
   * choice, not instead of it.
   */
  /**
   * A name passing through.
   *
   * Rolled before the roster is consulted at all: a stranger has no history
   * to collide with, so none of the rules below apply to them. This is what
   * puts sixty names in four minutes on screen at a busy tier while the
   * regulars still carry the conversation.
   */
  if (rng.chance(strangerShareFor(options.settings.messagesPerSecond))) {
    return population.stranger();
  }

  const barred = new Set(excludeSpeakers ?? []);
  if (!topic) return population.pickSpeaker(now, barred, pick);

  const participants = [...topic.participants.keys()];

  /**
   * Some things you only say once.
   *
   * Saying hello twice in the same arrival is the tell that gave the
   * simulation away. A viewer who has greeted has greeted; if everyone in the
   * room already has, the topic goes quiet rather than looping.
   */
  if (ONE_SHOT_INTENTS.has(topic.intent)) {
    for (const id of participants) barred.add(id);
    return population.pickSpeaker(now, barred, pick);
  }

  /**
   * A returning voice still sits out their cooldown.
   *
   * Picked straight from the participants, this skipped the rest rule that
   * every other pick obeys, so in a topic two or three people had joined the
   * one who just spoke was the likeliest next voice — and a developing topic
   * is exactly where lines build on each other, which read as one person
   * answering themselves.
   */
  const repeatable = participants.filter(
    (id) => !barred.has(id) && population.isRested(id, now),
  );
  const wantsRepeat =
    repeatable.length > 0 &&
    rng.chance(stage === "reacting" ? 0.1 : stage === "developing" ? 0.35 : 0.5);

  if (wantsRepeat) {
    const viewer = population.get(rng.pick(repeatable));
    if (viewer) return viewer;
  }

  /**
   * Prefer a fresh voice; settle for a returning one.
   *
   * With a roster of ten, everyone has usually joined a conversation within
   * its first half minute. Excluding participants outright then meant no
   * one was left to speak, and the room went quiet at exactly the moment it
   * should have been busiest — measured as half of all emit slots lost at
   * two messages a second.
   */
  const fresh = new Set(barred);
  for (const id of participants) fresh.add(id);
  return population.pickSpeaker(now, fresh, pick) ?? population.pickSpeaker(now, barred, pick);
}
