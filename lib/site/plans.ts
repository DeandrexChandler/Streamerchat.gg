/**
 * Plans shown on /pricing. The owner edits this file; Track D fills in
 * `stripePriceId`. Ids match Track D's billing. There is no free tier (owner, 2026-11-09): only Pro. A `null` price renders as "Coming soon" — prices are an
 * open decision (docs/roadmap.md), so none are invented here.
 */
export type Plan = {
  id: string;
  name: string;
  price: string | null;
  blurb: string;
  features: string[];
  stripePriceId: string | null;
};

export const PLANS: Plan[] = [
  {
    id: "pro",
    name: "Pro",
    price: null,
    blurb: "Everything StreamerChat.gg does, on your stream. We run the AI, so there's no key and no setup.",
    features: [
      "The full simulator, every speed up to CHAOS",
      "Regulars who remember you between streams",
      "Your own 7TV emotes",
      "Screen watching and idle chatter",
      "OBS browser source",
    ],
    stripePriceId: null,
  },
];

export function priceLabel(plan: Pick<Plan, "price">): string {
  return plan.price ?? "Coming soon";
}

