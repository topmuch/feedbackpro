// ============================================================
// Feature 2 — Historique des audits du matin (30 derniers jours)
// GET /api/pro/audit-matin/historique
// ------------------------------------------------------------
// Renvoie la liste des audits du Pro sur les 30 derniers jours,
// triés par date desc. Pour chaque audit : id, date, scoreManager,
// nbItemsValidés / nbItemsTotal, items (JSON parsé).
//
// La route alimente le mini-graphe de tendance et la timeline de
// l'onglet « Audit Matin » du dashboard Pro.
//
// → { ok, data: { audits: AuditSerialise[], comparaison: {...} } }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserAudit } from "@/lib/audit-matin"

/** Parse les items JSON pour compter les validés / total */
function compterItems(itemsJson: string): { valides: number; total: number } {
  try {
    const p = JSON.parse(itemsJson) as unknown
    if (!Array.isArray(p)) return { valides: 0, total: 0 }
    const liste = p as Array<{ valide?: boolean }>
    return {
      valides: liste.filter((it) => it?.valide === true).length,
      total: liste.length,
    }
  } catch {
    return { valides: 0, total: 0 }
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // 30 derniers jours
    const ilYA30j = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const audits = await db.auditMatin.findMany({
      where: { proId: ctx.pro.id, date: { gte: ilYA30j } },
      orderBy: { date: "desc" },
      take: 30,
    })

    // Sérialise avec compte des items validés
    const auditsSerialises = audits.map((a) => {
      const s = serialiserAudit(a)
      const compte = compterItems(a.items)
      return {
        ...s,
        itemsValides: compte.valides,
        itemsTotal: compte.total,
      }
    })

    // ---------- Comparaison "Vision client" vs "Vision manager" ----------
    // Récupère la note moyenne des retours sur les 30 derniers jours pour
    // la comparer au score moyen des audits (transposé sur 5 pour la
    // comparaison visuelle : scoreManager/20 → note sur 5).
    const retours30j = await db.retour.findMany({
      where: { proId: ctx.pro.id, createdAt: { gte: ilYA30j } },
      select: { note: true },
    })
    const noteMoyenneClient =
      retours30j.length > 0
        ? retours30j.reduce((s, r) => s + r.note, 0) / retours30j.length
        : 0
    const scoreMoyenManager =
      audits.length > 0
        ? audits.reduce((s, a) => s + a.scoreManager, 0) / audits.length
        : 0

    return ok({
      audits: auditsSerialises,
      comparaison: {
        noteMoyenneClient: Number(noteMoyenneClient.toFixed(2)),
        // Note transposée : un score manager de 100/100 = 5/5
        noteMoyenneManagerSur5: Number((scoreMoyenManager / 20).toFixed(2)),
        scoreMoyenManager: Number(scoreMoyenManager.toFixed(0)),
        totalRetours30j: retours30j.length,
        totalAudits30j: audits.length,
      },
    })
  } catch (e) {
    console.error("audit-matin historique GET error", e)
    return fail("Erreur serveur lors de la récupération de l'historique", 500)
  }
}
