// ============================================================
// API Pro - Leaderboard & gamification de l'équipe (Task 3 étendu)
// GET /api/pro/leaderboard?periode=mois|trimestre|tout (défaut : mois)
//      ?jours=30 (legacy, mappé sur periode)
// → {
//     top: [{ employeId, nom, poste, positifs, negatifs, noteMoy, badge,
//             badges: string[], nbRetours, tendance }],
//     recommandations: [{ employeId, nom, texte, gravite }],
//     periode: "mois" | "trimestre" | "tout"
//   }
// Règles de gestion :
//  - Top Performer : meilleure note moyenne (>= 4.0) du mois
//  - Étoile montante : amélioration > +0.5 vs mois précédent
//  - Régulier : >= 10 retours reçus sur la période
//  - En progrès : tendance positive (noteMoisCourant > noteMoisPrecedent)
//  - À surveiller : score < 3.0 ou tendance négative
// Recommandations Session 4 : phrases motivées avec données réelles
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"

type Periode = "mois" | "trimestre" | "tout"

function periodeVersJours(p: Periode): number {
  if (p === "mois") return 30
  if (p === "trimestre") return 90
  return 365 // "tout" — on plafonne à 1 an pour rester lisible
}

function periodeDepuisReq(req: NextRequest): Periode {
  const sp = req.nextUrl.searchParams
  const p = sp.get("periode")
  if (p === "mois" || p === "trimestre" || p === "tout") return p
  // Legacy : ?jours=30 → mois, 90 → trimestre, 365+ → tout
  const jours = Number(sp.get("jours") || 0)
  if (jours >= 365) return "tout"
  if (jours >= 60) return "trimestre"
  return "mois"
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const periode = periodeDepuisReq(req)
    const jours = periodeVersJours(periode)
    const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000)

    // Pour calculer la tendance (mois courant vs mois précédent), on a
    // aussi besoin des retours sur la période précédente de même durée.
    const depuisPrecedent = new Date(depuis.getTime() - jours * 24 * 3600 * 1000)

    const employes = await db.employe.findMany({
      where: { proId: ctx.pro.id, actif: true },
      include: {
        retours: {
          // On charge une fenêtre large pour pouvoir calculer la tendance
          where: { createdAt: { gte: depuisPrecedent } },
          select: { note: true, tags: true, createdAt: true },
        },
      },
    })

    // Note moyenne du mois précédent (pour détecter l'amélioration)
    function noteMoyennePeriode(
      retours: { note: number; createdAt: Date }[],
      debut: Date,
      fin: Date
    ): number {
      const fenetre = retours.filter(
        (r) => r.createdAt >= debut && r.createdAt < fin
      )
      if (fenetre.length === 0) return 0
      return Number(
        (fenetre.reduce((s, r) => s + r.note, 0) / fenetre.length).toFixed(2)
      )
    }

    type LigneTop = {
      employeId: string
      nom: string
      poste: string | null
      positifs: number
      negatifs: number
      noteMoy: number
      nbRetours: number
      tendance: number // noteCourante - notePrecedente (peut être négative)
      badge: string | null // legacy ( Employé du mois / Entretien recommandé )
      badges: string[] // Task 3 — nouveaux badges (topPerformer, etoileMontante, regulier, enProgres, aSurveiller)
    }

    const lignes: LigneTop[] = employes.map((e) => {
      // Retours sur la période courante (depuis `depuis` jusqu'à maintenant)
      const retoursCourants = e.retours.filter((r) => r.createdAt >= depuis)
      const positifs = retoursCourants.filter((r) => r.note >= 4).length
      const negatifs = retoursCourants.filter((r) => r.note <= 3).length
      const noteMoy = retoursCourants.length
        ? Number(
            (retoursCourants.reduce((s, r) => s + r.note, 0) / retoursCourants.length).toFixed(2)
          )
        : 0
      // Note moyenne de la période précédente (même durée, juste avant `depuis`)
      const noteMoyPrecedente = noteMoyennePeriode(
        e.retours,
        depuisPrecedent,
        depuis
      )
      const tendance =
        noteMoyPrecedente > 0 ? Number((noteMoy - noteMoyPrecedente).toFixed(2)) : 0

      // Legacy badge (conservé pour compat)
      const badge =
        positifs > 20 ? "Employé du mois" : negatifs > 10 ? "Entretien recommandé" : null

      return {
        employeId: e.id,
        nom: e.nom,
        poste: e.poste,
        positifs,
        negatifs,
        noteMoy,
        nbRetours: retoursCourants.length,
        tendance,
        badge,
        badges: [],
      }
    })

    // ----- Task 3 : calcul des nouveaux badges -----
    // 1. Top Performer : meilleure note moyenne (>= 4.0)
    const topPerformers = lignes
      .filter((l) => l.noteMoy >= 4.0 && l.nbRetours > 0)
      .sort((a, b) => b.noteMoy - a.noteMoy)
    const topPerformerId = topPerformers[0]?.employeId

    for (const l of lignes) {
      const badges: string[] = []
      if (l.employeId === topPerformerId) badges.push("topPerformer")
      if (l.tendance > 0.5) badges.push("etoileMontante")
      if (l.nbRetours >= 10) badges.push("regulier")
      if (l.tendance > 0 && l.tendance <= 0.5) badges.push("enProgres")
      if (l.noteMoy > 0 && l.noteMoy < 3.0) badges.push("aSurveiller")
      if (l.tendance < 0 && l.tendance !== 0) badges.push("aSurveiller")
      l.badges = badges
    }

    // Tri : meilleure note moyenne d'abord, puis volume positif
    const top = lignes.sort((a, b) => {
      if (b.noteMoy !== a.noteMoy) return b.noteMoy - a.noteMoy
      return b.positifs - a.positifs
    })

    // ---------- Recommandations IA détaillées (Session 4, §6) ----------
    type Recommandation = { employeId: string; nom: string; texte: string; gravite: "attention" | "positif" }
    const recommandations: Recommandation[] = []

    for (const e of employes) {
      const retoursCourants = e.retours.filter((r) => r.createdAt >= depuis)
      const retoursNeg = retoursCourants.filter((r) => r.note <= 3)
      const retoursPos = retoursCourants.filter((r) => r.note >= 4)

      if (retoursNeg.length >= 3) {
        const compteTags = new Map<string, number>()
        for (const r of retoursNeg) {
          for (const t of parseJsonArray(r.tags)) compteTags.set(t, (compteTags.get(t) ?? 0) + 1)
        }
        const [tagDominant, count] = [...compteTags.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
        if (tagDominant && count && count >= 2) {
          recommandations.push({
            employeId: e.id,
            nom: e.nom,
            texte: `${e.nom} a ${count} signalement(s) « ${tagLabel(tagDominant)} » sur les ${jours} derniers jours → entretien recommandé`,
            gravite: "attention",
          })
          continue
        }
        recommandations.push({
          employeId: e.id,
          nom: e.nom,
          texte: `${e.nom} cumule ${retoursNeg.length} retours négatifs sur ${jours} jours → accompagnement managérial conseillé`,
          gravite: "attention",
        })
        continue
      }

      if (retoursPos.length >= 5) {
        recommandations.push({
          employeId: e.id,
          nom: e.nom,
          texte: `${e.nom} a ${retoursPos.length} mentions positives sur ${jours} jours → félicitations à partager en briefing`,
          gravite: "positif",
        })
      }
    }

    recommandations.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "attention" ? -1 : 1))

    return ok({
      top,
      recommandations: recommandations.slice(0, 5),
      periode,
      jours,
    })
  } catch (e) {
    console.error("leaderboard error", e)
    return fail("Erreur serveur", 500)
  }
}
