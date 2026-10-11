import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Typographie : Inter (conforme Session 1)
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FeedbackPro — Le Coach IA d'Audit Qualité Continu",
  description:
    "Transformez vos clients en auditeurs qualité. Notre IA analyse chaque retour client et vous livre chaque matin un rapport d'audit avec des recommandations précises pour améliorer votre service.",
  keywords: [
    "audit qualité",
    "client mystère",
    "Coach IA",
    "retours clients",
    "QR code",
    "SaaS",
    "restaurant",
    "commerce",
  ],
  authors: [{ name: "FeedbackPro" }],
  openGraph: {
    title: "FeedbackPro — Le Coach IA d'Audit Qualité Continu",
    description:
      "Chaque client réel devient un Client Mystère : scan QR, note, tags, et un rapport IA quotidien avec vos 3 priorités du jour.",
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
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${interSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
