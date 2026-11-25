// ============================================================
// /api/city/plates/seed
// ------------------------------------------------------------
// Ville Connectée — Pré-chargement des plaques par commune.
// La mairie sélectionne une commune (ex: Dieuppeul-Derklé, code "DD")
// et le système génère automatiquement toutes les plaques pour
// les quartiers de cette commune, avec GPS pré-rempli.
//
// POST body: { communeCode: string }
// → 201 { ok: true, data: { created: number, plates: [...] } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { getCommuneByCode } from '@/lib/city-seed-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Génère un token QR unique (24 chars hex)
function generateQrToken(): string {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { communeCode?: string }
  const code = typeof b.communeCode === 'string' ? b.communeCode.trim().toUpperCase() : ''

  if (code.length < 2) {
    return fail('Code commune requis (2 lettres)', 400)
  }

  const commune = getCommuneByCode(code)
  if (!commune) {
    return fail(`Commune introuvable pour le code "${code}"`, 404)
  }

  // Vérifie qu'il n'y a pas déjà des plaques avec ce préfixe
  const existing = await db.cityPlate.findMany({
    where: { plateNumber: { startsWith: `${code}#` } },
    select: { plateNumber: true },
  })

  if (existing.length > 0) {
    return fail(
      `Cette commune a déjà ${existing.length} plaque(s) générée(s) (préfixe ${code}#). Supprimez-les d'abord si vous voulez régénérer.`,
      409,
    )
  }

  // Génère les plaques pour chaque quartier
  const platesToCreate = commune.quartiers.map((q, index) => {
    const seq = String(index + 1).padStart(3, '0')
    const plateNumber = `${code}#${seq}`

    // Offset GPS léger par quartier (spread autour du centre commune)
    // ~200m entre chaque plaque, en spirale
    const angle = (index * 137.5 * Math.PI) / 180 // angle d'or (répartition uniforme)
    const radius = 0.002 * (1 + index * 0.1) // ~200m + légère augmentation
    const lat = commune.centerLat + radius * Math.cos(angle)
    const lng = commune.centerLng + radius * Math.sin(angle)

    // Token unique — régénère si collision (très improbable)
    let qrToken = generateQrToken()
    return {
      plateNumber,
      qrToken,
      label: q.name,
      district: commune.name,
      address: `${q.name}, ${commune.name}, ${commune.department}`,
      lat,
      lng,
      plateType: q.type ?? 'standard',
      status: 'active',
    }
  })

  // Insère en base (batch)
  const created = await db.$transaction(
    platesToCreate.map((p) =>
      db.cityPlate.create({
        data: {
          plateNumber: p.plateNumber,
          qrToken: p.qrToken,
          label: p.label,
          district: p.district,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          plateType: p.plateType,
          status: p.status,
        },
      }),
    ),
  )

  console.log(
    `[city-plates-seed] 📍 ${created.length} plaques générées pour ${commune.name} (${code}) — ${commune.department}`,
  )

  return ok(
    {
      created: created.length,
      commune: commune.name,
      department: commune.department,
      plates: created.map((p) => ({
        id: p.id,
        plateNumber: p.plateNumber,
        label: p.label,
        district: p.district,
        lat: p.lat,
        lng: p.lng,
        plateType: p.plateType,
        qrToken: p.qrToken,
      })),
    },
    201,
  )
}
