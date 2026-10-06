"use client";

import { useCallback, useMemo, useState } from "react";
import { Ban, Check, Search, X } from "lucide-react";
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
import {
  localEmoteTagStore,
  type EmoteTagMap,
} from "@/lib/config/emote-tags";
import { EMOTE_TAGS, type Emote, type EmoteTag } from "@/lib/engine/types";
import { meaningsOf } from "@/lib/emotes/meaning";
import { localEmoteRuleStore, type EmoteRule, type EmoteRuleMap } from "@/lib/config/emote-rules";
import { cn } from "@/lib/utils";

/** Shown on the chips, because "question" alone reads ambiguously. */
const TAG_LABELS: Record<EmoteTag, string> = {
  greeting: "Greeting",
  farewell: "Goodbye",
  hype: "Hype",
  agreement: "Agreement",
  victory: "Win",
  spam: "Spam",
  laugh: "Laugh",
  sad: "Sad",
  frustrated: "Frustrated",
  confused: "Confused",
  question: "Question",
  love: "Love",
  idle: "Idle",
  general: "Anywhere",
};

/** How many thumbnails render at once. A channel pack can be 600 emotes. */
const PAGE = 72;

/**
 * Hand-tagging for emotes.
 *
 * Guessing a category from a name works for `peepoHi` and not at all for
 * `GAMBA` or `xqcL`, so the person who imported the pack gets to say what
 * each one means. Tags beat the inferred mood when chat picks an emote.
 *
 * Search-then-click rather than a tag column per row: eleven checkboxes
 * across six hundred rows is unusable, and most emotes never need a tag.
 */
export function EmoteTagger({ emotes }: { emotes: readonly Emote[] }) {
  // Read once at mount rather than in an effect. Safe against hydration
  // mismatch because the parent loads its packs in an effect, so this renders
  // nothing on the server pass either way.
  const [tags, setTags] = useState<EmoteTagMap>(() => localEmoteTagStore.load());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [taggedOnly, setTaggedOnly] = useState(false);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [rules, setRules] = useState<EmoteRuleMap>(() => localEmoteRuleStore.load());

  /** Writes one emote's rule, dropping it entirely once nothing is set. */
  const updateRule = useCallback((name: string, next: EmoteRule) => {
    setRules((current) => {
      const key = name.toLowerCase();
      const merged: Record<string, EmoteRule> = { ...current };
      if (!next.blocked && !(next.notFor && next.notFor.length > 0)) delete merged[key];
      else merged[key] = next;
      localEmoteRuleStore.save(merged);
      return merged;
    });
  }, []);

  const update = useCallback((name: string, next: readonly EmoteTag[]) => {
    setTags((current) => {
      const key = name.toLowerCase();
      const merged = { ...current };
      if (next.length === 0) delete merged[key];
      else merged[key] = next;
      localEmoteTagStore.save(merged);
      return merged;
    });
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return emotes.filter((emote) => {
      const key = emote.name.toLowerCase();
      if (taggedOnly && !tags[key]) return false;
      // Never used: blocked, or no hand tags and nothing readable in the name.
      if (
        unusedOnly &&
        !rules[key]?.blocked &&
        (tags[key] || meaningsOf(emote.name).length > 0)
      ) {
        return false;
      }
      return needle === "" || key.includes(needle);
    });
  }, [emotes, query, tags, taggedOnly, unusedOnly, rules]);

  const active = selected
    ? emotes.find((emote) => emote.name.toLowerCase() === selected)
    : undefined;
  const activeTags = selected ? (tags[selected] ?? []) : [];
  const activeRule: EmoteRule = selected ? (rules[selected] ?? {}) : {};
  const activeNotFor = activeRule.notFor ?? [];
  const taggedCount = Object.keys(tags).length;
  /** What the name alone says, when nobody has tagged this emote by hand. */
  const guessed = active ? meaningsOf(active.name) : [];

  if (emotes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Emote meanings</span>
          {taggedCount > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {taggedCount} tagged
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Tell chat when to use an emote. Tag your wave emote as a greeting and
          it gets posted when someone says hi. Untagged emotes are read from
          their name — `KEKW` is laughter anywhere — and one whose name says
          nothing is never posted, rather than turning up in the wrong moment.
          Tags survive re-importing a pack.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search emotes"
              className="pl-8"
            />
          </div>
          <Button
            variant={taggedOnly ? "secondary" : "ghost"}
            onClick={() => setTaggedOnly((on) => !on)}
            disabled={taggedCount === 0}
          >
            Tagged only
          </Button>
          <Button
            variant={unusedOnly ? "secondary" : "ghost"}
            onClick={() => setUnusedOnly((on) => !on)}
            title="Emotes whose name means nothing to chat, so they are never posted"
          >
            Never used
          </Button>
        </div>

        {active && (
          <div className="space-y-2.5 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <img
                src={active.url}
                alt={active.name}
                className="h-8 w-auto"
              />
              <span className="text-sm font-medium">{active.name}</span>
              <Badge variant={activeTags.length > 0 ? "default" : "secondary"} className="shrink-0">
                {activeTags.length > 0 ? "Yours" : "Automatic"}
              </Badge>
              {activeTags.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => update(active.name, [])}
                >
                  Reset to automatic
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7 text-muted-foreground"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* What chat does with it today, so tagging is a correction
                rather than a guess about what is already understood. */}
            <p className="text-[11px] text-muted-foreground">
              {activeRule.blocked
                ? "Blocked — chat never posts this, whatever its tags say."
                : activeTags.length > 0
                  ? "Your tags decide when chat posts this."
                  : guessed.length > 0
                    ? `Read from the name: ${guessed.map((tag) => TAG_LABELS[tag]).join(", ")}.`
                    : "Nothing is known about this one, so chat never posts it. Tag it to put it in rotation."}
            </p>

            <Button
              variant={activeRule.blocked ? "destructive" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => updateRule(active.name, { ...activeRule, blocked: !activeRule.blocked })}
            >
              <Ban className="size-3.5" />
              {activeRule.blocked ? "Blocked — click to allow" : "Never use this emote"}
            </Button>

            <div className="flex flex-wrap gap-1.5">
              {EMOTE_TAGS.map((tag) => {
                const on = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update(
                        active.name,
                        on
                          ? activeTags.filter((value) => value !== tag)
                          : [...activeTags, tag],
                      )
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {TAG_LABELS[tag]}
                  </button>
                );
              })}
            </div>

            {!activeRule.blocked && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Never post it when the moment is… (e.g. KEKW, never after a
                  death: pick Sad)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EMOTE_TAGS.filter((tag) => tag !== "general").map((tag) => {
                    const on = activeNotFor.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          updateRule(active.name, {
                            ...activeRule,
                            notFor: on
                              ? activeNotFor.filter((value) => value !== tag)
                              : [...activeNotFor, tag],
                          })
                        }
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on
                            ? "border-destructive bg-destructive/10 text-destructive"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {on && <Ban className="size-3" />}
                        {TAG_LABELS[tag]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-2.5">
          {results.length === 0 && (
            <p className="w-full py-4 text-center text-sm text-muted-foreground">
              No emotes match “{query}”.
            </p>
          )}
          {results.slice(0, PAGE).map((emote) => {
            const key = emote.name.toLowerCase();
            return (
              <button
                key={emote.id}
                type="button"
                onClick={() => setSelected(key === selected ? null : key)}
                title={`${emote.name} · ${(tags[key] ?? []).map((tag) => TAG_LABELS[tag]).join(", ") || emote.mood}`}
                className={cn(
                  "relative rounded border p-1 transition-colors",
                  rules[key]?.blocked && "opacity-35 grayscale",
                  key === selected
                    ? "border-primary bg-primary/10"
                    : tags[key]
                      ? "border-primary/40"
                      : "border-transparent hover:border-border",
                )}
              >
                <img
                  src={emote.url}
                  alt={emote.name}
                  loading="lazy"
                  className="h-7 w-auto"
                />
              </button>
            );
          })}
          {results.length > PAGE && (
            <span className="self-center px-1 text-xs text-muted-foreground">
              +{results.length - PAGE} more — search to narrow it down
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
