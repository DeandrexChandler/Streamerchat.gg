"use client";

import { Trash2 } from "lucide-react";
import { MicMeter } from "@/app/components/MicMeter";
import type { SimulationSettings } from "@/lib/config/settings";
import type { EngineStats } from "@/lib/engine/engine";
import type { SimulatorStatus } from "@/lib/react/use-simulator";

/**
 * Settings, mic meter and session stats.
 *
 * Start/pause deliberately does NOT live here — it sits next to the chat input
 * where a real chat's send button is, which is where a streamer's hand already
 * goes. This panel is for things you set, not things you do mid-sentence.
 *
 * There is no separate Stop control either. A Stop button sitting beside a
 * Play/Pause button is two ways to say "not running", which is just confusing.
 * Clear does the job: it wipes the log, releases the microphone, and returns
 * the button to Play — one obvious "start over".
 *
 * Every slider snaps to a named step rather than sweeping a continuous range.
 * A continuous "1.37× speed" is not a meaningful setting — it invites
 * fiddling, gives no vocabulary for describing what you picked, and makes two
 * sessions impossible to compare.
 */

/**
 * Discrete stops. The range input walks indices, so every position is a
 * deliberate setting rather than an arbitrary point on a continuum.
 *
 * Speed is labelled in messages per minute rather than as a multiplier or a
 * mood word. "1.5x" and "Busy" both require you to run the simulator to find
 * out what they mean; "~40/min" tells you before you commit. Per-minute rather
 * than per-second because the real rate is well under one a second, and
 * "0.7/sec" reads as noise.
 *
 * The rates come from measuring the engine at each multiplier, so they will
 * drift if the director's burst sizes are retuned — treat them as the label
 * for a measured value, not as a target the engine enforces.
 */
/**
 * The six tiers, paired one-to-one with SPEED_LABELS below.
 *
 * There were five steps against six labels, so CHAOS was unreachable — the
 * slider could never reach the index that renders it.
 *
 * CHAOS is 4/sec because that is the schema ceiling on messagesPerSecond, and
 * the scheduler's derived rate cap is built from the same number. Its label
 * deliberately states no rate: it is a mood, not a measurement.
 */
const SPEED_STEPS = [0.2, 0.5, 1, 1.5, 2, 4] as const;

/**
 * Labelled in the unit the engine actually uses.
 *
 * The old scale was a 0.25-12 multiplier labelled "~30/min", which meant the
 * setting, the engine and the tests all spoke different languages. These are
 * long-run averages, not a metronome.
 *
 * The top step is deliberately NOT labelled with its rate. CHAOS is a mood,
 * not a measurement — the red pulse in StepSlider keys off this exact string,
 * and an earlier rewrite to "Chaos ~4/sec" silently broke that match and left
 * it rendering as ordinary text.
 */
const SPEED_LABELS = [
  "~0.2/sec", // 3-11 unique usernames/viewers
  "~0.5/sec", // 12-24 unique usernames/viewers
  "~1/sec",   // 25-180 unique usernames/viewers
  "~1.5/sec", // 181-500 unique usernames/viewers
  "~2/sec",   // 501-1000 unique usernames/viewers
  "CHAOS",    // 1000+ unique usernames/viewers (however many engine can handle)
] as const;


/** What the room is doing, in the streamer's words rather than the engine's. */
const PHASE_LABELS: Record<EngineStats["phase"], string> = {
  startup: "Arriving",
  active: "Reacting",
  idle: "Idle",
};

export interface ControlPanelProps {
  status: SimulatorStatus;
  stats: EngineStats;
  settings: SimulationSettings;
  micLabel: string;
  /** Emotes currently loaded. Zero disables the emote-only mode. */
  emoteCount: number;
  /** True while the streamer's screen is being captured for chat. */
  watching: boolean;
  onWatchingChange: (on: boolean) => void;
  /** Mic off by choice; chat keeps going on typed input. */
  muted: boolean;
  onMutedChange: (on: boolean) => void;
  subscribeLevel: (handler: (level: number) => void) => () => void;
  /** Wipes the log and resets the session back to Play. */
  onClear: () => void;
  onChange: (patch: Partial<SimulationSettings>) => void;
}

export function ControlPanel({
  status,
  stats,
  settings,
  micLabel,
  emoteCount,
  watching,
  onWatchingChange,
  muted,
  onMutedChange,
  subscribeLevel,
  onClear,
  onChange,
}: ControlPanelProps) {
  return (
    <aside className="flex h-full w-56 flex-col gap-4 overflow-y-auto rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <MicMeter
        subscribe={subscribeLevel}
        active={status === "running" && !muted}
        label={muted ? "Mic muted" : micLabel || undefined}
      />

      <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <StepSlider
          label="Chat speed"
          steps={SPEED_STEPS}
          labels={SPEED_LABELS}
          value={settings.messagesPerSecond}
          onChange={(messagesPerSecond) => onChange({ messagesPerSecond })}
        />
      </div>

      <div className="space-y-2.5 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Toggle
          label="Mute mic"
          checked={muted}
          hint="Turns the microphone off without stopping chat. Type to talk to chat instead."
          onChange={onMutedChange}
        />
        <Toggle
          label="Watch my screen"
          checked={watching}
          hint="Chat reacts to the game, not just what you say. Sends a small screenshot with each batch to the AI. Off by default."
          onChange={onWatchingChange}
        />
        <Toggle
          label="Emote only"
          checked={settings.emoteOnlyMode}
          disabled={emoteCount === 0}
          hint={
            emoteCount === 0
              ? "Needs emotes — import a pack on the Emotes page."
              : "Chat says nothing but emotes."
          }
          onChange={(emoteOnlyMode) => onChange({ emoteOnlyMode })}
        />
      </div>

      <div className="mt-auto space-y-1.5 border-t border-gray-200 pt-4 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <Stat label="Viewers" value={stats.audience} format={formatCount} />
        <Stat label="Messages" value={stats.released} />
        <Stat label="Ignored" value={stats.ignored} />
        <div className="flex justify-between">
          <span>Chat</span>
          <span className="text-gray-700 dark:text-gray-300">{PHASE_LABELS[stats.phase]}</span>
        </div>

        <button
          type="button"
          onClick={onClear}
          title="Wipe the chat, release the microphone, and reset to Play"
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-gray-300 py-1.5 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          <Trash2 size={12} />
          Clear chat
        </button>
      </div>
    </aside>
  );
}

/** Compact viewer counts: 950, 1.5k, 10k. */
function formatCount(value: number): string {
  if (value < 1000) return `${value}`;
  const thousands = value / 1000;
  return `${thousands % 1 === 0 ? thousands : thousands.toFixed(1)}k`;
}

function Stat({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-gray-700 dark:text-gray-300">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

/**
 * A slider that snaps to a fixed set of values.
 *
 * The range input walks indices, not the value itself, so every position is a
 * deliberate stop with a name. Falls back to the nearest step if a stored
 * setting doesn't match one exactly — which happens when the step list changes
 * between releases.
 */
function StepSlider({
  label,
  steps,
  labels,
  value,
  onChange,
}: {
  label: string;
  steps: readonly number[];
  labels: readonly string[];
  value: number;
  onChange: (value: number) => void;
}) {
  let index = steps.indexOf(value);
  if (index === -1) {
    index = steps.reduce(
      (best, step, i) =>
        Math.abs(step - value) < Math.abs(steps[best] - value) ? i : best,
      0,
    );
  }

  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span
          className={
            labels[index] === "CHAOS"
              ? "animate-pulse font-bold tracking-wide text-red-500"
              : "font-medium text-gray-900 dark:text-gray-100"
          }
        >
          {labels[index]}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(steps[Number(e.target.value)])}
        className="w-full accent-purple-500"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      title={hint}
      className={
        disabled
          ? "flex cursor-not-allowed items-center justify-between gap-2 opacity-50"
          : "flex cursor-pointer items-center justify-between gap-2"
      }
    >
      <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-purple-500"
      />
    </label>
  );
}
