// ============================================================
// FeedVoice - Sonde réseau IA (diagnostic prod, sans secrets)
// ------------------------------------------------------------
// Interroge depuis le serveur courant la reachability des hosts
// nécessaires à la voix Nathalie (SDK z-ai-web-dev-sdk) :
//   · API interne : internal-api.z.ai (DNS privé du sandbox uniquement)
//   · Plateformes publiques Z.ai : api.z.ai / open.bigmodel.cn
// Cibles HARDCODÉES (aucune entrée utilisateur → pas de SSRF), timeouts
// courts, aucun contenu de requête envoyé, aucun secret exposé : la
// sonde ne retourne que des classifications et des statuts HTTP.
//
// Utilisation : GET /api/health?probe=1 (résultat caché 60 s).
// ============================================================

import dns from "dns"

export type ProbeReseau = {
  /** Classification DNS de internal-api.z.ai vue depuis ce serveur. */
  dnsInterne: "privee" | "publique" | "echec"
  /** IP(s) observées (diagnostic, pas une donnée sensible). */
  ipsInterne: string[]
  /** Catégorie de connexion à internal-api.z.ai (443). */
  connexionInterne: "ok" | "refusee" | "timeout" | "dns" | "erreur"
  /** Statut HTTP du POST /audio/tts sans auth (401 attendu si joignable). */
  statusInterneTts: number | null
  /** Statut HTTP de la plateforme publique api.z.ai (401/404 attendu si joignable). */
  statusPublicZai: number | null
  /** Statut HTTP de open.bigmodel.cn (200 attendu si joignable). */
  statusPublicBigmodel: number | null
}

const HOTE_INTERNE = "internal-api.z.ai"
const URL_INTERNE_TTS = "https://internal-api.z.ai/v1/audio/tts"
const URL_PUBLIC_ZAI = "https://api.z.ai/api/paas/v4/chat/completions"
const URL_PUBLIC_BIGMODEL = "https://open.bigmodel.cn"

const TIMEOUT_MS = 4_000

const CACHE_MS = 60_000
let cache: { a: number; valeur: ProbeReseau } | null = null

/** 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, ::1, fc00::/7. */
function ipPrivee(ip: string): boolean {
  if (/^(10\.|192\.168\.|127\.|169\.254\.)/.test(ip)) return true
  const m172 = ip.match(/^172\.(\d+)\./)
  if (m172) {
    const d = Number(m172[1])
    return d >= 16 && d <= 31
  }
  return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")
}

function classerDns(ips: string[]): "privee" | "publique" | "echec" {
  if (ips.length === 0) return "echec"
  return ips.every(ipPrivee) ? "privee" : "publique"
}

/** Effectue la sonde complète (appelée au plus une fois par fenêtre de cache). */
async function sonder(): Promise<ProbeReseau> {
  // ---- DNS interne ----
  let dnsInterne: ProbeReseau["dnsInterne"] = "echec"
  let ipsInterne: string[] = []
  try {
    const res = await dns.promises.lookup(HOTE_INTERNE, { all: true, verbatim: true })
    ipsInterne = res.map((r) => r.address)
    dnsInterne = classerDns(ipsInterne)
  } catch {
    dnsInterne = "echec"
  }

  // ---- POST /audio/tts interne (sans auth → 401 si joignable) ----
  let connexionInterne: ProbeReseau["connexionInterne"] = "erreur"
  let statusInterneTts: number | null = null
  try {
    const r = await fetch(URL_INTERNE_TTS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    statusInterneTts = r.status
    connexionInterne = "ok"
  } catch (e) {
    const m = e instanceof Error ? `${e.message} ${(e.cause as Error | undefined)?.message ?? ""}` : String(e)
    if (/getaddrinfo|ENOTFOUND|EAI_AGAIN/i.test(m)) connexionInterne = "dns"
    else if (/TimedOut|timeout|aborted/i.test(m)) connexionInterne = "timeout"
    else if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|fetch failed|socket/i.test(m))
      connexionInterne = "refusee"
    else connexionInterne = "erreur"
  }

  // ---- Plateformes publiques (statut seulement) ----
  async function statusPublic(url: string, methode: "GET" | "POST"): Promise<number | null> {
    try {
      const r = await fetch(url, {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: methode === "POST" ? "{}" : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
      })
      return r.status
    } catch {
      return null
    }
  }

  const statusPublicZai = await statusPublic(URL_PUBLIC_ZAI, "POST")
  const statusPublicBigmodel = await statusPublic(URL_PUBLIC_BIGMODEL, "GET")

  return {
    dnsInterne,
    ipsInterne: ipsInterne.slice(0, 4),
    connexionInterne,
    statusInterneTts,
    statusPublicZai,
    statusPublicBigmodel,
  }
}

/**
 * Sonde réseau (cachée 60 s). Ne journalise rien, ne bloque pas plus
 * de ~12 s au pire (3 cibles × 4 s en série).
 */
export async function probeReseau(): Promise<ProbeReseau> {
  if (cache && Date.now() - cache.a < CACHE_MS) return cache.valeur
  const valeur = await sonder()
  cache = { a: Date.now(), valeur }
  return valeur
}
