'use client'

// ============================================================
// <AirportPredictionRadar /> — Widget "Radar Prédiction" V2.0
// ------------------------------------------------------------
// Affiche le risque d'explosion de plaintes voyageurs dans les
// ~20 prochaines minutes pour chaque zone aéroport. Polle
// /api/airport/predict toutes les 30 s.
//
// Palette V2.0 : fond blanc #FFFFFF + cartes avec coins arrondis
// + bleu #003399 (scores) + vert #00A651 (calme) + orange #FF6B00
// (attention) + rouge #E30613 (critique). Coins arrondis 15px.
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

const POLL_MS = 30000

const BLEU = '#003399'
const JAUNE = '#FCD116'
const ROUGE = '#E30613'
const VERT = '#00A651'
const ORANGE = '#FF6B00'

const LEVEL_STYLES: Record<RiskLevel, { bg: string; text: string; border: string; pulse?: boolean }> = {
  CALME:      { bg: 'bg-[#00A651]', text: 'text-white', border: '' },
  VIGILANCE:  { bg: 'bg-[#FCD116]', text: 'text-black', border: '' },
  TENDU:      { bg: 'bg-[#FF6B00]', text: 'text-white', border: '' },
  CRITIQUE:   { bg: 'bg-[#E30613]', text: 'text-white', border: '', pulse: true },
  IMMINENT:   { bg: 'bg-[#E30613]', text: 'text-white', border: '', pulse: true },
}

function trendInfo(zone: ZonePrediction): { Icon: typeof TrendingUp; color: string } {
  if (zone.countPrev30Min > 0 && zone.countLast30Min / zone.countPrev30Min >= 1.5) {
    return { Icon: TrendingUp, color: ROUGE }
  }
  if (zone.countPrev30Min > 0 && zone.countLast30Min / zone.countPrev30Min < 0.7) {
    return { Icon: TrendingDown, color: VERT }
  }
  return { Icon: Minus, color: '#999' }
}

function riskReason(zone: ZonePrediction): string {
  if (zone.riskScore > 60) return 'Pic d\'incidents dans les 20 dernières min'
  if (zone.riskScore > 40) return 'Tendance à la hausse'
  if (zone.riskScore > 20) return 'Surveillance normale'
  return 'Aucun incident récent'
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function AirportPredictionRadar({ className }: { className?: string }) {
  const [data, setData] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState('')

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
      const json = await res.json() as { ok?: boolean; error?: string; data?: PredictionData }
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

  useEffect(() => {
    void fetchPredict()
    const id = setInterval(() => void fetchPredict(), POLL_MS)
    return () => clearInterval(id)
  }, [fetchPredict])

  // Skeleton
  if (loading && !data) {
    return (
      <div className={`w-full ${className ?? ''}`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-[15px] bg-[#F5F5F5]"
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={`w-full ${className ?? ''}`}>
        <div
          className="rounded-[15px] bg-[#E30613] p-4 text-white"
          style={{ boxShadow: '0 4px 8px rgba(227,6,19,0.2)' }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">
              RADAR PRÉDICTION — ERREUR
            </span>
          </div>
          <p className="mt-2 text-sm opacity-90">{error}</p>
        </div>
      </div>
    )
  }

  const topAlert = data?.alerts?.[0] ?? null
  const zones = data?.zones ?? []

  return (
    <div className={`w-full ${className ?? ''}`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-white"
            style={{ background: BLEU }}
          >
            <Radar className="h-5 w-5" />
          </div>
          <span
            className="font-black uppercase tracking-widest"
            style={{ color: BLEU, fontSize: '13px', letterSpacing: '2px' }}
          >
            RADAR PRÉDICTION
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

      {/* Alerte préventive */}
      {topAlert && (
        <div
          className={`mb-4 flex items-center gap-3 rounded-[15px] px-4 py-3 text-white ${LEVEL_STYLES[topAlert.riskLevel].pulse ? 'animate-pulse' : ''}`}
          style={{ background: topAlert.riskLevel === 'CALME' || topAlert.riskLevel === 'VIGILANCE' ? ORANGE : ROUGE, boxShadow: '0 4px 8px rgba(0,0,0,0.15)' }}
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="text-sm font-black uppercase tracking-wide">
            ALERTE PRÉVENTIVE — Ça va péter dans ~{topAlert.minutesToBurst ?? 20} min sur {topAlert.nom}
          </span>
        </div>
      )}

      {/* Grille des 5 zones — cartes premium V2.0 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {zones.map((zone) => {
          const { Icon } = trendInfo(zone)
          const lvl = LEVEL_STYLES[zone.riskLevel]
          const scoreColor = zone.riskScore >= 60 ? ROUGE : zone.riskScore >= 40 ? ORANGE : zone.riskScore >= 20 ? JAUNE : VERT

          return (
            <div
              key={zone.code}
              className={`rounded-[15px] bg-white p-4 ${lvl.pulse ? 'animate-pulse' : ''}`}
              style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}
            >
              {/* Header : icône bleue + nom */}
              <div
                className="mb-3 flex items-center gap-2 pb-2"
                style={{ borderBottom: `2px solid ${JAUNE}` }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white"
                  style={{ background: BLEU }}
                >
                  <span className="text-lg">{zone.emoji}</span>
                </div>
                <span
                  className="font-black uppercase leading-tight"
                  style={{ color: '#000', fontSize: '12px', letterSpacing: '1px' }}
                >
                  {zone.nom}
                </span>
              </div>

              {/* Score */}
              <div className="flex items-baseline gap-1">
                <span
                  className="font-black tabular-nums leading-none"
                  style={{ color: scoreColor, fontSize: '40px' }}
                >
                  {zone.riskScore}
                </span>
                <span
                  className="font-bold"
                  style={{ color: '#999', fontSize: '14px' }}
                >
                  /100
                </span>
              </div>

              {/* Badge niveau */}
              <span
                className={`mt-2 inline-block rounded-[12px] px-3 py-1 text-[11px] font-black uppercase tracking-widest ${lvl.bg} ${lvl.text}`}
              >
                {zone.riskLevel}
              </span>

              {/* Stats */}
              <div
                className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
                style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: '#666' }}
              >
                <span className="flex items-center gap-1">
                  30MIN:
                  <span className="font-black" style={{ color: '#000' }}>{zone.countLast30Min}</span>
                </span>
                <span className="flex items-center gap-1">
                  PENDING:
                  <span className="font-black" style={{ color: '#000' }}>{zone.pendingCount}</span>
                </span>
                <span className="flex items-center gap-1">
                  TREND:
                  <Icon className="h-3 w-3" style={{ color: trendInfo(zone).color }} aria-hidden />
                </span>
              </div>

              {/* Recommendation */}
              <p
                className="mt-2 leading-snug"
                style={{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '0.5px' }}
              >
                {zone.recommendation}
              </p>

              {/* Risk reason */}
              <p
                className="mt-1 flex items-center gap-1 leading-snug"
                style={{ fontSize: '10px', fontWeight: 700, color: '#999' }}
              >
                <Activity className="h-2.5 w-2.5 shrink-0" style={{ color: '#999' }} aria-hidden />
                {riskReason(zone)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div
        className="mt-4 flex items-center justify-between"
        style={{ fontSize: '10px', fontWeight: 700, color: '#666', letterSpacing: '1px' }}
      >
        <span>
          SCORE GLOBAL:
          <span className="ml-1 font-black tabular-nums" style={{ color: BLEU }}>
            {data?.globalRiskScore ?? 0}/100
          </span>
          <span className="ml-1 uppercase tracking-wide">{data?.globalRiskLevel ?? '—'}</span>
        </span>
        <span suppressHydrationWarning>MAJ: {clock}</span>
      </div>
    </div>
  )
}
