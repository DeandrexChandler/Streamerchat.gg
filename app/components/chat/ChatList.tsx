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
  /**
   * Persistent header content, rendered above the first message.
   *
   * Not an empty state — it stays mounted and gets pushed up and off screen
   * as chat fills in, the way the original build behaved. Vanishing the
   * instant the first message lands is jarring and loses the instructions
   * before anyone has read them.
   */
  intro?: React.ReactNode;
  className?: string;
}

export function ChatList({
  messages,
  emotes,
  showTimestamps = false,
  fontSize = 14,
  intro,
  className = "",
}: ChatListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // One lookup for the whole list — see ChatLineProps.emoteIndex.
  const emoteIndex = useMemo(() => buildEmoteIndex(emotes), [emotes]);
  const [pinned, setPinned] = useState(true);
  const [missed, setMissed] = useState(0);

  /**
   * Id of the newest message we've already reacted to.
   *
   * Deliberately not `messages.length`. Once the buffer saturates, every tick
   * appends and trims by the same amount, so the length stops changing
   * entirely — an effect keyed on it silently stops firing and both
   * auto-scroll and the unread counter die. That happens precisely during
   * heavy spam, which is when they matter most.
   */
  const lastSeenId = useRef<string | null>(null);

  /**
   * What the reader is looking at while scrolled up, so trimming the top of
   * the buffer doesn't yank the content out from under them.
   */
  const anchor = useRef<{ id: string; offset: number } | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  /** Records the topmost visible message so we can restore the view later. */
  const captureAnchor = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    for (const node of el.querySelectorAll<HTMLElement>("[data-message-id]")) {
      if (node.offsetTop + node.offsetHeight > el.scrollTop) {
        anchor.current = {
          id: node.dataset.messageId!,
          offset: node.offsetTop - el.scrollTop,
        };
        return;
      }
    }
    anchor.current = null;
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance <= PIN_THRESHOLD;

    setPinned(atBottom);
    if (atBottom) {
      setMissed(0);
      anchor.current = null;
    } else {
      captureAnchor();
    }
  }, [captureAnchor]);

  // useLayoutEffect, not useEffect: scrolling must happen in the same frame
  // the new message paints, otherwise the list visibly jumps.
  useLayoutEffect(() => {
    const newestId = messages.at(-1)?.id ?? null;
    if (newestId === lastSeenId.current) return;

    const previousId = lastSeenId.current;
    lastSeenId.current = newestId;

    if (pinned) {
      scrollToBottom();
      return;
    }

    // Count what actually arrived. Several messages land per tick at high
    // speed, so incrementing by one badly undercounts. If the previously-seen
    // message has already been trimmed away, everything on screen is new.
    const previousIndex = previousId
      ? messages.findIndex((m) => m.id === previousId)
      : -1;
    const added =
      previousIndex >= 0 ? messages.length - 1 - previousIndex : messages.length;
    if (added > 0) setMissed((n) => n + added);

    // Trimming removes messages above the viewport, which shifts everything
    // up under the reader. Put their anchor back where it was.
    const el = containerRef.current;
    const held = anchor.current;
    if (el && held) {
      const node = el.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(held.id)}"]`,
      );
      if (node) el.scrollTop = node.offsetTop - held.offset;
    }
  });

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
    anchor.current = null;
    // Instant, not smooth: at high message rates a smooth scroll never
    // catches the bottom, because more content arrives while it animates.
    scrollToBottom(false);
  }, [scrollToBottom]);

  return (
    <div className={`relative min-h-0 flex-1 ${className}`}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {/* min-h-full + mt-auto on the messages keeps a short log pinned to
            the bottom, the way a real chat pane fills upward. The intro sits
            above it and scrolls away naturally once there's enough traffic. */}
        <div className="flex min-h-full flex-col py-1">
          {intro && <div className="flex-shrink-0">{intro}</div>}

          <div className="mt-auto">
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
        </div>
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
