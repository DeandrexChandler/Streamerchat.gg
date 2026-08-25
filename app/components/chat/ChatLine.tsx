"use client";

import { memo, useMemo } from "react";
import { segmentMessage } from "@/lib/data/emotes";
import type { ChatMessage, Emote } from "@/lib/engine/types";

/**
 * One chat line, Twitch-compact.
 *
 * Shared verbatim by the simulator and the OBS overlay so what you tune is
 * literally what goes on stream, and there is only one place for rendering
 * bugs to live.
 *
 * memo() matters here: at 50+ messages per minute with a 150-message buffer,
 * re-rendering every line on each new arrival is the difference between smooth
 * and visibly janky. Messages are immutable once emitted, so memo is always a
 * hit after the first render.
 */

export interface ChatLineProps {
  message: ChatMessage;
  /**
   * Prebuilt lookup, owned by the list.
   *
   * Built once by the parent rather than per line: with a 150-message buffer,
   * building it here meant 150 Map constructions on every mount pass for a
   * table that never changes.
   */
  emoteIndex: ReadonlyMap<string, Emote>;
  showTimestamp?: boolean;
  /** Base font size in px. Overlay users scale this for their canvas. */
  fontSize?: number;
}

function ChatLineImpl({
  message,
  emoteIndex,
  showTimestamp = false,
  fontSize = 14,
}: ChatLineProps) {
  const segments = useMemo(
    () => segmentMessage(message.text, emoteIndex),
    [message.text, emoteIndex],
  );

  return (
    <div
      className="chat-message-in px-2 py-[3px] leading-snug break-words"
      style={{ fontSize }}
    >
      {showTimestamp && (
        <span className="mr-1.5 text-[0.8em] tabular-nums opacity-45">
          {new Date(message.at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}

      <span className="font-bold" style={{ color: message.color }}>
        {message.username}
      </span>
      <span className="opacity-60">: </span>

      {segments.map((segment, i) =>
        segment.type === "emote" ? (
          <EmoteToken key={i} emote={segment.emote} fontSize={fontSize} />
        ) : (
          <span key={i} className="opacity-95">
            {i > 0 ? " " : ""}
            {segment.value}
          </span>
        ),
      )}
    </div>
  );
}

/**
 * Text-only emotes render as a styled token rather than plain text, so they
 * read as emotes rather than as shouting. Image emotes (7TV/BTTV import) take
 * the img path.
 */
function EmoteToken({ emote, fontSize }: { emote: Emote; fontSize: number }) {
  if (emote.url) {
    return (
      <>
        {" "}
        <img
          src={emote.url}
          alt={emote.name}
          title={emote.name}
          className="inline-block align-middle"
          style={{ height: fontSize * 2, width: "auto" }}
          loading="lazy"
        />
      </>
    );
  }

  return (
    <>
      {" "}
      <span
        title={emote.name}
        className="inline-block rounded-[3px] bg-white/10 px-1 font-semibold tracking-tight text-purple-200 align-baseline"
      >
        {emote.name}
      </span>
    </>
  );
}

export const ChatLine = memo(ChatLineImpl);
