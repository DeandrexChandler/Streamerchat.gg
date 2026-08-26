"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pause } from "lucide-react";
import { buildEmoteIndex } from "@/lib/data/emotes";
import type { ChatMessage, Emote } from "@/lib/engine/types";
import { ChatLine } from "./ChatLine";

/**
 * Scrolling chat log.
 *
 * The behaviour this replaces: the old build set `scrollTop = scrollHeight` on
 * every new message unconditionally, so scrolling up to read something yanked
 * you back to the bottom within a second or two. At 50 messages a minute it
 * was impossible to read back at all.
 *
 * Instead we track whether the user is *pinned* to the bottom. Auto-scroll
 * only happens while pinned; scrolling up detaches, and a jump-to-live control
 * appears with a count of what was missed.
 */

/** Distance from the bottom still treated as "at the bottom", in px. */
const PIN_THRESHOLD = 48;

export interface ChatListProps {
  messages: readonly ChatMessage[];
  emotes: readonly Emote[];
  showTimestamps?: boolean;
  fontSize?: number;
  /** Rendered when there are no messages yet. */
  empty?: React.ReactNode;
  className?: string;
}

export function ChatList({
  messages,
  emotes,
  showTimestamps = false,
  fontSize = 14,
  empty,
  className = "",
}: ChatListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // One lookup for the whole list — see ChatLineProps.emoteIndex.
  const emoteIndex = useMemo(() => buildEmoteIndex(emotes), [emotes]);
  const [pinned, setPinned] = useState(true);
  const [missed, setMissed] = useState(0);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance <= PIN_THRESHOLD;

    setPinned(atBottom);
    if (atBottom) setMissed(0);
  }, []);

  // useLayoutEffect, not useEffect: scrolling must happen in the same frame
  // the new message paints, otherwise the list visibly jumps.
  useLayoutEffect(() => {
    if (pinned) {
      scrollToBottom();
    } else {
      setMissed((n) => n + 1);
    }
    // Intentionally keyed on length only — messages are immutable, and
    // depending on the array identity would re-run on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // A resized window (or an OBS source resize) changes what "at the bottom"
  // means; re-pin so the view doesn't silently detach.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (pinned) scrollToBottom();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pinned, scrollToBottom]);

  const jumpToLive = useCallback(() => {
    setPinned(true);
    setMissed(0);
    scrollToBottom(true);
  }, [scrollToBottom]);

  return (
    <div className={`relative min-h-0 flex-1 ${className}`}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {messages.length === 0 && empty ? (
          empty
        ) : (
          // mt-auto in a flex column keeps a short log pinned to the bottom,
          // the way a real chat pane fills upward rather than downward.
          <div className="flex min-h-full flex-col justify-end py-1">
            {messages.map((message) => (
              <ChatLine
                key={message.id}
                message={message}
                emoteIndex={emoteIndex}
                showTimestamp={showTimestamps}
                fontSize={fontSize}
              />
            ))}
          </div>
        )}
      </div>

      {/* Twitch's scroll-paused indicator: a compact dark pill centred at the
          bottom, with the pause glyph in its own segment. Deliberately hugs
          its content — a full-width bar covers the chat and reads as an alert
          rather than as a status. */}
      {!pinned && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <button
            type="button"
            onClick={jumpToLive}
            className="pointer-events-auto flex items-center gap-2 rounded-[4px] bg-[#2f2f35] py-1 pr-3 pl-2 text-[13px] font-semibold text-white shadow-lg transition-colors hover:bg-[#3a3a42]"
          >
            <Pause size={13} fill="currentColor" strokeWidth={0} />
            <span className="whitespace-nowrap">
              {missed > 0
                ? `${missed} new message${missed === 1 ? "" : "s"}`
                : "Chat paused"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
