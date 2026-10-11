// ============================================================
// API Pro - Analyse sémantique des commentaires (Session 5 §5)
// GET /api/pro/coach/themes?jours=30
// ------------------------------------------------------------
// Regroupe les commentaires similaires, détecte les mots-clés
// récurrents et fait émerger les THÈMES CACHÉS (ex: « froid »/
// « tiède » → thème « Température des plats ») même quand aucun
// tag n'a été sélectionné. Implémentation locale déterministe
// (src/lib/semantic.ts) — aucun appel réseau, adapté au volume
// d'un établissement.
// → { ok, data: { jours, commentairesAnalyses, themes, motsCles, groupes } }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { analyserSemantique } from "@/lib/semantic"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // Fenêtre d'analyse : 30 jours par défaut (max 365)
    const paramJours = Number(req.nextUrl.searchParams.get("jours") ?? "30")
    const jours = Number.isFinite(paramJours) ? Math.min(365, Math.max(1, Math.floor(paramJours))) : 30
    const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000)

    const retours = await db.retour.findMany({
      where: { proId: ctx.pro.id, createdAt: { gte: depuis } },
      select: {
        note: true,
        commentaire: true,
        zone: { select: { nom: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const analyse = analyserSemantique(
      retours.map((r) => ({
        commentaire: r.commentaire ?? "",
        note: r.note,
        zoneNom: r.zone?.nom,
      }))
    )

    return ok({
      jours,
      commentairesAnalyses: analyse.commentairesAnalyses,
      totalRetours: retours.length,
      themes: analyse.themes,
      motsCles: analyse.motsCles,
      groupes: analyse.groupes,
    })
  } catch (e) {
    console.error("coach themes GET error", e)
    return fail("Erreur serveur", 500)
  }
}
