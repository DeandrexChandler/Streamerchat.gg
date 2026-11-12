import { billingEnabled, getAccount } from "@/lib/billing/db";
import { stripe } from "@/lib/billing/stripe";
import { getUserId } from "@/lib/billing/user";

/** Form POST → 303 to the Stripe customer portal (change plan, cancel, invoices). */
export async function POST(request: Request) {
  if (!billingEnabled()) return Response.json({ error: "billing off" }, { status: 404 });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "sign in" }, { status: 401 });

  const { customer } = await getAccount(userId);
  if (!customer) return Response.json({ error: "no subscription" }, { status: 404 });

  const session = await stripe<{ url: string }>("billing_portal/sessions", {
    customer,
    return_url: `${new URL(request.url).origin}/account`,
  });
  return Response.redirect(session.url, 303);
}
