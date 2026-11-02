// ============================================================
// API Pro - Statistiques avancées (pivot Zones, enrichi Session 4)
// GET /api/pro/stats?periode=7j|30j|90j|1an   (défaut : 30j)
// → courbe (courbe30j), parTag, parHeure (7 jours × 24 h), parZone, kpis
// Forme de parHeure : lignes { jour (0=Lundi…6=Dimanche), heure, total }
// (contrat attendu par stats-tab.tsx) — la matrice complète est aussi
// fournie sous `parHeureMatrice` pour tout autre consommateur.
// Session 4 : la période est paramétrable (7j / 30j / 90j / 1 an) et
// s'applique à la courbe, aux tags, à la heatmap et aux KPIs.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { POSITIVE_TAGS, NEGATIVE_TAGS, tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"

const PERIODES: Record<string, number> = { "7j": 7, "30j": 30, "90j": 90, "1an": 365 }

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // ---------- Période (Session 4) ----------
    const periodeBrute = req.nextUrl.searchParams.get("periode") || "30j"
    const nbJours = PERIODES[periodeBrute] ?? 30

    // ---------- Filtre par zone (optionnel : ?zone=<zoneNom>) ----------
    // Limite les retours à une zone précise pour affiner les graphiques.
    const zoneFiltre = req.nextUrl.searchParams.get("zone")?.trim() || null

    const now = new Date()
    const debut = new Date(now)
    debut.setHours(0, 0, 0, 0)
    debut.setDate(debut.getDate() - (nbJours - 1)) // période glissante, jour courant inclus

    const retours = await db.retour.findMany({
      where: {
        proId: ctx.pro.id,
        createdAt: { gte: debut },
        ...(zoneFiltre ? { zone: { nom: zoneFiltre } } : {}),
      },
      include: { zone: { select: { nom: true } } },
      orderBy: { createdAt: "asc" },
    })

    // ---------- Courbe (N jours selon la période) ----------
    // Alias `jour`/`note`/`count` : consommés par stats-tab.tsx en plus de
    // `date`/`score`/`retours` (le composant lit p.jour ?? p.date, etc.).
    // `noteMoy` : note moyenne réelle sur /5 (pour l'axe Y 0-5).
    type PointCourbe = {
      date: string
      jour: string
      score: number
      note: number
      noteMoy: number
      retours: number
      count: number
    }
    const courbe: PointCourbe[] = []
    // Sur 1 an, un point par jour alourdirait la lecture : agrégation par semaine
    const pasSemaine = nbJours > 180
    if (pasSemaine) {
      for (let d = nbJours - 1; d >= 0; d -= 7) {
        const fin = new Date(now)
        fin.setHours(23, 59, 59, 999)
        fin.setDate(fin.getDate() - d)
        const debutSem = new Date(fin)
        debutSem.setHours(0, 0, 0, 0)
        debutSem.setDate(debutSem.getDate() - 6)
        const deLaSemaine = retours.filter((r) => r.createdAt >= debutSem && r.createdAt <= fin)
        const moyenne = deLaSemaine.length
          ? deLaSemaine.reduce((s, r) => s + r.note, 0) / deLaSemaine.length
          : 0
        const score = deLaSemaine.length ? Math.round(moyenne * 20) : 0
        const date = fin.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
        courbe.push({
          date,
          jour: date,
          score,
          note: score,
          noteMoy: Number(moyenne.toFixed(2)),
          retours: deLaSemaine.length,
          count: deLaSemaine.length,
        })
      }
    } else {
      for (let d = 0; d < nbJours; d++) {
        const jour = new Date(debut)
        jour.setDate(jour.getDate() + d)
        const lendemain = new Date(jour)
        lendemain.setDate(lendemain.getDate() + 1)
        const duJour = retours.filter((r) => r.createdAt >= jour && r.createdAt < lendemain)
        const moyenne = duJour.length
          ? duJour.reduce((s, r) => s + r.note, 0) / duJour.length
          : 0
        const score = duJour.length ? Math.round(moyenne * 20) : 0
        const date = jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
        courbe.push({
          date,
          jour: date,
          score,
          note: score,
          noteMoy: Number(moyenne.toFixed(2)),
          retours: duJour.length,
          count: duJour.length,
        })
      }
    }

    // ---------- Répartition par tag (identifiés + libellés) ----------
    const compteurTags = new Map<string, number>()
    for (const r of retours) {
      for (const t of parseJsonArray(r.tags)) {
        compteurTags.set(t, (compteurTags.get(t) ?? 0) + 1)
      }
    }
    const idsPositifs = new Set(POSITIVE_TAGS.map((t) => t.id))
    const idsNegatifs = new Set(NEGATIVE_TAGS.map((t) => t.id))
    const parTag = [...compteurTags.entries()]
      .map(([id, count]) => ({
        id,
        label: tagLabel(id),
        count,
        type: idsPositifs.has(id) ? "positif" : idsNegatifs.has(id) ? "negatif" : "libre",
      }))
      .sort((a, b) => b.count - a.count)

    // ---------- Heatmap 7 jours × 24 heures (Lundi → Dimanche) ----------
    // Matrice interne [jour][heure] puis export en lignes { jour, heure, total }
    // (forme consommée par stats-tab.tsx pour reconstruire sa heatmap).
    const matriceHeure: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
    for (const r of retours) {
      // getDay() : 0 = dimanche → index JOURS (0 = lundi) = (getDay() + 6) % 7
      const jourIndex = (r.createdAt.getDay() + 6) % 7
      matriceHeure[jourIndex][r.createdAt.getHours()] += 1
    }
    const parHeure: { jour: number; heure: number; total: number }[] = []
    for (let j = 0; j < 7; j++) {
      for (let h = 0; h < 24; h++) {
        if (matriceHeure[j][h] > 0) {
          parHeure.push({ jour: j, heure: h, total: matriceHeure[j][h] })
        }
      }
    }

    // ---------- Performance par zone ----------
    const zonesMap = new Map<string, number[]>()
    for (const r of retours) {
      const nom = r.zone?.nom ?? "Non définie"
      const notes = zonesMap.get(nom) ?? []
      notes.push(r.note)
      zonesMap.set(nom, notes)
    }
    const parZone = [...zonesMap.entries()]
      .map(([zoneNom, notes]) => ({
        zoneNom,
        noteMoy: notes.length ? Number((notes.reduce((s, n) => s + n, 0) / notes.length).toFixed(2)) : 0,
        total: notes.length,
      }))
      .sort((a, b) => b.total - a.total)

    // ---------- KPIs (période sélectionnée) ----------
    const total = retours.length
    const noteMoyenne = total ? retours.reduce((s, r) => s + r.note, 0) / total : 0
    const reclamations = retours.filter((r) => r.note <= 3)
    const interceptees = reclamations.filter((r) => r.statut !== "NEW")

    // ---------- D1 : NPS (Net Promoter Score) ----------
    // Calculé sur les retours de la période qui ont un NPS renseigné.
    // Promoteurs = 9-10 · Passifs = 7-8 · Détracteurs = 0-6.
    // NPS = %Promoteurs − %Détracteurs (échelle −100 à +100).
    const retoursAvecNps = retours.filter((r) => r.nps !== null && r.nps !== undefined)
    const promoteurs = retoursAvecNps.filter((r) => (r.nps ?? 0) >= 9).length
    const passifs = retoursAvecNps.filter((r) => (r.nps ?? 0) >= 7 && (r.nps ?? 0) <= 8).length
    const detracteurs = retoursAvecNps.filter((r) => (r.nps ?? 0) <= 6).length
    const totalNps = retoursAvecNps.length
    const npsScore =
      totalNps > 0 ? Math.round(((promoteurs - detracteurs) / totalNps) * 100) : null

    // ---------- D5 : Benchmark sectoriel anonymisé ----------
    // Moyenne des notes de TOUS les Pros du même typeEtablissement (toutes
    // périodes confondues pour avoir un échantillon significatif), comparée
    // à la moyenne de l'établissement sur la période sélectionnée.
    // Anonyme : aucun nom d'établissement n'est divulgué, juste une moyenne.
    let benchmark: {
      scoreEtablissement: number
      scoreSectorielMoyen: number | null
      ecart: number | null
      nbEtablissements: number
    } = {
      scoreEtablissement: Number(noteMoyenne.toFixed(2)),
      scoreSectorielMoyen: null,
      ecart: null,
      nbEtablissements: 0,
    }
    try {
      const prosMemeSecteur = await db.pro.findMany({
        where: { typeEtablissement: ctx.pro.typeEtablissement, suspendu: false },
        select: { id: true },
      })
      const idsPros = prosMemeSecteur.map((p) => p.id)
      if (idsPros.length > 0) {
        const aggregate = await db.retour.aggregate({
          _avg: { note: true },
          _count: { _all: true },
          where: { proId: { in: idsPros } },
        })
        const moySectorielle = aggregate._avg.note ?? null
        benchmark = {
          scoreEtablissement: Number(noteMoyenne.toFixed(2)),
          scoreSectorielMoyen: moySectorielle !== null ? Number(moySectorielle.toFixed(2)) : null,
          ecart: moySectorielle !== null ? Number((noteMoyenne - moySectorielle).toFixed(2)) : null,
          nbEtablissements: idsPros.length,
        }
      }
    } catch (e) {
      console.warn("benchmark sectoriel non calculé (non bloquant)", e)
    }

    return ok({
      periode: periodeBrute,
      nbJours,
      courbe,
      // Alias rétro-compatible (les consommateurs Session 1-3 lisent courbe30j)
      courbe30j: courbe,
      parTag,
      parHeure,
      parHeureMatrice: matriceHeure,
      parZone,
      kpis: {
        total,
        noteMoyenne: Number(noteMoyenne.toFixed(2)),
        scoreGlobal: noteMoyenne > 0 ? Math.round(noteMoyenne * 20) : 0,
        positifs: retours.filter((r) => r.note >= 4).length,
        negatifs: reclamations.length,
        // Alertes = réclamations les plus critiques (note ≤ 2★)
        alertes: retours.filter((r) => r.note <= 2).length,
        tauxInterception: reclamations.length
          ? Math.round((interceptees.length / reclamations.length) * 100)
          : 0,
      },
      // D1 : NPS (Net Promoter Score) sur la période
      nps:
        totalNps > 0
          ? {
              score: npsScore,
              total: totalNps,
              promoteurs,
              passifs,
              detracteurs,
              pctPromoteurs: Math.round((promoteurs / totalNps) * 100),
              pctPassifs: Math.round((passifs / totalNps) * 100),
              pctDetracteurs: Math.round((detracteurs / totalNps) * 100),
            }
          : null,
      // D5 : Benchmark sectoriel anonymisé
      benchmark,
    })
  } catch (e) {
    console.error("stats error", e)
    return fail("Erreur serveur", 500)
  }
}
