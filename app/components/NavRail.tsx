"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, Tv } from "lucide-react";

const LINKS = [
  { href: "/simulator", label: "Simulator", icon: MessagesSquare },
  { href: "/obs", label: "OBS", icon: Tv },
] as const;

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-900 py-3 sm:w-52 sm:items-stretch sm:px-3">
      <Link href="/simulator" className="mb-4 flex items-center gap-2 px-1 sm:px-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-600 text-sm font-bold">
          S
        </span>
        <span className="hidden truncate font-semibold sm:block">StreamerChat.gg</span>
      </Link>

      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={label}
            className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors sm:justify-start ${
              active
                ? "bg-purple-600/15 text-purple-300"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="hidden sm:block">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
