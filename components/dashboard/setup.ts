import type { AiKeyState } from "@/app/api/ai-status/route";
import type { SimulatorStatus } from "@/lib/react/use-simulator";

/**
 * What the dashboard says about each piece of setup. Pure, so the wording
 * for every state is tested rather than eyeballed.
 */

export type ItemState = "ok" | "todo" | "checking";

export interface SetupItem {
  label: string;
  state: ItemState;
  detail: string;
  /** Where it gets fixed. */
  href: string;
}

export type KeyStatus = AiKeyState | "checking";

export function keyItem(status: KeyStatus): SetupItem {
  const base = { label: "AI key", href: "/settings/chat" };
  switch (status) {
    case "checking":
      return { ...base, state: "checking", detail: "Checking the key…" };
    case "ok":
      return { ...base, state: "ok", detail: "Chat can reach the AI." };
    case "missing":
      return {
        ...base,
        state: "todo",
        detail: "No key found. Put GOOGLE_API_KEY in .env.local and restart.",
      };
    case "rejected":
      return { ...base, state: "todo", detail: "The key was rejected. Check it and restart." };
    case "unreachable":
      return { ...base, state: "todo", detail: "Couldn't reach the AI just now. It may be temporary." };
  }
}

/** `unsupported`: the browser can't say without asking, which is fine. */
export type MicStatus = PermissionState | "checking" | "unsupported";

export function micItem(status: MicStatus): SetupItem {
  const base = { label: "Microphone", href: "/simulator" };
  switch (status) {
    case "checking":
      return { ...base, state: "checking", detail: "Checking permission…" };
    case "granted":
      return { ...base, state: "ok", detail: "Allowed. Chat can hear you." };
    case "denied":
      return {
        ...base,
        state: "todo",
        detail: "Blocked. Allow it in the browser's site settings, then reload.",
      };
    case "prompt":
    case "unsupported":
      return { ...base, state: "todo", detail: "The browser will ask when you press Play." };
  }
}

export function emotesItem(count: number): SetupItem {
  const base = { label: "Emotes", href: "/settings/emotes" };
  return count > 0
    ? { ...base, state: "ok", detail: `${count} emote${count === 1 ? "" : "s"} imported.` }
    : { ...base, state: "todo", detail: "None imported yet. Chat posts text only." };
}

/** The session panel's heading and button, from the running session. */
export function sessionAction(status: SimulatorStatus): { title: string; cta: string } {
  switch (status) {
    case "idle":
      return { title: "No session running", cta: "Start chat" };
    case "error":
      return { title: "The session stopped", cta: "Open simulator" };
    case "starting":
    case "running":
    case "paused":
      // Away from /simulator the shell pauses chat, so "running" is only
      // ever seen for a moment here.
      return { title: "Session paused", cta: "Resume chat" };
  }
}
