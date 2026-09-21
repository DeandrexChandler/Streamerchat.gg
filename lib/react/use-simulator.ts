"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicSession } from "../audio/mic-session";
import { ScreenCapture } from "../audio/screen-capture";
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
import type { GameEvent } from "../ai/moment";
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
 * Mean brightness change across a 32x32 thumbnail that counts as an event.
 *
 * Deliberately high. Ordinary play moves the screen constantly; this is
 * meant to fire on a scene cut, a death screen, a flashbang — the things
 * chat would actually shout about. The engine rate-limits on top, so a
 * generous threshold costs a wasted comparison rather than a wasted call.
 */
const SCREEN_EVENT_THRESHOLD = 0.18;

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

  /** True while the streamer's screen is being captured for chat. */
  watching: boolean;
  /**
   * Turns screen capture on or off.
   *
   * Opt-in: off until asked for. On means a downscaled frame rides along
   * with batches the engine was going to request anyway, so chat can react
   * to the game rather than only to speech.
   */
  setWatching: (on: boolean) => Promise<void>;
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
    latencyMs: 0,
  });
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);
  const [emotes, setEmotes] = useState<Emote[]>(() => []);
  const [overlaySubscribers, setOverlaySubscribers] = useState(0);
  const [watching, setWatching] = useState(false);

  const engineRef = useRef<SimulationEngine | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const providerRef = useRef<TranscriptionProvider | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef<SimulationSettings>(DEFAULT_SETTINGS);
  const emotesRef = useRef<Emote[]>([]);
  const pausedRef = useRef(false);
  const overlayRef = useRef<OverlayTransport | null>(null);
  /**
   * The generation request on the wire, if any.
   *
   * One at a time — but the engine decides which one. When the streamer
   * speaks during a slow call, the engine abandons that request and hands
   * out a new ticket; the old fetch is aborted rather than waited on, so a
   * reaction is never held behind a fifteen-second arrival batch.
   */
  const inFlightRef = useRef<{ ticket: number; controller: AbortController } | null>(null);
  /** The screen, when the streamer has turned capture on. */
  const screenRef = useRef<ScreenCapture | null>(null);

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
    // The engine hands out nothing while its current request is unresolved,
    // so this only returns a request when there is genuinely a new one.
    const request = engine.nextGeneration(now);
    if (!request) return;
    const ticket = engine.generationTicket;
    if (ticket === null) return;

    // Anything still on the wire is for a moment the engine has abandoned.
    inFlightRef.current?.controller.abort();
    const controller = new AbortController();
    inFlightRef.current = { ticket, controller };

    // Rides along with a request the engine was going to make anyway. That
    // is the only reason a frame per batch is affordable.
    const frame = screenRef.current?.grab() ?? undefined;
    console.debug(
      `[chat] → ${request.phase}${request.continuation ? "+" : ""}${frame ? "+frame" : ""} ×${request.count}`,
    );

    try {
      const response = await fetch("/api/chat-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(frame ? { ...request, frame } : request),
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        reactions?: Reaction[];
        status?: string;
        event?: GameEvent;
      };

      if (!response.ok || body.status !== "ok" || !body.reactions?.length) {
        console.debug(`[chat] ← nothing for ${request.phase} (the server log says why)`);
        engine.generationFailed(Date.now(), ticket);
        return;
      }
      console.debug(
        `[chat] ← ${body.reactions.length} lines for ${request.phase}${body.event ? `, saw ${body.event}` : ""}`,
      );
      engine.supplyReactions(body.reactions, Date.now(), ticket, body.event);
    } catch (error) {
      // An abort is the engine having moved on; there is nothing to report.
      if (!controller.signal.aborted) engine.generationFailed(Date.now(), ticket);
      void error;
    } finally {
      if (inFlightRef.current?.ticket === ticket) inFlightRef.current = null;
    }
  }, []);

  const startTicking = useCallback(() => {
    if (tickRef.current !== null) return;

    tickRef.current = setInterval(() => {
      const engine = engineRef.current;
      if (!engine || pausedRef.current) return;

      const now = Date.now();

      /**
       * Did the screen move enough to be worth reacting to?
       *
       * Polled on the engine's own tick rather than a frame loop: four
       * samples a second is plenty to catch a death, and this keeps the
       * whole thing on one clock. The engine decides what to do with it and
       * rate-limits itself.
       */
      const moved = screenRef.current?.changed() ?? 0;
      if (moved > SCREEN_EVENT_THRESHOLD) engine.screenEvent(now);

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
   * Opens the microphone and the speech recogniser, creating whichever is
   * missing.
   *
   * The one place listening begins. It used to live inside start(), so a
   * session begun any other way — typing first — never got a recogniser,
   * and resume() only restarted one that already existed. The mic stayed off
   * until Clear. Called from start() and resume(); never fatal: a denied
   * permission is reported and chat carries on.
   */
  const listen = useCallback(async () => {
    // Mic capture and speech recognition are independent: recognition opens
    // its own capture internally, while MicSession exists for the level
    // meter and the loudness signal the classifier uses.
    const mic = new MicSession();
    micRef.current = mic;
    mic.events.on("level", (level) => {
      for (const handler of levelSubscribers.current) handler(level);
    });
    mic.events.on("error", ({ message }) => setError(message));

    if (!(await mic.start())) {
      // The error event above already said why. Chat carries on without it.
      micRef.current = null;
      return;
    }
    setMicLabel(mic.label);

    if (!providerRef.current) {
      const provider = createProvider();
      if (!provider) {
        // No recognition in this browser. The session still runs — arrival,
        // idle and typed input all work — it just cannot hear you.
        setError(
          "Speech recognition isn't available in this browser, so the microphone won't transcribe. Typed input still works. Chrome or Edge can hear you.",
        );
        return;
      }
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
    }

    await providerRef.current.start();
  }, [pump]);

  /**
   * Turns screen capture on or off.
   *
   * Off is the default and stays the current product: speech only, no
   * permission, nothing leaving the machine. On asks for a window and then
   * sends a small frame with each batch, which is worth saying plainly
   * because those frames go to Google.
   */
  const setWatchingScreen = useCallback(async (on: boolean) => {
    if (!on) {
      screenRef.current?.stop();
      screenRef.current = null;
      setWatching(false);
      return;
    }
    if (screenRef.current?.active) return;

    const capture = new ScreenCapture();
    // Stopping the share from the browser's own bar has to turn the toggle
    // off too, or the UI claims to be watching a screen that is gone.
    const ok = await capture.start(() => {
      screenRef.current = null;
      setWatching(false);
    });
    if (!ok) {
      setWatching(false);
      return;
    }
    screenRef.current = capture;
    setWatching(true);
  }, []);

  const start = useCallback(async () => {
    if (status === "running" || status === "starting") return;

    setStatus("starting");
    setError(null);

    const engine = ensureEngine();
    engine.beginSession(Date.now());

    /**
     * The room starts before the microphone does.
     *
     * Arrival chat, idle chat and typed input need nothing from the mic, and
     * the mic can take a second to come up or fail outright. Everything up
     * to here runs synchronously, so a caller can start() and immediately
     * hand the engine a line — say() relies on that.
     */
    pausedRef.current = false;
    startTicking();
    setStatus("running");

    await listen();
  }, [status, ensureEngine, startTicking, listen]);

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

    // Chat first, synchronously, then the mic — same order as start(), so a
    // mic that fails to reopen cannot leave the room stuck on Paused.
    pausedRef.current = false;
    engineRef.current?.resume(Date.now());
    setStatus("running");

    await listen();
  }, [status, listen]);

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

      /**
       * Typing is an unambiguous intent to start — through the real entry.
       *
       * This used to flip the status to "running" and start the tick loop on
       * its own, which skipped the microphone entirely: the button then read
       * Pause, so Play never ran, and the mic stayed off until Clear. Typing
       * while paused left the engine paused under a green pill. Both now go
       * through start()/resume(), whose synchronous half has the engine
       * running before the line below reaches it.
       */
      if (status === "idle" || status === "error") void start();
      else if (status === "paused") void resume();

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
      void pump(engine, at);
    },
    [status, start, resume, ensureEngine, pump],
  );

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
    inFlightRef.current?.controller.abort();
    inFlightRef.current = null;
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
      screenRef.current?.stop();
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
    watching,
    setWatching: setWatchingScreen,
  };
}
