"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatList } from "@/app/components/chat/ChatList";
import { DEFAULT_EMOTES } from "@/lib/data/emotes";
import type { ChatMessage } from "@/lib/engine/types";

/**
 * OBS browser source.
 *
 * Deliberately outside the (shell) route group: no navigation, no chrome, and
 * a transparent background by default so it composites over gameplay.
 *
 * Renders the exact same <ChatList> the simulator does, so what you tune on
 * the simulator page is what appears on stream.
 *
 * TRANSPORT IS NOT WIRED YET. BroadcastChannel cannot reach OBS — the browser
 * source runs in its own embedded CEF process, entirely separate from the
 * Chrome profile the simulator is open in, so the two share no channel. This
 * still listens on it, which works for a same-browser preview tab and nothing
 * else. Phase 6 replaces it with a server-side session channel over SSE.
 */

const CHANNEL = "streamerchat-gg:overlay";

function OverlayContent() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const fontSize = clampNumber(params.get("fontSize"), 14, 10, 48);
  const maxMessages = clampNumber(params.get("max"), 50, 5, 300);
  const showTimestamps = params.get("timestamps") === "true";
  const background = params.get("bg") ?? "transparent";

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<{ type?: string; message?: ChatMessage }>) => {
      if (event.data?.type !== "chat" || !event.data.message) return;
      const message = event.data.message;
      setMessages((previous) => {
        const next = [...previous, message];
        return next.length > maxMessages ? next.slice(-maxMessages) : next;
      });
    };

    return () => channel.close();
  }, [maxMessages]);

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
      <ChatList
        messages={messages}
        emotes={DEFAULT_EMOTES}
        showTimestamps={showTimestamps}
        fontSize={fontSize}
      />
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
