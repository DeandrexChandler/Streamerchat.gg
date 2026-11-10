import NextAuth from "next-auth";
import Twitch from "next-auth/providers/twitch";
import { isAllowed } from "./allowlist";

/**
 * Sign in with Twitch, sessions in an encrypted JWT cookie: no database.
 *
 * Local mode is these variables being absent. Then nothing is gated and
 * nobody ever sees a login (see proxy.ts).
 */
export const authEnabled = Boolean(
  process.env.AUTH_SECRET && process.env.AUTH_TWITCH_ID && process.env.AUTH_TWITCH_SECRET,
);

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [Twitch],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // ponytail: checked at sign-in only; removing a name doesn't end a live
    // session (30 days). Rotate AUTH_SECRET to sign everyone out.
    signIn: ({ profile }) => isAllowed(profile?.preferred_username),
  },
});
