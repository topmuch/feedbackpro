import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/retours?etablissementId=...
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const url = new URL(req.url)
  const etablissementId = url.searchParams.get('etablissementId')

  const etabIds = user.etablissements.map((e) => e.id)
  const filterId = etablissementId && etabIds.includes(etablissementId) ? etablissementId : etabIds[0]

  if (!filterId) {
    return NextResponse.json({ retours: [] })
  }

  const retours = await db.retour.findMany({
    where: { etablissementId: filterId },
    orderBy: { createdAt: 'desc' },
  })

  // Parse JSON fields for the frontend
  const parsed = retours.map((r) => ({
    id: r.id,
    nps: r.nps,
    tags: safeParse<string[]>(r.tags, []),
    reponses: safeParse(r.reponses, null),
    commentaire: r.commentaire,
    zone: r.zone,
    personnelMentionne: safeParse<string[]>(r.personnelMentionne, []),
    photoUrl: r.photoUrl,
    clientEmail: r.clientEmail,
    clientPhone: r.clientPhone,
    statut: r.statut,
    actionPrise: safeParse(r.actionPrise, null),
    recompenseAttribuee: r.recompenseAttribuee,
    recompenseUtilisee: r.recompenseUtilisee,
    dateRecompenseUtilisee: r.dateRecompenseUtilisee,
    isRecidive: r.isRecidive,
    reponseGerant: r.reponseGerant,
    dateReponseGerant: r.dateReponseGerant,
    createdAt: r.createdAt,
  }))

  return NextResponse.json({ retours: parsed, etablissementId: filterId })
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// POST /api/retours — création (utile pour tests / formulaire client)
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const body = await req.json()
  const etabIds = user.etablissements.map((e) => e.id)
  const etablissementId = body?.etablissementId && etabIds.includes(body.etablissementId) ? body.etablissementId : etabIds[0]
  if (!etablissementId) return NextResponse.json({ error: 'Aucun établissement' }, { status: 400 })

  const r = await db.retour.create({
    data: {
      etablissementId,
      nps: Number(body?.nps ?? 3),
      tags: JSON.stringify(Array.isArray(body?.tags) ? body.tags : []),
      reponses: body?.reponses ? JSON.stringify(body.reponses) : null,
      commentaire: body?.commentaire ?? null,
      zone: body?.zone ?? null,
      personnelMentionne: body?.personnelMentionne ? JSON.stringify(body.personnelMentionne) : null,
      photoUrl: body?.photoUrl ?? null,
      clientEmail: body?.clientEmail ?? null,
      clientPhone: body?.clientPhone ?? null,
    },
  })
  return NextResponse.json({ retour: r })
}
