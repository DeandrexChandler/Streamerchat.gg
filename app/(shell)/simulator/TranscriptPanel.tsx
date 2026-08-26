"use client";

import { useLayoutEffect, useRef } from "react";
import type { HeardUtterance } from "@/lib/react/use-simulator";

/**
 * What the microphone heard, and what chat did with it.
 *
 * Two jobs, and the first one is the important one:
 *
 *  1. Show transcription accuracy. Web Speech misheard words are the single
 *     most likely cause of a reaction that feels wrong, and without seeing the
 *     text there is no way to tell a bad transcript from a bad classifier.
 *  2. Show what chat acknowledged versus let pass. Acknowledged lines are
 *     bright with a coloured spine; ignored ones are dimmed. Chat deliberately
 *     not reacting is a feature, and it should be legible as one rather than
 *     looking like something broke.
 */

const INTENT_LABELS: Record<string, string> = {
  question_to_chat: "asked chat",
  greeting: "greeting",
  farewell: "farewell",
  excitement: "excited",
  achievement: "win",
  struggle: "struggling",
  confusion: "confused",
  showing: "showing",
  story: "story",
  mundane: "background",
};

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

  const acknowledged = heard.filter((h) => h.outcome.reacted).length;

  return (
    <aside className="flex h-full w-72 flex-col overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
      <header className="flex flex-shrink-0 items-baseline justify-between border-b border-gray-200 px-3 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Transcription
        </h2>
        {heard.length > 0 && (
          <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
            {acknowledged}/{heard.length} used
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {heard.length === 0 && !interim && (
          <p className="px-1 py-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {listening
              ? "Listening. Everything the microphone picks up appears here, so you can see how accurate it is and what chat chose to react to."
              : "Press Play to see what your microphone picks up."}
          </p>
        )}

        {heard.map((entry) => {
          const { classification, reacted, queued } = entry.outcome;

          return (
            <article
              key={entry.id}
              className={`rounded border-l-2 py-1.5 pr-2 pl-2 transition-opacity ${
                reacted
                  ? "border-l-purple-500 bg-purple-50 dark:bg-purple-500/10"
                  : "border-l-gray-300 opacity-50 dark:border-l-gray-600"
              }`}
            >
              <p
                className={`text-[13px] leading-snug ${
                  reacted
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-500 italic dark:text-gray-500"
                }`}
              >
                {entry.text}
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="font-medium">
                  {INTENT_LABELS[classification.intent] ?? classification.intent}
                </span>
                <span title="How confident the classifier was">
                  {(classification.confidence * 100).toFixed(0)}% sure
                </span>
                <span
                  className={
                    reacted
                      ? "font-medium text-purple-600 dark:text-purple-400"
                      : ""
                  }
                  title={
                    reacted
                      ? "Chat reacted to this"
                      : "Chat let this one pass — not everything deserves a reaction"
                  }
                >
                  {reacted ? `${queued} replies` : "ignored"}
                </span>
              </div>
            </article>
          );
        })}

        {/* In-progress speech, shown dashed so it's clearly not final yet. */}
        {interim && (
          <article className="rounded border-l-2 border-l-blue-400 border-dashed py-1.5 pr-2 pl-2">
            <p className="text-[13px] leading-snug text-blue-600 italic dark:text-blue-400">
              {interim}
            </p>
          </article>
        )}

        <div ref={endRef} />
      </div>

      <footer className="flex-shrink-0 border-t border-gray-200 px-3 py-2 text-[10px] leading-tight text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Highlighted lines were acknowledged by chat. Dimmed lines were ignored
        on purpose.
      </footer>
    </aside>
  );
}
