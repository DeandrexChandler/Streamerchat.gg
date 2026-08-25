import { z } from "zod";

/**
 * Simulation settings.
 *
 * Validated with zod on the way in, because these are persisted to
 * localStorage and a stale or hand-edited blob must never be able to put the
 * engine into an impossible state (negative delays, zero-size population).
 * Unknown/missing keys fall back to defaults rather than throwing.
 */
export const SimulationSettingsSchema = z.object({
  /** Approximate concurrent viewers. Drives population size and volume. */
  audienceSize: z.number().int().min(5).max(400).default(45),

  /** Global message-rate multiplier. 1 = tuned default. */
  chatSpeed: z.number().min(0.25).max(3).default(1),

  /** Hard ceiling so a hype spike can't flood the renderer. */
  maxMessagesPerMinute: z.number().int().min(5).max(400).default(90),

  /** Idle chatter when the streamer goes quiet. */
  idleEnabled: z.boolean().default(true),
  /** Seconds of silence before idle chatter starts. */
  idleAfterSeconds: z.number().min(5).max(120).default(14),

  /** Probability that a message replies to another viewer instead of the streamer. */
  sideConversationChance: z.number().min(0).max(0.6).default(0.22),

  emotesEnabled: z.boolean().default(true),

  /** off = allow everything, replace = censor, filter = drop the message. */
  profanityMode: z.enum(["off", "replace", "filter"]).default("replace"),
  /** Words the user never wants to see, beyond the built-in list. */
  blockedWords: z.array(z.string()).default([]),
  /** Words exempted from the built-in filter. */
  allowedWords: z.array(z.string()).default([]),

  /** Share of messages allowed to come from the AI tier. 0 = fully offline. */
  aiShare: z.number().min(0).max(0.4).default(0.05),

  /** Optional context so chat can reference the streamer and what they're doing. */
  streamerName: z.string().max(40).default(""),
  streamTopic: z.string().max(80).default(""),

  /** Twitch channel whose 7TV/BTTV emote set should be imported. */
  emoteChannel: z.string().max(40).default(""),

  showTimestamps: z.boolean().default(false),
  /** Messages retained in the DOM. Beyond this, the oldest are dropped. */
  messageBufferSize: z.number().int().min(50).max(500).default(150),
});

export type SimulationSettings = z.infer<typeof SimulationSettingsSchema>;

export const DEFAULT_SETTINGS: SimulationSettings =
  SimulationSettingsSchema.parse({});

const STORAGE_KEY = "streamerchat:settings:v2";

/**
 * Storage is behind this interface so swapping localStorage for a database
 * later is a new implementation rather than a rewrite of every caller.
 */
export interface SettingsStore {
  load(): SimulationSettings;
  save(settings: SimulationSettings): void;
}

export const localSettingsStore: SettingsStore = {
  load() {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      // Partial/unknown keys are coerced back to defaults by the schema.
      const parsed = SimulationSettingsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  save(settings) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Quota or private-mode failure — non-fatal, settings just won't persist.
    }
  },
};
