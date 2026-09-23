"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Shown when chat has no emotes at all. Nothing is imported by default, so a
 * fresh install sees this until a pack is added; dismissing it means the
 * streamer wants chat as plain text.
 */
const DISMISS_KEY = "streamerchat-gg:emote-banner-dismissed:v1";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Private mode or blocked storage — show it, it is dismissible either way.
    return false;
  }
}

export function EmoteBanner({ emoteCount }: { emoteCount: number }) {
  // Starts dismissed and is corrected after mount. localStorage cannot be read
  // during render, and defaulting to visible would flash the banner on every
  // load before hydration can hide it again.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Same trade as useStoredSettings: client-only storage cannot be read
    // during render without desyncing server and client markup, so one extra
    // mount render is deliberate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
  }, []);

  if (emoteCount > 0 || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Non-fatal — it reappears next load.
    }
  };

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
      <span>
        Chat has no emotes yet.{" "}
        <Link
          href="/settings/emotes"
          className="underline underline-offset-2 hover:text-amber-100"
        >
          Import a pack
        </Link>
        .
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto shrink-0 text-amber-200/70 transition-colors hover:text-amber-200"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
