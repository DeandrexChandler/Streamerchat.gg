"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicSession } from "../audio/mic-session";
import { DEFAULT_SETTINGS, localSettingsStore } from "../config/settings";
import type { SimulationSettings } from "../config/settings";
import { DEFAULT_EMOTES } from "../data/emotes";
import { SimulationEngine, type EngineStats } from "../engine/engine";
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

export interface UseSimulatorResult {
  status: SimulatorStatus;
  messages: ChatMessage[];
  /** In-progress speech, for display only. Never fed to the engine. */
  interim: string;
  error: string | null;
  micLabel: string;
  stats: EngineStats;
  settings: SimulationSettings;

  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  updateSettings: (patch: Partial<SimulationSettings>) => void;

  /** Subscribe to mic level (0..1). Returns an unsubscribe function. */
  subscribeLevel: (handler: (level: number) => void) => () => void;
}

export function useSimulator(
  providerId: ProviderId = "web-speech",
): UseSimulatorResult {
  const [status, setStatus] = useState<SimulatorStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [micLabel, setMicLabel] = useState("");
  const [stats, setStats] = useState<EngineStats>({
    audience: 0,
    pending: 0,
    released: 0,
    ignored: 0,
    bySource: {},
  });
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);

  const engineRef = useRef<SimulationEngine | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const providerRef = useRef<TranscriptionProvider | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef<SimulationSettings>(DEFAULT_SETTINGS);
  const pausedRef = useRef(false);

  /** Level subscribers, kept outside React entirely. */
  const levelSubscribers = useRef(new Set<(level: number) => void>());

  // Settings are read from localStorage after mount, not during render, so
  // server and client markup agree.
  useEffect(() => {
    const loaded = localSettingsStore.load();
    settingsRef.current = loaded;
    setSettings(loaded);
    engineRef.current?.updateSettings(loaded);
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
        emotes: DEFAULT_EMOTES,
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

    // Mic capture and speech recognition are independent: recognition opens
    // its own capture internally, while MicSession exists for the level meter
    // and the loudness signal the classifier uses.
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

    const provider = createProvider(providerId);
    providerRef.current = provider;

    provider.events.on("final", ({ text }) => {
      setInterim("");
      // Loudness at the moment of speech sharpens the classifier: the same
      // words shouted and muttered should not produce the same reaction.
      const energy = micRef.current?.recentEnergy() ?? undefined;
      engineRef.current?.handleTranscript(text, Date.now(), energy);
    });

    provider.events.on("interim", ({ text }) => setInterim(text));

    provider.events.on("error", ({ message, fatal }) => {
      setError(message);
      if (fatal) setStatus("error");
    });

    await provider.start();

    if (provider.name === "mock" && providerId === "web-speech") {
      setError(
        "Speech recognition is unavailable in this browser — running a scripted demo instead. Chrome or Edge is required.",
      );
    }

    pausedRef.current = false;
    startTicking();
    setStatus("running");
  }, [status, providerId, ensureEngine, startTicking]);

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

  const pause = useCallback(() => {
    if (status !== "running") return;
    pausedRef.current = true;
    providerRef.current?.stop();
    // Drop queued messages: resuming later and dumping stale reactions to
    // something said minutes ago is worse than losing them.
    engineRef.current?.flush();
    setInterim("");
    setStatus("paused");
  }, [status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    pausedRef.current = false;
    engineRef.current?.markActivity(Date.now());
    void providerRef.current?.start();
    setStatus("running");
  }, [status]);

  const clear = useCallback(() => setMessages([]), []);

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
    error,
    micLabel,
    stats,
    settings,
    start,
    stop,
    pause,
    resume,
    clear,
    updateSettings,
    subscribeLevel,
  };
}
