// ============================================================
// Page /ops-wallboard — Wallboard Ops Room Aéroport
// ------------------------------------------------------------
// Affichage TV plein écran pour la salle de supervision ops.
// Sombre (slate-950), accents emerald/amber/rose/sky.
// Poll l'API /api/airport/wallboard toutes les 5s, horloge 1s.
//
// Layout 100vh :
//   ┌───────────────────────────────────────────────────────────┐
//   │ TOP BAR  h-16  (titre | clock | LIVE)                     │
//   ├──────────┬──────────────────────────┬─────────────────────┤
//   │  Stats   │   Zone heat list (5)     │   Team routing      │
//   │  4 cards │   barres horizontales    │   5 équipes         │
//   │  (3 col) │   (6 col)                │   (3 col)           │
//   ├──────────┴──────────────────────────┴─────────────────────┤
//   │ LIVE FEED  h-64  (10 derniers signalements, scroll H)     │
//   └───────────────────────────────────────────────────────────┘
//
// Aucun scroll sur 1920×1080. Sur petits écrans, empilement vertical
// avec scroll (overflow-y-auto sur le main).
// ============================================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ---------------------------------------------------------------
// Types — match exact du contrat /api/airport/wallboard
// ---------------------------------------------------------------
type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'
type Trend = 'up' | 'down' | 'stable'
type TeamKey = 'nettoyage' | 'maintenance' | 'securite' | 'accueil' | 'other'

type ZoneAgg = {
  code: string
  nom: string
  emoji: string
  count_24h: number
  count_en_attente: number
  last_report_at: string | null
  trend: Trend
}

type RecentReport = {
  id: string
  zone: { code: string; nom: string; emoji: string } | null
  tagScanne: string
  problemType: string
  statut: string
  photoCategory: string | null
  routedTeam: string | null
  createdAt: string
}

type WallboardData = {
  stats: {
    total_24h: number
    en_attente: number
    en_cours: number
    resolus_24h: number
    avg_resolution_minutes: number | null
  }
  zones: ZoneAgg[]
  top_zones: ZoneAgg[]
  recent_reports: RecentReport[]
  by_team: Record<TeamKey, number>
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** "il y a 3 min" / "il y a 1 h" / "il y a 2 j" / "à l'instant" */
function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'à l\'instant'
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return 'à l\'instant'
  if (sec < 60) return `il y a ${sec} s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDateFR(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDuration(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m}` : `${h} h`
}

const STATUT_META: Record<Statut, { label: string; cls: string; dot: string }> = {
  EN_ATTENTE: { label: 'EN ATTENTE', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  EN_COURS: { label: 'EN COURS', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30', dot: 'bg-sky-400' },
  RESOLU: { label: 'RÉSOLU', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
}

function statutMeta(s: string): { label: string; cls: string; dot: string } {
  return STATUT_META[s as Statut] ?? {
    label: s,
    cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
  }
}

const TEAM_META: Record<TeamKey, { emoji: string; label: string; bar: string }> = {
  nettoyage: { emoji: '🧹', label: 'Nettoyage', bar: 'bg-emerald-500' },
  maintenance: { emoji: '🔧', label: 'Maintenance', bar: 'bg-amber-500' },
  securite: { emoji: '🛡️', label: 'Sécurité', bar: 'bg-rose-500' },
  accueil: { emoji: '👋', label: 'Accueil', bar: 'bg-sky-500' },
  other: { emoji: '❓', label: 'Autre', bar: 'bg-slate-500' },
}

function trendMeta(t: Trend): { arrow: string; cls: string } {
  if (t === 'up') return { arrow: '↗', cls: 'text-rose-400' }
  if (t === 'down') return { arrow: '↘', cls: 'text-emerald-400' }
  return { arrow: '→', cls: 'text-slate-400' }
}

function severityBarClass(count: number): string {
  if (count > 5) return 'bg-rose-500'
  if (count > 0) return 'bg-amber-500'
  return 'bg-slate-700'
}

// ---------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------
async function fetchWallboard(): Promise<WallboardData> {
  const res = await fetch('/api/airport/wallboard', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { ok: boolean; data?: WallboardData; error?: string }
  if (!json.ok || !json.data) throw new Error(json.error ?? 'réponse invalide')
  return json.data
}

// ---------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------

function StatCard({
  label,
  value,
  hint,
  accent,
  pulse,
  mono = true,
}: {
  label: string
  value: string | number
  hint?: string
  accent: 'emerald' | 'amber' | 'sky' | 'rose'
  pulse?: boolean
  mono?: boolean
}) {
  const accentMap: Record<string, { text: string; ring: string; glow: string }> = {
    emerald: { text: 'text-emerald-400', ring: 'ring-emerald-500/20', glow: 'shadow-emerald-500/10' },
    amber: { text: 'text-amber-400', ring: 'ring-amber-500/20', glow: 'shadow-amber-500/10' },
    sky: { text: 'text-sky-400', ring: 'ring-sky-500/20', glow: 'shadow-sky-500/10' },
    rose: { text: 'text-rose-400', ring: 'ring-rose-500/20', glow: 'shadow-rose-500/10' },
  }
  const a = accentMap[accent]
  return (
    <div
      className={`flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 ring-1 ${a.ring} ${a.glow} shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
        )}
      </div>
      <div className={`mt-2 text-4xl font-bold tabular-nums ${a.text} ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] tabular-nums text-slate-500">{hint}</div>
      ) : null}
    </div>
  )
}

function ZoneRow({ zone, max }: { zone: ZoneAgg; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((zone.count_en_attente / max) * 100)) : 0
  const bar = severityBarClass(zone.count_en_attente)
  const t = trendMeta(zone.trend)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl leading-none">{zone.emoji}</span>
          <span className="truncate text-sm font-semibold text-slate-100">{zone.nom}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-200">
            {zone.count_en_attente} <span className="text-slate-400">en attente</span>
          </span>
          <span className={`text-base font-bold ${t.cls}`} title={`Tendance vs 24h précédentes : ${zone.trend}`}>
            {t.arrow}
          </span>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full ${bar} transition-all duration-700`}
          style={{ width: `${zone.count_en_attente === 0 ? 0 : pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="tabular-nums">{zone.count_24h} signal. 24h</span>
        <span>{relativeTime(zone.last_report_at)}</span>
      </div>
    </div>
  )
}

function TeamBar({ team, count, max }: { team: TeamKey; count: number; max: number }) {
  const meta = TEAM_META[team]
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{meta.emoji}</span>
          <span className="text-xs font-medium text-slate-300">{meta.label}</span>
        </div>
        <span className="font-mono text-lg font-bold tabular-nums text-slate-100">{count}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full ${meta.bar} transition-all duration-700`}
          style={{ width: `${count === 0 ? 0 : pct}%` }}
        />
      </div>
    </div>
  )
}

function FeedCard({ r, fresh }: { r: RecentReport; fresh: boolean }) {
  const s = statutMeta(r.statut)
  const team = r.routedTeam ? TEAM_META[(r.routedTeam as TeamKey) in TEAM_META ? (r.routedTeam as TeamKey) : 'other'] : null
  return (
    <div
      className={`flex h-full w-72 shrink-0 flex-col justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-3 ${
        fresh ? 'animate-in fade-in slide-in-from-top-2 duration-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg leading-none">{r.zone?.emoji ?? '📍'}</span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-100">
              {r.zone?.nom ?? 'Zone inconnue'}
            </div>
            <div className="truncate text-[11px] text-slate-500">{r.tagScanne}</div>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 text-xs text-slate-300">{r.problemType}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {r.photoCategory && (
          <span className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-300">
            📷 {r.photoCategory}
          </span>
        )}
        {team && (
          <span className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            {team.emoji} {team.label}
          </span>
        )}
      </div>
      <div className="mt-2 text-[11px] tabular-nums text-slate-500">{relativeTime(r.createdAt)}</div>
    </div>
  )
}

// --- Squelettes de chargement ---
function StatSkeleton() {
  return (
    <div className="h-[104px] animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="h-3 w-2/3 rounded bg-slate-800" />
      <div className="mt-6 h-9 w-1/2 rounded bg-slate-800" />
      <div className="mt-2 h-3 w-1/3 rounded bg-slate-800" />
    </div>
  )
}

function ZoneSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex justify-between">
        <div className="h-4 w-1/3 rounded bg-slate-800" />
        <div className="h-4 w-16 rounded bg-slate-800" />
      </div>
      <div className="mt-3 h-2 w-full rounded bg-slate-800" />
      <div className="mt-2 flex justify-between">
        <div className="h-3 w-20 rounded bg-slate-800" />
        <div className="h-3 w-16 rounded bg-slate-800" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------
export default function OpsWallboardPage() {
  const [data, setData] = useState<WallboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstLoadRef = useRef<boolean>(true)

  // --- Polling API toutes les 5s ---
  const poll = useCallback(async () => {
    try {
      const d = await fetchWallboard()
      // Détecte les nouveaux IDs (jamais vus) pour l'animation d'entrée
      const newFresh = new Set<string>()
      for (const r of d.recent_reports) {
        if (!seenIdsRef.current.has(r.id)) {
          newFresh.add(r.id)
          seenIdsRef.current.add(r.id)
        }
      }
      // Sur le tout premier chargement, on n'anime pas (sinon les 10
      // cartes existantes déclenchent une vague d'animation)
      if (firstLoadRef.current) {
        firstLoadRef.current = false
        setFreshIds(new Set())
      } else {
        setFreshIds(newFresh)
        // Nettoie les flags "fresh" après 1.5s pour qu'un re-render ultérieur
        // ne rejoue pas l'animation
        if (newFresh.size > 0) {
          setTimeout(() => setFreshIds(new Set()), 1500)
        }
      }
      setData(d)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erreur inconnue')
    }
  }, [])

  useEffect(() => {
    // Premier poll différé (setTimeout 0) pour ne pas appeler setState
    // directement dans le corps de l'effect (rule react-hooks/set-state-in-effect).
    const initial = setTimeout(() => void poll(), 0)
    const api = setInterval(() => void poll(), 5000)
    return () => {
      clearTimeout(initial)
      clearInterval(api)
    }
  }, [poll])

  // --- Horloge toutes les 1s ---
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // --- Refresh relatif des "il y a X min" toutes les 30s ---
  // (on force un re-render en touchant `now` qui déclenche déjà 1s — suffisant)

  const maxEnAttente = useMemo(
    () => (data ? Math.max(1, ...data.zones.map((z) => z.count_en_attente)) : 1),
    [data],
  )
  const maxTeam = useMemo(
    () => (data ? Math.max(1, ...Object.values(data.by_team)) : 1),
    [data],
  )

  const teamEntries = useMemo<Array<[TeamKey, number]>>(() => {
    if (!data) return []
    const entries: Array<[TeamKey, number]> = [
      ['nettoyage', data.by_team.nettoyage ?? 0],
      ['maintenance', data.by_team.maintenance ?? 0],
      ['securite', data.by_team.securite ?? 0],
      ['accueil', data.by_team.accueil ?? 0],
      ['other', data.by_team.other ?? 0],
    ]
    return entries.sort((a, b) => b[1] - a[1])
  }, [data])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* ---------- TOP BAR ---------- */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">✈️</span>
          <h1 className="font-mono text-lg font-bold tracking-tight text-slate-100 sm:text-xl">
            AÉROPORT OPS <span className="text-slate-500">—</span>{' '}
            <span className="text-emerald-400">WALLBOARD</span>
          </h1>
        </div>

        <div className="hidden flex-col items-center md:flex">
          <div className="font-mono text-2xl font-bold tabular-nums text-slate-100">
            {formatClock(now)}
          </div>
          <div className="text-[11px] capitalize text-slate-400">{formatDateFR(now)}</div>
        </div>

        <div className="flex items-center gap-2">
          {error ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-300">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              ERREUR
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </span>
          )}
        </div>
      </header>

      {/* ---------- MAIN GRID ---------- */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12 lg:overflow-hidden">
        {/* --- Colonne gauche : stats --- */}
        <section className="flex flex-col gap-3 lg:col-span-3 lg:overflow-hidden">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Vue d'ensemble · 24h
          </h2>
          {data ? (
            <div className="flex flex-col gap-3">
              <StatCard
                label="Signalements 24h"
                value={data.stats.total_24h}
                accent="emerald"
                hint="Total tous statuts confondus"
              />
              <StatCard
                label="En attente"
                value={data.stats.en_attente}
                accent="amber"
                pulse={data.stats.en_attente > 0}
                hint="Nécessitent une action"
              />
              <StatCard
                label="En cours"
                value={data.stats.en_cours}
                accent="sky"
                hint="Pris en charge par une équipe"
              />
              <StatCard
                label="Résolus 24h"
                value={data.stats.resolus_24h}
                accent="emerald"
                hint={`Temps moyen : ${formatDuration(data.stats.avg_resolution_minutes)}`}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </div>
          )}
        </section>

        {/* --- Colonne centre : zone heat list --- */}
        <section className="flex min-h-0 flex-col gap-3 lg:col-span-6 lg:overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Charge par zone · 24h
            </h2>
            {data && (
              <span className="text-[11px] tabular-nums text-slate-500">
                Trié par en-attente décroissant
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2 lg:overflow-y-auto lg:pr-1">
            {data ? (
              data.zones.map((z) => <ZoneRow key={z.code} zone={z} max={maxEnAttente} />)
            ) : (
              <>
                <ZoneSkeleton />
                <ZoneSkeleton />
                <ZoneSkeleton />
                <ZoneSkeleton />
                <ZoneSkeleton />
              </>
            )}
          </div>
        </section>

        {/* --- Colonne droite : team routing --- */}
        <section className="flex min-h-0 flex-col gap-3 lg:col-span-3 lg:overflow-hidden">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Routage par équipe · 24h
          </h2>
          <div className="flex flex-1 flex-col gap-2 lg:overflow-y-auto lg:pr-1">
            {data ? (
              teamEntries.map(([k, count]) => (
                <TeamBar key={k} team={k} count={count} max={maxTeam} />
              ))
            ) : (
              <>
                <ZoneSkeleton />
                <ZoneSkeleton />
                <ZoneSkeleton />
                <ZoneSkeleton />
                <ZoneSkeleton />
              </>
            )}
          </div>
        </section>
      </main>

      {/* ---------- BOTTOM STRIP : LIVE FEED ---------- */}
      <footer className="h-64 shrink-0 border-t border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Flux temps réel · 10 derniers signalements
          </h2>
          <span className="text-[11px] tabular-nums text-slate-500">
            {data ? `${data.recent_reports.length} signalements` : '…'}
          </span>
        </div>
        <div className="flex h-[168px] gap-3 overflow-x-auto pb-2">
          {data ? (
            data.recent_reports.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                Aucun signalement dans les dernières 24h
              </div>
            ) : (
              data.recent_reports.map((r) => (
                <FeedCard key={r.id} r={r} fresh={freshIds.has(r.id)} />
              ))
            )
          ) : (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-full w-72 shrink-0 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60 p-3"
              >
                <div className="h-4 w-2/3 rounded bg-slate-800" />
                <div className="mt-4 h-3 w-full rounded bg-slate-800" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-800" />
                <div className="mt-6 h-3 w-1/3 rounded bg-slate-800" />
              </div>
            ))
          )}
        </div>
      </footer>

      {/* Scrollbar discret pour la grille principale (mobile uniquement) */}
      <style>{`
        main::-webkit-scrollbar, .overflow-x-auto::-webkit-scrollbar { height: 6px; width: 6px; }
        main::-webkit-scrollbar-thumb, .overflow-x-auto::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        main::-webkit-scrollbar-track, .overflow-x-auto::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  )
}
