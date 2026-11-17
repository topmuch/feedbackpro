import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

// Retiré getSetting et generateMetadata — les requêtes DB pendant le
// pre-rendering de /_global-error causent des erreurs. Métadonnées
// statiques à la place.

// Typographie : Inter (conforme Session 1)
// Retiré next/font/google — causait TypeError useContext sur /_global-error
// pendant le pre-rendering (le contexte des fonts n'est pas disponible
// hors layout). Utilisation de CSS @import dans globals.css à la place.

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

// Métadonnées statiques (pas de requête DB — évite les erreurs pre-rendering)
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: DEFAULT_META_TITLE,
    template: "%s | FeedbackPro",
  },
  description: DEFAULT_META_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
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
    title: DEFAULT_META_TITLE,
    description: DEFAULT_META_DESCRIPTION,
    siteName: "FeedbackPro",
    type: "website",
    locale: "fr_FR",
    url: siteUrl,
    images: [
      {
        url: "/og-image.png",
        width: 1344,
        height: 768,
        alt: DEFAULT_META_TITLE,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_META_TITLE,
    description: DEFAULT_META_DESCRIPTION,
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

// Force dynamic rendering pour TOUTES les pages
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange storageKey="fp-theme">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
