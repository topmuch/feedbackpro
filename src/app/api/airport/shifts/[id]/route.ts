// ============================================================
// PUT /api/airport/shifts/[id]
// DELETE /api/airport/shifts/[id]
// ------------------------------------------------------------
// PUT    : met à jour un quart existant. Body JSON partiel :
//          {
//            name?: string,
//            startTime?: string,
//            endTime?: string,
//            daysOfWeek?: number[],
//            opsPhones?: string[],
//            active?: boolean
//          }
// DELETE : supprime un quart. Retourne { ok: true, data: { id } }.
//
// Réponses :
//   PUT    : { ok: true, data: { shift: ShiftDto } }
//   DELETE : { ok: true, data: { id } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { decodeDaysOfWeek, decodeOpsPhones, parseTimeToMinutes } from '@/lib/airport-shifts'

export const runtime = 'nodejs'

type ShiftDto = {
  id: string
  name: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
  opsPhones: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

function toDto(s: {
  id: string
  name: string
  startTime: string
  endTime: string
  daysOfWeek: string
  opsPhones: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}): ShiftDto {
  return {
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    daysOfWeek: decodeDaysOfWeek(s.daysOfWeek),
    opsPhones: decodeOpsPhones(s.opsPhones),
    active: s.active,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

// ----------------------------------------------------------------
// Validation payload PUT (partiel)
// ----------------------------------------------------------------
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/
const PHONE_REGEX = /^\d{6,15}$/

type UpdatePayload = {
  name?: string
  startTime?: string
  endTime?: string
  daysOfWeek?: number[]
  opsPhones?: string[]
  active?: boolean
}

function validateUpdatePayload(b: unknown): { ok: true; value: UpdatePayload } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Payload manquant' }
  const v = b as Record<string, unknown>
  const out: UpdatePayload = {}

  if (v.name !== undefined) {
    if (typeof v.name !== 'string' || v.name.trim().length < 1 || v.name.trim().length > 40) {
      return { ok: false, error: 'Le nom doit faire entre 1 et 40 caractères' }
    }
    out.name = v.name.trim()
  }

  if (v.startTime !== undefined) {
    if (typeof v.startTime !== 'string' || !TIME_REGEX.test(v.startTime)) {
      return { ok: false, error: 'startTime invalide (format attendu HH:MM, 24h)' }
    }
    out.startTime = v.startTime
  }

  if (v.endTime !== undefined) {
    if (typeof v.endTime !== 'string' || !TIME_REGEX.test(v.endTime)) {
      return { ok: false, error: 'endTime invalide (format attendu HH:MM, 24h)' }
    }
    out.endTime = v.endTime
  }

  if (out.startTime !== undefined && parseTimeToMinutes(out.startTime) === null) {
    return { ok: false, error: 'startTime invalide' }
  }
  if (out.endTime !== undefined && parseTimeToMinutes(out.endTime) === null) {
    return { ok: false, error: 'endTime invalide' }
  }

  if (v.daysOfWeek !== undefined) {
    if (!Array.isArray(v.daysOfWeek)) {
      return { ok: false, error: 'daysOfWeek doit être un tableau' }
    }
    const valid = v.daysOfWeek.filter(
      (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6,
    )
    if (valid.length !== v.daysOfWeek.length) {
      return { ok: false, error: 'daysOfWeek doit contenir des entiers entre 0 et 6' }
    }
    if (valid.length === 0) {
      return { ok: false, error: 'daysOfWeek ne peut pas être vide' }
    }
    out.daysOfWeek = valid as number[]
  }

  if (v.opsPhones !== undefined) {
    if (!Array.isArray(v.opsPhones)) {
      return { ok: false, error: 'opsPhones doit être un tableau' }
    }
    const valid = v.opsPhones.filter((p) => typeof p === 'string' && PHONE_REGEX.test(p))
    if (valid.length !== v.opsPhones.length) {
      return { ok: false, error: 'opsPhones contient un numéro invalide (format : 6 à 15 chiffres, sans +)' }
    }
    out.opsPhones = Array.from(new Set(valid as string[]))
  }

  if (v.active !== undefined) {
    if (typeof v.active !== 'boolean') {
      return { ok: false, error: 'active doit être un booléen' }
    }
    out.active = v.active
  }

  return { ok: true, value: out }
}

// ----------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const r = validateUpdatePayload(body)
  if (!r.ok) return fail(r.error, 400)
  const v = r.value

  const existing = await db.airportShift.findUnique({ where: { id } })
  if (!existing) return fail('Quart introuvable', 404)

  const data: Record<string, unknown> = {}
  if (v.name !== undefined) data.name = v.name
  if (v.startTime !== undefined) data.startTime = v.startTime
  if (v.endTime !== undefined) data.endTime = v.endTime
  if (v.daysOfWeek !== undefined) data.daysOfWeek = JSON.stringify(v.daysOfWeek)
  if (v.opsPhones !== undefined) data.opsPhones = JSON.stringify(v.opsPhones)
  if (v.active !== undefined) data.active = v.active

  if (Object.keys(data).length === 0) {
    return ok({ shift: toDto(existing) })
  }

  const shift = await db.airportShift.update({ where: { id }, data })
  console.log(`[airport-shifts] Quart mis à jour : ${shift.name} (${shift.id})`)
  return ok({ shift: toDto(shift) })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  const existing = await db.airportShift.findUnique({ where: { id } })
  if (!existing) return fail('Quart introuvable', 404)

  await db.airportShift.delete({ where: { id } })
  console.log(`[airport-shifts] Quart supprimé : ${existing.name} (${id})`)
  return ok({ id })
}
