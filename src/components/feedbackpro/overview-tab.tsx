"use client"

// ============================================================
// FeedVoice - Onglet "Tableau de bord" du dashboard Pro
// ------------------------------------------------------------
// V3 PREMIUM — refonte « Luxe Silencieux » :
//   · Titres en Playfair Display (serif élégant) + filet champagne #bc7155
//   · KPI cartes premium : dégradés doux, médaillons d'icônes or
//   · Tableau « Derniers retours » refait : en-tête champagne sur fond
//     noir chaud, lignes aérées, badges arrondis, score en médaillon
//   · Courbe 30 j : carte premium avec en-tête serif
// Palette : #ffffff (fond), #bc7155 (or champagne), #0f0f1c (charbon),
//           vert #bc7155 (succès), terracotta #bc7155 (alerte douce)
// Task 1-c : libellés principaux traduits via useDashboardI18n()
// (fr / en / es) — chaînes composées conservées avec interpolation.
// ============================================================

import { useEffect, useState } from "react"
import {
  Star,
  MessageSquare,
  TrendingUp,
  BellRing,
  Check,
  AlertTriangle,
  Inbox,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Stars, formatRelative } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { tagLabel } from "@/lib/constants"
import { useDashboardI18n } from "@/lib/i18n-dashboard"
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

/** Serif premium pour les titres de cartes (Playfair Display chargé en runtime). */
const SERIF: React.CSSProperties = { fontFamily: '"Playfair Display", Georgia, serif' }

const GOLD = "#bc7155"
const CHARBON = "#0f0f1c"

export function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  // Task 1-c — i18n réelle du dashboard Pro (fr / en / es).
  const { t } = useDashboardI18n()

  // Libellé lisible d'un statut de retour (remplace STATUT_RETOUR_LABEL, FR only).
  const labelStatut = (statut: string): string =>
    statut === "RESOLVED"
      ? t("common.statutResolu")
      : statut === "IN_PROGRESS"
        ? t("common.statutEnCours")
        : statut === "NEW"
          ? t("common.statutNouveau")
          : statut

  async function load() {
    try {
      const res = await fetch("/api/pro/overview", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setData(json.data)
    } catch {
      toast({ title: t("common.erreur"), description: t("overview.erreurChargement"), variant: "destructive" })
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
            <Skeleton key={i} className="h-28 rounded-none" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-none" />
        <Skeleton className="h-48 rounded-none" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="rounded-none">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("overview.aucuneDonnee")}
        </CardContent>
      </Card>
    )
  }

  const score = data.scoreGlobal30j ?? 0
  const evolution = data.evolutionPct

  // Couleur de l'aire du graphique selon le score
  const couleurCourbe = score >= 80 ? "#bc7155" : score >= 60 ? GOLD : "#C0392B"

  return (
    <div className="space-y-7">
      {/* ---------- En-tête premium ---------- */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]" style={{ ...SERIF, color: CHARBON }}>
          {t("overview.titre")}
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="h-px w-10" style={{ backgroundColor: GOLD }} aria-hidden />
          <p className="text-sm text-muted-foreground">
            {t("overview.sousTitre")}
          </p>
        </div>
      </div>

      {/* ---------- KPI cartes premium ---------- */}
      {/* Les 4 métriques clés : chaque carte garde sa couleur signal mais
          gagne un médaillon d'icône or, un grain dégradé doux et un filet. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Score qualité — vert sauge */}
        <div
          className="relative overflow-hidden rounded-2xl border border-black/5 p-5 text-white shadow-[0_14px_34px_rgba(26,26,26,0.14)] sm:p-6"
          style={{ background: "linear-gradient(145deg, #bc7155 0%, #3B6648 100%)" }}
        >
          <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full bg-white/10" aria-hidden />
          <div className="absolute right-4 top-4 h-14 w-14 rounded-full border border-white/15" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-white/75">{t("overview.scoreQualite")}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight">{score}<span className="text-base font-medium text-white/70">/100</span></p>
              <p className="mt-2 flex items-center gap-1 text-xs text-white/85">
                {evolution != null ? (
                  <>
                    <TrendingUp size={13} aria-hidden />
                    {t("overview.vsMoisPrecedent", { pct: `${evolution > 0 ? "+" : ""}${evolution}%` })}
                  </>
                ) : (
                  t("overview.premierMois")
                )}
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border border-white/25 bg-white/15 p-2.5" aria-hidden>
              <Star className="h-5 w-5" style={{ color: "#F3E3BC" }} />
            </div>
          </div>
        </div>

        {/* Retours — noir charbon + or (signature Luxe Silencieux) */}
        <div
          className="relative overflow-hidden rounded-2xl border border-black/5 p-5 text-white shadow-[0_14px_34px_rgba(26,26,26,0.22)] sm:p-6"
          style={{ background: "linear-gradient(145deg, #26221B 0%, #14110C 100%)" }}
        >
          <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full" style={{ backgroundColor: "rgba(201,169,97,0.12)" }} aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em]" style={{ color: "rgba(201,169,97,0.85)" }}>{t("overview.retoursMois")}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight">{data.retoursMois}</p>
              <p className="mt-2 text-xs text-white/60">{t("overview.retoursMoisAide")}</p>
            </div>
            <div className="shrink-0 rounded-2xl border p-2.5" style={{ borderColor: "rgba(201,169,97,0.4)", backgroundColor: "rgba(201,169,97,0.12)" }} aria-hidden>
              <MessageSquare className="h-5 w-5" style={{ color: GOLD }} />
            </div>
          </div>
        </div>

        {/* Taux d'interception — ivoire premium avec accents vert */}
        <div
          className="relative overflow-hidden rounded-2xl border p-5 shadow-[0_14px_34px_rgba(26,26,26,0.08)] sm:p-6"
          style={{ background: "linear-gradient(150deg, #FFFDF8 0%, #faf1ec 100%)", borderColor: "rgba(201,169,97,0.35)" }}
        >
          <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full" style={{ backgroundColor: "rgba(74,124,89,0.08)" }} aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-[#8A7B5C]">{t("overview.tauxInterception")}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight" style={{ color: CHARBON }}>{data.tauxInterception}%</p>
              <p className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: "#bc7155" }}>
                <Check size={13} aria-hidden /> {t("overview.reclamationsInterceptees")}
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border p-2.5" style={{ borderColor: "rgba(74,124,89,0.3)", backgroundColor: "rgba(74,124,89,0.1)" }} aria-hidden>
              <TrendingUp className="h-5 w-5" style={{ color: "#bc7155" }} />
            </div>
          </div>
        </div>

        {/* Alertes — terracotta doux */}
        <div
          className="relative overflow-hidden rounded-2xl border border-black/5 p-5 text-white shadow-[0_14px_34px_rgba(201,123,99,0.25)] sm:p-6"
          style={{ background: "linear-gradient(145deg, #bc7155 0%, #A85E48 100%)" }}
        >
          <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-white/80">{t("overview.alertesNonLues")}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight">{data.alertesNonLues}</p>
              <p className="mt-2 text-xs text-white/80">{data.alertesNonLues > 0 ? t("overview.aTraiterRapidement") : t("overview.toutAJour")}</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-white/25 bg-white/15 p-2.5" aria-hidden>
              <BellRing className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Courbe 30 jours — carte premium ---------- */}
      <Card
        className="rounded-2xl border shadow-[0_14px_34px_rgba(26,26,26,0.08)]"
        style={{ borderColor: "rgba(201,169,97,0.3)", background: "#FFFDF8" }}
      >
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-8 w-1 rounded-full" style={{ backgroundColor: GOLD }} aria-hidden />
            <div>
              <h2 className="text-base font-semibold sm:text-lg" style={{ ...SERIF, color: CHARBON }}>
                {t("overview.evolutionScore")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("overview.evolutionScoreAide")}</p>
            </div>
          </div>
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(201,169,97,0.18)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} stroke="#9A8F78" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9A8F78" domain={[0, 100]} />
                  <Tooltip
                    formatter={(v) => [`${v}/100`, t("overview.scoreTooltip")]}
                    labelStyle={{ color: CHARBON, fontWeight: 600 }}
                    contentStyle={{ borderRadius: 14, border: `1px solid rgba(201,169,97,0.4)`, fontSize: 13, background: "#FFFDF8" }}
                  />
                  <Area type="monotone" dataKey="score" stroke={couleurCourbe} strokeWidth={2.5} fill="url(#gradScore)" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("overview.pasAssezDonnees")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Derniers retours — TABLEAU PREMIUM ---------- */}
      <Card
        className="rounded-2xl border shadow-[0_14px_34px_rgba(26,26,26,0.08)]"
        style={{ borderColor: "rgba(201,169,97,0.3)", background: "#FFFDF8" }}
      >
        <CardContent className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-8 w-1 rounded-full" style={{ backgroundColor: GOLD }} aria-hidden />
              <div>
                <h2 className="text-base font-semibold sm:text-lg" style={{ ...SERIF, color: CHARBON }}>
                  {t("overview.derniersRetours")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("overview.derniersRetoursAide", { n: Math.min(data.derniersRetours?.length ?? 0, 20) })}</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="gap-1 border-[rgba(201,169,97,0.5)] px-3 py-1 text-[11px] font-semibold"
              style={{ color: "#8A7B5C" }}
            >
              <Inbox className="h-3 w-3" aria-hidden />
              {t("overview.ceMoisBadge", { n: data.retoursMois })}
            </Badge>
          </div>

          {data.derniersRetours && data.derniersRetours.length > 0 ? (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "rgba(201,169,97,0.25)" }}>
              {/* En-tête : bandeau noir charbon + lettrage champagne */}
              <div
                className="flex items-center gap-3 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.16em]"
                style={{ background: "linear-gradient(135deg, #26221B 0%, #14110C 100%)", color: "rgba(201,169,97,0.9)" }}
              >
                <span className="w-14 shrink-0">{t("overview.colNote")}</span>
                <span className="w-28 shrink-0 sm:w-36">{t("overview.colZone")}</span>
                <span className="min-w-0 flex-1">{t("overview.colCommentaire")}</span>
                <span className="hidden w-24 shrink-0 md:block">{t("overview.colStatut")}</span>
                <span className="hidden w-24 shrink-0 text-right sm:block">{t("overview.colDate")}</span>
              </div>
              {/* Lignes — aérées, hover ivoire, score en médaillon */}
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {data.derniersRetours.map((r, idx) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgba(201,169,97,0.06)]"
                    style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(201,169,97,0.16)" }}
                  >
                    {/* Note — médaillon coloré */}
                    <span
                      className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-xl border"
                      aria-label={t("overview.noteSur", { note: r.note })}
                      style={{
                        borderColor:
                          r.note >= 4 ? "rgba(74,124,89,0.4)" : r.note >= 3 ? "rgba(201,169,97,0.5)" : "rgba(192,57,43,0.4)",
                        backgroundColor:
                          r.note >= 4 ? "rgba(74,124,89,0.08)" : r.note >= 3 ? "rgba(201,169,97,0.1)" : "rgba(192,57,43,0.08)",
                      }}
                    >
                      <span
                        className="text-sm font-bold leading-none"
                        style={{ color: r.note >= 4 ? "#bc7155" : r.note >= 3 ? "#8A7B5C" : "#C0392B" }}
                      >
                        {r.note}
                      </span>
                      <span className="mt-0.5 scale-[0.8]">
                        <Stars note={r.note} size={8} />
                      </span>
                    </span>

                    {/* Zone */}
                    <span className="w-28 shrink-0 truncate text-[13px] font-medium sm:w-36" style={{ color: CHARBON }}>
                      {r.zone?.nom ?? "—"}
                    </span>

                    {/* Commentaire + tags */}
                    <span className="min-w-0 flex-1">
                      {r.commentaire ? (
                        <span className="block truncate text-[13px] italic text-[#57534E]">
                          &ldquo;{r.commentaire}&rdquo;
                        </span>
                      ) : (
                        <span className="block truncate text-[13px] text-muted-foreground/60">—</span>
                      )}
                      {r.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {r.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium"
                              style={{ borderColor: "rgba(201,169,97,0.35)", color: "#8A7B5C", backgroundColor: "rgba(201,169,97,0.06)" }}
                            >
                              {tagLabel(tag)}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>

                    {/* Statut */}
                    <span className="hidden w-24 shrink-0 md:block">
                      <Badge
                        variant="outline"
                        className={
                          r.statut === "RESOLVED"
                            ? "h-6 border-[rgba(74,124,89,0.45)] bg-[rgba(74,124,89,0.08)] text-[#3B6648]"
                            : r.statut === "IN_PROGRESS"
                              ? "h-6 border-[rgba(201,169,97,0.5)] bg-[rgba(201,169,97,0.1)] text-[#8A7B5C]"
                              : "h-6 border-[rgba(201,123,99,0.5)] bg-[rgba(201,123,99,0.08)] text-[#A85E48]"
                        }
                      >
                        {labelStatut(r.statut)}
                      </Badge>
                    </span>

                    {/* Date */}
                    <span className="hidden w-24 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                      {formatRelative(r.createdAt)}
                      {!r.lu && (
                        <span
                          className="ml-1 inline-block size-1.5 rounded-full align-middle"
                          style={{ backgroundColor: "#C0392B" }}
                          title={t("overview.nonLu")}
                          aria-label={t("overview.nonLu")}
                        />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("overview.aucunRetour")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Alerte si alertes non lues ---------- */}
      {data.alertesNonLues > 0 && (
        <div
          className="flex items-center gap-3 rounded-2xl border p-4"
          style={{ borderColor: "rgba(201,123,99,0.4)", backgroundColor: "rgba(201,123,99,0.07)" }}
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "#A85E48" }} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#7A4A3A" }}>
              {t("overview.alertesTitre", { n: data.alertesNonLues, s: data.alertesNonLues > 1 ? "s" : "" })}
            </p>
            <p className="text-xs" style={{ color: "#A85E48" }}>
              {t("overview.alertesAide")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
