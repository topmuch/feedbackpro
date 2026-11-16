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

  const etabIds = user.pro ? [user.pro.id] : []
  const filterId = etablissementId && etabIds.includes(etablissementId) ? etablissementId : etabIds[0]

  if (!filterId) {
    return NextResponse.json({ retours: [] })
  }

  const retours = await db.retour.findMany({
    where: { proId: filterId },
    orderBy: { createdAt: 'desc' },
  })

  // Parse JSON fields for the frontend
  const parsed = retours.map((r) => ({
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
  const etabIds = user.pro ? [user.pro.id] : []
  const etablissementId = body?.etablissementId && etabIds.includes(body.etablissementId) ? body.etablissementId : etabIds[0]
  if (!etablissementId) return NextResponse.json({ error: 'Aucun établissement' }, { status: 400 })

  const r = await db.retour.create({
    data: {
      proId: etablissementId,
      note: Number(body?.note ?? 3),
      nps: Number(body?.nps ?? 3),
      tags: JSON.stringify(Array.isArray(body?.tags) ? body.tags : []),
      commentaire: body?.commentaire ?? null,
      zoneId: String(body?.zone ?? ''),
      personnelMentionne: body?.personnelMentionne ? JSON.stringify(body.personnelMentionne) : null,
      photoUrl: body?.photoUrl ?? null,
      emailClient: body?.clientEmail ?? null,
    },
  })
  return NextResponse.json({ retour: r })
}
