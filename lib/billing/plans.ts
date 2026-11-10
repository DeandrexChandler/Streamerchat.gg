/**
 * Local copy of `lib/site/plans.ts` (Track A) until it merges; then this
 * file re-exports from there and keeps only the limits.
 *
 * Names, prices and limits are the owner's call (roadmap: Open decisions).
 * No free tier (owner, 2026-11-09): without an active subscription the
 * limit is 0. The pro limit is a placeholder sized from `npm run simulate`,
 * about 5 batches a minute at the default tier, so 6000 is roughly 20 hours.
 */
export interface Plan {
  id: string;
  name: string;
  price: string | null;
  blurb: string;
  features: string[];
  stripePriceId: string | null;
}

export const plans: Plan[] = [
  { id: "pro", name: "Pro", price: null, blurb: "", features: [], stripePriceId: null },
];

/** Batches per calendar month, by plan id. No active subscription means 0. */
export const BATCHES_PER_MONTH: Record<string, number> = { pro: 6000 };

export function planForPrice(priceId: string | undefined): string {
  return plans.find((p) => p.stripePriceId && p.stripePriceId === priceId)?.id ?? "unknown";
}

export function limitFor(account: { plan?: string; status?: string }): number {
  const paying = account.status === "active" || account.status === "trialing";
  return (paying && BATCHES_PER_MONTH[account.plan ?? ""]) || 0;
}
