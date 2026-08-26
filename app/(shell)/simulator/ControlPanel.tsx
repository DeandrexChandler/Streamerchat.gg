"use client";

import { Square, Trash2 } from "lucide-react";
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
 * Every slider snaps to a named step rather than sweeping a continuous range.
 * A continuous "1.37× speed" is not a meaningful setting — it invites
 * fiddling, gives no vocabulary for describing what you picked, and makes two
 * sessions impossible to compare.
 */

/** Discrete stops. Index into these rather than exposing a raw range. */
const SPEED_STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
const SPEED_LABELS = ["Slow", "Relaxed", "Normal", "Busy", "Fast", "Chaos"];

const AUDIENCE_STEPS = [10, 25, 50, 100, 200] as const;
const AUDIENCE_LABELS = ["Tiny", "Small", "Medium", "Big", "Huge"];

const SIDE_STEPS = [0, 0.1, 0.2, 0.35, 0.5] as const;
const SIDE_LABELS = ["None", "Rare", "Some", "Chatty", "Constant"];

export interface ControlPanelProps {
  status: SimulatorStatus;
  stats: EngineStats;
  settings: SimulationSettings;
  micLabel: string;
  subscribeLevel: (handler: (level: number) => void) => () => void;
  onStop: () => void;
  onClear: () => void;
  onChange: (patch: Partial<SimulationSettings>) => void;
}

export function ControlPanel({
  status,
  stats,
  settings,
  micLabel,
  subscribeLevel,
  onStop,
  onClear,
  onChange,
}: ControlPanelProps) {
  const started = status === "running" || status === "paused";

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
          labels={AUDIENCE_LABELS}
          value={settings.audienceSize}
          onChange={(audienceSize) => onChange({ audienceSize })}
        />
        <StepSlider
          label="Side chatter"
          steps={SIDE_STEPS}
          labels={SIDE_LABELS}
          value={settings.sideConversationChance}
          onChange={(sideConversationChance) =>
            onChange({ sideConversationChance })
          }
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

        <div className="flex gap-1.5 pt-1.5">
          <button
            type="button"
            onClick={onClear}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-gray-300 py-1.5 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            <Trash2 size={12} />
            Clear
          </button>
          {started && (
            <button
              type="button"
              onClick={onStop}
              title="Stop and release the microphone"
              className="flex items-center justify-center rounded border border-gray-300 px-2 py-1.5 transition-colors hover:bg-gray-100 hover:text-red-500 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <Square size={12} />
            </button>
          )}
        </div>
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
        <span className="font-medium text-gray-900 dark:text-gray-100">
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
