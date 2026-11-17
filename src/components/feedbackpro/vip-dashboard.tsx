'use client'

// ============================================================
// TENANT-3 — <VIPDashboard /> — Dashboard Salon VIP
// ------------------------------------------------------------
// Module dédié aux salons VIP (luxe & discrétion).
// Palette or (#D4AF37) / noir (#1a1a1a) / bordeaux (#722F37).
// Élégant, minimal, animations subtiles.
//
// Zones gérées (6) :
//   1. vip_buffet     — Buffet / Bar
//   2. vip_relaxation — Espace Détente
//   3. vip_showers    — Douches / Toilettes privées
//   4. vip_reception  — Réception / Conciergerie
//   5. vip_meeting    — Salles de réunion privées
//   6. com_lounge     — Salon VIP / Lounge
//
// Denise (TTS) :
//   - 1 niveau uniquement : "Info/Doux"
//   - TTS DÉSACTIVÉ par défaut — notifications visuelles uniquement
//     (vibration pop-up, badges discrets).
//   - Denise ne parle QUE si explicitement demandé ou urgence VIP.
//
// Features :
//   - Mode discrétion : toutes les alertes sont visuelles (aucun son)
//   - Alerte Client VIP : notification immédiate quand un client VIP
//     signale un problème
//   - Checklist buffet : timer 30 min avec niveau de remplissage %
//   - Gestion douches : statut temps réel (Libre/Occupé/Nettoyage) +
//     QR réservation
//   - Flash Reward Premium : offres luxe (champagne, upgrade massage)
//
// Interdictions :
//   - Pas de Wallboard airport style
//   - Pas d'alertes vocales fortes
//   - Pas de publicité classique
//   - Pas de Radar Prediction
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wine,
  LogOut,
  Building2,
  ShowerHead,
  Utensils,
  ConciergeBell,
  Sparkles,
  Bell,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  QrCode,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { getZonesByTenant } from '@/lib/airport-config'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type VipIncident = {
  id: string
  zone: { code: string; nom: string; emoji: string } | null
  problemType: string
  commentaire: string | null
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'
  createdAt: string
}

type Shower = {
  id: string
  showerNumber: number
  status: 'free' | 'occupied' | 'cleaning'
  occupiedSince: string | null
  updatedAt: string
}

type BuffetItem = {
  id: string
  item: string
  fillLevel: number
  lastCheck: string
  nextCheck: string
  status: 'ok' | 'warning' | 'critical'
}

type VipTab = 'overview' | 'buffet' | 'showers' | 'incidents' | 'rewards'

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function useClock(): string {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const initial = setTimeout(() => setNow(new Date()), 0)
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [])
  if (!now) return '--:--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function minutesDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

// Effet vibration (mode discrétion — silencieux, haptique uniquement)
function vibrationDiscrete(): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  // Pattern discret : 2 pulses courts (pas de vibration longue invasive)
  navigator.vibrate([40, 50, 40])
}

// Traduction libellé item buffet
const BUFFET_ITEM_LABELS: Record<string, string> = {
  buffet_fill: 'Niveau buffet',
  drinks_level: 'Niveau boissons',
  cleanliness: 'Propreté',
}

const BUFFET_STATUS_LABEL: Record<BuffetItem['status'], string> = {
  ok: 'OK',
  warning: 'À surveiller',
  critical: 'Critique',
}

const BUFFET_STATUS_COLOR: Record<BuffetItem['status'], string> = {
  ok: 'text-emerald-400 border-emerald-700/40',
  warning: 'text-amber-400 border-amber-700/40',
  critical: 'text-rose-400 border-rose-700/40',
}

const SHOWER_STATUS_LABEL: Record<Shower['status'], string> = {
  free: 'Libre',
  occupied: 'Occupé',
  cleaning: 'Nettoyage',
}

const SHOWER_STATUS_COLOR: Record<Shower['status'], string> = {
  free: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/40',
  occupied: 'bg-amber-500/20 text-amber-300 border-amber-700/40',
  cleaning: 'bg-sky-500/20 text-sky-300 border-sky-700/40',
}

const STATUT_INCIDENT_LABEL: Record<VipIncident['statut'], string> = {
  EN_ATTENTE: 'Nouveau',
  EN_COURS: 'En cours',
  RESOLU: 'Résolu',
}

const STATUT_INCIDENT_COLOR: Record<VipIncident['statut'], string> = {
  EN_ATTENTE: 'bg-amber-500/20 text-amber-300 border-amber-700/40',
  EN_COURS: 'bg-sky-500/20 text-sky-300 border-sky-700/40',
  RESOLU: 'bg-emerald-500/20 text-emerald-300 border-emerald-700/40',
}

// Zones VIP (6)
const VIP_ZONES = getZonesByTenant('vip_lounge')

// Flash Rewards Premium (offres luxe — JAMAIS "-10% café")
const VIP_FLASH_REWARDS = [
  {
    id: 'champagne',
    titre: 'Verre de Champagne',
    description: 'Cuvée prestige offerte à votre table',
    emoji: '🥂',
  },
  {
    id: 'massage',
    titre: 'Upgrade Massage 15 min',
    description: 'Détente express en salle de relaxation',
    emoji: '💆',
  },
  {
    id: 'upgrade_suite',
    titre: 'Upgrade Suite Lounge',
    description: 'Accès privé à la suite VIP pour 1h',
    emoji: '👑',
  },
  {
    id: 'cocktail',
    titre: 'Cocktail Signature',
    description: 'Création exclusive du barman en privé',
    emoji: '🍸',
  },
] as const

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export default function VIPDashboard() {
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)

  const [tab, setTab] = useState<VipTab>('overview')
  const [incidents, setIncidents] = useState<VipIncident[]>([])
  const [showers, setShowers] = useState<Shower[]>([])
  const [buffet, setBuffet] = useState<BuffetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vipAlerts, setVipAlerts] = useState<VipIncident[]>([])
  const clock = useClock()
  const [today, setToday] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  const loungeName = session?.pro?.nomEtablissement ?? 'Salon VIP'

  const refreshData = useCallback(async () => {
    try {
      const [incRes, shRes, bfRes] = await Promise.all([
        fetch('/api/vip/incidents', { cache: 'no-store' }),
        fetch('/api/vip/showers', { cache: 'no-store' }),
        fetch('/api/vip/buffet', { cache: 'no-store' }),
      ])
      const incJson = await incRes.json().catch(() => null)
      const shJson = await shRes.json().catch(() => null)
      const bfJson = await bfRes.json().catch(() => null)
      if (incJson?.ok) setIncidents(incJson.data ?? [])
      if (shJson?.ok) setShowers(shJson.data ?? [])
      if (bfJson?.ok) setBuffet(bfJson.data ?? [])
      setError(null)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true)
      setToday(new Date())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    refreshData()
    const interval = setInterval(refreshData, 15000)
    return () => clearInterval(interval)
  }, [refreshData])

  // Alerte VIP : nouveau signalement non résolu → notification visuelle
  // (jamais de son — mode discrétion). On garde une liste de alerts
  // déjà notifiées pour éviter de revibrer à chaque poll.
  const notifiedRef = useState<Set<string>>(() => new Set())[0]
  useEffect(() => {
    const nouveaux = incidents.filter(
      (i) => i.statut === 'EN_ATTENTE' && !notifiedRef.current.has(i.id),
    )
    if (nouveaux.length === 0) return
    // Mode discrétion : vibration haptique (sans son).
    vibrationDiscrete()
    for (const i of nouveaux) {
      notifiedRef.current.add(i.id)
    }
    setVipAlerts(nouveaux)
    // Auto-dismiss après 10s (notification visuelle discrète)
    const t = setTimeout(() => setVipAlerts([]), 10000)
    return () => clearTimeout(t)
  }, [incidents, notifiedRef])

  // Stats par zone
  const statsByZone = useMemo(() => {
    const map = new Map<string, { total: number; open: number; resolved: number }>()
    for (const z of VIP_ZONES) map.set(z.code, { total: 0, open: 0, resolved: 0 })
    for (const inc of incidents) {
      const code = inc.zone?.code ?? 'com_lounge'
      const s = map.get(code)
      if (!s) continue
      s.total++
      if (inc.statut !== 'RESOLU') s.open++
      else s.resolved++
    }
    return map
  }, [incidents])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1a1a1a]">
        <div className="text-center">
          <Wine className="mx-auto h-10 w-10 text-[#D4AF37]" />
          <p className="mt-3 font-mono text-sm text-[#D4AF37]/70">Chargement du salon VIP…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#1a1a1a] font-sans text-[#F5F5F0]">
      {/* ---------- HEADER ---------- */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#D4AF37]/30 bg-[#1a1a1a]/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10">
            <Wine className="h-5 w-5 text-[#D4AF37]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-semibold leading-tight tracking-wide text-[#D4AF37] sm:text-lg">
              {loungeName}
            </h1>
            <p className="hidden text-[11px] text-[#F5F5F0]/50 sm:block" suppressHydrationWarning>
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3 text-[#D4AF37]/60" />
                Salon VIP
                <span className="text-[#F5F5F0]/20">·</span>
                {today ? formatDateLong(today) : ''}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden flex-col items-end sm:flex">
            <div className="font-mono text-lg font-semibold tabular-nums text-[#D4AF37]" suppressHydrationWarning>
              {clock}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#F5F5F0]/40">Heure</div>
          </div>

          <button
            type="button"
            onClick={() => refreshData()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-2.5 py-1.5 text-xs font-medium text-[#D4AF37] transition hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/10"
            title="Rafraîchir"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#F5F5F0]/10 bg-[#F5F5F0]/5 px-2.5 py-1.5 text-xs font-medium text-[#F5F5F0]/70 transition hover:border-[#722F37]/60 hover:bg-[#722F37]/20 hover:text-[#F5F5F0]"
            title="Se déconnecter"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* ---------- VIP CLIENT ALERT (notification visuelle discrète) ---------- */}
      {vipAlerts.length > 0 && (
        <div
          role="alert"
          className="mx-4 mt-4 animate-pulse rounded-xl border border-[#D4AF37]/60 bg-[#D4AF37]/10 p-4 sm:mx-6"
        >
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#D4AF37]">
                Alerte Client VIP — {vipAlerts.length} nouveau
                {vipAlerts.length > 1 ? 'x' : ''} signalement
                {vipAlerts.length > 1 ? 's' : ''}
              </p>
              <p className="mt-0.5 text-xs text-[#F5F5F0]/70">
                {vipAlerts[0]?.zone?.nom ?? 'Zone'} : {vipAlerts[0]?.problemType}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVipAlerts([])}
              className="text-xs text-[#F5F5F0]/50 hover:text-[#D4AF37]"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}

      {/* ---------- TAB BAR ---------- */}
      <nav className="mx-4 mt-4 sm:mx-6" aria-label="Onglets du salon VIP">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-1">
          {([
            { slug: 'overview', label: 'Vue d\'ensemble', emoji: '✨' },
            { slug: 'buffet', label: 'Buffet', emoji: '🍽️' },
            { slug: 'showers', label: 'Douches', emoji: '🚿' },
            { slug: 'incidents', label: 'Signalements', emoji: '📋' },
            { slug: 'rewards', label: 'Récompenses', emoji: '🎁' },
          ] as const).map((t) => {
            const active = tab === t.slug
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => setTab(t.slug)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-[#D4AF37]/15 text-[#D4AF37] shadow-sm'
                    : 'text-[#F5F5F0]/60 hover:bg-[#F5F5F0]/5 hover:text-[#F5F5F0]',
                )}
              >
                <span className="text-base leading-none" aria-hidden>
                  {t.emoji}
                </span>
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* ---------- TAB CONTENT ---------- */}
      <main className="mx-4 mb-6 mt-4 flex-1 sm:mx-6">
        {tab === 'overview' && (
          <OverviewTab
            incidents={incidents}
            showers={showers}
            buffet={buffet}
            statsByZone={statsByZone}
            loading={loading}
          />
        )}
        {tab === 'buffet' && (
          <BuffetTab
            buffet={buffet}
            loading={loading}
            onUpdate={async (id, fillLevel) => {
              try {
                const res = await fetch('/api/vip/buffet', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, fillLevel }),
                })
                if (res.ok) refreshData()
              } catch {
                /* ignore */
              }
            }}
          />
        )}
        {tab === 'showers' && (
          <ShowersTab
            showers={showers}
            loading={loading}
            onAdvance={async (id, status) => {
              try {
                const res = await fetch('/api/vip/showers', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, status }),
                })
                if (res.ok) refreshData()
              } catch {
                /* ignore */
              }
            }}
          />
        )}
        {tab === 'incidents' && (
          <IncidentsTab
            incidents={incidents}
            loading={loading}
            error={error}
            onAdvance={async (id, next) => {
              try {
                const res = await fetch('/api/vip/incidents', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, statut: next }),
                })
                if (res.ok) refreshData()
              } catch {
                /* ignore */
              }
            }}
          />
        )}
        {tab === 'rewards' && <RewardsTab />}
      </main>

      {/* ---------- FOOTER ---------- */}
      <footer className="mt-auto shrink-0 border-t border-[#D4AF37]/20 bg-[#0F0F0F] px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between text-[11px] text-[#F5F5F0]/40">
          <div className="flex items-center gap-2">
            <Wine className="h-3 w-3 text-[#D4AF37]/60" aria-hidden />
            <span>FeedbackPro · Module Salon VIP — Mode discrétion actif</span>
          </div>
          <div className="hidden tabular-nums sm:block">
            Onglet : <span className="text-[#D4AF37]">{tab}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------
// Tab Vue d'ensemble — 6 zones + résumé buffet/douches
// ---------------------------------------------------------------

function OverviewTab({
  incidents,
  showers,
  buffet,
  statsByZone,
  loading,
}: {
  incidents: VipIncident[]
  showers: Shower[]
  buffet: BuffetItem[]
  statsByZone: Map<string, { total: number; open: number; resolved: number }>
  loading: boolean
}) {
  const openIncidents = incidents.filter((i) => i.statut !== 'RESOLU').length
  const freeShowers = showers.filter((s) => s.status === 'free').length
  const totalShowers = showers.length
  const avgBuffet =
    buffet.length > 0 ? Math.round(buffet.reduce((acc, b) => acc + b.fillLevel, 0) / buffet.length) : 100

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#F5F5F0]/50">Signalements ouverts</span>
            <Bell className="h-4 w-4 text-[#D4AF37]/60" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[#D4AF37]">{openIncidents}</p>
        </div>
        <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#F5F5F0]/50">Douches libres</span>
            <ShowerHead className="h-4 w-4 text-[#D4AF37]/60" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[#D4AF37]">
            {freeShowers}<span className="text-base text-[#F5F5F0]/40"> / {totalShowers}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#F5F5F0]/50">Niveau buffet moyen</span>
            <Utensils className="h-4 w-4 text-[#D4AF37]/60" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-[#D4AF37]">{avgBuffet}%</p>
        </div>
      </div>

      {/* Zones (6) */}
      <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#D4AF37]">Zones du salon</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VIP_ZONES.map((z) => {
            const s = statsByZone.get(z.code) ?? { total: 0, open: 0, resolved: 0 }
            return (
              <div
                key={z.code}
                className="rounded-xl border border-[#D4AF37]/10 bg-[#1a1a1a] p-3 transition hover:border-[#D4AF37]/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>
                      {z.emoji}
                    </span>
                    <div>
                      <h3 className="text-sm font-medium text-[#F5F5F0]">{z.nom}</h3>
                      <p className="text-[11px] text-[#F5F5F0]/40">{z.description}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-[#F5F5F0]/60">Total : {s.total}</span>
                  {s.open > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                      {s.open} en cours
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-[#F5F5F0]/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Synchronisation…</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Tab Buffet — Checklist timer 30 min + niveau %
// ---------------------------------------------------------------

function BuffetTab({
  buffet,
  loading,
  onUpdate,
}: {
  buffet: BuffetItem[]
  loading: boolean
  onUpdate: (id: string, fillLevel: number) => Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#D4AF37]">Checklist buffet</h2>
        <p className="text-xs text-[#F5F5F0]/50">
          Vérification toutes les 30 min. Ajustez le niveau de remplissage pour chaque item.
        </p>
      </div>

      {loading && buffet.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[#F5F5F0]/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement…</span>
        </div>
      ) : buffet.length === 0 ? (
        <div className="py-12 text-center">
          <Utensils className="mx-auto h-8 w-8 text-[#D4AF37]/60" />
          <p className="mt-2 text-sm text-[#F5F5F0]/50">Aucun item buffet configuré.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {buffet.map((b) => {
            const minutesLastCheck = minutesDepuis(b.lastCheck)
            const minutesNextCheck = Math.max(0, Math.floor((new Date(b.nextCheck).getTime() - Date.now()) / 60000))
            return (
              <li key={b.id} className="rounded-xl border border-[#D4AF37]/10 bg-[#1a1a1a] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#F5F5F0]">
                        {BUFFET_ITEM_LABELS[b.item] ?? b.item}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                          BUFFET_STATUS_COLOR[b.status],
                        )}
                      >
                        {BUFFET_STATUS_LABEL[b.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#F5F5F0]/40">
                      <Clock className="mr-1 inline h-3 w-3" />
                      Dernière vérif : {minutesLastCheck} min · Prochaine : {minutesNextCheck} min
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold tabular-nums text-[#D4AF37]">{b.fillLevel}%</span>
                  </div>
                </div>
                {/* Slider niveau de remplissage */}
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={b.fillLevel}
                    onChange={(e) => onUpdate(b.id, Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[#F5F5F0]/10 accent-[#D4AF37]"
                    aria-label={`Niveau ${BUFFET_ITEM_LABELS[b.item] ?? b.item}`}
                  />
                  <div className="flex gap-1">
                    {[25, 50, 75, 100].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onUpdate(b.id, v)}
                        className="rounded-md border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-2 py-1 text-[11px] text-[#D4AF37] transition hover:bg-[#D4AF37]/15"
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Tab Douches — Statut temps réel + QR réservation
// ---------------------------------------------------------------

function ShowersTab({
  showers,
  loading,
  onAdvance,
}: {
  showers: Shower[]
  loading: boolean
  onAdvance: (id: string, status: Shower['status']) => Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#D4AF37]">Gestion des douches</h2>
        <p className="text-xs text-[#F5F5F0]/50">
          Statut temps réel : Libre / Occupé / Nettoyage. Le client peut réserver une douche libre via QR code.
        </p>
      </div>

      {loading && showers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[#F5F5F0]/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement…</span>
        </div>
      ) : showers.length === 0 ? (
        <div className="py-12 text-center">
          <ShowerHead className="mx-auto h-8 w-8 text-[#D4AF37]/60" />
          <p className="mt-2 text-sm text-[#F5F5F0]/50">Aucune douche configurée.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {showers.map((s) => {
            const minutesOccupied = s.occupiedSince ? minutesDepuis(s.occupiedSince) : null
            return (
              <div
                key={s.id}
                className="rounded-xl border border-[#D4AF37]/10 bg-[#1a1a1a] p-4 transition hover:border-[#D4AF37]/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <ShowerHead className="h-6 w-6 text-[#D4AF37]" />
                    <div>
                      <h3 className="text-sm font-semibold text-[#F5F5F0]">Douche #{s.showerNumber}</h3>
                      {minutesOccupied !== null && s.status === 'occupied' && (
                        <p className="text-[11px] text-[#F5F5F0]/40">Occupée depuis {minutesOccupied} min</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                      SHOWER_STATUS_COLOR[s.status],
                    )}
                  >
                    {SHOWER_STATUS_LABEL[s.status]}
                  </span>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.status === 'free' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(s.id, 'occupied')}
                      className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30"
                    >
                      Marquer occupée
                    </button>
                  )}
                  {s.status === 'occupied' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(s.id, 'cleaning')}
                      className="rounded-md bg-sky-500/20 px-2.5 py-1 text-xs font-medium text-sky-300 transition hover:bg-sky-500/30"
                    >
                      Marquer nettoyage
                    </button>
                  )}
                  {s.status === 'cleaning' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(s.id, 'free')}
                      className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30"
                    >
                      Marquer libre
                    </button>
                  )}
                  {s.status === 'free' && (
                    <a
                      href={`/api/vip/showers/qr/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-2.5 py-1 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/15"
                      title="QR réservation"
                    >
                      <QrCode className="h-3 w-3" /> QR
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Tab Signalements — Workflow Nouveau → En cours → Résolu
// (pas de son — mode discrétion : notifications visuelles uniquement)
// ---------------------------------------------------------------

function IncidentsTab({
  incidents,
  loading,
  error,
  onAdvance,
}: {
  incidents: VipIncident[]
  loading: boolean
  error: string | null
  onAdvance: (id: string, next: VipIncident['statut']) => Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#D4AF37]">Signalements VIP</h2>
        <p className="text-xs text-[#F5F5F0]/50">
          Mode discrétion : aucune alerte sonore. Notifications visuelles uniquement.
        </p>
      </div>

      {loading && incidents.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[#F5F5F0]/40">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement…</span>
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-400" role="alert">
          {error}
        </p>
      ) : incidents.length === 0 ? (
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 text-sm text-[#F5F5F0]/50">Aucun signalement en cours.</p>
        </div>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {incidents.map((inc) => (
            <li
              key={inc.id}
              className="rounded-xl border border-[#D4AF37]/10 bg-[#1a1a1a] p-3 transition hover:border-[#D4AF37]/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                        STATUT_INCIDENT_COLOR[inc.statut],
                      )}
                    >
                      {STATUT_INCIDENT_LABEL[inc.statut]}
                    </span>
                    {inc.zone && (
                      <span className="text-xs text-[#F5F5F0]/60">
                        {inc.zone.emoji} {inc.zone.nom}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-[#F5F5F0]">{inc.problemType}</p>
                  {inc.commentaire && (
                    <p className="mt-0.5 text-xs text-[#F5F5F0]/50">{inc.commentaire}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-[11px] text-[#F5F5F0]/40">
                    {new Date(inc.createdAt).toLocaleString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {inc.statut === 'EN_ATTENTE' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(inc.id, 'EN_COURS')}
                      className="rounded-md bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/30"
                    >
                      Prendre en charge
                    </button>
                  )}
                  {inc.statut === 'EN_COURS' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(inc.id, 'RESOLU')}
                      className="rounded-md bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                    >
                      Résoudre
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Tab Récompenses — Flash Reward Premium (offres luxe)
// ---------------------------------------------------------------

function RewardsTab() {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0F0F0F] p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#D4AF37]">Flash Rewards Premium</h2>
        <p className="text-xs text-[#F5F5F0]/50">
          Offres luxe pour les clients VIP. Pas de promotions basiques — uniquement des prestations premium.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {VIP_FLASH_REWARDS.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#1a1a1a] to-[#722F37]/10 p-4 transition hover:border-[#D4AF37]/50"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>
                {r.emoji}
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-[#D4AF37]">{r.titre}</h3>
                <p className="mt-0.5 text-xs text-[#F5F5F0]/60">{r.description}</p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-medium text-[#D4AF37] transition hover:bg-[#D4AF37]/20"
                >
                  <Sparkles className="h-3 w-3" /> Offrir au client
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[#722F37]/30 bg-[#722F37]/10 p-4">
        <p className="text-xs text-[#F5F5F0]/60">
          <ConciergeBell className="mr-1 inline h-3 w-3 text-[#D4AF37]" />
          Les récompenses premium sont activées manuellement par le concierge — pas d&apos;envoi automatique
          (préserve l&apos;expérience VIP personnalisée).
        </p>
      </div>
    </div>
  )
}
