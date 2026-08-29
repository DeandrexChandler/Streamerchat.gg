"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Settings shell.
 *
 * A sub-nav rather than more top-level items: settings areas will keep
 * arriving, and each one competing with the simulator for sidebar space is
 * how a nav turns into a list.
 */
const SECTIONS = [
  { href: "/settings/chat", label: "Chat", hint: "Behaviour and filtering" },
  { href: "/settings/emotes", label: "Emotes", hint: "Import 7TV packs" },
  { href: "/settings/appearance", label: "Appearance", hint: "How chat looks on stream" },
  { href: "/settings/obs", label: "OBS", hint: "Browser source setup" },
] as const;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full gap-6 overflow-hidden">
      <nav className="w-48 shrink-0 space-y-1 pt-1">
        {SECTIONS.map((section) => {
          const active =
            pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                "block rounded-md px-3 py-2 transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "block text-sm",
                  active ? "font-medium" : "text-foreground",
                )}
              >
                {section.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {section.hint}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
