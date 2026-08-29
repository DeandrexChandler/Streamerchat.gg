"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Monitor,
  PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { loadOverlayKey } from "@/lib/config/overlay-key";

/**
 * OBS setup.
 *
 * Builds the browser-source URL and explains how to add it. Only exposes the
 * parameters /overlay actually reads — the previous version emitted width,
 * height, fontFamily and color as well, none of which the overlay has ever
 * looked at. OBS sizes the browser source itself, so width and height in the
 * URL were always meaningless.
 *
 * The `key` in the URL is what pairs a browser source with this browser's
 * simulator. It is persisted, so the URL pasted into OBS keeps working across
 * restarts, and it is a secret: anyone holding it can read the chat going to
 * this overlay, or push text onto the stream.
 */

const DEFAULTS = { fontSize: 16, maxMessages: 50, timestamps: false };

/** Polling cadence for the "is a source attached" indicator. */
const STATUS_POLL_MS = 3_000;

export default function ObsPage() {
  const [fontSize, setFontSize] = useState(DEFAULTS.fontSize);
  const [maxMessages, setMaxMessages] = useState(DEFAULTS.maxMessages);
  const [timestamps, setTimestamps] = useState(DEFAULTS.timestamps);
  const [copied, setCopied] = useState(false);
  const [overlayKey, setOverlayKey] = useState("");
  const [attached, setAttached] = useState<number | null>(null);

  // The key lives in localStorage, so it can only be read after mount without
  // the server and client rendering different URLs.
  useEffect(() => setOverlayKey(loadOverlayKey()), []);

  const overlayUrl = useMemo(() => {
    if (!overlayKey) return "";
    const origin =
      typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    const params = new URLSearchParams({
      key: overlayKey,
      fontSize: String(fontSize),
      max: String(maxMessages),
      timestamps: String(timestamps),
    });
    return `${origin}/overlay?${params}`;
  }, [overlayKey, fontSize, maxMessages, timestamps]);

  // Answers the only question that actually matters on this page: did OBS
  // connect? Polling beats pushing here — the page is open for a minute while
  // someone sets a source up, then closed.
  useEffect(() => {
    if (!overlayKey) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/overlay/status?key=${encodeURIComponent(overlayKey)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("status unavailable");
        const body = (await response.json()) as { subscribers?: number };
        if (!cancelled) setAttached(Number(body?.subscribers) || 0);
      } catch {
        if (!cancelled) setAttached(null);
      }
    };

    void poll();
    const timer = setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [overlayKey]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      toast.success("Browser source URL copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the URL and copy it manually.");
    }
  }, [overlayUrl]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 pb-10">
        <ConnectionStatus attached={attached} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="size-4" />
              Browser source URL
            </CardTitle>
            <CardDescription>
              Paste this into OBS as a Browser source.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={overlayUrl}
                placeholder="Generating…"
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button onClick={copyUrl} disabled={!overlayUrl} className="shrink-0">
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            {/* Base UI's Button has no asChild (that's a Radix API), so the
                link takes the variant classes directly. */}
            <a
              href={overlayUrl || "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!overlayUrl}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="size-4" />
              Preview in a new tab
            </a>

            <p className="text-xs text-muted-foreground">
              Treat this URL like a password. The <code>key</code> in it is what
              lets a browser source receive your chat — don&apos;t put it on
              screen or paste it anywhere public.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              These are the only settings the overlay reads. Size and position
              are handled by OBS itself.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field
              id="font-size"
              label="Font size"
              hint="Bigger text is easier to read on a stream than in a browser."
              suffix="px"
            >
              <Input
                id="font-size"
                type="number"
                min={10}
                max={48}
                value={fontSize}
                onChange={(e) =>
                  setFontSize(clamp(Number(e.target.value), 10, 48, DEFAULTS.fontSize))
                }
              />
            </Field>

            <Separator />

            <Field
              id="max-messages"
              label="Messages kept on screen"
              hint="Older messages scroll away once this many are showing."
            >
              <Input
                id="max-messages"
                type="number"
                min={5}
                max={300}
                value={maxMessages}
                onChange={(e) =>
                  setMaxMessages(
                    clamp(Number(e.target.value), 5, 300, DEFAULTS.maxMessages),
                  )
                }
              />
            </Field>

            <Separator />

            <label
              htmlFor="timestamps"
              className="flex cursor-pointer items-start justify-between gap-4"
            >
              <span className="space-y-1">
                <span className="block text-sm font-medium">Show timestamps</span>
                <span className="block text-xs text-muted-foreground">
                  Off by default (most streamers don&apos;t put clocks on chat).
                </span>
              </span>
              <input
                id="timestamps"
                type="checkbox"
                checked={timestamps}
                onChange={(e) => setTimestamps(e.target.checked)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adding it in OBS</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {[
                'In Sources, click + and choose "Browser".',
                'Name it "StreamerChat.gg Overlay" and click OK.',
                "Paste the URL above into the URL field.",
                "Set Width and Height to the size you want the chat box to be — 400 × 800 is a good start.",
                'Tick "Shutdown source when not visible" so it stops when hidden.',
                "Click OK, then drag it where you want it on your scene.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <Badge
                    variant="secondary"
                    className="size-5 shrink-0 justify-center rounded-full p-0 text-[11px] tabular-nums"
                  >
                    {i + 1}
                  </Badge>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Live answer to "did it work".
 *
 * `null` means the server didn't answer — worth distinguishing from zero,
 * because the fix is completely different (restart the app vs. check the URL
 * in OBS).
 */
function ConnectionStatus({ attached }: { attached: number | null }) {
  if (attached === null) {
    return (
      <StatusCard
        tone="warn"
        icon={<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
        title="Can't reach the server"
        body="The app isn't responding. Make sure it's still running, then reload this page."
      />
    );
  }

  if (attached === 0) {
    return (
      <StatusCard
        tone="muted"
        icon={<PlugZap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        title="No browser source attached"
        body="Add the URL below to OBS as a Browser source. This turns green the moment it connects — no need to check OBS."
      />
    );
  }

  return (
    <StatusCard
      tone="ok"
      icon={<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
      title={
        attached === 1
          ? "Browser source connected"
          : `${attached} browser sources connected`
      }
      body="Chat from the simulator is going through. Start talking on the Simulator page and it will appear in OBS."
    />
  );
}

const STATUS_TONES = {
  ok: "border-emerald-500/40 bg-emerald-500/5",
  warn: "border-amber-500/40 bg-amber-500/5",
  muted: "",
} as const;

function StatusCard({
  tone,
  icon,
  title,
  body,
}: {
  tone: keyof typeof STATUS_TONES;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className={STATUS_TONES[tone]}>
      <CardContent className="flex gap-3 pt-1">
        {icon}
        <div className="space-y-1 text-sm">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  suffix,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_9rem] sm:items-start sm:gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/** Keeps a typed value in range, falling back when the field is cleared. */
function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
