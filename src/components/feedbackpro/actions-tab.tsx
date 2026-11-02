"use client"

// ============================================================
// FeedbackPro - Onglet « Actions » du dashboard Pro (Session 1)
// Historique des décisions managériales : pour chaque retour
// sensible (≤ 3★ ou déjà suivi), l'action prise + le statut
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, MessageSquare, User } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Stars, formatDate } from "@/components/feedbackpro/shared"
import { cn } from "@/lib/utils"
import { STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"

// ---------- Types (contrat GET/PATCH /api/pro/retours) ----------

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

/** Retours pertinents pour le suivi managérial : déjà pris en charge OU note ≤ 3 */
function estPertinent(r: RetourItem): boolean {
  return r.statut === "IN_PROGRESS" || r.statut === "RESOLVED" || r.note <= 3
}

export function ActionsTab() {
  const { toast } = useToast()

  const [retours, setRetours] = useState<RetourItem[]>([])
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState<VueLocale>("atraiter")

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
