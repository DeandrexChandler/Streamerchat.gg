import { PERSONALITY_LIST, PERSONALITIES } from "../data/personalities";
import { USERNAME_COLORS, generateUsername } from "../data/usernames";
import type { Rng } from "./rng";
import type { Viewer } from "./types";

/**
 * The virtual audience.
 *
 * The single most important realism decision in the engine: viewers persist
 * for the whole session instead of being invented per message. That gives you
 * recurring names, a handful of people who carry the conversation while most
 * lurk, and the ability for one viewer to reply to another — none of which is
 * expressible if every line comes from a fresh random username.
 */
export class Population {
  private readonly viewers = new Map<string, Viewer>();
  private readonly takenNames = new Set<string>();
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
    this.takenNames.delete(victim.name.toLowerCase());
    // Return the vocabulary to the pool so long sessions don't starve it.
    for (const word of victim.nameWords) this.usedWords.delete(word);
    return victim;
  }

  /** Grows or shrinks the audience toward `target`, one step at a time. */
  driftToward(target: number): void {
    if (this.size < target) this.add();
    else if (this.size > target) this.remove();
  }

  /**
   * Picks who speaks next, weighted by personality activity and damped by how
   * recently each viewer last spoke. The damping is what stops the two most
   * active viewers from monopolising every burst.
   *
   * `exclude` keeps a single burst from having one person reply to themselves.
   */
  pickSpeaker(now: number, exclude: ReadonlySet<string> = new Set()): Viewer | undefined {
    const eligible = this.all().filter((v) => !exclude.has(v.id));
    if (eligible.length === 0) return undefined;

    return this.rng.weighted(eligible, (viewer) => {
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

  /** Tag multipliers for this viewer's archetype. */
  tagBias(viewer: Viewer): Readonly<Partial<Record<string, number>>> {
    return PERSONALITIES[viewer.personality].tagBias;
  }
}
