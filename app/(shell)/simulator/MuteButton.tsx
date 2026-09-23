"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

/**
 * The mic, as a button beside the level meter.
 *
 * Live, its ring swells with your voice, so it doubles as proof the mic is
 * hearing you. Muted, it goes red with a struck-through mic. The level is
 * written straight to a CSS variable, same as MicMeter: it arrives at frame
 * rate and must never enter React state.
 */
export function MuteButton({
  muted,
  live,
  onChange,
  subscribe,
}: {
  muted: boolean;
  /** Chat is running. The ring only moves when it is and the mic is on. */
  live: boolean;
  onChange: (muted: boolean) => void;
  subscribe: (handler: (level: number) => void) => () => void;
}) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const hearing = live && !muted;

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    if (!hearing) {
      ring.style.setProperty("--level", "0");
      return;
    }
    return subscribe((level) => {
      ring.style.setProperty("--level", Math.min(1, level * 1.6).toFixed(2));
    });
  }, [subscribe, hearing]);

  const label = muted ? "Unmute microphone" : "Mute microphone";

  return (
    <button
      type="button"
      onClick={() => onChange(!muted)}
      aria-label={label}
      aria-pressed={muted}
      title={muted ? "Mic muted — chat still hears what you type. Click to unmute." : "Mute the mic without stopping chat"}
      className={`relative flex size-7 shrink-0 items-center justify-center rounded-full transition-colors focus:ring-2 focus:ring-purple-500 focus:outline-none ${
        muted
          ? "bg-red-500/15 text-red-500 hover:bg-red-500/25 dark:text-red-400"
          : hearing
            ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-300"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
      }`}
    >
      <span
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-emerald-400/70 transition-[transform,opacity] duration-75 ease-out motion-reduce:hidden"
        style={{
          opacity: "var(--level, 0)",
          transform: "scale(calc(1 + var(--level, 0) * 0.35))",
        }}
      />
      {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
    </button>
  );
}
