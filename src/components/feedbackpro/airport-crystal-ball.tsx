'use client'

// ============================================================
// <AirportCrystalBall /> — Boule de cristal prédictive V2.0
// ------------------------------------------------------------
// Affiche les prédictions avancées combinant :
//   - Vols actifs (AirportFlightGate) → impact pax sur zones voisines
//   - Patterns historiques (récurrence jour-semaine + heure)
//   - Météo simulée (modulateur de risque)
//   - Recommandations auto dérivées
//
// Polle /api/airport/crystal-ball toutes les 60s.
//
// Chaque carte de prédiction affiche :
//   - Infos vol (n°, compagnie, pax, ETA)
//   - Score de risque + couleur V2.0
//   - Raison ("180 pax décollant dans 15min → risque bagages +65%")
//   - Pattern historique (si applicable)
//   - Recommandation ("Ouvrir 2 guichets supplémentaires")
//   - Bouton "Pré-positionner équipes" (auto-action)
//
// Palette V2.0 : fond #F5F5F5, cartes blanches rounded-15px,
// bleu #003399, jaune #FCD116, rouge #E30613, vert #00A651,
// orange #FF6B00.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Calendar,
  Cloud,
  CloudRain,
  CloudSnow,
  Cloudy,
  FlaskConical,
  Plane,
  RefreshCw,
  Sparkles,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react'

// --- Palette V2.0 ---
const BLEU = '#003399'
const JAUNE = '#FCD116'
const ROUGE = '#E30613'
const VERT = '#00A651'
const ORANGE = '#FF6B00'
const BG = '#F5F5F5'

type Weather = {
  condition: 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy'
  label: string
  temperature: number
  impact: number
  description: string
}

type PatternMatched = {
  dayName: string
  hour: number
  avgIncidents: number
  message: string
}

type Prediction = {
  id: string
  flightNumber: string
  airline: string | null
  destination: string | null
  paxCount: number
  etaMinutes: number
  gateTag: string
  zoneCode: string
  zoneNom: string
  emoji: string
  riskScore: number
  riskPercent: number
  riskReason: string
  patternMatched: PatternMatched | null
  recommendation: string
  actionLabel: string
}

type Pattern = {
  dayOfWeek: number
  dayName: string
  hour: number
  zoneCode: string
  zoneNom: string
  emoji: string
  occurrenceCount: number
  avgIncidents: number
  totalIncidents: number
  message: string
}

type Recommendation = {
  type: 'flight' | 'pattern' | 'weather'
  priority: 'high' | 'medium' | 'low'
  message: string
  zoneCode: string | null
}

type CrystalData = {
  generatedAt: string
  weather: Weather
  predictions: Prediction[]
  patterns: Pattern[]
  recommendations: Recommendation[]
}

const POLL_MS = 60000

// --- Helpers visuels ---
function riskColor(score: number): string {
  if (score >= 70) return ROUGE
  if (score >= 50) return ORANGE
  if (score >= 30) return JAUNE
  return VERT
}

function riskLabel(score: number): string {
  if (score >= 70) return 'CRITIQUE'
  if (score >= 50) return 'ÉLEVÉ'
  if (score >= 30) return 'MODÉRÉ'
  return 'FAIBLE'
}

function weatherIcon(cond: Weather['condition']) {
  switch (cond) {
    case 'sunny': return Sun
    case 'cloudy': return Cloudy
    case 'rainy': return CloudRain
    case 'stormy': return Cloud
    case 'snowy': return CloudSnow
  }
}

function priorityColor(p: Recommendation['priority']): string {
  if (p === 'high') return ROUGE
  if (p === 'medium') return ORANGE
  return BLEU
}

export function AirportCrystalBall({ className }: { className?: string }) {
  const [data, setData] = useState<CrystalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dispatched, setDispatched] = useState<Set<string>>(new Set())

  const fetchCb = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/airport/crystal-ball', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: CrystalData }
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
    void fetchCb()
    const id = setInterval(() => void fetchCb(), POLL_MS)
    return () => clearInterval(id)
  }, [fetchCb])

  function handleAction(predId: string) {
    setDispatched((prev) => {
      const next = new Set(prev)
      next.add(predId)
      return next
    })
  }

  // --- Loading skeleton ---
  if (loading && !data) {
    return (
      <div className={`w-full space-y-4 ${className ?? ''}`}>
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-[15px] bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={`w-full ${className ?? ''}`}>
        <div
          className="rounded-[15px] p-4 text-white"
          style={{ background: ROUGE }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">
              BOULE DE CRISTAL — ERREUR
            </span>
          </div>
          <p className="mt-2 text-sm opacity-90">{error}</p>
        </div>
      </div>
    )
  }

  const WeatherIcon = data ? weatherIcon(data.weather.condition) : Sun
  const predictions = data?.predictions ?? []
  const patterns = data?.patterns ?? []
  const recos = data?.recommendations ?? []
  const hasCritical = predictions.some((p) => p.riskScore >= 70)

  return (
    <div className={`w-full space-y-5 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-[12px] text-white"
            style={{ background: BLEU }}
          >
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <h1
              className="font-black uppercase tracking-tight"
              style={{ color: '#000', fontSize: '20px' }}
            >
              Crystal Ball · Prédictions avancées
            </h1>
            <p style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>
              Vols + patterns historiques + météo · MAJ 60s
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchCb()}
          className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-white transition-opacity hover:opacity-90"
          style={{ background: BLEU, fontSize: '12px', fontWeight: 800 }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          RAFRAÎCHIR
        </button>
      </div>

      {/* Bandeau météo */}
      {data && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[15px] bg-white p-4"
          style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-[10px]"
              style={{
                background:
                  data.weather.condition === 'sunny'
                    ? JAUNE
                    : data.weather.condition === 'rainy' || data.weather.condition === 'stormy'
                    ? BLEU
                    : data.weather.condition === 'snowy'
                    ? '#E0E7FF'
                    : '#CCC',
                color: data.weather.condition === 'sunny' ? '#000' : '#fff',
              }}
            >
              <WeatherIcon className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <div
                className="font-black uppercase tracking-widest"
                style={{ color: BLEU, fontSize: '11px', letterSpacing: '1.5px' }}
              >
                MÉTéo SIMULÉE
              </div>
              <div className="flex items-baseline gap-2">
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#000' }}>
                  {data.weather.label}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#666' }}>
                  {data.weather.temperature}°C
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#999', fontWeight: 600 }}>
                {data.weather.description}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '10px', color: '#666' }}
            >
              IMPACT
            </span>
            <span
              className="rounded-full px-3 py-1 font-black tabular-nums"
              style={{
                background: data.weather.impact >= 20 ? ROUGE : data.weather.impact > 0 ? ORANGE : VERT,
                color: '#fff',
                fontSize: '12px',
              }}
            >
              +{data.weather.impact}%
            </span>
          </div>
        </div>
      )}

      {/* Alerte critique globale */}
      {hasCritical && (
        <div
          className="flex items-center gap-3 rounded-[12px] px-4 py-3 text-white"
          style={{
            background: ROUGE,
            boxShadow: '0 4px 8px rgba(227,6,19,0.25)',
            animation: 'fp-cb-pulse 1.4s ease-in-out infinite',
          }}
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="text-xs font-black uppercase tracking-widest">
            Prédictions critiques — pré-positionner les équipes immédiatement
          </span>
          <style>{`@keyframes fp-cb-pulse { 0%,100%{opacity:0.85} 50%{opacity:1} }`}</style>
        </div>
      )}

      {/* Prédictions — cartes premium */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Plane className="h-4 w-4" style={{ color: BLEU }} aria-hidden />
          <h2
            className="font-black uppercase tracking-widest"
            style={{ color: BLEU, fontSize: '12px', letterSpacing: '1.5px' }}
          >
            Prédictions vols · {predictions.length}
          </h2>
        </div>

        {predictions.length === 0 ? (
          <div
            className="rounded-[15px] bg-white p-6 text-center"
            style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.06)', color: '#999', fontSize: '13px', fontWeight: 700 }}
          >
            Aucun vol actif aux portes — en attente d&apos;assignation dans
            l&apos;onglet <span style={{ color: BLEU }}>Portes &amp; Vols</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {predictions.map((p) => {
              const color = riskColor(p.riskScore)
              const isDispatched = dispatched.has(p.id)
              return (
                <article
                  key={p.id}
                  className="relative overflow-hidden rounded-[15px] bg-white p-4"
                  style={{
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    borderTop: `4px solid ${color}`,
                  }}
                >
                  {/* Header : flight number + risk badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Plane className="h-4 w-4 shrink-0" style={{ color: BLEU }} aria-hidden />
                        <span
                          className="font-mono font-black"
                          style={{ fontSize: '16px', color: BLEU }}
                        >
                          {p.flightNumber}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5" style={{ fontSize: '11px', color: '#666', fontWeight: 700 }}>
                        {p.airline && <span>{p.airline}</span>}
                        {p.destination && (
                          <>
                            <span aria-hidden>→</span>
                            <span className="truncate" title={p.destination}>{p.destination}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div
                      className="shrink-0 rounded-[10px] px-2 py-1 text-center"
                      style={{ background: color, color: color === JAUNE ? '#000' : '#fff' }}
                    >
                      <div className="tabular-nums font-black leading-none" style={{ fontSize: '18px' }}>
                        {p.riskScore}
                      </div>
                      <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.5px' }}>
                        {riskLabel(p.riskScore)}
                      </div>
                    </div>
                  </div>

                  {/* Pax + ETA */}
                  <div
                    className="mt-3 grid grid-cols-2 gap-2 rounded-[10px] p-2"
                    style={{ background: BG }}
                  >
                    <div>
                      <div style={{ fontSize: '9px', color: '#999', fontWeight: 800, letterSpacing: '0.5px' }}>
                        PAX
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="tabular-nums font-black" style={{ fontSize: '20px', color: '#000' }}>
                          {p.paxCount}
                        </span>
                        <span style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>voyageurs</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', color: '#999', fontWeight: 800, letterSpacing: '0.5px' }}>
                        ETA
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="tabular-nums font-black" style={{ fontSize: '20px', color: BLEU }}>
                          {p.etaMinutes}
                        </span>
                        <span style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>min</span>
                      </div>
                    </div>
                  </div>

                  {/* Zone impactée */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-lg" aria-hidden>{p.emoji}</span>
                    <div className="overflow-hidden">
                      <div
                        className="font-black uppercase truncate"
                        style={{ fontSize: '11px', color: '#000', letterSpacing: '0.5px' }}
                      >
                        {p.zoneNom}
                      </div>
                      <div className="font-mono" style={{ fontSize: '9px', color: '#999', fontWeight: 700 }}>
                        {p.gateTag}
                      </div>
                    </div>
                    <div
                      className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-black tabular-nums"
                      style={{
                        background: color,
                        color: color === JAUNE ? '#000' : '#fff',
                        fontSize: '11px',
                      }}
                    >
                      +{p.riskPercent}%
                    </div>
                  </div>

                  {/* Risk reason */}
                  <p
                    className="mt-3 leading-snug"
                    style={{ fontSize: '11px', fontWeight: 700, color: '#333' }}
                  >
                    <Activity className="mr-1 inline h-3 w-3 align-text-bottom" style={{ color: color }} aria-hidden />
                    {p.riskReason}
                  </p>

                  {/* Pattern historique (si applicable) */}
                  {p.patternMatched && (
                    <div
                      className="mt-3 rounded-[8px] p-2"
                      style={{ background: 'rgba(252,209,22,0.12)', border: `1px solid ${JAUNE}` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" style={{ color: '#B8860B' }} aria-hidden />
                        <span
                          className="font-black uppercase"
                          style={{ fontSize: '9px', color: '#B8860B', letterSpacing: '0.5px' }}
                        >
                          Pattern détecté
                        </span>
                      </div>
                      <p className="mt-1 leading-snug" style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>
                        {p.patternMatched.message}
                      </p>
                    </div>
                  )}

                  {/* Recommandation */}
                  <div
                    className="mt-3 rounded-[8px] p-2"
                    style={{ background: 'rgba(0,51,153,0.08)', border: `1px solid rgba(0,51,153,0.15)` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" style={{ color: BLEU }} aria-hidden />
                      <span
                        className="font-black uppercase"
                        style={{ fontSize: '9px', color: BLEU, letterSpacing: '0.5px' }}
                      >
                        Recommandation auto
                      </span>
                    </div>
                    <p className="mt-1 leading-snug" style={{ fontSize: '11px', fontWeight: 700, color: '#000' }}>
                      {p.recommendation}
                    </p>
                  </div>

                  {/* Auto-action button */}
                  <button
                    type="button"
                    onClick={() => handleAction(p.id)}
                    disabled={isDispatched}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: isDispatched ? VERT : BLEU,
                      fontSize: '11px',
                      fontWeight: 900,
                      letterSpacing: '0.5px',
                    }}
                    aria-label={`${p.actionLabel} pour ${p.flightNumber}`}
                  >
                    {isDispatched ? (
                      <>
                        <Activity className="h-3.5 w-3.5" aria-hidden />
                        ÉQUIPES PRÉ-POSITIONNÉES
                      </>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" aria-hidden />
                        {p.actionLabel.toUpperCase()}
                      </>
                    )}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Patterns historiques détectés */}
      {patterns.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: BLEU }} aria-hidden />
            <h2
              className="font-black uppercase tracking-widest"
              style={{ color: BLEU, fontSize: '12px', letterSpacing: '1.5px' }}
            >
              Patterns historiques · 4 dernières semaines
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {patterns.map((pat, idx) => (
              <div
                key={`${pat.zoneCode}-${pat.dayOfWeek}-${pat.hour}`}
                className="rounded-[12px] bg-white p-3"
                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: `3px solid ${JAUNE}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base" aria-hidden>{pat.emoji}</span>
                  <span className="font-black" style={{ fontSize: '11px', color: '#000' }}>
                    {pat.zoneNom}
                  </span>
                </div>
                <p className="mt-2 leading-snug" style={{ fontSize: '11px', fontWeight: 700, color: '#333' }}>
                  {pat.message}
                </p>
                <div className="mt-2 flex items-center gap-3" style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}>
                  <span>
                    Occurrences: <span style={{ color: '#000', fontWeight: 900 }}>{pat.occurrenceCount}</span>
                  </span>
                  <span>
                    Total: <span style={{ color: '#000', fontWeight: 900 }}>{pat.totalIncidents}</span>
                  </span>
                </div>
                {idx === 0 && (
                  <div
                    className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: JAUNE, color: '#000', fontSize: '9px', fontWeight: 900, letterSpacing: '0.5px' }}
                  >
                    <TrendingUp className="h-2.5 w-2.5" aria-hidden />
                    TOP PATTERN
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommandations auto */}
      {recos.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: BLEU }} aria-hidden />
            <h2
              className="font-black uppercase tracking-widest"
              style={{ color: BLEU, fontSize: '12px', letterSpacing: '1.5px' }}
            >
              Recommandations auto · {recos.length}
            </h2>
          </div>
          <ul className="space-y-2">
            {recos.map((r, idx) => {
              const color = priorityColor(r.priority)
              const Icon =
                r.type === 'flight' ? Plane : r.type === 'pattern' ? Calendar : Cloud
              return (
                <li
                  key={`${r.type}-${idx}`}
                  className="flex items-start gap-3 rounded-[12px] bg-white p-3"
                  style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05)', borderLeft: `4px solid ${color}` }}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-white"
                    style={{ background: color }}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-black uppercase"
                        style={{ fontSize: '9px', color: color, letterSpacing: '0.5px' }}
                      >
                        {r.type === 'flight' ? 'Vol' : r.type === 'pattern' ? 'Pattern' : 'Météo'} · {r.priority}
                      </span>
                    </div>
                    <p className="mt-1 leading-snug" style={{ fontSize: '11px', fontWeight: 700, color: '#000' }}>
                      {r.message}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Footer info */}
      <div
        className="flex items-center justify-between"
        style={{ fontSize: '10px', color: '#999', fontWeight: 700 }}
      >
        <span>
          {predictions.length} prédictions · {patterns.length} patterns · {recos.length} recommandations
        </span>
        <span suppressHydrationWarning>
          MAJ : {data ? new Date(data.generatedAt).toLocaleTimeString('fr-FR') : '—'}
        </span>
      </div>
    </div>
  )
}
