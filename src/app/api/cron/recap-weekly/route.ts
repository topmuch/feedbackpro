// ============================================================
// FeedbackPro - Cron : récapitulatif hebdomadaire (Session 6 §3)
// GET /api/cron/recap-weekly
// ------------------------------------------------------------
// Planifié chaque lundi à 8h00 UTC par Vercel Cron (vercel.json).
// Peut aussi être appelé manuellement :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedbackpro.fr/api/cron/recap-weekly
//
// Agrège les retours des 7 derniers jours par commerçant
// (volume + note moyenne + alertes ≤ 2★) et envoie un
// emailRecapHebdo à chaque commerçant (email du User lié).
// Un échec d'envoi n'interrompt jamais les envois suivants.
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

    // Retours de la semaine, avec le commerce → Pro → User (email).
    // Volume maîtrisé à ce stade du produit : agrégation en mémoire.
    const retours = await db.retour.findMany({
      where: { createdAt: { gte: depuis } },
      select: {
        note: true,
        boutique: {
          select: {
            pro: {
              select: {
                id: true,
                nomCommerce: true,
                suspendu: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    })

    // ---------- Agrégation par commerçant ----------
    const stats = new Map<
      string,
      { nomCommerce: string; email: string; total: number; sommeNotes: number; alertes: number }
    >()
    for (const r of retours) {
      const pro = r.boutique.pro
      if (!pro || pro.suspendu) continue
      const email = pro.user?.email
      if (!email) continue
      const s = stats.get(pro.id) ?? {
        nomCommerce: pro.nomCommerce,
        email,
        total: 0,
        sommeNotes: 0,
        alertes: 0,
      }
      s.total += 1
      s.sommeNotes += r.note
      if (r.note <= 2) s.alertes += 1
      stats.set(pro.id, s)
    }

    // ---------- Envoi des emails (un seul par commerçant actif) ----------
    let envois = 0
    for (const s of stats.values()) {
      // Seuil : le récap n'est envoyé qu'aux commerçants ayant reçu au moins un retour
      if (s.total === 0) continue
      const success = await sendEmail(
        s.email,
        `📊 Votre récap hebdo — ${s.nomCommerce}`,
        emailRecapHebdo(s.nomCommerce, {
          total: s.total,
          noteMoyenne: s.sommeNotes / s.total,
          alertes: s.alertes,
        })
      )
      if (success) envois += 1
    }

    console.log(`[CRON] Récap hebdomadaire : ${envois} email(s) envoyé(s) sur ${stats.size} commerçant(s) actifs`)
    return ok({ envois })
  } catch (e) {
    console.error("cron recap-weekly error", e)
    return fail("Erreur serveur lors du récap hebdomadaire", 500)
  }
}
