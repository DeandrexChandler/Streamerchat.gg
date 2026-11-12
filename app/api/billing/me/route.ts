import { billingEnabled } from "@/lib/billing/db";
import { usageFor } from "@/lib/billing/usage";
import { getUserId } from "@/lib/billing/user";

export const dynamic = "force-dynamic";

/** Plan and this month's batches, for /account and the dashboard. `{billing: false}` locally. */
export async function GET(request: Request) {
  if (!billingEnabled()) return Response.json({ billing: false });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "sign in" }, { status: 401 });
  return Response.json({ billing: true, ...(await usageFor(userId)) });
}
