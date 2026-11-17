'use client'

// ============================================================
// TENANT-3 — <AirlineDashboard /> — Dashboard Compagnie Aérienne
// ------------------------------------------------------------
// Module dédié aux compagnies aériennes (escale & passagers).
// Palette bleu ciel / blanc / slate (calme, opérationnel).
// PAS de style IATA wallboard (réservé à l'infrastructure aéroport).
//
// Zones gérées (4) :
//   1. term_checkin           — Comptoirs d'enregistrement
//   2. term_embarq            — Portes d'embarquement
//   3. airline_baggage_office — Bureau litiges bagages
//   4. airline_waiting_room   — Salle d'attente compagnie
//
// Denise (TTS) :
//   - 2 niveaux uniquement : "Important/Opérationnel" et "Info/Factuel"
//   - JAMAIS de ton critique (pas de mode crise)
//   - Voix calme : rate 0.9, pitch 1.0 (vs 1.1 / 0.9 pour airport)
//
// Features :
//   - Liste des incidents (Nouveau → En cours → Résolu)
//   - Section litiges bagages (photo + description + statut)
//   - Affichage du numéro de vol sur chaque incident
//   - Alerte mécontentement si incident > 10 min sans résolution
//
// Interdictions (vs module aéroport) :
//   - Pas de Wallboard IATA
//   - Pas de Mode Crise
//   - Pas de Régie Publicitaire
//   - Pas de Radar Prédiction
//   - Pas d'accès aux données des autres compagnies
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plane, LogOut, Building2, Luggage, AlertTriangle, Clock, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { AIRPORT_ZONES, getZonesByTenant } from '@/lib/airport-config'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------
// Types — match du contrat API airline
// ---------------------------------------------------------------

type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

type AirlineIncident = {
  id: string
  zone: { code: string; nom: string; emoji: string } | null
  tagScanne: string
  problemType: string
  flightNumber: string | null
  commentaire: string | null
  photoUrl: string | null
  statut: Statut
  createdAt: string
  resolvedAt: string | null
}

type BaggageDispute = {
  id: string
  flightNumber: string | null
  passengerName: string | null
  description: string
  photoUrl: string | null
  status: 'open' | 'resolved' | 'escalated'
  reportId: string | null
  createdAt: string
  updatedAt: string
}

type AirlineTab = 'incidents' | 'baggage'

// ---------------------------------------------------------------
// Denise — Voix calme pour la compagnie (rate 0.9, pitch 1.0)
// ---------------------------------------------------------------

function parlerCalme(texte: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(texte)
  utter.lang = 'fr-FR'
  utter.rate = 0.9 // débit calme
  utter.pitch = 1.0 // ton neutre
  utter.volume = 1
  const voix = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('fr'))
  if (voix) utter.voice = voix
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

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
  if (!now) return '--:--:--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
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

const STATUT_LABEL: Record<Statut, string> = {
  EN_ATTENTE: 'Nouveau',
  EN_COURS: 'En cours',
  RESOLU: 'Résolu',
}

const STATUT_BADGE: Record<Statut, string> = {
  EN_ATTENTE: 'bg-sky-100 text-sky-700 border-sky-200',
  EN_COURS: 'bg-amber-100 text-amber-700 border-amber-200',
  RESOLU: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const DISPUTE_STATUS_LABEL: Record<BaggageDispute['status'], string> = {
  open: 'Ouvert',
  resolved: 'Résolu',
  escalated: 'Escaladé',
}

const DISPUTE_STATUS_BADGE: Record<BaggageDispute['status'], string> = {
  open: 'bg-sky-100 text-sky-700 border-sky-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  escalated: 'bg-rose-100 text-rose-700 border-rose-200',
}

// Zones airline (4) — source de vérité depuis airport-config
const AIRLINE_ZONES = getZonesByTenant('airline')

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export default function AirlineDashboard() {
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)
  const setView = useAppStore((s) => s.setView)

  const [tab, setTab] = useState<AirlineTab>('incidents')
  const [incidents, setIncidents] = useState<AirlineIncident[]>([])
  const [disputes, setDisputes] = useState<BaggageDispute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const clock = useClock()
  const [today, setToday] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  const companyName = session?.pro?.nomEtablissement ?? 'Compagnie Aérienne'

  // Polling incidents + disputes (rafraîchi toutes les 10s)
  const refreshData = useCallback(async () => {
    try {
      const [incRes, dispRes] = await Promise.all([
        fetch('/api/airline/incidents', { cache: 'no-store' }),
        fetch('/api/airline/baggage-disputes', { cache: 'no-store' }),
      ])
      const incJson = await incRes.json().catch(() => null)
      const dispJson = await dispRes.json().catch(() => null)
      if (incJson?.ok) {
        setIncidents(incJson.data ?? [])
      }
      if (dispJson?.ok) {
        setDisputes(dispJson.data ?? [])
      }
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
    const interval = setInterval(refreshData, 10000)
    return () => clearInterval(interval)
  }, [refreshData])

  // Alerte mécontentement : incidents > 10 min sans résolution
  const dissatisfiedIncidents = useMemo(
    () =>
      incidents.filter(
        (i) => i.statut !== 'RESOLU' && minutesDepuis(i.createdAt) > 10,
      ),
    [incidents],
  )

  // Stats par zone
  const statsByZone = useMemo(() => {
    const map = new Map<string, { total: number; open: number; inProgress: number; resolved: number }>()
    for (const z of AIRLINE_ZONES) {
      map.set(z.code, { total: 0, open: 0, inProgress: 0, resolved: 0 })
    }
    for (const inc of incidents) {
      const code = inc.zone?.code ?? 'term_checkin'
      const s = map.get(code)
      if (!s) continue
      s.total++
      if (inc.statut === 'EN_ATTENTE') s.open++
      else if (inc.statut === 'EN_COURS') s.inProgress++
      else if (inc.statut === 'RESOLU') s.resolved++
    }
    return map
  }, [incidents])

  // Annonce TTS des nouveaux incidents (calme, jamais critique)
  const announcedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const nouveaux = incidents.filter(
      (i) => i.statut === 'EN_ATTENTE' && !announcedRef.current.has(i.id),
    )
    if (nouveaux.length === 0) return
    // Niveaux Denise : "Important/Opérationnel" ou "Info/Factuel".
    // On n'utilise JAMAIS le ton critique (pas de mode crise en compagnie).
    const texte = nouveaux
      .slice(0, 1)
      .map(
        (i) =>
          `Nouvel incident signalé. ${i.zone?.nom ?? 'Zone'} ${
            i.flightNumber ? `, vol ${i.flightNumber}` : ''
          }. Merci de prendre en charge.`,
      )
      .join(' ')
    parlerCalme(texte)
    for (const i of nouveaux) announcedRef.current.add(i.id)
  }, [incidents])

  // SSR-safe mount
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <span className="text-4xl">🛫</span>
          <p className="mt-3 font-mono text-sm text-slate-500">Chargement du dashboard compagnie…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-800">
      {/* ---------- HEADER ---------- */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm">
            <Plane className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-bold leading-tight tracking-tight text-slate-900 sm:text-lg">
              {companyName}
            </h1>
            <p className="hidden text-[11px] text-slate-500 sm:block" suppressHydrationWarning>
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3 text-sky-500" />
                Compagnie Aérienne
                <span className="text-slate-300">·</span>
                {today ? formatDateLong(today) : ''}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Horloge */}
          <div className="hidden flex-col items-end sm:flex">
            <div className="font-mono text-xl font-bold tabular-nums text-sky-600" suppressHydrationWarning>
              {clock}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Heure locale</div>
          </div>

          {/* Rafraîchir */}
          <button
            type="button"
            onClick={() => refreshData()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-600"
            title="Rafraîchir"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>

          {/* Déconnexion */}
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            title="Se déconnecter"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* ---------- ALERTE MÉCONTENTEMENT (> 10 min sans résolution) ---------- */}
      {dissatisfiedIncidents.length > 0 && (
        <div
          role="alert"
          className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mx-6"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Alerte mécontentement — {dissatisfiedIncidents.length} incident
              {dissatisfiedIncidents.length > 1 ? 's' : ''} &gt; 10 min sans résolution
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Prenez en charge ces signalements rapidement pour limiter l&apos;impact client.
            </p>
          </div>
        </div>
      )}

      {/* ---------- ZONES KPI ROW (4 zones) ---------- */}
      <section className="mx-4 mt-4 sm:mx-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Zones compagnie
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AIRLINE_ZONES.map((z) => {
            const s = statsByZone.get(z.code) ?? { total: 0, open: 0, inProgress: 0, resolved: 0 }
            const enAttente = s.open + s.inProgress
            return (
              <div
                key={z.code}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>
                      {z.emoji}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{z.nom}</h3>
                      <p className="text-[11px] text-slate-500">{z.description}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-400">Total</span>
                      <span className="text-lg font-bold text-slate-900">{s.total}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-400">En cours</span>
                      <span className="text-lg font-bold text-sky-600">{enAttente}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-400">Résolus</span>
                      <span className="text-lg font-bold text-emerald-600">{s.resolved}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------- TAB BAR ---------- */}
      <nav
        className="mx-4 mt-4 sm:mx-6"
        aria-label="Onglets du dashboard compagnie"
      >
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {([
            { slug: 'incidents', label: 'Incidents', emoji: '📋' },
            { slug: 'baggage', label: 'Litiges Bagages', emoji: '🧳' },
          ] as const).map((t) => {
            const active = tab === t.slug
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => setTab(t.slug)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
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
        {tab === 'incidents' && (
          <IncidentsTab
            incidents={incidents}
            loading={loading}
            error={error}
            onAdvance={async (id, next) => {
              try {
                const res = await fetch('/api/airline/incidents', {
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
        {tab === 'baggage' && (
          <BaggageDisputesTab
            disputes={disputes}
            loading={loading}
            error={error}
            onAdvance={async (id, status) => {
              try {
                const res = await fetch('/api/airline/baggage-disputes', {
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
      </main>

      {/* ---------- FOOTER ---------- */}
      <footer className="mt-auto shrink-0 border-t border-slate-200 bg-white px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <Plane className="h-3 w-3" aria-hidden />
            <span>FeedbackPro · Module Compagnie Aérienne</span>
          </div>
          <div className="hidden tabular-nums sm:block">
            Onglet actif : <span className="text-sky-600">{tab}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------
// Tab Incidents — Liste filtrable + workflow Nouveau → En cours → Résolu
// ---------------------------------------------------------------

function IncidentsTab({
  incidents,
  loading,
  error,
  onAdvance,
}: {
  incidents: AirlineIncident[]
  loading: boolean
  error: string | null
  onAdvance: (id: string, next: Statut) => Promise<void>
}) {
  const [filter, setFilter] = useState<'all' | Statut>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return incidents
    return incidents.filter((i) => i.statut === filter)
  }, [incidents, filter])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Incidents escale &amp; passagers</h2>
          <p className="text-xs text-slate-500">
            Workflow : Nouveau → En cours → Résolu. Numéro de vol affiché sur chaque incident.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {([
            { slug: 'all', label: 'Tous' },
            { slug: 'EN_ATTENTE', label: 'Nouveau' },
            { slug: 'EN_COURS', label: 'En cours' },
            { slug: 'RESOLU', label: 'Résolu' },
          ] as const).map((f) => (
            <button
              key={f.slug}
              type="button"
              onClick={() => setFilter(f.slug as 'all' | Statut)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition',
                filter === f.slug
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && incidents.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement des incidents…</span>
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm text-slate-500">Aucun incident dans cette catégorie.</p>
        </div>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {filtered.map((inc) => {
            const minutes = minutesDepuis(inc.createdAt)
            const late = inc.statut !== 'RESOLU' && minutes > 10
            return (
              <li
                key={inc.id}
                className={cn(
                  'rounded-xl border bg-white p-3 transition hover:shadow-sm',
                  late ? 'border-amber-200' : 'border-slate-200',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                          STATUT_BADGE[inc.statut],
                        )}
                      >
                        {STATUT_LABEL[inc.statut]}
                      </span>
                      {inc.zone && (
                        <span className="text-xs text-slate-500">
                          {inc.zone.emoji} {inc.zone.nom}
                        </span>
                      )}
                      {inc.flightNumber && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                          <Plane className="h-3 w-3" /> Vol {inc.flightNumber}
                        </span>
                      )}
                      {late && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Clock className="h-3 w-3" /> {minutes} min
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-900">{inc.problemType}</p>
                    {inc.commentaire && (
                      <p className="mt-0.5 text-xs text-slate-500">{inc.commentaire}</p>
                    )}
                    {inc.photoUrl && (
                      <a
                        href={inc.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block"
                      >
                        <img
                          src={inc.photoUrl}
                          alt="Photo du signalement"
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[11px] text-slate-400">
                      {new Date(inc.createdAt).toLocaleString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                    {inc.statut === 'EN_ATTENTE' && (
                      <button
                        type="button"
                        onClick={() => onAdvance(inc.id, 'EN_COURS')}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
                      >
                        Prendre en charge
                      </button>
                    )}
                    {inc.statut === 'EN_COURS' && (
                      <button
                        type="button"
                        onClick={() => onAdvance(inc.id, 'RESOLU')}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Résoudre
                      </button>
                    )}
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
// Tab Litiges Bagages — Photo + description + statut
// ---------------------------------------------------------------

function BaggageDisputesTab({
  disputes,
  loading,
  error,
  onAdvance,
}: {
  disputes: BaggageDispute[]
  loading: boolean
  error: string | null
  onAdvance: (id: string, status: BaggageDispute['status']) => Promise<void>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">Litiges bagages</h2>
        <p className="text-xs text-slate-500">
          Réclamations bagages déclarées au bureau : photo + description + numéro de vol.
        </p>
      </div>

      {loading && disputes.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement des litiges…</span>
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : disputes.length === 0 ? (
        <div className="py-12 text-center">
          <Luggage className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm text-slate-500">Aucun litige bagage en cours.</p>
        </div>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {disputes.map((d) => (
            <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                        DISPUTE_STATUS_BADGE[d.status],
                      )}
                    >
                      {DISPUTE_STATUS_LABEL[d.status]}
                    </span>
                    {d.flightNumber && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                        <Plane className="h-3 w-3" /> Vol {d.flightNumber}
                      </span>
                    )}
                    {d.passengerName && (
                      <span className="text-xs text-slate-500">Passager : {d.passengerName}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-900">{d.description}</p>
                  {d.photoUrl && (
                    <a href={d.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                      <img
                        src={d.photoUrl}
                        alt="Photo du litige bagage"
                        className="h-20 w-20 rounded-md object-cover"
                      />
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-[11px] text-slate-400">
                    {new Date(d.createdAt).toLocaleString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                  {d.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(d.id, 'resolved')}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Marquer résolu
                    </button>
                  )}
                  {d.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => onAdvance(d.id, 'escalated')}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-600"
                    >
                      <AlertTriangle className="h-3 w-3" /> Escalader
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
