/**
 * Plans shown on /pricing. The owner edits this file; Track D fills in
 * `stripePriceId`. Ids match Track D's billing (free/pro). A `null` price renders as "Coming soon" — prices are an
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
    id: "free",
    name: "Free",
    price: null,
    blurb: "Try it on your stream. No key and no setup; we cover the AI up to a monthly limit.",
    features: [
      "The full simulator",
      "Regulars who remember you between streams",
      "Screen reactions and idle chatter",
      "OBS browser source",
    ],
    stripePriceId: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: null,
    blurb: "For streaming with it every week. A much higher monthly limit.",
    features: ["Everything in Free", "A much higher monthly limit"],
    stripePriceId: null,
  },
];

export function priceLabel(plan: Pick<Plan, "price">): string {
  return plan.price ?? "Coming soon";
}

/** The comparison table on /pricing. `true` is a tick; a string is shown as is. */
export const COMPARISON: { label: string; free: true | string; pro: true | string }[] = [
  { label: "The full simulator, every speed", free: true, pro: true },
  { label: "Regulars who remember you", free: true, pro: true },
  { label: "Your own 7TV emotes", free: true, pro: true },
  { label: "Screen watching", free: true, pro: true },
  { label: "Idle chatter", free: true, pro: true },
  { label: "OBS browser source", free: true, pro: true },
  { label: "Monthly limit", free: "Standard", pro: "Much higher" },
];
