import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, authEnabled, signOut } from "@/lib/account/auth";

export const metadata: Metadata = {
  title: "Account · StreamerChat.gg",
  description: "Your StreamerChat.gg account.",
};

export default async function AccountPage() {
  if (!authEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Running locally</CardTitle>
          <CardDescription>There are no accounts on this machine.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/simulator" className={buttonVariants({ className: "w-full" })}>
            Open the simulator
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // The proxy already sent signed-out visitors to /login; this covers a
  // session that expired between the two.
  const session = await auth();
  if (!session?.user) redirect("/login?from=/account");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Signed in with Twitch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {session.user.name && <p className="font-medium">{session.user.name}</p>}
        <p className="text-muted-foreground">{session.user.email ?? "No email shared by Twitch"}</p>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Link href="/simulator" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
          Simulator
        </Link>
        <form
          className="flex-1"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
