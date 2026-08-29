"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AUTO_PACK_ID, localEmotePackStore } from "@/lib/config/emote-store";
import type { EmotePack } from "@/lib/emotes/seventv";

/**
 * Emote pack management.
 *
 * Lives on its own page rather than in the simulator's settings panel: a pack
 * is hundreds of emotes with a preview grid, which is a browsing task, not
 * something to do from a 224px sidebar mid-stream.
 */
export default function EmotesPage() {
  const [packs, setPacks] = useState<EmotePack[]>([]);
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setPacks(localEmotePackStore.load()), []);

  const persist = useCallback((next: EmotePack[]) => {
    setPacks(next);
    localEmotePackStore.save(next);
  }, []);

  const importPack = useCallback(
    async (query: string, label: string) => {
      setBusy(label);
      try {
        const res = await fetch(`/api/emotes?${query}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Import failed.");

        const pack = body as EmotePack;
        const next = [
          ...localEmotePackStore.load().filter((p) => p.id !== pack.id),
          pack,
        ];
        persist(next);
        toast.success(`Imported ${pack.emotes.length} emotes from ${pack.name}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Import failed.",
        );
      } finally {
        setBusy(null);
      }
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist(packs.filter((p) => p.id !== id));
      toast.success("Pack removed");
    },
    [packs, persist],
  );

  const total = packs.reduce((sum, p) => sum + p.emotes.length, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 pb-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Import from 7TV
            </CardTitle>
            <CardDescription>
              Pull a channel&apos;s emote set so chat uses the emotes your
              viewers actually know. Animated emotes are always kept; still
              images come in only where a mood would otherwise be too thin to
              use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (channel.trim()) {
                  void importPack(
                    `channel=${encodeURIComponent(channel.trim())}`,
                    "channel",
                  );
                }
              }}
              className="space-y-2"
            >
              <Label htmlFor="channel">Twitch channel</Label>
              <div className="flex gap-2">
                <Input
                  id="channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="e.g. xqc"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="submit"
                  disabled={!channel.trim() || busy !== null}
                  className="shrink-0"
                >
                  {busy === "channel" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Import
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The channel needs a 7TV account for this to find anything.
              </p>
            </form>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">7TV global emotes</p>
                <p className="text-xs text-muted-foreground">
                  The set almost every chat has.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void importPack("global=1", "global")}
                disabled={busy !== null}
                className="shrink-0"
              >
                {busy === "global" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Import global
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Installed packs</span>
              {total > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {total} emotes
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Chat picks from these alongside the built-in text emotes. Newer
              packs win when two share a name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {packs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No packs yet. Chat will use the built-in text emotes until you
                import one.
              </p>
            ) : (
              <div className="space-y-5">
                {packs.map((pack) => (
                  <div key={pack.id} className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {pack.name}
                          </p>
                          {pack.id === AUTO_PACK_ID && (
                            <Badge variant="secondary" className="shrink-0">
                              Added automatically
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pack.emotes.length} emotes
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(pack.id)}
                        aria-label={`Remove ${pack.name}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-2.5">
                      {pack.emotes.slice(0, 40).map((emote) => (
                        <img
                          key={emote.id}
                          src={emote.url}
                          alt={emote.name}
                          title={`${emote.name} · ${emote.mood}`}
                          loading="lazy"
                          className="h-7 w-auto"
                        />
                      ))}
                      {pack.emotes.length > 40 && (
                        <span className="self-center px-1 text-xs text-muted-foreground">
                          +{pack.emotes.length - 40} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
