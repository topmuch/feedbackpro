// ============================================================
// FeedVoice - Journal d'erreurs en mémoire (ring buffer)
// ------------------------------------------------------------
// Observabilité légère sans dépendance externe : capture les erreurs
// client (window.onerror / unhandledrejection → POST /api/log-error)
// et les erreurs serveur signalées volontairement, dans un anneau de
// 200 entrées consultable par le superadmin via /api/admin/error-log.
//
// Volatile par design : les erreurs partent avec le process — c'est un
// tableau de bord "qu'est-ce qui se passe en ce moment", pas une
// forensique (celle-ci reste sur les logs Coolify).
// ============================================================

export type EntreeErreur = {
  ts: number
  /** Origine : "client", "serveur", "api:<route>", "sw"… */
  source: string
  message: string
  stack?: string
  /** URL de la page côté client, si transmise. */
  page?: string
  /** User-Agent du client, si connu. */
  ua?: string
}

const TAILLE_ANNEAU = 200

const CLE_GLOBAL = "__fv_error_log__"

function anneau(): EntreeErreur[] {
  const g = globalThis as { [CLE_GLOBAL]?: EntreeErreur[] }
  if (!g[CLE_GLOBAL]) g[CLE_GLOBAL] = []
  return g[CLE_GLOBAL]
}

/** Journalise une erreur (insère en tête, borne à 200 entrées). */
export function journalErreur(entree: Omit<EntreeErreur, "ts">): void {
  const a = anneau()
  a.unshift({ ...entree, ts: Date.now() })
  if (a.length > TAILLE_ANNEAU) a.length = TAILLE_ANNEAU
  // Console serveur : alimente aussi les logs Coolify (forensique durable).
  console.error(`[${entree.source}] ${entree.message}`, entree.stack ?? "")
}

/** Dernières erreurs (la plus récente d'abord). */
export function listerErreurs(limite = 200): EntreeErreur[] {
  return anneau().slice(0, limite)
}

/** Nombre d'erreurs actuellement en mémoire. */
export function compterErreurs(): number {
  return anneau().length
}
