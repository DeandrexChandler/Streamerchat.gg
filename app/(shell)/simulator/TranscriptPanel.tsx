"use client";

import { useLayoutEffect, useRef } from "react";
import { Ear, EarOff } from "lucide-react";
import type { HeardUtterance } from "@/lib/react/use-simulator";

/**
 * What the microphone heard and what the engine made of it.
 *
 * This is a tuning surface, not decoration. When a reaction feels wrong, this
 * is what tells you whether the transcript was wrong, the intent was wrong, or
 * the attention gate simply decided to let it pass — three very different
 * bugs that look identical from the chat pane alone.
 */

const INTENT_LABELS: Record<string, string> = {
  question_to_chat: "asked chat",
  greeting: "greeting",
  farewell: "farewell",
  excitement: "excited",
  achievement: "achievement",
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

  return (
    <section className="flex min-h-0 w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900/40">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        {listening ? (
          <Ear size={15} className="text-emerald-400" />
        ) : (
          <EarOff size={15} className="text-zinc-600" />
        )}
        <h2 className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
          Heard
        </h2>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {heard.length === 0 && !interim && (
          <p className="text-xs leading-relaxed text-zinc-600">
            {listening
              ? "Listening. Say something and it will show up here with how chat read it."
              : "Start the simulator to see what your microphone picks up."}
          </p>
        )}

        {heard.map((entry) => {
          const { classification, reacted, queued } = entry.outcome;
          return (
            <article
              key={entry.id}
              className={`rounded-md border px-2.5 py-2 ${
                reacted
                  ? "border-zinc-800 bg-zinc-900"
                  : "border-zinc-800/60 bg-transparent opacity-55"
              }`}
            >
              <p className="text-[13px] leading-snug text-zinc-200">
                {entry.text}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-medium text-zinc-300">
                  {INTENT_LABELS[classification.intent] ?? classification.intent}
                </span>

                <span title="Classifier confidence">
                  conf {(classification.confidence * 100).toFixed(0)}%
                </span>
                <span title="How animated you sounded">
                  energy {(classification.energy * 100).toFixed(0)}%
                </span>

                <span
                  className={reacted ? "text-emerald-500" : "text-zinc-600"}
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

        {interim && (
          <article className="rounded-md border border-dashed border-zinc-700 px-2.5 py-2">
            <p className="text-[13px] leading-snug text-zinc-400 italic">
              {interim}
            </p>
          </article>
        )}

        <div ref={endRef} />
      </div>
    </section>
  );
}
