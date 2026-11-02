"use client"

// ============================================================
// FeedbackPro - Onglet « Actions » du dashboard Pro (Session 1)
// Historique des décisions managériales : pour chaque retour
// sensible (≤ 3★ ou déjà suivi), l'action prise + le statut
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Check,
  Loader2,
  MessageSquare,
  User,
  Sparkles,
  Lightbulb,
  Plus,
  Flame,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Stars, formatDate } from "@/components/feedbackpro/shared"
import { cn } from "@/lib/utils"
import { STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"

// ---------- Types (contrat GET/PATCH /api/pro/retours + GET /api/pro/coach) ----------

type RetourItem = {
  id: string
  note: number
  tags?: string[]
  commentaire?: string | null
  personnelMentionne?: string | null
  statut: string
  reponsePro?: string | null
  actionPrise?: string | null
  createdAt: string
  zone?: { nom?: string } | null
  employe?: { nom?: string } | null
}

type VueLocale = "atraiter" | "toutes"

/** Réponse partielle de GET /api/pro/coach (on garde priorités structurées + recommandations). */
type PrioriteStructuree = {
  niveau: "critique" | "important" | "suggestion"
  titre: string
  description: string
  recommandation: string
  zoneNom?: string
  retourIds: string[]
}

type CoachDataPartiel = {
  dernierRapport?: {
    recommandations?: string[]
    priorites?: string[]
  } | null
  prioritesDuJour?: string[]
  /** Session 4 : priorités STRUCTURÉES (3 priorités du jour avec titre + reco) */
  accueil?: {
    priorites: PrioriteStructuree[]
  } | null
}

/** Retours pertinents pour le suivi managérial : déjà pris en charge OU note ≤ 3 */
function estPertinent(r: RetourItem): boolean {
  return r.statut === "IN_PROGRESS" || r.statut === "RESOLVED" || r.note <= 3
}

export function ActionsTab() {
  const { toast } = useToast()

  const [retours, setRetours] = useState<RetourItem[]>([])
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState<VueLocale>("atraiter")

  // ---------- Recommandations du Coach IA (audit UX) ----------
  const [recommandations, setRecommandations] = useState<string[]>([])
  const [prioritesStructurees, setPrioritesStructurees] = useState<PrioriteStructuree[]>([])
  const [recoLoading, setRecoLoading] = useState(true)
  // Dialogue « Créer une action » pré-rempli avec une recommandation IA
  const [recoActive, setRecoActive] = useState<string | null>(null)
  const [recoTexte, setRecoTexte] = useState("")
  const [recoRetourId, setRecoRetourId] = useState("")
  const [recoEnvoi, setRecoEnvoi] = useState(false)

  // ---------- Chargement (pages successives jusqu'au total) ----------
  const charger = useCallback(async () => {
    setLoading(true)
    try {
      const acc: RetourItem[] = []
      let total = Infinity
      for (let page = 1; page <= 20 && acc.length < total; page++) {
        const res = await fetch(`/api/pro/retours?page=${page}`, { cache: "no-store" })
        const json = await res.json()
        if (!json?.ok) {
          if (page === 1) {
            toast({ title: "Erreur", description: json?.error || "Impossible de charger les retours", variant: "destructive" })
          }
          break
        }
        const items: RetourItem[] = json.data?.retours ?? []
        total = typeof json.data?.total === "number" ? json.data.total : acc.length + items.length
        acc.push(...items)
        if (items.length === 0) break
      }
      setRetours(acc.filter(estPertinent))
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de charger les actions", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  // ---------- Recommandations IA (GET /api/pro/coach) ----------
  useEffect(() => {
    let annule = false
    fetch("/api/pro/coach", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j?.ok) {
          const data = j.data as CoachDataPartiel
          // Priorités STRUCTURÉES du jour (3 priorités avec titre + reco) — audit UX
          const priorites = data.accueil?.priorites ?? []
          setPrioritesStructurees(Array.isArray(priorites) ? priorites.slice(0, 3) : [])
          // Recommandations (fallback) : priorité au rapport IA, sinon aux priorités du jour
          const recos = data.dernierRapport?.recommandations ?? data.prioritesDuJour ?? []
          setRecommandations(Array.isArray(recos) ? recos.filter((r) => typeof r === "string" && r.trim()) : [])
        }
      })
      .catch(() => {
        /* silencieux : la section reste masquée si l'API échoue */
      })
      .finally(() => {
        if (!annule) setRecoLoading(false)
      })
    return () => {
      annule = true
    }
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  /** Met à jour un retour dans la liste locale après un PATCH réussi */
  function majRetour(r: RetourItem) {
    setRetours((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...r } : x)))
  }

  // ---------- Compteurs + listes filtrées ----------
  const pertinents = retours
  const aTraiter = pertinents.filter((r) => !r.actionPrise)
  const enCours = pertinents.filter((r) => r.statut === "IN_PROGRESS")
  const resolus = pertinents.filter((r) => r.statut === "RESOLVED")
  const listeAffichee = vue === "atraiter" ? aTraiter : pertinents

  // ---------- Dialogue « Créer une action » (pré-rempli depuis une reco IA) ----------
  function ouvrirReco(reco: string) {
    setRecoActive(reco)
    setRecoTexte(reco)
    setRecoRetourId(aTraiter[0]?.id ?? "")
  }

  function fermerReco() {
    setRecoActive(null)
    setRecoTexte("")
    setRecoRetourId("")
  }

  async function appliquerReco() {
    if (!recoRetourId || !recoTexte.trim() || recoEnvoi) return
    setRecoEnvoi(true)
    try {
      const res = await fetch("/api/pro/retours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recoRetourId, actionPrise: recoTexte.trim() }),
      })
      const json = await res.json()
      if (res.ok && json?.ok) {
        maj(json.data?.retour ?? { id: recoRetourId, actionPrise: recoTexte.trim() })
        toast({
          title: "Action créée ✅",
          description: "La recommandation a été appliquée à un retour et archivée dans l'historique.",
        })
        fermerReco()
      } else {
        toast({ title: "Erreur", description: json?.error || "Enregistrement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setRecoEnvoi(false)
    }
  }

  function maj(r: RetourItem) {
    setRetours((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...r } : x)))
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Actions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque réclamation et chaque retour ≤ 3★ attend une décision : notez l&apos;action prise pour
            construire l&apos;historique qualité de votre établissement.
          </p>
        </div>
      </div>

      {/* ---------- 💡 Recommandations du Coach IA (audit UX) ---------- */}
      <section aria-labelledby="titre-recommandations-ia">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <h2 id="titre-recommandations-ia" className="text-base font-semibold sm:text-lg">
            💡 Recommandations du Coach IA
          </h2>
        </div>
        {recoLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : prioritesStructurees.length > 0 ? (
          // 3 priorités du jour STRUCTURÉES (🔥 critique / ⚠️ important / 💡 suggestion)
          <div className="grid gap-3 md:grid-cols-3">
            {prioritesStructurees.map((p, i) => {
              const IconeNiveau =
                p.niveau === "critique" ? Flame : p.niveau === "important" ? AlertTriangle : Lightbulb
              const badgeClass =
                p.niveau === "critique"
                  ? "border-red-300 bg-red-100 text-red-700"
                  : p.niveau === "important"
                    ? "border-amber-300 bg-amber-100 text-amber-700"
                    : "border-violet-300 bg-violet-100 text-violet-700"
              const libelle = p.niveau === "critique" ? "Urgent" : p.niveau === "important" ? "Important" : "Suggestion"
              const emoji = p.niveau === "critique" ? "🔥" : p.niveau === "important" ? "⚠️" : "💡"
              return (
                <Card key={i} className="flex flex-col shadow-sm">
                  <CardContent className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">
                        {emoji} {p.titre}
                      </p>
                      <Badge variant="outline" className={cn("shrink-0 gap-1", badgeClass)}>
                        <IconeNiveau className="h-3 w-3" aria-hidden />
                        {libelle}
                      </Badge>
                    </div>
                    {p.zoneNom && (
                      <Badge variant="secondary" className="w-fit text-[11px]">
                        📍 {p.zoneNom}
                      </Badge>
                    )}
                    <p className="text-sm leading-relaxed text-muted-foreground">{p.recommandation}</p>
                    <div className="mt-auto flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ouvrirReco(p.recommandation)}
                        disabled={aTraiter.length === 0}
                        title={aTraiter.length === 0 ? "Aucun retour à traiter pour le moment" : "Pré-remplir le formulaire d'action"}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Créer une action
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : recommandations.length === 0 ? (
          <Card className="border-primary/20 bg-primary/[0.03] shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2.5" aria-hidden>
                <Lightbulb className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Le Coach IA analysera vos données dès que vous aurez assez de retours. Continuez à
                collecter les avis de vos clients — vos premières recommandations actionnables
                apparaîtront ici.
              </p>
            </CardContent>
          </Card>
        ) : (
          // Fallback : recommandations textuelles brutes (max 3)
          <div className="grid gap-3 md:grid-cols-3">
            {recommandations.slice(0, 3).map((reco, i) => (
              <Card key={i} className="flex flex-col shadow-sm">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed">{reco}</p>
                  </div>
                  <div className="mt-auto flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ouvrirReco(reco)}
                      disabled={aTraiter.length === 0}
                      title={aTraiter.length === 0 ? "Aucun retour à traiter pour le moment" : "Pré-remplir le formulaire d'action"}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Créer une action
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-3">
        <Compteur label="À traiter" valeur={aTraiter.length} ton={aTraiter.length > 0 ? "ambre" : "vert"} />
        <Compteur label="En cours" valeur={enCours.length} ton="bleu" />
        <Compteur label="Résolus" valeur={resolus.length} ton="vert" />
      </div>

      {/* Bascule locale À traiter / Toutes */}
      <div className="flex w-fit rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Filtrer les actions">
        <button
          type="button"
          role="tab"
          aria-selected={vue === "atraiter"}
          onClick={() => setVue("atraiter")}
          className={cn(
            "h-8 rounded-md px-3 text-sm transition-colors",
            vue === "atraiter" ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          À traiter ({aTraiter.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vue === "toutes"}
          onClick={() => setVue("toutes")}
          className={cn(
            "h-8 rounded-md px-3 text-sm transition-colors",
            vue === "toutes" ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Toutes ({pertinents.length})
        </button>
      </div>

      {/* Squelettes */}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : listeAffichee.length === 0 ? (
        // Empty states
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-4" aria-hidden>
              <Check className="h-8 w-8 text-primary" />
            </div>
            {vue === "atraiter" ? (
              <>
                <p className="font-medium">Tout est sous contrôle 🎉</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Aucune action en attente. Consultez la vue « Toutes » pour revoir l&apos;historique de vos
                  décisions.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Aucune action à suivre pour l&apos;instant</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Les réclamations et les retours de 3★ ou moins apparaîtront ici pour que vous notiez
                  l&apos;action managériale correspondante.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        // Liste scrollable
        <div className="max-h-[70vh] space-y-3 overflow-y-auto custom-scrollbar pr-1">
          {listeAffichee.map((r) => (
            <CarteAction key={r.id} retour={r} maj={majRetour} />
          ))}
        </div>
      )}

      {/* ---------- Dialogue : Créer une action (pré-rempli depuis une reco IA) ---------- */}
      <Dialog open={recoActive !== null} onOpenChange={(o) => (!o ? fermerReco() : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              Créer une action
            </DialogTitle>
            <DialogDescription>
              Pré-remplie depuis une recommandation du Coach IA. Affectez-la à un retour à traiter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reco-texte">Action managériale</Label>
              <Textarea
                id="reco-texte"
                rows={3}
                value={recoTexte}
                onChange={(e) => setRecoTexte(e.target.value)}
                placeholder="Décrivez l'action à mener…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reco-retour">Affecter à un retour à traiter</Label>
              {aTraiter.length === 0 ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Aucun retour à traiter pour le moment — la recommandation sera conservée pour plus tard.
                </p>
              ) : (
                <Select value={recoRetourId} onValueChange={setRecoRetourId}>
                  <SelectTrigger id="reco-retour" className="h-10" aria-label="Sélectionner un retour">
                    <SelectValue placeholder="Sélectionner un retour…" />
                  </SelectTrigger>
                  <SelectContent>
                    {aTraiter.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.note}★ · {r.zone?.nom ?? "Sans zone"} · {formatDate(r.createdAt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fermerReco} disabled={recoEnvoi}>
              Annuler
            </Button>
            <Button onClick={appliquerReco} disabled={recoEnvoi || !recoTexte.trim() || !recoRetourId}>
              {recoEnvoi ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden />
              )}
              Appliquer l&apos;action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- Compteur coloré ----------

function Compteur({ label, valeur, ton }: { label: string; valeur: number; ton: "ambre" | "bleu" | "vert" }) {
  const classes = {
    ambre: "border-amber-200 bg-amber-50 text-amber-800",
    bleu: "border-blue-200 bg-blue-50 text-blue-800",
    vert: "border-green-200 bg-green-50 text-green-800",
  }[ton]
  return (
    <div className={cn("rounded-xl border p-3 text-center sm:p-4", classes)}>
      <p className="text-xl font-bold sm:text-2xl">{valeur}</p>
      <p className="mt-0.5 text-[11px] sm:text-xs">{label}</p>
    </div>
  )
}

// ---------- Carte d'un retour avec saisie de l'action managériale ----------

function CarteAction({ retour, maj }: { retour: RetourItem; maj: (r: RetourItem) => void }) {
  const { toast } = useToast()
  const [action, setAction] = useState(retour.actionPrise ?? "")
  const [statut, setStatut] = useState(retour.statut ?? "NEW")
  const [savingAction, setSavingAction] = useState(false)
  const [savingStatut, setSavingStatut] = useState(false)

  // Resynchronise les champs quand le parent met à jour le retour (après PATCH)
  useEffect(() => {
    setAction(retour.actionPrise ?? "")
  }, [retour.actionPrise])
  useEffect(() => {
    setStatut(retour.statut ?? "NEW")
  }, [retour.statut])

  async function enregistrerAction() {
    const texte = action.trim()
    if (!texte) return
    setSavingAction(true)
    try {
      const res = await fetch("/api/pro/retours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: retour.id, actionPrise: texte }),
      })
      const json = await res.json()
      if (res.ok && json?.ok) {
        maj(json.data?.retour ?? { ...retour, actionPrise: texte })
        toast({ title: "Action enregistrée ✅", description: "Votre décision est archivée dans l'historique." })
      } else {
        toast({ title: "Erreur", description: json?.error || "Enregistrement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSavingAction(false)
    }
  }

  async function changerStatut(v: string) {
    setStatut(v)
    setSavingStatut(true)
    try {
      const res = await fetch("/api/pro/retours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: retour.id, statut: v }),
      })
      const json = await res.json()
      if (res.ok && json?.ok) {
        maj(json.data?.retour ?? { ...retour, statut: v })
        toast({ title: "Statut mis à jour", description: STATUT_RETOUR_LABEL[v] ?? v })
      } else {
        toast({ title: "Erreur", description: json?.error || "Mise à jour impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSavingStatut(false)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-3 p-4">
        {/* Ligne 1 : note, zone, employé, date, statut */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Stars note={retour.note} size={14} />
            {retour.zone?.nom && <Badge variant="secondary">{retour.zone.nom}</Badge>}
            {retour.employe?.nom && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" aria-hidden /> {retour.employe.nom}
              </span>
            )}
            {!retour.actionPrise && (
              <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">À traiter</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(retour.createdAt)}</span>
            <Select value={statut} onValueChange={changerStatut} disabled={savingStatut}>
              <SelectTrigger size="sm" className="w-[120px]" aria-label="Statut du retour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">{STATUT_RETOUR_LABEL.NEW}</SelectItem>
                <SelectItem value="IN_PROGRESS">{STATUT_RETOUR_LABEL.IN_PROGRESS}</SelectItem>
                <SelectItem value="RESOLVED">{STATUT_RETOUR_LABEL.RESOLVED}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tags */}
        {(retour.tags ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">{(retour.tags ?? []).map(tagLabel).join(" · ")}</p>
        )}

        {/* Commentaire client */}
        {retour.commentaire && <p className="text-sm italic">&ldquo;{retour.commentaire}&rdquo;</p>}
        {retour.personnelMentionne && (
          <p className="text-xs text-muted-foreground">Membre du personnel mentionné : {retour.personnelMentionne}</p>
        )}

        {/* Réponse déjà envoyée au client */}
        {retour.reponsePro && (
          <div className="rounded-lg bg-muted/60 p-2.5">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquare className="h-3 w-3" aria-hidden /> Votre réponse au client
            </p>
            <p className="text-sm text-muted-foreground">{retour.reponsePro}</p>
          </div>
        )}

        {/* Action managériale */}
        <div className="space-y-1.5 border-t pt-3">
          <Label htmlFor={`action-${retour.id}`} className="text-xs font-medium">
            Action managériale prise
          </Label>
          <Textarea
            id={`action-${retour.id}`}
            rows={2}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="ex. Recadrage de l'équipe, remise commerciale, formation produit…"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={enregistrerAction}
              disabled={savingAction || !action.trim() || action.trim() === (retour.actionPrise ?? "")}
            >
              {savingAction ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-2 h-3.5 w-3.5" aria-hidden />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
