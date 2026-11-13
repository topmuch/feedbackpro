// ============================================================
// /api/admin/voice/rules — CRUD matrice de décision
// ------------------------------------------------------------
// GET  → retourne toutes les VoiceDecisionRule (filtre ?sector=)
//        Auto-seed si la table est vide (premier appel).
// POST → upsert une règle (sector + eventType = clé unique).
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { seedVoiceRulesIfEmpty } from '@/lib/voice-rules-seed'

export async function GET(req: Request) {
  try {
    await seedVoiceRulesIfEmpty()
    const url = new URL(req.url)
    const sector = url.searchParams.get('sector')
    const rules = await db.voiceDecisionRule.findMany({
      where: sector ? { sector } : undefined,
      orderBy: [{ sector: 'asc' }, { eventType: 'asc' }],
    })
    return NextResponse.json({ rules })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type PostBody = {
  sector: string
  eventType: string
  shouldSpeak: boolean
  priority: string
  tone: string
  volumeAdjustment: string
  template: string
  aggregationWindowSec: number
  maxAnnouncementsPerWindow: number
  active: boolean
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<PostBody>
    if (!body.sector || !body.eventType) {
      return NextResponse.json(
        { error: 'sector et eventType requis' },
        { status: 400 },
      )
    }
    const data = {
      sector: body.sector,
      eventType: body.eventType,
      shouldSpeak: body.shouldSpeak ?? true,
      priority: body.priority ?? 'info',
      tone: body.tone ?? 'firm',
      volumeAdjustment: body.volumeAdjustment ?? '0%',
      template: body.template ?? '',
      aggregationWindowSec: body.aggregationWindowSec ?? 0,
      maxAnnouncementsPerWindow: body.maxAnnouncementsPerWindow ?? 1,
      active: body.active ?? true,
    }
    const rule = await db.voiceDecisionRule.upsert({
      where: {
        sector_eventType: { sector: data.sector, eventType: data.eventType },
      },
      update: data,
      create: data,
    })
    return NextResponse.json({ rule })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
