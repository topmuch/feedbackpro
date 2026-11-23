'use client'

// ============================================================
// VipOrchestrationTab — VUE ORCHESTRATION TEMPS RÉEL (Manager)
// ------------------------------------------------------------
// Tableau de bord manager du moteur de routage intelligent :
//
//   👷 ÉQUIPE EN LIGNE      — charge live (🟢/🟡/🔴), temps moyen,
//                             statut service de chaque employé
//   🔄 ROUTAGE EN COURS     — journal live des décisions du moteur
//                             (qui, quoi, où, score, temps décision)
//   ⚠️ ALERTES ORCHESTRATION — surcharges, incidents non pris en
//                             charge, escalades manager
//   📊 HEATMAP ROUTAGE      — incidents par zone (dernière heure)
//
// Actions manager rapides : ✓ Résolu · ↻ Relancer le moteur sur une
// tâche non prise en charge.
//
// Nathalie (optionnelle, désactivée par défaut — Mode Discrétion) :
// annonce « Incident X assigné à Y » + file urgente d'escalade.
//
// Contrat : GET /api/routing/overview?tenant=vip_lounge (30s)
//           POST /api/routing/tick (escalades + tâches proactives)
//           PATCH /api/routing/history/:id (accept/resolve/reassign)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Network,
  RefreshCw,
  Loader2,
  Users,
  AlertTriangle,
  Volume2,
  VolumeX,
  Zap,
  Timer,
  CheckCircle2,
  RotateCcw,
  Crown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { parler } from '@/lib/staff-tts'
import {
  CATEGORIE_EMOJI,
  CATEGORIE_LABEL,
  SIGNAL_EMOJI,
  SIGNAL_LABEL,
  ZONE_EMOJI,
  ZONE_LABEL,
  VIP_ROUTING_ZONES,
} from '@/lib/routing-config'

// ---------- Types (mirror API) ----------

type StaffOrch = {
  id: string
  name: string
  category: string
  zones: string[]
  isOnDuty: boolean
  maxActiveTasks: number
  activeTasks: number
  todayCount: number
  successRate: number | null
  avgResolutionMin: number | null
}

type LigneHisto = {
  id: string
  incidentKind: string
  incidentLabel: string | null
  zoneCode: string | null
  signalType: string | null
  staffId: string | null
  staffName: string | null
  score: number
  decisionMs: number
  escalated: boolean
  open: boolean
  outcome: string
  responseTimeSec: number | null
  resolutionTimeSec: number | null
  createdAt: string
}

type OverviewOrch = {
  tenantKey: string
  staff: StaffOrch[]
  history: LigneHisto[]
  alertes: { type: string; message: string; severity: string }[]
  stats: {
    total: number
    escalades: number
    nonResolus: number
    tauxAutomatique: number
    avgDecisionMs: number
    avgAssignSec: number
    heatmap: { zone: string | null; label: string; count: number }[]
  }
}

const CLE_DENISE = 'vip_orchestration_denise'

function heureCourte(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function VipOrchestrationTab() {
  const [data, setData] = useState<OverviewOrch | null>(null)
  const [chargement, setChargement] = useState(true)
  const [deniseOn, setDeniseOn] = useState(false)
  const [actionEnCours, setActionEnCours] = useState<string | null>(null)
  const dernierHistoRef = useRef<Set<string>>(new Set())
  const premierChargementRef = useRef(true)

  // Nathalie : préférence persistée (désactivée par défaut — discrétion)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLE_DENISE)
      if (v === '1') setDeniseOn(true)
    } catch {
      /* localStorage indisponible */
    }
  }, [])

  const basculerDenise = (v: boolean) => {
    setDeniseOn(v)
    try {
      window.localStorage.setItem(CLE_DENISE, v ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (v) parler('Vue orchestration activée. Je vous annonce les affectations en temps réel.')
  }

  const charger = useCallback(
    async (silencieux = false) => {
      if (!silencieux) setChargement(true)
      try {
        const [res, tick] = await Promise.all([
          fetch('/api/routing/overview?tenant=vip_lounge', { cache: 'no-store' }),
          fetch('/api/routing/tick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantKey: 'vip_lounge' }),
          }).catch(() => null),
        ])
        const json = await res.json()
        if (json.ok) {
          const nouveau: OverviewOrch = json.data
          setData(nouveau)

          // Détection des nouvelles assignations → annonce Nathalie
          const ids = new Set(nouveau.history.map((h) => h.id))
          if (!premierChargementRef.current && deniseOn) {
            const fraiches = nouveau.history.filter(
              (h) => !dernierHistoRef.current.has(h.id) && h.staffName && (h.outcome === 'assigned' || h.escalated),
            )
            // File Nathalie du tick (escalades + proactives)
            const tickJson = tick ? await tick.json().catch(() => null) : null
            if (tickJson?.ok && Array.isArray(tickJson.data?.deniseQueue)) {
              for (const d of tickJson.data.deniseQueue.slice(0, 3)) {
                if (d?.message) parler(d.message)
              }
            }
            for (const h of fraiches.slice(0, 2)) {
              parler(
                h.escalated
                  ? `Alerte : incident non pris en charge en ${ZONE_LABEL(h.zoneCode)}. Escalade vers ${h.staffName}.`
                  : `Nouvel incident ${SIGNAL_LABEL(h.signalType)} en zone ${ZONE_LABEL(h.zoneCode)}. ${h.staffName}, c'est pour toi.`,
              )
            }
          }
          dernierHistoRef.current = ids
          premierChargementRef.current = false
        }
      } catch {
        // silencieux : le dashboard réessaie au prochain cycle
      } finally {
        setChargement(false)
      }
    },
    [deniseOn],
  )

  useEffect(() => {
    charger()
    const iv = setInterval(() => charger(true), 30000)
    return () => clearInterval(iv)
  }, [charger])

  async function actionTache(id: string, action: 'resolve' | 'reassign' | 'accept') {
    setActionEnCours(id)
    try {
      const res = await fetch(`/api/routing/history/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (json.ok) await charger(true)
    } finally {
      setActionEnCours(null)
    }
  }

  if (chargement && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (!data) return null

  const enService = data.staff.filter((s) => s.isOnDuty)
  const enCours = data.history.filter((h) => h.open)
  const alertes = data.alertes.slice(0, 6)
  const heatMax = Math.max(...data.stats.heatmap.map((h) => h.count), 1)

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[#2C2C2C]">
            <Network className="h-5 w-5 text-[#bc7155]" />
            Orchestration temps réel
          </h2>
          <p className="text-sm text-[#8B6F47]">
            Le moteur route automatiquement chaque signalement vers le bon employé.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-[#efe7e0] bg-white px-3 py-1.5">
            {deniseOn ? (
              <Volume2 className="h-4 w-4 text-[#bc7155]" />
            ) : (
              <VolumeX className="h-4 w-4 text-[#8B6F47]" />
            )}
            <span className="text-xs font-medium text-[#2C2C2C]">Nathalie</span>
            <Switch checked={deniseOn} onCheckedChange={basculerDenise} aria-label="Annonces vocales Nathalie" />
          </div>
          <Button variant="outline" size="sm" onClick={() => charger()} className="border-[#bc7155]/40 text-[#8B6F47] hover:bg-[#bc7155]/10">
            <RefreshCw className={cn('mr-1 h-4 w-4', chargement && 'animate-spin')} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-[#8B6F47]">
              <Users className="h-3.5 w-3.5" /> Équipe en service
            </p>
            <p className="mt-1 text-2xl font-bold text-[#2C2C2C]">
              {enService.length}/{data.staff.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-[#8B6F47]">
              <Timer className="h-3.5 w-3.5" /> Tâches en cours
            </p>
            <p className="mt-1 text-2xl font-bold text-[#2C2C2C]">{enCours.length}</p>
          </CardContent>
        </Card>
        <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-[#8B6F47]">
              <Zap className="h-3.5 w-3.5 text-[#bc7155]" /> Décision moteur
            </p>
            <p className="mt-1 text-2xl font-bold text-[#2C2C2C]">{data.stats.avgDecisionMs} ms</p>
            <p className="text-[11px] text-[#8B6F47]">{data.stats.tauxAutomatique}% routés auto (7j)</p>
          </CardContent>
        </Card>
        <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-[#8B6F47]">
              <AlertTriangle className="h-3.5 w-3.5 text-[#bc7155]" /> Alertes
            </p>
            <p className="mt-1 text-2xl font-bold text-[#bc7155]">{alertes.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 👷 Équipe en ligne */}
        <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-[#2C2C2C]">
              <Users className="h-4 w-4 text-[#bc7155]" /> Équipe en ligne
            </CardTitle>
            <CardDescription>Charge en direct — anti-surcharge automatique.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto pr-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#8B6F47]">
                    <th className="pb-2 font-medium">Employé</th>
                    <th className="pb-2 font-medium">Zones</th>
                    <th className="pb-2 font-medium">Charge</th>
                    <th className="pb-2 font-medium">Temps moy</th>
                    <th className="pb-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((emp) => {
                    const ratio = emp.activeTasks / Math.max(1, emp.maxActiveTasks)
                    const surcharge = ratio >= 1
                    const elevee = ratio >= 0.66
                    return (
                      <tr key={emp.id} className="border-t border-[#F0EBE1]">
                        <td className="py-2">
                          <p className="font-medium text-[#2C2C2C]">{emp.name}</p>
                          <p className="text-[11px] text-[#8B6F47]">
                            {CATEGORIE_EMOJI(emp.category)} {CATEGORIE_LABEL(emp.category)}
                          </p>
                        </td>
                        <td className="py-2 text-xs text-[#2C2C2C]">
                          {emp.zones.length === 0 ? '—' : emp.zones.length > 2 ? `${ZONE_LABEL(emp.zones[0])} +${emp.zones.length - 1}` : emp.zones.map((z) => ZONE_LABEL(z)).join(', ')}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px]',
                              !emp.isOnDuty
                                ? 'border-[#D8D2C6] text-[#8B6F47]'
                                : surcharge
                                  ? 'border-[#bc7155]/40 bg-[#bc7155]/10 text-[#bc7155]'
                                  : elevee
                                    ? 'border-[#bc7155]/40 bg-[#bc7155]/10 text-[#8B6F47]'
                                    : 'border-[#bc7155]/30 bg-[#bc7155]/10 text-[#bc7155]',
                            )}
                          >
                            {emp.isOnDuty ? `${emp.activeTasks}/${emp.maxActiveTasks}` : '—'}
                          </Badge>
                        </td>
                        <td className="py-2 text-xs text-[#2C2C2C]">
                          {emp.avgResolutionMin != null ? `${emp.avgResolutionMin} min` : '—'}
                        </td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            {!emp.isOnDuty ? (
                              <>
                                <span className="h-2 w-2 rounded-full bg-[#D8D2C6]" /> Hors service
                              </>
                            ) : surcharge ? (
                              <>
                                <span className="h-2 w-2 rounded-full bg-[#bc7155]" /> Surcharge
                              </>
                            ) : (
                              <>
                                <span className="h-2 w-2 rounded-full bg-[#bc7155]" /> Actif
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ⚠️ Alertes */}
        <Card className={cn('border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]', alertes.length > 0 && 'border-[#bc7155]/40')}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-[#2C2C2C]">
              <AlertTriangle className={cn('h-4 w-4', alertes.length > 0 ? 'text-[#bc7155]' : 'text-[#bc7155]')} />
              Alertes orchestration
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {alertes.length === 0 && (
              <p className="flex items-center gap-2 py-6 text-sm text-[#bc7155]">
                <CheckCircle2 className="h-4 w-4" /> Tout est sous contrôle — aucune alerte.
              </p>
            )}
            {alertes.map((a, i) => (
              <p
                key={i}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  a.severity === 'danger'
                    ? 'border-[#bc7155]/40 bg-[#bc7155]/8 text-[#a35440]'
                    : 'border-[#bc7155]/40 bg-[#bc7155]/8 text-[#8B6F47]',
                )}
              >
                • {a.message}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 🔄 Routage en cours */}
      <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-[#2C2C2C]">
            <Network className="h-4 w-4 text-[#bc7155]" /> Routage en cours
          </CardTitle>
          <CardDescription>Décisions du moteur — journal temps réel.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-96 space-y-2 overflow-y-auto">
          {data.history.length === 0 && (
            <p className="py-6 text-center text-sm text-[#8B6F47]">
              Aucun routage sur les 7 derniers jours — le moteur est prêt.
            </p>
          )}
          {data.history.slice(0, 25).map((h) => (
            <div
              key={h.id}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                h.escalated ? 'border-[#bc7155]/40 bg-[#bc7155]/5' : 'border-[#efe7e0] bg-white',
              )}
            >
              <span className="w-12 shrink-0 text-xs tabular-nums text-[#8B6F47]">{heureCourte(h.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate text-[#2C2C2C]">
                {ZONE_EMOJI(h.zoneCode)} {h.incidentLabel ?? `${SIGNAL_LABEL(h.signalType)} — ${ZONE_LABEL(h.zoneCode)}`}
                {h.incidentKind === 'proactive' && (
                  <Badge variant="outline" className="ml-1 border-[#bc7155]/40 text-[10px] text-[#8B6F47]">
                    proactive
                  </Badge>
                )}
              </span>
              {h.staffName && (
                <span className="shrink-0 text-[#8B6F47]">
                  → <span className="font-medium text-[#2C2C2C]">{h.staffName}</span>
                </span>
              )}
              {h.score > 0 && (
                <Badge variant="outline" className="shrink-0 border-[#efe7e0] text-[10px] text-[#8B6F47]">
                  {h.score} pts · {h.decisionMs} ms
                </Badge>
              )}
              {h.escalated && (
                <Badge variant="outline" className="shrink-0 border-[#bc7155]/50 text-[10px] text-[#bc7155]">
                  escaladé
                </Badge>
              )}
              {/* Statut / actions */}
              {h.open ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline" className="border-[#bc7155]/40 bg-[#bc7155]/10 text-[10px] text-[#8B6F47]">
                    {h.outcome === 'accepted' ? 'en intervention' : 'à prendre'}
                  </Badge>
                  {h.outcome !== 'accepted' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-[11px] text-[#8B6F47] hover:bg-[#bc7155]/10"
                      disabled={actionEnCours === h.id}
                      onClick={() => actionTache(h.id, 'reassign')}
                    >
                      <RotateCcw className="h-3 w-3" /> Relancer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-2 text-[11px] text-[#bc7155] hover:bg-[#bc7155]/10"
                    disabled={actionEnCours === h.id}
                    onClick={() => actionTache(h.id, 'resolve')}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Résolu
                  </Button>
                </span>
              ) : (
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px]',
                    h.outcome === 'resolved'
                      ? 'border-[#bc7155]/30 bg-[#bc7155]/10 text-[#bc7155]'
                      : h.outcome === 'accepted'
                        ? 'border-[#bc7155]/40 text-[#8B6F47]'
                        : 'border-[#D8D2C6] text-[#8B6F47]',
                  )}
                >
                  {h.outcome === 'resolved' && h.resolutionTimeSec != null ? `résolu ${Math.round(h.resolutionTimeSec / 60)} min` : h.outcome}
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 📊 Heatmap */}
      <Card className="border-[#efe7e0] shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-[#2C2C2C]">
            <Crown className="h-4 w-4 text-[#bc7155]" /> Heatmap routage (dernière heure)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.stats.heatmap.length === 0 && (
            <p className="text-sm text-[#8B6F47]">Aucun incident routé dans la dernière heure.</p>
          )}
          {data.stats.heatmap.map((h) => (
            <div key={h.zone ?? 'null'} className="flex items-center gap-3 text-sm">
              <span className="w-44 shrink-0 text-[#2C2C2C]">
                {ZONE_EMOJI(h.zone)} {h.label}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F0EBE1]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#bc7155] to-[#8B6F47]"
                  style={{ width: `${(h.count / heatMax) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-semibold tabular-nums text-[#2C2C2C]">{h.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
