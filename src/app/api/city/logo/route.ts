// ============================================================
// /api/city/logo
// ------------------------------------------------------------
// Logo de la ville — stocké en base (settings) pour être
// accessible depuis tous les appareils (dashboard + QR citoyen).
//
// GET  → { ok, data: { logoUrl: string | null } }
// POST → sauvegarde le logo (data URL) dans les settings
// ============================================================

import { NextRequest } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const logoUrl = await getSetting('city_logo_url', '')
  return ok({ logoUrl: logoUrl || null })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { logoUrl?: string }
  if (typeof b.logoUrl !== 'string') {
    return fail('logoUrl requis (data URL)', 400)
  }

  // Limite la taille (logo = max 200KB en data URL)
  if (b.logoUrl.length > 300_000) {
    return fail('Logo trop volumineux (max 200KB)', 400)
  }

  await setSetting('city_logo_url', b.logoUrl)
  console.log('[city-logo] Logo mis à jour par la mairie')
  return ok({ logoUrl: b.logoUrl })
}
