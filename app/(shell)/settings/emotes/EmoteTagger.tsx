"use client";

import { useCallback, useMemo, useState } from "react";
import { Ban, Check, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
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
import {
  EMOTE_ACTIONS,
  EMOTE_FEELINGS,
  EMOTE_TOPICS,
  type Emote,
  type EmoteMeaning,
  type EmoteTag,
} from "@/lib/engine/types";
import {
  customTagName,
  localCustomTagStore,
  MAX_CUSTOM_TAGS,
  type CustomTag,
} from "@/lib/config/custom-tags";
import { meaningsOf } from "@/lib/emotes/meaning";
import { localEmoteRuleStore, type EmoteRule, type EmoteRuleMap } from "@/lib/config/emote-rules";
import { cn } from "@/lib/utils";

/** Shown on the chips, because "question" alone reads ambiguously. */
const TAG_LABELS: Record<EmoteTag, string> = {
  happy: "Happy",
  love: "Love",
  hype: "Hype",
  laugh: "Laugh",
  shock: "Shock",
  scared: "Scared",
  relief: "Relief",
  sad: "Sad",
  comfort: "Comfort",
  angry: "Angry",
  frustrated: "Frustrated",
  disgust: "Disgust",
  cringe: "Cringe",
  confused: "Confused",
  sus: "Sus",
  aura: "Aura",
  respect: "Respect",
  chill: "Chill",
  crazy: "Crazy",
  troll: "Troll",
  cope: "Cope",
  idle: "Bored / AFK",
  greeting: "Greeting",
  farewell: "Goodbye",
  agreement: "Agreement",
  disagree: "Disagree",
  question: "Question",
  victory: "Win",
  spam: "Spam",
  watching: "Watching",
  dance: "Dance",
  money: "Money",
  food: "Food",
  freaky: "Freaky",
  general: "Anywhere",
};

/** A built-in tag's label, or a custom tag's own name. */
function labelOf(tag: EmoteMeaning): string {
  return TAG_LABELS[tag as EmoteTag] ?? tag;
}

/** Feelings first: every moment has one. */
const TAG_GROUPS: ReadonlyArray<readonly [string, readonly EmoteMeaning[]]> = [
  ["Feelings", EMOTE_FEELINGS],
  ["Chat", EMOTE_ACTIONS],
  ["Topics", EMOTE_TOPICS],
];

/** One row of toggle chips per group. */
function TagChips({
  custom,
  isOn,
  onToggle,
  barring = false,
}: {
  custom: readonly CustomTag[];
  isOn: (tag: EmoteMeaning) => boolean;
  onToggle: (tag: EmoteMeaning) => void;
  /** Marking where the emote must never go, rather than where it belongs. */
  barring?: boolean;
}) {
  const groups =
    custom.length > 0 ? [...TAG_GROUPS, ["Yours", custom.map((tag) => tag.name)] as const] : TAG_GROUPS;
  return (
    <div className="space-y-1.5">
      {groups.map(([label, group]) => (
        <div key={label} className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {group
            .filter((tag) => !(barring && tag === "general"))
            .map((tag) => {
              const on = isOn(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  title={custom.find((entry) => entry.name === tag)?.description}
                  onClick={() => onToggle(tag)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? barring
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && (barring ? <Ban className="size-3" /> : <Check className="size-3" />)}
                  {labelOf(tag)}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}

/**
 * Thumbnails per page. A channel pack can be 600 emotes: all at once is a
 * wall nobody tags from, and searching needs a name you already remember.
 */
const PAGE = 100;

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
  const [page, setPage] = useState(0);
  const [rules, setRules] = useState<EmoteRuleMap>(() => localEmoteRuleStore.load());
  const [custom, setCustom] = useState<CustomTag[]>(() => localCustomTagStore.load());
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const addCustom = useCallback(() => {
    const name = customTagName(draftName, custom);
    if (typeof name !== "string") return setDraftError(name.error);
    if (!draftDescription.trim()) return setDraftError("Say what it is for — that is what the AI reads.");
    const next = [...custom, { name, description: draftDescription.trim().slice(0, 120) }];
    localCustomTagStore.save(next);
    setCustom(next);
    setDraftName("");
    setDraftDescription("");
    setDraftError(null);
  }, [draftName, draftDescription, custom]);

  /**
   * Deleting a meaning takes it off every emote too. Left behind, an emote
   * whose only tag was this one would count as hand-tagged with nothing
   * chat can ask for, and quietly never be posted.
   */
  const removeCustom = useCallback((name: string) => {
    const next = custom.filter((tag) => tag.name !== name);
    localCustomTagStore.save(next);
    setCustom(next);
    setTags((current) => {
      const cleaned: Record<string, readonly EmoteMeaning[]> = {};
      for (const [emote, assigned] of Object.entries(current)) {
        const kept = assigned.filter((tag) => tag !== name);
        if (kept.length > 0) cleaned[emote] = kept;
      }
      localEmoteTagStore.save(cleaned);
      return cleaned;
    });
    setRules((current) => {
      const cleaned: Record<string, EmoteRule> = {};
      for (const [emote, rule] of Object.entries(current)) {
        const notFor = rule.notFor?.filter((tag) => tag !== name);
        if (rule.blocked || (notFor && notFor.length > 0)) cleaned[emote] = { ...rule, notFor };
      }
      localEmoteRuleStore.save(cleaned);
      return cleaned;
    });
  }, [custom]);

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

  const update = useCallback((name: string, next: readonly EmoteMeaning[]) => {
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

  const pages = Math.max(1, Math.ceil(results.length / PAGE));
  // A filter that shrinks the list can leave the page past its end.
  const shown = Math.min(page, pages - 1);

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
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search emotes"
              className="pl-8"
            />
          </div>
          <Button
            variant={taggedOnly ? "secondary" : "ghost"}
            onClick={() => {
              setTaggedOnly((on) => !on);
              setPage(0);
            }}
            disabled={taggedCount === 0}
          >
            Tagged only
          </Button>
          <Button
            variant={unusedOnly ? "secondary" : "ghost"}
            onClick={() => {
              setUnusedOnly((on) => !on);
              setPage(0);
            }}
            title="Emotes whose name means nothing to chat, so they are never posted"
          >
            Never used
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-medium">Your own meanings</p>
          <p className="text-[11px] text-muted-foreground">
            For moments only your chat has — a running joke, a friend, a
            thing that keeps happening. The AI reads the description and asks
            for it when a line is about that; tag the emotes that fit.
          </p>
          {custom.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {custom.map((tag) => (
                <span
                  key={tag.name}
                  title={tag.description}
                  className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs"
                >
                  {tag.name}
                  <span className="max-w-48 truncate text-muted-foreground">— {tag.description}</span>
                  <button
                    type="button"
                    onClick={() => removeCustom(tag.name)}
                    aria-label={`Delete ${tag.name}`}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {custom.length < MAX_CUSTOM_TAGS && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addCustom();
              }}
            >
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="name, e.g. bald"
                maxLength={24}
                aria-label="New meaning name"
                className="h-8 w-36"
              />
              <Input
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="what it's for, e.g. anything about the streamer's bald head"
                maxLength={120}
                aria-label="What the new meaning is for"
                className="h-8 min-w-48 flex-1"
              />
              <Button type="submit" size="sm" variant="outline" className="h-8">
                <Plus className="size-3.5" />
                Add
              </Button>
            </form>
          )}
          {draftError && <p className="text-[11px] text-destructive">{draftError}</p>}
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
                  onClick={() => {
                    // Done with this one: back to the grid.
                    update(active.name, []);
                    setSelected(null);
                  }}
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
                    ? `Read from the name: ${guessed.map(labelOf).join(", ")}.`
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

            <TagChips
              custom={custom}
              isOn={(tag) => activeTags.includes(tag)}
              onToggle={(tag) =>
                update(
                  active.name,
                  activeTags.includes(tag)
                    ? activeTags.filter((value) => value !== tag)
                    : [...activeTags, tag],
                )
              }
            />

            {!activeRule.blocked && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Never post it when the moment is… (e.g. KEKW, never after a
                  death: pick Sad)
                </p>
                <TagChips
                  custom={custom}
                  barring
                  isOn={(tag) => activeNotFor.includes(tag)}
                  onToggle={(tag) =>
                    updateRule(active.name, {
                      ...activeRule,
                      notFor: activeNotFor.includes(tag)
                        ? activeNotFor.filter((value) => value !== tag)
                        : [...activeNotFor, tag],
                    })
                  }
                />
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
          {results.slice(shown * PAGE, (shown + 1) * PAGE).map((emote) => {
            const key = emote.name.toLowerCase();
            return (
              <button
                key={emote.id}
                type="button"
                onClick={() => setSelected(key === selected ? null : key)}
                title={`${emote.name} · ${(tags[key] ?? []).map(labelOf).join(", ") || emote.mood}`}
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
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              {shown * PAGE + 1}–{Math.min(results.length, (shown + 1) * PAGE)} of {results.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={shown === 0}
                onClick={() => setPage(shown - 1)}
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <span className="tabular-nums">
                {shown + 1} / {pages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={shown >= pages - 1}
                onClick={() => setPage(shown + 1)}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
