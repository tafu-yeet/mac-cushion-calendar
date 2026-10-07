import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { campus } from "@/lib/campus";

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
  title: { default: campus.siteName, template: `%s · ${campus.siteName}` },
  description: `Free food at public ${campus.schoolShortName} campus events, from club Instagram posts.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
