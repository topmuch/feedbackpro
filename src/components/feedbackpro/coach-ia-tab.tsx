"use client"

// ============================================================
// FeedbackPro - Onglet « Coach IA » (ACCUEIL du dashboard Pro)
// Session 4 : page d'accueil repensée —
//   1. Rapport du jour (score du jour, évolutions, retours du jour)
//   2. 3 priorités du jour STRUCTURÉES (🔥 critique / ⚠️ important /
//      💡 suggestion) avec recommandation du Coach + actions
//      « Marquer traité » (PATCH retours) et « Voir détails » (dialog)
//   3. Points positifs à valoriser (employés, zones, félicitations)
//   4. Prédictions de la semaine
//   5. (Session 5) Analyse sémantique — thèmes cachés extraits des
//      commentaires libres (GET /api/pro/coach/themes)
// Conservé des sessions précédentes : KPIs, rapport IA inline
// (markdown), historique cliquable et courbe 30 j.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import {
  Bot,
  Brain,
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
  Flame,
  AlertTriangle,
  Check,
  Eye,
  Clipboard,
  FileText,
  ArrowLeft,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { cn } from "@/lib/utils"
import { tagLabel } from "@/lib/constants"
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
  /** Session 4 : canaux d'envoi déjà utilisés pour ce rapport */
  envoyeParEmail?: boolean
  envoyeParSMS?: boolean
  createdAt: string
}

type HistoriqueEntry = {
  id: string
  type: string
  createdAt: string
  scoreGlobal: number
}

/** Priorité STRUCTURÉE (Session 4) — calcul déterministe côté serveur */
type NiveauPriorite = "critique" | "important" | "suggestion"

type PrioriteDetaillee = {
  niveau: NiveauPriorite
  titre: string
  description: string
  recommandation: string
  zoneNom?: string
  retourIds: string[]
}

/** Sections d'accueil Session 4 renvoyées par GET /api/pro/coach */
type AccueilData = {
  scoreDuJour: {
    score: number
    score7j: number
    retoursAujourdhui: number
    vsHierPct: number | null
    vsSemainePct: number | null
  }
  priorites: PrioriteDetaillee[]
  pointsPositifs: {
    employes: { nom: string; positifs: number; detail: string }[]
    zones: { nom: string; noteMoy: number; total: number }[]
    messages: string[]
  }
  predictions: string[]
}

/** Forme RetourDetail renvoyée par GET /api/pro/retours (filte ?ids=) */
type RetourDetail = {
  id: string
  note: number
  tags: string[]
  commentaire: string | null
  statut: string
  zone: { nom: string } | null
  employe: { nom: string } | null
  createdAt: string
}

/** Session 5 : thème sémantique détecté dans les commentaires libres (trié par occurrences) */
type ThemeDetecte = {
  nom: string
  emoji: string
  occurrences: number
  noteMoyenne: number
  motsDetectes: { mot: string; count: number }[]
  exemples: { commentaire: string; note: number; zoneNom?: string }[]
}

/** Session 5 : contrat GET /api/pro/coach/themes */
type ThemesData = {
  jours: number
  commentairesAnalyses: number
  totalRetours: number
  themes: ThemeDetecte[]
  motsCles: { mot: string; count: number }[]
  groupes: { taille: number; exemple: string; noteMoyenne: number; notes: number[] }[]
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
  /** Session 4 : sections d'accueil (null si le calcul a échoué côté serveur) */
  accueil?: AccueilData | null
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

/** Date + heure compactes pour le détail des réclamations (dialog) */
function formatDateHeure(d: string): string {
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
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

/** Clé stable d'une priorité (retrait d'état local + suivi du bouton en cours) */
function clePriorite(p: PrioriteDetaillee): string {
  return `${p.niveau}::${p.titre}`
}

/** Tronque un commentaire long pour l'affichage compact du dialog */
function tronquer(texte: string | null, max = 140): string {
  const t = (texte ?? "").trim()
  if (!t) return "Aucun commentaire"
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t
}

/** Formatage d'une note moyenne « 3,8 » (virgule française) */
function noteFr(note: number): string {
  return note.toFixed(2).replace(".", ",")
}

/** Session 5 : couleur du badge de note d'un thème — rose < 3 (irritant),
 *  vert ≥ 4 (satisfaction), ambre entre les deux */
function tonaliteTheme(note: number): string {
  if (note < 3) return "border-rose-300 bg-rose-50 text-rose-700"
  if (note >= 4) return "border-green-300 bg-green-50 text-green-700"
  return "border-amber-300 bg-amber-50 text-amber-700"
}

/** Styles par niveau de priorité : carte, badge et icône lucide */
const STYLES_PRIORITE: Record<
  NiveauPriorite,
  { carte: string; badge: string; libelle: string; emoji: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  critique: {
    carte: "border-red-200 bg-red-50/40",
    badge: "border-red-300 bg-red-100 text-red-700",
    libelle: "Urgent",
    emoji: "🔥",
    Icon: Flame,
  },
  important: {
    carte: "border-amber-200 bg-amber-50/40",
    badge: "border-amber-300 bg-amber-100 text-amber-700",
    libelle: "Important",
    emoji: "⚠️",
    Icon: AlertTriangle,
  },
  suggestion: {
    carte: "border-violet-200 bg-violet-50/40",
    badge: "border-violet-300 bg-violet-100 text-violet-700",
    libelle: "Suggestion",
    emoji: "💡",
    Icon: Lightbulb,
  },
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

export function CoachIaTab({ onOuvrirRapports }: { onOuvrirRapports?: () => void }) {
  const session = useAppStore((s) => s.session)
  const { toast } = useToast()

  const [coachData, setCoachData] = useState<CoachData | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(false)
  /** Rapport sélectionné (historique) — null = dernier rapport */
  const [rapportId, setRapportId] = useState<string | null>(null)

  // Session 4 : actions sur les priorités structurées
  /** Clé de la priorité dont le « Marquer traité » est en cours */
  const [traitementEnCours, setTraitementEnCours] = useState<string | null>(null)
  /** Priorité ouverte dans le dialog « Voir détails » */
  const [prioriteDialog, setPrioriteDialog] = useState<PrioriteDetaillee | null>(null)
  /** Réclamations chargées pour le dialog (null = chargement) */
  const [retoursDialog, setRetoursDialog] = useState<RetourDetail[] | null>(null)
  const [chargementDialog, setChargementDialog] = useState(false)

  // Session 5 : analyse sémantique des commentaires (thèmes cachés)
  const [themesData, setThemesData] = useState<ThemesData | null>(null)
  const [themesLoading, setThemesLoading] = useState(true)

  // D4 : alertes intelligentes du Coach IA (baisses tendancielles détectées)
  type AlerteIntelligente = {
    id: string
    titre: string
    message: string
    createdAt: string
    lu: boolean
  }
  const [alertesIA, setAlertesIA] = useState<AlerteIntelligente[]>([])

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

  // ---------- D4 : chargement des alertes intelligentes (bannières Coach IA) ----------
  useEffect(() => {
    let annule = false
    fetch("/api/pro/alertes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j?.ok && Array.isArray(j.data?.alertes)) {
          // On ne conserve que les alertes INTELLIGENTES non lues (max 5)
          const ia = (j.data.alertes as Array<Record<string, unknown>>)
            .filter((a) => a?.type === "INTELLIGENTE" && a?.lu !== true)
            .slice(0, 5)
            .map((a) => ({
              id: String(a.id ?? ""),
              titre: String(a.titre ?? ""),
              message: String(a.message ?? ""),
              createdAt: String(a.createdAt ?? ""),
              lu: false,
            }))
          setAlertesIA(ia)
        }
      })
      .catch(() => {
        /* silencieux */
      })
    return () => {
      annule = true
    }
  }, [])

  // Marquer une alerte intelligente comme lue (PATCH /api/pro/alertes)
  async function ignorerAlerteIA(id: string) {
    setAlertesIA((prev) => prev.filter((a) => a.id !== id))
    try {
      await fetch("/api/pro/alertes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    } catch {
      /* silencieux */
    }
  }

  // ---------- Session 5 : analyse sémantique (thèmes cachés) ----------
  // Fetch indépendant au montage (même pattern que stats-tab : guard de démontage).
  // Échec ou route indisponible → la section reste simplement masquée
  // (non bloquant, pas de toast).
  useEffect(() => {
    let annule = false
    fetch("/api/pro/coach/themes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j?.ok && j.data) setThemesData(j.data as ThemesData)
      })
      .catch(() => {
        // Silencieux : sans données, la section ne s'affiche pas
      })
      .finally(() => {
        if (!annule) setThemesLoading(false)
      })
    return () => {
      annule = true
    }
  }, [])

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

  // ---------- Session 4 : « Marquer traité » sur une priorité ----------
  async function marquerTraite(p: PrioriteDetaillee) {
    setTraitementEnCours(clePriorite(p))
    try {
      // Suggestion sans réclamation liée : on note et on rafraîchit les données
      if (p.retourIds.length === 0) {
        toast({ title: "Suggestion notée, aucune réclamation liée" })
        retirerPriorite(p)
        await charger()
        return
      }
      // Résolution de toutes les réclamations liées (PATCH en parallèle)
      const resultats = await Promise.all(
        p.retourIds.map(async (id) => {
          try {
            const res = await fetch("/api/pro/retours", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, statut: "RESOLVED", actionPrise: p.recommandation }),
            })
            return res.ok
          } catch {
            return false
          }
        })
      )
      const succes = resultats.filter(Boolean).length
      if (succes === 0) throw new Error("aucune résolution")
      toast({
        title: `Priorité marquée comme traitée — ${succes} réclamation(s) résolue(s)`,
      })
      // Retrait local : l'ancien calcul reste affiché jusqu'au rechargement
      retirerPriorite(p)
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de marquer cette priorité comme traitée. Réessayez.",
        variant: "destructive",
      })
    } finally {
      setTraitementEnCours(null)
    }
  }

  /** Retire une priorité de l'état local (après traitement réussi) */
  function retirerPriorite(p: PrioriteDetaillee) {
    setCoachData((prev) => {
      if (!prev?.accueil) return prev
      return {
        ...prev,
        accueil: {
          ...prev.accueil,
          priorites: prev.accueil.priorites.filter((x) => clePriorite(x) !== clePriorite(p)),
        },
      }
    })
  }

  // ---------- Session 4 : dialog « Voir détails » ----------
  async function ouvrirDetails(p: PrioriteDetaillee) {
    setPrioriteDialog(p)
    setRetoursDialog(null)
    // Priorité sans réclamation liée : le dialog montre juste l'analyse
    if (p.retourIds.length === 0) return
    setChargementDialog(true)
    try {
      const res = await fetch(`/api/pro/retours?ids=${encodeURIComponent(p.retourIds.join(","))}`, {
        cache: "no-store",
      })
      const json = await res.json()
      setRetoursDialog(json?.ok ? ((json.data.retours ?? []) as RetourDetail[]) : [])
    } catch {
      setRetoursDialog([])
      toast({
        title: "Erreur",
        description: "Impossible de charger le détail des réclamations.",
        variant: "destructive",
      })
    } finally {
      setChargementDialog(false)
    }
  }

  function fermerDialog() {
    setPrioriteDialog(null)
    setRetoursDialog(null)
  }

  // ---------- Session 4 : copie des félicitations ----------
  async function copierMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message)
      toast({ title: "Copié" })
    } catch {
      toast({
        title: "Copie impossible",
        description: "Votre navigateur a refusé l'accès au presse-papiers.",
        variant: "destructive",
      })
    }
  }

  // ---------- Valeurs dérivées ----------

  const dernier = coachData?.dernierRapport ?? null
  const idSelectionne = rapportId ?? dernier?.id ?? null
  const estDernier = idSelectionne != null && dernier != null && idSelectionne === dernier.id
  const rapportComplet = estDernier ? dernier : null
  const entreeHisto = coachData?.historique?.find((h) => h.id === idSelectionne) ?? null

  // Sections d'accueil Session 4 (fallback : ancien calcul si accueil absent)
  const accueil = coachData?.accueil ?? null

  /** Score du jour affiché : repli sur la moyenne 7 j si pas de retour aujourd'hui.
   *  Audit UX : si aucune donnée (0 retour aujourd'hui ET score 7 j nul),
   *  on affiche « — » + un message encourageant au lieu d'un score « 0 » trompeur. */
  const scoreDuJour = accueil?.scoreDuJour ?? null
  const repli7j = (scoreDuJour?.retoursAujourdhui ?? 0) === 0 && (scoreDuJour?.score7j ?? 0) > 0
  const pasDeDonneesJour =
    (scoreDuJour?.retoursAujourdhui ?? 0) === 0 && (scoreDuJour?.score7j ?? 0) === 0
  const scoreJourAffiche =
    scoreDuJour && !pasDeDonneesJour ? (repli7j ? scoreDuJour.score7j : scoreDuJour.score) : null
  const mentionScore = pasDeDonneesJour ? "—" : repli7j ? "moyenne 7 jours" : "aujourd'hui"

  /**
   * Audit UX : la zone la plus faible (mentionnée dans les priorités critiques
   * ou importantes) — utilisée pour personnaliser les prédictions du Coach.
   */
  const zoneLaPlusFaible = accueil?.priorites?.find(
    (p) => (p.niveau === "critique" || p.niveau === "important") && p.zoneNom
  )?.zoneNom ?? null

  /** Prédictions : accueil en priorité, sinon celles du dernier rapport.
   *  Audit UX : personnalisation — « Chaque semaine sans action coûte 2 à 3
   *  points » devient « Sans action sur [zone], vous risquez de perdre 2 à 3
   *  points la semaine prochaine » dès qu'une zone faible est identifiée. */
  const predictionsBrutes = accueil ? (accueil.predictions ?? []) : (dernier?.predictions ?? [])
  const predictions = zoneLaPlusFaible
    ? predictionsBrutes.map((p) =>
        /chaque semaine sans action/i.test(p)
          ? `Sans action sur ${zoneLaPlusFaible}, vous risquez de perdre 2 à 3 points la semaine prochaine.`
          : p
      )
    : predictionsBrutes

  /** Session 5 : analyse sémantique — données dérivées (tolérantes aux champs absents) */
  const themes = themesData?.themes ?? []
  const motsCles = themesData?.motsCles ?? []
  const groupesSimilaires = themesData?.groupes ?? []
  /** Section masquée si rien analysé ou si thèmes/mots-clés/groupes sont tous vides */
  const themesVisibles =
    themesData != null &&
    themesData.commentairesAnalyses > 0 &&
    (themes.length > 0 || motsCles.length > 0 || groupesSimilaires.length > 0)

  /** Ancienne liste de textes bruts (fallback si accueil indisponible) */
  const prioritesAffichees = (coachData?.prioritesDuJour?.length
    ? coachData.prioritesDuJour
    : dernier?.priorites) ?? []

  const indic = coachData?.indicateurs
  const score30 = indic?.scoreGlobal30j ?? overview?.scoreGlobal30j ?? null
  const evolution = indic?.evolutionPct ?? overview?.evolutionPct ?? null
  const alertes = indic?.alertesNonLues ?? overview?.alertesNonLues ?? 0

  /**
   * Score UNIFIÉ (audit UX) : le score affiché en grand (jauge circulaire)
   * doit être le MÊME que celui de la KPI card « Score global (30 j) ».
   * Source unique : scoreGlobal du dernier rapport IA s'il existe, sinon
   * scoreGlobal30j calculé (note moyenne × 20 sur 30 jours).
   */
  const scoreUnifie = dernier?.scoreGlobal ?? score30 ?? null
  /** Source humaine du score unifié (libellé affiché sous la jauge). */
  const sourceScoreUnifie = dernier ? "Rapport IA" : "Calcul 30 jours"

  /**
   * Prédictions (audit UX) : masquer la section si pas assez de données.
   * On considère qu'il n'y a pas assez de données si le score 7 j est nul
   * (aucun retour collecté sur la dernière semaine) — les prédictions
   * deviennent alors trop génériques pour être actionnables.
   */
  const dataSuffisantePourPredictions = (scoreDuJour?.score7j ?? 0) > 0
  const predictionsVisibles = predictions.length > 0 && dataSuffisantePourPredictions

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
        {/* Rapport du jour */}
        <Skeleton className="h-40 rounded-xl" />
        {/* 3 priorités du jour */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        {/* Rapport IA */}
        <Skeleton className="h-80 rounded-xl" />
        {/* Points positifs */}
        <div className="grid gap-3 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
        {/* Prédictions */}
        <Skeleton className="h-36 rounded-xl" />
        {/* Analyse sémantique — thèmes cachés (Session 5) */}
        <Skeleton className="h-64 rounded-xl" />
        {/* Historique + courbe */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    )
  }

  // ---------- Vue détaillée pleine page d'une priorité (remplace la modale) ----------
  if (prioriteDialog) {
    return (
      <div className="space-y-5">
        {/* En-tête : retour + titre */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={fermerDialog} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour au Coach
          </Button>
          <h2 className="text-lg sm:text-xl font-semibold">
            {STYLES_PRIORITE[prioriteDialog.niveau].emoji} {prioriteDialog.titre}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">{prioriteDialog.description}</p>

        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {/* Rappel de la recommandation du Coach */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Recommandation du Coach
              </p>
              <p className="text-sm leading-relaxed">{prioriteDialog.recommandation}</p>
            </div>

            {/* Réclamations liées (chargées via GET /api/pro/retours?ids=) */}
            {prioriteDialog.retourIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune réclamation liée à cette priorité — il s&apos;agit d&apos;une suggestion d&apos;amélioration.
              </p>
            ) : chargementDialog || retoursDialog == null ? (
              <div
                className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Chargement des réclamations…
              </div>
            ) : retoursDialog.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun retour retrouvé pour cette priorité (peut-être déjà résolu).
              </p>
            ) : (
              <ul className="space-y-2.5">
                {retoursDialog.map((r) => (
                  <li key={r.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Etoiles note={r.note} />
                      <p className="text-xs text-muted-foreground">{formatDateHeure(r.createdAt)}</p>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed">{tronquer(r.commentaire)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {r.zone?.nom && <Badge variant="secondary">📍 {r.zone.nom}</Badge>}
                      {r.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[11px] text-muted-foreground">
                          {tagLabel(tag)}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-start">
          <Button variant="outline" onClick={fermerDialog} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour au Coach
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---------- En-tête : titre + génération ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Coach IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bonjour {nomEtablissement} — votre audit qualité quotidien
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            Rapport {frequence === "hebdomadaire" ? "hebdomadaire" : "quotidien"}
          </Badge>
          <Button onClick={generer} disabled={generation} className="shrink-0">
            {generation ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
            )}
            {generation ? "Analyse en cours…" : "Générer un rapport"}
          </Button>
        </div>
      </div>

      {/* ---------- D4 : Bannière alertes intelligentes du Coach IA ---------- */}
      {alertesIA.length > 0 && (
        <section aria-label="Alertes intelligentes du Coach IA" className="space-y-2.5">
          {alertesIA.map((a) => (
            <Card key={a.id} className="border-amber-300 bg-amber-50">
              <CardContent className="flex items-start gap-3 p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">{a.titre}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{a.message}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 text-xs text-amber-700 hover:bg-amber-100"
                onClick={() => ignorerAlerteIA(a.id)}
              >
                Ignorer
              </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* ---------- 📊 Rapport du jour (Session 4) ---------- */}
      {scoreDuJour && (
        <section aria-labelledby="titre-rapport-jour">
          <h2 id="titre-rapport-jour" className="mb-3 text-base font-semibold sm:text-lg">
            📊 Rapport du jour
          </h2>
          <Card className="overflow-hidden border-primary/20 bg-primary/[0.03] shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center">
              {/* Gros score DU JOUR avec jauge colorée (vert >80 / ambre 60-80 / rouge <60).
                  Audit UX : ce score est le score du jour (aujourd'hui ou repli
                  moyenne 7 j). Le KPI « Score global (30 j) » plus bas affiche
                  lui le score mensuel — les deux sont désormais différenciés. */}
              <div
                className="flex items-center gap-4 lg:w-44 lg:shrink-0 lg:flex-col lg:items-center lg:gap-2"
                title={`Score du jour — ${mentionScore}`}
              >
                {scoreJourAffiche != null ? (
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
                      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                      <circle
                        cx="50"
                        cy="50"
                        r="44"
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        stroke="currentColor"
                        className={
                          scoreJourAffiche >= 80
                            ? "text-green-500"
                            : scoreJourAffiche >= 60
                              ? "text-amber-500"
                              : "text-rose-500"
                        }
                        strokeDasharray={`${scoreJourAffiche * 2.76} 999`}
                      />
                    </svg>
                    <span
                      className={cn(
                        "text-2xl font-extrabold tracking-tight",
                        scoreJourAffiche >= 80
                          ? "text-green-600"
                          : scoreJourAffiche >= 60
                            ? "text-amber-600"
                            : "text-rose-600"
                      )}
                    >
                      {Math.round(scoreJourAffiche)}
                    </span>
                  </div>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-muted/40">
                    <span className="text-3xl font-light text-muted-foreground">—</span>
                  </div>
                )}
                <div className="lg:text-center">
                  <p className="text-xs font-medium text-muted-foreground">Score du jour</p>
                  <p className="text-[11px] text-muted-foreground">{mentionScore}</p>
                </div>
              </div>

              <div className="hidden h-16 w-px bg-border lg:block" aria-hidden />

              {/* Évolutions + retours du jour */}
              <div className="flex-1 space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  <BadgeEvolution pct={scoreDuJour.vsHierPct ?? null} label="vs hier" />
                  <BadgeEvolution pct={scoreDuJour.vsSemainePct ?? null} label="vs semaine dernière" />
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{scoreDuJour.retoursAujourdhui}</span>{" "}
                  retour{scoreDuJour.retoursAujourdhui > 1 ? "s" : ""} collecté
                  {scoreDuJour.retoursAujourdhui > 1 ? "s" : ""} aujourd&apos;hui via vos QR codes
                </p>
                {/* Audit UX : « Pas assez de données » pour le score du jour → message encourageant */}
                {scoreJourAffiche == null ? (
                  <p className="text-xs font-medium text-primary">
                    Continuez à collecter des retours, votre rapport quotidien sera plus précis ! 🌟
                  </p>
                ) : (
                  /* Encouragement quand pas assez de données pour comparer (audit UX) */
                  scoreDuJour.vsHierPct == null &&
                  scoreDuJour.vsSemainePct == null && (
                    <p className="text-xs font-medium text-primary">
                      Continuez à collecter des retours, votre rapport sera plus précis jour après jour ! 🌟
                    </p>
                  )
                )}
              </div>

              {/* CTA vers l'onglet Rapports IA (liste complète) */}
              <Button onClick={onOuvrirRapports} disabled={!onOuvrirRapports} className="shrink-0">
                <FileText className="mr-2 h-4 w-4" aria-hidden />
                Voir le rapport complet
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ---------- 🎯 Les 3 priorités du jour (Session 4 : structurées) ---------- */}
      <section aria-labelledby="titre-priorites">
        <h2 id="titre-priorites" className="mb-3 text-base font-semibold sm:text-lg">
          🎯 Vos 3 priorités du jour
        </h2>
        {accueil ? (
          // Priorités STRUCTURÉES (🔥 critique / ⚠️ important / 💡 suggestion)
          <div className="grid gap-3 sm:grid-cols-3">
            {accueil.priorites.length === 0 ? (
              <Card className="sm:col-span-3 shadow-sm">
                <CardContent className="flex items-center justify-center gap-3 py-6 text-center">
                  <Target className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Vos priorités apparaîtront dès que vos premiers retours seront collectés.
                  </p>
                </CardContent>
              </Card>
            ) : (
              accueil.priorites.map((p) => (
                <CartePriorite
                  key={clePriorite(p)}
                  priorite={p}
                  enCours={traitementEnCours === clePriorite(p)}
                  onTraiter={marquerTraite}
                  onDetails={ouvrirDetails}
                />
              ))
            )}
          </div>
        ) : (
          // FALLBACK : accueil indisponible → ancienne liste de textes bruts
          <div className="grid gap-3 sm:grid-cols-3">
            {prioritesAffichees.length === 0 ? (
              <Card className="sm:col-span-3 shadow-sm">
                <CardContent className="flex items-center justify-center gap-3 py-6 text-center">
                  <Target className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Vos priorités apparaîtront dès que vos premiers retours seront collectés.
                  </p>
                </CardContent>
              </Card>
            ) : (
              prioritesAffichees.slice(0, 3).map((texte, i) => (
                <Card key={i} className="shadow-sm">
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
        )}
      </section>

      {/* ---------- Indicateurs clés (2×2 mobile / 4 desktop) ---------- */}
      <section aria-label="Indicateurs clés">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard
            icon={Star}
            label="Score global"
            value={scoreUnifie != null ? Math.round(scoreUnifie) : "—"}
            subtitle="30 derniers jours"
            hint={
              evolution != null && evolution !== 0
                ? `${evolution > 0 ? "+" : ""}${evolution} % vs période précédente`
                : "Stable vs période précédente"
            }
            hintTone={evolution != null && evolution > 0 ? "up" : evolution != null && evolution < 0 ? "down" : "neutral"}
            title="Score moyen pondéré sur les 30 derniers jours"
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
      <Card className="shadow-sm">
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

      {/* ---------- 💙 Points positifs à valoriser (Session 4) ---------- */}
      {accueil && (
        <section aria-labelledby="titre-positifs">
          <h2 id="titre-positifs" className="mb-3 text-base font-semibold sm:text-lg">
            💙 Points positifs à valoriser
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {/* 👏 Employés salués par les clients */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">👏 Employés du jour</CardTitle>
              </CardHeader>
              <CardContent>
                {accueil.pointsPositifs.employes.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Vos premiers retours positifs arriveront bientôt ! Continuez à collecter des retours. 🌟
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {accueil.pointsPositifs.employes.map((e) => (
                      <li key={e.nom} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.nom}</p>
                          <p className="text-xs text-muted-foreground">{e.detail}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          +{e.positifs}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* 🌟 Zones les mieux notées */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">🌟 Zones performantes</CardTitle>
              </CardHeader>
              <CardContent>
                {accueil.pointsPositifs.zones.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Vos premiers retours positifs arriveront bientôt ! Continuez à collecter des retours. 🌟
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {accueil.pointsPositifs.zones.map((z) => (
                      <li key={z.nom} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{z.nom}</p>
                          <p className="text-xs text-muted-foreground">
                            {z.total} retour{z.total > 1 ? "s" : ""} cette semaine
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 border-green-300 bg-green-50 text-green-700">
                          {noteFr(z.noteMoy)}/5
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* 💌 Félicitations prêtes à partager (copie en un clic) */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">💌 Félicitations à partager</CardTitle>
              </CardHeader>
              <CardContent>
                {accueil.pointsPositifs.messages.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Vos premiers retours positifs arriveront bientôt ! Continuez à collecter des retours. 🌟
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {accueil.pointsPositifs.messages.map((message, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 p-2.5">
                        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">{message}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => copierMessage(message)}
                          aria-label="Copier le message"
                        >
                          <Clipboard className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ---------- 🔮 Prédictions de la semaine (Session 4) ---------- */}
      {predictionsVisibles && (
        <section aria-labelledby="titre-predictions">
          <h2 id="titre-predictions" className="mb-3 text-base font-semibold sm:text-lg">
            🔮 Prédictions
          </h2>
          <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4.5 w-4.5 text-amber-600" aria-hidden />
                Prédictions de la semaine
              </CardTitle>
              <CardDescription>
                Anticipations de votre Coach si aucune action n&apos;est menée sur vos priorités.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {predictions.map((prediction, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span>{prediction}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ---------- 🧠 Analyse sémantique — thèmes cachés (Session 5) ---------- */}
      {themesLoading ? (
        // Squelette dédié : fetch indépendant du reste de la page
        <Skeleton className="h-64 rounded-xl" aria-hidden />
      ) : themesVisibles && themesData ? (
        <section aria-labelledby="titre-themes">
          <div className="mb-3">
            <h2 id="titre-themes" className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <Brain className="h-4.5 w-4.5 text-primary" aria-hidden />
              🧠 Analyse sémantique — thèmes cachés
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{themesData.commentairesAnalyses}</span>{" "}
              commentaire{themesData.commentairesAnalyses > 1 ? "s" : ""} analysé
              {themesData.commentairesAnalyses > 1 ? "s" : ""} sur {themesData.jours} jours — détecté
              même sans tag sélectionné
            </p>
          </div>

          {/* Cartes des thèmes (triés par occurrences, ordre fourni par l'API) */}
          {themes.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {themes.map((t) => (
                <CarteTheme key={t.nom} theme={t} />
              ))}
            </div>
          )}

          {/* Mots-clés récurrents + commentaires similaires regroupés */}
          {(motsCles.length > 0 || groupesSimilaires.length > 0) && (
            <Card className="mt-3 shadow-sm">
              <CardContent className="space-y-4 p-4">
                {motsCles.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Mots-clés récurrents</p>
                    <div className="flex flex-wrap gap-1.5">
                      {motsCles.map((m) => (
                        <Badge key={m.mot} variant="secondary" className="font-normal">
                          {m.mot} ×{m.count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {groupesSimilaires.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Commentaires similaires regroupés</p>
                    <ul className="space-y-1.5">
                      {groupesSimilaires.map((g, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                        >
                          <span
                            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                            aria-hidden
                          />
                          <span className="min-w-0">
                            {g.taille} commentaire{g.taille > 1 ? "s" : ""} similaire
                            {g.taille > 1 ? "s" : ""} (note moy. {noteFr(g.noteMoyenne)}/5) : «{" "}
                            {tronquer(g.exemple, 120)} »
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}

      {/* ---------- Historique + Évolution 30 j ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-sm">
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

        <Card className="shadow-sm lg:col-span-2">
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

// ---------- Badge d'évolution (vs hier / vs semaine dernière) ----------

function BadgeEvolution({ pct, label }: { pct: number | null; label: string }) {
  const Icon = pct == null || pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown
  const tone =
    pct == null || pct === 0
      ? "border-border text-muted-foreground"
      : pct > 0
        ? "border-green-300 bg-green-50 text-green-700"
        : "border-rose-300 bg-rose-50 text-rose-700"
  const texte =
    pct == null
      ? "Pas assez de données"
      : pct === 0
        ? `Stable ${label}`
        : `${pct > 0 ? "+" : ""}${pct} % ${label}`
  return (
    <Badge variant="outline" className={cn("gap-1", tone)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {texte}
    </Badge>
  )
}

// ---------- Carte d'un thème caché (Session 5 : analyse sémantique) ----------

function CarteTheme({ theme: t }: { theme: ThemeDetecte }) {
  return (
    <Card className="flex flex-col shadow-sm">
      <CardContent className="flex flex-1 flex-col gap-2.5 p-4">
        {/* Nom du thème + badges occurrences / note moyenne */}
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">
            <span className="mr-1.5" aria-hidden>
              {t.emoji}
            </span>
            {t.nom}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="secondary" title={`${t.occurrences} occurrence(s)`}>
              ×{t.occurrences}
            </Badge>
            <Badge variant="outline" className={tonaliteTheme(t.noteMoyenne)}>
              {noteFr(t.noteMoyenne)}/5
            </Badge>
          </div>
        </div>

        {/* Mots détectés ayant alimenté le thème (max 5) */}
        {t.motsDetectes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {t.motsDetectes.slice(0, 5).map((m) => (
              <Badge
                key={m.mot}
                variant="outline"
                className="text-[11px] font-normal text-muted-foreground"
              >
                {m.mot} ×{m.count}
              </Badge>
            ))}
          </div>
        )}

        {/* 1 à 2 exemples de commentaires réels, tronqués */}
        {t.exemples.length > 0 && (
          <ul className="mt-auto space-y-1.5">
            {t.exemples.slice(0, 2).map((ex, i) => (
              <li key={i} className="text-xs italic leading-relaxed text-muted-foreground">
                « {tronquer(ex.commentaire, 120)} »
                {ex.zoneNom ? ` — ${ex.zoneNom}` : ""}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Carte d'une priorité structurée (Session 4) ----------

function CartePriorite({
  priorite: p,
  enCours,
  onTraiter,
  onDetails,
}: {
  priorite: PrioriteDetaillee
  enCours: boolean
  onTraiter: (p: PrioriteDetaillee) => void
  onDetails: (p: PrioriteDetaillee) => void
}) {
  const style = STYLES_PRIORITE[p.niveau]
  const IconeNiveau = style.Icon
  return (
    <Card className={cn("flex flex-col shadow-sm", style.carte)}>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Titre + badge d'urgence */}
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug">
            {style.emoji} {p.titre}
          </p>
          <Badge variant="outline" className={cn("shrink-0 gap-1", style.badge)}>
            <IconeNiveau className="h-3 w-3" aria-hidden />
            {style.libelle}
          </Badge>
        </div>

        {/* Description courte avec données */}
        <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>

        {/* Recommandation du Coach dans un encart distinct */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Recommandation du Coach
          </p>
          <p className="text-sm leading-relaxed">{p.recommandation}</p>
        </div>

        {/* Boutons d'action */}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onTraiter(p)} disabled={enCours}>
            {enCours ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {enCours ? "Traitement…" : "Marquer traité"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDetails(p)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Voir détails
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Note en étoiles (dialog détails) ----------

function Etoiles({ note }: { note: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Note ${note} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= note ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          )}
          aria-hidden
        />
      ))}
    </span>
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
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  hintTone?: "up" | "down" | "neutral"
  alerte?: boolean
  title?: string
  subtitle?: string
}) {
  const HintIcon = hintTone === "up" ? TrendingUp : hintTone === "down" ? TrendingDown : Minus
  const toneClass =
    hintTone === "up" ? "text-green-600" : hintTone === "down" ? "text-rose-600" : "text-muted-foreground"
  return (
    <Card className="shadow-sm" title={title}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
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
