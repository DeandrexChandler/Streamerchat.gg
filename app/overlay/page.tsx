"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatList } from "@/app/components/chat/ChatList";
import type { ChatMessage, Emote } from "@/lib/engine/types";

/**
 * OBS browser source.
 *
 * Deliberately outside the (shell) route group: no navigation, no chrome, and
 * a transparent background by default so it composites over gameplay.
 *
 * Renders the exact same <ChatList> the simulator does, so what you tune on
 * the simulator page is what appears on stream.
 *
 * Messages arrive over SSE from /api/overlay/stream. BroadcastChannel, which
 * this used to listen on, cannot work here: OBS runs the browser source in its
 * own embedded CEF process with no channel back to the Chrome profile the
 * simulator is open in. The server is the only thing both processes can see.
 *
 * `EventSource` handles reconnection itself, including after OBS shuts the
 * source down on a scene switch, so there is no retry logic in this file.
 * Nothing is replayed on reconnect by design — chat resumes live rather than
 * dumping a minute of stale reactions onto the stream.
 */

/**
 * The pack arrives over the relay.
 *
 * OBS is a different browser from the one holding the streamer's imported
 * packs, so the simulator sends names and URLs down the same stream the
 * chat comes on. Until one arrives, emote names render as plain text —
 * which is what every line looked like before this existed.
 */
const NO_EMOTES: readonly Emote[] = [];

/** Lines the browser source keeps before the oldest scroll away. */
const OVERLAY_MAX_MESSAGES = 50;

function OverlayContent() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<readonly Emote[]>(NO_EMOTES);

  const key = params.get("key") ?? "";
  const fontSize = clampNumber(params.get("fontSize"), 14, 10, 48);
  // Fixed, not a setting: the browser source is a strip of chat that scrolls,
  // and how many lines it holds is a function of how tall the source is, not
  // something worth a number field. This is only here so the DOM cannot grow
  // without bound over a long stream.
  const maxMessages = OVERLAY_MAX_MESSAGES;
  const showTimestamps = params.get("timestamps") === "true";
  const background = params.get("bg") ?? "transparent";

  useEffect(() => {
    if (!key || typeof EventSource === "undefined") return;

    const source = new EventSource(
      `/api/overlay/stream?key=${encodeURIComponent(key)}`,
    );

    source.addEventListener("chat", (event) => {
      let incoming: ChatMessage[];
      try {
        incoming = (JSON.parse((event as MessageEvent<string>).data) as {
          messages?: ChatMessage[];
        }).messages ?? [];
      } catch {
        return;
      }
      if (incoming.length === 0) return;

      setMessages((previous) => {
        const next = [...previous, ...incoming];
        return next.length > maxMessages ? next.slice(-maxMessages) : next;
      });
    });

    source.addEventListener("emotes", (event) => {
      try {
        const incoming = (JSON.parse((event as MessageEvent<string>).data) as {
          emotes?: Array<{ name: string; url: string }>;
        }).emotes;
        if (!incoming) return;
        // Only what the renderer needs: it matches on name and draws the URL.
        setEmotes(
          incoming.map((emote) => ({
            id: emote.name,
            name: emote.name,
            url: emote.url,
            mood: "chill" as const,
          })),
        );
      } catch {
        // A malformed frame leaves the previous pack in place.
      }
    });

    source.addEventListener("clear", () => setMessages([]));

    return () => source.close();
  }, [key, maxMessages]);

  return (
    <div
      className="flex h-dvh w-full flex-col text-white"
      style={{
        background,
        // Heavy shadow rather than a panel: overlay text has to stay readable
        // over arbitrary gameplay footage.
        textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6)",
      }}
    >
      {key ? (
        <ChatList
          messages={messages}
          emotes={emotes}
          showTimestamps={showTimestamps}
          fontSize={fontSize}
        />
      ) : (
        /* Only rendered when the URL is wrong, which means it is only ever on
           screen when something needs fixing. A silent black rectangle would
           send the streamer to check their OBS settings instead. */
        <p className="m-3 rounded bg-red-950/80 px-3 py-2 text-sm">
          No overlay key in this URL. Copy the browser-source URL again from
          the OBS page.
        </p>
      )}
    </div>
  );
}

function clampNumber(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export default function OverlayPage() {
  // useSearchParams() needs a Suspense boundary or the route fails to
  // prerender and takes the whole build down with it.
  return (
    <Suspense fallback={null}>
      <OverlayContent />
    </Suspense>
  );
}
