// ============================================================
// DELETE /api/admin/ads/advertisers/[id]
// ------------------------------------------------------------
// Supprime un annonceur (cascade : toutes ses campagnes sont
// supprimées également grâce à onDelete: Cascade sur Campaign).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  // Vérifie que l'annonceur existe avant suppression
  const existing = await db.advertiser.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Annonceur introuvable' }, { status: 404 })
  }

  await db.advertiser.delete({ where: { id } })
  return ok({ id })
}
