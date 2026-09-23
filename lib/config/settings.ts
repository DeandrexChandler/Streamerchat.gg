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
   * Target output rate, in messages per second.
   *
   * An explicit unit rather than the old 0.25-12 multiplier, so the setting,
   * the engine and the tests all mean the same thing. Momentum makes the
   * instantaneous rate swing well above and below this; the long-run average
   * is what tracks it.
   */
  messagesPerSecond: z.number().min(0.2).max(4).default(1),

  /**
   * Every message is emotes and nothing else — what real chat does during a
   * clutch moment. Requires an imported pack; with no emotes the director
   * emits nothing rather than blank lines.
   */
  emoteOnlyMode: z.boolean().default(false),

  /** off = allow everything, replace = censor, filter = drop the message. */
  profanityMode: z.enum(["off", "replace", "filter"]).default("replace"),
  /** Words the user never wants to see, beyond the built-in list. */
  blockedWords: z.array(z.string()).default([]),
  /** Words exempted from the built-in filter. */
  allowedWords: z.array(z.string()).default([]),

  /** Optional context so chat can reference the streamer and what they're doing. */
  streamerName: z.string().max(40).default(""),
  streamTopic: z.string().max(80).default(""),

  showTimestamps: z.boolean().default(false),
  /** Messages retained in the DOM. Beyond this, the oldest are dropped. */
  messageBufferSize: z.number().int().min(50).max(500).default(150),
});

export type SimulationSettings = z.infer<typeof SimulationSettingsSchema>;

export const DEFAULT_SETTINGS: SimulationSettings =
  SimulationSettingsSchema.parse({});

const STORAGE_KEY = "streamerchat-gg:settings:v2";

/**
 * Old `chatSpeed` multipliers mapped to the rates they actually produced.
 *
 * The multiplier was labelled in the UI as "~30/min" and friends, so these
 * come from those labels rather than from the raw number. Anything not in the
 * table falls through to the schema default, which is the right outcome for a
 * hand-edited or corrupt value.
 */
const LEGACY_SPEED_TO_RATE: Readonly<Record<string, number>> = {
  "0.5": 0.5,
  "0.8": 0.5,
  "1.2": 1,
  "2": 1.5,
  "3.5": 2,
  "12": 4,
};

/** Rewrites a pre-messagesPerSecond blob in place. Unknown shapes pass through. */
function migrate(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const blob = raw as Record<string, unknown>;
  if ("messagesPerSecond" in blob || !("chatSpeed" in blob)) return blob;

  const { chatSpeed, ...rest } = blob;
  const mapped = LEGACY_SPEED_TO_RATE[String(chatSpeed)];
  return mapped === undefined ? rest : { ...rest, messagesPerSecond: mapped };
}

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
      const parsed = SimulationSettingsSchema.safeParse(migrate(JSON.parse(raw)));
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
