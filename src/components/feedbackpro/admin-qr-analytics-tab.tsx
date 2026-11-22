'use client'

// ============================================================
// <AdminQrAnalyticsTab /> — Live QR Analytics V2.0
// ------------------------------------------------------------
// Dashboard temps réel des performances des QR codes aéroport.
// Polle /api/airport/qr-analytics toutes les 30s.
//
// Sections :
//   1. Bandeau live : total scans today (gros chiffre pulsant)
//      + KPIs (total tags, QR morts, top performer).
//   2. Table principale : tous les tags triables par scans 30d.
//      Colonnes : tag, zone, scans today, scans 7d, scans 30d,
//      incidents, resolution rate, performance score.
//   3. "QR Morts" : tags 0 scans sur 30j (highlight rouge).
//   4. "Top Performers" : top 5 QRs par scans 30d.
//
// Palette V2.0 : fond #F5F5F5, cartes blanches rounded-15px,
// bleu #000d10, jaune #bc7155, rouge #E30613, vert #bc7155,
// orange #bc7155.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Flame,
  QrCode,
  RefreshCw,
  Skull,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'

// --- Palette V2.0 ---
const BLEU = '#000d10'
const JAUNE = '#bc7155'
const ROUGE = '#E30613'
const VERT = '#bc7155'
const ORANGE = '#bc7155'

type QrZone = {
  tag: string
  zoneCode: string
  zoneNom: string
  emoji: string
  scansToday: number
  scans7d: number
  scans30d: number
  totalScans: number
  incidents: number
  activeIncidents: number
  resolvedCount: number
  resolutionRate: number
  performanceScore: number
  lastScanAt: string | null
  adRevenueFcfa: number
  roi: { adRevenueFcfa: number; incidentsResolved: number }
}

type DeadQr = {
  tag: string
  zoneCode: string
  zoneNom: string
  emoji: string
  totalScans: number
  lastScanAt: string | null
}

type TopPerformer = {
  tag: string
  zoneCode: string
  zoneNom: string
  emoji: string
  scans30d: number
  performanceScore: number
  resolutionRate: number
}

type AnalyticsData = {
  generatedAt: string
  totalScansToday: number
  zones: QrZone[]
  deadQrs: DeadQr[]
  topPerformers: TopPerformer[]
}

const POLL_MS = 30000

type SortKey = 'scans30d' | 'scansToday' | 'scans7d' | 'performanceScore' | 'resolutionRate' | 'incidents'
type SortDir = 'asc' | 'desc'

function formatRelative(iso: string | null): string {
  if (!iso) return 'jamais'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatRevenue(fcfa: number): string {
  if (fcfa <= 0) return '—'
  if (fcfa >= 1000000) return `${(fcfa / 1000000).toFixed(1)}M FCFA`
  if (fcfa >= 1000) return `${(fcfa / 1000).toFixed(0)}k FCFA`
  return `${fcfa} FCFA`
}

export function AdminQrAnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('scans30d')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const fetchAnalytics = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/airport/qr-analytics', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: AnalyticsData }
      if (!json?.ok || !json.data) throw new Error(json?.error ?? 'Réponse invalide')
      setData(json.data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchAnalytics()
    const id = setInterval(() => void fetchAnalytics(), POLL_MS)
    return () => clearInterval(id)
  }, [fetchAnalytics])

  const sortedZones = useMemo(() => {
    if (!data) return []
    const arr = [...data.zones]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [data, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // --- Loading skeleton ---
  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-none bg-muted" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-none bg-muted" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div
        className="rounded-none p-4 text-white"
        style={{ background: ROUGE }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-widest">
            QR ANALYTICS — ERREUR
          </span>
        </div>
        <p className="mt-2 text-sm opacity-90">{error}</p>
      </div>
    )
  }

  const totalTags = data?.zones.length ?? 0
  const deadCount = data?.deadQrs.length ?? 0
  const topPerformer = data?.topPerformers[0]
  const avgResolution =
    data && data.zones.length > 0
      ? Math.round(
          data.zones.reduce((s, z) => s + z.resolutionRate, 0) / data.zones.length,
        )
      : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-none text-white"
            style={{ background: BLEU }}
          >
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <h1
              className="font-black uppercase tracking-tight"
              style={{ color: '#000', fontSize: '20px' }}
            >
              Live QR Analytics
            </h1>
            <p style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>
              Performance temps réel des QR codes · {totalTags} tags suivis
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchAnalytics()}
          className="flex items-center gap-2 rounded-none px-3 py-2 text-white transition-opacity hover:opacity-90"
          style={{ background: BLEU, fontSize: '12px', fontWeight: 800 }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          RAFRAÎCHIR
        </button>
      </div>

      {/* Bandeau live : total scans today + KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total scans today — grosse carte pulsante */}
        <div
          className="relative overflow-hidden rounded-none p-5 text-white"
          style={{
            background: BLEU,
            boxShadow: '0 6px 14px rgba(0,51,153,0.25)',
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '10px', opacity: 0.85 }}
            >
              SCANS AUJOURD&apos;HUI
            </span>
            <Zap className="h-4 w-4" style={{ opacity: 0.7 }} aria-hidden />
          </div>
          <div
            className="mt-3 tabular-nums leading-none"
            style={{ fontSize: '44px', fontWeight: 900 }}
          >
            {data?.totalScansToday ?? 0}
          </div>
          <div
            className="mt-2 flex items-center gap-1"
            style={{ fontSize: '10px', fontWeight: 700, opacity: 0.8 }}
          >
            <span
              className="inline-block"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '9999px',
                background: JAUNE,
                animation: 'fp-pulse-dot 1.2s ease-in-out infinite',
              }}
              aria-hidden
            />
            LIVE · MAJ 30s
          </div>
          <style>{`@keyframes fp-pulse-dot { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>
        </div>

        {/* QR morts */}
        <div
          className="rounded-none bg-white p-5"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center justify-between">
            <span
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '10px', color: '#666' }}
            >
              QR MORTS (30j)
            </span>
            <Skull className="h-4 w-4" style={{ color: ROUGE }} aria-hidden />
          </div>
          <div
            className="mt-3 tabular-nums leading-none"
            style={{ fontSize: '36px', fontWeight: 900, color: deadCount > 0 ? ROUGE : VERT }}
          >
            {deadCount}
          </div>
          <div style={{ fontSize: '10px', color: '#999', fontWeight: 700, marginTop: '6px' }}>
            sur {totalTags} tags suivis
          </div>
        </div>

        {/* Top performer */}
        <div
          className="rounded-none bg-white p-5"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center justify-between">
            <span
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '10px', color: '#666' }}
            >
              TOP PERFORMER
            </span>
            <Trophy className="h-4 w-4" style={{ color: JAUNE }} aria-hidden />
          </div>
          {topPerformer ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-lg" aria-hidden>{topPerformer.emoji}</span>
                <span
                  className="truncate font-black"
                  style={{ fontSize: '14px', color: '#000' }}
                  title={topPerformer.tag}
                >
                  {topPerformer.tag}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#666', fontWeight: 700, marginTop: '4px' }}>
                {topPerformer.scans30d} scans · score {topPerformer.performanceScore}
              </div>
            </>
          ) : (
            <div className="mt-3" style={{ fontSize: '12px', color: '#999', fontWeight: 700 }}>
              Aucun scan sur 30j
            </div>
          )}
        </div>

        {/* Avg resolution */}
        <div
          className="rounded-none bg-white p-5"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center justify-between">
            <span
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '10px', color: '#666' }}
            >
              RÉSOLUTION MOY.
            </span>
            <TrendingUp className="h-4 w-4" style={{ color: VERT }} aria-hidden />
          </div>
          <div
            className="mt-3 tabular-nums leading-none"
            style={{ fontSize: '36px', fontWeight: 900, color: VERT }}
          >
            {avgResolution}%
          </div>
          <div style={{ fontSize: '10px', color: '#999', fontWeight: 700, marginTop: '6px' }}>
            tous tags confondus
          </div>
        </div>
      </div>

      {/* Table principale : tous les QR tags */}
      <div
        className="rounded-none bg-white p-4 sm:p-5"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            className="font-black uppercase tracking-widest"
            style={{ color: BLEU, fontSize: '12px', letterSpacing: '1.5px' }}
          >
            Tous les QR codes · {sortedZones.length}
          </h2>
          <span style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>
            Tri : {sortKey} ({sortDir})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BLEU}` }}>
                <th className="py-2 pr-3 text-left font-black uppercase" style={{ color: BLEU, fontSize: '10px', letterSpacing: '1px' }}>
                  Tag
                </th>
                <th className="px-3 py-2 text-left font-black uppercase" style={{ color: BLEU, fontSize: '10px', letterSpacing: '1px' }}>
                  Zone
                </th>
                <SortableTh label="Today" k="scansToday" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="7j" k="scans7d" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="30j" k="scans30d" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Incidents" k="incidents" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Résol. %" k="resolutionRate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Score" k="performanceScore" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-3 py-2 text-left font-black uppercase" style={{ color: BLEU, fontSize: '10px', letterSpacing: '1px' }}>
                  Dernier scan
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedZones.map((z) => {
                const isDead = z.scans30d === 0
                return (
                  <tr
                    key={z.tag}
                    style={{
                      borderBottom: '1px solid #EEE',
                      background: isDead ? 'rgba(227,6,19,0.06)' : undefined,
                    }}
                  >
                    <td className="py-2 pr-3">
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          background: isDead ? ROUGE : '#F5F5F5',
                          color: isDead ? '#fff' : '#000',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {z.tag}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden>{z.emoji}</span>
                        <span style={{ fontSize: '11px', color: '#333', fontWeight: 700 }}>
                          {z.zoneNom}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="tabular-nums font-black" style={{ fontSize: '13px', color: BLEU }}>
                        {z.scansToday}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ fontWeight: 700, color: '#333' }}>
                      {z.scans7d}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ fontWeight: 800, color: '#000' }}>
                      {z.scans30d}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ fontWeight: 700, color: z.activeIncidents > 0 ? ORANGE : '#333' }}>
                      {z.incidents}
                      {z.activeIncidents > 0 && (
                        <span style={{ fontSize: '9px', color: ORANGE, fontWeight: 800 }}>
                          {' '}({z.activeIncidents} act.)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 tabular-nums"
                        style={{
                          fontSize: '10px',
                          fontWeight: 900,
                          background:
                            z.resolutionRate >= 80
                              ? VERT
                              : z.resolutionRate >= 50
                              ? JAUNE
                              : z.resolutionRate > 0
                              ? ORANGE
                              : '#CCC',
                          color: z.resolutionRate >= 50 && z.resolutionRate < 80 ? '#000' : '#fff',
                          minWidth: '36px',
                        }}
                      >
                        {z.resolutionRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '12px',
                          fontWeight: 900,
                          color:
                            z.performanceScore >= 10
                              ? VERT
                              : z.performanceScore >= 3
                              ? BLEU
                              : z.performanceScore > 0
                              ? ORANGE
                              : '#CCC',
                        }}
                      >
                        {z.performanceScore}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>
                      {formatRelative(z.lastScanAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid : QR Morts + Top Performers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* QR Morts */}
        <div
          className="rounded-none bg-white p-4 sm:p-5"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        >
          <div className="mb-3 flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-none text-white"
              style={{ background: ROUGE }}
            >
              <Skull className="h-4 w-4" aria-hidden />
            </div>
            <h2
              className="font-black uppercase tracking-widest"
              style={{ color: ROUGE, fontSize: '12px', letterSpacing: '1.5px' }}
            >
              QR Morts · 0 scan sur 30j
            </h2>
          </div>

          {deadCount === 0 ? (
            <div
              className="rounded-none p-4 text-center"
              style={{ background: 'rgba(0,166,81,0.08)', color: VERT, fontSize: '12px', fontWeight: 800 }}
            >
              Aucun QR mort — tous les tags ont été scannés récemment.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto pr-1">
              <ul className="space-y-2">
                {data?.deadQrs.map((d) => (
                  <li
                    key={d.tag}
                    className="flex items-center justify-between gap-2 rounded-none px-3 py-2"
                    style={{ background: 'rgba(227,6,19,0.06)', border: '1px solid rgba(227,6,19,0.15)' }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span aria-hidden>{d.emoji}</span>
                      <div className="overflow-hidden">
                        <div
                          className="font-mono truncate"
                          style={{ fontSize: '11px', fontWeight: 800, color: '#000' }}
                          title={d.tag}
                        >
                          {d.tag}
                        </div>
                        <div style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>
                          {d.zoneNom} · dernier scan {formatRelative(d.lastScanAt)}
                        </div>
                      </div>
                    </div>
                    <Flame className="h-4 w-4 shrink-0" style={{ color: ROUGE }} aria-hidden />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Top Performers */}
        <div
          className="rounded-none bg-white p-4 sm:p-5"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        >
          <div className="mb-3 flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-none text-white"
              style={{ background: BLEU }}
            >
              <Trophy className="h-4 w-4" aria-hidden />
            </div>
            <h2
              className="font-black uppercase tracking-widest"
              style={{ color: BLEU, fontSize: '12px', letterSpacing: '1.5px' }}
            >
              Top Performers · 30j
            </h2>
          </div>

          {(!data?.topPerformers || data.topPerformers.length === 0) ? (
            <div
              className="rounded-none p-4 text-center"
              style={{ background: '#F5F5F5', color: '#999', fontSize: '12px', fontWeight: 700 }}
            >
              Aucun scan sur 30j — en attente de données.
            </div>
          ) : (
            <ul className="space-y-2">
              {data?.topPerformers.map((p, idx) => (
                <li
                  key={p.tag}
                  className="flex items-center justify-between gap-2 rounded-none px-3 py-2"
                  style={{
                    background: idx === 0 ? 'rgba(252,209,22,0.15)' : '#F5F5F5',
                    border: idx === 0 ? `1px solid ${JAUNE}` : '1px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: idx === 0 ? JAUNE : BLEU, color: idx === 0 ? '#000' : '#fff', fontSize: '11px', fontWeight: 900 }}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-base" aria-hidden>{p.emoji}</span>
                    <div className="overflow-hidden">
                      <div
                        className="font-mono truncate"
                        style={{ fontSize: '11px', fontWeight: 800, color: '#000' }}
                        title={p.tag}
                      >
                        {p.tag}
                      </div>
                      <div style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>
                        {p.zoneNom}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-right">
                    <div>
                      <div className="tabular-nums font-black" style={{ fontSize: '14px', color: BLEU }}>
                        {p.scans30d}
                      </div>
                      <div style={{ fontSize: '8px', color: '#999', fontWeight: 700, letterSpacing: '0.5px' }}>
                        SCANS
                      </div>
                    </div>
                    <div>
                      <div className="tabular-nums font-black" style={{ fontSize: '14px', color: VERT }}>
                        {p.performanceScore}
                      </div>
                      <div style={{ fontSize: '8px', color: '#999', fontWeight: 700, letterSpacing: '0.5px' }}>
                        SCORE
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div
        className="flex items-center justify-between"
        style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}
      >
        <span>
          ROI publicitaire cumulé (toutes zones) :
          <span style={{ color: VERT, fontWeight: 900 }}>
            {' '}{formatRevenue(data?.zones.reduce((s, z) => s + z.adRevenueFcfa, 0) ?? 0)}
          </span>
        </span>
        <span suppressHydrationWarning>
          MAJ : {new Date().toLocaleTimeString('fr-FR')}
        </span>
      </div>
    </div>
  )
}

// --- Sous-composant : header de colonne triable ---
function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th
      className="px-3 py-2 text-center"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 font-black uppercase transition-opacity hover:opacity-70"
        style={{
          color: active ? BLEU : '#666',
          fontSize: '10px',
          letterSpacing: '1px',
        }}
      >
        {label}
        <span aria-hidden style={{ fontSize: '9px', opacity: active ? 1 : 0.3 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
        </span>
      </button>
    </th>
  )
}
