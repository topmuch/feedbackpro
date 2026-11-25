// ============================================================
// /api/city/pricing
// ------------------------------------------------------------
// Ville Connectée — Tarifs des options premium pour les commerces.
// La mairie définit les prix des features premium (menu, grille
// tarifaire, annonce sponsorisée) dans l'onglet Tarifs du dashboard.
// Les citoyens voient ces prix dans le formulaire d'inscription.
//
// GET  → { ok, data: { tiers: PricingTiers } }
// POST → { ok, data: { tiers: PricingTiers } } (mise à jour)
// ============================================================

import { NextRequest } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PricingTier = {
  label: string
  price: number
  currency: string
  period: string
  description: string
  photoUrl?: string | null
}

type PricingTiers = {
  menu: PricingTier
  priceGrid: PricingTier
  sponsored: PricingTier
}

// Tarifs par défaut (utilisés si la mairie n'a rien configuré)
const DEFAULT_TIERS: PricingTiers = {
  menu: {
    label: 'Menu & Commande WhatsApp',
    price: 10000,
    currency: 'FCFA',
    period: 'mois',
    description: "Jusqu'à 10 plats avec photo et prix. Bouton Commander WhatsApp pré-rempli.",
    photoUrl: null,
  },
  priceGrid: {
    label: 'Grille Tarifaire',
    price: 5000,
    currency: 'FCFA',
    period: 'mois',
    description: "Photos de prestations + prix « à partir de ». Reçoit des demandes qualifiées.",
    photoUrl: null,
  },
  sponsored: {
    label: 'Annonce Sponsorisée / Offre Flash',
    price: 15000,
    currency: 'FCFA',
    period: 'semaine',
    description: 'Affichage en tête de liste + badge Sponsorisé + offre flash avec compte à rebours.',
    photoUrl: null,
  },
}

// ---------------------------------------------------------------
// GET — récupère les tarifs
// ---------------------------------------------------------------
export async function GET() {
  try {
    const raw = await getSetting('city_pricing_tiers', '')
    if (!raw) {
      return ok({ tiers: DEFAULT_TIERS })
    }
    const parsed = JSON.parse(raw) as PricingTiers
    // Fusion avec les valeurs par défaut pour les champs manquants
    const merged: PricingTiers = {
      menu: { ...DEFAULT_TIERS.menu, ...parsed.menu },
      priceGrid: { ...DEFAULT_TIERS.priceGrid, ...parsed.priceGrid },
      sponsored: { ...DEFAULT_TIERS.sponsored, ...parsed.sponsored },
    }
    return ok({ tiers: merged })
  } catch {
    return ok({ tiers: DEFAULT_TIERS })
  }
}

// ---------------------------------------------------------------
// POST — met à jour les tarifs (mairie only)
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as Partial<PricingTiers>
  const tiers: PricingTiers = {
    menu: {
      label: typeof b.menu?.label === 'string' ? b.menu.label : DEFAULT_TIERS.menu.label,
      price: typeof b.menu?.price === 'number' ? b.menu.price : DEFAULT_TIERS.menu.price,
      currency: 'FCFA',
      period: typeof b.menu?.period === 'string' ? b.menu.period : DEFAULT_TIERS.menu.period,
      description: typeof b.menu?.description === 'string' ? b.menu.description : DEFAULT_TIERS.menu.description,
      photoUrl: b.menu?.photoUrl ?? null,
    },
    priceGrid: {
      label: typeof b.priceGrid?.label === 'string' ? b.priceGrid.label : DEFAULT_TIERS.priceGrid.label,
      price: typeof b.priceGrid?.price === 'number' ? b.priceGrid.price : DEFAULT_TIERS.priceGrid.price,
      currency: 'FCFA',
      period: typeof b.priceGrid?.period === 'string' ? b.priceGrid.period : DEFAULT_TIERS.priceGrid.period,
      description: typeof b.priceGrid?.description === 'string' ? b.priceGrid.description : DEFAULT_TIERS.priceGrid.description,
      photoUrl: b.priceGrid?.photoUrl ?? null,
    },
    sponsored: {
      label: typeof b.sponsored?.label === 'string' ? b.sponsored.label : DEFAULT_TIERS.sponsored.label,
      price: typeof b.sponsored?.price === 'number' ? b.sponsored.price : DEFAULT_TIERS.sponsored.price,
      currency: 'FCFA',
      period: typeof b.sponsored?.period === 'string' ? b.sponsored.period : DEFAULT_TIERS.sponsored.period,
      description: typeof b.sponsored?.description === 'string' ? b.sponsored.description : DEFAULT_TIERS.sponsored.description,
      photoUrl: b.sponsored?.photoUrl ?? null,
    },
  }

  try {
    await setSetting('city_pricing_tiers', JSON.stringify(tiers))
    console.log('[city-pricing] Tarifs mis à jour par la mairie')
    return ok({ tiers })
  } catch (e) {
    console.error('[city-pricing] Erreur sauvegarde:', e)
    return fail('Erreur lors de la sauvegarde des tarifs', 500)
  }
}
