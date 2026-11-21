// ============================================================
// /api/vip/assistance — Support direct Salon VIP → Superadmin
// ------------------------------------------------------------
// L'onglet « Assistance » du dashboard Salon VIP permet au salon
// de contacter l'équipe FeedVoice (superadmin) en cas de problème.
//
// CONNEXION AVEC LE SUPERADMIN : les messages sont stockés dans la
// table ContactMessage avec le marqueur typeEtablissement =
// 'salon_vip_assistance'. Ils arrivent donc DIRECTEMENT dans l'onglet
// « Messages » du superadmin (compteur de non-lus inclus), sans
// nouveau modèle en base. Le superadmin répond par email via le
// bouton « Répondre » existant.
//
// POST : crée une demande d'assistance (catégorie, priorité, message)
// GET  : historique des demandes de ce compte (suivi des statuts
//        NOUVEAU → LU → TRAITE côté superadmin)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { requirePro, unauthorized } from '@/lib/guards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Marqueur stocké dans ContactMessage.typeEtablissement */
const MARQUEUR = 'salon_vip_assistance'

const CATEGORIES_VALIDES = new Set(['technique', 'compte', 'wifi_qr', 'fonctionnalite', 'autre'])

type Expediteur = { nomSalon: string; email: string }

/**
 * Résout l'expéditeur de la demande :
 * - Pro connecté → nom de l'établissement + email du compte ;
 * - Superadmin (démo du dashboard VIP) → fallback « Salon VIP » ;
 * - Anonyme → null (401).
 */
async function resolveExpediteur(req: NextRequest): Promise<Expediteur | null> {
  const ctx = await requirePro(req)
  if (ctx) {
    return { nomSalon: ctx.pro.nomEtablissement || 'Salon VIP', email: ctx.user.email }
  }
  const user = await getSessionUser(req)
  if (!user) return null
  return { nomSalon: 'Salon VIP', email: user.email }
}

export async function GET(req: NextRequest) {
  const expediteur = await resolveExpediteur(req)
  if (!expediteur) return unauthorized()

  try {
    const messages = await db.contactMessage.findMany({
      where: { typeEtablissement: MARQUEUR, email: expediteur.email },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return ok(
      messages.map((m) => ({
        id: m.id,
        categorie: m.defi ?? 'autre',
        priorite: m.volume === 'Urgente' ? 'urgente' : 'normale',
        message: m.message,
        statut: m.statut,
        createdAt: m.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    console.error('[vip/assistance GET] Error:', err)
    return fail('Historique indisponible', 500)
  }
}

export async function POST(req: NextRequest) {
  const expediteur = await resolveExpediteur(req)
  if (!expediteur) return unauthorized()

  try {
    const body = await req.json().catch(() => null)
    const categorie =
      typeof body?.categorie === 'string' && CATEGORIES_VALIDES.has(body.categorie)
        ? body.categorie
        : 'autre'
    const priorite = body?.priorite === 'urgente' ? 'urgente' : 'normale'
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!message) return fail('Le message ne peut pas être vide', 400)
    if (message.length > 2000) return fail('Message trop long (2000 caractères maximum)', 400)

    const created = await db.contactMessage.create({
      data: {
        // nomEtablissement se termine déjà par « Salon VIP » pour les
        // tenants vip_lounge → on n'ajoute le suffixe que si absent.
        nom: expediteur.nomSalon.includes('Salon VIP')
          ? expediteur.nomSalon
          : `${expediteur.nomSalon} · Salon VIP`,
        email: expediteur.email,
        typeEtablissement: MARQUEUR,
        volume: priorite === 'urgente' ? 'Urgente' : 'Normale',
        defi: categorie,
        message: priorite === 'urgente' ? `[URGENT] ${message}` : message,
        statut: 'NOUVEAU',
      },
    })

    return ok({ id: created.id, sent: true })
  } catch (err) {
    console.error('[vip/assistance POST] Error:', err)
    return fail('Envoi impossible — réessayez', 500)
  }
}
