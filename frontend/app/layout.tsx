import type { Metadata } from "next";
import { Public_Sans, Red_Hat_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "@/components/dashboard/app-shell";
import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const mono = Red_Hat_Mono({ subsets: ["latin"], variable: "--font-red-hat-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MANDATE — Conditional authorization", template: "%s · MANDATE" },
  description: "Authorization that expires when reality changes. Conditional mandates for autonomous agents, adjudicated by GenLayer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
