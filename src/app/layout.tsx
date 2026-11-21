import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FeedbackPro",
  description: "Le Coach IA d'Audit Qualité Continu",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* PWA — manifest lié au niveau du layout racine : c'est LA
            condition manquante pour l'installabilité (Chrome exige un
            <link rel="manifest"> dans le HTML pour émettre l'événement
            beforeinstallprompt, utilisé par « Garder Nathalie »). */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#C9A961" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Typographie « Luxe Silencieux » — Playfair Display pour les
            titres (serif élégant, italique pour les accents) et Inter
            pour le corps de texte. Chargée en <link> (runtime) plutôt
            qu'en next/font : aucun téléchargement au build, donc le
            déploiement Coolify ne dépend jamais de fonts.google.com.
            En cas d'indisponibilité, le fallback Georgia reste élégant. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Link runtime (pas next/font) : le build Coolify ne dépend
            jamais de fonts.google.com. Faux positif de la règle pages/ :
            en App Router, ce layout racine s'applique à TOUTES les pages. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        {/* next-themes — le bouton mode sombre/clair des dashboards (ThemeToggle)
            ne fonctionne QUE si le provider est monté ici. attribute="class" →
            la classe .dark est posée sur <html> (définie dans globals.css).
            defaultTheme="light" : le mode clair reste le défaut FeedbackPro. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
