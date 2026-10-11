// ============================================================
// API Pro - Le Coach IA (pivot Session 1)
// GET  /api/pro/coach → dernier rapport + priorités du jour + indicateurs
// POST /api/pro/coach { type?: "quotidien" | "hebdomadaire" } → { rapport }
//
// La génération passe par src/lib/ia.ts : en cas d'échec du LLM,
// un rapport déterministe est produit — jamais d'erreur 500 brute.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRapport, genererEtEnregistrerRapport } from "@/lib/ia"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const { pro } = ctx

    const now = new Date()

    // ---------- Dernier rapport (JSON parsé) ----------
    const dernier = await db.rapportIA.findFirst({
      where: { proId: pro.id },
      orderBy: { createdAt: "desc" },
    })
    const dernierSerialise = dernier ? serialiserRapport(dernier) : null

    // ---------- Indicateurs ----------
    const ilYA24h = new Date(now.getTime() - 24 * 3600 * 1000)
    const ilYA7j = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    const ilYA14j = new Date(now.getTime() - 14 * 24 * 3600 * 1000)
    const ilYA30j = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
    const ilYA60j = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

    // Un seul fetch couvre toutes les fenêtres (volume maîtrisé)
    const retours = await db.retour.findMany({
      where: { proId: pro.id, createdAt: { gte: ilYA60j } },
      select: { note: true, createdAt: true },
    })

    const moyenneFenetre = (debut: Date, fin: Date) => {
      const r = retours.filter((x) => x.createdAt >= debut && x.createdAt < fin)
      return r.length ? r.reduce((s, x) => s + x.note, 0) / r.length : 0
    }

    const note7j = moyenneFenetre(ilYA7j, now)
    const note30j = moyenneFenetre(ilYA30j, now)
    const note30jPrecedentes = moyenneFenetre(ilYA60j, ilYA30j)

    const scoreGlobal30j = note30j > 0 ? Math.round(note30j * 20) : 0
    const evolutionPct =
      note30jPrecedentes > 0 && note30j > 0
        ? Math.round(((note30j - note30jPrecedentes) / note30jPrecedentes) * 100)
        : 0

    const [retours24h, alertesNonLues] = await Promise.all([
      db.retour.count({ where: { proId: pro.id, createdAt: { gte: ilYA24h } } }),
      db.alerte.count({ where: { proId: pro.id, lu: false } }),
    ])

    // ---------- Historique des rapports (10 derniers) ----------
    const rapports = await db.rapportIA.findMany({
      where: { proId: pro.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, createdAt: true, scoreGlobal: true },
    })

    return ok({
      dernierRapport: dernierSerialise,
      prioritesDuJour: dernierSerialise?.priorites ?? [],
      indicateurs: {
        retours24h,
        alertesNonLues,
        noteMoyenne7j: Number(note7j.toFixed(2)),
        scoreGlobal30j,
        evolutionPct,
      },
      historique: rapports.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        scoreGlobal: r.scoreGlobal,
      })),
    })
  } catch (e) {
    console.error("coach GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json().catch(() => ({}))
    const typeDemande = body?.type
    // Fréquence du Pro par défaut, ou type explicite validé
    const type: "quotidien" | "hebdomadaire" =
      typeDemande === "hebdomadaire" || typeDemande === "quotidien"
        ? typeDemande
        : ctx.pro.frequenceRapport === "hebdomadaire"
          ? "hebdomadaire"
          : "quotidien"

    // genererEtEnregistrerRapport ne lève jamais d'exception pour la
    // génération (fallback déterministe) — seul un incident DB peut échouer.
    const { rapport } = await genererEtEnregistrerRapport(ctx.pro, type, { envoyerEmail: true })
    return ok({ rapport: serialiserRapport(rapport) }, 201)
  } catch (e) {
    console.error("coach POST error", e)
    return fail("Impossible de générer le rapport pour le moment", 500)
  }
}
