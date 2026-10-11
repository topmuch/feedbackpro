"use client"

// ============================================================
// FeedbackPro - Onglet « Zones » du dashboard Pro (Session 1)
// Le commerçant gère ses zones de contact (Accueil, Salle,
// Toilettes…) : CRUD + tags proposés au scan + limite par plan
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { MapPin, MessageSquare, QrCode, Pencil, Trash2, Plus, Loader2, AlertTriangle, Copy } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { Stars } from "@/components/feedbackpro/shared"
import { cn } from "@/lib/utils"
import { NEGATIVE_TAGS, POSITIVE_TAGS, PLANS, PLAN_LIMITS, type PlanId, type TagDef } from "@/lib/constants"

// ---------- Types (contrat GET/POST/PATCH/DELETE /api/pro/zones) ----------

type Zone = {
  id: string
  nom: string
  description?: string | null
  qrToken: string
  tagsPositifs?: string[]
  tagsNegatifs?: string[]
  nbRetours?: number
  noteMoyenne?: number | null
}

/** Lit un champ du ProData en tolérant les évolutions de schéma */
function champPro(pro: unknown, cles: string[], defaut = ""): string {
  if (!pro || typeof pro !== "object") return defaut
  for (const cle of cles) {
    const valeur = (pro as Record<string, unknown>)[cle]
    if (typeof valeur === "string" && valeur) return valeur
  }
  return defaut
}

export function ZonesTab({ onOpenQr }: { onOpenQr: (zoneId: string) => void }) {
  const session = useAppStore((s) => s.session)
  const { toast } = useToast()

  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)

  // Formulaire création / édition
  const [dialogOuvert, setDialogOuvert] = useState(false)
  const [zoneEnEdition, setZoneEnEdition] = useState<Zone | null>(null)
  const [nom, setNom] = useState("")
  const [description, setDescription] = useState("")
  const [tagsPos, setTagsPos] = useState<string[]>([])
  const [tagsNeg, setTagsNeg] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Suppression
  const [suppressionZone, setSuppressionZone] = useState<Zone | null>(null)
  const [supprimeEnCours, setSupprimeEnCours] = useState(false)

  // Limite du plan
  const planKey = (champPro(session?.pro, ["plan"], "STARTER") || "STARTER") as PlanId
  const planName = PLANS[planKey]?.name ?? planKey
  const limite = PLAN_LIMITS[planKey]?.zones ?? PLAN_LIMITS.STARTER.zones
  const limiteAtteinte = zones.length >= limite

  // ---------- Chargement ----------
  const charger = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pro/zones", { cache: "no-store" })
      const json = await res.json()
      if (json?.ok) setZones(json.data?.zones ?? [])
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger vos zones", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  // ---------- Formulaire ----------
  function ouvrirCreation() {
    setZoneEnEdition(null)
    setNom("")
    setDescription("")
    setTagsPos([])
    setTagsNeg([])
    setDialogOuvert(true)
  }

  function ouvrirEdition(zone: Zone) {
    setZoneEnEdition(zone)
    setNom(zone.nom ?? "")
    setDescription(zone.description ?? "")
    setTagsPos(zone.tagsPositifs ?? [])
    setTagsNeg(zone.tagsNegatifs ?? [])
    setDialogOuvert(true)
  }

  function fermerDialog() {
    if (saving) return
    setDialogOuvert(false)
    setZoneEnEdition(null)
  }

  function basculerTag(liste: string[], setListe: (v: string[]) => void, id: string) {
    setListe(liste.includes(id) ? liste.filter((t) => t !== id) : [...liste, id])
  }

  async function enregistrer() {
    if (!nom.trim()) {
      toast({ title: "Nom obligatoire", description: "Donnez un nom à votre zone (ex. Accueil).", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const corps = {
        nom: nom.trim(),
        description: description.trim() || undefined,
        tagsPositifs: tagsPos,
        tagsNegatifs: tagsNeg,
      }
      const res = await fetch("/api/pro/zones", {
        method: zoneEnEdition ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zoneEnEdition ? { id: zoneEnEdition.id, ...corps } : corps),
      })
      const json = await res.json()
      if (res.ok && json?.ok) {
        toast({
          title: zoneEnEdition ? "Zone modifiée" : "Zone créée ✨",
          description: `« ${nom.trim()} » est prête à collecter des retours.`,
        })
        setDialogOuvert(false)
        setZoneEnEdition(null)
        charger()
      } else {
        toast({ title: "Erreur", description: json?.error || "Enregistrement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // ---------- Suppression ----------
  async function supprimer() {
    if (!suppressionZone) return
    setSupprimeEnCours(true)
    try {
      const res = await fetch(`/api/pro/zones?id=${encodeURIComponent(suppressionZone.id)}`, { method: "DELETE" })
      const json = await res.json()
      if (res.ok && json?.ok) {
        toast({ title: "Zone supprimée", description: `« ${suppressionZone.nom} » et ses retours ont été effacés.` })
        setSuppressionZone(null)
        charger()
      } else {
        toast({ title: "Erreur", description: json?.error || "Suppression impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSupprimeEnCours(false)
    }
  }

  // ---------- Copie du lien de scan ----------
  function copierLien(zone: Zone) {
    const url = `${window.location.origin}/r/${zone.qrToken}`
    if (!navigator.clipboard) {
      toast({ title: "Copie impossible", description: url, variant: "destructive" })
      return
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast({ title: "Lien de scan copié 🔗", description: url }))
      .catch(() => toast({ title: "Copie impossible", variant: "destructive" }))
  }

  // ---------- Rendu ----------
  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Vos zones de contact</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {zones.length}/{limite === 999 ? "∞" : limite} zones · un QR code dédié par zone
          </p>
        </div>
        <Button onClick={ouvrirCreation} disabled={limiteAtteinte} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Ajouter une zone
        </Button>
      </div>

      {limiteAtteinte && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Limite de {limite} zones atteinte pour votre plan {planName} — passez au plan supérieur pour en créer
          davantage.
        </p>
      )}

      {/* Squelettes */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        // Empty state
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-4" aria-hidden>
              <MapPin className="h-8 w-8 text-primary" />
            </div>
            <p className="font-medium">Aucune zone pour l&apos;instant</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Créez votre première zone de contact (Accueil, Salle, Toilettes…) : chaque zone reçoit son
              propre QR code et son Coach IA analyse ses retours séparément.
            </p>
            <Button onClick={ouvrirCreation} className="mt-1">
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Ajouter une zone
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Grille de zones
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map((zone) => (
            <Card key={zone.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 rounded-xl bg-primary/10 p-2.5" aria-hidden>
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{zone.nom}</p>
                    {zone.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{zone.description}</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground italic">Pas de description</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    {zone.nbRetours ?? 0} retour{(zone.nbRetours ?? 0) > 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Stars note={zone.noteMoyenne ?? 0} size={13} />
                    {zone.noteMoyenne ? zone.noteMoyenne.toFixed(1) : "—"}/5
                  </span>
                </div>

                {/* Token court : clic = copie du lien de scan /r/<token> */}
                <button
                  type="button"
                  onClick={() => copierLien(zone)}
                  title="Copier le lien de scan"
                  className="group flex w-fit items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Copy className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" aria-hidden />
                  /r/{zone.qrToken}
                </button>

                {/* Actions */}
                <div className="mt-auto flex items-center gap-1 border-t pt-3">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onOpenQr(zone.id)}>
                    <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    QR
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => ouvrirEdition(zone)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setSuppressionZone(zone)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- Dialog création / édition ---------- */}
      <Dialog open={dialogOuvert} onOpenChange={(o) => (!o ? fermerDialog() : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{zoneEnEdition ? "Modifier la zone" : "Nouvelle zone de contact"}</DialogTitle>
            <DialogDescription>
              Chaque zone possède son QR code, ses retours et son audit dédié (Accueil, Salle, Toilettes…).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="zone-nom">Nom de la zone *</Label>
              <Input
                id="zone-nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="ex. Accueil"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zone-description">Description (optionnel)</Label>
              <Textarea
                id="zone-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex. Réception, check-in et conciergerie"
                rows={2}
              />
            </div>
            <ChipsTags
              titre="Tags positifs proposés aux clients"
              defs={POSITIVE_TAGS}
              selection={tagsPos}
              onToggle={(id) => basculerTag(tagsPos, setTagsPos, id)}
              variante="positif"
            />
            <ChipsTags
              titre="Tags négatifs proposés aux clients"
              defs={NEGATIVE_TAGS}
              selection={tagsNeg}
              onToggle={(id) => basculerTag(tagsNeg, setTagsNeg, id)}
              variante="negatif"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fermerDialog} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={enregistrer} disabled={saving || !nom.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {zoneEnEdition ? "Enregistrer" : "Créer la zone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Confirmation de suppression ---------- */}
      <AlertDialog open={!!suppressionZone} onOpenChange={(o) => (!o ? setSuppressionZone(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {suppressionZone?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les retours associés ({suppressionZone?.nbRetours ?? 0}) seront définitivement supprimés, ainsi
              que le QR code de cette zone. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={supprimeEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault() // laisse le contrôle au flux async
                supprimer()
              }}
              disabled={supprimeEnCours}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {supprimeEnCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Sélecteur de tags en chips toggle (positif = vert, négatif = rouge léger) ----------

function ChipsTags({
  titre,
  defs,
  selection,
  onToggle,
  variante,
}: {
  titre: string
  defs: TagDef[]
  selection: string[]
  onToggle: (id: string) => void
  variante: "positif" | "negatif"
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{titre}</p>
      <div className="flex flex-wrap gap-1.5">
        {defs.map((t) => {
          const actif = selection.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t.id)}
              aria-pressed={actif}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                actif
                  ? variante === "positif"
                    ? "border-green-400 bg-green-100 text-green-800"
                    : "border-rose-300 bg-rose-100 text-rose-800"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {t.emoji} {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
