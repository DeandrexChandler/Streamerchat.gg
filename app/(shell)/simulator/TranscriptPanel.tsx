"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** The word that points chat at the screen. Matched the way the engine does. */
const SCREEN_WORD = /\b(screen)\b/i;

export function TranscriptPanel({
  heard,
  interim,
  listening,
}: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  /**
   * A once-a-second clock, only while something is counting down.
   *
   * The hot word costs a call with a screenshot attached, so it is rate
   * limited — and a limit the streamer cannot see is indistinguishable from
   * the feature being broken. One re-render a second is nothing; this is a
   * text panel, not the chat itself. The clock is state rather than
   * Date.now() in render, which would be impure and drift between renders.
   */
  const [now, setNow] = useState(0);
  // Runs while any cooldown is still ahead of the clock, and stops itself
  // once they have all passed — a panel ticking forever after one use is
  // a background render loop nobody asked for.
  const waiting = heard.some((entry) => {
    const ready = readyAt(entry);
    return ready !== null && (now === 0 || ready > now);
  });

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [waiting]);

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
              {withHotWord(entry)}
            </p>

            <ScreenNote entry={entry} now={now} />

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
        Ignored when messages appear too bland. Repeated and Typed messages are never ignored. 
      </footer>
    </aside>
  );
}

/**
 * The hot word, coloured by what it actually did.
 *
 * Blue is "chat is looking at this now". Anything else is grey: the word
 * was heard and did nothing, which the streamer needs to see at a glance
 * rather than infer from chat not reacting.
 */
function withHotWord(entry: HeardUtterance) {
  const screen = entry.outcome.screen;
  if (!screen) return entry.text;

  const parts = entry.text.split(SCREEN_WORD);
  return parts.map((part, index) =>
    SCREEN_WORD.test(part) && part.toLowerCase() === "screen" ? (
      <strong
        key={index}
        className={
          screen.state === "fired"
            ? "font-semibold text-blue-600 dark:text-blue-400"
            : "font-semibold text-gray-500 dark:text-gray-400"
        }
      >
        {part}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/** When the hot word may be used again, or null if it is not waiting. */
function readyAt(entry: HeardUtterance): number | null {
  const screen = entry.outcome.screen;
  if (!screen?.readyInMs) return null;
  return entry.at + screen.readyInMs;
}

/** The small line under an utterance that contained the hot word. */
function ScreenNote({ entry, now }: { entry: HeardUtterance; now: number }) {
  const screen = entry.outcome.screen;
  if (!screen) return null;

  if (screen.state === "off") {
    return (
      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
        screen capture is off — turn on Watch my screen
      </p>
    );
  }

  const ready = readyAt(entry);
  // Before the clock's first tick, show the full cooldown rather than zero.
  const left =
    ready === null
      ? 0
      : now === 0
        ? Math.ceil((screen.readyInMs ?? 0) / 1000)
        : Math.max(0, Math.ceil((ready - now) / 1000));

  if (screen.state === "fired") {
    return (
      <p className="mt-0.5 text-[10px] text-blue-600/80 dark:text-blue-400/80">
        chat is looking{left > 0 ? ` — ready again in ${left}s` : " — ready again"}
      </p>
    );
  }

  return (
    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
      {left > 0 ? `too soon — ready in ${left}s` : "ready now"}
    </p>
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
