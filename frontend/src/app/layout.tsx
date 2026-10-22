import type { Metadata, Viewport } from "next";
import { Literata, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/lib/session";

// UI type, and a serif built for long reading for summaries, notes and answers
const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui" });
const reading = Literata({ subsets: ["latin"], variable: "--font-reading" });

export const metadata: Metadata = {
  title: { default: "VNotes", template: "%s · VNotes" },
  description: "Turn a YouTube video into a summary, study notes and a quiz, and ask questions about it.",
};

export const viewport: Viewport = {
  themeColor: "#1f5f4f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${reading.variable}`}>
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
