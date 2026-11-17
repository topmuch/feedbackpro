import "./globals.css";

export const dynamic = "force-dynamic";

const siteUrl = "https://feedbackpro.qrtags.pro";

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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
