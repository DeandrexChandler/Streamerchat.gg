import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

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
    <html lang="en">
      <body>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
