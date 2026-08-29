import { redirect } from "next/navigation";

// Moved under /settings. The OBS browser-source URL points at /overlay and is
// unaffected, but this is the page people keep open while setting things up.
export default function ObsRedirect() {
  redirect("/settings/obs");
}
