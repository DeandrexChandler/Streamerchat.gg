import { PERSONALITY_LIST, PERSONALITIES } from "../data/personalities";
import { USERNAME_COLORS, generateUsername } from "../data/usernames";
import type { Rng } from "./rng";
import type { Intent, Viewer } from "./types";

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

export class Population {
  private readonly viewers = new Map<string, Viewer>();
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
    return this.viewers.get(id);
  }

  /** Adds one viewer with a personality sampled by archetype weight. */
  add(): Viewer {
    const personality = this.rng.weighted(PERSONALITY_LIST, (p) => p.weight);
    const { name, words } = generateUsername(
      this.rng,
      this.takenNames,
      this.usedWords,
    );
    this.takenNames.add(name.toLowerCase());
    for (const word of words) this.usedWords.add(word);

    const viewer: Viewer = {
      id: `v${this.nextId++}`,
      name,
      nameWords: words,
      color: this.rng.pick(USERNAME_COLORS),
      personality: personality.id,
      activity: this.rng.float(...personality.activity),
      verbosity: this.rng.float(...personality.verbosity),
      emoteAffinity: this.rng.float(...personality.emoteAffinity),
      lastSpokeAt: 0,
      said: new Set(),
      intents: new Map(),
      spoken: 0,
    };

    this.viewers.set(viewer.id, viewer);
    return viewer;
  }

  /** Removes a random viewer, if any remain. Used for churn. */
  remove(): Viewer | undefined {
    const all = this.all();
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

  markSpoke(viewerId: string, at: number): void {
    const viewer = this.viewers.get(viewerId);
    if (viewer) viewer.lastSpokeAt = at;
  }

  /** Sit-out after speaking. Tier-aware; the engine sets it from the rate. */
  setCooldown(ms: number): void {
    this.cooldownMs = ms;
  }

  // ------------------------------------------------------------- memory

  /** Whether this viewer has already said this, normalised. */
  hasSaid(viewerId: string, normalised: string): boolean {
    return this.viewers.get(viewerId)?.said.has(normalised) === true;
  }

  /** When this viewer last did this, or undefined if never. */
  lastDid(viewerId: string, intent: Intent): number | undefined {
    return this.viewers.get(viewerId)?.intents.get(intent);
  }

  /** Records a message against its viewer. */
  remember(viewerId: string, normalised: readonly string[], intent: Intent, at: number): void {
    const viewer = this.viewers.get(viewerId);
    if (!viewer) return;
    for (const text of normalised) viewer.said.add(text);
    viewer.intents.set(intent, at);
    viewer.spoken += 1;
  }

  /** A new session: everyone forgets what they said. Identities stay. */
  forget(): void {
    for (const viewer of this.viewers.values()) {
      viewer.said.clear();
      viewer.intents.clear();
      viewer.spoken = 0;
      viewer.lastSpokeAt = 0;
    }
  }

  /** Tag multipliers for this viewer's archetype. */
  tagBias(viewer: Viewer): Readonly<Partial<Record<string, number>>> {
    return PERSONALITIES[viewer.personality].tagBias;
  }
}
