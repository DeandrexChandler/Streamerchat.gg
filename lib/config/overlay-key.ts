import { OVERLAY_KEY_PATTERN } from "@/lib/overlay/protocol";

/**
 * The shared secret pairing this browser's simulator with its OBS browser
 * source.
 *
 * Persisted rather than generated per session, because the URL goes into an
 * OBS source once and has to keep working after a restart. Re-rolling it every
 * launch would mean re-pasting the URL into OBS every launch.
 *
 * It is a bearer token: anyone with the URL can read the chat being sent to
 * that overlay, and anyone who can guess it can push text onto the stream.
 * That is why it comes from `crypto.getRandomValues` and not from
 * `lib/engine/rng.ts` — the seeded RNG exists so a weird *simulation* can be
 * reproduced, and reproducibility is the exact property a credential must not
 * have. This is the one place in the app that deliberately sits outside it.
 */

const STORAGE_KEY = "streamerchat-gg:overlay-key:v1";

/** 32 hex chars = 128 bits. */
function generateKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads the stored key, creating one on first use.
 *
 * Client only — call it from an effect, not during render, or the server and
 * client markup disagree.
 */
export function loadOverlayKey(): string {
  if (typeof window === "undefined") return "";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && OVERLAY_KEY_PATTERN.test(stored)) return stored;

    const created = generateKey();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode or a storage quota failure. A key that lives only for this
    // page load still works; it just won't survive a reload, so the OBS URL
    // would need re-copying. Better than no overlay at all.
    return generateKey();
  }
}

/** Forgets the current key. The next load mints a new one. */
export function resetOverlayKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the caller reloads either way.
  }
}
