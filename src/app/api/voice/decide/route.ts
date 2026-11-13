// ============================================================
// /api/voice/decide — Endpoint public du Voice Decision Engine
// ------------------------------------------------------------
// Appelé par :
//   - La PWA staff (airport-staff-view.tsx) quand elle détecte un nouvel
//     incident en polling.
//   - Le wallboard ops (ops-wallboard/page.tsx) avant de TTS.
//
// POST body : { event: VoiceEvent }
// Response  : { decision: VoiceDecision }
//
// Le client lit decision.shouldSpeak et appelle parler(decision.message)
// avec le volume / ton de la décision si shouldSpeak=true. Sinon, il
// n'annonce rien vocalement (notification visuelle seule).
// ============================================================

import { NextResponse } from 'next/server'
import {
  decideAndSpeak,
  type VoiceEvent,
} from '@/lib/voice-decision-engine'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { event?: VoiceEvent }
    if (!body.event) {
      return NextResponse.json(
        { error: 'event requis' },
        { status: 400 },
      )
    }
    const decision = await decideAndSpeak(body.event)
    return NextResponse.json({ decision })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage:
      'POST { event: { sector, eventType, zone?, type?, temps?, table?, produit?, detail?, reportId?, staffName? } }',
  })
}
