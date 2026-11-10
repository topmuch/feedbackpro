// ============================================================
// FeedbackPro — Helpers partagés pour la planification des quarts
// (shifts) aéroport.
// ------------------------------------------------------------
// Ce module centralise la logique de résolution du shift actif :
//   - décodage des heures "HH:MM" (pas de lib de dates) ;
//   - gestion des quarts de nuit (chevauchement minuit quand
//     endTime < startTime) ;
//   - jour de la semaine courant et veille (0=dimanche, 1..6) ;
//   - récupération des numéros ops actifs sur le quart courant.
//
// Il est consommé par :
//   - GET /api/airport/shifts/active         → contrat API public ;
//   - la feature "help request" (autre agent) pour router une
//     demande d'aide vers l'équipe active ;
//   - la feature "alertes" (autre agent) pour router une alerte
//     seuil vers l'équipe active au moment du déclenchement.
//
// Aucune dépendance externe : uniquement le client Prisma `db`.
// ============================================================

import { db } from '@/lib/db'
import type { AirportShift, AirportOpsContact } from '@prisma/client'

// ----------------------------------------------------------------
// Types publics
// ----------------------------------------------------------------

/** Quart actif résolu pour l'instant `now`. `shift` vaut null si aucun quart n'est actif. */
export type ActiveShiftResult = {
  /** Le shift actif complet (ou null si aucun) */
  shift: AirportShift | null
  /** Numéros WhatsApp ops attachés au shift actif. [] si aucun shift actif. */
  phones: string[]
}

/** Numéros ops actifs (rôle ops/manager) — fallback quand aucun quart n'est programmé. */
export type AllOpsPhonesResult = {
  /** Tous les numéros ops actifs en base (actif=true) */
  phones: string[]
  /** Les enregistrements AirportOpsContact complets (pour audit / affichage) */
  contacts: Pick<AirportOpsContact, 'id' | 'phone' | 'name' | 'role'>[]
}

// ----------------------------------------------------------------
// Helpers — parsing d'heures et jours de la semaine
// ----------------------------------------------------------------

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Convertit une heure "HH:MM" en minutes depuis minuit (0-1439).
 * Retourne null si le format est invalide (défensif — base corrompue).
 */
export function parseTimeToMinutes(t: string): number | null {
  if (typeof t !== 'string') return null
  const m = TIME_REGEX.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** Index du jour de la semaine (0=dimanche … 6=samedi) — aligné sur JS Date.getDay(). */
export function dayOfWeek(d: Date): number {
  return d.getDay()
}

/** Index du jour précédent (avec rebouclage dimanche → samedi). */
export function previousDayOfWeek(dow: number): number {
  return (dow + 6) % 7
}

/**
 * Détermine si un shift est actif à l'instant `now`.
 *
 * Règles :
 *   - shift.active doit être true ;
 *   - le jour courant doit faire partie de shift.daysOfWeek (ou, pour
 *     un quart de nuit, le jour précédent pour la partie après minuit) ;
 *   - l'heure courante doit tomber dans la fenêtre [startTime, endTime[ :
 *       * shift normal (start ≤ end) : même jour,
 *       * quart de nuit (start > end) : start → minuit le jour J, puis
 *         minuit → end le jour J+1 (lequel doit aussi être considéré
 *         comme actif si le jour J précédent était actif).
 */
export function isShiftActiveAt(
  shift: { active: boolean; startTime: string; endTime: string; daysOfWeek: number[] },
  now: Date,
): boolean {
  if (!shift.active) return false
  const start = parseTimeToMinutes(shift.startTime)
  const end = parseTimeToMinutes(shift.endTime)
  if (start === null || end === null) return false
  if (!Array.isArray(shift.daysOfWeek) || shift.daysOfWeek.length === 0) return false

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayDow = dayOfWeek(now)
  const yesterdayDow = previousDayOfWeek(todayDow)
  const inDaysToday = shift.daysOfWeek.includes(todayDow)
  const inDaysYesterday = shift.daysOfWeek.includes(yesterdayDow)

  if (start === end) {
    // Cas dégénéré : startTime === endTime → on considère le quart
    // comme actif toute la journée si le jour est sélectionné.
    return inDaysToday
  }

  if (start < end) {
    // Quart normal : tout tient sur une journée.
    return inDaysToday && nowMin >= start && nowMin < end
  }

  // Quart de nuit (start > end) : chevauche minuit.
  // Actif si :
  //   (a) on est sur le jour J après startTime (début du quart), OU
  //   (b) on est sur le jour J+1 avant endTime (suite du quart commencé
  //       la veille — il faut donc que la veille soit dans daysOfWeek).
  return (inDaysToday && nowMin >= start) || (inDaysYesterday && nowMin < end)
}

// ----------------------------------------------------------------
// Helpers — parsing JSON défensif
// ----------------------------------------------------------------

function safeParseJsonArray<T>(raw: string | null, fallback: T[]): T[] {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return fallback
    return parsed as T[]
  } catch {
    return fallback
  }
}

/** Décode le champ JSON `daysOfWeek` d'un shift (tableau de nombres 0-6). */
export function decodeDaysOfWeek(raw: string | null): number[] {
  const arr = safeParseJsonArray<unknown>(raw, [0, 1, 2, 3, 4, 5, 6])
  return arr.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 6 && Number.isInteger(n))
}

/** Décode le champ JSON `opsPhones` d'un shift (tableau de strings). */
export function decodeOpsPhones(raw: string | null): string[] {
  const arr = safeParseJsonArray<unknown>(raw, [])
  return arr.filter((p): p is string => typeof p === 'string' && p.length > 0)
}

// ----------------------------------------------------------------
// API publique
// ----------------------------------------------------------------

/**
 * Renvoie le shift actif à l'instant `now` + les numéros ops qui y sont
 * rattachés. Si aucun shift n'est actif, renvoie { shift: null, phones: [] }.
 *
 * L'appelant peut alors faire un fallback sur `getAllActiveOpsPhones()`
 * pour récupérer tous les numéros ops actifs (et ne pas rester sans
 * destinataire d'alerte si aucun quart n'est planifié).
 */
export async function getActiveShiftPhones(now: Date = new Date()): Promise<ActiveShiftResult> {
  const shifts = await db.airportShift.findMany({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const s of shifts) {
    const daysOfWeek = decodeDaysOfWeek(s.daysOfWeek)
    const candidate = {
      active: s.active,
      startTime: s.startTime,
      endTime: s.endTime,
      daysOfWeek,
    }
    if (isShiftActiveAt(candidate, now)) {
      const phones = decodeOpsPhones(s.opsPhones)
      return { shift: s, phones }
    }
  }

  return { shift: null, phones: [] }
}

/**
 * Renvoie tous les numéros ops actifs en base (filtre `actif=true`).
 * Utilisé comme fallback quand aucun quart n'est actif (ex : nuit non
 * programmée, ou tous les quarts désactivés).
 *
 * On ne renvoie que les rôles "ops" et "manager" (les rôles terrain
 * spécialisés comme nettoyage/maintenance ne reçoivent pas d'alertes
 * générales — ils sont notifiés via le routage par équipe du wallboard).
 * Si la base ne contient aucun ops/manager actif, on dégrade vers tous
 * les contacts actifs pour ne jamais bloquer une alerte.
 */
export async function getAllActiveOpsPhones(): Promise<AllOpsPhonesResult> {
  const contacts = await db.airportOpsContact.findMany({
    where: { actif: true },
    select: { id: true, phone: true, name: true, role: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })

  const primary = contacts.filter((c) => c.role === 'ops' || c.role === 'manager')
  const pool = primary.length > 0 ? primary : contacts
  const phones = pool.map((c) => c.phone)

  return {
    phones,
    contacts: pool.map((c) => ({ id: c.id, phone: c.phone, name: c.name, role: c.role })),
  }
}
