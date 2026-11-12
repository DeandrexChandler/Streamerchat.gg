/**
 * Who may sign in while usage is uncapped: Twitch login names from
 * AUTH_ALLOWED_TWITCH, comma separated. Unset or empty lets nobody in.
 */
export function isAllowed(username: unknown, list = process.env.AUTH_ALLOWED_TWITCH ?? ""): boolean {
  if (typeof username !== "string" || !username) return false;
  return list
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .includes(username.toLowerCase());
}
