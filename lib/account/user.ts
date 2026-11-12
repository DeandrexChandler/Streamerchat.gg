import { getToken } from "next-auth/jwt";
import { authEnabled } from "./auth";

/** The one user in local mode, so callers never special-case it. */
export const LOCAL_USER_ID = "local";

/**
 * The signed-in user's stable ID (their Twitch user ID), or null when signed
 * out. Reads only the session cookie, so it is cheap enough for proxy.ts and
 * works in any route handler.
 */
export async function getUserId(request: Request): Promise<string | null> {
  if (!authEnabled) return LOCAL_USER_ID;
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    // Same rule Auth.js uses to name the cookie when it sets it.
    secureCookie: new URL(request.url).protocol === "https:",
  });
  return token?.sub ?? null;
}
