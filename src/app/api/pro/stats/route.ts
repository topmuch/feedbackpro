// ============================================================
// API Pro - Statistiques avancées (pivot Zones)
// GET /api/pro/stats
// → courbe30j, parTag, parHeure (7 jours × 24 h), parZone, kpis
// Forme de parHeure : lignes { jour (0=Lundi…6=Dimanche), heure, total }
// (contrat attendu par stats-tab.tsx) — la matrice complète est aussi
// fournie sous `parHeureMatrice` pour tout autre consommateur.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { POSITIVE_TAGS, NEGATIVE_TAGS, tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const now = new Date()
    const debut = new Date(now)
    debut.setHours(0, 0, 0, 0)
    debut.setDate(debut.getDate() - 29) // 30 jours glissants, jour courant inclus

    const retours = await db.retour.findMany({
      where: { proId: ctx.pro.id, createdAt: { gte: debut } },
      include: { zone: { select: { nom: true } } },
      orderBy: { createdAt: "asc" },
    })

    // ---------- Courbe 30 jours ----------
    // Alias `jour`/`note`/`count` : consommés par stats-tab.tsx en plus de
    // `date`/`score`/`retours` (le composant lit p.jour ?? p.date, etc.).
    const courbe30j: {
      date: string
      jour: string
      score: number
      note: number
      retours: number
      count: number
    }[] = []
    for (let d = 0; d < 30; d++) {
      const jour = new Date(debut)
      jour.setDate(jour.getDate() + d)
      const lendemain = new Date(jour)
      lendemain.setDate(lendemain.getDate() + 1)
      const duJour = retours.filter((r) => r.createdAt >= jour && r.createdAt < lendemain)
      const score = duJour.length
        ? Math.round((duJour.reduce((s, r) => s + r.note, 0) / duJour.length) * 20)
        : 0
      courbe30j.push({
        date: jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        jour: jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        score,
        note: score,
        retours: duJour.length,
        count: duJour.length,
      })
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

    // ---------- KPIs (30 jours) ----------
    const total = retours.length
    const noteMoyenne = total ? retours.reduce((s, r) => s + r.note, 0) / total : 0
    const reclamations = retours.filter((r) => r.note <= 3)
    const interceptees = reclamations.filter((r) => r.statut !== "NEW")

    return ok({
      courbe30j,
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
    })
  } catch (e) {
    console.error("stats error", e)
    return fail("Erreur serveur", 500)
  }
}
