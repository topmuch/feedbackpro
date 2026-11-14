import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const messages = await db.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    // Mapper vers le format attendu par le MessagesTab existant (lu: boolean)
    const mapped = messages.map(m => ({
      id: m.id,
      nom: m.nom,
      email: m.email,
      typeEtablissement: m.typeEtablissement,
      volume: m.volume,
      defi: m.defi,
      message: m.message,
      statut: m.statut,
      lu: m.statut !== 'NOUVEAU',
      contenu: m.message,
      expediteur: m.nom,
      date: m.createdAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
    }))
    const nonLus = messages.filter(m => m.statut === 'NOUVEAU').length
    return NextResponse.json({ ok: true, data: { messages: mapped, nonLus } })
  } catch (err) {
    console.error('[admin/messages] Error:', err)
    return NextResponse.json({ ok: true, data: { messages: [], nonLus: 0 } })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.action === 'marquerLu' && body.id) {
      await db.contactMessage.update({
        where: { id: body.id },
        data: { statut: 'LU' },
      })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'marquerTraite' && body.id) {
      await db.contactMessage.update({
        where: { id: body.id },
        data: { statut: 'TRAITE' },
      })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'supprimer' && body.id) {
      await db.contactMessage.delete({ where: { id: body.id } })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'Action inconnue' }, { status: 400 })
  } catch (err) {
    console.error('[admin/messages POST] Error:', err)
    return NextResponse.json({ ok: false, error: 'Action impossible' }, { status: 500 })
  }
}
