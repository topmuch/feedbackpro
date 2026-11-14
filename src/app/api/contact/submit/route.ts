import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
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
