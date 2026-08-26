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
const SPEED_STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
const SPEED_LABELS = ["~13/min", "~20/min", "~27/min", "~40/min", "~55/min", "CHAOS"];

const AUDIENCE_STEPS = [10, 25, 50, 100, 200] as const;

export interface ControlPanelProps {
  status: SimulatorStatus;
  stats: EngineStats;
  settings: SimulationSettings;
  micLabel: string;
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
  subscribeLevel,
  onClear,
  onChange,
}: ControlPanelProps) {
  return (
    <aside className="flex h-full w-56 flex-col gap-4 overflow-y-auto rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <MicMeter
        subscribe={subscribeLevel}
        active={status === "running"}
        label={micLabel || undefined}
      />

      <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <StepSlider
          label="Chat speed"
          steps={SPEED_STEPS}
          labels={SPEED_LABELS}
          value={settings.chatSpeed}
          onChange={(chatSpeed) => onChange({ chatSpeed })}
        />
        <StepSlider
          label="Audience"
          steps={AUDIENCE_STEPS}
          labels={AUDIENCE_STEPS.map((n) => `${n}`)}
          value={settings.audienceSize}
          onChange={(audienceSize) => onChange({ audienceSize })}
        />
      </div>

      <div className="space-y-2.5 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Toggle
          label="Idle chatter"
          checked={settings.idleEnabled}
          onChange={(idleEnabled) => onChange({ idleEnabled })}
        />
        <Toggle
          label="Emotes"
          checked={settings.emotesEnabled}
          onChange={(emotesEnabled) => onChange({ emotesEnabled })}
        />
        <Toggle
          label="Timestamps"
          checked={settings.showTimestamps}
          onChange={(showTimestamps) => onChange({ showTimestamps })}
        />

        <label className="block space-y-1.5 pt-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Language filter
          </span>
          <select
            value={settings.profanityMode}
            onChange={(e) =>
              onChange({
                profanityMode: e.target
                  .value as SimulationSettings["profanityMode"],
              })
            }
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="replace">Censor swearing</option>
            <option value="filter">Drop those messages</option>
            <option value="off">Allow swearing</option>
          </select>
          {/* Worth stating plainly: "off" is not a safety switch. */}
          <span className="block text-[10px] leading-tight text-gray-500 dark:text-gray-500">
            Slurs are always blocked.
          </span>
        </label>
      </div>

      <div className="mt-auto space-y-1.5 border-t border-gray-200 pt-4 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <Stat label="Viewers" value={stats.audience} />
        <Stat label="Messages" value={stats.released} />
        <Stat label="Ignored" value={stats.ignored} />

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-gray-700 dark:text-gray-300">
        {value}
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
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-purple-500"
      />
    </label>
  );
}
