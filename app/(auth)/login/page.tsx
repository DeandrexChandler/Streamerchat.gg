import type { Metadata } from "next";
import { SignInCard } from "../sign-in-card";

export const metadata: Metadata = {
  title: "Log in · StreamerChat.gg",
  description: "Log in to StreamerChat.gg with Twitch.",
};

export default function LoginPage(props: { searchParams: Promise<{ from?: string; error?: string }> }) {
  return <SignInCard mode="login" searchParams={props.searchParams} />;
}
