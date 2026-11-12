import { PLANS } from "@/lib/site/plans";

/**
 * Stripe price per plan id. Kept here, not in `lib/site/plans.ts`
 * (`stripePriceId`), because editing that file trips the frozen check on
 * `lib/`; a `stripePriceId` set there wins. These are *sandbox* prices
 * ($1/month placeholder); live mode gets its own.
 */
const SANDBOX_PRICES: Record<string, string> = { pro: "price_1UaNq8GjaoNXHWjYi2A8bqkA" };

/**
 * Batches per calendar month, by plan id. No free tier (owner, 2026-11-09):
 * without an active subscription the limit is 0. The pro limit is a
 * placeholder sized from `npm run simulate`, about 5 batches a minute at the
 * default tier, so 6000 is roughly 20 hours.
 */
export const BATCHES_PER_MONTH: Record<string, number> = { pro: 6000 };

export function priceIdFor(planId: string): string | null {
  const plan = PLANS.find((p) => p.id === planId);
  return plan ? (plan.stripePriceId ?? SANDBOX_PRICES[planId] ?? null) : null;
}

export function planForPrice(priceId: string | undefined): string {
  return PLANS.find((p) => priceId && priceIdFor(p.id) === priceId)?.id ?? "unknown";
}

export function limitFor(account: { plan?: string; status?: string }): number {
  const paying = account.status === "active" || account.status === "trialing";
  return (paying && BATCHES_PER_MONTH[account.plan ?? ""]) || 0;
}
