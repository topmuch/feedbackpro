'use client'

// ============================================================
// <AirportHeatmap /> — Carte thermique interactive V2.0
// ------------------------------------------------------------
// Remplace la carte statique des zones par une carte thermique
// animée temps réel. Polle /api/airport/wallboard toutes les 5s
// et affiche pour chaque zone une tuile colorée selon
// count_en_attente :
//   0       → vert   (#bc7155)
//   1-2     → jaune  (#bc7155)
//   3-5     → orange (#bc7155)
//   6+      → rouge  (#E30613, pulsing)
//
// Particules animées CSS qui s'écoulent des zones critiques
// (rouge) vers le centre de la carte (effet "flux d'incidents").
//
// Clic sur une zone → onZoneSelect(code) pour filtrer la table
// d'incidents en dessous. La zone sélectionnée est marquée par un
// anneau bleu épais.
//
// Palette V2.0 : fond #F5F5F5, panneaux blancs rounded-15px,
// bleu #000d10 (titre + sélection), jaune #bc7155, rouge #E30613,
// vert #bc7155, orange #bc7155.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, RefreshCw, Thermometer } from 'lucide-react'

// --- Palette V2.0 ---
const BLEU = '#000d10'
const JAUNE = '#bc7155'
const ROUGE = '#E30613'
const VERT = '#bc7155'
const ORANGE = '#bc7155'
const BG = '#F5F5F5'

// --- Layout de la carte aéroport (grille 5 colonnes × 5 lignes) ---
// Chaque zone est positionnée par (row, col) dans la grille.
// col 0-4 (5 colonnes), row 0-4 (5 lignes).
type ZoneCell = { code: string; label: string; row: number; col: number }
const ZONE_CELLS: ZoneCell[] = [
  // Row 1 — Extérieur (5 zones pleine ligne)
  { code: 'ext_park_p1', label: 'P1', row: 0, col: 0 },
  { code: 'ext_park_p2', label: 'P2', row: 0, col: 1 },
  { code: 'ext_depose_min', label: 'Dépose', row: 0, col: 2 },
  { code: 'ext_taxi_off', label: 'Taxis', row: 0, col: 3 },
  { code: 'ext_transport_pub', label: 'Bus/VTC', row: 0, col: 4 },
  // Row 2 — Sûreté (3 zones centrées)
  { code: 'sec_filt_std', label: 'Filtrage Std', row: 1, col: 1 },
  { code: 'sec_filt_fast', label: 'File Prioritaire', row: 1, col: 2 },
  { code: 'sec_paf', label: 'PAF', row: 1, col: 3 },
  // Row 3 — Terminal (5 zones pleine ligne)
  { code: 'term_checkin', label: 'Check-in', row: 2, col: 0 },
  { code: 'term_bagages', label: 'Bagages', row: 2, col: 1 },
  { code: 'term_embarq', label: 'Embarquement', row: 2, col: 2 },
  { code: 'term_sanitaires', label: 'Sanitaires', row: 2, col: 3 },
  { code: 'term_san_pmr', label: 'PMR', row: 2, col: 4 },
  // Row 4 — Commercial (3 zones centrées)
  { code: 'com_resto', label: 'Restauration', row: 3, col: 1 },
  { code: 'com_dutyfree', label: 'Duty-Free', row: 3, col: 2 },
  { code: 'com_lounge', label: 'Lounge', row: 3, col: 3 },
  // Row 5 — Service + Urgence (4 zones alignées à gauche)
  { code: 'srv_enfants', label: 'Enfants', row: 4, col: 0 },
  { code: 'srv_priere', label: 'Prière', row: 4, col: 1 },
  { code: 'srv_medical', label: 'Infirmerie', row: 4, col: 2 },
  { code: 'urg_sos', label: 'SOS', row: 4, col: 3 },
]

// Labels de lignes affichés à gauche de la carte.
const ROW_LABELS = ['EXTÉRIEUR', 'SÛRETÉ', 'TERMINAL', 'COMMERCIAL', 'SERVICE / URGENCE']

// --- Niveau de chaleur ---
type HeatLevel = 'calme' | 'vigilance' | 'tendu' | 'critique'
function heatLevelFromCount(count: number): HeatLevel {
  if (count >= 6) return 'critique'
  if (count >= 3) return 'tendu'
  if (count >= 1) return 'vigilance'
  return 'calme'
}

const HEAT_COLORS: Record<HeatLevel, string> = {
  calme: VERT,
  vigilance: JAUNE,
  tendu: ORANGE,
  critique: ROUGE,
}

const HEAT_LABELS: Record<HeatLevel, string> = {
  calme: 'CALME',
  vigilance: 'VIGILANCE',
  tendu: 'TENDU',
  critique: 'CRITIQUE',
}

// --- Type de données wallboard (subset nécessaire) ---
type WallboardZone = {
  code: string
  nom: string
  emoji: string
  count_24h: number
  count_en_attente: number
  last_report_at: string | null
  trend: 'up' | 'down' | 'stable'
}

type WallboardData = {
  generatedAt?: string
  zones: WallboardZone[]
}

const POLL_MS = 5000

type Props = {
  className?: string
  /** Appelée quand l'utilisateur clique une zone (null = sélection effacée). */
  onZoneSelect?: (code: string | null) => void
  /** Code zone actuellement sélectionné (controlled). */
  selectedZone?: string | null
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function AirportHeatmap({ className, onZoneSelect, selectedZone }: Props) {
  const [data, setData] = useState<WallboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState('')

  // Horloge temps réel (1s tick)
  useEffect(() => {
    setClock(formatClock(new Date()))
    const id = setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchWb = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/airport/wallboard', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: WallboardData }
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
    void fetchWb()
    const id = setInterval(() => void fetchWb(), POLL_MS)
    return () => clearInterval(id)
  }, [fetchWb])

  // Index des données wallboard par code zone.
  const zoneByCode = useMemo(() => {
    const map = new Map<string, WallboardZone>()
    for (const z of data?.zones ?? []) {
      map.set(z.code, z)
    }
    return map
  }, [data])

  // Zones critiques (count_en_attente >= 6) pour les particules.
  const criticalCells = useMemo(() => {
    return ZONE_CELLS.filter((cell) => {
      const z = zoneByCode.get(cell.code)
      return z && z.count_en_attente >= 6
    })
  }, [zoneByCode])

  // Centre de chaque cellule en % (pour positionner les particules).
  function cellCenterPct(row: number, col: number): { x: number; y: number } {
    // Grille 5 cols × 5 rows : centre = (col+0.5)/5 * 100, (row+0.5)/5 * 100
    return { x: ((col + 0.5) / 5) * 100, y: ((row + 0.5) / 5) * 100 }
  }

  // Stats globales pour le footer
  const stats = useMemo(() => {
    let totalEnAttente = 0
    let total24h = 0
    let critiqueCount = 0
    for (const cell of ZONE_CELLS) {
      const z = zoneByCode.get(cell.code)
      if (!z) continue
      totalEnAttente += z.count_en_attente
      total24h += z.count_24h
      if (z.count_en_attente >= 6) critiqueCount++
    }
    return { totalEnAttente, total24h, critiqueCount }
  }, [zoneByCode])

  // --- Loading skeleton ---
  if (loading && !data) {
    return (
      <div className={`w-full ${className ?? ''}`}>
        <div
          className="rounded-[15px] bg-white p-6"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        >
          <div className="mb-4 h-7 w-64 animate-pulse rounded bg-[#F5F5F5]" />
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[10px] bg-[#F5F5F5]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // --- Error ---
  if (error && !data) {
    return (
      <div className={`w-full ${className ?? ''}`}>
        <div
          className="rounded-[15px] p-4 text-white"
          style={{ background: ROUGE, boxShadow: '0 4px 8px rgba(227,6,19,0.2)' }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">
              CARTE THERMIQUE — ERREUR
            </span>
          </div>
          <p className="mt-2 text-sm opacity-90">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full ${className ?? ''}`}>
      {/* Style global pour les keyframes des particules (injecté une fois) */}
      <style>{`
        @keyframes fp-heat-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(227,6,19,0.55); }
          50% { transform: scale(1.03); box-shadow: 0 0 0 8px rgba(227,6,19,0); }
        }
        @keyframes fp-particle-flow {
          0% {
            left: var(--fp-start-x);
            top: var(--fp-start-y);
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.4);
          }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% {
            left: 50%;
            top: 50%;
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
          }
        }
        @keyframes fp-pulse-dot {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Carte */}
      <div
        className="rounded-[15px] bg-white p-4 sm:p-6"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      >
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-white"
              style={{ background: BLEU }}
            >
              <Thermometer className="h-5 w-5" />
            </div>
            <span
              className="font-black uppercase tracking-widest"
              style={{ color: BLEU, fontSize: '13px', letterSpacing: '2px' }}
            >
              CARTE THERMIQUE · TEMPS RÉEL
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="font-bold tabular-nums"
              style={{ color: '#666', fontSize: '12px' }}
              suppressHydrationWarning
            >
              {clock || '--:--:--'}
            </span>
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              style={{ color: BLEU }}
              aria-hidden
            />
          </div>
        </div>

        {/* Alerte critique globale */}
        {stats.critiqueCount > 0 && (
          <div
            className="mb-4 flex items-center gap-3 rounded-[12px] px-4 py-2 text-white"
            style={{
              background: ROUGE,
              boxShadow: '0 4px 8px rgba(227,6,19,0.25)',
              animation: 'fp-heat-pulse 1.4s ease-in-out infinite',
            }}
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-black uppercase tracking-widest">
              {stats.critiqueCount} zone{stats.critiqueCount > 1 ? 's' : ''} critique{stats.critiqueCount > 1 ? 's' : ''} · {stats.totalEnAttente} tickets en attente
            </span>
          </div>
        )}

        {/* Carte thermique : layout en grille avec labels de lignes */}
        <div className="flex gap-2 sm:gap-3">
          {/* Colonne labels de lignes */}
          <div className="hidden flex-col justify-around sm:flex" style={{ width: '110px' }}>
            {ROW_LABELS.map((label) => (
              <div
                key={label}
                className="flex items-center"
                style={{
                  color: BLEU,
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  textAlign: 'right',
                  lineHeight: '1.2',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grille des zones */}
          <div
            className="relative flex-1"
            style={{ background: BG, borderRadius: '12px', padding: '8px' }}
          >
            {/* Particules animées (overlay absolu au-dessus de la grille) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: 5 }}
              aria-hidden
            >
              {criticalCells.flatMap((cell) => {
                const center = cellCenterPct(cell.row, cell.col)
                // 3 particules par zone critique, décalées temporellement.
                return [0, 0.8, 1.6].map((delay, i) => (
                  <span
                    key={`${cell.code}-${i}`}
                    className="absolute"
                    style={
                      {
                        left: `${center.x}%`,
                        top: `${center.y}%`,
                        width: '6px',
                        height: '6px',
                        borderRadius: '9999px',
                        background: ROUGE,
                        // CSS vars consommées par la keyframe fp-particle-flow
                        '--fp-start-x': `${center.x}%`,
                        '--fp-start-y': `${center.y}%`,
                        animation: `fp-particle-flow 2.4s linear ${delay}s infinite`,
                      } as React.CSSProperties
                    }
                  />
                ))
              })}
            </div>

            {/* Grille 5×5 */}
            <div
              className="grid gap-2 sm:gap-3"
              style={{
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
                minHeight: '420px',
              }}
            >
              {ZONE_CELLS.map((cell) => {
                const zone = zoneByCode.get(cell.code)
                const count = zone?.count_en_attente ?? 0
                const level = heatLevelFromCount(count)
                const color = HEAT_COLORS[level]
                const isCritical = level === 'critique'
                const isSelected = selectedZone === cell.code

                return (
                  <button
                    key={cell.code}
                    type="button"
                    onClick={() => onZoneSelect?.(isSelected ? null : cell.code)}
                    className="group relative flex flex-col items-center justify-center rounded-[10px] p-2 text-center transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{
                      background: color,
                      gridColumn: `${cell.col + 1} / span 1`,
                      gridRow: `${cell.row + 1} / span 1`,
                      color: level === 'vigilance' ? '#000' : '#fff',
                      boxShadow: isCritical
                        ? `0 0 0 0 rgba(227,6,19,0.5), 0 2px 4px rgba(0,0,0,0.15)`
                        : '0 2px 4px rgba(0,0,0,0.12)',
                      animation: isCritical ? 'fp-heat-pulse 1.2s ease-in-out infinite' : undefined,
                      outline: isSelected ? `3px solid ${BLEU}` : undefined,
                      outlineOffset: isSelected ? '2px' : undefined,
                      cursor: 'pointer',
                    }}
                    aria-label={`${cell.label} — ${count} en attente — ${HEAT_LABELS[level]}`}
                    aria-pressed={isSelected}
                  >
                    {/* Emoji zone */}
                    <span className="text-base sm:text-lg leading-none" aria-hidden>
                      {zone?.emoji ?? '📍'}
                    </span>
                    {/* Label court */}
                    <span
                      className="mt-1 leading-tight"
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {cell.label}
                    </span>
                    {/* Compteur */}
                    <span
                      className="mt-1 tabular-nums leading-none"
                      style={{ fontSize: '18px', fontWeight: 900 }}
                    >
                      {count}
                    </span>
                    <span
                      style={{
                        fontSize: '8px',
                        fontWeight: 700,
                        opacity: 0.85,
                        letterSpacing: '0.5px',
                      }}
                    >
                      {HEAT_LABELS[level]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Légende */}
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] px-4 py-2"
          style={{ background: BG }}
        >
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {(['calme', 'vigilance', 'tendu', 'critique'] as HeatLevel[]).map((lvl) => (
              <div key={lvl} className="flex items-center gap-1.5">
                <span
                  className="inline-block"
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    background: HEAT_COLORS[lvl],
                    animation: lvl === 'critique' ? 'fp-pulse-dot 1.2s ease-in-out infinite' : undefined,
                  }}
                  aria-hidden
                />
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#333',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  {HEAT_LABELS[lvl]}
                </span>
                <span style={{ fontSize: '9px', color: '#999', fontWeight: 700 }}>
                  {lvl === 'calme'
                    ? '0'
                    : lvl === 'vigilance'
                    ? '1-2'
                    : lvl === 'tendu'
                    ? '3-5'
                    : '6+'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3" style={{ fontSize: '10px', fontWeight: 700, color: '#666' }}>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" style={{ color: BLEU }} aria-hidden />
              ATTENTE:
              <span className="font-black" style={{ color: '#000' }}>{stats.totalEnAttente}</span>
            </span>
            <span>
              24H:
              <span className="font-black" style={{ color: '#000' }}>{stats.total24h}</span>
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div
          className="mt-2 flex items-center justify-between"
          style={{ fontSize: '9px', fontWeight: 700, color: '#999', letterSpacing: '1px' }}
        >
          <span className="uppercase">Clic zone → filtrer table incidents</span>
          <span suppressHydrationWarning>MAJ: {clock}</span>
        </div>
      </div>
    </div>
  )
}
