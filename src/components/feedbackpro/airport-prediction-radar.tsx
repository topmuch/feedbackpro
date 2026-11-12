'use client'

// ============================================================
// <AirportPredictionRadar /> — Widget "Radar Prédiction"
// ------------------------------------------------------------
// Affiche le risque d'explosion de plaintes voyageurs dans les
// ~20 prochaines minutes pour chaque zone aéroport. Polle
// /api/airport/predict toutes les 30 s. Conçu pour être embarqué
// dans le wallboard ops room (affichage TV salle de supervision).
//
// Palette : dark slate-950, accents emerald (CALME) / yellow
// (VIGILANCE) / orange (TENDU) / rose (CRITIQUE / IMMINENT).
// Les niveaux CRITIQUE et IMMINENT pulsent (animate-pulse) pour
// attirer l'œil ops en un coup d'œil.
//
// SSR-safe : skeleton grisé jusqu'à la première résolution du
// fetch (le composant est 'use client' mais peut être pré-rendu).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Minus,
  Radar,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

type RiskLevel = 'CALME' | 'VIGILANCE' | 'TENDU' | 'CRITIQUE' | 'IMMINENT'

type ZonePrediction = {
  code: string
  nom: string
  emoji: string
  countLast5Min: number
  countLast15Min: number
  countLast30Min: number
  countPrev30Min: number
  trendRatio: number
  pendingCount: number
  riskScore: number
  riskLevel: RiskLevel
  minutesToBurst: number | null
  recommendation: string
}

type AlertItem = {
  code: string
  nom: string
  emoji: string
  riskScore: number
  riskLevel: RiskLevel
  minutesToBurst: number | null
  message: string
}

type PredictionData = {
  generatedAt: string
  globalRiskScore: number
  globalRiskLevel: RiskLevel
  zones: ZonePrediction[]
  alerts: AlertItem[]
}

const POLL_MS = 30_000

const LEVEL_STYLES: Record<RiskLevel, string> = {
  CALME: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  VIGILANCE: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  TENDU: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  CRITIQUE: 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse',
  IMMINENT: 'bg-rose-600/30 text-rose-100 border-rose-500/50 animate-pulse',
}

type TrendInfo = {
  Icon: typeof TrendingUp
  label: string
}

function trendInfo(zone: ZonePrediction): TrendInfo {
  // Zone sans activité récente : trend neutre (pas de flèche descendante
  // trompeuse quand il n'y a rien à décélérer).
  if (zone.countLast30Min === 0 && zone.countPrev30Min === 0) {
    return { Icon: Minus, label: '→' }
  }
  if (zone.trendRatio >= 1.5) return { Icon: TrendingUp, label: '↑' }
  if (zone.trendRatio < 0.7) return { Icon: TrendingDown, label: '↓' }
  return { Icon: Minus, label: '→' }
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function AirportPredictionRadar({ className }: { className?: string }) {
  const [data, setData] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState<string>('')

  // Horloge live (1 Hz) — mise à jour côté client uniquement pour
  // éviter toute divergence d'hydration (suppressHydrationWarning sur
  // le span afficheur).
  useEffect(() => {
    setClock(formatTime(new Date()))
    const id = setInterval(() => setClock(formatTime(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchPredict = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/airport/predict', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: PredictionData }
      if (!json?.ok || !json.data) {
        throw new Error(json?.error ?? 'Réponse invalide')
      }
      setData(json.data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Fetch immédiat au mount + polling toutes les 30 s.
  useEffect(() => {
    void fetchPredict()
    const id = setInterval(() => void fetchPredict(), POLL_MS)
    return () => clearInterval(id)
  }, [fetchPredict])

  // --- Skeleton / placeholder SSR-safe (avant 1ère résolution) ---
  if (loading && !data) {
    return (
      <div
        className={`rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-300 ${className ?? ''}`}
      >
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 animate-pulse text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            RADAR PRÉDICTION
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      </div>
    )
  }

  // --- État d'erreur fatale (jamais de data reçue) ---
  if (error && !data) {
    return (
      <div
        className={`rounded-xl border border-rose-500/40 bg-slate-950 p-4 text-rose-300 ${className ?? ''}`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">
            RADAR PRÉDICTION — ERREUR
          </span>
        </div>
        <p className="mt-2 text-sm text-rose-200/80">{error}</p>
      </div>
    )
  }

  const topAlert = data?.alerts?.[0] ?? null
  const zones = data?.zones ?? []

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-950 p-4 ${className ?? ''}`}
      aria-label="Radar prédiction des pics de plaintes"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-200">
            RADAR PRÉDICTION
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            suppressHydrationWarning
            className="font-mono text-xs text-slate-400"
          >
            {clock || '--:--:--'}
          </span>
          <RefreshCw
            className={`h-3.5 w-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`}
            aria-hidden
          />
        </div>
      </div>

      {/* Alerte préventive (zone >= CRITIQUE) */}
      {topAlert && (
        <div
          className="mt-3 flex animate-pulse items-center gap-3 rounded-lg border border-rose-500/50 bg-rose-600/20 px-3 py-2 text-rose-100"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="text-sm font-semibold">
            ALERTE PRÉVENTIVE — Ça va péter dans ~{topAlert.minutesToBurst ?? 20} min sur {topAlert.nom}
          </span>
        </div>
      )}

      {/* Grille des 5 zones */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {zones.map((zone) => {
          const { Icon } = trendInfo(zone)
          return (
            <div
              key={zone.code}
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
            >
              {/* Emoji + nom */}
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden>
                  {zone.emoji}
                </span>
                <span className="truncate text-xs font-medium text-slate-300">
                  {zone.nom}
                </span>
              </div>

              {/* Score gros */}
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold text-slate-100">
                  {zone.riskScore}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  /100
                </span>
              </div>

              {/* Badge niveau */}
              <span
                className={`mt-2 inline-block rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_STYLES[zone.riskLevel]}`}
              >
                {zone.riskLevel}
              </span>

              {/* Mini stats */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                <span>
                  30min:{' '}
                  <span className="font-mono text-slate-200">{zone.countLast30Min}</span>
                </span>
                <span>
                  pending:{' '}
                  <span className="font-mono text-slate-200">{zone.pendingCount}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  trend: <Icon className="h-3 w-3" aria-hidden />
                </span>
              </div>

              {/* Recommandation */}
              <p className="mt-2 text-[10px] leading-snug text-slate-500">
                {zone.recommendation}
              </p>
            </div>
          )
        })}
      </div>

      {/* Footer : risque global + dernière maj */}
      {data && (
        <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" aria-hidden />
            Risque global :{' '}
            <span className="font-mono text-slate-300">{data.globalRiskScore}/100</span>
            <span className="ml-1 uppercase tracking-wide text-slate-400">
              {data.globalRiskLevel}
            </span>
          </span>
          <span suppressHydrationWarning className="font-mono">
            Maj: {formatTime(new Date(data.generatedAt))}
          </span>
        </div>
      )}
    </div>
  )
}
