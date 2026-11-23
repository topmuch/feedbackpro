// ============================================================
// FeedVoice - Reporter client des erreurs navigateur
// ------------------------------------------------------------
// Branché au boot de page.tsx : capture window.onerror + unhandledrejection
// et les pousse à POST /api/log-error (ring buffer superadmin).
//
// Sécurités :
//   - fire-and-forget (ne bloque jamais l'app, ne boucle pas : une erreur
//     DANS le reporter est silencieuse) ;
//   - throttle 5 s : max un envoi par salve d'erreurs ;
//   - ignore les erreurs de scripts d'extensions (origine non app).
// ============================================================

let dernierEnvoi = 0

function envoyer(payload: {
  message: string
  stack?: string
  source?: string
  page?: string
}): void {
  const maintenant = Date.now()
  if (maintenant - dernierEnvoi < 5000) return
  dernierEnvoi = maintenant
  try {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* silencieux : le reporter ne doit jamais casser l'app */
  }
}

/** Installe les écouteurs globaux (appelé une fois au boot). */
export function installerReporterErreurs(): void {
  if (typeof window === "undefined") return

  window.addEventListener("error", (event) => {
    const src = event.filename ?? ""
    // Erreurs de scripts tiers/extensions : pas notre code, on n'en veut pas.
    if (src && !src.startsWith(window.location.origin) && !src.startsWith("/")) return
    envoyer({
      message: event.message || "Erreur JS inconnue",
      stack: event.error?.stack?.slice(0, 2000),
      source: "client",
      page: window.location.pathname + window.location.search,
    })
  })

  window.addEventListener("unhandledrejection", (event) => {
    const raison = event.reason
    envoyer({
      message:
        raison instanceof Error
          ? `Promise rejetée : ${raison.message}`
          : `Promise rejetée : ${String(raison).slice(0, 300)}`,
      stack: raison instanceof Error ? raison.stack?.slice(0, 2000) : undefined,
      source: "client",
      page: window.location.pathname + window.location.search,
    })
  })
}
