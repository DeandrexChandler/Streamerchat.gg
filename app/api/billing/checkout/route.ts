import { billingEnabled, getAccount } from "@/lib/billing/db";
import { plans } from "@/lib/billing/plans";
import { stripe } from "@/lib/billing/stripe";
import { getUserId } from "@/lib/billing/user";

/** Form POST `plan=<id>` → 303 to Stripe Checkout. */
export async function POST(request: Request) {
  if (!billingEnabled()) return Response.json({ error: "billing off" }, { status: 404 });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "sign in" }, { status: 401 });

  const planId = (await request.formData()).get("plan");
  const plan = plans.find((p) => p.id === planId && p.stripePriceId);
  if (!plan) return Response.json({ error: "unknown plan" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const { customer } = await getAccount(userId);
  const session = await stripe<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": plan.stripePriceId!,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "subscription_data[metadata][userId]": userId,
    ...(customer ? { customer } : {}),
    success_url: `${origin}/account?checkout=done`,
    cancel_url: `${origin}/pricing`,
  });
  return Response.redirect(session.url, 303);
}
