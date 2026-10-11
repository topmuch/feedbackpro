"use client"

// ============================================================
// FeedbackPro - Onglet "Équipe & Leaderboard" (gamification)
// Session 4 — 3 sections :
//   1. Top 5 du mois (médailles 🥇🥈🥉 + graphique en barres Recharts)
//   2. Liste des employés (Modifier / Désactiver)
//   3. Recommandations automatiques (seuils API : >10 mentions négatives → entretien,
//      >20 mentions positives → employé du mois)
// Disponible à partir du plan Pro (paywall Starter conservé)
// ============================================================

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, Lock, Pencil, Sparkles, Trophy, Users } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Stars } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { PLANS, PlanId } from "@/lib/constants"

// ---------- Contrats API ----------

// Ligne du leaderboard : GET /api/pro/leaderboard (tout historique) et ?jours=30 (30 derniers jours)
type Ligne = {
  id: string
  nom: string
  poste: string | null
  actif: boolean
  nbRetours: number
  noteMoyenne: number
  mentionsPositives: number
  mentionsNegatives: number
  topTagsNegatifs: { tag: string; count: number }[]
  alerteEntretien: boolean
  employeDuMois: boolean
  recommandations: string[]
}

// Employé renvoyé par GET/PATCH /api/pro/employes
type EmployeLigne = Pick<
  Ligne,
  "id" | "nom" | "poste" | "actif" | "nbRetours" | "noteMoyenne" | "mentionsPositives" | "mentionsNegatives"
>

const MEDAILLES = ["🥇", "🥈", "🥉"]

// Projection Ligne → Employé (les deux API partagent ces champs de base)
function versEmploye(l: Ligne): EmployeLigne {
  return {
    id: l.id,
    nom: l.nom,
    poste: l.poste,
    actif: l.actif,
    nbRetours: l.nbRetours,
    noteMoyenne: l.noteMoyenne,
    mentionsPositives: l.mentionsPositives,
    mentionsNegatives: l.mentionsNegatives,
  }
}

export function TeamTab() {
  const session = useAppStore((s) => s.session)
  const updatePro = useAppStore((s) => s.updatePro)
  const [lignes, setLignes] = useState<Ligne[]>([]) // tout l'historique
  const [duMois, setDuMois] = useState<Ligne[]>([]) // 30 derniers jours
  const [employes, setEmployes] = useState<EmployeLigne[]>([])
  const [loading, setLoading] = useState(true)
  const [planChoisi, setPlanChoisi] = useState<PlanId | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const [employeModifie, setEmployeModifie] = useState<EmployeLigne | null>(null)
  const [editNom, setEditNom] = useState("")
  const [editPoste, setEditPoste] = useState("")
  const [savingEmploye, setSavingEmploye] = useState(false)
  const [toggleEnCours, setToggleEnCours] = useState<string | null>(null)
  const { toast } = useToast()

  const plan = (session?.pro?.plan || "STARTER") as PlanId
  const debloque = plan === "PRO" || plan === "ENTERPRISE"

  // Chargement : 2 fetchs en parallèle (tout l'historique + 30 derniers jours pour le Top du mois)
  async function load() {
    setLoading(true)
    try {
      const [resTout, resMois] = await Promise.all([
        fetch("/api/pro/leaderboard", { cache: "no-store" }),
        fetch("/api/pro/leaderboard?jours=30", { cache: "no-store" }),
      ])
      const jsonTout = await resTout.json()
      const jsonMois = await resMois.json()
      if (!jsonTout.ok || !jsonMois.ok) {
        toast({
          title: "Erreur",
          description: jsonTout.error || jsonMois.error || "Impossible de charger le classement",
          variant: "destructive",
        })
        return
      }
      const classement: Ligne[] = jsonTout.data.classement
      setLignes(classement)
      setDuMois(jsonMois.data.classement)
      // Liste des employés = mêmes données de base, tri API /api/pro/employes (actifs d'abord puis A→Z)
      setEmployes(
        classement
          .map(versEmploye)
          .sort((a, b) => Number(b.actif) - Number(a.actif) || a.nom.localeCompare(b.nom, "fr"))
      )
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger le classement", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // PATCH /api/pro/employes : rafraîchit la liste des employés et resynchronise
  // nom/poste/actif dans les deux classements (Top du mois + recommandations)
  async function patchEmploye(id: string, champs: { nom?: string; poste?: string; actif?: boolean }): Promise<boolean> {
    try {
      const res = await fetch("/api/pro/employes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...champs }),
      })
      const json = await res.json()
      if (json.ok) {
        const liste: EmployeLigne[] = json.data.employes
        setEmployes(liste)
        const maj = new Map(liste.map((e) => [e.id, e] as const))
        const resync = (l: Ligne): Ligne => {
          const e = maj.get(l.id)
          return e ? { ...l, nom: e.nom, poste: e.poste, actif: e.actif } : l
        }
        setLignes((prev) => prev.map(resync))
        setDuMois((prev) => prev.map(resync))
        return true
      }
      toast({ title: "Erreur", description: json.error || "Modification impossible", variant: "destructive" })
      return false
    } catch {
      toast({ title: "Erreur", description: "Modification impossible", variant: "destructive" })
      return false
    }
  }

  function ouvrirModif(e: EmployeLigne) {
    setEmployeModifie(e)
    setEditNom(e.nom)
    setEditPoste(e.poste || "")
  }

  async function enregistrerEmploye() {
    if (!employeModifie || savingEmploye) return
    const nom = editNom.trim()
    if (nom.length < 2) return
    setSavingEmploye(true)
    const succes = await patchEmploye(employeModifie.id, { nom, poste: editPoste.trim() })
    setSavingEmploye(false)
    if (succes) {
      toast({ title: "Employé modifié ✓" })
      setEmployeModifie(null)
    }
  }

  async function basculerActif(e: EmployeLigne) {
    if (toggleEnCours) return
    setToggleEnCours(e.id)
    await patchEmploye(e.id, { actif: !e.actif })
    setToggleEnCours(null)
  }

  async function changerPlan() {
    if (!planChoisi) return
    setUpgrade(true)
    try {
      const res = await fetch("/api/pro/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planChoisi }),
      })
      const json = await res.json()
      if (json.ok) {
        updatePro(json.data.pro)
        toast({ title: `Bienvenue dans le plan ${PLANS[planChoisi].name} ! 🎉`, description: "Paiement simulé (démo)." })
        setPlanChoisi(null)
        load()
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } finally {
      setUpgrade(false)
    }
  }

  // Dialogue changement de plan (rendu derrière le paywall ET dans le contenu)
  const dialoguePlan = (
    <Dialog open={!!planChoisi} onOpenChange={(o) => !o && setPlanChoisi(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Passer au plan {planChoisi ? PLANS[planChoisi].name : ""}</DialogTitle>
          <DialogDescription>
            {planChoisi ? `${PLANS[planChoisi].price} €/mois — paiement sécurisé (démo), résiliable à tout moment.` : ""}
          </DialogDescription>
        </DialogHeader>
        {planChoisi && (
          <ul className="space-y-2 text-sm">
            {PLANS[planChoisi].features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPlanChoisi(null)}>
            Annuler
          </Button>
          <Button onClick={changerPlan} disabled={upgrade}>
            {upgrade && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Confirmer l&apos;abonnement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  // ---------- Paywall Starter ----------
  if (!debloque) {
    return (
      <>
        <Card className="overflow-hidden">
          <CardContent className="p-8 sm:p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10" aria-hidden>
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mt-4 text-xl sm:text-2xl font-bold">Gamification réservée au plan Pro</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Débloquez le leaderboard de vos employés, les mentions positives/négatives par personne et les
              recommandations automatiques de management.
            </p>
            <div className="mx-auto mt-6 flex max-w-sm flex-col sm:flex-row gap-2.5">
              <Button className="flex-1 h-11" onClick={() => setPlanChoisi("PRO")}>
                Passer au plan Pro — {PLANS.PRO.price} €/mois
              </Button>
              <Button variant="outline" className="flex-1 h-11" onClick={() => setPlanChoisi("ENTERPRISE")}>
                Enterprise
              </Button>
            </div>
          </CardContent>
        </Card>
        {dialoguePlan}
      </>
    )
  }

  // ---------- Données dérivées ----------
  const lignesMois = duMois.filter((l) => l.actif && l.nbRetours >= 1)
  const top5 = lignesMois.slice(0, 5) // déjà trié par l'API
  const montreChart = top5.some((l) => (l.noteMoyenne || 0) > 0)
  const lignesAvecRecos = lignes.filter((l) => l.recommandations.length > 0)

  return (
    <div className="space-y-6">
      {/* ================= Section 1 : Top 5 du mois ================= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
            Top 5 du mois
          </CardTitle>
          <CardDescription>Classement sur les 30 derniers jours</CardDescription>
        </CardHeader>
        <CardContent>
          {top5.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun retour mentionnant un employé ce mois-ci.
            </p>
          ) : (
            <>
              {montreChart && (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={top5.map((l) => ({ nom: l.nom, note: l.noteMoyenne || 0 }))}
                      margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" domain={[0, 5]} hide />
                      {/* reversed : le nº1 du classement apparaît en haut du graphique */}
                      <YAxis
                        type="category"
                        dataKey="nom"
                        width={110}
                        reversed
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip formatter={(v) => [`${v} ★`, "Note"]} labelStyle={{ color: "#1c1917" }} />
                      <Bar dataKey="note" fill="#2563eb" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className={montreChart ? "mt-4 space-y-2" : "space-y-2"}>
                {top5.map((l, i) => (
                  <li
                    key={l.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      i === 0 && l.noteMoyenne >= 4 && l.nbRetours >= 3 ? "border-amber-300 bg-amber-50/50" : ""
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
                        {l.employeDuMois && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                            🏆 Employé du mois
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="flex items-center gap-1.5">
                          <Stars note={l.noteMoyenne} size={13} />
                          <span className="text-sm font-bold">{l.noteMoyenne || "—"}</span>
                        </span>
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          +{l.mentionsPositives} positif{l.mentionsPositives > 1 ? "s" : ""}
                        </Badge>
                        {l.mentionsNegatives > 0 && (
                          <Badge variant="outline" className="text-rose-700 border-rose-300">
                            −{l.mentionsNegatives} négatif{l.mentionsNegatives > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* ================= Section 2 : Liste des employés ================= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden />
            Liste des employés
          </CardTitle>
          <CardDescription>
            {employes.length} employé{employes.length > 1 ? "s" : ""} — score moyen et mentions des clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {employes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ajoutez vos employés dans l&apos;onglet Paramètres pour activer la gamification.
            </p>
          ) : (
            employes.map((e) => (
              <div key={e.id} className={`rounded-xl border p-3 sm:p-4 ${!e.actif ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
                  {/* Nom + poste */}
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
                  </div>
                  {/* Score moyen + mentions */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="flex items-center gap-1.5">
                      <Stars note={e.noteMoyenne} size={13} />
                      <span className="text-sm font-semibold">{e.noteMoyenne || "—"}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-green-700 border-green-300">
                        +{e.mentionsPositives}
                      </Badge>
                      {e.mentionsNegatives > 0 && (
                        <Badge variant="outline" className="text-rose-700 border-rose-300">
                          −{e.mentionsNegatives}
                        </Badge>
                      )}
                    </span>
                  </div>
                  {/* Actions : Modifier / Désactiver */}
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" aria-label={`Modifier ${e.nom}`} onClick={() => ouvrirModif(e)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Switch
                      checked={e.actif}
                      onCheckedChange={() => basculerActif(e)}
                      disabled={toggleEnCours === e.id}
                      aria-label={`Activer ou désactiver ${e.nom}`}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ================= Section 3 : Recommandations automatiques ================= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            Recommandations automatiques
          </CardTitle>
          <CardDescription>Basées sur les mentions clients (tout historique).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lignesAvecRecos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune recommandation — votre équipe est au top !
            </p>
          ) : (
            lignesAvecRecos.map((l) => {
              // Alerte entretien : libellé API en premier (commence par « Entretien recommandé »)
              const recAlerte = l.alerteEntretien
                ? l.recommandations.find((r) => r.startsWith("Entretien recommandé")) ||
                  `Entretien recommandé — ${l.mentionsNegatives} mentions négatives détectées`
                : ""
              const autres = l.actif ? l.recommandations.filter((r) => r !== recAlerte) : l.recommandations
              return (
                <div key={l.id} className={`rounded-xl border p-3 sm:p-4 ${!l.actif ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium leading-tight">{l.nom}</p>
                    {l.employeDuMois && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                        🏆 Employé du mois
                      </Badge>
                    )}
                  </div>
                  {l.actif && recAlerte && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>{recAlerte}</span>
                    </div>
                  )}
                  {autres.length > 0 && (
                    <ul className={l.actif && recAlerte ? "mt-2.5 space-y-1.5" : "mt-2 space-y-1.5"}>
                      {autres.map((rec, j) => {
                        const negatif = rec.toLowerCase().includes("entretien")
                        const positif =
                          rec.includes("féliciter") || rec.includes("Valeur sûre") || rec.includes("Employé du mois")
                        return (
                          <li
                            key={j}
                            className={`flex items-start gap-1.5 text-xs ${
                              negatif ? "text-rose-800" : positif ? "text-green-800" : "text-muted-foreground"
                            }`}
                          >
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" aria-hidden />
                            <span className="min-w-0">{rec}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* ---------- Dialogue modification employé ---------- */}
      <Dialog open={!!employeModifie} onOpenChange={(o) => !o && setEmployeModifie(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;employé</DialogTitle>
            <DialogDescription>Mettez à jour le nom ou le poste de l&apos;employé.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              enregistrerEmploye()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="employe-nom">Nom</Label>
              <Input
                id="employe-nom"
                value={editNom}
                onChange={(ev) => setEditNom(ev.target.value)}
                required
                minLength={2}
                placeholder="Ex. Julie Martin"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employe-poste">Poste (optionnel)</Label>
              <Input
                id="employe-poste"
                value={editPoste}
                onChange={(ev) => setEditPoste(ev.target.value)}
                placeholder="Ex. Serveur, Pizzaiolo…"
                autoComplete="off"
              />
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

      {/* ---------- Dialogue changement de plan ---------- */}
      {dialoguePlan}
    </div>
  )
}
