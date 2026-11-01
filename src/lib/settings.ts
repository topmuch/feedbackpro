// ============================================================
// FeedbackPro - Settings plateforme (table Setting key-value)
// Lecture des réglages (avec fallback process.env) et écriture.
// Utilisé par l'onglet Paramètres du superadmin et par les helpers
// d'envoi (email, twilio, stripe) pour surcharger les variables env.
// ============================================================

import { db } from "@/lib/db"

/** Liste des clés de réglages (extension email / stripe / twilio / cron) */
export const CLES_SETTINGS_AVANCEES = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "TWILIO_SID",
  "TWILIO_TOKEN",
  "TWILIO_PHONE",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PRO",
  "STRIPE_PRICE_ENTERPRISE",
  "CRON_SECRET",
] as const

export type CleSettingAvancee = (typeof CLES_SETTINGS_AVANCEES)[number]

/** Cache en mémoire (process) des réglages chargés depuis la DB */
let cache: Map<string, string> | null = null

/**
 * Charge tous les réglages depuis la DB (une seule fois par process).
 * Pour la surcharge dynamique des variables d'environnement via le
 * superadmin (sans redémarrage).
 */
export async function chargerSettings(): Promise<Map<string, string>> {
  if (cache) return cache
  try {
    const rows = await db.setting.findMany()
    cache = new Map(rows.map((r) => [r.key, r.value]))
  } catch {
    cache = new Map()
  }
  return cache
}

/** Invalide le cache (appelée après une mise à jour des settings) */
export function invaliderSettings(): void {
  cache = null
}

/**
 * Lit un réglage depuis la DB, avec fallback sur process.env.
 * Retourne la valeur (string) ou `defaut` si introuvable.
 */
export async function getSetting(key: string, defaut = ""): Promise<string> {
  const all = await chargerSettings()
  const v = all.get(key)
  if (v !== undefined && v !== "") return v
  // Fallback process.env
  const env = process.env[key]
  return env && env !== "" ? env : defaut
}

/** Écrit (upsert) un réglage et invalide le cache */
export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  invaliderSettings()
}

/** Écrit plusieurs réglages d'un coup (transaction) et invalide le cache */
export async function setSettings(pairs: Record<string, string>): Promise<void> {
  await db.$transaction(
    Object.entries(pairs).map(([key, value]) =>
      db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  )
  invaliderSettings()
}
