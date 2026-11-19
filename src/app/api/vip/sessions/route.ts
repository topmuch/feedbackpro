// ============================================================
// /api/vip/sessions — Module 11 (Session Nathalie)
// ------------------------------------------------------------
// Suivi de session client : un token unique par passage QR,
// valable 4 heures. Permet d'identifier un client sans compte
// (Device Nathalie) et de reprendre sa session sans dupliquer.
//
// GET  : liste des sessions.
//        Filtre optionnel : ?active=true → uniquement les
//        sessions non expirées (expiresAt > now).
//        Tri : startedAt DESC, limit 100.
//
// POST : crée ou reprend une session.
//        Body : { qrType?, contextZone?, deviceId? }
//        - Si deviceId fourni et une session active existe pour
//          ce device → on update lastActiveAt et on la renvoie
//          (reprise, pas de doublon).
//        - Sinon on crée une nouvelle session :
//            token = crypto.randomBytes(16).toString('hex')
//            qrType    = body.qrType || 'CLIENT_ZONE'
//            contextZone = body.contextZone || null
//            deviceId  = body.deviceId || null
//            startedAt = now
//            expiresAt = now + 4 heures
//            lastActiveAt = now
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Durée de vie d'une session client (Module 11 — Nathalie) : 4 heures.
const SESSION_TTL_MS = 4 * 60 * 60 * 1000
const MAX_LIMIT = 100

const VALID_QR_TYPES = new Set(['CLIENT_GLOBAL', 'CLIENT_ZONE'])

interface SerializedSession {
  id: string
  token: string
  qrType: string
  contextZone: string | null
  deviceId: string | null
  vipClientId: string | null
  startedAt: string
  expiresAt: string
  lastActiveAt: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function serialize(s: {
  id: string
  token: string
  qrType: string
  contextZone: string | null
  deviceId: string | null
  vipClientId: string | null
  startedAt: Date
  expiresAt: Date
  lastActiveAt: Date
  createdAt: Date
  updatedAt: Date
}): SerializedSession {
  const now = Date.now()
  return {
    id: s.id,
    token: s.token,
    qrType: s.qrType,
    contextZone: s.contextZone,
    deviceId: s.deviceId,
    vipClientId: s.vipClientId,
    startedAt: s.startedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    lastActiveAt: s.lastActiveAt.toISOString(),
    isActive: s.expiresAt.getTime() > now,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

// GET /api/vip/sessions
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const active = url.searchParams.get('active')

  const now = new Date()
  // Filtre optionnel : sessions non expirées uniquement.
  const where: { expiresAt?: { gt: Date } } = {}
  if (active === 'true') where.expiresAt = { gt: now }

  const sessions = await db.clientSession.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: MAX_LIMIT,
  })

  return ok(sessions.map(serialize))
}

// POST /api/vip/sessions
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // Champs optionnels validés
  const qrType =
    typeof body.qrType === 'string' && VALID_QR_TYPES.has(body.qrType)
      ? body.qrType
      : 'CLIENT_ZONE'
  const contextZone =
    typeof body.contextZone === 'string' && body.contextZone.trim()
      ? body.contextZone.trim().slice(0, 80)
      : null
  const deviceId =
    typeof body.deviceId === 'string' && body.deviceId.trim()
      ? body.deviceId.trim().slice(0, 120)
      : null

  const now = new Date()

  // 1. Si deviceId fourni → rechercher une session active pour ce device
  if (deviceId) {
    const active = await db.clientSession.findFirst({
      where: {
        deviceId,
        expiresAt: { gt: now },
      },
      orderBy: { startedAt: 'desc' },
    })
    if (active) {
      // 2. Session active trouvée → on met à jour lastActiveAt et on
      // renvoie la session existante (reprise, pas de doublon).
      const updated = await db.clientSession.update({
        where: { id: active.id },
        data: { lastActiveAt: now },
      })
      return ok(serialize(updated))
    }
  }

  // 3. Aucune session active → création d'une nouvelle session.
  // token = crypto.randomBytes(16).toString('hex') (32 chars hex)
  // La colonne token est @unique : on boucle en cas de collision
  // (probabilité négligeable mais on reste défensif).
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  let created: Awaited<ReturnType<typeof db.clientSession.create>> | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = crypto.randomBytes(16).toString('hex')
    const collision = await db.clientSession.findUnique({
      where: { token },
      select: { id: true },
    })
    if (collision) continue
    try {
      created = await db.clientSession.create({
        data: {
          token,
          qrType,
          contextZone,
          deviceId,
          startedAt: now,
          expiresAt,
          lastActiveAt: now,
        },
      })
      break
    } catch (err) {
      // P2002 = contrainte d'unicité violée (collision sur token) → retry
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002' &&
        attempt < 4
      ) {
        continue
      }
      throw err
    }
  }

  if (!created) {
    return fail('Impossible de générer un token unique après 5 tentatives', 500)
  }

  return ok(serialize(created), 201)
}
