"use client"

// ============================================================
// FeedbackPro - Onglet « Coach IA » (ACCUEIL du dashboard Pro)
// Cœur produit Session 1 : rapport IA quotidien/hebdomadaire,
// 3 priorités du jour, indicateurs clés, historique et courbe 30 j
// ============================================================

import { useCallback, useEffect, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import {
  Bot,
  Sparkles,
  Target,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  MessageSquare,
  ShieldCheck,
  BellRing,
  Loader2,
  History,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { cn } from "@/lib/utils"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts"

// ---------- Types (contrats GET/POST /api/pro/coach + GET /api/pro/overview) ----------

type RapportCoach = {
  id: string
  type: string
  periodeDebut: string
  periodeFin: string
  scoreGlobal: number
  contenuMarkdown: string
  priorites: string[]
  recommandations: string[]
  predictions: string[]
  createdAt: string
}

type HistoriqueEntry = {
  id: string
  type: string
  createdAt: string
  scoreGlobal: number
}

type CoachData = {
  dernierRapport?: RapportCoach | null
  prioritesDuJour?: string[]
  indicateurs?: {
    retours24h?: number
    alertesNonLues?: number
    noteMoyenne7j?: number
    scoreGlobal30j?: number
    evolutionPct?: number
  }
  historique?: HistoriqueEntry[]
}

type OverviewData = {
  scoreGlobal30j?: number
  evolutionPct?: number
  retoursMois?: number
  tauxInterception?: number
  alertesNonLues?: number
  courbe30j?: { date: string; score: number | null; retours: number }[]
}

/** Lit un champ du ProData en tolérant les évolutions de schéma (nomEtablissement / nomCommerce…) */
function champPro(pro: unknown, cles: string[], defaut = ""): string {
  if (!pro || typeof pro !== "object") return defaut
  for (const cle of cles) {
    const valeur = (pro as Record<string, unknown>)[cle]
    if (typeof valeur === "string" && valeur) return valeur
  }
  return defaut
}

// ---------- Petits utilitaires d'affichage ----------

function formatDateCourt(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

/** Version compacte sans année, pour l'axe X de la courbe 30 j.
 *  Le backend fournit déjà « JJ/MM » → on l'affiche tel quel.
 *  (Un re-parsing new Date("12/09") lirait MM/JJ → « 9 déc. » — bug corrigé.) */
function formatDateMini(d: string | Date): string {
  if (typeof d === "string") {
    if (/^\d{2}\/\d{2}$/.test(d)) return d
    const date = new Date(d)
    if (Number.isNaN(date.getTime())) return d
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
}

/** « QUOTIDIEN » / « quotidien » / « HEBDOMADAIRE » → libellé propre */
function libelleType(type: string | undefined): string {
  const t = (type || "").toLowerCase()
  if (t.includes("hebdo")) return "Rapport hebdomadaire"
  if (t.includes("quot") || t.includes("daily")) return "Rapport quotidien"
  return type ? `Rapport ${type.toLowerCase()}` : "Rapport"
}

/** Couleur du badge de score ( historique ) */
function scoreTone(score: number): string {
  if (score >= 80) return "border-green-300 text-green-700"
  if (score >= 60) return "border-amber-300 text-amber-700"
  return "border-rose-300 text-rose-700"
}

/** Styles propres pour le rendu markdown du rapport (titres, paragraphes, listes) */
const mdComposants: Components = {
  h1: ({ node, ...props }) => <h3 className="mb-2 mt-4 text-base font-bold text-foreground first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h3 className="mb-2 mt-4 text-base font-bold text-foreground first:mt-0" {...props} />,
  h3: ({ node, ...props }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0" {...props} />,
  p: ({ node, ...props }) => (
    <p className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0" {...props} />
  ),
  ul: ({ node, ...props }) => <ul className="mb-3 space-y-1.5" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5" {...props} />,
  li: ({ node, children, ...props }) => (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground" {...props}>
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  ),
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  hr: () => <hr className="my-4 border-border" />,
}

// ---------- Composant principal ----------

export function CoachIaTab() {
  const session = useAppStore((s) => s.session)
  const { toast } = useToast()

  const [coachData, setCoachData] = useState<CoachData | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(false)
  /** Rapport sélectionné (historique) — null = dernier rapport */
  const [rapportId, setRapportId] = useState<string | null>(null)

  const nomEtablissement = champPro(session?.pro, ["nomEtablissement", "nomCommerce"], "votre établissement")
  const frequence = champPro(session?.pro, ["frequenceRapport"], "quotidien").toLowerCase()

  // ---------- Chargement initial (Coach + overview pour la courbe 30 j) ----------
  const charger = useCallback(async () => {
    setLoading(true)
    try {
      const [resCoach, resOverview] = await Promise.all([
        fetch("/api/pro/coach", { cache: "no-store" }),
        fetch("/api/pro/overview", { cache: "no-store" }).catch(() => null),
      ])
      if (resCoach.ok) {
        const json = await resCoach.json()
        if (json?.ok) setCoachData(json.data as CoachData)
      }
      if (resOverview?.ok) {
        const json = await resOverview.json()
        if (json?.ok) setOverview(json.data as OverviewData)
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger votre Coach IA", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  // ---------- Génération d'un rapport (POST, 5-15 s côté IA) ----------
  async function generer() {
    setGeneration(true)
    try {
      const res = await fetch("/api/pro/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (res.ok && json?.ok && json.data?.rapport) {
        const rapport: RapportCoach = json.data.rapport
        setCoachData((prev) => {
          const base: CoachData = prev ?? {}
          return {
            ...base,
            dernierRapport: rapport,
            historique: [
              { id: rapport.id, type: rapport.type, createdAt: rapport.createdAt, scoreGlobal: rapport.scoreGlobal },
              ...(base.historique ?? []),
            ],
          }
        })
        setRapportId(rapport.id)
        toast({ title: "Rapport prêt ✨", description: "Votre Coach IA a terminé l'analyse de vos retours." })
      } else {
        toast({
          title: "Génération impossible",
          description: json?.error || "Réessayez dans quelques instants.",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le Coach IA.", variant: "destructive" })
    } finally {
      setGeneration(false)
    }
  }

  // ---------- Valeurs dérivées ----------

  const dernier = coachData?.dernierRapport ?? null
  const idSelectionne = rapportId ?? dernier?.id ?? null
  const estDernier = idSelectionne != null && dernier != null && idSelectionne === dernier.id
  const rapportComplet = estDernier ? dernier : null
  const entreeHisto = coachData?.historique?.find((h) => h.id === idSelectionne) ?? null

  const prioritesAffichees = (coachData?.prioritesDuJour?.length
    ? coachData.prioritesDuJour
    : dernier?.priorites) ?? []

  const indic = coachData?.indicateurs
  const score30 = indic?.scoreGlobal30j ?? overview?.scoreGlobal30j ?? null
  const evolution = indic?.evolutionPct ?? overview?.evolutionPct ?? null
  const alertes = indic?.alertesNonLues ?? overview?.alertesNonLues ?? 0

  const courbe =
    overview?.courbe30j?.map((e) => ({
      date: formatDateMini(e.date),
      score: e.score ?? null,
      retours: e.retours ?? 0,
    })) ?? []

  // ---------- Squelettes de chargement ----------
  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-56" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---------- En-tête : salutation + génération ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            👋 Bonjour, <span className="text-primary">{nomEtablissement}</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" aria-hidden />
              Rapport {frequence === "hebdomadaire" ? "hebdomadaire" : "quotidien"}
            </Badge>
            <p className="text-sm text-muted-foreground">Votre Coach audite vos zones en continu.</p>
          </div>
        </div>
        <Button onClick={generer} disabled={generation} className="shrink-0">
          {generation ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          )}
          {generation ? "Analyse en cours…" : "Générer le rapport maintenant"}
        </Button>
      </div>

      {/* ---------- 🎯 Les 3 priorités du jour ---------- */}
      <section aria-labelledby="titre-priorites">
        <h2 id="titre-priorites" className="mb-3 text-base font-semibold sm:text-lg">
          🎯 Vos 3 priorités du jour
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {prioritesAffichees.length === 0 ? (
            <Card className="sm:col-span-3">
              <CardContent className="flex items-center justify-center gap-3 py-6 text-center">
                <Target className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Vos priorités apparaîtront dès que vos premiers retours seront collectés.
                </p>
              </CardContent>
            </Card>
          ) : (
            prioritesAffichees.slice(0, 3).map((texte, i) => (
              <Card key={i}>
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed">{texte}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* ---------- Indicateurs clés (2×2 mobile / 4 desktop) ---------- */}
      <section aria-label="Indicateurs clés">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            icon={Star}
            label="Score global (30 j)"
            value={score30 != null ? Math.round(score30) : "—"}
            hint={
              evolution != null && evolution !== 0
                ? `${evolution > 0 ? "+" : ""}${evolution} % vs période précédente`
                : "Stable vs période précédente"
            }
            hintTone={evolution != null && evolution > 0 ? "up" : evolution != null && evolution < 0 ? "down" : "neutral"}
          />
          <KpiCard
            icon={MessageSquare}
            label={overview?.retoursMois != null ? "Retours ce mois-ci" : "Retours (24 h)"}
            value={overview?.retoursMois ?? indic?.retours24h ?? "—"}
            hint={overview?.retoursMois != null ? "collectés via vos QR codes" : "collectés aujourd'hui"}
          />
          <KpiCard
            icon={ShieldCheck}
            label="Taux d'interception"
            value={overview?.tauxInterception != null ? `${overview.tauxInterception} %` : "—"}
            hint="réclamations 1–3★ traitées en interne"
          />
          <KpiCard
            icon={BellRing}
            label="Alertes non lues"
            value={alertes}
            hint={alertes > 0 ? "à consulter en priorité" : "tout est lu, bravo !"}
            hintTone={alertes > 0 ? "down" : "up"}
            alerte={alertes > 0}
          />
        </div>
      </section>

      {/* ---------- Rapport IA ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Bot className="h-5 w-5 text-primary" aria-hidden />
              Rapport de votre Coach IA
            </CardTitle>
            {(rapportComplet || entreeHisto) && (
              <Badge variant="secondary">{libelleType((rapportComplet ?? entreeHisto)?.type)}</Badge>
            )}
          </div>
          {rapportComplet ? (
            <CardDescription>
              Période du {formatDateCourt(rapportComplet.periodeDebut)} au {formatDateCourt(rapportComplet.periodeFin)}
            </CardDescription>
          ) : (
            <CardDescription>Analyse automatique de tous vos retours, zone par zone</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Pendant la génération : message d'attente explicite (IA 5-15 s) */}
          {generation && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium">Votre Coach analyse vos retours…</p>
                <p className="text-xs text-muted-foreground">
                  L&apos;analyse peut prendre une dizaine de secondes. Merci de patienter.
                </p>
              </div>
            </div>
          )}

          {rapportComplet ? (
            <>
              {/* Score global + période */}
              <div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:gap-6">
                <div className="text-center">
                  <p className="text-5xl font-extrabold tracking-tight text-primary">
                    {Math.round(rapportComplet.scoreGlobal)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">score global / 100</p>
                </div>
                <div className="h-px w-full bg-border sm:h-14 sm:w-px" aria-hidden />
                <p className="text-center text-sm text-muted-foreground sm:text-left">
                  Synthèse rédigée par votre Coach à partir de tous les retours collectés sur la période :
                  points forts, points de vigilance et plan d&apos;action.
                </p>
              </div>

              {/* Contenu markdown */}
              {rapportComplet.contenuMarkdown && (
                <div className="min-w-0">
                  <ReactMarkdown components={mdComposants}>{rapportComplet.contenuMarkdown}</ReactMarkdown>
                </div>
              )}

              {/* Priorités / Recommandations / Prédictions */}
              <div className="grid gap-3 lg:grid-cols-3">
                <ListeRapport
                  icone={Target}
                  titre="Priorités"
                  items={rapportComplet.priorites ?? []}
                  tone="text-primary"
                />
                <ListeRapport
                  icone={Lightbulb}
                  titre="Recommandations"
                  items={rapportComplet.recommandations ?? []}
                  tone="text-amber-600"
                />
                <ListeRapport
                  icone={TrendingUp}
                  titre="Prédictions"
                  items={rapportComplet.predictions ?? []}
                  tone="text-green-600"
                />
              </div>
            </>
          ) : entreeHisto ? (
            // Rapport archivé : seuls score / type / date restent disponibles
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-5xl font-extrabold tracking-tight text-primary">
                {Math.round(entreeHisto.scoreGlobal)}
              </p>
              <p className="text-xs text-muted-foreground">score global / 100</p>
              <p className="text-sm text-muted-foreground">
                {libelleType(entreeHisto.type)} · {formatDateCourt(entreeHisto.createdAt)}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                Le détail complet de ce rapport archivé n&apos;est plus disponible dans cette session —
                générez un nouveau rapport pour une analyse à jour.
              </p>
            </div>
          ) : (
            // Empty state élégant : aucun rapport
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="rounded-2xl bg-primary/10 p-4" aria-hidden>
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <p className="font-medium">Aucun rapport pour l&apos;instant</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Dès que vos zones auront collecté quelques retours, votre Coach IA rédigera un rapport
                avec vos priorités du jour, vos recommandations et ses prédictions.
              </p>
              <Button onClick={generer} disabled={generation} className="mt-1">
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Générer mon premier rapport
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Historique + Évolution 30 j ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <History className="h-4.5 w-4.5 text-primary" aria-hidden />
              Historique des rapports
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {(coachData?.historique ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun rapport généré pour l&apos;instant.</p>
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto custom-scrollbar pr-1">
                {coachData?.historique?.map((h) => {
                  const actif = h.id === idSelectionne
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setRapportId(h.id)}
                      aria-current={actif ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        actif ? "border-primary/40 bg-primary/5" : "hover:bg-muted/60"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{libelleType(h.type)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateCourt(h.createdAt)}</p>
                      </div>
                      <Badge variant="outline" className={scoreTone(h.scoreGlobal)}>
                        {Math.round(h.scoreGlobal)}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Évolution sur 30 jours</CardTitle>
            <CardDescription>Score global et volume de retours par jour</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-72">
            {courbe.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={courbe} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradRetours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  {/* scale="point" : empêche Recharts de parser les labels « JJ/MM » comme dates US */}
                  <XAxis dataKey="date" scale="point" tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="score"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="retours"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                  />
                  <Tooltip labelStyle={{ color: "#1c1917" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    yAxisId="score"
                    type="monotone"
                    dataKey="score"
                    name="Score global"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill="url(#gradScore)"
                    connectNulls
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    yAxisId="retours"
                    type="monotone"
                    dataKey="retours"
                    name="Retours"
                    stroke="#93c5fd"
                    strokeWidth={2}
                    fill="url(#gradRetours)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                Pas encore assez de données pour tracer la courbe — partagez vos QR codes !
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------- Carte KPI (locale, avec badge d'alerte + flèche d'évolution) ----------

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  hintTone = "neutral",
  alerte = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  hintTone?: "up" | "down" | "neutral"
  alerte?: boolean
}) {
  const HintIcon = hintTone === "up" ? TrendingUp : hintTone === "down" ? TrendingDown : Minus
  const toneClass =
    hintTone === "up" ? "text-green-600" : hintTone === "down" ? "text-rose-600" : "text-muted-foreground"
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
            {hint && (
              <p className={cn("mt-1 flex items-center gap-1 text-[11px] sm:text-xs", toneClass)}>
                <HintIcon className="h-3 w-3 shrink-0" aria-hidden /> {hint}
              </p>
            )}
          </div>
          <div className="relative shrink-0 rounded-xl bg-primary/10 p-2.5" aria-hidden>
            <Icon className="h-5 w-5 text-primary" />
            {alerte && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                !
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Sous-bloc du rapport : liste avec icône (priorités / recommandations / prédictions) ----------

function ListeRapport({
  icone: Icon,
  titre,
  items,
  tone,
}: {
  icone: React.ComponentType<{ className?: string }>
  titre: string
  items: string[]
  tone: string
}) {
  if (!items || items.length === 0) return null
  return (
    <div className="rounded-xl border p-3.5">
      <p className={cn("mb-2 flex items-center gap-1.5 text-sm font-semibold", tone)}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {titre}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
