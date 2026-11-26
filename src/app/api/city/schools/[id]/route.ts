// PATCH /api/city/schools/[id] — approve/reject/update school
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID requis', 400)

  let body: unknown
  try { body = await req.json() } catch { return fail('Payload JSON invalide', 400) }

  const b = body as { status?: string; verified?: boolean; isPremium?: boolean }
  const data: Record<string, unknown> = {}
  if (b.status && ['pending', 'approved', 'rejected'].includes(b.status)) data.status = b.status
  if (typeof b.verified === 'boolean') data.verified = b.verified
  if (typeof b.isPremium === 'boolean') data.isPremium = b.isPremium

  if (Object.keys(data).length === 0) return fail('Aucun champ à mettre à jour', 400)

  try {
    const updated = await db.citySchool.update({ where: { id }, data })
    return ok({ school: { id: updated.id, status: updated.status, verified: updated.verified } })
  } catch {
    return fail('École introuvable', 404)
  }
}
