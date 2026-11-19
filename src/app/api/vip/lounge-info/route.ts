// ============================================================
// /api/vip/lounge-info — QR_ROUTING (QR d'Entrée CLIENT_GLOBAL)
// ------------------------------------------------------------
// Endpoint PUBLIC (pas de session requise — le client vient de
// scanner le QR d'entrée du salon, il n'est pas authentifié).
//
// Rôle : fournir à Nathalie le nom du salon + le message de
// bienvenue officiel pour l'écran d'accueil GLOBAL :
//   « Bienvenue au Salon VIP [Nom du Salon]. Je suis Nathalie,
//     votre guide personnel. »
//
// Source : tenant.config (chargerVipConfig) — général.nom et
// Denise.messageBienvenue, avec fallback sur les défauts.
// Multi-tenant safe : aucune valeur codée en dur côté client.
// ============================================================

import { NextRequest } from 'next/server'
import { ok } from '@/lib/session'
import { chargerVipConfig, DEFAUT_CONFIG, DEFAUT_DENISE } from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  let nom = DEFAUT_CONFIG.general.nom
  let messageBienvenue = DEFAUT_DENISE.messageBienvenue
  let logo: string | null = DEFAUT_CONFIG.general.logo ?? null

  try {
    const { config, deniseSettings } = await chargerVipConfig()
    if (config?.general?.nom) nom = config.general.nom
    if (deniseSettings?.messageBienvenue) messageBienvenue = deniseSettings.messageBienvenue
    if (config?.general?.logo !== undefined) logo = config.general.logo
  } catch {
    // DB indisponible ou config absente → on reste sur les défauts
    // (l'écran d'accueil Nathalie ne doit JAMAIS planter sur un nom).
  }

  return ok({
    nom,
    messageBienvenue,
    logo,
  })
}
