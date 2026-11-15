// ============================================================
// DELETE /api/admin/webhooks/[id]  — supprime un webhook
// PATCH  /api/admin/webhooks/[id]  — (optionnel) toggle active
// ------------------------------------------------------------
// Réponse :
//   200 { ok: true, data: { deleted: true } }
//   404 { ok: false, error: "Webhook introuvable" }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('`id` manquant', 400)

  const existing = await db.webhookEndpoint.findUnique({ where: { id } })
  if (!existing) {
    return fail('Webhook introuvable', 404)
  }

  await db.webhookEndpoint.delete({ where: { id } })
  console.log(`[admin/webhooks] Webhook supprimé : ${existing.name} (${id})`)

  return ok({ deleted: true, id })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return fail('`id` manquant', 400)

  const existing = await db.webhookEndpoint.findUnique({ where: { id } })
  if (!existing) {
    return fail('Webhook introuvable', 404)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as { active?: unknown }

  if (typeof b.active === 'boolean') {
    const updated = await db.webhookEndpoint.update({
      where: { id },
      data: { active: b.active },
    })
    return ok({ webhook: { id: updated.id, active: updated.active } })
  }

  return fail('Aucun champ à mettre à jour (`active` boolean attendu)', 400)
}
