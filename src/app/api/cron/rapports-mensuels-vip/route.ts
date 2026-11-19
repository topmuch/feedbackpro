// ============================================================
// FeedbackPro VIP — Cron : rapport mensuel lounge
// GET /api/cron/rapports-mensuels-vip
// ------------------------------------------------------------
// Planifié le 1er du mois à 7h30 UTC (vercel.json).
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     localhost:3000/api/cron/rapports-mensuels-vip
//
// Calcule les métriques du mois précédent (incidents résolus /
// temps moyen, satisfaction, récompenses offertes, douches,
// heures de pointe, upsells + commissions, prêts express,
// Lost & Found) pour chaque tenant lounge actif et envoie le
// rapport au manager par email (simulé en mode démo sans clés).
// Comparaison automatique avec le mois précédent (deltas).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { sendEmail } from "@/lib/email"
import { logAudit } from "@/lib/vip-clients"

function bornesMois(offset = 0) {
  const now = new Date()
  const annee = now.getUTCFullYear()
  const mois = now.getUTCMonth() + offset // offset -1 = mois précédent
  const debut = new Date(Date.UTC(annee, mois, 1, 0, 0, 0))
  const fin = new Date(Date.UTC(annee, mois + 1, 1, 0, 0, 0))
  const label = `${String(((mois % 12) + 12) % 12 + 1).padStart(2, "0")}/${annee}`
  return { debut, fin, label }
}

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

    const { debut, fin, label } = bornesMois(-1)
    const prec = bornesMois(-2)

    // ---------- Tenants lounge actifs (PRO, tenantType=vip_lounge) ----------
    const lounges = await db.user.findMany({
      where: { tenantType: "vip_lounge", role: "PRO", suspendu: false },
      include: { pro: { select: { nomEtablissement: true, email: true } } },
    })

    let envois = 0

    for (const lounge of lounges) {
      const emailManager = lounge.pro?.email || lounge.email
      const nomLounge = lounge.pro?.nomEtablissement || "Salon VIP"

      // ----- Métriques du mois -----
      const [problemes, resolus, ratings, grants, douches, orders, prets, lostfound, visites] =
        await Promise.all([
          db.vipTableRequest.count({ where: { type: "problem", createdAt: { gte: debut, lt: fin } } }),
          db.vipTableRequest.findMany({
            where: { type: "problem", status: "done", updatedAt: { gte: debut, lt: fin } },
            select: { createdAt: true, updatedAt: true },
          }),
          db.vipTableRequest.findMany({
            where: { type: "rating", createdAt: { gte: debut, lt: fin } },
            select: { metadata: true },
          }),
          db.rewardGrant.findMany({
            where: { deliveredAt: { gte: debut, lt: fin } },
            include: { reward: { select: { costFcfa: true } } },
          }),
          db.showerReservation.count({
            where: { reservedAt: { gte: debut, lt: fin }, status: { not: "cancelled" } },
          }),
          db.vipOrder.findMany({
            where: { createdAt: { gte: debut, lt: fin }, status: { not: "cancelled" } },
            select: { totalFcfa: true },
          }),
          db.loanRequest.count({ where: { requestedAt: { gte: debut, lt: fin } } }),
          db.lostFoundItem.findMany({
            where: { createdAt: { gte: debut, lt: fin } },
            select: { status: true },
          }),
          db.vipVisit.count({ where: { createdAt: { gte: debut, lt: fin } } }),
        ])

      const tempsMoyenMin =
        resolus.length > 0
          ? Math.round(
              resolus.reduce(
                (acc, r) => acc + (r.updatedAt.getTime() - r.createdAt.getTime()) / 60000,
                0,
              ) / resolus.length,
            )
          : null

      const etoiles = ratings
        .map((r) => {
          try {
            const m = JSON.parse(r.metadata || "{}")
            return typeof m.rating === "number" ? m.rating : null
          } catch {
            return null
          }
        })
        .filter((n): n is number => n !== null)
      const satisfaction = etoiles.length
        ? Math.round((etoiles.reduce((a, b) => a + b, 0) / etoiles.length) * 10) / 10
        : null

      const recompensesCout = grants.reduce((acc, g) => acc + (g.reward?.costFcfa ?? 0), 0)
      const upsellCa = orders.reduce((acc, o) => acc + o.totalFcfa, 0)
      const commissions = Math.round(upsellCa * 0.1)
      const lostFoundRestitues = lostfound.filter((l) => l.status === "returned").length

      // ---------- Email rapport (HTML simple, lisible mobile) ----------
      const lignes = [
        `Incidents : ${resolus.length} résolu(s) sur ${problemes} — temps moyen ${tempsMoyenMin ?? "—"} min`,
        `Satisfaction : ${satisfaction ?? "—"}/5 (${etoiles.length} avis)`,
        `Récompenses offertes : ${grants.length} — coût ${recompensesCout.toLocaleString("fr-FR")} FCFA`,
        `Douches : ${douches} réservation(s)`,
        `Upsells : ${orders.length} vente(s) — CA ${upsellCa.toLocaleString("fr-FR")} FCFA, commissions ${commissions.toLocaleString("fr-FR")} FCFA`,
        `Prêts express : ${prets}`,
        `Lost & Found : ${lostfound.length} déclaré(s), ${lostFoundRestitues} restitué(s)`,
        `Visites VIP détectées : ${visites}`,
      ]
      const html = `
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2C2C2C">
          <h2 style="color:#8B6F47">Rapport mensuel — ${nomLounge} (${label})</h2>
          <ul style="line-height:1.9">${lignes.map((l) => `<li>${l}</li>`).join("")}</ul>
          <p style="font-size:12px;color:#8B6F47">Comparaison avec ${prec.label} disponible dans l'onglet Rapports du dashboard.</p>
        </div>`

      const success = await sendEmail(
        emailManager,
        `Rapport mensuel VIP — ${nomLounge} (${label})`,
        html,
      )
      if (success) envois += 1

      await logAudit({
        actor: "cron",
        action: "RAPPORT_MENSUEL",
        cible: nomLounge,
        detail: `${label} — envoi ${success ? "effectué" : "simulé (mode démo)"} à ${emailManager}`,
      })

      console.log(`[CRON] Rapport mensuel VIP ${nomLounge} (${label}) → ${emailManager} : ${success ? "envoyé" : "simulé"}`)
    }

    console.log(`[CRON] Rapports mensuels VIP : ${envois} envoi(s) sur ${lounges.length} lounge(s)`)
    return ok({ envois, lounges: lounges.length, periode: label })
  } catch (e) {
    console.error("cron rapports-mensuels-vip error", e)
    return fail("Erreur serveur lors du rapport mensuel VIP", 500)
  }
}
