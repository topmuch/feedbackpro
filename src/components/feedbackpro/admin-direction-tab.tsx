"use client"

// ============================================================
// Task F3 — Dashboard Direction (C-Level) — composant premium
// ------------------------------------------------------------
// Tableau de bord exécutif pour le directeur d'aéroport :
//   - 4 KPI cards : Satisfaction, SLA, Revenue, Avg Resolution
//   - Tendance hebdomadaire (7 barres CSS — nouveaux + résolus)
//   - Top 3 performers (gamification staff)
//   - Classement de risque par zone (top 8 zones à surveiller)
//   - Bouton "Export PDF" → génère un rapport HTML imprimable
//
// Contrat :
//   GET /api/airport/direction-dashboard → KPI agrégés
//
// Style : V2.0 — cartes blanches, coins arrondis, palette bleu
// aéroport (#000d10) + jaune (#bc7155). Aucun détail ops individuel
// (pas d'ID signalement, pas de commentaire voyageur).
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Users,
  Smile,
  TrendingUp,
  Clock,
  Target,
  DollarSign,
  Trophy,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Download,
  Plane,
  ShieldCheck,
  Activity,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { LiveScoreWidget } from "@/components/feedbackpro/live-score-widget"

// ---------- Types (mirroir API) ----------

type DirectionData = {
  generatedAt: string
  passengers: {
    totalServed: number
    estimation: string
    activeFlights: number
    avgPaxPerFlight: number
  }
  satisfaction: { rate: number; sampleSize: number; period: string }
  nps: { score: number; responses: number; period: string; source: string }
  resolution: { "24h": number | null; "7d": number | null; "30d": number | null }
  sla: { complianceRate: number; sampleSize: number; period: string }
  adRevenue: { monthToDate: number; currency: string; activeCampaigns: number }
  topPerformers: {
    rank: number
    staffName: string
    points: number
    resolutions: number
    avgMinutes: number
  }[]
  trends: {
    weekly: { current: number; previous: number; deltaPct: number }
    monthly: { current: number; previous: number; deltaPct: number }
  }
  weeklyBars: { day: string; date: string; count: number; resolved: number }[]
  zoneRiskRanking: {
    code: string
    nom: string
    emoji: string
    incidents30d: number
    enAttente: number
    enCours: number
    resolus30d: number
    avgMinutes: number | null
    riskScore: number
    riskLevel: "low" | "medium" | "high" | "critical" | "unknown"
  }[]
  activeZones: number
}

// ---------- Couleurs palette V2.0 ----------
const NAVY = "#000d10"
const GOLD = "#bc7155"
const NAVY_SOFT = "bg-[#000d10]"
const GOLD_SOFT = "bg-[#bc7155]"
const RISK_STYLES: Record<string, { label: string; className: string }> = {
  low: { label: "Faible", className: "bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]" },
  medium: { label: "Modéré", className: "bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]" },
  high: { label: "Élevé", className: "bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]" },
  critical: { label: "Critique", className: "bg-rose-50 text-rose-700 border-rose-200" },
  unknown: { label: "N/A", className: "bg-slate-100 text-slate-600 border-slate-200" },
}

// ============================================================
// Composant exporté
// ============================================================

export function AdminDirectionTab() {
  const { toast } = useToast()
  const [data, setData] = useState<DirectionData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/airport/direction-dashboard", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setData(json.data as DirectionData)
      } else {
        toast({
          title: "Erreur",
          description: json.error ?? "Impossible de charger le dashboard direction",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Impossible de joindre le serveur",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  // ---------- Export PDF (HTML imprimable) ----------
  const handleExportPdf = () => {
    if (!data) return
    const html = buildExportHtml(data)
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700")
    if (!w) {
      toast({
        title: "Pop-up bloqué",
        description: "Autorisez les pop-ups pour exporter le rapport",
        variant: "destructive",
      })
      return
    }
    w.document.write(html)
    w.document.close()
    // Laisse le temps au DOM de se peupler avant d'imprimer
    setTimeout(() => {
      try {
        w.focus()
        w.print()
      } catch {
        /* ignore */
      }
    }, 350)
  }

  // ---------- Rendu ----------

  if (loading && !data) {
    return <DirectionSkeleton />
  }
  if (!data) {
    return (
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-12 text-center text-sm text-slate-500">
          Aucune donnée disponible pour le moment.
        </CardContent>
      </Card>
    )
  }

  const maxBarValue = Math.max(...data.weeklyBars.map((b) => Math.max(b.count, b.resolved)), 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Plane className="size-5" style={{ color: NAVY }} />
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Dashboard Direction
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Vue exécutive agrégée — {new Date(data.generatedAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Rafraîchir
          </Button>
          <Button size="sm" onClick={handleExportPdf} className="gap-2 bg-[#000d10] hover:bg-[#002277]">
            <Download className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Live Score — hero temps réel (WAHOO-2) */}
      <LiveScoreWidget />

      {/* 4 Big KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BigKpi
          icon={Smile}
          label="Satisfaction"
          value={`${data.satisfaction.rate}%`}
          hint={`${data.nps.responses} réponse(s) NPS — ${data.satisfaction.period}`}
          accent="navy"
        />
        <BigKpi
          icon={Target}
          label="Conformité SLA"
          value={`${data.sla.complianceRate}%`}
          hint={`${data.sla.sampleSize} résolutions — ${data.sla.period}`}
          accent="gold"
        />
        <BigKpi
          icon={DollarSign}
          label="Revenu pub (MTD)"
          value={formatFcfa(data.adRevenue.monthToDate)}
          hint={`${data.adRevenue.activeCampaigns} campagne(s) active(s) — ${data.adRevenue.currency}`}
          accent="navy"
        />
        <BigKpi
          icon={Clock}
          label="Résolution moyenne"
          value={`${data.resolution["7d"] ?? 0} min`}
          hint={`24h : ${data.resolution["24h"] ?? "—"} min · 30j : ${data.resolution["30d"] ?? "—"} min`}
          accent="gold"
        />
      </div>

      {/* Passagers + Tendances */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${NAVY}15` }}>
              <Users className="size-6" style={{ color: NAVY }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Passagers servis (estimation 24h)
              </p>
              <p className="text-2xl font-bold leading-tight text-slate-900">
                {data.passengers.totalServed.toLocaleString("fr-FR")}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {data.passengers.activeFlights} vol(s) actif(s) · ~{data.passengers.avgPaxPerFlight} pax/vol
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                NPS aéroport (30j)
              </p>
              <Activity className="size-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold leading-tight ${
                  data.nps.score >= 0 ? "text-[#a05f45]" : "text-rose-600"
                }`}
              >
                {data.nps.score > 0 ? "+" : ""}
                {data.nps.score}
              </span>
              <span className="text-xs text-slate-400">
                / {data.nps.responses} réponse(s)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Source : {data.nps.source === "retours_app" ? "retours app in-app" : data.nps.source}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tendance incidents
              </p>
              <TrendingUp className="size-4 text-slate-400" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <TrendPill label="vs sem. dern." delta={data.trends.weekly.deltaPct} current={data.trends.weekly.current} />
              <TrendPill label="vs mois dern." delta={data.trends.monthly.deltaPct} current={data.trends.monthly.current} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly trend bar chart */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" style={{ color: NAVY }} />
            Tendance hebdomadaire
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Nouveaux vs résolus sur les 7 derniers jours
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-end justify-between gap-2 sm:gap-4" style={{ height: 200 }}>
            {data.weeklyBars.map((b, i) => {
              const newH = Math.max(2, (b.count / maxBarValue) * 160)
              const resH = Math.max(2, (b.resolved / maxBarValue) * 160)
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full items-end justify-center gap-1" style={{ height: 160 }}>
                    <div
                      className="w-1/2 max-w-[24px] rounded-t-md transition-all"
                      style={{ height: newH, backgroundColor: NAVY }}
                      title={`${b.count} nouveaux`}
                    />
                    <div
                      className="w-1/2 max-w-[24px] rounded-t-md transition-all"
                      style={{ height: resH, backgroundColor: GOLD }}
                      title={`${b.resolved} résolus`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase text-slate-700">{b.day}</p>
                    <p className="text-[10px] text-slate-400">{b.date}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: NAVY }} />
              Nouveaux
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: GOLD }} />
              Résolus
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top 3 performers */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4" style={{ color: GOLD }} />
              Top 3 performers
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Classement mensuel — gamification staff
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.topPerformers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <Trophy className="size-8 text-slate-300" />
                <p className="text-sm text-slate-500">Aucun score enregistré ce mois</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.topPerformers.map((p) => (
                  <li key={p.rank} className="flex items-center gap-4 px-5 py-4">
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        p.rank === 1
                          ? "bg-[#f3ddd2] text-[#8a4f3b]"
                          : p.rank === 2
                          ? "bg-slate-100 text-slate-700"
                          : "bg-[#f3ddd2] text-[#8a4f3b]"
                      }`}
                    >
                      #{p.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.staffName}</p>
                      <p className="text-xs text-slate-500">
                        {p.resolutions} résolution(s) · moy {p.avgMinutes} min
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold" style={{ color: NAVY }}>
                        {p.points}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">pts</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Zone risk ranking */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-[#bc7155]" />
              Zone risk ranking
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {data.activeZones} zone(s) active(s) — top 8 à surveiller / investir
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.zoneRiskRanking.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <ShieldCheck className="size-8 text-[#dba28a]" />
                <p className="text-sm text-slate-500">Aucune zone à risque — situation calme</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur">
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Zone</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-center">Inc.</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-center">Att.</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-center">Moy</TableHead>
                      <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right">Risque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.zoneRiskRanking.map((z) => {
                      const risk = RISK_STYLES[z.riskLevel] ?? RISK_STYLES.unknown
                      return (
                        <TableRow key={z.code} className="border-slate-100">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-base">{z.emoji}</span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-slate-800">{z.nom}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{z.code}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-xs font-semibold text-slate-700">
                            {z.incidents30d}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {z.enAttente > 0 ? (
                              <span className="font-bold text-rose-600">{z.enAttente}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-xs text-slate-600">
                            {z.avgMinutes !== null ? `${z.avgMinutes}m` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={`text-[10px] ${risk.className}`}>
                              {risk.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composants
// ============================================================

function BigKpi({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  hint?: string
  accent: "navy" | "gold"
}) {
  const accentColor = accent === "navy" ? NAVY : GOLD
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold leading-tight text-slate-900">{value}</p>
            {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
          </div>
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accentColor}18` }}
          >
            <Icon className="size-5" style={{ color: accentColor }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TrendPill({ label, delta, current }: { label: string; delta: number; current: number }) {
  const positive = delta > 0
  const neutral = delta === 0
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-base font-bold text-slate-900">{current}</span>
        <span
          className={`text-xs font-semibold ${
            neutral ? "text-slate-500" : positive ? "text-rose-600" : "text-[#a05f45]"
          }`}
        >
          {neutral ? "±0%" : `${positive ? "+" : ""}${delta}%`}
        </span>
      </div>
    </div>
  )
}

function DirectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

// ============================================================
// Export PDF — génère un rapport HTML imprimable
// ============================================================

function formatFcfa(n: number): string {
  if (n === 0) return "0"
  return `${n.toLocaleString("fr-FR")} FCFA`
}

function buildExportHtml(d: DirectionData): string {
  const generated = new Date(d.generatedAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })
  const barsHtml = d.weeklyBars
    .map((b) => {
      const max = Math.max(...d.weeklyBars.map((x) => Math.max(x.count, x.resolved)), 1)
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${b.day} ${b.date}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${b.count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${b.resolved}</td></tr>`
    })
    .join("")
  const topHtml = d.topPerformers
    .map(
      (p) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">#${p.rank} ${p.staffName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${p.points}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${p.resolutions}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${p.avgMinutes} min</td></tr>`,
    )
    .join("")
  const zonesHtml = d.zoneRiskRanking
    .map(
      (z) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${z.emoji} ${z.nom}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${z.incidents30d}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${z.enAttente}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${z.avgMinutes ?? "—"} min</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;text-transform:uppercase;font-weight:700;">${z.riskLevel}</td></tr>`,
    )
    .join("")

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
<title>Rapport Direction — Aéroport</title>
<style>
@page { margin: 18mm 14mm; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; }
h1 { color: #000d10; font-size: 22px; margin: 0 0 4px 0; }
h2 { color: #000d10; font-size: 15px; margin: 24px 0 8px 0; border-bottom: 2px solid #bc7155; padding-bottom: 4px; }
.meta { color: #64748b; font-size: 11px; margin-bottom: 16px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
.kpi { border: 1px solid #e2e8f0; border-top: 3px solid #000d10; border-radius: 8px; padding: 14px; }
.kpi.gold { border-top-color: #bc7155; }
.kpi .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.05em; }
.kpi .value { font-size: 22px; font-weight: 700; color: #0f0f1c; margin-top: 4px; }
.kpi .hint { font-size: 10px; color: #94a3b8; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { background: #f8fafc; padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 10px; }
</style></head><body>
<h1>✈️ Rapport Direction — Aéroport</h1>
<div class="meta">Généré le ${generated}</div>

<h2>Indicateurs clés (C-Level)</h2>
<div class="kpis">
  <div class="kpi"><div class="label">Satisfaction</div><div class="value">${d.satisfaction.rate}%</div><div class="hint">${d.nps.responses} réponse(s) NPS</div></div>
  <div class="kpi gold"><div class="label">Conformité SLA</div><div class="value">${d.sla.complianceRate}%</div><div class="hint">${d.sla.sampleSize} résolutions — ${d.sla.period}</div></div>
  <div class="kpi"><div class="label">Revenu pub (MTD)</div><div class="value">${formatFcfa(d.adRevenue.monthToDate)}</div><div class="hint">${d.adRevenue.activeCampaigns} campagne(s)</div></div>
  <div class="kpi gold"><div class="label">Résolution moy.</div><div class="value">${d.resolution["7d"] ?? 0} min</div><div class="hint">24h : ${d.resolution["24h"] ?? "—"} · 30j : ${d.resolution["30d"] ?? "—"}</div></div>
</div>

<p><strong>Passagers servis (estimation) :</strong> ${d.passengers.totalServed.toLocaleString("fr-FR")} — ${d.passengers.activeFlights} vol(s) actif(s)</p>
<p><strong>NPS aéroport :</strong> ${d.nps.score > 0 ? "+" : ""}${d.nps.score} (${d.nps.responses} réponses)</p>
<p><strong>Tendance incidents :</strong> vs semaine dernière ${d.trends.weekly.deltaPct >= 0 ? "+" : ""}${d.trends.weekly.deltaPct}% (${d.trends.weekly.current}) · vs mois dernier ${d.trends.monthly.deltaPct >= 0 ? "+" : ""}${d.trends.monthly.deltaPct}% (${d.trends.monthly.current})</p>

<h2>Tendance hebdomadaire (7 jours)</h2>
<table><thead><tr><th>Jour</th><th style="text-align:center;">Nouveaux</th><th style="text-align:center;">Résolus</th></tr></thead>
<tbody>${barsHtml}</tbody></table>

<h2>Top 3 performers</h2>
<table><thead><tr><th>Agent</th><th style="text-align:center;">Points</th><th style="text-align:center;">Résolutions</th><th style="text-align:center;">Temps moy.</th></tr></thead>
<tbody>${topHtml || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8;">Aucun score ce mois</td></tr>'}</tbody></table>

<h2>Classement de risque par zone</h2>
<table><thead><tr><th>Zone</th><th style="text-align:center;">Incidents 30j</th><th style="text-align:center;">En attente</th><th style="text-align:center;">Temps moy.</th><th style="text-align:center;">Risque</th></tr></thead>
<tbody>${zonesHtml || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8;">Aucune zone à risque</td></tr>'}</tbody></table>

<div class="footer">Rapport généré automatiquement par FeedVoice — Dashboard Direction</div>
</body></html>`
}
