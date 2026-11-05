import { GeistMono } from "geist/font/mono";
import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { CommandPalette } from "@/components/entity/command-palette";
import { Providers } from "@/components/shell/providers";
import { TopBar } from "@/components/shell/top-bar";
import { serverPrefs } from "@/lib/server-prefs";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "HealthPolicy Simulator",
  description: "Transparent multi-agent simulation of Austrian health-policy negotiations.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { lang, level } = await serverPrefs();
  return (
    <html
      lang={lang}
      data-level={level}
      className={cn(inter.variable, GeistMono.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background">
        <Providers lang={lang} level={level}>
          <TopBar />
          <CommandPalette showTrigger={false} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
