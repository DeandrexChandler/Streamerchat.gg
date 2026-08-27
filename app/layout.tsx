import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Geist } from "next/font/google";

/**
 * Geist is made available as `--font-sans` but is deliberately NOT applied at
 * the root. The simulator renders inside this tree and its typography is part
 * of what goes on stream, so dashboard chrome opts in with `font-sans` rather
 * than the chat being changed out from under it.
 */
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "StreamerChat.gg",
  description: "A simulated live chat for streamers with quiet chats.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `dark` class here on purpose. The app chrome is light, which is what
    // gives the dark #18181b chat column its edges — forcing dark mode made
    // the chat background and the page background nearly identical and the
    // chat pane visually bled across the whole screen.
    <html lang="en" className={geist.variable}>
      <body>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
