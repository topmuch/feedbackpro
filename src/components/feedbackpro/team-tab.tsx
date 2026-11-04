"use client"

// ============================================================
// FeedbackPro - Onglet "Équipe & Leaderboard" (gamification, pivot Zones)
//   1. Top 5 du mois (GET /api/pro/leaderboard) : podium 🥇🥈🥉 +
//      BarChart Recharts (positifs vs négatifs) + badges de l'API
//   2. Liste des employés (GET /api/pro/employes) : actif (Switch),
//      ZONES DE TRAVAIL (chips multi-select → PATCH zoneIds),
//      stats, Modifier / Désactiver / Supprimer
//   3. Création (Dialog) plafonnée par PLAN_LIMITS[plan].employes
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Download, Loader2, Lock, MapPin, Pencil, Plus, Sparkles, ThumbsUp, Trash2, Trophy, Users } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Stars } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { PLANS, PLAN_LIMITS, PlanId } from "@/lib/constants"
import { exportToCsv } from "@/lib/export-csv"

// ---------- Contrats API (pivot Zones) ----------

// GET /api/pro/leaderboard → { top: [...], recommandations: [...] }
type TopLigne = {
  employeId: string
  nom: string
  poste: string | null
  positifs: number
  negatifs: number
  noteMoy: number
  nbRetours?: number
  tendance?: number
  badge: "Employé du mois" | "Entretien recommandé" | null
  // Task 3 — nouveaux badges : topPerformer, etoileMontante, regulier, enProgres, aSurveiller
  badges?: string[]
}

type PeriodeLeaderboard = "mois" | "trimestre" | "tout"

// Recommandation du Coach IA (Session 4, §6) : max 5, phrases motivées
type Recommandation = {
  employeId: string
  nom: string
  texte: string
  gravite: "attention" | "positif"
}

// GET /api/pro/employes → { employes: [...] }
type Employe = {
  id: string
  nom: string
  poste: string | null
  zoneIds: string[]
  actif: boolean
  zones: { id: string; nom: string }[]
  stats: { positifs: number; negatifs: number; noteMoy: number }
}

// GET /api/pro/zones → { zones: [...] } (pour les chips « zones de travail »)
type ZoneRef = { id: string; nom: string }

const MEDAILLES = ["🥇", "🥈", "🥉"]

/** Task 3 — Configuration des badges de gamification */
const BADGES_CONFIG: Record<
  string,
  { emoji: string; label: string; classe: string }
> = {
  topPerformer: {
    emoji: "🏆",
    label: "Top Performer",
    classe: "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  etoileMontante: {
    emoji: "⭐",
    label: "Étoile montante",
    classe: "bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  },
  regulier: {
    emoji: "🎯",
    label: "Régulier",
    classe: "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  enProgres: {
    emoji: "📈",
    label: "En progrès",
    classe: "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  aSurveiller: {
    emoji: "⚠️",
    label: "À surveiller",
    classe: "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  },
}

/** Garde-fou : renvoie toujours un tableau (l'API peut être en cours de migration) */
function enArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

/** Couleur du badge renvoyé par l'API leaderboard */
function classeBadge(badge: TopLigne["badge"]): string {
  if (badge === "Employé du mois") return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100"
  if (badge === "Entretien recommandé") return "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-50"
  return ""
}

/** Task 3 — Rendu d'un badge de gamification (chip colorée avec emoji + label) */
function BadgeGamification({ id }: { id: string }) {
  const cfg = BADGES_CONFIG[id]
  if (!cfg) return null
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-medium ${cfg.classe}`}>
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.label}
    </Badge>
  )
}

/** Task 3 — Formate la tendance (Δ vs période précédente) */
function formatTendance(t?: number): { texte: string; couleur: string } | null {
  if (t === undefined || t === 0) return null
  const signe = t > 0 ? "+" : ""
  const texte = `${signe}${t.toFixed(2)} vs période précédente`
  const couleur = t > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
  return { texte, couleur }
}

export function TeamTab() {
  const session = useAppStore((s) => s.session)
  // ProData finale (pivot Zones) — cast local pendant la migration du store
  const pro = session?.pro as unknown as { plan?: string } | null | undefined
  const updatePro = useAppStore((s) => s.updatePro)

  const [zones, setZones] = useState<ZoneRef[]>([])
  const [employes, setEmployes] = useState<Employe[]>([])
  const [top, setTop] = useState<TopLigne[]>([])
  const [recommandations, setRecommandations] = useState<Recommandation[]>([])
  const [loading, setLoading] = useState(true)
  // Task 3 — sélecteur de période pour le leaderboard
  const [periode, setPeriode] = useState<PeriodeLeaderboard>("mois")

  // Création
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [nouveauNom, setNouveauNom] = useState("")
  const [nouveauPoste, setNouveauPoste] = useState("")
  const [nouvellesZones, setNouvellesZones] = useState<string[]>([])
  const [savingCreation, setSavingCreation] = useState(false)

  // Modification
  const [employeModifie, setEmployeModifie] = useState<Employe | null>(null)
  const [editNom, setEditNom] = useState("")
  const [editPoste, setEditPoste] = useState("")
  const [editZones, setEditZones] = useState<string[]>([])
  const [savingEmploye, setSavingEmploye] = useState(false)

  const [toggleEnCours, setToggleEnCours] = useState<string | null>(null)
  const { toast } = useToast()

  const plan = ((pro?.plan as PlanId) || "STARTER") as PlanId
  const limiteEmployes = PLAN_LIMITS[plan]?.employes ?? PLAN_LIMITS.STARTER.employes
  const limiteAtteinte = limiteEmployes !== 999 && employes.length >= limiteEmployes

  // ---------- Chargement (3 fetchs en parallèle) ----------
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [resZones, resEmployes, resTop] = await Promise.all([
        fetch("/api/pro/zones", { cache: "no-store" }),
        fetch("/api/pro/employes", { cache: "no-store" }),
        // Task 3 — passe la période sélectionnée au leaderboard
        fetch(`/api/pro/leaderboard?periode=${periode}`, { cache: "no-store" }),
      ])
      const [jZones, jEmployes, jTop] = await Promise.all([resZones.json(), resEmployes.json(), resTop.json()])
      if (!jEmployes.ok) {
        toast({ title: "Erreur", description: jEmployes.error || "Impossible de charger l'équipe", variant: "destructive" })
        return
      }
      setEmployes(enArray(jEmployes.data.employes))
      if (jZones.ok) setZones(enArray(jZones.data.zones))
      if (jTop.ok) {
        setTop(enArray(jTop.data.top))
        setRecommandations(enArray(jTop.data.recommandations))
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger l'équipe", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast, periode])

  useEffect(() => {
    load()
  }, [load])

  // ---------- PATCH générique : rafraîchit la liste depuis la réponse ----------
  async function patchEmploye(
    id: string,
    champs: { nom?: string; poste?: string; zoneIds?: string[]; actif?: boolean }
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/pro/employes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...champs }),
      })
      const json = await res.json()
      if (json.ok) {
        // La réponse renvoie la liste complète { employes } ou l'employé { employe }
        if (json.data?.employes) setEmployes(enArray(json.data.employes))
        else if (json.data?.employe) {
          const maj = json.data.employe
          setEmployes((prev) => prev.map((e) => (e.id === id ? { ...e, ...maj } : e)))
        } else {
          await load()
        }
        return true
      }
      toast({ title: "Erreur", description: json.error || "Modification impossible", variant: "destructive" })
      return false
    } catch {
      toast({ title: "Erreur", description: "Modification impossible", variant: "destructive" })
      return false
    }
  }

  // Bascule d'une zone de travail : PATCH zoneIds avec le nouvel array
  async function basculerZone(e: Employe, zoneId: string) {
    const nouvelles = e.zoneIds.includes(zoneId)
      ? e.zoneIds.filter((z) => z !== zoneId)
      : [...e.zoneIds, zoneId]
    await patchEmploye(e.id, { zoneIds: nouvelles })
  }

  async function basculerActif(e: Employe) {
    if (toggleEnCours) return
    setToggleEnCours(e.id)
    await patchEmploye(e.id, { actif: !e.actif })
    setToggleEnCours(null)
  }

  async function supprimerEmploye(id: string) {
    try {
      const res = await fetch(`/api/pro/employes?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        if (json.data?.employes) setEmployes(enArray(json.data.employes))
        else setEmployes((prev) => prev.filter((e) => e.id !== id))
        toast({ title: "Employé supprimé", description: "Son historique de retours est conservé." })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" })
    }
  }

  async function creerEmploye() {
    const nom = nouveauNom.trim()
    if (nom.length < 2 || savingCreation) return
    setSavingCreation(true)
    try {
      const res = await fetch("/api/pro/employes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, poste: nouveauPoste.trim() || undefined, zoneIds: nouvellesZones }),
      })
      const json = await res.json()
      if (json.ok) {
        if (json.data?.employes) setEmployes(enArray(json.data.employes))
        else await load()
        toast({ title: "Employé ajouté ✓" })
        setCreationOuverte(false)
        setNouveauNom("")
        setNouveauPoste("")
        setNouvellesZones([])
      } else {
        toast({ title: "Erreur", description: json.error || "Création impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSavingCreation(false)
    }
  }

  function ouvrirModif(e: Employe) {
    setEmployeModifie(e)
    setEditNom(e.nom)
    setEditPoste(e.poste || "")
    setEditZones(e.zoneIds ?? [])
  }

  async function enregistrerEmploye() {
    if (!employeModifie || savingEmploye) return
    const nom = editNom.trim()
    if (nom.length < 2) return
    setSavingEmploye(true)
    const succes = await patchEmploye(employeModifie.id, { nom, poste: editPoste.trim(), zoneIds: editZones })
    setSavingEmploye(false)
    if (succes) {
      toast({ title: "Employé modifié ✓" })
      setEmployeModifie(null)
    }
  }

  // Passage au plan supérieur directement depuis le message d'upgrade (démo)
  async function passerPlanSuperieur() {
    const cible: PlanId = plan === "STARTER" ? "PRO" : "ENTERPRISE"
    try {
      const res = await fetch("/api/pro/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: cible }),
      })
      const json = await res.json()
      if (json.ok) {
        updatePro(json.data.pro)
        toast({ title: `Bienvenue dans le plan ${PLANS[cible].name} ! 🎉`, description: "Paiement simulé (démo)." })
        load()
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    }
  }

  // ---------- Rendus pendant le chargement ----------
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  // ---------- Données dérivées ----------
  const top5 = top.slice(0, 5) // déjà trié par l'API
  const podium = top5.slice(0, 3)
  const donneesChart = top5.map((l) => ({ nom: l.nom, positifs: l.positifs, negatifs: l.negatifs }))
  const montreChart = top5.some((l) => l.positifs > 0 || l.negatifs > 0)

  // Message d'upgrade quand la limite d'employés du plan est atteinte
  const messageUpgrade = limiteAtteinte && (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm text-amber-900">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Limite du plan {PLANS[plan].name} atteinte ({limiteEmployes} employé{limiteEmployes > 1 ? "s" : ""} maximum).
          Passez au plan {plan === "STARTER" ? "Pro" : "Enterprise"} pour agrandir votre équipe.
        </p>
      </div>
      <Button size="sm" className="h-9 shrink-0" onClick={passerPlanSuperieur}>
        <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
        {plan === "STARTER" ? `Passer au plan Pro — ${PLANS.PRO.price} €/mois` : "Passer Enterprise"}
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Équipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {employes.length} employé{employes.length > 1 ? "s" : ""} · leaderboard, mentions et zones de travail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() =>
              exportToCsv(
                `equipe-${new Date().toISOString().slice(0, 10)}`,
                employes.map((e) => ({
                  Nom: e.nom,
                  Poste: e.poste ?? "",
                  Actif: e.actif ? "Oui" : "Non",
                  Zones: e.zones.map((z) => z.nom).join(", "),
                  Positifs: e.stats.positifs,
                  Negatifs: e.stats.negatifs,
                  NoteMoyenne: e.stats.noteMoy ?? "",
                }))
              )
            }
            disabled={employes.length === 0}
            aria-label="Exporter l'équipe en CSV"
          >
            <Download className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Exporter CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          <Button
            className="h-9"
            disabled={limiteAtteinte}
            onClick={() => setCreationOuverte(true)}
            aria-label="Ajouter un employé"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Ajouter un employé
          </Button>
        </div>
      </div>

      {/* ================= Section 1 : Top 5 (classement mensuel/trimestriel/global) ================= */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
                {periode === "mois" && "Top 5 du mois"}
                {periode === "trimestre" && "Top 5 du trimestre"}
                {periode === "tout" && "Classement global"}
              </CardTitle>
              <CardDescription>
                {periode === "mois" && "Classement de vos employés sur les 30 derniers jours"}
                {periode === "trimestre" && "Classement de vos employés sur les 90 derniers jours"}
                {periode === "tout" && "Classement de vos employés sur 1 an (toutes périodes)"}
              </CardDescription>
            </div>
            {/* Task 3 — sélecteur de période */}
            <div className="flex shrink-0 items-center gap-1 rounded-full border bg-muted/50 p-0.5">
              {(["mois", "trimestre", "tout"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriode(p)}
                  aria-pressed={periode === p}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    periode === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "mois" && "Ce mois"}
                  {p === "trimestre" && "Ce trimestre"}
                  {p === "tout" && "Tout"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {top5.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun retour mentionnant un employé sur cette période.
            </p>
          ) : (
            <div className="space-y-5">
              {/* Podium 🥇🥈🥉 */}
              {podium.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {podium.map((l, i) => (
                    <div
                      key={l.employeId}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center ${
                        i === 0 ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : ""
                      }`}
                    >
                      <span className="text-3xl" aria-hidden>
                        {MEDAILLES[i]}
                      </span>
                      <p className="font-bold leading-tight">{l.nom}</p>
                      {l.poste && <p className="text-xs text-muted-foreground">{l.poste}</p>}
                      <Stars note={l.noteMoy} size={13} />
                      <span className="text-sm font-semibold">{l.noteMoy || "—"}</span>
                      {/* Task 3 — badges de gamification */}
                      {l.badges && l.badges.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {l.badges.map((b) => (
                            <BadgeGamification key={b} id={b} />
                          ))}
                        </div>
                      )}
                      {/* Legacy badge (compat) */}
                      {l.badge && (
                        <Badge variant="outline" className={classeBadge(l.badge)}>
                          {l.badge === "Employé du mois" ? "🏆" : "⚠️"} {l.badge}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* BarChart positifs vs négatifs */}
              {montreChart && (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={donneesChart} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                      <XAxis dataKey="nom" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => [`${v} mention(s)`, ""]} labelStyle={{ color: "#1c1917" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="positifs" name="Mentions positives" fill="#16a34a" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="negatifs" name="Mentions négatives" fill="#e11d48" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Liste détaillée du top 5 */}
              <ul className="space-y-2">
                {top5.map((l, i) => {
                  const tendance = formatTendance(l.tendance)
                  return (
                    <li
                      key={l.employeId}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        i === 0 && l.noteMoy >= 4 ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      {i < 3 ? (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center text-xl" aria-hidden>
                          {MEDAILLES[i]}
                        </span>
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                          {i + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="font-medium leading-tight">{l.nom}</p>
                          {l.poste && <p className="text-xs text-muted-foreground">{l.poste}</p>}
                          {/* Task 3 — badges de gamification */}
                          {l.badges?.map((b) => (
                            <BadgeGamification key={b} id={b} />
                          ))}
                          {l.badge && (
                            <Badge variant="outline" className={classeBadge(l.badge)}>
                              {l.badge === "Employé du mois" ? "🏆" : "⚠️"} {l.badge}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="flex items-center gap-1.5">
                            <Stars note={l.noteMoy} size={13} />
                            <span className="text-sm font-bold">{l.noteMoy || "—"}</span>
                          </span>
                          <Badge variant="outline" className="text-green-700 border-green-300">
                            +{l.positifs} positif{l.positifs > 1 ? "s" : ""}
                          </Badge>
                          {l.negatifs > 0 && (
                            <Badge variant="outline" className="text-rose-700 border-rose-300">
                              −{l.negatifs} négatif{l.negatifs > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {l.nbRetours !== undefined && (
                            <span className="text-[11px] text-muted-foreground">
                              {l.nbRetours} retour{l.nbRetours > 1 ? "s" : ""}
                            </span>
                          )}
                          {tendance && (
                            <span className={`text-[11px] font-medium ${tendance.couleur}`}>
                              {tendance.texte}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= Section 1 bis : Recommandations du Coach IA ================= */}
      {recommandations.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              Recommandations du Coach IA
            </CardTitle>
            <CardDescription>🤖 Actions suggérées automatiquement à partir des retours de votre équipe</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {recommandations.map((r, i) => {
              const positif = r.gravite === "positif"
              return (
                <div
                  key={`${r.employeId}-${i}`}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                    positif ? "border-green-200 bg-green-50/60" : "border-rose-200 bg-rose-50/60"
                  }`}
                >
                  {positif ? (
                    <ThumbsUp className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                  )}
                  <p className="min-w-0 text-sm leading-relaxed">{r.texte}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ================= Section 2 : Liste des employés ================= */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" aria-hidden />
                Liste des employés
              </CardTitle>
              <CardDescription className="mt-1">
                {employes.length} employé{employes.length > 1 ? "s" : ""} · limite du plan {PLANS[plan].name} :{" "}
                {limiteEmployes === 999 ? "illimitée" : limiteEmployes} · affectez des zones de travail pour cibler les retours
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {messageUpgrade}
          {employes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun employé — ajoutez votre équipe pour activer le leaderboard (les clients pourront mentionner qui les a
              servis dans chaque zone).
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {employes.map((e) => {
                // Task 3 — récupère les badges de l'employé depuis le leaderboard
                const topLigne = top.find((t) => t.employeId === e.id)
                const badges = topLigne?.badges ?? []
                const tendance = formatTendance(topLigne?.tendance)
                return (
                <div key={e.id} className={`rounded-xl border p-3 sm:p-4 ${!e.actif ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
                    {/* Identité */}
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                        aria-hidden
                      >
                        {e.nom.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 font-bold leading-tight">
                          <span className="truncate">{e.nom}</span>
                          {!e.actif && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Inactif
                            </Badge>
                          )}
                        </p>
                        {e.poste && <p className="text-xs text-muted-foreground">{e.poste}</p>}
                        {/* Task 3 — badges de gamification (classement période) */}
                        {badges.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {badges.map((b) => (
                              <BadgeGamification key={b} id={b} />
                            ))}
                            {tendance && (
                              <span className={`text-[10px] font-medium ${tendance.couleur}`}>
                                {tendance.texte}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Score moyen + mentions */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="flex items-center gap-1.5">
                        <Stars note={e.stats?.noteMoy ?? 0} size={13} />
                        <span className="text-sm font-semibold">{e.stats?.noteMoy || "—"}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          +{e.stats?.positifs ?? 0}
                        </Badge>
                        {(e.stats?.negatifs ?? 0) > 0 && (
                          <Badge variant="outline" className="text-rose-700 border-rose-300">
                            −{e.stats?.negatifs}
                          </Badge>
                        )}
                      </span>
                    </div>
                    {/* Actions : Modifier / actif / Supprimer */}
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="icon" aria-label={`Modifier ${e.nom}`} onClick={() => ouvrirModif(e)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Switch
                        checked={e.actif}
                        onCheckedChange={() => basculerActif(e)}
                        disabled={toggleEnCours === e.id}
                        aria-label={`${e.actif ? "Désactiver" : "Réactiver"} ${e.nom}`}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Supprimer ${e.nom}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer {e.nom} ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              L&apos;employé sera retiré de votre équipe. Les retours le concernant seront conservés mais
                              désassociés de son profil.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-rose-600 hover:bg-rose-700"
                              onClick={() => supprimerEmploye(e.id)}
                            >
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Zones de travail : chips multi-select (toggle → PATCH zoneIds) */}
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Zones de travail
                    </p>
                    {zones.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Créez d&apos;abord des zones dans l&apos;onglet « Zones » pour les affecter à vos employés.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {zones.map((z) => {
                          const actif = e.zoneIds.includes(z.id)
                          return (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => basculerZone(e, z.id)}
                              aria-pressed={actif}
                              aria-label={`Zone ${z.nom} — ${actif ? "retirer" : "affecter"} à ${e.nom}`}
                              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                                actif
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                              }`}
                            >
                              <MapPin className="h-3 w-3" aria-hidden />
                              {z.nom}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {e.zones?.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Actuellement : {e.zones.map((z) => z.nom).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Dialogue création employé ---------- */}
      <Dialog open={creationOuverte} onOpenChange={setCreationOuverte}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un employé</DialogTitle>
            <DialogDescription>
              Il apparaîtra dans le leaderboard et pourra être mentionné par les clients.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              creerEmploye()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="emp-nom">Nom *</Label>
              <Input
                id="emp-nom"
                value={nouveauNom}
                onChange={(ev) => setNouveauNom(ev.target.value)}
                required
                minLength={2}
                placeholder="Ex. Julie Martin"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-poste">Poste (optionnel)</Label>
              <Input
                id="emp-poste"
                value={nouveauPoste}
                onChange={(ev) => setNouveauPoste(ev.target.value)}
                placeholder="Ex. Serveur, Pizzaiolo…"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Zones de travail</Label>
              {zones.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucune zone disponible — vous pourrez les affecter plus tard.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {zones.map((z) => {
                    const actif = nouvellesZones.includes(z.id)
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() =>
                          setNouvellesZones((prev) =>
                            prev.includes(z.id) ? prev.filter((x) => x !== z.id) : [...prev, z.id]
                          )
                        }
                        aria-pressed={actif}
                        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                          actif
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <MapPin className="h-3 w-3" aria-hidden />
                        {z.nom}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreationOuverte(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={savingCreation || nouveauNom.trim().length < 2}>
                {savingCreation && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Ajouter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialogue modification employé ---------- */}
      <Dialog open={!!employeModifie} onOpenChange={(o) => !o && setEmployeModifie(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;employé</DialogTitle>
            <DialogDescription>Mettez à jour le nom, le poste ou les zones de l&apos;employé.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              enregistrerEmploye()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-nom">Nom</Label>
              <Input
                id="edit-nom"
                value={editNom}
                onChange={(ev) => setEditNom(ev.target.value)}
                required
                minLength={2}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-poste">Poste (optionnel)</Label>
              <Input
                id="edit-poste"
                value={editPoste}
                onChange={(ev) => setEditPoste(ev.target.value)}
                placeholder="Ex. Serveur, Pizzaiolo…"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Zones de travail</Label>
              {zones.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune zone disponible.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {zones.map((z) => {
                    const actif = editZones.includes(z.id)
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() =>
                          setEditZones((prev) =>
                            prev.includes(z.id) ? prev.filter((x) => x !== z.id) : [...prev, z.id]
                          )
                        }
                        aria-pressed={actif}
                        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors ${
                          actif
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <MapPin className="h-3 w-3" aria-hidden />
                        {z.nom}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmployeModifie(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={savingEmploye}>
                {savingEmploye && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
