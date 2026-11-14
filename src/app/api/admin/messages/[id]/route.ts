import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await db.contactMessage.update({
      where: { id },
      data: { statut: body.statut || 'LU' },
    })
    return NextResponse.json({ ok: true, data: { message: updated } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Message introuvable' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.contactMessage.delete({ where: { id } })
    return NextResponse.json({ ok: true, data: { deleted: id } })
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Message introuvable' }, { status: 404 })
  }
}
