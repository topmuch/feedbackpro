// ============================================================
// API Pro - RGPD : export de toutes les données du Pro (D9)
// POST /api/pro/rgpd/export
// → renvoie un JSON complet (retours, zones, employés, alertes, rapports IA,
//   commandes, notifications, infos compte) pour respecter le droit à la
//   portabilité (RGPD article 20).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail, serializePro } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { parseJsonArray } from "@/lib/ia"

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // Récupère tout en parallèle (tout appartient au Pro via proId / userId)
    const [retours, zones, employes, alertes, rapportsIA, commandes, notifications] =
      await Promise.all([
        db.retour.findMany({
          where: { proId: ctx.pro.id },
          include: { zone: { select: { nom: true } } },
          orderBy: { createdAt: "desc" },
        }),
        db.zone.findMany({ where: { proId: ctx.pro.id }, orderBy: { createdAt: "asc" } }),
        db.employe.findMany({ where: { proId: ctx.pro.id }, orderBy: { createdAt: "asc" } }),
        db.alerte.findMany({ where: { proId: ctx.pro.id }, orderBy: { createdAt: "desc" } }),
        db.rapportIA.findMany({ where: { proId: ctx.pro.id }, orderBy: { createdAt: "desc" } }),
        db.commande.findMany({ where: { proId: ctx.pro.id }, orderBy: { createdAt: "desc" } }),
        db.notification.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" } }),
      ])

    // Sérialise les champs JSON (tags, historique, zoneIds…)
    const data = {
      genereLe: new Date().toISOString(),
      // DROIT À LA PORTABILITÉ — données structurées, réutilisables.
      compte: {
        user: { id: ctx.user.id, email: ctx.user.email, role: ctx.user.role },
        pro: serializePro(ctx.pro),
      },
      zones: zones.map((z) => ({
        id: z.id,
        nom: z.nom,
        description: z.description,
        qrToken: z.qrToken,
        tagsPositifs: parseJsonArray(z.tagsPositifs),
        tagsNegatifs: parseJsonArray(z.tagsNegatifs),
        createdAt: z.createdAt.toISOString(),
      })),
      employes: employes.map((e) => ({
        id: e.id,
        nom: e.nom,
        poste: e.poste,
        zoneIds: parseJsonArray(e.zoneIds),
        actif: e.actif,
        createdAt: e.createdAt.toISOString(),
      })),
      retours: retours.map((r) => ({
        id: r.id,
        note: r.note,
        tags: parseJsonArray(r.tags),
        commentaire: r.commentaire,
        personnelMentionne: r.personnelMentionne,
        // Email du client : inclus (le commerçant en est responsable vis-à-vis
        // du RGPD ; il doit pouvoir restituer les données qu'il détient).
        emailClient: r.emailClient,
        canalChoisi: r.canalChoisi,
        ipCity: r.ipCity,
        nps: r.nps,
        photoUrl: r.photoUrl,
        statut: r.statut,
        historique: (() => {
          try {
            const p = JSON.parse(r.historique) as unknown
            return Array.isArray(p) ? p : []
          } catch {
            return []
          }
        })(),
        lu: r.lu,
        reponsePro: r.reponsePro,
        actionPrise: r.actionPrise,
        createdAt: r.createdAt.toISOString(),
        zone: r.zone?.nom ?? null,
      })),
      alertes: alertes.map((a) => ({
        id: a.id,
        titre: a.titre,
        message: a.message,
        canal: a.canal,
        type: a.type,
        lu: a.lu,
        createdAt: a.createdAt.toISOString(),
      })),
      rapportsIA: rapportsIA.map((r) => ({
        id: r.id,
        type: r.type,
        periodeDebut: r.periodeDebut.toISOString(),
        periodeFin: r.periodeFin.toISOString(),
        scoreGlobal: r.scoreGlobal,
        contenuMarkdown: r.contenuMarkdown,
        priorites: parseJsonArray(r.priorites),
        recommandations: parseJsonArray(r.recommandations),
        predictions: parseJsonArray(r.predictions),
        source: r.source,
        envoyeParEmail: r.envoyeParEmail,
        envoyeParSMS: r.envoyeParSMS,
        createdAt: r.createdAt.toISOString(),
      })),
      commandes: commandes.map((c) => ({
        id: c.id,
        typeSupport: c.typeSupport,
        quantite: c.quantite,
        prixEuros: c.prixEuros,
        adresseLivraison: c.adresseLivraison,
        statut: c.statut,
        numeroSuivi: c.numeroSuivi,
        createdAt: c.createdAt.toISOString(),
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        titre: n.titre,
        message: n.message,
        lu: n.lu,
        createdAt: n.createdAt.toISOString(),
      })),
    }

    // Renvoie le JSON en pièce téléchargeable (Content-Disposition attachment)
    const jsonStr = JSON.stringify(data, null, 2)
    const nomFichier = `feedbackpro-rgpd-${ctx.pro.id}-${new Date().toISOString().slice(0, 10)}.json`
    return new Response(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    console.error("RGPD export error", e)
    return fail("Erreur serveur lors de l'export RGPD", 500)
  }
}
