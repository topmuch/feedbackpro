// ============================================================
// /api/city/qr-theme
// ------------------------------------------------------------
// Thème visuel du QR code citoyen. La mairie choisit dans les
// Paramètres entre plusieurs designs.
//
// GET  → { ok, data: { theme: 'signaletique' | 'modern' } }
// POST → sauvegarde le thème choisi
// ============================================================

import { NextRequest } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_THEMES = new Set(['signaletique', 'modern'])

export async function GET() {
  const theme = await getSetting('city_qr_theme', 'signaletique')
  return ok({ theme: VALID_THEMES.has(theme) ? theme : 'signaletique' })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { theme?: string }
  const theme = typeof b.theme === 'string' && VALID_THEMES.has(b.theme) ? b.theme : 'signaletique'

  await setSetting('city_qr_theme', theme)
  console.log(`[city-qr-theme] Thème QR mis à jour: ${theme}`)
  return ok({ theme })
}
