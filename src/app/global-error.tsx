"use client"

export const dynamic = "force-dynamic"

export default function GlobalError({
  error,
  reset,
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
          <button onClick={() => reset()}>Réessayer</button>
        </div>
      </body>
    </html>
  )
}
