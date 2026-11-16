// global-error.tsx — Server Component (pas de "use client")
// Évite l'erreur TypeError useContext pendant le pre-rendering.
// Pas de hooks React, pas de onClick — juste du HTML statique.

export const dynamic = "force-dynamic"

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
          <h1>Une erreur est survenue</h1>
          <p>{error.message}</p>
          <a href="/" style={{ color: "#003399" }}>Retour à l&apos;accueil</a>
        </div>
      </body>
    </html>
  )
}
