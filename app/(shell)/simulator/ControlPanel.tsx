"use client";

import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { MicMeter } from "@/app/components/MicMeter";
import type { SimulationSettings } from "@/lib/config/settings";
import type { EngineStats } from "@/lib/engine/engine";
import type { SimulatorStatus } from "@/lib/react/use-simulator";

export interface ControlPanelProps {
  status: SimulatorStatus;
  stats: EngineStats;
  settings: SimulationSettings;
  micLabel: string;
  subscribeLevel: (handler: (level: number) => void) => () => void;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onChange: (patch: Partial<SimulationSettings>) => void;
}

/**
 * Live controls.
 *
 * Everything that matters mid-stream is visible without opening anything. The
 * old build hid the microphone state, the threshold and the idle toggle inside
 * a dropdown in the chat header, which meant checking whether your mic was
 * working required two clicks and covered the chat while you did it.
 */
export function ControlPanel({
  status,
  stats,
  settings,
  micLabel,
  subscribeLevel,
  onStart,
  onStop,
  onPause,
  onResume,
  onClear,
  onChange,
}: ControlPanelProps) {
  const live = status === "running";
  const busy = status === "starting";

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l border-zinc-800 bg-zinc-900/40 p-4">
      <div className="space-y-3">
        {!live && status !== "paused" ? (
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Mic size={16} />
            {busy ? "Starting…" : "Start"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={live ? onPause : onResume}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              {live ? <Pause size={15} /> : <Play size={15} />}
              {live ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={onStop}
              title="Stop and release the microphone"
              className="flex items-center justify-center rounded-lg border border-zinc-700 px-3 py-2.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-red-400"
            >
              <Square size={15} />
            </button>
          </div>
        )}

        <MicMeter
          subscribe={subscribeLevel}
          active={live}
          label={micLabel || undefined}
        />
      </div>

      <div className="space-y-4 border-t border-zinc-800 pt-4">
        <Slider
          label="Chat speed"
          value={settings.chatSpeed}
          min={0.25}
          max={3}
          step={0.25}
          format={(v) => `${v}×`}
          onChange={(chatSpeed) => onChange({ chatSpeed })}
        />
        <Slider
          label="Audience"
          value={settings.audienceSize}
          min={5}
          max={200}
          step={5}
          format={(v) => `${v}`}
          onChange={(audienceSize) => onChange({ audienceSize })}
        />
        <Slider
          label="Side chatter"
          value={settings.sideConversationChance}
          min={0}
          max={0.6}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(sideConversationChance) => onChange({ sideConversationChance })}
        />

        <Toggle
          label="Idle chatter"
          hint="Chat talks among itself when you go quiet"
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

        <label className="block space-y-1.5">
          <span className="text-xs text-zinc-400">Language filter</span>
          <select
            value={settings.profanityMode}
            onChange={(e) =>
              onChange({
                profanityMode: e.target.value as SimulationSettings["profanityMode"],
              })
            }
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          >
            <option value="replace">Censor swearing</option>
            <option value="filter">Drop those messages</option>
            <option value="off">Allow swearing</option>
          </select>
          {/* Worth stating plainly: "off" is not a safety switch. */}
          <span className="block text-[10px] leading-tight text-zinc-600">
            Slurs are always blocked, including on “allow”.
          </span>
        </label>
      </div>

      <div className="mt-auto space-y-2 border-t border-zinc-800 pt-4 text-[11px] text-zinc-500">
        <div className="flex justify-between">
          <span>Viewers</span>
          <span className="tabular-nums text-zinc-400">{stats.audience}</span>
        </div>
        <div className="flex justify-between">
          <span>Messages</span>
          <span className="tabular-nums text-zinc-400">{stats.released}</span>
        </div>
        <div className="flex justify-between">
          <span title="Utterances chat deliberately let pass">Ignored</span>
          <span className="tabular-nums text-zinc-400">{stats.ignored}</span>
        </div>
        <div className="flex justify-between">
          <span title="Messages generated by the AI tier">AI lines</span>
          <span className="tabular-nums text-zinc-400">
            {stats.bySource.ai ?? 0}
          </span>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-800 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <Trash2 size={13} />
          Clear chat
        </button>
      </div>
    </aside>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-300">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="space-y-0.5">
        <span className="block text-xs text-zinc-300">{label}</span>
        {hint && (
          <span className="block text-[10px] leading-tight text-zinc-600">
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-purple-500"
      />
    </label>
  );
}
