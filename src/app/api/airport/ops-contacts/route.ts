// ============================================================
// GET /api/airport/ops-contacts
// ------------------------------------------------------------
// Liste les numéros ops autorisés à interroger le bot WhatsApp
// (model AirportOpsContact). Utilisé par l'onglet « Bot WhatsApp »
// du dashboard aéroport pour afficher le répertoire ops.
//
// Réponse :
//   { ok: true, data: { contacts: [{ id, phone, name, role, actif }] } }
//
// Public pour l'instant (démo) — en production, protéger par
// un cookie de session ops-aéroport (requireAirportOps).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const contacts = await db.airportOpsContact.findMany({
      orderBy: [{ actif: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        actif: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        contacts: contacts.map((c) => ({
          id: c.id,
          phone: c.phone,
          name: c.name,
          role: c.role,
          actif: c.actif,
          createdAt: c.createdAt.toISOString(),
        })),
        count: contacts.length,
        actifs: contacts.filter((c) => c.actif).length,
      },
    })
  } catch (err) {
    console.error('[airport-ops-contacts] Erreur :', err)
    return NextResponse.json(
      { ok: false, error: 'Erreur lors de la récupération des contacts ops' },
      { status: 500 },
    )
  }
}
