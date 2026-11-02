import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

// Typographie : Inter (conforme Session 1)
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.qrtags.pro";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FeedbackPro — Le Coach IA d'Audit Qualité Continu",
    template: "%s | FeedbackPro",
  },
  description:
    "FeedbackPro transforme chaque client en auditeur qualité. Scannez un QR code, laissez une note, et notre IA vous livre chaque matin un rapport d'audit avec 3 priorités concrètes pour améliorer votre service. Pour restaurants, salons, boutiques.",
  keywords: [
    "audit qualité",
    "client mystère",
    "Coach IA",
    "retours clients",
    "avis clients",
    "QR code feedback",
    "SaaS commerce",
    "restaurant",
    "salon",
    "boulangerie",
    "satisfaction client",
    "NPS",
    "amélioration service",
    "gestion réclamations",
    "alerte WhatsApp",
    "avis Google",
    "fidélisation client",
  ],
  authors: [{ name: "FeedbackPro" }],
  creator: "FeedbackPro",
  publisher: "FeedbackPro",
  applicationName: "FeedbackPro",
  category: "Business",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "FeedbackPro — Le Coach IA d'Audit Qualité Continu",
    description:
      "Chaque client réel devient un Client Mystère : scan QR, note, tags, et un rapport IA quotidien avec vos 3 priorités du jour. Pour restaurants, salons, boutiques.",
    siteName: "FeedbackPro",
    type: "website",
    locale: "fr_FR",
    url: siteUrl,
    images: [
      {
        url: "/og-image.png",
        width: 1344,
        height: 768,
        alt: "FeedbackPro — Le Coach IA d'Audit Qualité Continu",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FeedbackPro — Le Coach IA d'Audit Qualité Continu",
    description:
      "Transformez vos clients en auditeurs qualité. Rapport IA quotidien avec 3 priorités pour améliorer votre service.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Task M2 — next-intl : on résout la locale et les messages côté serveur
  // (depuis le cookie `fp_locale` configuré dans src/i18n/request.ts) et on
  // les passe au NextIntlClientProvider pour que les composants client
  // puissent utiliser useTranslations() / useLocale().
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${interSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
