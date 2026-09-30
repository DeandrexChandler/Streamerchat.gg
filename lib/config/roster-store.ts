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
  /** Edited by hand: kept exactly as-is, and never rotated out. */
  pinned: z.boolean().optional(),
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
  save(roster: readonly SavedViewer[]): void {
    if (typeof window === "undefined") return;
    const edited = new Map(
      this.load()
        .filter((viewer) => viewer.pinned)
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

  /** Writes exactly what it is given. Used by the editor itself. */
  replace(roster: readonly SavedViewer[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(roster.slice(0, 12)));
    } catch {
      // Nothing to do; the edit lives only in this page.
    }
  },

  clear(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Nothing to do; it is already unreadable.
    }
  },
};
