"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { localRosterStore, type SavedViewer } from "@/lib/config/roster-store";
import { PERSONALITIES } from "@/lib/data/personalities";
import { describeVoice } from "@/lib/data/voices";
import type { PersonalityId } from "@/lib/engine/types";

/**
 * The regulars, as the model is told about them.
 *
 * Read-only on purpose. This exists so the streamer can see who chat thinks
 * these people are and what they remember — the two things that decide how
 * a slow session reads — without a character editor being built before
 * anyone knows what they would want to edit.
 */
export default function RegularsSettingsPage() {
  const [roster, setRoster] = useState<SavedViewer[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Storage cannot be read during render without desyncing server and
    // client markup, the same trade as every other settings page here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoster(localRosterStore.load());
    setLoaded(true);
  }, []);

  const forget = () => {
    localRosterStore.clear();
    setRoster([]);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Your regulars</CardTitle>
          <CardDescription>
            At the two slowest chat speeds these people are written by name,
            in their own voice, and they remember your stream between
            sessions. Faster speeds use a crowd instead, and none of this is
            sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loaded ? null : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody yet. Run a session at 0.2 or 0.5 messages a second and the
              room will fill in here.
            </p>
          ) : (
            roster.map((viewer) => (
              <div key={viewer.id} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: viewer.color }}>
                    {viewer.name}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {PERSONALITIES[viewer.personality as PersonalityId]?.label ??
                      viewer.personality}
                  </Badge>
                </div>

                {viewer.voice && (
                  <p className="text-xs text-muted-foreground">
                    {describeVoice(viewer.voice)}
                  </p>
                )}

                {viewer.memory.topics.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Been on about: </span>
                    {viewer.memory.topics.join(", ")}
                  </p>
                )}

                {viewer.memory.lines.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Last said: </span>
                    {viewer.memory.lines.map((line) => `"${line}"`).join(", ")}
                  </p>
                )}

                {viewer.memory.addressed.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">You said to them: </span>
                    {viewer.memory.addressed.map((line) => `"${line}"`).join(", ")}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {roster.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Start over</CardTitle>
            <CardDescription>
              Forgets these people entirely. The next session builds a new room
              with new names, and nothing from this one comes back.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={forget}>
              Forget my regulars
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
