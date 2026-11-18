// ============================================================
// /api/vip/tables/by-qr/[token] — Endpoint PUBLIC
// ------------------------------------------------------------
// Résout un qrToken scanné par un client vers les infos publiques
// de la table associée. Utilisé par <VipTableScan /> côté client
// (pas de session requise — le client n'est pas authentifié).
//
// AUTO-SEED : si aucune table n'existe en DB, on en crée 12
// automatiquement (T-01 à T-12) pour que le scan fonctionne
// même sur une DB fraîchement resetée.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function autoSeedTables() {
  const count = await db.vipTable.count()
  if (count > 0) return
  const zones = ['main', 'main', 'main', 'main', 'main', 'buffet', 'buffet', 'buffet', 'relaxation', 'relaxation', 'meeting', 'meeting']
  for (let i = 1; i <= 12; i++) {
    await db.vipTable.create({
      data: {
        tableNumber: `T-${String(i).padStart(2, '0')}`,
        zone: zones[i - 1] || 'main',
        seats: i % 3 === 0 ? 6 : 4,
        qrToken: crypto.randomBytes(12).toString('hex'),
      },
    })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token) return fail('Token manquant', 400)

  // Auto-seed si DB vide
  await autoSeedTables()

  const table = await db.vipTable.findUnique({
    where: { qrToken: token },
    select: {
      id: true,
      tableNumber: true,
      zone: true,
      seats: true,
      status: true,
    },
  })

  if (!table) {
    return fail('Table introuvable pour ce QR code', 404)
  }

  return ok({
    id: table.id,
    tableNumber: table.tableNumber,
    zone: table.zone,
    seats: table.seats,
    status: table.status,
  })
}
