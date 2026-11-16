"use client"

// ============================================================
// global-error.tsx — Page d'erreur globale (hors layout)
// ------------------------------------------------------------
// IMPORTANT: ce fichier est rendu SANS le layout root, donc SANS
// les providers (ThemeProvider, etc.). On utilise des styles
// inline pour éviter tout hook de contexte (useTheme, useContext)
// qui causerait "TypeError: null is not an object" au build.
// ============================================================

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0f172a",
          color: "#fff",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "500px" }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
            Une erreur est survenue
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
            {error.message || "Erreur inattendue"}
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1.5rem" }}>
              ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#003399",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
