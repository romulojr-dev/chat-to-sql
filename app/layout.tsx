import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DotPattern } from "@/components/ui/dot-pattern";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SiyasatQL",
  description: "Ask questions in plain English, get suggested read-only SQL.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <div aria-hidden="true" className="fixed inset-0 -z-10">
          <DotPattern className="fill-neutral-300/70 dark:fill-neutral-400/70 [mask-image:radial-gradient(circle_min(45vw,420px)_at_50%_40%,white,transparent)]" />
        </div>
        {children}
      </body>
    </html>
  );
}
