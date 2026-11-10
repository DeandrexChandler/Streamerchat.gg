/**
 * Which requests need a signed-in user. Pure, so the table in
 * docs/agent-briefs.md (Track B) is tested directly against it.
 *
 * - "page": signed out goes to /login.
 * - "api": signed out gets a silent 401.
 * - "open": everyone, signed in or not.
 *
 * Pages are open unless listed (the public site grows without touching
 * this). APIs are gated unless listed: a new route is safe by default.
 */
export type Gate = "open" | "page" | "api";

const GATED_PAGES = ["/dashboard", "/simulator", "/settings", "/emotes", "/obs", "/account"];

/** OBS can't sign in; the overlay is guarded by the session key in its URL. */
const OPEN_APIS = ["/api/auth", "/api/overlay/stream", "/api/overlay/status"];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function gateFor(pathname: string): Gate {
  if (under(pathname, "/api")) return OPEN_APIS.some((p) => under(pathname, p)) ? "open" : "api";
  return GATED_PAGES.some((p) => under(pathname, p)) ? "page" : "open";
}

/** Where to send someone after signing in: only ever a path on this site. */
export function safeReturnPath(from: string | null | undefined): string {
  return from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/\\")
    ? from
    : "/simulator";
}
