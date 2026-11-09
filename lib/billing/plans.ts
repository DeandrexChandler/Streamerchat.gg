/**
 * Local copy of `lib/site/plans.ts` (Track A) until it merges; then this
 * file re-exports from there and keeps only the limits.
 *
 * Names, prices and limits are the owner's call (roadmap: Open decisions).
 * The limits below are placeholders sized from `npm run simulate`, which
 * makes about 5 batches a minute at the default tier, so 300 is roughly an
 * hour of streaming.
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
  { id: "free", name: "Free", price: null, blurb: "", features: [], stripePriceId: null },
  { id: "pro", name: "Pro", price: null, blurb: "", features: [], stripePriceId: null },
];

/** Batches per calendar month. Anyone without an active subscription is on free. */
export const BATCHES_PER_MONTH: Record<string, number> = { free: 300, pro: 6000 };

export function planForPrice(priceId: string | undefined): string {
  return plans.find((p) => p.stripePriceId && p.stripePriceId === priceId)?.id ?? "free";
}

export function limitFor(account: { plan?: string; status?: string }): number {
  const paying = account.status === "active" || account.status === "trialing";
  return BATCHES_PER_MONTH[paying ? (account.plan ?? "free") : "free"] ?? BATCHES_PER_MONTH.free;
}
