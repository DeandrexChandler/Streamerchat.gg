import { PLANS } from "@/lib/site/plans";

/** What the dashboard's account panel says, from `GET /api/billing/me`. */
export interface AccountSummary {
  plan: string;
  usage: string;
  /** Has a Stripe customer to manage, or still needs to pick a plan. */
  action: "portal" | "pricing";
}

/** Null hides the panel: billing off (localhost), signed out, or a body we don't recognise. */
export function accountSummary(me: unknown): AccountSummary | null {
  if (typeof me !== "object" || me === null) return null;
  const m = me as { billing?: unknown; plan?: unknown; status?: unknown; used?: unknown; limit?: unknown };
  if (m.billing !== true || typeof m.used !== "number" || typeof m.limit !== "number") return null;

  const planId = typeof m.plan === "string" ? m.plan : null;
  const plan = planId ? (PLANS.find((p) => p.id === planId)?.name ?? planId) : "No plan";
  // A limit of 0 means no active subscription: the proxy refuses every batch.
  const usage =
    m.limit === 0
      ? "Chat stays quiet until you pick a plan."
      : `${m.used.toLocaleString("en-US")} of ${m.limit.toLocaleString("en-US")} batches used this month${m.used >= m.limit ? ". Limit reached." : "."}`;

  return { plan, usage, action: typeof m.status === "string" ? "portal" : "pricing" };
}
