import { NextRequest, NextResponse } from "next/server";

/**
 * Whisper transcription — the *fallback* path.
 *
 * The default transcription provider is the browser's Web Speech API (free,
 * streaming, no server round-trip). This route exists for browsers without it
 * and for users who explicitly opt into higher accuracy.
 *
 * Deliberately calls the REST endpoint with fetch rather than pulling in the
 * `openai` SDK — this is one multipart POST and the SDK is a large dependency
 * for it.
 */

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI's own per-file limit.
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

// Crude per-process rate limit. This endpoint spends money, so it must never be
// an open relay. A single user needs a handful of calls per minute at most.
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 20 };
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT.windowMs,
  );
  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing without bound across long sessions.
  if (hits.size > 512) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(k);
    }
  }
  return recent.length > RATE_LIMIT.maxRequests;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Whisper fallback is not configured on this server." },
      { status: 503 },
    );
  }

  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(client)) {
    return NextResponse.json(
      { error: "Too many transcription requests." },
      { status: 429 },
    );
  }

  let audio: File | null = null;
  try {
    const formData = await request.formData();
    const field = formData.get("audio");
    if (field instanceof File) audio = field;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!audio) {
    return NextResponse.json({ error: "No audio provided." }, { status: 400 });
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Audio must be between 1 byte and 25MB." },
      { status: 413 },
    );
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "audio.webm");
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "json");

  try {
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      // Never forward the upstream body — it can echo request details.
      console.error("Whisper API error:", res.status, await res.text());
      return NextResponse.json(
        { error: "Transcription failed." },
        { status: 502 },
      );
    }

    const { text } = (await res.json()) as { text?: string };
    return NextResponse.json({ text: text?.trim() ?? "" });
  } catch (error) {
    console.error("Transcription request failed:", error);
    return NextResponse.json(
      { error: "Transcription failed." },
      { status: 502 },
    );
  }
}
