"use client"

// ============================================================
// FeedbackPro - Onglet "Vue d'ensemble" du dashboard Pro
// KPIs, mini graphique d'évolution, derniers retours, alertes
// ============================================================

import { useEffect, useState } from "react"
import {
  Star,
  MessageSquare,
  ShieldCheck,
  BellRing,
  RefreshCw,
  Check,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard, Stars, formatRelative } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts"

type Overview = {
  nomCommerce: string
  plan: string
  kpis: {
    scoreGlobal: number
    totalRetours: number
    retoursCeMois: number
    retoursMoisPrecedent: number
    scoreMois: number
    scoreMoisPrecedent: number
    tauxInterception: number
    retoursNonLus: number
    alertesNonLues: number
  }
  evolution: { date: string; note: number | null; count: number }[]
  repartitionNotes: { note: number; count: number }[]
  recentRetours: { id: string; note: number; tags: string[]; commentaire: string | null; statut: string; lu: boolean; createdAt: string }[]
  alertes: { id: string; titre: string; message: string; canal: string; lu: boolean; createdAt: string }[]
}

const NOTE_COLORS = ["#f43f5e", "#fb7185", "#f59e0b", "#22c55e", "#16a34a"]

export function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  async function load() {
    try {
      const res = await fetch("/api/pro/overview", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setData(json.data)
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les statistiques", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
     
  }, [])

  async function marquerAlertesLues() {
    await fetch("/api/pro/alertes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    load()
    toast({ title: "Alertes marquées comme lues" })
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!data) return <p className="text-muted-foreground">Aucune donnée disponible.</p>

  const k = data.kpis
  const deltaRetours = k.retoursCeMois - k.retoursMoisPrecedent
  const deltaScore = Number((k.scoreMois - k.scoreMoisPrecedent).toFixed(2))
  const evolutionData = data.evolution.map((e) => ({ ...e, note: e.note === 0 ? null : e.note }))

  return (
    <div className="space-y-6">
      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Star}
          label="Score global"
          value={k.scoreGlobal > 0 ? `${k.scoreGlobal.toFixed(1)} ★` : "—"}
          hint={deltaScore !== 0 ? `${deltaScore > 0 ? "+" : ""}${deltaScore} vs mois dernier` : "Stable vs mois dernier"}
          hintTone={deltaScore > 0 ? "up" : deltaScore < 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={MessageSquare}
          label="Retours ce mois"
          value={k.retoursCeMois}
          hint={deltaRetours !== 0 ? `${deltaRetours > 0 ? "+" : ""}${deltaRetours} vs mois dernier` : "Stable"}
          hintTone={deltaRetours > 0 ? "up" : deltaRetours < 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={ShieldCheck}
          label="Taux d'interception"
          value={`${k.tauxInterception}%`}
          hint="Réclamations traitées en interne"
          hintTone="neutral"
        />
        <StatCard
          icon={BellRing}
          label="Alertes non lues"
          value={k.alertesNonLues}
          hint={`${k.retoursNonLus} retours à traiter`}
          hintTone={k.alertesNonLues > 0 ? "down" : "up"}
        />
      </div>

      {/* ---------- Évolution + répartition ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Note moyenne — 30 derniers jours</CardTitle>
          </CardHeader>
          <CardContent className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => [v ? `${v} ★` : "—", "Note moyenne"]}
                  labelStyle={{ color: "#1c1917" }}
                />
                <Line type="monotone" dataKey="note" stroke="#2563eb" strokeWidth={2.5} dot={false} connectNulls activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Répartition des notes</CardTitle>
          </CardHeader>
          <CardContent className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.repartitionNotes.map((r) => ({ ...r, label: `${r.note}★` }))} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} retours`, "Nombre"]} labelStyle={{ color: "#1c1917" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {data.repartitionNotes.map((entry, i) => (
                    <Cell key={i} fill={NOTE_COLORS[entry.note - 1]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Derniers retours + alertes ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Derniers retours</CardTitle>
            <Button variant="ghost" size="sm" onClick={load} aria-label="Rafraîchir">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {data.recentRetours.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Aucun retour pour l&apos;instant — partagez votre QR code pour lancer la collecte !
              </p>
            )}
            {data.recentRetours.map((r) => (
              <div key={r.id} className="rounded-xl border p-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Stars note={r.note} />
                    {!r.lu && (
                      <Badge className="h-5 px-1.5 text-[10px]" aria-label="Non lu">
                        Nouveau
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatRelative(r.createdAt)}</span>
                </div>
                {r.tags.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{r.tags.map(tagLabel).join(" · ")}</p>
                )}
                {r.commentaire && <p className="mt-1.5 text-sm">&ldquo;{r.commentaire}&rdquo;</p>}
                <p className="mt-1.5 text-xs">
                  <span
                    className={
                      r.statut === "RESOLVED"
                        ? "text-green-600"
                        : r.statut === "IN_PROGRESS"
                          ? "text-amber-600"
                          : "text-stone-500"
                    }
                  >
                    {STATUT_RETOUR_LABEL[r.statut]}
                  </span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <BellRing className="h-4.5 w-4.5 text-rose-500" aria-hidden />
              Alertes récentes
            </CardTitle>
            {k.alertesNonLues > 0 && (
              <Button variant="outline" size="sm" onClick={marquerAlertesLues} className="h-8">
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                Tout marquer lu
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {data.alertes.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucune alerte — votre réputation est tranquille 😌</p>
            )}
            {data.alertes.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border p-3.5 ${!a.lu ? "border-rose-200 bg-rose-50/60" : "opacity-75"}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium">{a.titre}</p>
                  {!a.lu && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">SMS</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.message}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {formatRelative(a.createdAt)} · canal : {a.canal === "SMS" ? "SMS + dashboard" : "dashboard"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
