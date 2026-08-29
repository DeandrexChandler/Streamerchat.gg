"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  localSettingsStore,
  type SimulationSettings,
} from "../config/settings";

/**
 * Reads persisted settings and writes changes back.
 *
 * Shared by every settings page so the load-then-hydrate dance lives in one
 * place rather than being re-derived per page — and more settings pages are
 * coming.
 *
 * Settings must be read *after* mount, not during render: localStorage does
 * not exist on the server, and reading it in a state initialiser makes the
 * server and client render different markup. That means exactly one extra
 * render on mount, which is what the lint rule below is objecting to. It is
 * the correct trade here — the alternative is a hydration mismatch on every
 * control — and confining it to this hook keeps the exception to one place.
 */
export function useStoredSettings(): {
  settings: SimulationSettings;
  update: (patch: Partial<SimulationSettings>) => void;
} {
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Client-only storage cannot be read during render without desyncing
    // server and client markup, so the one extra mount render is deliberate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(localSettingsStore.load());
  }, []);

  const update = useCallback((patch: Partial<SimulationSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      localSettingsStore.save(next);
      return next;
    });
  }, []);

  return { settings, update };
}
