// ============================================================
// FeedbackPro - Système de modules activables (Task Modules)
// ------------------------------------------------------------
// Helpers serveur pour vérifier l'état d'un module depuis la base.
// Cache mémoire court (TTL 30 s) pour éviter de hit la BDD à chaque
// requête publique (ex : /api/public/scan appelle getModuleActif pour
// décider d'inclure creneauHoraire).
//
// Le cache est invalidé manuellement via invaliderCacheModules()
// après chaque modification (PUT /api/admin/modules).
// ============================================================

import { db } from "@/lib/db"

/** TTL du cache mémoire (ms) — 30 s */
const TTL_CACHE_MS = 30_000

type CacheEntree = {
  /** Date d'expiration du cache */
  expireLe: number
  /** Map key → actif */
  actifs: Map<string, boolean>
  /** Map key → config parsée (ou {} si invalide) */
  configs: Map<string, Record<string, unknown>>
}

let cache: CacheEntree | null = null

/** Invalide le cache mémoire (à appeler après un PUT /api/admin/modules). */
export function invaliderCacheModules(): void {
  cache = null
}

/**
 * Recharge le cache depuis la BDD. Best-effort : si la BDD est
 * injoignable, on retombe sur un cache vide (tous modules inactifs).
 */
async function rechargerCache(): Promise<CacheEntree> {
  const actifs = new Map<string, boolean>()
  const configs = new Map<string, Record<string, unknown>>()
  try {
    const modules = await db.module.findMany({
      select: { key: true, actif: true, config: true },
    })
    for (const m of modules) {
      actifs.set(m.key, m.actif)
      try {
        const cfg = JSON.parse(m.config || "{}") as unknown
        configs.set(
          m.key,
          cfg && typeof cfg === "object" && !Array.isArray(cfg)
            ? (cfg as Record<string, unknown>)
            : {}
        )
      } catch {
        configs.set(m.key, {})
      }
    }
  } catch (e) {
    console.warn("[modules] rechargerCache : échec non bloquant", e)
  }
  return { expireLe: Date.now() + TTL_CACHE_MS, actifs, configs }
}

/**
 * Renvoie true si le module `key` est activé en base.
 * Renvoie false si le module est désactivé ou introuvable.
 *
 * Exemples d'usage :
 *   if (await getModuleActif("alertes_temps_reel")) { ... envoyer SMS ... }
 *   if (await getModuleActif("loterie")) { ... présenter le ticket ... }
 */
export async function getModuleActif(key: string): Promise<boolean> {
  if (!cache || Date.now() > cache.expireLe) {
    cache = await rechargerCache()
  }
  return cache.actifs.get(key) ?? false
}

/**
 * Renvoie la config parsée d'un module (objet vide si introuvable
 * ou JSON invalide). La config n'est renvoyée que si le module est
 * ACTIF — un module désactivé ne devrait pas être consulté.
 */
export async function getModuleConfig<T = Record<string, unknown>>(
  key: string
): Promise<T | null> {
  if (!cache || Date.now() > cache.expireLe) {
    cache = await rechargerCache()
  }
  if (!cache.actifs.get(key)) return null
  return (cache.configs.get(key) ?? {}) as T
}

/**
 * Renvoie l'ensemble des modules activés (Set de keys). Pratique pour
 * les endpoints publics qui veulent renvoyer une snapshot des modules
 * actifs en une seule fois (ex : /api/modules-public pour le scan).
 */
export async function getModulesActifs(): Promise<Set<string>> {
  if (!cache || Date.now() > cache.expireLe) {
    cache = await rechargerCache()
  }
  return new Set([...cache.actifs.entries()].filter(([, v]) => v).map(([k]) => k))
}

// ============================================================
// Clés des modules (single source of truth)
// ============================================================

export const MODULE_KEYS = {
  ALERTES_TEMPS_REEL: "alertes_temps_reel",
  VOICE_TO_TEXT: "voice_to_text",
  ABONNEMENT_MULTI_SITES: "abonnement_multi_sites",
  LOTERIE: "loterie",
  SMART_QR: "smart_qr",
  DOUBLE_SHIELD: "double_shield",
  WEBHOOKS_SORTANTS: "webhooks_sortants",
} as const

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS]
