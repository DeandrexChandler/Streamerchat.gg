"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle, Loader2, MonitorPlay } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSimulatorSession } from "@/lib/react/simulator-session";
import { localEmotePackStore, mergeEmotes } from "@/lib/config/emote-store";
import { localRosterStore } from "@/lib/config/roster-store";
import {
  emotesItem,
  keyItem,
  micItem,
  sessionAction,
  type KeyStatus,
  type MicStatus,
  type SetupItem,
} from "./setup";
import { accountSummary, type AccountSummary } from "./account";

/** False on the server and the first client render, so storage reads don't break hydration. */
const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function useKeyStatus(): KeyStatus {
  const [status, setStatus] = useState<KeyStatus>("checking");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-status", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ state?: KeyStatus }>)
      .then((body) => !cancelled && setStatus(body.state ?? "unreachable"))
      .catch(() => !cancelled && setStatus("unreachable"));
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

function useMicStatus(): MicStatus {
  const [status, setStatus] = useState<MicStatus>("checking");
  useEffect(() => {
    let perm: PermissionStatus | null = null;
    const update = () => perm && setStatus(perm.state);
    navigator.permissions
      // "microphone" isn't in every browser's PermissionName list (Firefox throws).
      .query({ name: "microphone" as PermissionName })
      .then((p) => {
        perm = p;
        update();
        p.addEventListener("change", update);
      })
      .catch(() => setStatus("unsupported"));
    return () => perm?.removeEventListener("change", update);
  }, []);
  return status;
}

/**
 * Plan and usage, once, on load. Null (panel hidden) on localhost, where
 * billing is off, and on any failure: a refusal is never shown as an error.
 */
function useAccount(): { summary: AccountSummary; name: string | null } | null {
  const [account, setAccount] = useState<{ summary: AccountSummary; name: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const json = (url: string) =>
      fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    void (async () => {
      const summary = accountSummary(await json("/api/billing/me"));
      if (!summary) return;
      // Auth.js's own session endpoint; null in local mode, which is fine.
      const session = (await json("/api/auth/session")) as { user?: { name?: string } } | null;
      if (!cancelled) setAccount({ summary, name: session?.user?.name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return account;
}

export function Dashboard() {
  const simulator = useSimulatorSession();
  const mounted = useMounted();
  const keyStatus = useKeyStatus();
  const micStatus = useMicStatus();
  const account = useAccount();

  const { emoteCount, regulars } = useMemo(
    () =>
      mounted
        ? {
            emoteCount: mergeEmotes(localEmotePackStore.load()).length,
            regulars: localRosterStore.load(),
          }
        : { emoteCount: null, regulars: null },
    [mounted],
  );

  const action = sessionAction(simulator.status);
  const released = simulator.stats.released;
  const items = [
    keyItem(keyStatus),
    micItem(micStatus),
    emoteCount === null
      ? { ...emotesItem(0), state: "checking" as const, detail: "Reading…" }
      : emotesItem(emoteCount),
  ];

  return (
    <div className="h-full overflow-y-auto">
      {/* p-px keeps the cards' 1px ring from being clipped by the scroller. */}
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 p-px pb-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{action.title}</CardTitle>
            <CardDescription>
              {simulator.status === "idle"
                ? "Press Play in the simulator and chat starts arriving."
                : `${released} message${released === 1 ? "" : "s"} so far. Chat picks up where it left off.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/simulator" className={buttonVariants()}>
              {action.cta}
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        {account && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>
                {account.summary.plan}
                {account.name && (
                  <span className="font-normal text-muted-foreground"> · {account.name}</span>
                )}
              </CardTitle>
              <CardDescription>{account.summary.usage}</CardDescription>
            </CardHeader>
            {/* New tabs throughout: /account, /pricing and Stripe are all
                outside this shell, and leaving it ends the session. */}
            <CardContent className="flex flex-wrap gap-2">
              {account.summary.action === "portal" ? (
                <form action="/api/billing/portal" method="post" target="_blank">
                  <Button type="submit" variant="outline">
                    Manage billing
                  </Button>
                </form>
              ) : (
                <a href="/pricing" target="_blank" rel="noopener" className={buttonVariants()}>
                  Choose a plan
                </a>
              )}
              <a
                href="/account"
                target="_blank"
                rel="noopener"
                className={buttonVariants({ variant: "ghost" })}
              >
                Account
              </a>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>What chat needs to work.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {items.map((item) => (
                <ChecklistRow key={item.label} item={item} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regulars</CardTitle>
            <CardDescription>The people chat keeps coming back as.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {regulars && regulars.length > 0 ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
                {regulars.map((viewer) => (
                  <li key={viewer.id} className="font-semibold" style={{ color: viewer.color }}>
                    {viewer.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {regulars ? "Nobody yet. They arrive with your first session." : "Reading…"}
              </p>
            )}
            <Link href="/settings/regulars" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
              Edit regulars <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>OBS overlay</CardTitle>
            <CardDescription>
              {simulator.overlaySubscribers > 0
                ? `${simulator.overlaySubscribers} browser source${simulator.overlaySubscribers === 1 ? "" : "s"} connected.`
                : "Add chat to your stream as a browser source."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings/obs" className={buttonVariants({ variant: "outline" })}>
              <MonitorPlay className="size-4" />
              Set up the overlay
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChecklistRow({ item }: { item: SetupItem }) {
  const Icon = item.state === "ok" ? Check : item.state === "checking" ? Loader2 : Circle;
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/60"
      >
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            item.state === "ok" && "text-emerald-600",
            item.state === "todo" && "text-amber-500",
            item.state === "checking" && "animate-spin text-muted-foreground",
          )}
          aria-hidden
        />
        <span className="flex flex-col">
          <span className="font-medium">{item.label}</span>
          <span className="text-xs text-muted-foreground">{item.detail}</span>
        </span>
      </Link>
    </li>
  );
}
