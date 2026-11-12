import { NextResponse, type NextRequest } from "next/server";
import { authEnabled } from "@/lib/account/auth";
import { gateFor } from "@/lib/account/gate";
import { getUserId } from "@/lib/account/user";

/**
 * The sign-in gate. Local mode (no auth variables) lets everything through.
 *
 * An API refusal is the same body the chat route sends for any failure, so
 * the simulator goes quiet instead of showing an error.
 */
export async function proxy(request: NextRequest) {
  if (!authEnabled) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const gate = gateFor(pathname);
  if (gate === "open" || (await getUserId(request))) return NextResponse.next();
  if (gate === "api") return NextResponse.json({ status: "unavailable" }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("from", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Static files never need a user.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
