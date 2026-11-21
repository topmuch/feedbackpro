'use client'

// ============================================================
// VipGuestAlertBanner — Alerte Maître d'Hôtel (règle killer #2)
// ------------------------------------------------------------
// Détection VIP → alerte INSTANTANÉE et 100% VISUELLE :
// bandeau doré avec nom + photo + niveau + allergies connues.
// Polling léger toutes les 10s sur GET /api/vip/alerts.
// AUCUN son : le mode discrétion du salon l'interdit.
// Bouton « Je m'en occupe » → PATCH prise en charge + audit.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, X, Handshake, ShieldAlert, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

interface GuestAlert {
  id: string
  clientName: string
  photo: string | null
  vipLevel: string
  airline: string | null
  tableNumber: string | null
  motif: string
  detail: string | null
  status: string
  createdAt: string
}

const LEVEL_LABEL: Record<string, string> = {
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function VipGuestAlertBanner({ onHandled }: { onHandled?: () => void }) {
  const [alerts, setAlerts] = useState<GuestAlert[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/vip/alerts?status=nouvelle&take=10', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) setAlerts(json.data ?? [])
    } catch {
      /* polling silencieux */
    }
  }, [])

  useEffect(() => {
    poll()
    const t = setInterval(poll, 10000) // alerte instantanée : polling 10s
    return () => clearInterval(t)
  }, [poll])

  const prendreEnCharge = async (alert: GuestAlert) => {
    try {
      setBusy(alert.id)
      const res = await fetch('/api/vip/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, action: 'prise', staffName: 'Maître d’Hôtel' }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setAlerts((list) => list.filter((a) => a.id !== alert.id))
        onHandled?.()
      }
    } catch {
      /* silencieux */
    } finally {
      setBusy(null)
    }
  }

  const visibles = alerts.filter((a) => !dismissed.has(a.id))
  if (visibles.length === 0) return null

  return (
    <div className="space-y-2.5" role="alert" aria-live="polite">
      {visibles.map((a) => {
        const isAllergie = a.motif === 'allergie'
        return (
          <div
            key={a.id}
            className={cn(
              'relative flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border px-4 py-3',
              isAllergie
                ? 'border-[#bc7155]/40 bg-gradient-to-r from-[#bc7155]/12 via-white to-white'
                : 'border-[#bc7155]/50 bg-gradient-to-r from-[#bc7155]/15 via-white to-white shadow-[0_4px_20px_rgba(201,169,97,0.25)]',
            )}
          >
            {/* Fil doré animé à gauche (visuel discret, pas de son) */}
            <span className={cn('absolute inset-y-0 left-0 w-1', isAllergie ? 'bg-[#bc7155]' : 'bg-gradient-to-b from-[#bc7155] to-[#8B6F47]')} />

            <Avatar className="h-11 w-11 shrink-0 ring-2 ring-[#bc7155]/50">
              {a.photo && <AvatarImage src={a.photo} alt={a.clientName} />}
              <AvatarFallback className="bg-[#bc7155]/20 text-sm font-bold text-[#8B6F47]">
                {initials(a.clientName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p
                className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-[#2C2C2C]"
                style={SERIF}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {isAllergie ? (
                    <ShieldAlert className="h-4 w-4 shrink-0 text-[#bc7155]" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4 shrink-0 text-[#bc7155]" aria-hidden />
                  )}
                  <span className="min-w-0 break-words">
                    {isAllergie ? 'Allergie connue' : 'Client VIP détecté'} — {a.clientName}
                  </span>
                </span>
                <span className="rounded-full bg-[#bc7155]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8B6F47]">
                  {LEVEL_LABEL[a.vipLevel] ?? a.vipLevel}
                </span>
                {a.airline && (
                  <span className="hidden text-xs font-normal text-[#8B6F47] sm:inline">· {a.airline}</span>
                )}
                {a.tableNumber && (
                  <span className="rounded-full bg-[#2C2C2C]/8 px-1.5 py-0.5 text-[10px] font-semibold text-[#2C2C2C]">
                    {a.tableNumber}
                  </span>
                )}
              </p>
              {a.detail && <p className="mt-0.5 line-clamp-2 text-xs text-[#8B6F47]">{a.detail}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => prendreEnCharge(a)}
                disabled={busy === a.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60',
                  isAllergie ? 'bg-[#bc7155]' : 'bg-gradient-to-br from-[#bc7155] to-[#8B6F47]',
                )}
              >
                {busy === a.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Handshake className="h-3.5 w-3.5" aria-hidden />
                )}
                Je m’en occupe
              </button>
              <button
                onClick={() => setDismissed((d) => new Set(d).add(a.id))}
                className="rounded-full p-1.5 text-[#8B6F47] hover:bg-[#bc7155]/10"
                aria-label={`Masquer l'alerte ${a.clientName}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
