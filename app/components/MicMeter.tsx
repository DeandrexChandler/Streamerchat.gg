"use client";

import { useEffect, useRef } from "react";

/**
 * Microphone level meter.
 *
 * The whole point of this component is what it does *not* do: the level
 * arrives ~60 times a second, and it never enters React state. It is written
 * straight to a CSS custom property on a DOM node, so the meter animates
 * without re-rendering a single React component.
 *
 * The previous build put this value in useState and re-rendered a 1,000-line
 * component on every animation frame.
 */

export interface MicMeterProps {
  /** From useSimulator(). Returns an unsubscribe function. */
  subscribe: (handler: (level: number) => void) => () => void;
  active: boolean;
  /** Off by choice, not broken: said in the heading rather than a new line. */
  muted?: boolean;
}

export function MicMeter({ subscribe, active, muted = false }: MicMeterProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLSpanElement>(null);
  const lastPainted = useRef(-1);

  useEffect(() => {
    const unsubscribe = subscribe((level) => {
      const fill = fillRef.current;
      if (!fill) return;

      // Skip sub-percent changes: writing an identical style string every
      // frame is wasted layout work for a bar nobody can see move.
      const percent = Math.round(level * 100);
      if (percent === lastPainted.current) return;
      lastPainted.current = percent;

      fill.style.setProperty("--level", `${percent}%`);
      if (peakRef.current) peakRef.current.textContent = `${percent}%`;
    });

    return unsubscribe;
  }, [subscribe]);

  // Reset to empty when capture stops, so the bar doesn't freeze mid-level.
  useEffect(() => {
    if (!active && fillRef.current) {
      fillRef.current.style.setProperty("--level", "0%");
      lastPainted.current = -1;
      if (peakRef.current) peakRef.current.textContent = "0%";
    }
  }, [active]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate whitespace-nowrap text-gray-500 dark:text-gray-400">
          Microphone{muted && <span className="text-red-500 dark:text-red-400"> (Muted)</span>}
        </span>
        <span ref={peakRef} className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
          0%
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          ref={fillRef}
          className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-75 ease-out"
          style={{ width: "var(--level, 0%)" }}
        />
      </div>
    </div>
  );
}
