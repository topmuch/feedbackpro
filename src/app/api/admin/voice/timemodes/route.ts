// ============================================================
// /api/admin/voice/timemodes — CRUD contextes horaires
// ------------------------------------------------------------
// GET  → retourne les VoiceTimeMode pour les 2 secteurs (auto-seed
//        si manquants).
// POST → upsert le modes JSON d'un secteur.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const DEFAULT_MODES_JSON =
  '{"06-10":"opening","10-14":"service_lunch","14-18":"quiet","18-22":"service_dinner","22-06":"night"}'

export async function GET() {
  try {
    const both = await Promise.all([
      db.voiceTimeMode.upsert({
        where: { sector: 'aeroport' },
        update: {},
        create: { sector: 'aeroport', modes: DEFAULT_MODES_JSON, active: true },
      }),
      db.voiceTimeMode.upsert({
        where: { sector: 'restaurant' },
        update: {},
        create: { sector: 'restaurant', modes: DEFAULT_MODES_JSON, active: true },
      }),
    ])
    return NextResponse.json({ timemodes: both })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type PostBody = {
  sector: string
  modes: string // JSON string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<PostBody>
    if (!body.sector || !body.modes) {
      return NextResponse.json(
        { error: 'sector et modes requis' },
        { status: 400 },
      )
    }
    // Valide que modes est bien du JSON.
    try {
      JSON.parse(body.modes)
    } catch {
      return NextResponse.json(
        { error: 'modes doit être du JSON valide' },
        { status: 400 },
      )
    }
    const tm = await db.voiceTimeMode.upsert({
      where: { sector: body.sector },
      update: { modes: body.modes },
      create: { sector: body.sector, modes: body.modes, active: true },
    })
    return NextResponse.json({ timemode: tm })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
