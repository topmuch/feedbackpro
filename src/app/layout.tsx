import "./globals.css";

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
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
