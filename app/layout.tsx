import type { Metadata, Viewport } from "next";
import { Syne, Manrope, Fira_Code } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import WrongNetworkBar from "@/components/botchain/WrongNetworkBar";
import PageShell from "@/components/layout/PageShell";
import { app } from "@/lib/app-config";
import "./globals.css";

const syneFont = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["700", "800"],
});

const manropeFont = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const firaCodeFont = Fira_Code({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: {
    title: `${app.name} — ${app.tagline}`,
    description: app.tagline,
    type: "website",
    url: app.url,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4F1EA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syneFont.variable} ${manropeFont.variable} ${firaCodeFont.variable} h-full`}
      style={{ ["--accent" as string]: app.accent }}
    >
      <body className="min-h-full antialiased bg-[#F4F1EA] text-[#1B1B1B]">
        <EvmProvider>
          <ToastProvider>
            <WrongNetworkBar />
            <PageShell>{children}</PageShell>
          </ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
