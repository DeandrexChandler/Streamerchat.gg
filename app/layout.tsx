import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streamer Chat AI",
  description: "AI-powered chat assistant for streamers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
