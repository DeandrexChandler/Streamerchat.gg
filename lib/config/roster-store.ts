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

  save(roster: readonly SavedViewer[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(roster.slice(0, 12)));
    } catch {
      // Quota or private mode. Regulars fall back to being session-only.
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
