"use client";

import { useLayoutEffect, useRef } from "react";
import { Keyboard, Mic } from "lucide-react";
import type { HeardUtterance } from "@/lib/react/use-simulator";

/**
 * A chronological log of everything submitted, and what became of it.
 *
 * Two facts per entry, and nothing that competes with them: where the text
 * came from, and whether the engine accepted it. Reply counts used to sit
 * here — "3 replies", "12 replies" — which measured the wrong thing entirely:
 * generation now happens as one batch released over time, so a count taken at
 * submission answered a question nobody was asking.
 *
 * Transcription accuracy is still the first job. A misheard word is the single
 * most likely cause of a reaction that feels wrong, and without seeing the
 * text there is no way to tell a bad transcript from a bad response.
 */

export interface TranscriptPanelProps {
  heard: HeardUtterance[];
  interim: string;
  listening: boolean;
}

export function TranscriptPanel({
  heard,
  interim,
  listening,
}: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [heard.length, interim]);

  return (
    <aside className="flex h-full w-72 flex-col overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
      <header className="flex flex-shrink-0 items-baseline justify-between border-b border-gray-200 px-3 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Transcription
        </h2>
        {heard.length > 0 && (
          <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
            {heard.length} event{heard.length === 1 ? "" : "s"}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {heard.length === 0 && !interim && (
          <p className="px-1 py-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {listening
              ? "Listening. Everything the microphone picks up appears here, alongside anything you type, so you can see exactly what chat was given."
              : "Press Play, or type a message below, to see what chat receives."}
          </p>
        )}

        {heard.map((entry) => (
          <article
            key={entry.id}
            className={`rounded border-l-2 py-1.5 pr-2 pl-2 ${
              entry.heard
                ? "border-l-purple-500 bg-purple-50 dark:bg-purple-500/10"
                : "border-l-gray-300 opacity-60 dark:border-l-gray-600"
            }`}
          >
            <p
              className={`text-[13px] leading-snug ${
                entry.heard
                  ? "text-gray-900 dark:text-gray-100"
                  : "text-gray-500 italic dark:text-gray-500"
              }`}
            >
              {entry.text}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                icon={
                  entry.source === "typed" ? (
                    <Keyboard className="size-2.5" aria-hidden />
                  ) : (
                    <Mic className="size-2.5" aria-hidden />
                  )
                }
                label={entry.source === "typed" ? "TYPED" : "MICROPHONE"}
                tone="neutral"
              />
              <Badge
                label={entry.heard ? "HEARD" : "IGNORED"}
                tone={entry.heard ? "heard" : "ignored"}
              />
            </div>
          </article>
        ))}

        {/* In-progress speech, dashed so it reads as not final yet. */}
        {interim && (
          <article className="rounded border-l-2 border-dashed border-l-blue-400 py-1.5 pr-2 pl-2">
            <p className="text-[13px] leading-snug text-blue-600 italic dark:text-blue-400">
              {interim}
            </p>
          </article>
        )}

        <div ref={endRef} />
      </div>

      <footer className="flex-shrink-0 border-t border-gray-200 px-3 py-2 text-[10px] leading-tight text-gray-500 dark:border-gray-700 dark:text-gray-400">
        HEARD means chat was asked to respond. IGNORED means the engine let it
        pass on purpose — typed messages are never ignored.
      </footer>
    </aside>
  );
}

const TONES = {
  heard: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200",
  ignored: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  neutral: "bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300",
} as const;

/**
 * The panel's main visual signal.
 *
 * Text as well as colour, and never colour alone — the difference between
 * heard and ignored has to survive being read by someone who cannot
 * distinguish the two backgrounds.
 */
function Badge({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${TONES[tone]}`}
    >
      {icon}
      {label}
    </span>
  );
}
