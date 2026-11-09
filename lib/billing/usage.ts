import { billingEnabled, getAccount, redis, usageKey } from "./db";
import { limitFor } from "./plans";

const USAGE_TTL_S = 40 * 24 * 3600;

/**
 * Counts one /api/chat-candidates request (one batch) against the user's
 * month and says whether it is within their plan. Local mode is unlimited.
 *
 * Fails closed: if the database is unreachable the batch is refused, because
 * the thing being guarded is the owner's API spend. The refusal is silent in
 * the simulator like any other.
 */
// ponytail: counts batches, not cost; meter tokens if batch cost varies
export async function recordAndCheck(userId: string, now = new Date()): Promise<boolean> {
  if (!billingEnabled()) return true;
  const key = usageKey(userId, now);
  try {
    const [count, , plan, status] = await redis(
      ["INCR", key],
      ["EXPIRE", key, USAGE_TTL_S],
      ["HGET", `user:${userId}`, "plan"],
      ["HGET", `user:${userId}`, "status"],
    );
    return Number(count) <= limitFor({ plan: (plan as string) ?? undefined, status: (status as string) ?? undefined });
  } catch (err) {
    console.error("[billing] usage check failed, refusing batch:", err);
    return false;
  }
}

/** Plan and this month's usage, for the account page and dashboard. */
export async function usageFor(userId: string, now = new Date()) {
  const [account, [used]] = await Promise.all([getAccount(userId), redis(["GET", usageKey(userId, now)])]);
  return {
    plan: account.status === "active" || account.status === "trialing" ? (account.plan ?? "free") : "free",
    status: account.status ?? null,
    used: Number(used ?? 0),
    limit: limitFor(account),
  };
}
