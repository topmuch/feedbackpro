// ============================================================
// FeedVoice - Sonde de configuration IA (sans secrets)
// ------------------------------------------------------------
// Indique si la configuration du SDK z-ai-web-dev-sdk est présente
// dans l'environnement d'exécution (dev local, sandbox, conteneur
// prod Coolify). Aucune valeur sensible n'est exposée : seulement
// des booléens et le host du baseUrl (utile pour distinguer une
// config de prod d'une config de dev).
//
// Cherche les mêmes emplacements que le SDK :
//   1. process.cwd()/.z-ai-config
//   2. $HOME/.z-ai-config
//   3. /etc/.z-ai-config
// ============================================================

import fs from "fs"
import path from "path"

export type SondeAi = {
  /** true si un fichier de config exploitable a été trouvé. */
  configPresente: boolean
  /** true si la config contient une apiKey non vide. */
  aApiKey: boolean
  /** true si la config contient un champ token non vide (certains environnements). */
  aToken: boolean
  /** Host du baseUrl (sans schéma ni chemin) — diagnostic uniquement. */
  baseUrlHost: string | null
  /** Emplacement du fichier trouvé (sans son contenu). */
  source: string | null
}

function lireConfig(): Record<string, unknown> | null {
  const candidats = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(process.env.HOME || "/root", ".z-ai-config"),
    "/etc/.z-ai-config",
  ]
  for (const chemin of candidats) {
    try {
      if (!fs.existsSync(chemin)) continue
      const brut = fs.readFileSync(chemin, "utf8")
      const parse = JSON.parse(brut) as unknown
      if (parse && typeof parse === "object" && !Array.isArray(parse)) {
        return { __source: chemin, ...(parse as Record<string, unknown>) }
      }
    } catch {
      /* fichier absent ou JSON invalide : candidat suivant */
    }
  }
  return null
}

export function sondeConfigAi(): SondeAi {
  const config = lireConfig()
  if (!config) {
    return { configPresente: false, aApiKey: false, aToken: false, baseUrlHost: null, source: null }
  }
  const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  const token = typeof config.token === "string" ? config.token.trim() : ""
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : ""
  let host: string | null = null
  try {
    host = baseUrl ? new URL(baseUrl).host : null
  } catch {
    host = "invalide"
  }
  return {
    configPresente: true,
    aApiKey: apiKey.length > 0,
    aToken: token.length > 0,
    baseUrlHost: host,
    source: typeof config.__source === "string" ? config.__source : null,
  }
}
