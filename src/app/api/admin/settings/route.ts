// ============================================================
// API Superadmin - Réglages de la plateforme (model Setting)
// GET   /api/admin/settings → renvoie tous les réglages (avec masque des secrets)
// PATCH /api/admin/settings → upsert des clés (général + avancées email/stripe/twilio/cron)
// POST  /api/admin/settings { action: "testEmail" } → envoie un email test à l'admin
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"
import { setSettings, chargerSettings, invaliderSettings } from "@/lib/settings"
import { CLES_SETTINGS_AVANCEES } from "@/lib/settings"
import { sendEmail } from "@/lib/email"

/** Clés de réglages généraux (Session 5) */
export const CLES_SETTINGS_GENERALES = [
  "nomPlateforme",
  "urlPublique",
  "emailSupport",
  "seuilAlerte",
] as const

const DEFAUTS_GENERALES: Record<(typeof CLES_SETTINGS_GENERALES)[number], string> = {
  nomPlateforme: "FeedbackPro",
  urlPublique: "",
  emailSupport: "support@feedbackpro.fr",
  seuilAlerte: "2",
}

/** Clés dont la valeur doit être masquée à l'affichage (secrets) */
const CLES_SECRETES = new Set<string>([
  "RESEND_API_KEY",
  "TWILIO_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
])

const patchSchema = z
  .object({
    // Général
    nomPlateforme: z.string().trim().min(1, "Le nom de la plateforme est requis").max(80).optional(),
    urlPublique: z.union([z.url("URL publique invalide"), z.literal("")]).optional(),
    emailSupport: z.string().trim().pipe(z.email("Email de support invalide")).optional(),
    seuilAlerte: z
      .union([
        z.number().int().min(1, "Seuil invalide (1 à 5)").max(5, "Seuil invalide (1 à 5)"),
        z.string().regex(/^[1-5]$/, "Seuil invalide (1 à 5)"),
      ])
      .transform((v) => String(v))
      .optional(),
    // Avancés (email / stripe / twilio / cron) : tous string optionnels
    RESEND_API_KEY: z.string().max(200).optional(),
    EMAIL_FROM: z.string().max(200).optional(),
    TWILIO_SID: z.string().max(200).optional(),
    TWILIO_TOKEN: z.string().max(200).optional(),
    TWILIO_PHONE: z.string().max(40).optional(),
    STRIPE_SECRET_KEY: z.string().max(200).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().max(200).optional(),
    STRIPE_PRICE_STARTER: z.string().max(80).optional(),
    STRIPE_PRICE_PRO: z.string().max(80).optional(),
    STRIPE_PRICE_ENTERPRISE: z.string().max(80).optional(),
    CRON_SECRET: z.string().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucun réglage fourni")

const postSchema = z.object({
  action: z.literal("testEmail"),
})

/** Crée les valeurs par défaut manquantes puis renvoie la liste complète */
async function settingsAvecDefauts() {
  const existantes = await db.setting.findMany({ orderBy: { key: "asc" } })
  const manquantes = Object.entries(DEFAUTS_GENERALES).filter(
    ([key]) => !existantes.some((s) => s.key === key)
  )
  if (manquantes.length > 0) {
    await db.setting.createMany({
      data: manquantes.map(([key, value]) => ({ key, value })),
    })
  }
  return db.setting.findMany({ orderBy: { key: "asc" } })
}

/** Masque les secrets : renvoie "" si vide, sinon une chaîne masquée (sauf indication) */
function masquerValeur(key: string, value: string): string {
  if (!value) return ""
  if (!CLES_SECRETES.has(key)) return value
  // Masque partiellement : 4 premiers caractères + **** + 2 derniers
  if (value.length <= 8) return "••••••••"
  return `${value.slice(0, 4)}••••••••${value.slice(-2)}`
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const settings = await settingsAvecDefauts()
    // Masque les secrets dans la réponse GET (l'admin peut saisir une nouvelle valeur)
    const masques = settings.map((s) => ({
      key: s.key,
      value: masquerValeur(s.key, s.value),
      masque: CLES_SECRETES.has(s.key),
    }))
    return ok({ settings: masques })
  } catch (e) {
    console.error("admin settings GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parse = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const body = parse.data

    // Préserve les secrets existants si la nouvelle valeur est vide OU
    // contient les caractères de masque « •••• » (l'admin n'a rien saisi)
    const courant = await chargerSettings()
    const updates: Record<string, string> = {}

    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue
      const v = String(value).trim()
      // Pour les clés secrètes : si la valeur envoyée est vide ou contient
      // le masque (••••), on ne modifie pas la valeur existante en base.
      if (CLES_SECRETES.has(key)) {
        if (!v || v.includes("••••")) {
          // On garde la valeur existante (pas d'update)
          continue
        }
        updates[key] = v
      } else {
        // Pour le seuilAlerte : la valeur est déjà stringifiée par .transform
        updates[key] = v
      }
    }

    if (Object.keys(updates).length > 0) {
      await setSettings(updates)
    } else {
      invaliderSettings()
    }

    const settings = await settingsAvecDefauts()
    const masques = settings.map((s) => ({
      key: s.key,
      value: masquerValeur(s.key, s.value),
      masque: CLES_SECRETES.has(s.key),
    }))
    return ok({ settings: masques })
  } catch (e) {
    console.error("admin settings PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)

    // Envoie un email test à l'admin connecté (mode démo = log serveur)
    const sujet = "Email test FeedbackPro ✓"
    const html = `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1917;background:#f5f5f4;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<div style="background:#2563EB;padding:24px 32px;color:#fff"><p style="margin:0;font-size:20px;font-weight:700">FeedbackPro</p></div>
<div style="padding:32px">
<h1 style="margin:0 0 12px;font-size:18px">Email test ✓</h1>
<p style="margin:0;line-height:1.6;color:#44403c">Bonjour,</p>
<p style="margin:12px 0;line-height:1.6;color:#44403c">Cet email confirme que la configuration Resend fonctionne. Si vous lisez ce message, c'est que la clé API et l'expéditeur sont correctement configurés.</p>
<p style="margin:16px 0 0;line-height:1.6;color:#78716c;font-size:12px">Envoyé depuis l'onglet Paramètres → Email du dashboard superadmin.</p>
</div></div></body></html>`

    const envoye = await sendEmail(admin.email, sujet, html)

    if (!envoye) {
      return fail("Échec de l'envoi (vérifiez la clé API Resend et l'expéditeur)", 500)
    }

    return ok({ envoye: true, destinataire: admin.email })
  } catch (e) {
    console.error("admin settings POST error", e)
    return fail("Erreur serveur", 500)
  }
}

// Re-export pour le helper partagé (utilisé ailleurs)
export { CLES_SETTINGS_AVANCEES }
