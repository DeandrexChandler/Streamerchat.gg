/**
 * Upstash Redis (Vercel Marketplace) over its REST API: plain fetch, no
 * client library. Holds plan, subscription status and usage. Settings stay
 * in the browser; nothing from `lib/config` lives here.
 *
 * Schema:
 *   user:{userId}            hash   plan, status, customer (Stripe customer id)
 *   usage:{userId}:{YYYY-MM} int    batches this calendar month (UTC), expires
 */

/** Billing is on when Stripe is configured. Otherwise local mode: unlimited, no database. */
export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function redis(...commands: (string | number)[][]): Promise<unknown[]> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN not set");
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => {
    if (r.error) throw new Error(`redis: ${r.error}`);
    return r.result;
  });
}

export interface Account {
  plan?: string;
  status?: string;
  customer?: string;
}

export async function getAccount(userId: string): Promise<Account> {
  const [flat] = (await redis(["HGETALL", `user:${userId}`])) as [string[] | null];
  const account: Record<string, string> = {};
  for (let i = 0; i + 1 < (flat?.length ?? 0); i += 2) account[flat![i]] = flat![i + 1];
  return account;
}

export async function saveAccount(userId: string, account: Required<Account>): Promise<void> {
  await redis(["HSET", `user:${userId}`, "plan", account.plan, "status", account.status, "customer", account.customer]);
}

export function usageKey(userId: string, now: Date): string {
  return `usage:${userId}:${now.toISOString().slice(0, 7)}`;
}
