import { NextResponse, type NextRequest } from "next/server";
import { authEnabled } from "@/lib/account/auth";
import { gateFor } from "@/lib/account/gate";
import { getUserId } from "@/lib/account/user";
import { recordAndCheck } from "@/lib/billing/usage";

/**
 * The sign-in gate. Local mode (no auth variables) lets everything through.
 *
 * An API refusal is the same body the chat route sends for any failure, so
 * the simulator goes quiet instead of showing an error. That includes a user
 * past their plan's batches (429).
 */
export async function proxy(request: NextRequest) {
  if (!authEnabled) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  // Stripe can't sign in; the webhook verifies Stripe's signature itself.
  if (pathname === "/api/billing/webhook") return NextResponse.next();
  const gate = gateFor(pathname);
  if (gate === "open") return NextResponse.next();
  const userId = await getUserId(request);
  if (userId) {
    if (pathname === "/api/chat-candidates" && !(await recordAndCheck(userId))) {
      return NextResponse.json({ status: "unavailable" }, { status: 429 });
    }
    return NextResponse.next();
  }
  if (gate === "api") return NextResponse.json({ status: "unavailable" }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("from", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Static files never need a user.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
