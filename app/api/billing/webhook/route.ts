import { saveAccount } from "@/lib/billing/db";
import { planForPrice } from "@/lib/billing/plans";
import { stripe, verifySignature } from "@/lib/billing/stripe";

interface Subscription {
  id: string;
  status: string;
  customer: string;
  metadata: { userId?: string };
  items: { data: { price: { id: string } }[] };
}

/**
 * Stripe events. Nothing in the body is trusted until the signature checks
 * out, and even then the subscription is re-read from Stripe, so events
 * arriving out of order can't leave a stale status behind.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "billing off" }, { status: 404 });

  const body = await request.text();
  if (!verifySignature(body, request.headers.get("stripe-signature"), secret)) {
    return Response.json({ error: "bad signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as { type: string; data: { object: { id: string } } };
  if (event.type.startsWith("customer.subscription.")) {
    const sub = await stripe<Subscription>(`subscriptions/${event.data.object.id}`);
    const userId = sub.metadata.userId;
    if (userId) {
      await saveAccount(userId, {
        plan: planForPrice(sub.items.data[0]?.price.id),
        status: sub.status,
        customer: sub.customer,
      });
    }
  }
  return Response.json({ received: true });
}
