'use client'

// ============================================================
// <AirportLeaderboardTab /> — Classement des agents
// ------------------------------------------------------------
// Affiche le classement mensuel des agents par score (points).
// Gamification : +20pts si <5min, +10pts si <10min, +5pts si <20min.
// ============================================================

import { useEffect, useState } from 'react'
import { Trophy, Medal, Award, Loader2, Clock, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Agent = {
  rank: number
  id: string
  staffName: string
  staffPhone: string | null
  points: number
  resolutions: number
  avgMinutes: number
  lastResolvedAt: string | null
}

export function AirportLeaderboardTab() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/airport/leaderboard', { cache: 'no-store' })
        const json = await res.json()
        if (!cancelled && json.ok) {
          setAgents(json.data.leaderboard ?? [])
          setMonth(json.data.month ?? '')
        }
      } catch {
        /* silencieux */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E1E2E]">Classement des agents</h1>
          <p className="mt-1 text-sm text-[#9A9AAE]">
            Score mensuel · {month || '—'} · {agents.length} agent{agents.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E8B54D] to-[#d4a040] shadow-lg">
          <Trophy className="size-6 text-white" aria-hidden />
        </div>
      </div>

      {/* Règles de scoring */}
      <Card className="overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <CardContent className="grid grid-cols-3 gap-4 p-4">
          <div className="flex flex-col items-center gap-1 rounded-xl bg-[#4CC96B]/10 p-3 text-center">
            <span className="text-2xl font-black text-[#4CC96B]">+20</span>
            <span className="text-[10px] font-bold uppercase text-[#9A9AAE]">&lt; 5 min</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl bg-[#5257C9]/10 p-3 text-center">
            <span className="text-2xl font-black text-[#5257C9]">+10</span>
            <span className="text-[10px] font-bold uppercase text-[#9A9AAE]">&lt; 10 min</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-xl bg-[#E8B54D]/10 p-3 text-center">
            <span className="text-2xl font-black text-[#E8B54D]">+5</span>
            <span className="text-[10px] font-bold uppercase text-[#9A9AAE]">&lt; 20 min</span>
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[#9A9AAE]">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Trophy className="size-12 text-[#9A9AAE]/40" />
            <p className="text-sm font-medium text-[#9A9AAE]">Aucun agent classé ce mois-ci</p>
            <p className="text-xs text-[#9A9AAE]/70">
              Les points sont attribués quand un employé résout un signalement via le QR Staff Only.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className={cn(
                'overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all',
                agent.rank === 1 && 'ring-2 ring-[#E8B54D]',
                agent.rank === 2 && 'ring-1 ring-slate-300',
                agent.rank === 3 && 'ring-1 ring-amber-400/40',
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Rank / Medal */}
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black"
                  style={{
                    background: agent.rank <= 3
                      ? ['#E8B54D', '#C0C0C0', '#CD7F32'][agent.rank - 1]
                      : '#E9E9EF',
                    color: agent.rank <= 3 ? 'white' : '#9A9AAE',
                  }}
                >
                  {agent.rank <= 3 ? medals[agent.rank - 1] : agent.rank}
                </div>

                {/* Nom */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-[#1E1E2E]">{agent.staffName}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-[#9A9AAE]">
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp className="size-3" /> {agent.resolutions} résolution{agent.resolutions > 1 ? 's' : ''}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {agent.avgMinutes}min en moyenne
                    </span>
                  </div>
                </div>

                {/* Points */}
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-black text-[#1E1E2E]">{agent.points}</p>
                  <p className="text-[10px] font-bold uppercase text-[#9A9AAE]">points</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
