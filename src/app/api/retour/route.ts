// ============================================================
// API publique (canonique) - Enregistrement d'un retour Client Mystère
// POST /api/retour
// Body : { qrToken, note, tags[], commentaire?, personnelMentionne?, canalChoisi? }
// → { retour, recompense: string | null }
// - Résout la ZONE par son qrToken (chaque zone a son QR)
// - Crée le Retour avec proId + zoneId (+ rattachement employé par nom)
// - Note ≤ 2 → Alerte + SMS (si activé) ou email de secours
// - Récompense (micro-avantage) renvoyée pour l'écran de remerciement
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { retourSchema, firstError } from "@/lib/validation"
import { tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"
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
    const { qrToken, note, tags, commentaire, personnelMentionne, canalChoisi } = parsed.data

    // ---------- Résolution de la zone via le QR token ----------
    const zone = await db.zone.findUnique({
      where: { qrToken },
      include: { pro: { include: { user: { select: { email: true } } } } },
    })
    if (!zone) return fail("QR code invalide", 404)
    const pro = zone.pro

    // ---------- Cohérence des tags avec la zone et la note ----------
    // Le scan n'affiche que les tags configurés sur la zone ; on filtre
    // silencieusement (aucune erreur 400 côté client mystère) pour garantir
    // la qualité des données sans casser le parcours public.
    const positifsZone = parseJsonArray(zone.tagsPositifs)
    const negatifsZone = parseJsonArray(zone.tagsNegatifs)
    const autorises = note >= 4 ? positifsZone : negatifsZone
    const validTags = autorises.length > 0 ? tags.filter((t) => autorises.includes(t)) : []

    // ---------- Rattachement employé (affecté à cette zone) ----------
    let employeId: string | null = null
    if (personnelMentionne) {
      const needle = personnelMentionne.trim().toLowerCase()
      if (needle.length >= 3) {
        const employesZone = await db.employe.findMany({ where: { proId: pro.id, actif: true } })
        const match = employesZone.find((e) => {
          const affecte = parseJsonArray(e.zoneIds).includes(zone.id)
          const nom = e.nom.toLowerCase()
          return affecte && (nom.includes(needle) || needle.includes(nom.split(" ")[0]))
        })
        if (match) employeId = match.id
      }
    }

    // Ville par IP : best effort, ne doit jamais ralentir l'envoi de plus d'1,5 s
    const ipCity = await villeDepuisIp(req)

    // ---------- Enregistrement (proId + zoneId) ----------
    const retour = await db.retour.create({
      data: {
        proId: pro.id,
        zoneId: zone.id,
        employeId,
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
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
    })

    // ---------- Alerte temps réel pour les réclamations (note <= 2) ----------
    if (note <= 2) {
      const tagsTxt = validTags.length ? ` Tags : ${validTags.map(tagLabel).join(", ")}.` : ""
      const persTxt = personnelMentionne ? ` Personnel : ${personnelMentionne}.` : ""
      await db.alerte.create({
        data: {
          proId: pro.id,
          retourId: retour.id,
          titre: `🚨 Réclamation ${note}/5 - ${zone.nom}`,
          message: `Un Client Mystère vient de laisser un retour ${note}/5 sur la zone « ${zone.nom} ».${tagsTxt}${persTxt} ${commentaire ? `"${commentaire.slice(0, 140)}"` : ""} Intervenez vite !`,
          canal: "SMS",
          lu: false,
        },
      })

      // ---------- Notification (S6) : SMS Twilio ou email de secours ----------
      // Strictement non bloquant : un échec d'envoi ne doit jamais faire
      // échouer l'enregistrement du retour (le client attend sa réponse).
      const motifs = validTags.length ? validTags.map(tagLabel).join(", ") : "non précisé"
      const dashboardUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://feedbackpro.fr").replace(/\/$/, "")}/dashboard`
      try {
        if (pro.smsAlertes && pro.whatsapp) {
          void sendSMS(
            pro.whatsapp,
            `🚨 FeedbackPro : Alerte réclamation - Zone ${zone.nom} - Note ${note}/5 - Motif : ${motifs}. Connectez-vous : ${dashboardUrl}`
          ).catch((e) => console.warn("SMS d'alerte non envoyé (non bloquant)", e))
        } else if (pro.user?.email) {
          // Fallback email : SMS désactivé (pro.smsAlertes = false) ou numéro manquant
          void sendEmail(
            pro.user.email,
            `🚨 Alerte réclamation ${note}/5 — ${pro.nomEtablissement}`,
            emailAlerteRetour(pro.nomEtablissement, note, motifs, dashboardUrl)
          ).catch((e) => console.warn("Email d'alerte non envoyé (non bloquant)", e))
        }
      } catch (e) {
        console.warn("Notification d'alerte non envoyée (non bloquant)", e)
      }
    }

    return ok({
      retour: {
        id: retour.id,
        note: retour.note,
        tags: validTags,
        commentaire: retour.commentaire,
        statut: retour.statut,
        createdAt: retour.createdAt.toISOString(),
        zone: { nom: zone.nom },
        employe: retour.employe?.nom ? { nom: retour.employe.nom } : null,
      },
      // Micro-récompense affichée à l'écran de remerciement — uniquement si
      // le commerçant l'a activée (Session 3) ; le code promo est transmis
      // séparément pour être mis en valeur dans une puce dédiée.
      recompense: pro.recompenseActive && pro.recompense ? pro.recompense : null,
      codeRecompense: pro.recompenseActive ? pro.recompenseCode || null : null,
    })
  } catch (e) {
    console.error("retour error", e)
    return fail("Erreur serveur lors de l'enregistrement", 500)
  }
}
