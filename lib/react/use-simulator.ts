"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicSession } from "../audio/mic-session";
import { DEFAULT_SETTINGS, localSettingsStore } from "../config/settings";
import type { SimulationSettings } from "../config/settings";
import { localEmotePackStore, mergeEmotes } from "../config/emote-store";
import { DEFAULT_EMOTES } from "../data/emotes";
import type { Emote } from "../engine/types";
import {
  SimulationEngine,
  type EngineStats,
  type TranscriptOutcome,
} from "../engine/engine";
import type { ChatMessage } from "../engine/types";
import { createProvider, type ProviderId } from "../transcription";
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

/** One thing the streamer said, and what the engine made of it. */
export interface HeardUtterance {
  id: string;
  text: string;
  at: number;
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
}

export function useSimulator(
  providerId: ProviderId = "web-speech",
): UseSimulatorResult {
  // Demo mode replays a scripted session and skips microphone capture
  // entirely, so the whole pipeline can be seen working with no mic, no
  // permission prompt, and no Chrome requirement.
  const isDemo = providerId === "mock";
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
  });
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);
  const [emotes, setEmotes] = useState<Emote[]>(() => [...DEFAULT_EMOTES]);

  const engineRef = useRef<SimulationEngine | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const providerRef = useRef<TranscriptionProvider | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef<SimulationSettings>(DEFAULT_SETTINGS);
  const emotesRef = useRef<Emote[]>([...DEFAULT_EMOTES]);
  const pausedRef = useRef(false);

  /** Level subscribers, kept outside React entirely. */
  const levelSubscribers = useRef(new Set<(level: number) => void>());

  // Settings and emote packs are read from localStorage after mount, not
  // during render, so server and client markup agree.
  useEffect(() => {
    const loaded = localSettingsStore.load();
    settingsRef.current = loaded;
    setSettings(loaded);
    engineRef.current?.updateSettings(loaded);

    const merged = mergeEmotes(DEFAULT_EMOTES, localEmotePackStore.load());
    emotesRef.current = merged;
    setEmotes(merged);
    engineRef.current?.setEmotes(merged);
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

  const startTicking = useCallback(() => {
    if (tickRef.current !== null) return;

    tickRef.current = setInterval(() => {
      const engine = engineRef.current;
      if (!engine || pausedRef.current) return;

      const released = engine.tick(Date.now());
      if (released.length > 0) {
        const cap = settingsRef.current.messageBufferSize;
        setMessages((previous) => {
          const next = [...previous, ...released];
          return next.length > cap ? next.slice(-cap) : next;
        });
      }

      setStats(engine.stats());
    }, TICK_MS);
  }, []);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (status === "running" || status === "starting") return;

    setStatus("starting");
    setError(null);

    const engine = ensureEngine();
    engine.markActivity(Date.now());

    if (isDemo) {
      setMicLabel("Demo mode — no microphone");
    } else {
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
    }

    const provider = createProvider(providerId);
    providerRef.current = provider;

    provider.events.on("final", ({ text }) => {
      setInterim("");
      // Loudness at the moment of speech sharpens the classifier: the same
      // words shouted and muttered should not produce the same reaction.
      const energy = micRef.current?.recentEnergy() ?? undefined;
      const at = Date.now();
      const outcome = engineRef.current?.handleTranscript(text, at, energy);
      if (!outcome) return;

      setHeard((previous) => {
        const next = [...previous, { id: `${at}-${text.length}`, text, at, outcome }];
        return next.length > 30 ? next.slice(-30) : next;
      });
    });

    provider.events.on("interim", ({ text }) => setInterim(text));

    provider.events.on("error", ({ message, fatal }) => {
      setError(message);
      if (fatal) setStatus("error");
    });

    await provider.start();

    if (provider.name === "mock" && !isDemo) {
      setError(
        "Speech recognition is unavailable in this browser — running a scripted demo instead. Chrome or Edge is required.",
      );
    }

    pausedRef.current = false;
    startTicking();
    setStatus("running");
  }, [status, providerId, isDemo, ensureEngine, startTicking]);

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

    // Drop queued messages: resuming later and dumping stale reactions to
    // something said minutes ago is worse than losing them.
    engineRef.current?.flush();
    setInterim("");
    setMicLabel("");
    setStatus("paused");
  }, [status]);

  const resume = useCallback(async () => {
    if (status !== "paused") return;

    if (!isDemo) {
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
    }

    pausedRef.current = false;
    engineRef.current?.markActivity(Date.now());
    void providerRef.current?.start();
    setStatus("running");
  }, [status, isDemo]);

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
    pausedRef.current = false;

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
  };
}
