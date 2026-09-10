"use client";

import type { SimulationSettings } from "@/lib/config/settings";
import { useStoredSettings } from "@/lib/react/use-stored-settings";
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

/**
 * Chat behaviour settings.
 *
 * Everything here is set once and left alone. The controls you actually reach
 * for mid-sentence — speed, emotes, idle — stay on the simulator.
 *
 * Loading and persistence live in useStoredSettings, shared with the settings
 * pages still to come.
 */
export default function ChatSettingsPage() {
  const { settings, update } = useStoredSettings();

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Your stream</CardTitle>
          <CardDescription>
            Chat will occasionally use these. Leave them blank and it simply
            never mentions them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            id="streamer-name"
            label="Your name"
            hint="What chat calls you — a display name, not a login."
          >
            <Input
              id="streamer-name"
              maxLength={40}
              value={settings.streamerName}
              placeholder="e.g. dre"
              onChange={(e) => update({ streamerName: e.target.value })}
            />
          </Field>

          <Separator />

          <Field
            id="stream-topic"
            label="What you're doing"
            hint="A game or activity. Chat references it now and then."
          >
            <Input
              id="stream-topic"
              maxLength={80}
              value={settings.streamTopic}
              placeholder="e.g. minecraft"
              onChange={(e) => update({ streamTopic: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <label
            htmlFor="timestamps"
            className="flex cursor-pointer items-start justify-between gap-4"
          >
            <span className="space-y-1">
              <span className="block text-sm font-medium">Show timestamps</span>
              <span className="block text-xs text-muted-foreground">
                Off by default — most streamers don&apos;t put clocks on chat.
              </span>
            </span>
            <input
              id="timestamps"
              type="checkbox"
              checked={settings.showTimestamps}
              onChange={(e) => update({ showTimestamps: e.target.checked })}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtering</CardTitle>
          <CardDescription>
            This output goes on a live broadcast. Slurs are dropped in every
            mode, including &ldquo;allow swearing&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            id="profanity-mode"
            label="Language"
            hint="What to do when a message contains a swear word."
          >
            <select
              id="profanity-mode"
              value={settings.profanityMode}
              onChange={(e) =>
                update({
                  profanityMode: e.target
                    .value as SimulationSettings["profanityMode"],
                })
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="replace">Censor swearing</option>
              <option value="filter">Drop those messages</option>
              <option value="off">Allow swearing</option>
            </select>
          </Field>

          <Separator />

          <Field
            id="blocked-words"
            label="Never show these words"
            hint="Comma separated. Applied on top of the built-in filter."
          >
            <Input
              id="blocked-words"
              value={settings.blockedWords.join(", ")}
              placeholder="word, another"
              onChange={(e) => update({ blockedWords: toList(e.target.value) })}
            />
          </Field>

          <Separator />

          <Field
            id="allowed-words"
            label="Always allow these words"
            hint="Comma separated. Exempts a word the built-in filter catches by mistake."
          >
            <Input
              id="allowed-words"
              value={settings.allowedWords.join(", ")}
              placeholder="word, another"
              onChange={(e) => update({ allowedWords: toList(e.target.value) })}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-start sm:gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Splits a comma-separated field into a word list.
 *
 * Empty entries are dropped so a trailing comma while typing doesn't persist
 * a blank word, which would match everything downstream.
 */
function toList(raw: string): string[] {
  return raw
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}
