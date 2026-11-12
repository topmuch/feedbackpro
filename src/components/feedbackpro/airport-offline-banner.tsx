'use client'

// ============================================================
// AirportOfflineBanner — Banner sticky pour la PWA aéroport
// (Task 3 Phase 2 — FeedbackPro airport)
// ------------------------------------------------------------
// Affiché en haut de la PWA voyageur quand :
//   • offline            → banner ambre, icône WifiOff (animate-pulse)
//   • online + pending>0 → banner ciel, bouton "Forcer la sync maintenant"
//   • online + pending=0 → rien (return null)
//
// Utilise le hook useAirportOffline (window events + IndexedDB).
// Ne dépend d'aucune lib externe (lucide-react déjà dans le projet).
// ============================================================

import { CloudUpload, RefreshCw, WifiOff } from 'lucide-react'

import { useAirportOffline } from '@/hooks/use-airport-offline'

export function AirportOfflineBanner({ className }: { className?: string }) {
  const { isOnline, pendingCount, forceSync } = useAirportOffline()

  const extra = className ? ` ${className}` : ''

  // 1) Offline — banner ambre
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`sticky top-0 z-50 w-full border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-200${extra}`}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <WifiOff className="h-4 w-4 animate-pulse" aria-hidden="true" />
          <span>
            Mode offline — votre signalement sera envoyé dès le retour du réseau.
          </span>
        </div>
      </div>
    )
  }

  // 2) Online mais file d'attente non vide — banner ciel + bouton forceSync
  if (pendingCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`sticky top-0 z-50 w-full border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sky-200${extra}`}
      >
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            <span>
              {pendingCount} signalement(s) en file d&apos;attente — synchronisation…
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              forceSync().catch(() => undefined)
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/20 px-2 py-1 text-xs font-semibold transition-colors hover:bg-sky-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Forcer la sync maintenant
          </button>
        </div>
      </div>
    )
  }

  // 3) Online + file vide → rien à afficher
  return null
}
