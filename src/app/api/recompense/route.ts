import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

// GET /api/recompense?etablissementId=...
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const url = new URL(req.url)
  const etablissementId = url.searchParams.get('etablissementId')
  const etabIds = user.etablissements.map((e) => e.id)
  const filterId = etablissementId && etabIds.includes(etablissementId) ? etablissementId : etabIds[0]
  if (!filterId) return NextResponse.json({ recompense: null })

  const etab = await db.etablissement.findUnique({ where: { id: filterId } })
  if (!etab) return NextResponse.json({ recompense: null })

  return NextResponse.json({
    recompense: {
      active: etab.recompenseActive,
      type: etab.recompenseType,
      texte: etab.recompenseTexte,
      codePromo: etab.recompenseCodePromo,
      whatsappActive: etab.whatsappActive,
      whatsapp: etab.whatsapp,
    },
  })
}
