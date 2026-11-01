// ============================================================
// FeedbackPro - Sérialiseurs partagés des API routes
// Les champs « STRING JSON » du schéma SQLite (tags, historique,
// zoneIds…) sont systématiquement parsés ici, avec un repli sûr
// en cas de contenu invalide (défaut []).
// ============================================================

import { parseJsonArray } from "@/lib/ia"
import type { Zone, Retour } from "@prisma/client"

/**
 * Parse un champ JSON en tableau typé (sans conversion en String) —
 * utilisé pour l'historique [{ statut, at }] qui contient des objets.
 */
function parseJsonTableau<T>(valeur: string | null | undefined): T[] {
  if (!valeur) return []
  try {
    const parse = JSON.parse(valeur) as unknown
    return Array.isArray(parse) ? (parse as T[]) : []
  } catch {
    return []
  }
}

/** Zone sérialisée pour les réponses API (tags parsés) */
export function serialiserZone(z: Zone) {
  return {
    id: z.id,
    nom: z.nom,
    description: z.description,
    qrToken: z.qrToken,
    tagsPositifs: parseJsonArray(z.tagsPositifs),
    tagsNegatifs: parseJsonArray(z.tagsNegatifs),
    createdAt: z.createdAt.toISOString(),
  }
}

/** Retour détaillé : Retour + zone{nom} + employe{nom}, JSON parsé */
export function serialiserRetour(
  r: Retour & { zone?: { nom: string } | null; employe?: { nom: string } | null }
) {
  return {
    id: r.id,
    proId: r.proId,
    zoneId: r.zoneId,
    employeId: r.employeId,
    note: r.note,
    tags: parseJsonArray(r.tags),
    commentaire: r.commentaire,
    personnelMentionne: r.personnelMentionne,
    emailClient: r.emailClient,
    canalChoisi: r.canalChoisi,
    ipCity: r.ipCity,
    recompenseUtilisee: r.recompenseUtilisee,
    statut: r.statut,
    // D1 : NPS (0-10) — null si non renseigné (note < 4)
    nps: r.nps ?? null,
    // D2 : photo jointe par le client (URL relative /uploads/…)
    photoUrl: r.photoUrl ?? null,
    // Historique : objets { statut, at } — parse sans conversion en String
    historique: parseJsonTableau<{ statut: string; at: string }>(r.historique),
    lu: r.lu,
    reponsePro: r.reponsePro,
    actionPrise: r.actionPrise,
    createdAt: r.createdAt.toISOString(),
    zone: r.zone?.nom ? { nom: r.zone.nom } : null,
    employe: r.employe?.nom ? { nom: r.employe.nom } : null,
  }
}
