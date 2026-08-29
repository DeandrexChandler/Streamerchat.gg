"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { ChatList } from "@/app/components/chat/ChatList";
import { useSimulator } from "@/lib/react/use-simulator";
import { ControlPanel } from "./ControlPanel";
import { TranscriptPanel } from "./TranscriptPanel";

/**
 * The simulator.
 *
 * Three columns: settings, chat, transcription.
 *
 * The chat is a fixed-width vertical column and must stay one. That shape is
 * the product — it is what a Twitch chat looks like, it is what goes into OBS,
 * and stretching it to fill the viewport makes it read as a generic web app
 * rather than as a chat. Do not change `w-96` to `flex-1`.
 */
function Simulator() {
  const params = useSearchParams();
  // ?demo=1 replays a scripted session with no microphone.
  const simulator = useSimulator(params.get("demo") ? "mock" : "web-speech");
  const { status, messages, settings } = simulator;

  const live = status === "running";
  const started = live || status === "paused";

  const [chatOnly, setChatOnly] = useState(false);

  /**
   * The browser's own fullscreen state is the source of truth.
   *
   * Esc and F11 both exit without going through our button, and a stale flag
   * would leave the layout collapsed with no visible way back.
   */
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setChatOnly(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Hiding the shell's sidebar means reaching outside this component, so it
  // goes through a body class rather than drilling a prop up through layout.
  useEffect(() => {
    document.body.classList.toggle("chat-only", chatOnly);
    return () => document.body.classList.remove("chat-only");
  }, [chatOnly]);

  const toggleChatOnly = useCallback(async () => {
    if (chatOnly) {
      setChatOnly(false);
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      return;
    }
    setChatOnly(true);
    // Fullscreen can be refused by permissions policy. The collapsed layout is
    // useful on its own, so a refusal is not an error worth surfacing.
    await document.documentElement.requestFullscreen().catch(() => {});
  }, [chatOnly]);

  return (
    <div className="-my-6 flex h-[calc(100%+3rem)] justify-center gap-4 overflow-hidden py-6">
      <div data-panel="controls" className="contents">
      <ControlPanel
        status={status}
        stats={simulator.stats}
        settings={settings}
        micLabel={simulator.micLabel}
        emoteCount={simulator.emotes.length}
        subscribeLevel={simulator.subscribeLevel}
        onClear={simulator.clear}
        onChange={simulator.updateSettings}
      />
      </div>

      {/* Chat column — deliberately a fixed 384px, never flex-1. */}
      <div className="flex h-full w-96 flex-col overflow-hidden rounded-lg border border-gray-300 bg-[#18181b] shadow-sm dark:border-gray-700">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-700 bg-[#1f1f23] p-3">
          <h2 className="text-sm font-semibold text-white">StreamerChat.gg</h2>
          <StatusPill status={status} />
          <button
            onClick={() => void toggleChatOnly()}
            aria-label={chatOnly ? "Exit fullscreen chat" : "Fullscreen chat"}
            title={chatOnly ? "Exit fullscreen (Esc)" : "Fullscreen chat"}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {chatOnly ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </button>
        </header>

        {simulator.error && (
          <div className="flex flex-shrink-0 items-start gap-2 border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <p>{simulator.error}</p>
          </div>
        )}

        {/* The same component the OBS overlay renders. */}
        <ChatList
          messages={messages}
          emotes={simulator.emotes}
          showTimestamps={settings.showTimestamps}
          intro={
            <div className="flex items-start justify-center pt-16 pb-10">
              <div className="max-w-xs space-y-3 px-4 text-center text-sm text-gray-400">
                <div className="text-lg">🎙️</div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-300">Getting Started</p>
                  <p>1. Connect your microphone</p>
                  <p>2. Press play to begin</p>
                  <p>3. Speak and watch messages appear</p>
                </div>
                <p className="text-xs text-gray-500">
                  Enable Idle chatter in settings for automatic chat simulation
                </p>
              </div>
            </div>
          }
        />

        {/* Input row. The Play control sits where a real chat's send button
            does — the original layout, and the one place a streamer's hand
            already expects to go. */}
        <div className="flex-shrink-0 border-t border-gray-700 bg-[#1f1f23] p-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Press Play and start speaking..."
              className="min-w-0 flex-1 rounded bg-[#464649] px-3 py-2 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              disabled
            />
            <button
              type="button"
              onClick={() => {
                if (!started) void simulator.start();
                else if (live) simulator.pause();
                else simulator.resume();
              }}
              disabled={status === "starting"}
              className={`min-w-[100px] rounded border-2 px-4 py-2 text-sm transition-colors disabled:opacity-60 ${
                !started
                  ? "border-purple-500 bg-purple-500 text-white hover:bg-purple-600"
                  : live
                    ? "border-green-500 bg-green-500 text-white hover:bg-green-600"
                    : "border-orange-500 bg-transparent text-orange-500 hover:bg-orange-500/10"
              }`}
            >
              {status === "starting" ? (
                "Starting"
              ) : !started ? (
                "Play"
              ) : live ? (
                <span className="flex items-center justify-center gap-1">
                  Playing
                  <span className="dot-wave inline-flex gap-0.5">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </span>
              ) : (
                "Paused"
              )}
            </button>
          </div>
        </div>
      </div>

      <div data-panel="transcript" className="contents">
        <TranscriptPanel
          heard={simulator.heard}
          interim={simulator.interim}
          listening={live}
        />
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={null}>
      <Simulator />
    </Suspense>
  );
}

const STATUS_STYLES = {
  running: { dot: "bg-green-500", text: "text-green-400", label: "Connected" },
  paused: { dot: "bg-orange-500", text: "text-orange-400", label: "Paused" },
  starting: { dot: "bg-blue-500", text: "text-blue-400", label: "Starting" },
  error: { dot: "bg-red-500", text: "text-red-400", label: "Disconnected" },
  idle: { dot: "bg-orange-500", text: "text-orange-400", label: "Paused" },
} as const;

function StatusPill({ status }: { status: keyof typeof STATUS_STYLES }) {
  const style = STATUS_STYLES[status];
  const pulsing = status === "running" || status === "starting";

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="inline-grid *:[grid-area:1/1]">
        {pulsing && (
          <div className={`h-2 w-2 animate-ping rounded-full ${style.dot}`} />
        )}
        <div className={`h-2 w-2 rounded-full ${style.dot}`} />
      </div>
      <span className={style.text}>{style.label}</span>
    </div>
  );
}
