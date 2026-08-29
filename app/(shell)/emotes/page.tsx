import { redirect } from "next/navigation";

// Moved under /settings. Redirect rather than 404 — this URL is likely
// sitting in an open tab or a bookmark.
export default function EmotesRedirect() {
  redirect("/settings/emotes");
}
