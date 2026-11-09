import type { Metadata } from "next";
import { SignInCard } from "../sign-in-card";

export const metadata: Metadata = {
  title: "Sign up · StreamerChat.gg",
  description: "Create a StreamerChat.gg account with Twitch.",
};

export default function SignupPage(props: { searchParams: Promise<{ from?: string; error?: string }> }) {
  return <SignInCard mode="signup" searchParams={props.searchParams} />;
}
