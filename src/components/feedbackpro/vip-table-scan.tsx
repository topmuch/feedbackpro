'use client'

// ============================================================
// VIP-PHASE1 — <VipTableScan /> — Vue client (scan QR table)
// ------------------------------------------------------------
// Quand un client scanne le QR code d'une table VIP, il arrive sur
// cette vue qui :
//   1. Résout le qrToken vers la table (GET /api/vip/tables + filtrage
//      côté client, ou utilisation d'un endpoint dédié). Ici on
//      interroge /api/vip/tables puis on cherche le token côté client.
//   2. Affiche un message de bienvenue "🥂 Bienvenue, vous êtes à la
//      Table T-XX".
//   3. Propose 7 boutons d'action (refreshment, menu, shower, charger,
//      concierge, problem, rating). Chaque clic crée une VipTableRequest
//      via POST /api/vip/requests.
//   4. Après l'envoi, affiche une confirmation : "Votre demande a été
//      transmise. Le staff arrive dans un instant. 🥂"
//
// La vue est publique (pas de getSessionUser) : le client final n'est
// pas authentifié, il scanne juste un QR code.
// ============================================================

import { useEffect, useState } from 'react'
import {
  Wine,
  Utensils,
  ShowerHead,
  Plug,
  ConciergeBell,
  AlertTriangle,
  Star,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ---- Types ----
type ScanTable = {
  id: string
  tableNumber: string
  zone: string
  seats: number
  qrToken: string
}

type RequestType =
  | 'refreshment'
  | 'menu'
  | 'shower'
  | 'charger'
  | 'concierge'
  | 'problem'
  | 'rating'

type ActionDef = {
  type: RequestType
  emoji: string
  label: string
  description: string
  Icon: typeof Wine
  tone: 'gold' | 'bronze' | 'sage' | 'amethyst' | 'terracotta'
}

const ACTIONS: ActionDef[] = [
  {
    type: 'refreshment',
    emoji: '🍸',
    label: 'Commander un rafraîchissement',
    description: 'Champagne, cocktail, café…',
    Icon: Wine,
    tone: 'gold',
  },
  {
    type: 'menu',
    emoji: '📋',
    label: 'Voir le menu du jour',
    description: 'Carte & suggestions du chef',
    Icon: Utensils,
    tone: 'bronze',
  },
  {
    type: 'shower',
    emoji: '🚿',
    label: 'Réserver une douche',
    description: 'Cabine privée disponible',
    Icon: ShowerHead,
    tone: 'sage',
  },
  {
    type: 'charger',
    emoji: '🔌',
    label: 'Demander un chargeur',
    description: 'USB-C, Lightning, micro-USB',
    Icon: Plug,
    tone: 'bronze',
  },
  {
    type: 'concierge',
    emoji: '🛎️',
    label: 'Appeler le concierge',
    description: 'Une demande spécifique ?',
    Icon: ConciergeBell,
    tone: 'amethyst',
  },
  {
    type: 'problem',
    emoji: '⚠️',
    label: 'Signaler un problème',
    description: 'Confort, propreté, bruit…',
    Icon: AlertTriangle,
    tone: 'terracotta',
  },
  {
    type: 'rating',
    emoji: '⭐',
    label: 'Noter mon expérience',
    description: 'Aidez-nous à perfectinner le service',
    Icon: Star,
    tone: 'gold',
  },
]

const TONE_STYLE: Record<ActionDef['tone'], { bg: string; ring: string; iconText: string; hover: string }> = {
  gold: { bg: 'bg-[#C9A961]/8', ring: 'ring-[#C9A961]/30', iconText: 'text-[#C9A961]', hover: 'hover:bg-[#C9A961]/12 hover:ring-[#C9A961]/40' },
  bronze: { bg: 'bg-[#8B6F47]/8', ring: 'ring-[#8B6F47]/30', iconText: 'text-[#8B6F47]', hover: 'hover:bg-[#8B6F47]/12 hover:ring-[#8B6F47]/40' },
  sage: { bg: 'bg-[#4A7C59]/8', ring: 'ring-[#4A7C59]/30', iconText: 'text-[#4A7C59]', hover: 'hover:bg-[#4A7C59]/12 hover:ring-[#4A7C59]/40' },
  amethyst: { bg: 'bg-[#6B4C9A]/8', ring: 'ring-[#6B4C9A]/30', iconText: 'text-[#6B4C9A]', hover: 'hover:bg-[#6B4C9A]/12 hover:ring-[#6B4C9A]/40' },
  terracotta: { bg: 'bg-[#C97B63]/8', ring: 'ring-[#C97B63]/30', iconText: 'text-[#C97B63]', hover: 'hover:bg-[#C97B63]/12 hover:ring-[#C97B63]/40' },
}

export function VipTableScan({ qrToken, onExit }: { qrToken: string; onExit?: () => void }) {
  const [table, setTable] = useState<ScanTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<RequestType | null>(null)
  const [confirmation, setConfirmation] = useState<{ type: RequestType; tableNumber: string } | null>(null)

  // Résolution du token → table (endpoint public, pas de session requise)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/vip/tables/by-qr/${encodeURIComponent(qrToken)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (!json?.ok) {
          setError(json?.error || 'QR code introuvable.')
          setLoading(false)
          return
        }
        const d = json.data
        setTable({
          id: qrToken, // on n'a pas l'id interne côté public — on utilise le token comme clé
          tableNumber: d.tableNumber,
          zone: d.zone,
          seats: d.seats,
          qrToken,
        })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Erreur réseau. Vérifiez votre connexion.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [qrToken])

  // Création d'une demande via POST /api/vip/requests
  const sendRequest = async (action: ActionDef) => {
    if (!table) return
    setSending(action.type)
    setConfirmation(null)
    try {
      const res = await fetch('/api/vip/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken: table.qrToken,
          type: action.type,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Erreur')
      }
      setConfirmation({ type: action.type, tableNumber: table.tableNumber })
    } catch {
      setError("Impossible d'envoyer votre demande. Réessayez dans un instant.")
    } finally {
      setSending(null)
    }
  }

  // ---- États de chargement / erreur ----
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF7] px-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#C9A961]" aria-hidden />
        <p className="text-sm text-[#8B6F47]">Connexion à votre table…</p>
      </div>
    )
  }

  if (error && !table) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF7] px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C97B63]/10">
          <AlertTriangle className="h-7 w-7 text-[#C97B63]" aria-hidden />
        </div>
        <h1
          className="text-2xl font-semibold text-[#2C2C2C]"
          style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
        >
          Oups, ce QR code est introuvable
        </h1>
        <p className="max-w-sm text-sm text-[#8B6F47]">{error}</p>
        <p className="text-xs text-[#8B6F47]/70">
          Demandez à l'hôte du salon de vérifier le QR code affiché sur votre table.
        </p>
        {onExit && (
          <Button variant="outline" onClick={onExit} className="mt-2 gap-2 border-[#EAE5DC] bg-white text-[#8B6F47]">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
          </Button>
        )}
      </div>
    )
  }

  if (!table) return null

  // ---- Confirmation affichée après envoi d'une demande ----
  if (confirmation) {
    const action = ACTIONS.find((a) => a.type === confirmation.type)!
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#FAFAF7] px-6 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A961]/20 to-[#4A7C59]/20 ring-4 ring-white">
          <span className="text-5xl" aria-hidden>{action.emoji}</span>
        </div>
        <div>
          <h1
            className="text-2xl font-semibold text-[#2C2C2C]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            Votre demande a été transmise
          </h1>
          <p className="mt-2 text-sm text-[#8B6F47]">
            Le staff arrive dans un instant. 🥂
          </p>
        </div>
        <div className="rounded-2xl border border-[#EAE5DC] bg-white px-5 py-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <p className="text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Demande</p>
          <p className="mt-1 text-sm font-semibold text-[#2C2C2C]">{action.label}</p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-[#8B6F47]">Table</p>
          <p className="mt-0.5 text-sm font-semibold text-[#2C2C2C]">{confirmation.tableNumber}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setConfirmation(null)}
          className="gap-2 border-[#C9A961]/40 bg-[#C9A961]/8 text-[#8B6F47] hover:bg-[#C9A961]/15"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Faire une autre demande
        </Button>
      </div>
    )
  }

  // ---- Vue principale ----
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Bandeau de bienvenue */}
        <div
          className="relative overflow-hidden rounded-3xl border border-[#EAE5DC] bg-white p-8 text-center shadow-[0_8px_32px_rgba(201,169,97,0.10)]"
        >
          {/* Décor doré */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C9A961] via-[#8B6F47] to-[#C9A961]"
            aria-hidden
          />
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#C9A961]/10" aria-hidden />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-[#6B4C9A]/8" aria-hidden />

          <span className="text-5xl" aria-hidden>🥂</span>
          <p className="mt-3 text-xs font-medium uppercase tracking-widest text-[#8B6F47]">
            Salon VIP · Lounge Premium
          </p>
          <h1
            className="mt-2 text-2xl font-semibold text-[#2C2C2C]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            Bienvenue, vous êtes à la Table {table.tableNumber}
          </h1>
          <p className="mt-2 text-sm text-[#8B6F47]">
            Choisissez une action ci-dessous — notre équipe vous répond en un instant.
          </p>
        </div>

        {/* Message d'erreur réseau (réinitialisé à chaque sendRequest) */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#C97B63]/25 bg-[#C97B63]/8 px-4 py-3 text-sm text-[#C97B63]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Grille d'actions */}
        <div className="mt-6 space-y-3">
          {ACTIONS.map((action) => {
            const tone = TONE_STYLE[action.type] ?? TONE_STYLE.gold
            const Icon = action.Icon
            const isSending = sending === action.type
            return (
              <button
                key={action.type}
                type="button"
                disabled={sending !== null}
                onClick={() => sendRequest(action)}
                className={cn(
                  'group flex w-full items-center gap-4 rounded-2xl border border-[#EAE5DC] bg-white p-4 text-left shadow-[0_4px_20px_rgba(201,169,97,0.06)] ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(201,169,97,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
                  tone.hover,
                )}
                aria-label={action.label}
              >
                {/* Emoji / icône */}
                <span
                  className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ring-1 transition-colors',
                    tone.bg,
                    tone.ring,
                  )}
                  aria-hidden
                >
                  {action.emoji}
                </span>

                {/* Texte */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#2C2C2C]">{action.label}</p>
                  <p className="mt-0.5 text-xs text-[#8B6F47]">{action.description}</p>
                </div>

                {/* Spinner ou flèche */}
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tone.bg)}>
                  {isSending ? (
                    <Loader2 className={cn('h-4 w-4 animate-spin', tone.iconText)} aria-hidden />
                  ) : (
                    <Icon className={cn('h-4 w-4', tone.iconText)} aria-hidden />
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {/* Pied de page */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-[#8B6F47]">
            <Sparkles className="h-3 w-3" aria-hidden /> Service discret — votre confort avant tout.
          </p>
          <p className="text-[11px] text-[#8B6F47]/70">
            Table {table.tableNumber} · {table.seats} places · {table.zone}
          </p>
        </div>
      </div>
    </div>
  )
}

export default VipTableScan
