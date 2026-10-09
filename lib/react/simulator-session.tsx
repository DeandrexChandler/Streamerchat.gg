"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSimulator, type UseSimulatorResult } from "./use-simulator";

/**
 * The session, owned by the app shell rather than the simulator page.
 *
 * Owned by the page, it was unmounted by every trip to settings: chat, the
 * transcript and the engine all went, and coming back was a fresh stream.
 * The shell outlives navigation, so the session now does too. The only ways
 * to end it are Reset session and reloading the window.
 */
const SimulatorContext = createContext<UseSimulatorResult | null>(null);

export function SimulatorSession({ children }: { children: React.ReactNode }) {
  const simulator = useSimulator();
  const onSimulator = usePathname() === "/simulator";

  /**
   * Away from the simulator, chat pauses — and releases the mic, as Pause
   * always does. Back on it, whatever settings changed in the meantime are
   * read in; it stays paused until the streamer presses Play.
   */
  useEffect(() => {
    if (onSimulator) simulator.reloadStored();
    else simulator.pause();
    // Route changes only: pause and reloadStored change identity with status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSimulator]);

  return <SimulatorContext.Provider value={simulator}>{children}</SimulatorContext.Provider>;
}

export function useSimulatorSession(): UseSimulatorResult {
  const simulator = useContext(SimulatorContext);
  if (!simulator) throw new Error("useSimulatorSession needs <SimulatorSession> above it");
  return simulator;
}
