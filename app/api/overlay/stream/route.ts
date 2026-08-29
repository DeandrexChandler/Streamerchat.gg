import { overlayHub, type OverlayFrame } from "@/lib/overlay/hub";
import { OVERLAY_KEY_PATTERN } from "@/lib/overlay/protocol";

/**
 * Relay -> OBS. A long-lived Server-Sent Events stream, one per browser
 * source.
 *
 * SSE rather than WebSockets because the traffic is strictly one-directional
 * and `EventSource` reconnects on its own — an OBS source set to "shut down
 * when not visible" reappears on a scene switch and re-attaches with no code
 * from us. Node's default runtime streams fine; this needs no edge runtime.
 */

export const dynamic = "force-dynamic";

/**
 * Comment frames keep the connection warm. Without them an idle stream can be
 * closed by an intermediary during a quiet stretch, and a write to a dead
 * socket is also how we discover a browser source that vanished without
 * aborting cleanly.
 */
const HEARTBEAT_MS = 15_000;

function frameToBytes(encoder: TextEncoder, frame: OverlayFrame): Uint8Array {
  return encoder.encode(`event: ${frame.event}\ndata: ${frame.data}\n\n`);
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!OVERLAY_KEY_PATTERN.test(key)) {
    return new Response("Missing or malformed overlay key.", { status: 400 });
  }

  const hub = overlayHub();

  // Refuse before the stream opens. An errored stream after a 200 is
  // indistinguishable from a dropped connection, and EventSource would retry
  // it every second forever.
  if (!hub.canSubscribe(key)) {
    return new Response("Too many overlay connections.", { status: 503 });
  }

  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (bytes: Uint8Array) => {
        // Throws once the client is gone; the hub treats that as a signal to
        // drop this listener.
        controller.enqueue(bytes);
      };

      unsubscribe = hub.subscribe(key, (frame) => {
        send(frameToBytes(encoder, frame));
      });

      if (!unsubscribe) {
        // Lost a race with another source attaching between the check above
        // and here. Close cleanly rather than erroring; EventSource retries.
        controller.close();
        return;
      }

      // Tell EventSource to come back quickly. The default is 3s and a
      // browser source blinking out for three seconds mid-stream is visible.
      send(encoder.encode("retry: 1000\n\n"));
      send(encoder.encode(": connected\n\n"));

      heartbeat = setInterval(() => {
        try {
          send(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      // Abort fires when OBS hides the source or the tab closes.
      request.signal.addEventListener("abort", cleanup, { once: true });
    },

    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    unsubscribe?.();
    unsubscribe = null;
  }

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform matters as much as no-cache: a compressing proxy will
      // happily buffer an event stream into uselessness.
      "cache-control": "no-cache, no-store, no-transform",
      connection: "keep-alive",
      // Nginx-family proxies buffer responses by default; this opts out.
      "x-accel-buffering": "no",
    },
  });
}
