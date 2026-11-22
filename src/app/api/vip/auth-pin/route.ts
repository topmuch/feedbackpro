// ============================================================
// /api/vip/auth-pin — Module 1 (Cockpit Manager) + Module 2 (Comptoir Réception)
// ------------------------------------------------------------
// GET  : auto-seed 6 StaffAccount rows (PIN 1234) si la table est
//        vide. Renvoie la liste des comptes staff (sans pinHash).
// POST : authentification Tél + PIN pour le staff VIP.
//        Body : { phone, pin }
//        - Recherche du StaffAccount par téléphone (trim + case-insensitive)
//        - Vérifie le verrouillage (lockedUntil > now)
//        - Hash le PIN en SHA256 et compare à pinHash
//        - Sur échec : incrémente failedAttempts ; si >= 5 → lockedUntil = +5 min
//        - Sur succès : reset failedAttempts, lastLoginAt = now
//        - Renvoie { id, name, role, phone, avatarUrl }
// ============================================================

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { limiteTaux } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MIN = 5

// Hash SHA256 d'un PIN (4 chiffres) — stocké en base, jamais en clair.
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex')
}

// Seed initial : 6 comptes staff pré-enregistrés avec PIN 1234.
// Rôles : manager | maitre_dhotel | reception | etage | barman
const SEED_STAFF: Array<{
  name: string
  phone: string
  pin: string
  role: string
}> = [
  { name: 'Amadou Diallo', phone: '+221770000001', pin: '1234', role: 'manager' },
  { name: 'Fatou Sow', phone: '+221770000002', pin: '1234', role: 'maitre_dhotel' },
  { name: 'Moussa Traoré', phone: '+221770000003', pin: '1234', role: 'reception' },
  { name: 'Awa Ndiaye', phone: '+221770000004', pin: '1234', role: 'etage' },
  { name: 'Ibrahima Fall', phone: '+221770000005', pin: '1234', role: 'barman' },
  { name: 'Khadija Ba', phone: '+221770000006', pin: '1234', role: 'etage' },
]

async function ensureSeeded(): Promise<void> {
  const count = await db.staffAccount.count()
  if (count > 0) return
  await db.staffAccount.createMany({
    data: SEED_STAFF.map((s) => ({
      name: s.name,
      phone: s.phone,
      pinHash: hashPin(s.pin),
      role: s.role,
      active: true,
      failedAttempts: 0,
    })),
  })
}

// GET /api/vip/auth-pin — auto-seed puis renvoie la liste (sans pinHash)
export async function GET(_req: NextRequest) {
  await ensureSeeded()
  const staff = await db.staffAccount.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      role: true,
      phone: true,
      avatarUrl: true,
      active: true,
      lastLoginAt: true,
    },
  })
  return ok(
    staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      phone: s.phone,
      avatarUrl: s.avatarUrl,
      active: s.active,
      lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
    })),
  )
}

// POST /api/vip/auth-pin — authentification Tél + PIN
export async function POST(req: NextRequest) {
  // Anti brute-force IP (complément du verrouillage compte 5 essais) :
  // 10 tentatives / min / IP — largement au-dessus d'un usage légitime.
  const bloque = limiteTaux(req, "vip-auth-pin", { max: 10, fenetreMs: 60_000 })
  if (bloque) return bloque

  // Auto-seed au cas où la base est vide (appel POST sans GET préalable)
  await ensureSeeded()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : ''
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''

  if (!phoneRaw) return fail('Téléphone manquant', 400)
  if (!/^\d{4}$/.test(pin)) return fail('PIN invalide (4 chiffres)', 400)

  // Recherche du staff par téléphone (case-insensitive trim)
  // SQLite ne supporte pas `mode: 'insensitive'` en Prisma : on tente
  // d'abord une égalité stricte, puis on fallback sur findMany + filtre JS.
  const phoneLower = phoneRaw.toLowerCase()
  let staff = await db.staffAccount.findUnique({ where: { phone: phoneRaw } })
  if (!staff) {
    const candidates = await db.staffAccount.findMany({ take: 500 })
    staff =
      candidates.find((c) => c.phone.trim().toLowerCase() === phoneLower) ?? null
  }

  if (!staff) {
    return fail('Numéro non enregistré', 404)
  }
  if (!staff.active) {
    return fail('Compte désactivé. Contactez le manager.', 403)
  }

  // Vérrouillage temporaire
  const now = new Date()
  if (staff.lockedUntil && staff.lockedUntil > now) {
    return fail('Compte verrouillé. Réessayez dans 5 min.', 423)
  }

  // Comparaison du hash SHA256
  const pinHash = hashPin(pin)
  if (pinHash !== staff.pinHash) {
    const nextAttempts = staff.failedAttempts + 1
    const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS
    await db.staffAccount.update({
      where: { id: staff.id },
      data: {
        failedAttempts: nextAttempts,
        lockedUntil: shouldLock
          ? new Date(now.getTime() + LOCK_DURATION_MIN * 60_000)
          : null,
      },
    })
    if (shouldLock) {
      return fail('Compte verrouillé. Réessayez dans 5 min.', 423)
    }
    return fail('PIN incorrect', 401)
  }

  // Succès : reset failedAttempts + lastLoginAt
  const updated = await db.staffAccount.update({
    where: { id: staff.id },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
    },
  })

  return ok({
    id: updated.id,
    name: updated.name,
    role: updated.role,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
  })
}
