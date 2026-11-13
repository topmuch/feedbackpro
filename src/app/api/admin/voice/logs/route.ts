// ============================================================
// /api/admin/voice/logs — Historique des annonces
// ------------------------------------------------------------
// GET → retourne les 100 derniers VoiceAnnouncementLog (filtres optionnels
//       : ?sector=, ?spoken=true/false, ?eventType=).
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sector = url.searchParams.get('sector')
    const spoken = url.searchParams.get('spoken')
    const eventType = url.searchParams.get('eventType')

    const where: {
      sector?: string
      spoken?: boolean
      eventType?: string
    } = {}
    if (sector) where.sector = sector
    if (spoken === 'true') where.spoken = true
    if (spoken === 'false') where.spoken = false
    if (eventType) where.eventType = eventType

    const logs = await db.voiceAnnouncementLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ logs })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
