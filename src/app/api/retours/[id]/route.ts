import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const etabIds = user.pro ? [user.pro.id] : []

  const r = await db.retour.findUnique({ where: { id } })
  if (!r || !etabIds.includes(r.proId)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }

  return NextResponse.json({
    retour: {
      id: r.id,
      nps: r.nps,
      tags: safeParse<string[]>(r.tags, []),
      reponses: null,
      commentaire: r.commentaire,
      zone: r.zoneId,
      personnelMentionne: safeParse<string[]>(r.personnelMentionne, []),
      photoUrl: r.photoUrl,
      clientEmail: r.emailClient,
      clientPhone: null,
      statut: r.statut,
      actionPrise: safeParse(r.actionPrise, null),
      recompenseAttribuee: null,
      recompenseUtilisee: r.recompenseUtilisee,
      dateRecompenseUtilisee: null,
      isRecidive: null,
      reponseGerant: r.reponsePro,
      dateReponseGerant: null,
      createdAt: r.createdAt,
    },
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const etabIds = user.pro ? [user.pro.id] : []

  const existing = await db.retour.findUnique({ where: { id } })
  if (!existing || !etabIds.includes(existing.proId)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (typeof body?.statut === 'string') data.statut = body.statut
  if (body?.actionPrise !== undefined) data.actionPrise = body.actionPrise ? JSON.stringify(body.actionPrise) : null
  if (typeof body?.reponseGerant === 'string') {
    data.reponseGerant = body.reponseGerant
    data.dateReponseGerant = new Date()
  }
  if (typeof body?.recompenseUtilisee === 'boolean') {
    data.recompenseUtilisee = body.recompenseUtilisee
    if (body.recompenseUtilisee) data.dateRecompenseUtilisee = new Date()
  }

  const updated = await db.retour.update({ where: { id }, data })
  return NextResponse.json({ retour: updated })
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const etabIds = user.pro ? [user.pro.id] : []

  const existing = await db.retour.findUnique({ where: { id } })
  if (!existing || !etabIds.includes(existing.proId)) {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  }
  await db.retour.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}
