// ============================================================
// Feature 2 — Auto-Audit du Matin : API Pro
// ------------------------------------------------------------
// GET  /api/pro/audit-matin
//   → génère (ou récupère si déjà complété aujourd'hui) la checklist
//     du matin basée sur les retours des dernières 24h (LLM + fallback).
//     Réponse : { audit: AuditMatin | null, checklist: ItemChecklist[],
//                 source: "ia"|"fallback", dejaComplete: boolean, donnees,
//                 airportStats? }
//
//     Si le Pro a typeEtablissement === "Aéroport", on ajoute un champ
//     `airportStats` agrégeant les signalements aéroport des dernières 24h
//     (total, par statut, par zone, conformité SLA moyenne).
//
// POST /api/pro/audit-matin
//   → enregistre l'audit complété par le manager (items validés/invalidés
//     + photos + notes + score auto-calculé). Réponse : { audit }
//     Si un audit existe déjà pour aujourd'hui, on l'écrase (mise à jour).
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { AIRPORT_ZONES } from "@/lib/airport-config"
import {
  genererChecklistMatin,
  serialiserAudit,
  calculerScoreManager,
  type ItemAuditSoumis,
} from "@/lib/audit-matin"

/** Bornes du jour courant (00:00:00 → 23:59:59 en local) */
function bornesDuJour(): { debut: Date; fin: Date } {
  const now = new Date()
  const debut = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { debut, fin }
}

// ---------- Types pour la section aéroport ----------

export type AirportZoneStat = {
  code: string
  nom: string
  emoji: string
  count: number
  enAttente: number
}

export type AirportStats = {
  total24h: number
  enAttente: number
  enCours: number
  resolus: number
  byZone: AirportZoneStat[]
  /** Conformité SLA moyenne (%) sur les zones ayant un objectif défini */
  slaCompliance: number
}

/**
 * Calcule les statistiques des signalements aéroport sur les dernières 24h.
 * Ne lève jamais d'exception : en cas d'erreur BDD, renvoie des zéros.
 *
 * - total24h / enAttente / enCours / resolus : comptages globaux
 * - byZone : pour chacune des 5 zones canoniques (bagages, sanitaires,
 *   files_attente, embarquement, restauration), le count total + nb en attente
 * - slaCompliance : moyenne pondérée du % de signalements résolus dans le
 *   target SLA de leur zone (AirportSla.targetMinutes). Si aucune zone n'a
 *   d'objectif SLA défini ou aucun signalement résolu, renvoie 100 (par
 *   défaut « tout va bien ») pour ne pas fausser l'audit visuel.
 */
async function calculerAirportStats(): Promise<AirportStats> {
  const ilYa24h = new Date(Date.now() - 24 * 3600 * 1000)

  const [reports, slas] = await Promise.all([
    db.airportReport.findMany({
      where: { createdAt: { gte: ilYa24h } },
      include: { zone: { select: { code: true, nom: true, emoji: true } } },
    }),
    db.airportSla.findMany(),
  ])

  const total24h = reports.length
  const enAttente = reports.filter((r) => r.statut === "EN_ATTENTE").length
  const enCours = reports.filter((r) => r.statut === "EN_COURS").length
  const resolus = reports.filter((r) => r.statut === "RESOLU").length

  // Indexe les objectifs SLA par code zone
  const slaByZone = new Map<string, number>()
  for (const s of slas) {
    if (s.active && s.targetMinutes > 0) slaByZone.set(s.zoneCode, s.targetMinutes)
  }

  // Indexe les reports par code zone (via r.zone.code)
  const parZone = new Map<
    string,
    { count: number; enAttente: number; resolus: number; resolusDansSla: number }
  >()
  for (const z of AIRPORT_ZONES) {
    parZone.set(z.code, { count: 0, enAttente: 0, resolus: 0, resolusDansSla: 0 })
  }
  for (const r of reports) {
    const code = r.zone?.code
    if (!code) continue
    const cur = parZone.get(code)
    if (!cur) continue
    cur.count++
    if (r.statut === "EN_ATTENTE") cur.enAttente++
    if (r.statut === "RESOLU" && r.resolvedAt) {
      cur.resolus++
      const target = slaByZone.get(code)
      if (target) {
        const elapsedMin = (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60_000
        if (elapsedMin <= target) cur.resolusDansSla++
      } else {
        // Pas de SLA défini pour cette zone : on considère que c'est conforme
        // (n'affecte ni positivement ni négativement la moyenne).
      }
    }
  }

  // Construit byZone dans l'ordre canonique des zones aéroport
  const byZone: AirportZoneStat[] = AIRPORT_ZONES.map((z) => {
    const cur = parZone.get(z.code) ?? { count: 0, enAttente: 0 }
    return { code: z.code, nom: z.nom, emoji: z.emoji, count: cur.count, enAttente: cur.enAttente }
  })

  // Conformité SLA moyenne : moyenne des conformités par zone qui ont un SLA
  // ET au moins un signalement résolu sur la période.
  const conformites: number[] = []
  for (const z of AIRPORT_ZONES) {
    const target = slaByZone.get(z.code)
    if (!target) continue
    const cur = parZone.get(z.code)
    if (!cur || cur.resolus === 0) continue
    conformites.push(Math.round((cur.resolusDansSla / cur.resolus) * 100))
  }
  const slaCompliance =
    conformites.length > 0
      ? Math.round(conformites.reduce((a, b) => a + b, 0) / conformites.length)
      : 100

  return { total24h, enAttente, enCours, resolus, byZone, slaCompliance }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const { debut, fin } = bornesDuJour()
    const isAeroport = ctx.pro.typeEtablissement === "Aéroport"

    // Calcul parallèle : stats aéroport (si applicable) + lookup audit existant
    const [existant, airportStats] = await Promise.all([
      db.auditMatin.findFirst({
        where: { proId: ctx.pro.id, date: { gte: debut, lte: fin } },
        orderBy: { createdAt: "desc" },
      }),
      isAeroport ? calculerAirportStats() : Promise.resolve(null),
    ])

    if (existant) {
      // Audit déjà complété aujourd'hui → on renvoie l'audit + la checklist
      // d'origine (items tels qu'enregistrés, validés/invalidés).
      return ok({
        audit: serialiserAudit(existant),
        checklist: null,
        source: existant.items ? "ia" : "fallback",
        dejaComplete: true,
        ...(airportStats ? { airportStats } : {}),
      })
    }

    // Pas d'audit aujourd'hui → on génère la checklist du matin
    const { items, source, donnees } = await genererChecklistMatin({
      id: ctx.pro.id,
      nomEtablissement: ctx.pro.nomEtablissement,
      typeEtablissement: ctx.pro.typeEtablissement,
    })

    return ok({
      audit: null,
      checklist: items,
      source,
      dejaComplete: false,
      donnees: {
        total: donnees.total,
        totalNegatifs: donnees.totalNegatifs,
        noteMoyenne: Number(donnees.noteMoyenne.toFixed(2)),
        topTagsNegatifs: donnees.topTagsNegatifs,
        zonesProblematiques: donnees.zonesProblematiques.map((z) => ({
          zone: z.zone,
          noteMoyenne: Number(z.noteMoyenne.toFixed(2)),
          negatifs: z.negatifs,
          total: z.total,
        })),
      },
      ...(airportStats ? { airportStats } : {}),
    })
  } catch (e) {
    console.error("audit-matin GET error", e)
    return fail("Erreur serveur lors de la génération de l'audit du matin", 500)
  }
}

// ---------- POST : enregistrement de l'audit complété ----------

const itemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  urgence: z.enum(["haute", "moyenne", "basse"]).optional(),
  photoRequise: z.boolean().optional(),
  valide: z.boolean(),
  photoUrl: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

const postSchema = z.object({
  items: z.array(itemSchema).min(1, "Au moins un item est requis").max(6, "6 items maximum"),
  photoUrls: z.array(z.string().trim().max(500)).max(20).optional().default([]),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Données invalides", 400)

    const { items, photoUrls, notes } = parsed.data
    const scoreManager = calculerScoreManager(items as ItemAuditSoumis[])

    const { debut, fin } = bornesDuJour()

    // Si un audit existe déjà pour aujourd'hui, on l'écrase (mise à jour)
    const existant = await db.auditMatin.findFirst({
      where: { proId: ctx.pro.id, date: { gte: debut, lte: fin } },
      orderBy: { createdAt: "desc" },
    })

    const data = {
      proId: ctx.pro.id,
      date: new Date(),
      items: JSON.stringify(items),
      photoUrls: JSON.stringify(photoUrls),
      scoreManager,
      notes: notes ?? null,
    }

    const audit = existant
      ? await db.auditMatin.update({ where: { id: existant.id }, data })
      : await db.auditMatin.create({ data })

    return ok({ audit: serialiserAudit(audit) })
  } catch (e) {
    console.error("audit-matin POST error", e)
    return fail("Erreur serveur lors de l'enregistrement de l'audit", 500)
  }
}
