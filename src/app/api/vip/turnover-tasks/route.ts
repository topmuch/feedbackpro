// ============================================================
// /api/vip/turnover-tasks — Module 7 (Débarassage Proactif)
// ------------------------------------------------------------
// Tâches de débarassage générées quand un vol passe en "boarding"
// (ou par création manuelle via cette route POST).
//
// GET  : liste des tâches (TurnoverTask).
//        Filtre optionnel : ?status=pending|assigned|done|cancelled
//        Tri : createdAt DESC, limit 50.
//        Inclut assignedStaff (champ texte libre, pas de relation —
//        on renvoie le nom tel quel, ou null si non assigné).
//
// POST : crée une tâche de débarassage.
//        Body : { flightNo, boardingAt?, zones?, assignedStaff? }
//        - flightNo requis
//        - boardingAt optionnel (ISO string)
//        - zones optionnel : tableau de strings ["relaxation","main"]
//          (sérialisé en JSON string en DB, car la colonne est String)
//        - assignedStaff optionnel (string)
//        - status = "pending" par défaut
//
// PATCH : géré par /api/vip/turnover-tasks/[id]/route.ts (séparé).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50
const VALID_STATUSES = new Set(['pending', 'assigned', 'done', 'cancelled'])

interface SerializedTask {
  id: string
  flightNo: string
  boardingAt: string | null
  zones: string[]
  assignedStaff: string | null
  status: string
  doneAt: string | null
  createdAt: string
  updatedAt: string
}

function safeParseZones(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((z) => typeof z === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

function serialize(t: {
  id: string
  flightNo: string
  boardingAt: Date | null
  zones: string
  assignedStaff: string | null
  status: string
  doneAt: Date | null
  createdAt: Date
  updatedAt: Date
}): SerializedTask {
  return {
    id: t.id,
    flightNo: t.flightNo,
    boardingAt: t.boardingAt ? t.boardingAt.toISOString() : null,
    zones: safeParseZones(t.zones),
    assignedStaff: t.assignedStaff,
    status: t.status,
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

// GET /api/vip/turnover-tasks
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const where: { status?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status

  const tasks = await db.turnoverTask.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_LIMIT,
    // Pas de relation à inclure : assignedStaff est un simple champ texte.
    // On le renvoie directement dans la sérialisation.
  })

  return ok(tasks.map(serialize))
}

// POST /api/vip/turnover-tasks
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // flightNo requis
  if (typeof body.flightNo !== 'string' || !body.flightNo.trim()) {
    return fail('flightNo requis', 400)
  }
  const flightNo = body.flightNo.trim().slice(0, 16).toUpperCase()

  // boardingAt optionnel (ISO string)
  let boardingAt: Date | null = null
  if (typeof body.boardingAt === 'string' && body.boardingAt.trim()) {
    const parsed = new Date(body.boardingAt)
    if (Number.isNaN(parsed.getTime())) {
      return fail('boardingAt invalide (ISO string attendu)', 400)
    }
    boardingAt = parsed
  } else if (
    body.boardingAt &&
    typeof body.boardingAt === 'object' &&
    body.boardingAt instanceof Date
  ) {
    boardingAt = body.boardingAt
  }

  // zones optionnel : tableau de strings, sérialisé en JSON
  let zones: string[] = []
  if (Array.isArray(body.zones)) {
    zones = body.zones
      .filter((z: unknown): z is string => typeof z === 'string')
      .map((z) => z.trim().slice(0, 40))
      .filter((z) => z.length > 0)
  }

  // assignedStaff optionnel
  const assignedStaff =
    typeof body.assignedStaff === 'string' && body.assignedStaff.trim()
      ? body.assignedStaff.trim().slice(0, 80)
      : null

  // Création de la tâche — status "pending" par défaut
  const created = await db.turnoverTask.create({
    data: {
      flightNo,
      boardingAt,
      zones: JSON.stringify(zones),
      assignedStaff,
      status: 'pending',
    },
  })

  return ok(serialize(created), 201)
}
