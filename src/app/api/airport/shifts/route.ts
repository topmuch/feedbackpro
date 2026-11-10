// ============================================================
// GET /api/airport/shifts
// POST /api/airport/shifts
// ------------------------------------------------------------
// GET  : liste tous les quarts planifiés (AirportShift), triés par
//        startTime asc puis createdAt asc. Inclut le décodage JSON
//        des champs daysOfWeek et opsPhones.
// POST : crée un nouveau quart. Body JSON :
//        {
//          name: string,         // 1..40 chars ("Matin", "Après-midi", "Nuit")
//          startTime: string,    // "HH:MM" 24h
//          endTime: string,      // "HH:MM" 24h
//          daysOfWeek?: number[],// [0..6] (0=dimanche). Défaut : tous les jours.
//          opsPhones?: string[], // numéros ops actifs sur ce quart. Défaut : [].
//          active?: boolean      // défaut : true
//        }
//
// Réponse :
//   GET  : { ok: true, data: { shifts: ShiftDto[], count: number } }
//   POST : { ok: true, data: { shift: ShiftDto } }
//
// Public (pas d'auth) — cohérent avec les autres endpoints aéroport.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { decodeDaysOfWeek, decodeOpsPhones, parseTimeToMinutes } from '@/lib/airport-shifts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ----------------------------------------------------------------
// DTO — forme sérialisée renvoyée au client
// ----------------------------------------------------------------
export type ShiftDto = {
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
// Validation payload POST
// ----------------------------------------------------------------
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/
const PHONE_REGEX = /^\d{6,15}$/

type CreatePayload = {
  name: string
  startTime: string
  endTime: string
  daysOfWeek?: number[]
  opsPhones?: string[]
  active?: boolean
}

function validateCreatePayload(b: unknown): { ok: true; value: CreatePayload } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Payload manquant' }
  const v = b as Record<string, unknown>

  // name
  if (typeof v.name !== 'string' || v.name.trim().length < 1 || v.name.trim().length > 40) {
    return { ok: false, error: 'Le nom doit faire entre 1 et 40 caractères' }
  }

  // startTime / endTime
  if (typeof v.startTime !== 'string' || !TIME_REGEX.test(v.startTime)) {
    return { ok: false, error: 'startTime invalide (format attendu HH:MM, 24h)' }
  }
  if (typeof v.endTime !== 'string' || !TIME_REGEX.test(v.endTime)) {
    return { ok: false, error: 'endTime invalide (format attendu HH:MM, 24h)' }
  }
  // startTime === endTime → on accepte (cas dégénéré traité comme quart 24h)
  if (parseTimeToMinutes(v.startTime) === null || parseTimeToMinutes(v.endTime) === null) {
    return { ok: false, error: 'Heure invalide' }
  }

  // daysOfWeek
  let daysOfWeek: number[] = [0, 1, 2, 3, 4, 5, 6]
  if (v.daysOfWeek !== undefined && v.daysOfWeek !== null) {
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
    daysOfWeek = valid as number[]
  }

  // opsPhones
  let opsPhones: string[] = []
  if (v.opsPhones !== undefined && v.opsPhones !== null) {
    if (!Array.isArray(v.opsPhones)) {
      return { ok: false, error: 'opsPhones doit être un tableau' }
    }
    const valid = v.opsPhones.filter((p) => typeof p === 'string' && PHONE_REGEX.test(p))
    if (valid.length !== v.opsPhones.length) {
      return { ok: false, error: 'opsPhones contient un numéro invalide (format : 6 à 15 chiffres, sans +)' }
    }
    // dédoublonne
    opsPhones = Array.from(new Set(valid as string[]))
  }

  // active
  let active = true
  if (v.active !== undefined && v.active !== null) {
    if (typeof v.active !== 'boolean') {
      return { ok: false, error: 'active doit être un booléen' }
    }
    active = v.active
  }

  return {
    ok: true,
    value: {
      name: v.name.trim(),
      startTime: v.startTime,
      endTime: v.endTime,
      daysOfWeek,
      opsPhones,
      active,
    },
  }
}

// ----------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const shifts = await db.airportShift.findMany({
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  })
  return ok({ shifts: shifts.map(toDto), count: shifts.length })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const r = validateCreatePayload(body)
  if (!r.ok) return fail(r.error, 400)
  const v = r.value

  const shift = await db.airportShift.create({
    data: {
      name: v.name,
      startTime: v.startTime,
      endTime: v.endTime,
      daysOfWeek: JSON.stringify(v.daysOfWeek),
      opsPhones: JSON.stringify(v.opsPhones),
      active: v.active,
    },
  })

  console.log(`[airport-shifts] Quart créé : ${shift.name} (${shift.startTime}-${shift.endTime})`)

  return ok({ shift: toDto(shift) })
}
