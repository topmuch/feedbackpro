// ============================================================
// /api/vip/tables/by-qr/[token] — Endpoint PUBLIC
// ------------------------------------------------------------
// Résout un qrToken scanné par un client vers les infos publiques
// de la table associée. Utilisé par <VipTableScan /> côté client
// (pas de session requise — le client n'est pas authentifié).
//
// DÉTECTION VIP (règle killer #2) : si un client VIP est reconnu
// (nom sur la table, deviceId déjà vu ou carte d'embarquement),
// sa visite est enregistrée et une alerte VISUELLE Maître d'Hôtel
// (nom + photo) est déclenchée instantanément. Le scan renvoie
// aussi préférences + allergies pour l'accueil Nathalie.
//
// AUTO-SEED : si aucune table n'existe en DB, on en crée 12
// automatiquement (T-01 à T-12) pour que le scan fonctionne
// même sur une DB fraîchement resetée.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import crypto from 'crypto'
import {
  trouverVipPourDetection,
  enregistrerDetectionVip,
  parseStringArray,
} from '@/lib/vip-clients'

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
  req: NextRequest,
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
      clientName: true,
      clientVipLevel: true,
    },
  })

  if (!table) {
    return fail('Table introuvable pour ce QR code', 404)
  }

  // deviceId optionnel (localStorage côté scan) → reconnaissance "retour client"
  const deviceId = new URL(req.url).searchParams.get('deviceId')?.trim().slice(0, 100) || null

  // Détection VIP (règle killer #2) : nom sur table > device > carte embarquement
  let vipClient: {
    id: string
    name: string
    photo: string | null
    vipLevel: string
    preferences: string[]
    allergies: string[]
    airline: string | null
    visitCount: number
    consentPhoto: boolean
  } | null = null

  const match = await trouverVipPourDetection({
    name: table.clientName,
    deviceId,
    canal: 'scan',
  })

  if (match) {
    // Visite + alerte Maître d'Hôtel (visuelle, nom + photo) — anti-spam 10 min
    await enregistrerDetectionVip({
      client: {
        id: match.client.id,
        name: match.client.name,
        photo: match.client.photo,
        vipLevel: match.client.vipLevel,
        airline: match.client.airline,
      },
      input: {
        name: table.clientName,
        deviceId,
        tableNumber: table.tableNumber,
        canal: 'scan',
        detection: match.critere,
      },
    })

    vipClient = {
      id: match.client.id,
      name: match.client.name,
      photo: match.client.consentPhoto ? match.client.photo : null,
      vipLevel: match.client.vipLevel,
      preferences: parseStringArray(match.client.preferences),
      allergies: parseStringArray(match.client.allergies),
      airline: match.client.airline,
      visitCount: match.client.visitCount + 1,
      consentPhoto: match.client.consentPhoto,
    }
  }

  return ok({
    id: table.id,
    tableNumber: table.tableNumber,
    zone: table.zone,
    seats: table.seats,
    status: table.status,
    clientName: table.clientName,
    clientVipLevel: table.clientVipLevel,
    vipClient,
  })
}
