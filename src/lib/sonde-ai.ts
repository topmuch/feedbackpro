// ============================================================
// FeedVoice - Sonde de configuration IA (sans secrets)
// ------------------------------------------------------------
// Indique si la configuration du SDK z-ai-web-dev-sdk est présente
// dans l'environnement d'exécution (dev local, sandbox, conteneur
// prod Coolify). Aucune valeur sensible n'est exposée : seulement
// des booléens et le host du baseUrl (utile pour distinguer une
// config de prod d'une config de dev).
//
// Deux sources possibles, dans l'ordre du SDK :
//   1. Fichiers : process.cwd()/.z-ai-config, $HOME/.z-ai-config,
//      /etc/.z-ai-config  (emplacements exacts du SDK)
//   2. Environnement : process.env.Z_AI_CONFIG (JSON brut, lu par
//      src/instrumentation.ts au démarrage pour écrire le fichier)
// ============================================================

import fs from "fs"
import path from "path"

export type SondeAi = {
  /** true si une configuration exploitable a été trouvée (fichier ou env). */
  configPresente: boolean
  /** true si la config contient une apiKey non vide. */
  aApiKey: boolean
  /** true si la config contient un champ token non vide (certains environnements). */
  aToken: boolean
  /** Host du baseUrl (sans schéma ni chemin) — diagnostic uniquement. */
  baseUrlHost: string | null
  /** Emplacement trouvé : chemin de fichier, ou « __env__ ». Sans son contenu. */
  source: string | null
  /** true si process.env.Z_AI_CONFIG est défini et non vide (diag injection Coolify). */
  envPresente: boolean
  /** true si Z_AI_CONFIG est un JSON objet valide (après normalisation). */
  envJsonValide: boolean
  /** true si un fichier .z-ai-config existe dans un des emplacements du SDK. */
  fichierPresent: boolean
}

/**
 * Normalise la valeur de la variable d'env Z_AI_CONFIG : retire les
 * guillemets d'enrobage (simples/doubles) ajoutés par l'injection
 * Coolify/docker et déséchappe les guillemets backslashés, pour que
 * JSON.parse réussisse quel que soit le mode d'injection.
 */
export function normaliserValeurConfigEnv(brut: string): string {
  let v = brut.trim()
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    v = v.slice(1, -1)
  }
  if (v.includes('\\"')) v = v.replace(/\\"/g, '"')
  return v.trim()
}

/** Lit l'env Z_AI_CONFIG : retourne la validité JSON et la config éventuelle. */
function lireEnv(): { valide: boolean; config: Record<string, unknown> | null } {
  const brut = (process.env.Z_AI_CONFIG ?? "").trim()
  if (!brut) return { valide: false, config: null }
  try {
    const parse: unknown = JSON.parse(normaliserValeurConfigEnv(brut))
    if (parse && typeof parse === "object" && !Array.isArray(parse)) {
      return { valide: true, config: parse as Record<string, unknown> }
    }
  } catch {
    /* JSON invalide : valide=false */
  }
  return { valide: false, config: null }
}

/** Emplacements de fichiers exacts du SDK (même liste que loadConfig). */
function fichiersCandidats(): string[] {
  return [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(process.env.HOME || "/root", ".z-ai-config"),
    "/etc/.z-ai-config",
  ]
}

/** Cherche un fichier de config exploitable ; signale aussi sa simple présence. */
function lireConfig(): { config: Record<string, unknown> | null; fichierPresent: boolean } {
  let fichierPresent = false
  for (const chemin of fichiersCandidats()) {
    try {
      if (!fs.existsSync(chemin)) continue
      fichierPresent = true
      const parse: unknown = JSON.parse(fs.readFileSync(chemin, "utf8"))
      if (parse && typeof parse === "object" && !Array.isArray(parse)) {
        return { config: { __source: chemin, ...(parse as Record<string, unknown>) }, fichierPresent }
      }
    } catch {
      /* fichier absent ou JSON invalide : candidat suivant */
    }
  }
  return { config: null, fichierPresent }
}

function extraireBooleens(config: Record<string, unknown>) {
  const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  const token = typeof config.token === "string" ? config.token.trim() : ""
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : ""
  let host: string | null = null
  try {
    host = baseUrl ? new URL(baseUrl).host : null
  } catch {
    host = "invalide"
  }
  return { aApiKey: apiKey.length > 0, aToken: token.length > 0, baseUrlHost: host }
}

export function sondeConfigAi(): SondeAi {
  const env = lireEnv()
  const fichiers = lireConfig()
  const config = fichiers.config ?? env.config

  const booleens = config ? extraireBooleens(config) : { aApiKey: false, aToken: false, baseUrlHost: null }
  const source = fichiers.config
    ? typeof fichiers.config.__source === "string"
      ? (fichiers.config.__source as string)
      : null
    : env.config
      ? "__env__"
      : null

  return {
    configPresente: Boolean(config),
    ...booleens,
    source,
    envPresente: (process.env.Z_AI_CONFIG ?? "").trim().length > 0,
    envJsonValide: env.valide,
    fichierPresent: fichiers.fichierPresent,
  }
}
