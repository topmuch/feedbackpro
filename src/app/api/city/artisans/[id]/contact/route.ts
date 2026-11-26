import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return fail('ID requis', 400)
  try {
    const updated = await db.cityArtisan.update({
      where: { id },
      data: { contactCount: { increment: 1 } },
      select: { contactCount: true },
    })
    return ok({ contactCount: updated.contactCount })
  } catch {
    return fail('Artisan introuvable', 404)
  }
}
