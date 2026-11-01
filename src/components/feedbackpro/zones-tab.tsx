"use client"

// ============================================================
// FeedbackPro - Onglet « Zones » du dashboard Pro (Session 1)
// Le commerçant gère ses zones de contact (Accueil, Salle,
// Toilettes…) : CRUD + tags proposés au scan + limite par plan
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  MapPin,
  MessageSquare,
  QrCode,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  Copy,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  ArrowLeft,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
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
import {
  NEGATIVE_TAGS_ETENDUS,
  POSITIVE_TAGS_ETENDUS,
  PLANS,
  PLAN_LIMITS,
  presetPourZone,
  tagLabel,
  type PlanId,
  type TagDef,
} from "@/lib/constants"

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
  // Session 4 : tendance sur 7 j (note 7 j vs 7 j précédents) + delta de note
  tendance?: "hausse" | "baisse" | "stable"
  tendanceDelta?: number | null
}

// ---------- Types (contrat GET /api/pro/zones/details?id= — Session 4) ----------

type TagFrequent = {
  id: string
  label: string
  count: number
  type: "positif" | "negatif" | "libre"
}

type RetourZone = {
  id: string
  note: number
  tags: string[]
  commentaire: string | null
  statut: string
  zone: { nom: string } | null
  employe: { nom: string } | null
  createdAt: string
}

type ZoneDetails = {
  zone: {
    id: string
    nom: string
    noteMoy: number
    total: number
    tendance: "hausse" | "baisse" | "stable"
    tendanceDelta: number | null
  }
  evolution: { date: string; score: number; retours: number }[]
  tagsFrequents: TagFrequent[]
  derniersRetours: RetourZone[]
  recommandations: string[]
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

/** Tronque un commentaire à ~100 caractères (ellipsis) */
function tronquer(texte: string, max = 100): string {
  return texte.length > max ? `${texte.slice(0, max).trimEnd()}…` : texte
}

/** Date courte d'un retour : « 12 janv. · 14:32 » */
function dateRetourCourt(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return `${jour} · ${heure}`
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
  // Les tags contextuels sont suggérés automatiquement selon le nom de la zone
  // (ex. « Toilettes RDC » → Propre / Sale / Manque de papier / Odeur) tant que
  // l'utilisateur n'a pas fait sa propre sélection.
  const [tagsManuels, setTagsManuels] = useState(false)
  const [saving, setSaving] = useState(false)

  // Suppression
  const [suppressionZone, setSuppressionZone] = useState<Zone | null>(null)
  const [supprimeEnCours, setSupprimeEnCours] = useState(false)

  // Modal de détails d'une zone (Session 4 : évolution, tags, retours, reco IA)
  const [detailsZone, setDetailsZone] = useState<Zone | null>(null)
  const [details, setDetails] = useState<ZoneDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsErreur, setDetailsErreur] = useState(false)

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
    setTagsManuels(false)
    setDialogOuvert(true)
  }

  function ouvrirEdition(zone: Zone) {
    setZoneEnEdition(zone)
    setNom(zone.nom ?? "")
    setDescription(zone.description ?? "")
    setTagsPos(zone.tagsPositifs ?? [])
    setTagsNeg(zone.tagsNegatifs ?? [])
    // En édition : on ne touche JAMAIS à la sélection existante automatiquement
    setTagsManuels(true)
    setDialogOuvert(true)
  }

  function fermerDialog() {
    if (saving) return
    setDialogOuvert(false)
    setZoneEnEdition(null)
  }

  /**
   * Saisie du nom : dès qu'un contexte ressort (« Toilettes », « Salle »,
   * « Accueil »…), les tags contextuels correspondants sont présélectionnés
   * (uniquement en création et tant que l'utilisateur n'a rien coché lui-même).
   */
  function changerNom(valeur: string) {
    setNom(valeur)
    if (!zoneEnEdition && !tagsManuels) {
      const preset = presetPourZone(valeur)
      setTagsPos(preset ? preset.positifs.map((t) => t.id) : [])
      setTagsNeg(preset ? preset.negatifs.map((t) => t.id) : [])
    }
  }

  function basculerTag(liste: string[], setListe: (v: string[]) => void, id: string) {
    setTagsManuels(true)
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

  // ---------- Modal de détails (Session 4) ----------

  /** Ouvre le modal et charge GET /api/pro/zones/details?id=<zone.id> */
  async function ouvrirDetails(zone: Zone) {
    setDetailsZone(zone)
    setDetails(null)
    setDetailsErreur(false)
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/pro/zones/details?id=${encodeURIComponent(zone.id)}`, { cache: "no-store" })
      const json = await res.json()
      if (res.ok && json?.ok) {
        setDetails(json.data as ZoneDetails)
      } else {
        setDetailsErreur(true)
        toast({
          title: "Erreur",
          description: json?.error || "Impossible de charger les détails de la zone",
          variant: "destructive",
        })
      }
    } catch {
      setDetailsErreur(true)
      toast({ title: "Erreur réseau", description: "Impossible de charger les détails", variant: "destructive" })
    } finally {
      setDetailsLoading(false)
    }
  }

  function fermerDetails() {
    setDetailsZone(null)
    setDetails(null)
    setDetailsErreur(false)
  }

  // ---------- Rendu ----------

  // ---------- Vue détaillée pleine page d'une zone (remplace la modale) ----------
  if (detailsZone) {
    return (
      <div className="space-y-5">
        {/* En-tête : retour + titre */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={fermerDetails} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour aux zones
          </Button>
          <h2 className="flex items-center gap-2 text-lg sm:text-xl font-semibold">
            <MapPin className="h-5 w-5 text-primary" aria-hidden />
            {detailsZone.nom ?? "Détails de la zone"}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Audit IA de la zone sur les 30 derniers jours — évolution, tags et retours clients.
        </p>

        {detailsLoading ? (
          // Squelettes pendant le chargement des détails
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : detailsErreur || !details ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Impossible de charger les détails de cette zone. Réessayez dans un instant.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {/* a. En-tête : mini-stats de la zone */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/40 px-3.5 py-2.5 text-sm">
              <span className="flex items-center gap-1.5">
                <Stars note={details.zone.noteMoy} size={14} />
                <span className="font-medium">{details.zone.noteMoy.toFixed(2).replace(".", ",")}/5</span>
              </span>
              <span className="text-muted-foreground">
                {details.zone.total} retour{details.zone.total > 1 ? "s" : ""} sur 30 j
              </span>
              <BadgeTendance tendance={details.zone.tendance} delta={details.zone.tendanceDelta} />
            </div>

            {/* b. Graphique d'évolution du score sur 30 jours */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold">Évolution du score (30 jours)</h3>
                <div className="h-56 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={details.evolution} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradZoneScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                      <XAxis dataKey="date" scale="point" tick={{ fontSize: 11 }} interval={4} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                      <Tooltip labelStyle={{ color: "#1c1917" }} />
                      <Area
                        type="monotone"
                        dataKey="score"
                        name="Score"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        fill="url(#gradZoneScore)"
                        connectNulls
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* c. Tags les plus fréquents */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold">Tags les plus fréquents</h3>
                {details.tagsFrequents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun tag sur 30 jours</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {details.tagsFrequents.slice(0, 8).map((t) => (
                      <Badge
                        key={t.id}
                        variant="outline"
                        className={cn(
                          t.type === "positif" && "border-green-300 text-green-700",
                          t.type === "negatif" && "border-rose-300 text-rose-700"
                        )}
                      >
                        {t.label} ×{t.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* d. Derniers retours (6, les plus récents) */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold">Derniers retours</h3>
                {details.derniersRetours.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun retour sur 30 jours</p>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto custom-scrollbar pr-1">
                    {details.derniersRetours.map((r) => (
                      <div key={r.id} className="rounded-lg border px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span aria-label={`Note ${r.note} sur 5`}>
                            <span className="text-amber-500">{"★".repeat(r.note)}</span>
                            <span className="text-stone-300">{"☆".repeat(Math.max(0, 5 - r.note))}</span>
                          </span>
                          <span className="text-muted-foreground">{dateRetourCourt(r.createdAt)}</span>
                          {r.employe?.nom && <span className="text-muted-foreground">👤 {r.employe.nom}</span>}
                          {r.zone?.nom && <span className="text-muted-foreground">📍 {r.zone.nom}</span>}
                        </div>
                        {r.commentaire && <p className="mt-1 text-sm">{tronquer(r.commentaire)}</p>}
                        {r.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[11px] font-normal">
                                {tagLabel(t)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* e. Recommandations du Coach IA pour cette zone */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold">Recommandations du Coach pour cette zone</h3>
                <ul className="space-y-1.5">
                  {details.recommandations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                      <span className="min-w-0">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action bas de page : Voir le QR code */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const id = detailsZone.id
              fermerDetails()
              onOpenQr(id)
            }}
          >
            <QrCode className="mr-2 h-4 w-4" aria-hidden />
            Voir le QR code
          </Button>
          <Button variant="outline" onClick={fermerDetails} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour aux zones
          </Button>
        </div>
      </div>
    )
  }

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
                  {/* Session 4 : évolution de la note sur 7 j */}
                  <BadgeTendance tendance={zone.tendance} delta={zone.tendanceDelta} />
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
                <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-3">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onOpenQr(zone.id)}>
                    <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    QR
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => ouvrirDetails(zone)}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Voir détails
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
                onChange={(e) => changerNom(e.target.value)}
                placeholder="ex. Accueil, Toilettes RDC, Restaurant…"
                maxLength={60}
              />
              {!zoneEnEdition && !tagsManuels && presetPourZone(nom) && (
                <p className="text-xs font-medium text-primary">
                  ✨ Tags contextuels « {presetPourZone(nom)?.label} » présélectionnés — ajustez-les ci-dessous
                  si besoin.
                </p>
              )}
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
              defs={POSITIVE_TAGS_ETENDUS}
              selection={tagsPos}
              onToggle={(id) => basculerTag(tagsPos, setTagsPos, id)}
              variante="positif"
            />
            <ChipsTags
              titre="Tags négatifs proposés aux clients"
              defs={NEGATIVE_TAGS_ETENDUS}
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

// ---------- Badge de tendance (Session 4) : hausse vert / baisse rouge / stable gris ----------

function BadgeTendance({
  tendance,
  delta,
}: {
  tendance?: "hausse" | "baisse" | "stable"
  delta?: number | null
}) {
  // Pas assez de données (delta null) : on n'affiche rien
  if (delta === null || delta === undefined) return null
  if (tendance === "hausse") {
    return (
      <Badge variant="outline" className="border-green-300 text-green-700">
        <TrendingUp className="mr-1 h-3 w-3" aria-hidden />
        +{delta.toFixed(2).replace(".", ",")} pt
      </Badge>
    )
  }
  if (tendance === "baisse") {
    return (
      <Badge variant="outline" className="border-rose-300 text-rose-700">
        <TrendingDown className="mr-1 h-3 w-3" aria-hidden />
        −{Math.abs(delta).toFixed(2).replace(".", ",")} pt
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-border text-muted-foreground">
      <Minus className="mr-1 h-3 w-3" aria-hidden />
      stable
    </Badge>
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
