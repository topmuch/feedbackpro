// ============================================================
// FeedbackPro - Cron : récapitulatif hebdomadaire
// GET /api/cron/recap-weekly
// ------------------------------------------------------------
// Planifié chaque lundi à 8h00 UTC par Vercel Cron (vercel.json).
// Peut aussi être appelé manuellement :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedbackpro.fr/api/cron/recap-weekly
//
// Agrège les retours des 7 derniers jours par établissement
// (volume + note moyenne + alertes ≤ 2★ + zone la plus critiquée)
// et envoie un emailRecapHebdo à chaque Pro actif non suspendu
// (email de réception des rapports). Un échec d'envoi n'interrompt
// jamais les envois suivants.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { sendEmail, emailRecapHebdo } from "@/lib/email"

export async function GET(req: NextRequest) {
  try {
    // ---------- Sécurité : CRON_SECRET obligatoire ----------
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return fail("Cron non configuré (CRON_SECRET absent)", 501)
    }
    const auth = req.headers.get("authorization") ?? ""
    if (auth !== `Bearer ${secret}`) {
      return fail("Non autorisé", 401)
    }

    // ---------- Période : les 7 derniers jours ----------
    const depuis = new Date(Date.now() - 7 * 24 * 3600 * 1000)

    // Retours de la semaine, avec la zone → Pro (email de réception).
    // Volume maîtrisé à ce stade du produit : agrégation en mémoire.
    const retours = await db.retour.findMany({
      where: { createdAt: { gte: depuis } },
      select: {
        note: true,
        zone: { select: { nom: true } },
        pro: {
          select: {
            id: true,
            nomEtablissement: true,
            suspendu: true,
            email: true,
          },
        },
      },
    })

    // ---------- Agrégation par établissement (adaptée aux zones) ----------
    const stats = new Map<
      string,
      {
        nomEtablissement: string
        email: string
        total: number
        sommeNotes: number
        alertes: number
        parZone: Map<string, { total: number; negatifs: number }>
      }
    >()
    for (const r of retours) {
      const pro = r.pro
      if (!pro || pro.suspendu) continue
      const email = pro.email
      if (!email) continue
      const s =
        stats.get(pro.id) ??
        {
          nomEtablissement: pro.nomEtablissement,
          email,
          total: 0,
          sommeNotes: 0,
          alertes: 0,
          parZone: new Map<string, { total: number; negatifs: number }>(),
        }
      s.total += 1
      s.sommeNotes += r.note
      if (r.note <= 2) s.alertes += 1

      const nomZone = r.zone?.nom ?? "Non définie"
      const z = s.parZone.get(nomZone) ?? { total: 0, negatifs: 0 }
      z.total += 1
      if (r.note <= 3) z.negatifs += 1
      s.parZone.set(nomZone, z)

      stats.set(pro.id, s)
    }

    // ---------- Envoi des emails (un seul par établissement actif) ----------
    let envois = 0
    for (const s of stats.values()) {
      // Seuil : le récap n'est envoyé qu'aux établissements ayant reçu au moins un retour
      if (s.total === 0) continue

      // Zone la plus critique de la semaine (le plus de retours ≤ 3★)
      let zoneCritique: string | null = null
      let maxNegatifs = 0
      for (const [nom, z] of s.parZone.entries()) {
        if (z.negatifs > maxNegatifs) {
          maxNegatifs = z.negatifs
          zoneCritique = nom
        }
      }
      console.log(
        `[CRON] Récap hebdo ${s.nomEtablissement} : ${s.total} retours, note ${(s.sommeNotes / s.total).toFixed(2)}` +
          (zoneCritique ? `, zone à surveiller : ${zoneCritique}` : "")
      )

      const success = await sendEmail(
        s.email,
        `📊 Votre récap hebdo — ${s.nomEtablissement}`,
        emailRecapHebdo(s.nomEtablissement, {
          total: s.total,
          noteMoyenne: s.sommeNotes / s.total,
          alertes: s.alertes,
        })
      )
      if (success) envois += 1
    }

    console.log(`[CRON] Récap hebdomadaire : ${envois} email(s) envoyé(s) sur ${stats.size} établissement(s) actifs`)
    return ok({ envois })
  } catch (e) {
    console.error("cron recap-weekly error", e)
    return fail("Erreur serveur lors du récap hebdomadaire", 500)
  }
}
