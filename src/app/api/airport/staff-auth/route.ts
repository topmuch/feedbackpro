// ============================================================
// GET /api/airport/staff-auth
// ------------------------------------------------------------
// Récupère la liste des employés actifs pour authentifier le staff
// sur la PWA. Pas d'auth requise (la PWA staff est publique).
//
// Retourne tous les employés actifs de tous les Pro de type
// "Aéroport" — la PWA affiche un sélecteur de noms.
//
// Réponse : { ok: true, data: { employes: [{ id, nom, poste, proId }] } }
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Récupère tous les employés actifs des Pro de type "Aéroport"
    const employes = await db.employe.findMany({
      where: {
        actif: true,
        pro: { typeEtablissement: 'Aéroport' },
      },
      select: {
        id: true,
        nom: true,
        poste: true,
        proId: true,
      },
      orderBy: { nom: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      data: {
        employes: employes.map((e) => ({
          id: e.id,
          nom: e.nom,
          poste: e.poste ?? '',
          proId: e.proId,
        })),
      },
    })
  } catch (err) {
    console.error('[staff-auth] Erreur:', err)
    return NextResponse.json(
      { ok: false, error: 'Impossible de charger la liste du personnel' },
      { status: 500 },
    )
  }
}
