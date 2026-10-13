import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { CaptureStatus } from "@/components/capture-status";
import { Nav } from "@/components/nav";
import { ThemeSwitch } from "@/components/theme-switch";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Stand-ups",
  description: "Daily and weekly stand-up updates drafted from your Google Chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets the "dark" class before React hydrates, hence suppressHydrationWarning.
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
              <span className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="size-2.5 rounded-[3px] bg-primary" aria-hidden />
                Stand-ups
              </span>
              <Nav />
              <div className="ml-auto flex items-center gap-4">
                <CaptureStatus />
                <ThemeSwitch />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
