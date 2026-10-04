import { PERSONALITY_LIST, PERSONALITIES } from "../data/personalities";
import { buildVoice } from "../data/voices";
import { USERNAME_COLORS, generateUsername } from "../data/usernames";
import type { Rng } from "./rng";
import type { SavedViewer } from "../config/roster-store";
import type { Intent, PersonalityId, Viewer, ViewerMemory } from "./types";

/**
 * The virtual audience.
 *
 * The single most important realism decision in the engine: viewers persist
 * for the whole session instead of being invented per message. That gives you
 * recurring names, a handful of people who carry the conversation while most
 * lurk, and the ability for one viewer to reply to another — none of which is
 * expressible if every line comes from a fresh random username.
 */
/** Below this many rested viewers, the cooldown is relaxed rather than starving chat. */
const MIN_SPEAKER_CHOICES = 3;

/** Default sit-out after speaking. The engine sets a tier-aware one. */
const DEFAULT_COOLDOWN_MS = 6_000;


export interface PickOptions {
  /**
   * A hype moment: the cooldown is waived so a few people can fire off
   * several lines in a row, which is what excitement looks like. The
   * consecutive cap still holds, from the caller's exclusions.
   */
  burst?: boolean;
}

/**
 * One-off names, kept only so their ids resolve while their message is in
 * flight and so a name is never reissued. Bounded: a long session at CHAOS
 * would otherwise accumulate thousands.
 */
const STRANGER_MEMORY = 60;

export class Population {
  private readonly viewers = new Map<string, Viewer>();
  private readonly strangers = new Map<string, Viewer>();
  private readonly takenNames = new Set<string>();
  private cooldownMs = DEFAULT_COOLDOWN_MS;
  /**
   * Vocabulary already spent on names. Tracked separately from full names
   * because `bramble` / `littlebramble` / `wobbly_bramble` are all distinct
   * strings but read as obviously generated when they share a chat.
   */
  private readonly usedWords = new Set<string>();
  private nextId = 1;

  constructor(
    private readonly rng: Rng,
    size: number,
  ) {
    for (let i = 0; i < size; i++) this.add();
  }

  get size(): number {
    return this.viewers.size;
  }

  all(): Viewer[] {
    return [...this.viewers.values()];
  }

  get(id: string): Viewer | undefined {
    return this.viewers.get(id) ?? this.strangers.get(id);
  }

  /**
   * A name passing through: one message, no history, never seen again.
   *
   * Built the same way a regular is, so it is indistinguishable on screen —
   * the difference is only that nothing here persists or accumulates.
   */
  stranger(): Viewer {
    const viewer = this.build();
    this.strangers.set(viewer.id, viewer);
    if (this.strangers.size > STRANGER_MEMORY) {
      const oldest = this.strangers.keys().next().value;
      const gone = oldest === undefined ? undefined : this.strangers.get(oldest);
      if (oldest !== undefined) this.strangers.delete(oldest);

      /**
       * A stranger who has scrolled off gives everything back.
       *
       * Thousands pass through an hour at the top tier, and holding their
       * vocabulary forever emptied the word lists, which pushed every new
       * name onto the fallbacks — repeated words, then a word and a number —
       * and a long session's chat ran out of fresh-sounding names.
       *
       * The vocabulary only. The name itself stays taken for the session,
       * the same rule a departed regular follows: one handle is one person,
       * and reissuing it puts two different people behind the same name.
       */
      if (gone) {
        for (const word of gone.nameWords) this.usedWords.delete(word);
      }
    }
    return viewer;
  }

  /** Adds one regular with a personality sampled by archetype weight. */
  add(): Viewer {
    const viewer = this.build();
    this.viewers.set(viewer.id, viewer);
    return viewer;
  }

  /** Builds a viewer without filing it anywhere. */
  private build(): Viewer {
    const personality = this.rng.weighted(PERSONALITY_LIST, (p) => p.weight);
    const { name, words } = generateUsername(
      this.rng,
      this.takenNames,
      this.usedWords,
    );
    this.takenNames.add(name.toLowerCase());
    for (const word of words) this.usedWords.add(word);

    const verbosity = this.rng.float(...personality.verbosity);
    const viewer: Viewer = {
      id: `v${this.nextId++}`,
      name,
      nameWords: words,
      color: this.rng.pick(USERNAME_COLORS),
      personality: personality.id,
      activity: this.rng.float(...personality.activity),
      verbosity,
      emoteAffinity: this.rng.float(...personality.emoteAffinity),
      lastSpokeAt: 0,
      said: new Map(),
      intents: new Map(),
      spoken: 0,
      voice: buildVoice(this.rng, personality.id, verbosity),
      pinned: false,
      memory: { topics: [], lines: [], addressed: [] },
    };

    return viewer;
  }

  /** Removes a random viewer, if any remain. Used for churn. */
  remove(): Viewer | undefined {
    // A regular the streamer wrote is not churn fodder.
    const all = this.all().filter((viewer) => !viewer.pinned);
    if (all.length === 0) return undefined;
    const victim = this.rng.pick(all);
    this.viewers.delete(victim.id);

    // The NAME is deliberately not released. Usernames are globally unique on
    // every real platform, so the same handle always means the same person —
    // letting a departed viewer's name be reissued to someone new means chat
    // ends up with two different "marcus" identities in one session.
    //
    // The vocabulary that built it does go back, so those words can recombine
    // into different names and long sessions don't starve the generator.
    for (const word of victim.nameWords) this.usedWords.delete(word);
    return victim;
  }

  /**
   * Swaps one viewer for a new one, keeping the audience the same size.
   *
   * This is what makes audience size mean something beyond a headcount. A
   * small stream has the same handful of names every session — you learn who
   * they are. A big one has a roster that turns over, so new names keep
   * appearing. Without churn, a 200-viewer audience is just a 200-name list
   * that never changes, which reads as static in a different way.
   */
  churn(): void {
    if (this.size === 0) return;
    this.remove();
    this.add();
  }

  /**
   * Moves the audience toward `target`.
   *
   * Steps proportionally to the gap rather than one viewer at a time: someone
   * dragging the audience slider from 200 to 10 should see it settle in
   * seconds, not minutes. Always moves at least one so it can't stall short of
   * the target.
   */
  driftToward(target: number): void {
    const gap = target - this.size;
    if (gap === 0) return;

    const step = Math.max(1, Math.ceil(Math.abs(gap) * 0.2));
    const count = Math.min(step, Math.abs(gap));

    for (let i = 0; i < count; i++) {
      if (gap > 0) this.add();
      else this.remove();
    }
  }

  /**
   * Picks who speaks next, weighted by personality activity and damped by how
   * recently each viewer last spoke. The damping is what stops the two most
   * active viewers from monopolising every burst.
   *
   * `exclude` keeps a single burst from having one person reply to themselves.
   */
  pickSpeaker(
    now: number,
    exclude: ReadonlySet<string> = new Set(),
    options: PickOptions = {},
  ): Viewer | undefined {
    const eligible = this.all().filter((v) => !exclude.has(v.id));
    if (eligible.length === 0) return undefined;

    /**
     * A hard cooldown, not just a weighting.
     *
     * Damping a recent speaker to 8% still re-picked them constantly, which
     * produced the giveaway pattern of one viewer answering themselves:
     *
     *   quinn: sup
     *   quinn: heyyyy
     *
     * Anyone who spoke recently is removed outright — unless doing so leaves
     * too few people to choose between, which is a real case at the lowest
     * speed tier where the whole room is five viewers, or unless this is a
     * hype moment where firing off consecutive lines is the realism.
     */
    const rested = options.burst
      ? eligible
      : eligible.filter((v) => now - v.lastSpokeAt >= this.cooldownMs);
    const pool = rested.length >= MIN_SPEAKER_CHOICES ? rested : eligible;

    return this.rng.weighted(pool, (viewer) => {
      const silentFor = now - viewer.lastSpokeAt;
      // Full weight once ~15s have passed; heavily damped immediately after.
      const recency = Math.min(1, silentFor / 15_000);
      return viewer.activity * (0.08 + 0.92 * recency);
    });
  }

  /** Picks a viewer weighted toward a personality trait, e.g. emote affinity. */
  pickBy(
    now: number,
    trait: (viewer: Viewer) => number,
    exclude: ReadonlySet<string> = new Set(),
  ): Viewer | undefined {
    const eligible = this.all().filter((v) => !exclude.has(v.id));
    if (eligible.length === 0) return undefined;

    return this.rng.weighted(eligible, (viewer) => {
      const recency = Math.min(1, (now - viewer.lastSpokeAt) / 15_000);
      return Math.max(0.01, trait(viewer)) * viewer.activity * (0.08 + 0.92 * recency);
    });
  }

  /** Whether this viewer has sat out their cooldown since last speaking. */
  isRested(viewerId: string, now: number): boolean {
    const viewer = this.get(viewerId);
    return viewer !== undefined && now - viewer.lastSpokeAt >= this.cooldownMs;
  }

  markSpoke(viewerId: string, at: number): void {
    const viewer = this.get(viewerId);
    if (viewer) viewer.lastSpokeAt = at;
  }

  /** Sit-out after speaking. Tier-aware; the engine sets it from the rate. */
  setCooldown(ms: number): void {
    this.cooldownMs = ms;
  }

  // ------------------------------------------------------------- memory

  /** Whether this viewer said this, normalised, within the window. Default: ever. */
  hasSaid(
    viewerId: string,
    normalised: string,
    now = 0,
    withinMs = Number.POSITIVE_INFINITY,
  ): boolean {
    const at = this.get(viewerId)?.said.get(normalised);
    return at !== undefined && now - at < withinMs;
  }

  /** When this viewer last did this, or undefined if never. */
  lastDid(viewerId: string, intent: Intent): number | undefined {
    return this.get(viewerId)?.intents.get(intent);
  }

  /** Records a message against its viewer. */
  remember(
    viewerId: string,
    normalised: readonly string[],
    intent: Intent,
    at: number,
    note?: { line?: string; topics?: readonly string[] },
  ): void {
    const viewer = this.get(viewerId);
    if (!viewer) return;
    for (const text of normalised) viewer.said.set(text, at);
    viewer.intents.set(intent, at);
    viewer.spoken += 1;
    if (note) rememberNote(viewer.memory, note);
  }

  /** The regular with this name, ignoring case. Strangers are not searched. */
  byName(name: string): Viewer | undefined {
    const wanted = name.trim().toLowerCase();
    for (const viewer of this.viewers.values()) {
      if (viewer.name.toLowerCase() === wanted) return viewer;
    }
    return undefined;
  }

  /** Something the streamer said straight to this person. */
  rememberAddressed(viewerId: string, utterance: string): void {
    const viewer = this.get(viewerId);
    if (!viewer) return;
    push(viewer.memory.addressed, utterance.slice(0, 120), MEMORY_ADDRESSED);
  }

  /**
   * A new session: everyone forgets what they said. Identities stay, and so
   * does the short memory — a regular who remembers last stream is the whole
   * point of regulars.
   */
  forget(): void {
    this.strangers.clear();
    for (const viewer of this.viewers.values()) {
      viewer.said.clear();
      viewer.intents.clear();
      viewer.spoken = 0;
      viewer.lastSpokeAt = 0;
    }
  }

  /**
   * The regulars, in a shape that survives a page reload.
   *
   * Only what makes them *them*: identity, voice and the short memory. What
   * they said this session is deliberately left behind.
   */
  export(): SavedViewer[] {
    return this.all().map((viewer) => ({
      id: viewer.id,
      name: viewer.name,
      nameWords: [...viewer.nameWords],
      color: viewer.color,
      personality: viewer.personality,
      activity: viewer.activity,
      verbosity: viewer.verbosity,
      emoteAffinity: viewer.emoteAffinity,
      voice: {
        ...viewer.voice,
        interests: [...viewer.voice.interests],
      },
      ...(viewer.note ? { note: viewer.note } : {}),
      ...(viewer.pinned ? { pinned: true } : {}),
      ...(viewer.mine ? { mine: true } : {}),
      memory: {
        topics: [...viewer.memory.topics],
        lines: [...viewer.memory.lines],
        addressed: [...viewer.memory.addressed],
      },
      seenAt: viewer.lastSpokeAt,
    }));
  }

  /**
   * Brings saved regulars back, newest first, up to the room's size.
   *
   * A smaller tier than last time keeps the people who spoke most recently;
   * a larger one fills the rest with new names, as it always did.
   */
  restore(saved: readonly SavedViewer[], size: number): void {
    // Hand-edited people first, then whoever spoke most recently: a tier
    // with room for three must not drop the one the streamer wrote.
    const wanted = [...saved]
      .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.seenAt - a.seenAt)
      .slice(0, size)
      .filter((entry) => PERSONALITIES[entry.personality as PersonalityId] !== undefined);
    if (wanted.length === 0) return;

    this.viewers.clear();

    for (const entry of wanted) {
      const viewer: Viewer = {
        id: entry.id,
        name: entry.name,
        nameWords: [...entry.nameWords],
        color: entry.color,
        personality: entry.personality as PersonalityId,
        activity: entry.activity,
        verbosity: entry.verbosity,
        emoteAffinity: entry.emoteAffinity,
        lastSpokeAt: 0,
        said: new Map(),
        intents: new Map(),
        spoken: 0,
        // A save from before voices existed gets one now, so an old roster
        // gains personalities rather than being thrown away.
        voice: entry.voice ?? buildVoice(this.rng, entry.personality as PersonalityId, entry.verbosity),
        memory: {
          topics: [...entry.memory.topics],
          lines: [...entry.memory.lines],
          addressed: [...entry.memory.addressed],
        },
        ...(entry.note ? { note: entry.note } : {}),
        ...(entry.pinned ? { pinned: true } : {}),
        ...(entry.mine ? { mine: true } : {}),
      };
      this.viewers.set(viewer.id, viewer);
      this.takenNames.add(viewer.name.toLowerCase());
      for (const word of viewer.nameWords) this.usedWords.add(word);
    }

    while (this.size < size) this.add();
  }

  /** Tag multipliers for this viewer's archetype. */
  tagBias(viewer: Viewer): Readonly<Partial<Record<string, number>>> {
    return PERSONALITIES[viewer.personality].tagBias;
  }
}

// ------------------------------------------------------------------ memory

/**
 * How much of a person the model is shown.
 *
 * Small on purpose: this rides in every prompt at the slow tiers, so each
 * extra line is input tokens on every call for the rest of the session.
 */
const MEMORY_TOPICS = 6;
const MEMORY_LINES = 3;
const MEMORY_ADDRESSED = 2;

function push(list: string[], value: string, limit: number): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const existing = list.indexOf(trimmed);
  if (existing !== -1) list.splice(existing, 1);
  list.push(trimmed);
  while (list.length > limit) list.shift();
}

function rememberNote(
  memory: ViewerMemory,
  note: { line?: string; topics?: readonly string[] },
): void {
  if (note.line) push(memory.lines, note.line.slice(0, 80), MEMORY_LINES);
  for (const topic of note.topics ?? []) push(memory.topics, topic.slice(0, 24), MEMORY_TOPICS);
}

