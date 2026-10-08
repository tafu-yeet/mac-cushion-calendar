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

// Absolute URLs for share previews: the production domain on Vercel, localhost in development.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: campus.siteName, template: `%s · ${campus.siteName}` },
  description: `Every public ${campus.schoolShortName} campus event in one place, from club Instagram posts: free food, socials, sports, talks, and more.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
