"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Menu,
  MessagesSquare,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SimulatorSession } from "@/lib/react/simulator-session";

/**
 * App chrome.
 *
 * Two constraints shape this, and both come from the simulator that renders
 * inside it:
 *
 *  1. The page surface stays light. The chat column is #18181b and only reads
 *     as a distinct panel because the surface behind it is lighter. A previous
 *     rebuild made the whole app dark and the chat pane lost its edges.
 *  2. Typography is opted into, not inherited. `dashboard-surface` applies the
 *     Geist stack to chrome only — the chat's own type is part of what goes
 *     out on stream and is not ours to restyle from here.
 *
 * /overlay is deliberately outside this route group: it renders into an OBS
 * browser source and must have no chrome at all.
 */

const NAV = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    hint: "Setup and session",
  },
  {
    label: "Simulator",
    href: "/simulator",
    icon: MessagesSquare,
    hint: "Run the chat",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: SlidersHorizontal,
    hint: "Chat, emotes, OBS",
  },
] as const;

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const current = NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <div className="dashboard-surface h-screen overflow-hidden">
      <Button
        variant="outline"
        size="icon"
        onClick={() => setMobileOpen((open) => !open)}
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        className="fixed top-4 left-4 z-50 lg:hidden"
      >
        {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      <aside
        data-app-nav
        className={cn(
          "fixed top-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-sidebar transition-transform",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="p-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              StreamerChat<span className="text-muted-foreground">.gg</span>
            </span>
          </Link>
        </div>

        <Separator />

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item === current;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="flex flex-col leading-tight">
                  <span>{item.label}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </Link>
            );
          })}

          {/* A new tab, on purpose: /account is outside this shell, so opening
              it here would unmount <SimulatorSession> and end the stream. */}
          <a
            href="/account"
            target="_blank"
            rel="noopener"
            onClick={() => setMobileOpen(false)}
            className="flex items-start gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <UserRound className="mt-0.5 size-4 shrink-0" />
            <span className="flex flex-col leading-tight">
              <span>Account</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Opens in a new tab
              </span>
            </span>
          </a>
        </nav>

      </aside>

      <div data-app-content className="flex h-screen flex-col overflow-hidden lg:ml-64">
        <header className="flex shrink-0 items-center border-b border-border px-6 py-3.5">
          <div className="ml-12 lg:ml-0">
            <h1 className="text-lg font-semibold tracking-tight">
              {current?.label ?? "StreamerChat.gg"}
            </h1>
            {current && (
              <p className="text-xs text-muted-foreground">{current.hint}</p>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-6">
          <SimulatorSession>{children}</SimulatorSession>
        </main>
      </div>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
    </div>
  );
}
