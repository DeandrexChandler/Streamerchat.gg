/**
 * Plans shown on /pricing. The owner edits this file; Track D fills in
 * `stripePriceId`. A `null` price renders as "Coming soon" — prices are an
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
    id: "own-key",
    name: "Bring your own key",
    price: null,
    blurb: "Run it with your own Gemini key. You pay Google for what chat uses.",
    features: [
      "The full simulator",
      "Regulars who remember you between streams",
      "Screen reactions and idle chatter",
      "OBS browser source",
    ],
    stripePriceId: null,
  },
  {
    id: "hosted",
    name: "Hosted",
    price: null,
    blurb: "Sign in and stream. No key, no setup, the AI is on us.",
    features: [
      "Everything in Bring your own key",
      "No Gemini account needed",
      "Works from any computer you sign in on",
    ],
    stripePriceId: null,
  },
];

export function priceLabel(plan: Pick<Plan, "price">): string {
  return plan.price ?? "Coming soon";
}
