// ============================================================
// GET /api/vip/staff-auth
// ------------------------------------------------------------
// Renvoie la liste des membres du staff VIP pour alimenter le
// sélecteur de connexion de la PWA staff. La PWA staff est
// publique (pas d'auth) : on affiche un dropdown de noms.
//
// En production, cette route interrogerait une table VipStaff.
// Pour l'instant on renvoie une liste statique de rôles salon VIP.
//
// Réponse : { ok: true, data: [{ id, name, role, emoji }] }
// ============================================================

import { NextRequest } from 'next/server'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/vip/staff-auth — returns hardcoded VIP staff list for login dropdown
// (In production, this would query a VipStaff table, but for now we use a
// static list of salon VIP staff roles)
export async function GET(_req: NextRequest) {
  const staff = [
    { id: 'vip-manager', name: 'Amadou Diallo', role: 'Manager', emoji: '👨‍💼' },
    { id: 'vip-concierge', name: 'Fatou Sow', role: 'Concierge', emoji: '🛎️' },
    { id: 'vip-server-1', name: 'Moussa Traoré', role: 'Serveur', emoji: '🍽️' },
    { id: 'vip-server-2', name: 'Awa Ndiaye', role: 'Serveuse', emoji: '🍽️' },
    { id: 'vip-bartender', name: 'Ibrahima Fall', role: 'Barman', emoji: '🍸' },
    { id: 'vip-cleaning', name: 'Khadija Ba', role: 'Housekeeping', emoji: '🧹' },
  ]
  return ok(staff)
}
