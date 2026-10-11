import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FeedbackPro — Transformez chaque visite client en croissance",
  description:
    "Plateforme SaaS de feedback client par QR code : interceptez les réclamations en interne, motivez vos équipes grâce à la gamification et suivez votre réputation en temps réel.",
  keywords: ["feedback client", "QR code", "satisfaction client", "SaaS", "avis clients", "restaurant", "commerce"],
  authors: [{ name: "FeedbackPro" }],
  openGraph: {
    title: "FeedbackPro",
    description: "Collectez les avis clients par QR code, interceptez les réclamations, gamifiez vos équipes.",
    siteName: "FeedbackPro",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
