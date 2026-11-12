import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, authEnabled, signIn } from "@/lib/account/auth";
import { safeReturnPath } from "@/lib/account/gate";

/**
 * Log in and sign up are the same Twitch round trip; only the words differ.
 * A first sign-in is the sign-up.
 */
export async function SignInCard({
  mode,
  searchParams,
}: {
  mode: "login" | "signup";
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  const to = safeReturnPath(from);

  if (!authEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Running locally</CardTitle>
          <CardDescription>No sign-in needed on this machine.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/simulator" className={buttonVariants({ className: "w-full" })}>
            Open the simulator
          </Link>
        </CardFooter>
      </Card>
    );
  }

  if (await auth()) redirect(to);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "login" ? "Log in" : "Create your account"}</CardTitle>
        <CardDescription>
          {mode === "login"
            ? "Welcome back. Your chat is waiting."
            : "Sign up with the Twitch account you stream from."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error === "AccessDenied"
              ? "This Twitch account isn’t on the list yet."
              : "That didn’t work. Try again."}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("twitch", { redirectTo: to });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Twitch
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {mode === "login" ? (
          <span>
            New here? <Link href={`/signup?from=${encodeURIComponent(to)}`} className="underline">Sign up</Link>
          </span>
        ) : (
          <span>
            Already have an account? <Link href={`/login?from=${encodeURIComponent(to)}`} className="underline">Log in</Link>
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
