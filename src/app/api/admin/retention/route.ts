// ============================================================
// API Superadmin - Dashboard Rétention (Task 3)
// ------------------------------------------------------------
// GET /api/admin/retention → métriques de rétention des Pros :
//   - clientsActifsParMois : [{ mois, count }] (Pro avec ≥1 retour dans le mois)
//   - nouveauxClientsParMois : [{ mois, count }] (Pros créés dans le mois)
//   - tauxChurn : number (%) (Pros suspendus OU sans retour depuis 30j / total)
//   - ltvEstime : number (€) (moyenne prix plan × durée moyenne abonnement)
//   - repartitionPlans : [{ plan, count, pct }] (répartition Pros par plan)
//   - resume : { totalPros, prosActifs, prosSuspendus, prosInactifs }
//
// Toutes les métriques sont calculées côté serveur à partir des Pros,
// Retours et Commandes (Prisma). Aucune donnée client n'est exposée.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS, type PlanId } from "@/lib/constants"

/** Nombre de mois d'historique affiché dans les graphiques (12 derniers mois). */
const NB_MOIS_HISTORIQUE = 12

/** Seuil d'inactivité : un Pro est considéré inactif après 30 jours sans retour. */
const SEUIL_INACTIVITE_J = 30

/** Formate une date en clé mois "AAAA-MM" (pour le groupement par mois). */
function cleMois(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

/** Formate une clé mois "AAAA-MM" en libellé lisible "janv.", "févr."… */
function libelleMois(cle: string): string {
  const [y, m] = cle.split("-").map(Number)
  if (!y || !m) return cle
  const date = new Date(y, m - 1, 1)
  return date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
}

/** Prix mensuel d'un plan (€). Fallback 0 si plan inconnu. */
function prixPlan(plan: string): number {
  const p = PLANS[plan as PlanId]
  return p?.price ?? 0
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    // ---------- Chargement de toutes les données nécessaires ----------
    const maintenant = new Date()
    const ilYA30j = new Date(maintenant.getTime() - SEUIL_INACTIVITE_J * 24 * 3600 * 1000)
    const debutHistorique = new Date(maintenant.getFullYear(), maintenant.getMonth() - (NB_MOIS_HISTORIQUE - 1), 1)

    const [pros, retours] = await Promise.all([
      db.pro.findMany({
        select: {
          id: true,
          plan: true,
          suspendu: true,
          createdAt: true,
          abonnementDebut: true,
        },
      }),
      db.retour.findMany({
        where: { createdAt: { gte: debutHistorique } },
        select: { proId: true, createdAt: true },
      }),
    ])

    const totalPros = pros.length

    // ---------- 1. Clients actifs par mois (Pro avec ≥1 retour dans le mois) ----------
    const actifsParMoisMap = new Map<string, Set<string>>()
    for (let i = 0; i < NB_MOIS_HISTORIQUE; i++) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
      actifsParMoisMap.set(cleMois(d), new Set<string>())
    }
    for (const r of retours) {
      const cle = cleMois(r.createdAt)
      const set = actifsParMoisMap.get(cle)
      if (set) set.add(r.proId)
    }
    const clientsActifsParMois = Array.from(actifsParMoisMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cle, set]) => ({ mois: libelleMois(cle), cle, count: set.size }))

    // ---------- 2. Nouveaux clients par mois (Pros créés dans le mois) ----------
    const nouveauxMap = new Map<string, number>()
    for (let i = 0; i < NB_MOIS_HISTORIQUE; i++) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
      nouveauxMap.set(cleMois(d), 0)
    }
    for (const p of pros) {
      const cle = cleMois(p.createdAt)
      if (nouveauxMap.has(cle)) {
        nouveauxMap.set(cle, (nouveauxMap.get(cle) ?? 0) + 1)
      }
    }
    const nouveauxClientsParMois = Array.from(nouveauxMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cle, count]) => ({ mois: libelleMois(cle), cle, count }))

    // ---------- 3. Taux de churn ----------
    // Pros suspendus OU sans retour depuis 30 jours / total Pros
    const retoursRecentsParPro = new Map<string, Date>()
    for (const r of retours) {
      // On prend le PLUS RÉCENT retour par Pro (sur la fenêtre 12 mois)
      // Pour les retours hors fenêtre, on doit aussi checker — mais pour la
      // simplicité on prend la fenêtre 12 mois qui couvre largement le seuil 30j.
      const current = retoursRecentsParPro.get(r.proId)
      if (!current || r.createdAt > current) {
        retoursRecentsParPro.set(r.proId, r.createdAt)
      }
    }
    let prosInactifs = 0
    let prosActifs = 0
    let prosSuspendus = 0
    for (const p of pros) {
      if (p.suspendu) {
        prosSuspendus++
        prosInactifs++
        continue
      }
      const dernierRetour = retoursRecentsParPro.get(p.id)
      if (!dernierRetour || dernierRetour < ilYA30j) {
        prosInactifs++
      } else {
        prosActifs++
      }
    }
    const tauxChurn = totalPros > 0 ? Math.round((prosInactifs / totalPros) * 100) : 0

    // ---------- 4. LTV estimée (moyenne prix plan × durée moyenne abonnement) ----------
    // Durée moyenne d'abonnement = moyenne (maintenant - abonnementDebut) pour les Pros
    // qui ont un abonnementDebut. En mois.
    let sommeDureeMois = 0
    let countAvecDebut = 0
    let sommePrixPlan = 0
    for (const p of pros) {
      sommePrixPlan += prixPlan(p.plan)
      if (p.abonnementDebut) {
        const dureeMs = maintenant.getTime() - p.abonnementDebut.getTime()
        if (dureeMs > 0) {
          sommeDureeMois += dureeMs / (30 * 24 * 3600 * 1000)
          countAvecDebut++
        }
      }
    }
    const prixPlanMoyen = totalPros > 0 ? sommePrixPlan / totalPros : 0
    const dureeMoyenneMois = countAvecDebut > 0 ? sommeDureeMois / countAvecDebut : 0
    // LTV = prix plan moyen × durée moyenne. Si pas d'abonnement actif, on
    // estime à 6 mois (durée minimale réaliste pour un SaaS B2B).
    const dureeEstimee = dureeMoyenneMois > 0 ? dureeMoyenneMois : 6
    const ltvEstime = Math.round(prixPlanMoyen * dureeEstimee)

    // ---------- 5. Répartition par plan ----------
    const repartitionMap = new Map<string, number>()
    for (const p of pros) {
      repartitionMap.set(p.plan, (repartitionMap.get(p.plan) ?? 0) + 1)
    }
    const repartitionPlans = Array.from(repartitionMap.entries())
      .map(([plan, count]) => ({
        plan,
        count,
        pct: totalPros > 0 ? Math.round((count / totalPros) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    return ok({
      clientsActifsParMois,
      nouveauxClientsParMois,
      tauxChurn,
      prosInactifs,
      prosActifs,
      prosSuspendus,
      ltvEstime,
      dureeMoyenneAbonnementMois: Math.round(dureeMoyenneMois * 10) / 10,
      prixPlanMoyen: Math.round(prixPlanMoyen),
      repartitionPlans,
      resume: {
        totalPros,
        prosActifs,
        prosInactifs,
        prosSuspendus,
      },
      periode: {
        debut: debutHistorique.toISOString(),
        fin: maintenant.toISOString(),
        nbMois: NB_MOIS_HISTORIQUE,
      },
    })
  } catch (e) {
    console.error("admin retention GET error", e)
    return fail("Erreur serveur", 500)
  }
}
