import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../app/api/ai-status/route";
import { KEY_ENV } from "../config";

/**
 * The setup check.
 *
 * Mid-stream a failed batch is silent on purpose, which means the first run
 * cannot tell "nobody has spoken yet" from "this was never going to work".
 * This is the one place that answers it — so what it reports, and what it
 * refuses to report, both matter.
 */

const request = (ip = "1.2.3.4") =>
  new Request("http://localhost/api/ai-status", { headers: { "x-forwarded-for": ip } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the AI key check", () => {
  it("says the key is missing without going near the network", async () => {
    vi.stubEnv(KEY_ENV, "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const body = (await (await GET(request("10.0.0.1"))).json()) as { state: string };
    expect(body.state).toBe("missing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a working key", async () => {
    vi.stubEnv(KEY_ENV, "a-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as Response));

    const body = (await (await GET(request("10.0.0.2"))).json()) as { state: string };
    expect(body.state).toBe("ok");
  });

  it("calls a rejected key rejected, not merely unreachable", async () => {
    // 403 is a bad key and 404 is a key that cannot see the model. Both need
    // the same thing from the streamer, and neither is a network blip.
    for (const status of [400, 403, 404]) {
      vi.stubEnv(KEY_ENV, "a-key");
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status }) as Response));
      const body = (await (await GET(request(`10.0.1.${status}`))).json()) as { state: string };
      expect(body.state).toBe("rejected");
    }
  });

  it("treats a provider outage as unreachable rather than a bad key", async () => {
    vi.stubEnv(KEY_ENV, "a-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));

    const body = (await (await GET(request("10.0.0.3"))).json()) as { state: string };
    expect(body.state).toBe("unreachable");
  });

  it("never returns the key itself", async () => {
    vi.stubEnv(KEY_ENV, "super-secret-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as Response));

    const text = await (await GET(request("10.0.0.4"))).text();
    expect(text).not.toContain("super-secret-key");
  });
});
