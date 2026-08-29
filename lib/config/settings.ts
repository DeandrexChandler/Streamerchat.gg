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
  /**
   * Displayed concurrent viewers. Cosmetic above MAX_SIMULATED_VIEWERS.
   *
   * A real stream with 10,000 viewers does not have 10,000 people talking —
   * it has a few dozen, drawn from a huge silent pool. Simulating ten thousand
   * distinct identities would burn memory and username vocabulary to produce
   * output indistinguishable from a few hundred, so the number above the cap
   * only drives the viewer count and how fast the roster turns over.
   */
  audienceSize: z.number().int().min(5).max(10_000).default(50),

  /** Global message-rate multiplier. 1 = tuned default. */
  chatSpeed: z.number().min(0.25).max(12).default(1.2),

  /** Hard ceiling so a hype spike can't flood the renderer. */
  maxMessagesPerMinute: z.number().int().min(5).max(400).default(90),

  /** Idle chatter when the streamer goes quiet. */
  idleEnabled: z.boolean().default(true),
  /** Seconds of silence before idle chatter starts. */
  idleAfterSeconds: z.number().min(5).max(120).default(14),

  /** Probability that a message replies to another viewer instead of the streamer. */
  sideConversationChance: z.number().min(0).max(0.6).default(0.12),

  emotesEnabled: z.boolean().default(true),

  /** off = allow everything, replace = censor, filter = drop the message. */
  profanityMode: z.enum(["off", "replace", "filter"]).default("replace"),
  /** Words the user never wants to see, beyond the built-in list. */
  blockedWords: z.array(z.string()).default([]),
  /** Words exempted from the built-in filter. */
  allowedWords: z.array(z.string()).default([]),

  /**
   * Probability that a *substantive* message is drawn from the AI tier.
   * 0 = fully offline.
   *
   * Note this is not a share of all traffic. AI is only ever used for
   * "engaged"/"invested" messages, which are a minority by design — spending
   * a model call to produce "W" or an emote would be pure waste. Effective
   * AI usage lands well under this number.
   */
  aiShare: z.number().min(0).max(0.4).default(0.05),

  /** Optional context so chat can reference the streamer and what they're doing. */
  streamerName: z.string().max(40).default(""),
  streamTopic: z.string().max(80).default(""),

  showTimestamps: z.boolean().default(false),
  /** Messages retained in the DOM. Beyond this, the oldest are dropped. */
  messageBufferSize: z.number().int().min(50).max(500).default(150),
});

export type SimulationSettings = z.infer<typeof SimulationSettingsSchema>;

/**
 * Hard ceiling on distinct simulated viewers.
 *
 * Beyond this the audience setting is a label, not a headcount. Picked so the
 * username vocabulary never runs dry and the weighted speaker pick stays cheap
 * at the tick rate.
 */
export const MAX_SIMULATED_VIEWERS = 300;

export const DEFAULT_SETTINGS: SimulationSettings =
  SimulationSettingsSchema.parse({});

const STORAGE_KEY = "streamerchat-gg:settings:v2";

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
