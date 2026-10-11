// ============================================================
// FeedbackPro - Cron : rapports quotidiens du Coach IA
// GET /api/cron/rapports-quotidiens
// ------------------------------------------------------------
// Planifié chaque jour à 7h00 UTC par Vercel Cron (vercel.json).
// Peut aussi être appelé manuellement :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedbackpro.fr/api/cron/rapports-quotidiens
//
// Génère le rapport quotidien de chaque Pro :
//   - frequenceRapport = "quotidien"
//   - non suspendu
//   - ayant reçu au moins un retour sur les 24 dernières heures
// La génération passe par src/lib/ia.ts (fallback déterministe si
// le LLM échoue) et l'email au destinataire configuré est non bloquant.
// → { ok, data: { rapports: [{ proId, rapportId, scoreGlobal, source }] } }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { genererEtEnregistrerRapport } from "@/lib/ia"

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

    // ---------- Cibles : Pros quotidiens, non suspendus, avec retours sur 24 h ----------
    const ilYA24h = new Date(Date.now() - 24 * 3600 * 1000)

    const pros = await db.pro.findMany({
      where: {
        frequenceRapport: "quotidien",
        suspendu: false,
        retours: { some: { createdAt: { gte: ilYA24h } } },
      },
      orderBy: { createdAt: "asc" },
    })

    console.log(`[CRON] Rapports quotidiens : ${pros.length} établissement(s) à auditer`)

    // ---------- Génération séquentielle (politesse envers le LLM) ----------
    const rapports: { proId: string; rapportId: string; scoreGlobal: number; source: string }[] = []
    for (const pro of pros) {
      try {
        const { rapport, source } = await genererEtEnregistrerRapport(pro, "quotidien", {
          envoyerEmail: true,
        })
        rapports.push({
          proId: pro.id,
          rapportId: rapport.id,
          scoreGlobal: rapport.scoreGlobal,
          // "ia" = généré par le LLM · "fallback" = rapport déterministe
          source,
        })
      } catch (e) {
        // Un échec pour un Pro ne doit jamais interrompre la série
        console.error(`[CRON] Rapport impossible pour ${pro.nomEtablissement}`, e)
      }
    }

    console.log(`[CRON] Rapports quotidiens générés : ${rapports.length}/${pros.length}`)
    return ok({ rapports })
  } catch (e) {
    console.error("cron rapports-quotidiens error", e)
    return fail("Erreur serveur lors de la génération des rapports quotidiens", 500)
  }
}
