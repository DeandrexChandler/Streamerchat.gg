"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ChatList } from "@/app/components/chat/ChatList";
import { DEFAULT_EMOTES } from "@/lib/data/emotes";
import { useSimulator } from "@/lib/react/use-simulator";
import { ControlPanel } from "./ControlPanel";

/**
 * The simulator.
 *
 * The chat is a fixed-width vertical column, not a fluid pane. That shape is
 * the point of the product — it's what a Twitch chat looks like, it's what
 * goes into OBS, and stretching it to fill the viewport makes it read as a
 * generic web app instead of a chat. Controls sit beside it in a panel rather
 * than being hidden in a dropdown over the chat.
 */
function Simulator() {
  const params = useSearchParams();
  // ?demo=1 replays a scripted session with no microphone — useful for seeing
  // the whole thing work before dealing with permissions.
  const simulator = useSimulator(params.get("demo") ? "mock" : "web-speech");
  const { status, messages, settings } = simulator;

  const live = status === "running";

  return (
    <div className="h-[calc(100%+3rem)] -my-6 flex justify-center gap-4 overflow-hidden py-6">
      {/* Chat column — deliberately a fixed 384px, never flex-1. */}
      <div className="flex h-full w-96 flex-col overflow-hidden rounded-lg border border-gray-300 bg-[#18181b] shadow-sm dark:border-gray-700">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-700 bg-[#1f1f23] p-3">
          <h2 className="text-sm font-semibold text-white">StreamerChat.gg</h2>
          <StatusPill status={status} />
        </header>

        {simulator.error && (
          <div className="flex flex-shrink-0 items-start gap-2 border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            <p>{simulator.error}</p>
          </div>
        )}

        {/* The same component the OBS overlay renders — what you tune here is
            literally what goes on stream. */}
        <ChatList
          messages={messages}
          emotes={DEFAULT_EMOTES}
          showTimestamps={settings.showTimestamps}
          empty={
            <div className="flex h-full items-start justify-center pt-16">
              <div className="max-w-xs space-y-3 px-4 text-center text-sm text-gray-400">
                <div className="text-lg">🎙️</div>
                <p className="font-semibold text-gray-300">
                  {live ? "Listening" : "Getting started"}
                </p>
                <p className="text-xs leading-relaxed text-gray-500">
                  {live
                    ? "Talk normally. Chat reacts to what you say, and fills the silence when you stop."
                    : "Press Start to turn on your microphone. Add ?demo=1 to the URL to watch a scripted session with no microphone."}
                </p>
              </div>
            </div>
          }
        />

        {/* Transcript sits inline above the input, as it did originally —
            a separate column for it was what made the layout feel wide. */}
        <div className="flex-shrink-0 border-t border-gray-700 bg-[#1f1f23] p-3">
          {live && (
            <p className="mb-2 truncate text-xs text-blue-400">
              {simulator.interim ||
                simulator.heard.at(-1)?.text ||
                "[listening…]"}
            </p>
          )}
          <input
            type="text"
            placeholder={live ? "Chat is live…" : "Press Start and begin speaking…"}
            className="w-full rounded bg-[#464649] px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled
          />
        </div>
      </div>

      <ControlPanel
        status={status}
        stats={simulator.stats}
        settings={settings}
        micLabel={simulator.micLabel}
        subscribeLevel={simulator.subscribeLevel}
        onStart={() => void simulator.start()}
        onStop={simulator.stop}
        onPause={simulator.pause}
        onResume={simulator.resume}
        onClear={simulator.clear}
        onChange={simulator.updateSettings}
      />
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
    <div className="flex itemseming-center gap-2 text-xs">
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
