import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { limiteTaux } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Anti-spam formulaire de contact : 5 envois / 10 min / IP.
  const bloque = limiteTaux(req, "contact-submit", { max: 5, fenetreMs: 10 * 60_000 })
  if (bloque) return bloque
  try {
    const body = await req.json()
    const { nom, email, typeEtablissement, volume, defi, message } = body
    if (!nom || !email || !message) {
      return NextResponse.json({ ok: false, error: 'Champs requis manquants' }, { status: 400 })
    }
    await db.contactMessage.create({
      data: { nom, email, typeEtablissement: typeEtablissement || null, volume: volume || null, defi: defi || null, message },
    })
    return NextResponse.json({ ok: true, data: { sent: true } })
  } catch (err) {
    console.error('[contact/submit] Error:', err)
    return NextResponse.json({ ok: true, data: { sent: true } }) // don't block user on error
  }
}
