import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getSetting } from "@/lib/settings";

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

const DEFAULT_META_TITLE = "FeedbackPro — Le Coach IA d'Audit Qualité Continu";
const DEFAULT_META_DESCRIPTION =
  "FeedbackPro transforme chaque client en auditeur qualité. Scannez un QR code, laissez une note, et notre IA vous livre chaque matin un rapport d'audit avec 3 priorités concrètes pour améliorer votre service. Pour restaurants, salons, boutiques.";
const DEFAULT_KEYWORDS = [
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
];

/**
 * Task 2 — Référencement SEO dynamique
 * ------------------------------------
 * Les métadonnées par défaut sont lues depuis la table `Setting`
 * (clés metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription).
 * Le superadmin peut les éditer depuis l'onglet Paramètres → SEO.
 *
 * En cas d'échec BDD (mise à jour du schéma en dev, redémarrage…), on
 * retombe silencieusement sur les valeurs statiques par défaut ci-dessus.
 */
export async function generateMetadata(): Promise<Metadata> {
  let metaTitle = DEFAULT_META_TITLE;
  let metaDescription = DEFAULT_META_DESCRIPTION;
  let metaKeywords: string[] = DEFAULT_KEYWORDS;
  let ogTitle = DEFAULT_META_TITLE;
  let ogDescription =
    "Chaque client réel devient un Client Mystère : scan QR, note, tags, et un rapport IA quotidien avec vos 3 priorités du jour. Pour restaurants, salons, boutiques.";

  try {
    const [t, d, k, ogt, ogd] = await Promise.all([
      getSetting("metaTitle", ""),
      getSetting("metaDescription", ""),
      getSetting("metaKeywords", ""),
      getSetting("ogTitle", ""),
      getSetting("ogDescription", ""),
    ]);
    if (t) metaTitle = t;
    if (d) metaDescription = d;
    if (k) {
      metaKeywords = k
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (ogt) ogTitle = ogt;
    if (ogd) ogDescription = ogd;
  } catch {
    /* silencieux : fallback défauts */
  }

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: metaTitle,
      template: "%s | FeedbackPro",
    },
    description: metaDescription,
    keywords: metaKeywords,
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
      title: ogTitle,
      description: ogDescription,
      siteName: "FeedbackPro",
      type: "website",
      locale: "fr_FR",
      url: siteUrl,
      images: [
        {
          url: "/og-image.png",
          width: 1344,
          height: 768,
          alt: ogTitle,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
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
      icon: "/logo-feedbackpro.png",
      shortcut: "/logo-feedbackpro.png",
      apple: "/logo-feedbackpro.png",
    },
    manifest: "/manifest.webmanifest",
  };
}

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
