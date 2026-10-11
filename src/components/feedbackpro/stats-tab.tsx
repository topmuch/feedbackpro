"use client"

// ============================================================
// FeedbackPro - Onglet "Statistiques" du dashboard Pro
// Évolution, catégories, répartition, heatmap horaire, export CSV
// ============================================================

import { useEffect, useState } from "react"
import { Download, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { generateStatsReportPdf } from "@/lib/pdf"
import { useAppStore } from "@/store/app-store"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts"

type Stats = {
  jours: number
  evolution: { date: string; note: number | null; count: number }[]
  categories: { categorie: string; count: number }[]
  repartitionNotes: { note: string; count: number }[]
  heatmap: { jour: string; creneau: string; total: number; alertes: number }[]
  total: number
  noteMoyenne: number
}

const CAT_COLORS = ["#2563eb", "#f59e0b", "#0891b2", "#e11d48"]
const CRENEAUX = ["6h-10h", "10h-14h", "14h-18h", "18h-22h", "22h-6h"]

export function StatsTab() {
  const [periode, setPeriode] = useState(30)
  const [data, setData] = useState<Stats | null>(null)
  const [loadedPeriode, setLoadedPeriode] = useState(0)
  const nomCommerce = useAppStore((s) => s.session?.pro?.nomCommerce)
  const { toast } = useToast()

  // La période chargée sert d'indicateur de chargement (pas de setState synchrone dans l'effet)
  const loading = loadedPeriode !== periode

  useEffect(() => {
    if (loadedPeriode === periode) return
    let cancelled = false
    fetch(`/api/pro/stats?jours=${periode}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.ok) {
          setData(j.data)
          setLoadedPeriode(periode)
        } else {
          toast({ title: "Erreur", description: "Impossible de charger les statistiques", variant: "destructive" })
          setLoadedPeriode(periode)
        }
      })
      .catch(() => {
        if (cancelled) return
        toast({ title: "Erreur", description: "Impossible de charger les statistiques", variant: "destructive" })
        setLoadedPeriode(periode)
      })
    return () => {
      cancelled = true
    }
  }, [periode, loadedPeriode, toast])

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const evolutionData = data.evolution.map((e) => ({ ...e, note: e.note === 0 ? null : e.note }))

  // Intensité de la heatmap (0 → 1) basée sur le nombre d'alertes
  const maxAlertes = Math.max(1, ...data.heatmap.map((c) => c.alertes))
  function heatClass(alertes: number): string {
    if (alertes === 0) return "bg-stone-100 text-stone-400"
    const ratio = alertes / maxAlertes
    if (ratio > 0.66) return "bg-rose-500 text-white"
    if (ratio > 0.33) return "bg-rose-300 text-rose-950"
    return "bg-rose-100 text-rose-900"
  }

  return (
    <div className="space-y-6">
      {/* ---------- En-tête : période + export ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Période">
          {[30, 60, 90].map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={periode === p}
              onClick={() => setPeriode(p)}
              className={`h-9 rounded-lg px-3.5 text-sm font-medium transition-colors ${
                periode === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p} jours
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => generateStatsReportPdf(data, nomCommerce || "Mon commerce")}
          >
            <FileText className="mr-1.5 h-4 w-4" aria-hidden />
            Exporter PDF
          </Button>
          <a href="/api/pro/retours/export" download>
            <Button variant="outline" size="sm" className="h-9">
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={() => <span className="text-lg">⭐</span>} label={`Note moyenne (${data.jours}j)`} value={data.noteMoyenne ? data.noteMoyenne.toFixed(2) : "—"} />
        <StatCard icon={() => <span className="text-lg">💬</span>} label={`Retours sur la période`} value={data.total} />
        <StatCard icon={() => <span className="text-lg">🚨</span>} label="Alertes (note ≤ 2)" value={data.heatmap.reduce((s, c) => s + c.alertes, 0)} />
      </div>

      {/* ---------- Évolution ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Évolution des notes</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolutionData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(data.jours / 8)} tickLine={false} axisLine={false} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => [v ? `${v} ★` : "—", "Note moyenne"]} labelStyle={{ color: "#1c1917" }} />
              <Line type="monotone" dataKey="note" stroke="#2563eb" strokeWidth={2.5} dot={false} connectNulls activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---------- Catégories (camembert) ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Répartition par catégorie</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.categories.every((c) => c.count === 0) ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucun tag sur la période</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.categories.filter((c) => c.count > 0)} dataKey="count" nameKey="categorie" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {data.categories.filter((c) => c.count > 0).map((_, i) => (
                      <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} mentions`, ""]} labelStyle={{ color: "#1c1917" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ---------- Répartition des notes ---------- */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Répartition des notes</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.repartitionNotes} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                <XAxis dataKey="note" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} retours`, "Nombre"]} labelStyle={{ color: "#1c1917" }} />
                <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Heatmap horaire ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Heatmap horaire des réclamations</CardTitle>
          <p className="text-sm text-muted-foreground">
            Repérez les créneaux où votre équipe est la plus fragilisée (intensité = alertes note ≤ 2)
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[560px] border-separate border-spacing-1" aria-label="Heatmap des alertes par jour et créneau">
            <thead>
              <tr>
                <th className="w-16 text-left text-xs font-medium text-muted-foreground" scope="col">
                  Créneau
                </th>
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((j) => (
                  <th key={j} scope="col" className="text-center text-xs font-medium text-muted-foreground pb-1">
                    {j}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRENEAUX.map((creneau) => (
                <tr key={creneau}>
                  <th scope="row" className="text-left text-xs font-medium text-muted-foreground pr-2 whitespace-nowrap">
                    {creneau}
                  </th>
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((jour) => {
                    const cell = data.heatmap.find((c) => c.jour === jour && c.creneau === creneau)
                    return (
                      <td key={jour} className="p-0">
                        <div
                          className={`flex h-11 items-center justify-center rounded-lg text-xs font-semibold transition-transform hover:scale-105 ${heatClass(cell?.alertes ?? 0)}`}
                          title={`${jour} ${creneau} : ${cell?.total ?? 0} retours dont ${cell?.alertes ?? 0} alerte(s)`}
                        >
                          {cell?.alertes ?? 0}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
