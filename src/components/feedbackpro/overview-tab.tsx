"use client"

// ============================================================
// FeedbackPro - Onglet "Tableau de bord" du dashboard Pro
// KPIs, graphique d'évolution 30j, derniers retours, alertes
// ============================================================

import { useEffect, useState } from "react"
import {
  Star,
  MessageSquare,
  TrendingUp,
  BellRing,
  Check,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Stars, formatRelative } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

type OverviewData = {
  scoreGlobal30j: number
  evolutionPct: number | null
  retoursMois: number
  tauxInterception: number
  alertesNonLues: number
  courbe30j: { date: string; score: number; retours: number }[]
  derniersRetours: {
    id: string
    note: number
    tags: string[]
    commentaire: string | null
    statut: string
    lu: boolean
    createdAt: string
    zone?: { nom: string } | null
  }[]
}

export function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null)
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aucune donnée disponible pour le moment.
        </CardContent>
      </Card>
    )
  }

  const score = data.scoreGlobal30j ?? 0
  const evolution = data.evolutionPct
  const scoreColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600"

  // Couleur de l'aire du graphique selon le score
  const couleurCourbe = score >= 80 ? "#16a34a" : score >= 60 ? "#f59e0b" : "#ef4444"

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1E1E2E]">Tableau de bord</h1>
        <p className="text-sm text-[#9A9AAE]">Vue d&apos;ensemble de votre qualité de service</p>
      </div>

      {/* KPI cards — palette FeedbackPro : vert (note), indigo (retours),
          blanc avec accent (taux), rose (alertes). Chaque carte colorée
          a un fond uni avec texte blanc ; la carte blanche garde les
          accents colorés (icône + chiffres). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Note moyenne — vert #4CC96B */}
        <div className="relative overflow-hidden rounded-2xl bg-[#4CC96B] p-5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-white/85 truncate">Score qualité (30j)</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">{score}/100</p>
              <p className={`flex items-center gap-1 text-xs mt-2 ${evolution != null ? (evolution >= 0 ? "text-white/90" : "text-white/90") : "text-white/80"}`}>
                {evolution != null
                  ? `${evolution > 0 ? "+" : ""}${evolution}% vs mois précédent`
                  : "Premier mois"}
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/20 p-2.5" aria-hidden>
              <Star className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        {/* Retours — indigo #5257C9 */}
        <div className="relative overflow-hidden rounded-2xl bg-[#5257C9] p-5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-white/85 truncate">Retours ce mois</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">{data.retoursMois}</p>
              <p className="text-xs text-white/80 mt-2">Retours collectés</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/20 p-2.5" aria-hidden>
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        {/* Taux d'interception — carte blanche avec accents colorés (vert) */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 text-[#1E1E2E] shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#4CC96B]/10" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-[#9A9AAE] truncate">Taux d'interception</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">{data.tauxInterception}%</p>
              <p className="flex items-center gap-1 text-xs mt-2 text-[#4CC96B]">
                <TrendingUp size={13} aria-hidden /> Réclamations interceptées
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-[#4CC96B]/10 p-2.5" aria-hidden>
              <Check className="h-5 w-5 text-[#4CC96B]" />
            </div>
          </div>
        </div>

        {/* Alertes non lues — rose #E0447E */}
        <div className="relative overflow-hidden rounded-2xl bg-[#E0447E] p-5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-white/85 truncate">Alertes non lues</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1.5">{data.alertesNonLues}</p>
              <p className="text-xs text-white/80 mt-2">{data.alertesNonLues > 0 ? "À traiter" : "Tout est à jour"}</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/20 p-2.5" aria-hidden>
              <BellRing className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Graphique d'évolution 30 jours */}
      <Card className="rounded-2xl border-none shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg text-[#1E1E2E]">Évolution du score (30 derniers jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            {data.courbe30j && data.courbe30j.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.courbe30j} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={couleurCourbe} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={couleurCourbe} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} stroke="#64748b" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" domain={[0, 100]} />
                  <Tooltip
                    formatter={(v) => [`${v}/100`, "Score"]}
                    labelStyle={{ color: "#1c1917", fontWeight: 600 }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                  />
                  <Area type="monotone" dataKey="score" stroke={couleurCourbe} strokeWidth={2.5} fill="url(#gradScore)" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Pas encore assez de données pour afficher l&apos;évolution
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Derniers retours */}
      <Card className="rounded-2xl border-none shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg text-[#1E1E2E]">Derniers retours clients</CardTitle>
        </CardHeader>
        <CardContent>
          {data.derniersRetours && data.derniersRetours.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {data.derniersRetours.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-2xl border border-border/60 p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="shrink-0 pt-0.5">
                    <Stars note={r.note} size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{r.note}/5</span>
                      {r.zone?.nom && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                          {r.zone.nom}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatRelative(r.createdAt)}</span>
                      {!r.lu && (
                        <Badge className="h-4 px-1 text-[9px] bg-blue-500 text-white border-0">Nouveau</Badge>
                      )}
                    </div>
                    {r.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.slice(0, 4).map((t) => (
                          <span key={t} className="text-[10px] text-muted-foreground">
                            {tagLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.commentaire && (
                      <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">
                        &ldquo;{r.commentaire}&rdquo;
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      r.statut === "RESOLVED"
                        ? "h-5 shrink-0 border-green-300 text-green-700"
                        : r.statut === "IN_PROGRESS"
                          ? "h-5 shrink-0 border-amber-300 text-amber-700"
                          : "h-5 shrink-0 border-blue-300 text-blue-700"
                    }
                  >
                    {STATUT_RETOUR_LABEL[r.statut as keyof typeof STATUT_RETOUR_LABEL] ?? r.statut}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun retour pour le moment. Vos premiers retours apparaîtront ici dès qu&apos;un client scannera un QR code.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Alerte si alertes non lues */}
      {data.alertesNonLues > 0 && (
        <Card className="rounded-2xl border-amber-300 bg-amber-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {data.alertesNonLues} alerte{data.alertesNonLues > 1 ? "s" : ""} non lue{data.alertesNonLues > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-amber-700">Consultez l&apos;onglet Coach IA pour les détails</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
