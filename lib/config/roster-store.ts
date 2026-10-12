import { z } from "zod";

/**
 * The regulars, kept between streams.
 *
 * The point of a fixed roster is that the streamer comes to know these
 * people, and someone who forgets you between sessions is not a regular.
 * What persists is the identity and the short memory the model is shown —
 * never what they said this session, which is session-scoped by design so
 * chat does not open by repeating last night.
 *
 * Browser storage, like every other setting here: there are no accounts.
 */

const KEY = "streamerchat-gg:roster:v1";
/** Bumped by every hand edit, so a session can tell its copy is out of date. */
const REVISION_KEY = "streamerchat-gg:roster:revision";

function bumpRevision(): void {
  try {
    window.localStorage.setItem(REVISION_KEY, String(localRosterStore.revision() + 1));
  } catch {
    // Unwritable storage: nothing was saved for a session to overwrite.
  }
}

const SavedViewerSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(40),
  nameWords: z.array(z.string().max(40)).max(6),
  color: z.string().max(16),
  personality: z.string().max(40),
  activity: z.number().min(0).max(1),
  verbosity: z.number().min(0).max(1),
  emoteAffinity: z.number().min(0).max(1),
  voice: z
    .object({
      words: z.number().min(1).max(20),
      caps: z.number().min(0).max(1),
      punctuation: z.number().min(0).max(1),
      questions: z.number().min(0).max(1),
      stretch: z.number().min(0).max(1),
      interests: z.array(z.string().max(60)).max(2),
    })
    .optional(),
  /** Written by the streamer. Sent to the model as their character. */
  note: z.string().max(200).optional(),
  /** Kept in the room: never rotated out. The streamer's choice. */
  pinned: z.boolean().optional(),
  /** Created by the streamer rather than generated. A label, nothing more. */
  mine: z.boolean().optional(),
  /**
   * Touched by hand at all.
   *
   * What protects an edit from a running session, which writes its own
   * copy of the room back every twenty seconds. Kept separate from
   * `pinned` because pinning is now a choice anyone can make about anyone,
   * including a generated regular nobody has edited.
   */
  edited: z.boolean().optional(),
  memory: z.object({
    topics: z.array(z.string().max(24)).max(6),
    lines: z.array(z.string().max(80)).max(3),
    addressed: z.array(z.string().max(120)).max(2),
  }),
  /** When this person last spoke, so the freshest regulars survive a trim. */
  seenAt: z.number().nonnegative(),
});

export type SavedViewer = z.infer<typeof SavedViewerSchema>;

/** Twelve regulars is the largest roster any tier builds. */
const SavedRosterSchema = z.array(SavedViewerSchema).max(12);

export const localRosterStore = {
  load(): SavedViewer[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = SavedRosterSchema.safeParse(JSON.parse(raw));
      // A shape from an older build is not worth repairing: the names come
      // back on the next session anyway.
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  },

  /**
   * Writes the roster back, keeping hand-edited people as they were edited.
   *
   * A running session writes its roster every twenty seconds. Without this
   * merge, editing someone in another tab mid-session would be silently
   * undone by the next write — the session would put back the name, voice
   * and character it started with. Memory and last-spoken always come from
   * the session, which is the half it actually owns.
   */
  save(roster: readonly SavedViewer[], basedOn?: number): void {
    if (typeof window === "undefined") return;
    /**
     * The streamer changed who is in the room since this session loaded it.
     *
     * The session outlives a trip to settings, so its copy can predate an
     * edit there: writing it back would delete someone just added and bring
     * back someone just removed. The edit wins, and the session stops writing
     * until Reset session loads the new room.
     * ponytail: the rest of that session's memory is not saved; merge it per
     * person if editing mid-stream turns out to be common.
     */
    if (basedOn !== undefined && basedOn !== this.revision()) return;
    const edited = new Map(
      this.load()
        // `pinned` alone counts for rosters saved before the two were
        // separated, where pinning was the only mark an edit left.
        .filter((viewer) => viewer.edited || viewer.pinned)
        .map((viewer) => [viewer.id, viewer]),
    );

    const merged = roster.slice(0, 12).map((viewer) => {
      const pinned = edited.get(viewer.id);
      if (!pinned) return viewer;
      return {
        ...pinned,
        memory: viewer.memory,
        seenAt: viewer.seenAt,
      };
    });

    try {
      window.localStorage.setItem(KEY, JSON.stringify(merged));
    } catch {
      // Quota or private mode. Regulars fall back to being session-only.
    }
  },

  /** Which hand edit the stored roster reflects. Zero before the first. */
  revision(): number {
    if (typeof window === "undefined") return 0;
    try {
      return Number(window.localStorage.getItem(REVISION_KEY)) || 0;
    } catch {
      return 0;
    }
  },

  /** Writes exactly what it is given. Used by the editor itself. */
  replace(roster: readonly SavedViewer[]): void {
    if (typeof window === "undefined") return;
    bumpRevision();
    try {
      window.localStorage.setItem(KEY, JSON.stringify(roster.slice(0, 12)));
    } catch {
      // Nothing to do; the edit lives only in this page.
    }
  },

  clear(): void {
    if (typeof window === "undefined") return;
    bumpRevision();
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Nothing to do; it is already unreadable.
    }
  },
};
