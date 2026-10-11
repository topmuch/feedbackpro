// ============================================================
// API publique - Enregistrement d'un retour client
// POST /api/retour
// Body : { token, note, tags[], commentaire?, personnelMentionne?, employeId?, canalChoisi? }
// - Validation Zod (schéma partagé client/serveur src/lib/validation.ts)
// - Note <= 2 → création d'une Alerte + notification commerçant
//   (SMS Twilio si activé, sinon email de secours — S6)
// - Ville approximative du client via IP (ipapi.co, optionnelle et silencieuse)
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { POSITIVE_TAGS, NEGATIVE_TAGS, tagLabel } from "@/lib/constants"
import { retourSchema, firstError } from "@/lib/validation"
import { sendSMS } from "@/lib/twilio"
import { sendEmail, emailAlerteRetour } from "@/lib/email"

/** Adresses locales/privées : aucune recherche géo (inutile et hors RGPD utile) */
function estIpPrivee(ip: string): boolean {
  return (
    ip === "" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

/** Ville approximative via ipapi.co — jamais bloquante (timeout 1,5 s, échec = null) */
async function villeDepuisIp(req: NextRequest): Promise<string | null> {
  try {
    const enTete =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      ""
    const ip = enTete.split(",")[0].trim()
    if (!ip || estIpPrivee(ip)) return null
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(1500),
      headers: { "User-Agent": "FeedbackPro/1.0" },
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { city?: unknown } | null
    const ville = json?.city
    return typeof ville === "string" && ville.trim() ? ville.trim().slice(0, 80) : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    // ---------- Validation Zod du corps de requête ----------
    const brut = await req.json().catch(() => null)
    const parsed = retourSchema.safeParse(brut)
    if (!parsed.success) {
      return fail(firstError(parsed.error), 400)
    }
    const { token, note, tags, commentaire, personnelMentionne, employeId, canalChoisi } = parsed.data

    // ---------- Validation métier des tags ----------
    const idsConnus = POSITIVE_TAGS.map((t) => t.id).concat(NEGATIVE_TAGS.map((t) => t.id))
    const validTags = tags.filter((t) => idsConnus.includes(t))
    if (validTags.length !== tags.length) return fail("Tags invalides", 400)
    // Tags cohérents avec la note (positifs = 4-5, négatifs = 1-3)
    if (note >= 4 && validTags.some((t) => NEGATIVE_TAGS.some((nt) => nt.id === t)))
      return fail("Tags incohérents avec la note", 400)
    if (note <= 3 && validTags.some((t) => POSITIVE_TAGS.some((pt) => pt.id === t)))
      return fail("Tags incohérents avec la note", 400)

    // ---------- Résolution du commerce via le token du QR ----------
    // `user` est inclus pour récupérer l'email du commerçant (alerte email de secours, S6)
    const pro = await db.pro.findUnique({
      where: { qrToken: token },
      include: {
        boutiques: { orderBy: { createdAt: "asc" } },
        user: { select: { email: true } },
      },
    })
    if (!pro) return fail("QR code invalide", 404)
    const boutique = pro.boutiques[0]
    if (!boutique) return fail("Boutique introuvable", 404)

    // Rapprochement employé : soit via l'ID transmis, soit par similarité du nom
    let finalEmployeId: string | null = null
    if (employeId) {
      const e = await db.employe.findFirst({ where: { id: employeId, boutiqueId: boutique.id, actif: true } })
      if (e) finalEmployeId = e.id
    } else if (personnelMentionne) {
      const needle = personnelMentionne.trim().toLowerCase()
      if (needle.length >= 3) {
        const employes = await db.employe.findMany({ where: { boutiqueId: boutique.id, actif: true } })
        const match = employes.find((e) => e.nom.toLowerCase().includes(needle) || needle.includes(e.nom.toLowerCase().split(" ")[0]))
        if (match) finalEmployeId = match.id
      }
    }

    // Ville par IP : best effort, ne doit jamais ralentir l'envoi de plus d'1,5 s
    const ipCity = await villeDepuisIp(req)

    // ---------- Enregistrement ----------
    const retour = await db.retour.create({
      data: {
        boutiqueId: boutique.id,
        employeId: finalEmployeId,
        note,
        tags: JSON.stringify(validTags),
        commentaire,
        personnelMentionne,
        canalChoisi,
        ipCity,
        statut: "NEW",
        // Historique des statuts : entrée initiale à la création
        historique: JSON.stringify([{ statut: "NEW", at: new Date().toISOString() }]),
        lu: false,
      },
    })

    // ---------- Alerte temps réel pour les réclamations (note <= 2) ----------
    let alerteEnvoyee = false
    if (note <= 2) {
      const tagsTxt = validTags.length ? ` Tags : ${validTags.join(", ")}.` : ""
      const persTxt = personnelMentionne ? ` Personnel : ${personnelMentionne}.` : ""
      await db.alerte.create({
        data: {
          proId: pro.id,
          retourId: retour.id,
          titre: `🚨 Réclamation ${note}/5 - ${pro.nomCommerce}`,
          message: `Un client vient de laisser un retour ${note}/5.${tagsTxt}${persTxt} ${commentaire ? `"${commentaire.slice(0, 140)}"` : ""} Intervenez vite pour protéger votre réputation !`,
          canal: "SMS",
          lu: false,
        },
      })

      // ---------- Notification commerçant (S6) : SMS Twilio ou email de secours ----------
      // Strictement non bloquant : un échec d'envoi ne doit jamais faire
      // échouer l'enregistrement du retour (le client attend sa réponse).
      const motifs = validTags.length ? validTags.map(tagLabel).join(", ") : "non précisé"
      const dashboardUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.fr").replace(/\/$/, "")}/dashboard`
      try {
        if (pro.smsAlertes && pro.whatsapp) {
          void sendSMS(
            pro.whatsapp,
            `🚨 FeedbackPro : Alerte réclamation - Note ${note}/5 - Motif : ${motifs}. Connectez-vous : ${dashboardUrl}`
          ).catch((e) => console.warn("SMS d'alerte non envoyé (non bloquant)", e))
        } else if (pro.user?.email) {
          // Fallback email : SMS désactivé (pro.smsAlertes = false) ou numéro manquant
          void sendEmail(
            pro.user.email,
            `🚨 Alerte réclamation ${note}/5 — ${pro.nomCommerce}`,
            emailAlerteRetour(pro.nomCommerce, note, motifs, dashboardUrl)
          ).catch((e) => console.warn("Email d'alerte non envoyé (non bloquant)", e))
        }
      } catch (e) {
        console.warn("Notification d'alerte non envoyée (non bloquant)", e)
      }
      alerteEnvoyee = true
    }

    return ok({ id: retour.id, alerteEnvoyee, ipCity })
  } catch (e) {
    console.error("retour error", e)
    return fail("Erreur serveur lors de l'enregistrement", 500)
  }
}
