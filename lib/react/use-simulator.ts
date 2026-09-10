"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicSession } from "../audio/mic-session";
import { DEFAULT_SETTINGS, localSettingsStore } from "../config/settings";
import type { SimulationSettings } from "../config/settings";
import {
  hasAutoImported,
  localEmotePackStore,
  markAutoImported,
  mergeEmotes,
} from "../config/emote-store";
import type { EmotePack } from "../emotes/seventv";
import type { Reaction } from "../ai/reaction";
import type { Emote } from "../engine/types";
import {
  SimulationEngine,
  type EngineStats,
  type TranscriptOutcome,
} from "../engine/engine";
import type { ChatMessage } from "../engine/types";
import { loadOverlayKey } from "../config/overlay-key";
import { OverlayTransport } from "../overlay/transport";
import { createProvider } from "../transcription";
import type { TranscriptionProvider } from "../transcription/provider";

/**
 * Binds the audio pipeline, the transcription provider and the simulation
 * engine to React.
 *
 * The rule this hook exists to enforce: **the microphone level never enters
 * React state.** It arrives at animation-frame rate, and putting it in state
 * re-renders the whole chat view ~60 times a second. Consumers subscribe via
 * `subscribeLevel` and write straight to a DOM node instead.
 *
 * Everything stateful lives in refs and is created once, so a re-render never
 * tears down the microphone.
 */

export type SimulatorStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "error";

/** How often the engine is advanced. Chat does not need frame-rate updates. */
const TICK_MS = 200;

/**
 * Hard ceiling on rendered messages, whatever the buffer setting works out to.
 *
 * Every message is a DOM node, and at the top speed setting the list turns
 * over fast enough that an unbounded buffer would keep growing the tree for
 * history nobody scrolls back to.
 */
const MAX_RENDERED_MESSAGES = 500;

/** Where an utterance came from. Never inferred from the text itself. */
export type TranscriptSource = "microphone" | "typed";

/** One thing the streamer said, and what the engine made of it. */
export interface HeardUtterance {
  id: string;
  text: string;
  at: number;
  source: TranscriptSource;
  /**
   * Whether the engine accepted it for response generation.
   *
   * Typed input is always heard — the streamer chose to send it, so the
   * attention gate has no business second-guessing that.
   */
  heard: boolean;
  outcome: TranscriptOutcome;
}

export interface UseSimulatorResult {
  status: SimulatorStatus;
  messages: ChatMessage[];
  /** In-progress speech, for display only. Never fed to the engine. */
  interim: string;
  /** Recent utterances with their classification. Newest last. */
  heard: HeardUtterance[];
  error: string | null;
  micLabel: string;
  stats: EngineStats;
  settings: SimulationSettings;

  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void | Promise<void>;
  clear: () => void;
  updateSettings: (patch: Partial<SimulationSettings>) => void;

  /** Built-in emotes plus every imported pack. Feed this to the renderer. */
  emotes: Emote[];

  /** Subscribe to mic level (0..1). Returns an unsubscribe function. */
  subscribeLevel: (handler: (level: number) => void) => () => void;

  /** OBS browser sources currently receiving this session's chat. */
  overlaySubscribers: number;

  /** Feed a line in as though it had been spoken. Same path as speech. */
  say: (text: string) => void;
}

export function useSimulator(): UseSimulatorResult {
  const [status, setStatus] = useState<SimulatorStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState<HeardUtterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micLabel, setMicLabel] = useState("");
  const [stats, setStats] = useState<EngineStats>({
    audience: 0,
    simulated: 0,
    pending: 0,
    released: 0,
    ignored: 0,
    bySource: {},
    phase: "startup",
    queued: 0,
    slotsWaited: 0,
    linesDropped: 0,
  });
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);
  const [emotes, setEmotes] = useState<Emote[]>(() => []);
  const [overlaySubscribers, setOverlaySubscribers] = useState(0);

  const engineRef = useRef<SimulationEngine | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const providerRef = useRef<TranscriptionProvider | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef<SimulationSettings>(DEFAULT_SETTINGS);
  const emotesRef = useRef<Emote[]>([]);
  const pausedRef = useRef(false);
  const overlayRef = useRef<OverlayTransport | null>(null);
  /** A generation request is on the wire. One at a time, always. */
  const inFlightRef = useRef(false);

  /** Level subscribers, kept outside React entirely. */
  const levelSubscribers = useRef(new Set<(level: number) => void>());

  // Settings and emote packs are read from localStorage after mount, not
  // during render, so server and client markup agree.
  useEffect(() => {
    const loaded = localSettingsStore.load();
    settingsRef.current = loaded;
    setSettings(loaded);
    engineRef.current?.updateSettings(loaded);

    const packs = localEmotePackStore.load();
    const merged = mergeEmotes(packs);
    emotesRef.current = merged;
    setEmotes(merged);
    engineRef.current?.setEmotes(merged);

    // First run: pull a real emote vocabulary so chat is not text-only out of
    // the box. Once, and never again after the user deletes it.
    if (packs.length === 0 && !hasAutoImported()) {
      void (async () => {
        try {
          const res = await fetch("/api/emotes?popular=150", { cache: "no-store" });
          if (!res.ok) return;
          const pack = (await res.json()) as EmotePack;
          if (!pack?.emotes?.length) return;

          markAutoImported();
          localEmotePackStore.save([pack]);
          const withPack = mergeEmotes([pack]);
          emotesRef.current = withPack;
          setEmotes(withPack);
          engineRef.current?.setEmotes(withPack);
        } catch {
          // Offline or 7TV down. Chat runs emote-free and the banner offers a
          // retry; nothing here may block the simulator from starting.
        }
      })();
    }

    // The OBS relay is created here rather than on start(), because the key
    // comes from localStorage and this is the first point at which it can be
    // read without desyncing server and client markup.
    overlayRef.current = new OverlayTransport({ key: loadOverlayKey() });
  }, []);

  const subscribeLevel = useCallback((handler: (level: number) => void) => {
    levelSubscribers.current.add(handler);
    return () => {
      levelSubscribers.current.delete(handler);
    };
  }, []);

  const ensureEngine = useCallback((): SimulationEngine => {
    if (!engineRef.current) {
      engineRef.current = new SimulationEngine({
        settings: settingsRef.current,
        emotes: emotesRef.current,
      });
    }
    return engineRef.current;
  }, []);

  /**
   * Keeps the AI queue topped up.
   *
   * Called every tick. The engine decides whether a batch is needed and what
   * it should be about — startup, a reaction, a continuation, an idle stage —
   * and this only carries the request. One request at a time; the engine
   * hands out nothing while one is unresolved.
   *
   * Failure is silent here on purpose. The route already logged the cause
   * server-side, where someone can act on it; the streamer is live and cannot.
   * The engine backs off briefly and asks again on its own.
   */
  const pump = useCallback(async (engine: SimulationEngine, now: number) => {
    if (inFlightRef.current) return;
    const request = engine.nextGeneration(now);
    if (!request) return;

    inFlightRef.current = true;
    try {
      const response = await fetch("/api/chat-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as { reactions?: Reaction[]; status?: string };

      if (!response.ok || body.status !== "ok" || !body.reactions?.length) {
        engine.generationFailed(Date.now());
        return;
      }
      engine.supplyReactions(body.reactions, Date.now());
    } catch {
      engine.generationFailed(Date.now());
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const startTicking = useCallback(() => {
    if (tickRef.current !== null) return;

    tickRef.current = setInterval(() => {
      const engine = engineRef.current;
      if (!engine || pausedRef.current) return;

      const now = Date.now();
      const released = engine.tick(now);
      void pump(engine, now);

      // The scheduler is the only source of released messages, so this is the
      // one place the overlay is fed — nothing else can reach OBS.
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.push(released);
        overlay.flush(now);
        setOverlaySubscribers(overlay.subscribers);
      }

      if (released.length > 0) {
        /**
         * The buffer is sized in messages but read as time.
         *
         * A flat 150 is a couple of minutes of history at the default speed
         * and about twenty seconds at the top one, so turning chat speed up
         * made messages vanish almost as fast as they arrived. Scaling by the
         * square root keeps roughly comparable history without letting the
         * node count grow linearly with speed.
         */
        const { messageBufferSize, messagesPerSecond } = settingsRef.current;
        const cap = Math.min(
          MAX_RENDERED_MESSAGES,
          Math.round(messageBufferSize * Math.sqrt(Math.max(1, messagesPerSecond * 2))),
        );
        setMessages((previous) => {
          const next = [...previous, ...released];
          return next.length > cap ? next.slice(-cap) : next;
        });
      }

      setStats(engine.stats());
    }, TICK_MS);
  }, [pump]);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  /**
   * Accepts a line as though the streamer had spoken it.
   *
   * The same entry point speech uses, deliberately: a typed message that took
   * a different path would test a different product.
   */
  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const engine = ensureEngine();
      const at = Date.now();
      const outcome = engine.handleTranscript(trimmed, at, undefined, true);
      if (!outcome) return;

      setHeard((previous) => {
        const next = [
          ...previous,
          {
            id: `${at}-typed-${trimmed.length}`,
            text: trimmed,
            at,
            source: "typed" as const,
            // Always. The streamer deliberately sent this.
            heard: true,
            outcome,
          },
        ];
        return next.length > 30 ? next.slice(-30) : next;
      });
      startTicking();
      /**
       * Typing is an unambiguous intent to start.
       *
       * The pill means "the simulation is running", which is now true. The
       * microphone is untouched — micLabel stays empty and the meter stays
       * flat — so the two states remain distinguishable at a glance, and this
       * is the only way to use the product without granting mic permission.
       */
      setStatus((current) => (current === "running" ? current : "running"));
      void pump(engine, at);
    },
    [ensureEngine, startTicking, pump],
  );

  const start = useCallback(async () => {
    if (status === "running" || status === "starting") return;

    setStatus("starting");
    setError(null);

    const engine = ensureEngine();
    engine.beginSession(Date.now());

    // Mic capture and speech recognition are independent: recognition opens
    // its own capture internally, while MicSession exists for the level
    // meter and the loudness signal the classifier uses.
    const mic = new MicSession();
    micRef.current = mic;

    mic.events.on("level", (level) => {
      for (const handler of levelSubscribers.current) handler(level);
    });
    mic.events.on("error", ({ message }) => {
      setError(message);
      setStatus("error");
    });

    const micOk = await mic.start();
    if (!micOk) return;
    setMicLabel(mic.label);

    const provider = createProvider();
    providerRef.current = provider;

    if (!provider) {
      // No recognition in this browser. The session still runs — arrival,
      // idle and typed input all work — it just cannot hear you.
      setError(
        "Speech recognition isn't available in this browser, so the microphone won't transcribe. Typed input still works. Chrome or Edge can hear you.",
      );
      pausedRef.current = false;
      startTicking();
      setStatus("running");
      return;
    }

    provider.events.on("final", ({ text }) => {
      setInterim("");
      // Loudness at the moment of speech sharpens the classifier: the same
      // words shouted and muttered should not produce the same reaction.
      const energy = micRef.current?.recentEnergy() ?? undefined;
      const at = Date.now();
      const outcome = engineRef.current?.handleTranscript(text, at, energy);
      if (!outcome) return;

      setHeard((previous) => {
        const next = [
          ...previous,
          {
            id: `${at}-mic-${text.length}`,
            text,
            at,
            source: "microphone" as const,
            heard: outcome.reacted,
            outcome,
          },
        ];
        return next.length > 30 ? next.slice(-30) : next;
      });

      // Accepted input invalidates the queue; the pump refills on the next tick.
      if (outcome.reacted) void pump(engineRef.current!, at);
    });

    provider.events.on("interim", ({ text }) => setInterim(text));

    provider.events.on("error", ({ message, fatal }) => {
      setError(message);
      if (fatal) setStatus("error");
    });

    await provider.start();

    pausedRef.current = false;
    startTicking();
    setStatus("running");
  }, [status, ensureEngine, startTicking, pump]);

  const stop = useCallback(() => {
    stopTicking();
    providerRef.current?.stop();
    providerRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    engineRef.current?.flush();
    pausedRef.current = false;
    setInterim("");
    setStatus("idle");
  }, [stopTicking]);

  /**
   * Pausing releases the microphone entirely, not just the recogniser.
   *
   * Keeping the MediaStream open left the browser's recording indicator lit
   * while the UI said "Paused". Whatever the code is actually doing, a user
   * seeing that has every reason to think they're still being recorded — so
   * pause tears the capture down and resume asks for it again.
   */
  const pause = useCallback(() => {
    if (status !== "running") return;
    pausedRef.current = true;

    providerRef.current?.stop();
    micRef.current?.stop();
    micRef.current = null;

    engineRef.current?.pause();
    setInterim("");
    setMicLabel("");
    setStatus("paused");
  }, [status]);

  const resume = useCallback(async () => {
    if (status !== "paused") return;

    const mic = new MicSession();
    micRef.current = mic;
    mic.events.on("level", (level) => {
      for (const handler of levelSubscribers.current) handler(level);
    });
    mic.events.on("error", ({ message }) => {
      setError(message);
      setStatus("error");
    });

    // Permission is already granted at this point, so this does not
    // re-prompt — it just reopens the stream.
    if (!(await mic.start())) return;
    setMicLabel(mic.label);

    pausedRef.current = false;
    engineRef.current?.resume(Date.now());
    void providerRef.current?.start();
    setStatus("running");
  }, [status]);

  /**
   * Wipes the session and returns to the idle state.
   *
   * This absorbs what used to be a separate Stop button. A Stop control next
   * to Play/Pause is two ways of saying "not running"; folding it into Clear
   * leaves exactly one way to start over, and keeps the microphone from
   * staying live after you have cleared everything.
   */
  const clear = useCallback(() => {
    stopTicking();
    providerRef.current?.stop();
    providerRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    engineRef.current?.flush();
    engineRef.current = null;
    inFlightRef.current = false;
    pausedRef.current = false;

    // Wipe the browser source as well. Leaving the last few messages frozen on
    // stream after the streamer has cleared their own view is the kind of
    // mismatch you only notice on the VOD.
    overlayRef.current?.clear();
    overlayRef.current?.flush(Date.now());

    setMessages([]);
    setHeard([]);
    setInterim("");
    setError(null);
    setMicLabel("");
    setStatus("idle");
  }, [stopTicking]);

  const updateSettings = useCallback((patch: Partial<SimulationSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    engineRef.current?.updateSettings(next);
    localSettingsStore.save(next);
  }, []);

  // Teardown on unmount. Without this the microphone stays live after
  // navigating away and the browser keeps showing the recording indicator.
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) clearInterval(tickRef.current);
      providerRef.current?.stop();
      micRef.current?.stop();
    };
  }, []);

  return {
    status,
    messages,
    interim,
    heard,
    error,
    micLabel,
    stats,
    settings,
    emotes,
    start,
    stop,
    pause,
    resume,
    clear,
    updateSettings,
    subscribeLevel,
    overlaySubscribers,
    say,
  };
}
