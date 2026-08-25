import type { ReactNode } from "react";
import { NavRail } from "@/app/components/NavRail";

/**
 * Chrome for the app's real pages. Living in a route group means pages under
 * it stay at /simulator, /obs, /settings while inheriting this shell — no page
 * has to remember to wrap itself.
 *
 * /overlay is deliberately outside this group: it renders into an OBS browser
 * source and must have no chrome at all.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <NavRail />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
