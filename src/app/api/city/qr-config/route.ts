// ============================================================
// /api/city/qr-config
// ------------------------------------------------------------
// Configuration personnalisable du QR code citoyen.
// La mairie peut personnaliser le titre, sous-titre et services
// affichés sur le QR code depuis le dashboard.
//
// GET  → { ok, data: { qrTitle, qrSubtitle, mairieServices } }
// POST → sauvegarde la configuration
// ============================================================

import { NextRequest } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_TITLE = 'Bonjour, je suis Aminata.'
const DEFAULT_SUBTITLE = 'Je suis là pour vous aider dans votre quartier.'
const DEFAULT_SERVICES = JSON.stringify([
  { label: 'État civil', phone: '+221338000000' },
  { label: 'Permis de construire', phone: '+221338000001' },
  { label: 'Légalisation', phone: '+221338000002' },
  { label: 'Impôts et taxes', phone: '+221338000003' },
])

export async function GET() {
  const qrTitle = await getSetting('city_qr_title', DEFAULT_TITLE)
  const qrSubtitle = await getSetting('city_qr_subtitle', DEFAULT_SUBTITLE)
  const mairieServicesRaw = await getSetting('city_mairie_services', DEFAULT_SERVICES)

  let mairieServices: Array<{ label: string; phone: string }> = []
  try {
    mairieServices = JSON.parse(mairieServicesRaw)
  } catch {
    mairieServices = JSON.parse(DEFAULT_SERVICES)
  }

  return ok({ qrTitle, qrSubtitle, mairieServices })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    qrTitle?: string
    qrSubtitle?: string
    mairieServices?: Array<{ label: string; phone: string }>
  }

  if (typeof b.qrTitle === 'string' && b.qrTitle.trim().length > 0) {
    await setSetting('city_qr_title', b.qrTitle.trim().slice(0, 200))
  }
  if (typeof b.qrSubtitle === 'string') {
    await setSetting('city_qr_subtitle', b.qrSubtitle.trim().slice(0, 300))
  }
  if (Array.isArray(b.mairieServices)) {
    const clean = b.mairieServices
      .filter(s => s && typeof s.label === 'string' && typeof s.phone === 'string')
      .slice(0, 20)
    await setSetting('city_mairie_services', JSON.stringify(clean))
  }

  console.log('[city-qr-config] Configuration QR mise à jour par la mairie')
  return ok({ updated: true })
}
