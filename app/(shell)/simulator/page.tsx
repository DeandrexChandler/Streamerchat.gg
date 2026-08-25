"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ChatList } from "@/app/components/chat/ChatList";
import { DEFAULT_EMOTES } from "@/lib/data/emotes";
import { useSimulator } from "@/lib/react/use-simulator";
import { ControlPanel } from "./ControlPanel";
import { TranscriptPanel } from "./TranscriptPanel";

/**
 * The simulator.
 *
 * Three regions: chat, what the microphone heard, and live controls. Replaces
 * a single 1,087-line component that held nineteen pieces of state and sixteen
 * refs, and did microphone capture, transcription, message generation, and
 * rendering all in one file.
 */
function Simulator() {
  const params = useSearchParams();
  // ?demo=1 replays a scripted session with no microphone — useful for seeing
  // the whole thing work before dealing with permissions, and for showing
  // someone the app without asking them to talk.
  const simulator = useSimulator(params.get("demo") ? "mock" : "web-speech");
  const { status, messages, settings } = simulator;

  const live = status === "running";

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col bg-[#18181b]">
        <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <h1 className="text-sm font-semibold text-zinc-100">Stream chat</h1>
          <StatusPill status={status} />
        </header>

        {simulator.error && (
          <div className="flex items-start gap-2 border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
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
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-xs space-y-2 text-center">
                <p className="text-sm font-medium text-zinc-300">
                  {live ? "Waiting for you to say something" : "Chat is offline"}
                </p>
                <p className="text-xs leading-relaxed text-zinc-500">
                  {live
                    ? "Talk normally. Chat will react to what you say, and fill the silence when you stop."
                    : "Press Start to turn on your microphone and bring chat to life. Add ?demo=1 to the URL to watch a scripted session with no microphone."}
                </p>
              </div>
            </div>
          }
        />
      </section>

      <TranscriptPanel
        heard={simulator.heard}
        interim={simulator.interim}
        listening={live}
      />

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
  running: { dot: "bg-emerald-500", text: "text-emerald-400", label: "Live" },
  paused: { dot: "bg-amber-500", text: "text-amber-400", label: "Paused" },
  starting: { dot: "bg-sky-500", text: "text-sky-400", label: "Starting" },
  error: { dot: "bg-red-500", text: "text-red-400", label: "Error" },
  idle: { dot: "bg-zinc-600", text: "text-zinc-500", label: "Offline" },
} as const;

function StatusPill({ status }: { status: keyof typeof STATUS_STYLES }) {
  const style = STATUS_STYLES[status];
  const pulsing = status === "running" || status === "starting";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="relative flex h-2 w-2">
        {pulsing && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${style.dot}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
      </span>
      <span className={style.text}>{style.label}</span>
    </div>
  );
}
