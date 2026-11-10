"use client"

// ============================================================
// Feedback 2 — Onglet « Audit Matin » du dashboard Pro
// ------------------------------------------------------------
// Checklist du matin dictée par le Coach IA basée sur les problèmes
// récurrents détectés la veille (tags négatifs, zones problématiques).
//
// États :
//   1. idle     : pas d'audit aujourd'hui → Card "Bonjour ! Votre audit
//                 du matin vous attend" + bouton "Commencer l'audit"
//   2. checklist: checklist interactive (3-6 items) avec validation/
//                 invalidation + photos + notes par item
//   3. saving   : enregistrement en cours (POST /api/pro/audit-matin)
//   4. done     : audit complété → score du jour + récap + lien historique
//   5. historique : timeline 30 jours + graphe de tendance + comparaison
//                   "Vision client" vs "Vision manager"
//
// Contrats :
//   GET  /api/pro/audit-matin              → { audit?, checklist?, source, dejaComplete, donnees? }
//   POST /api/pro/audit-matin              → { audit } (items + photoUrls + notes + scoreManager)
//   GET  /api/pro/audit-matin/historique   → { audits, comparaison }
//   POST /api/public/upload                → { url } (photos des items problématiques)
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Sunrise,
  Check,
  X,
  Camera,
  Loader2,
  AlertTriangle,
  Sparkles,
  History,
  ArrowLeft,
  TrendingUp,
  Calendar,
  ClipboardCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"

// ---------- Types (contrats API) ----------

type ItemChecklist = {
  id: string
  label: string
  urgence: "haute" | "moyenne" | "basse"
  photoRequise: boolean
}

type ItemAuditState = {
  id: string
  label: string
  urgence: "haute" | "moyenne" | "basse"
  photoRequise: boolean
  valide: boolean | null
  photoUrl: string | null
  note: string
}

type AuditSerialise = {
  id: string
  proId: string
  date: string
  items: ItemAuditState[]
  photoUrls: string[]
  scoreManager: number
  notes: string | null
  createdAt: string
}

type DonneesVeille = {
  total: number
  totalNegatifs: number
  noteMoyenne: number
  topTagsNegatifs: { tag: string; label: string; count: number; zone: string }[]
  zonesProblematiques: {
    zone: string
    noteMoyenne: number
    negatifs: number
    total: number
  }[]
}

type AuditHistorique = AuditSerialise & {
  itemsValides: number
  itemsTotal: number
}

type Comparaison = {
  noteMoyenneClient: number
  noteMoyenneManagerSur5: number
  scoreMoyenManager: number
  totalRetours30j: number
  totalAudits30j: number
}

// ---------- Petits utilitaires ----------

function badgeUrgence(urgence: ItemChecklist["urgence"]) {
  if (urgence === "haute")
    return { label: "🔥 Urgence haute", className: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" }
  if (urgence === "moyenne")
    return { label: "⚠️ Urgence moyenne", className: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" }
  return { label: "Urgence basse", className: "border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300" }
}

function formatDateCourt(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  } catch {
    return "—"
  }
}

function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

// ---------- Composant principal ----------

type EtatVue = "idle" | "checklist" | "saving" | "done" | "historique"

export function AuditMatinTab() {
  const { toast } = useToast()

  // État de la vue courante (idle / checklist / done / historique)
  const [vue, setVue] = useState<EtatVue>("idle")
  // Audit complété aujourd'hui (null si pas encore fait)
  const [auditDuJour, setAuditDuJour] = useState<AuditSerialise | null>(null)
  // Checklist du jour (générée par le Coach IA si pas d'audit aujourd'hui)
  const [checklist, setChecklist] = useState<ItemChecklist[]>([])
  // Source de la checklist ("ia" | "fallback")
  const [source, setSource] = useState<"ia" | "fallback">("ia")
  // Items avec état de validation (null = non traité, true = validé, false = problème)
  const [items, setItems] = useState<ItemAuditState[]>([])
  // Notes libres du manager (textarea en bas du formulaire)
  const [notesManager, setNotesManager] = useState("")
  // Données agrégées de la veille (résumé affiché sur l'écran d'accueil)
  const [donneesVeille, setDonneesVeille] = useState<DonneesVeille | null>(null)
  // États de chargement / génération
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  // Historique (30 jours)
  const [historique, setHistorique] = useState<AuditHistorique[]>([])
  const [comparaison, setComparaison] = useState<Comparaison | null>(null)
  const [loadingHisto, setLoadingHisto] = useState(false)

  // ---------- Chargement initial : un audit existe-t-il déjà aujourd'hui ? ----------
  const charger = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pro/audit-matin", { cache: "no-store" })
      const json = await res.json()
      if (res.ok && json?.ok) {
        if (json.data.audit) {
          // Audit déjà complété aujourd'hui → on bascule en mode "done"
          setAuditDuJour(json.data.audit as AuditSerialise)
          setVue("done")
        } else if (json.data.checklist) {
          // Pas d'audit aujourd'hui → checklist prête à être démarrée
          setChecklist(json.data.checklist as ItemChecklist[])
          setSource(json.data.source ?? "ia")
          if (json.data.donnees) setDonneesVeille(json.data.donnees as DonneesVeille)
          setVue("idle")
        }
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger l'audit du matin.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  // ---------- Démarrer l'audit : initialise les items avec état null ----------
  function demarrerAudit() {
    if (checklist.length === 0) {
      // Pas de checklist en mémoire → on la régénère
      void regenererChecklist()
      return
    }
    setItems(
      checklist.map((c) => ({
        id: c.id,
        label: c.label,
        urgence: c.urgence,
        photoRequise: c.photoRequise,
        valide: null,
        photoUrl: null,
        note: "",
      }))
    )
    setNotesManager("")
    setVue("checklist")
  }

  // ---------- Régénère la checklist (re-fetch du backend) ----------
  async function regenererChecklist() {
    setGenerating(true)
    try {
      const res = await fetch("/api/pro/audit-matin", { cache: "no-store" })
      const json = await res.json()
      if (res.ok && json?.ok) {
        if (json.data.checklist) {
          setChecklist(json.data.checklist as ItemChecklist[])
          setSource(json.data.source ?? "ia")
          if (json.data.donnees) setDonneesVeille(json.data.donnees as DonneesVeille)
          // Initialise les items avec état null et bascule sur la vue checklist
          setItems(
            (json.data.checklist as ItemChecklist[]).map((c) => ({
              id: c.id,
              label: c.label,
              urgence: c.urgence,
              photoRequise: c.photoRequise,
              valide: null,
              photoUrl: null,
              note: "",
            }))
          )
          setNotesManager("")
          setVue("checklist")
        } else if (json.data.audit) {
          // Cas défensif : audit déjà complété entre-temps → on bascule en mode "done"
          setAuditDuJour(json.data.audit as AuditSerialise)
          setVue("done")
        }
      } else {
        throw new Error(json?.error || "Échec")
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de générer la checklist du matin.",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  // ---------- Validation / Invalidation d'un item ----------
  function validerItem(id: string, valide: boolean) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              valide,
              // Si on passe en "validé", on efface la photo + note (inutiles)
              photoUrl: valide ? null : it.photoUrl,
              note: valide ? "" : it.note,
            }
          : it
      )
    )
  }

  // ---------- Upload de photo pour un item "Problème" ----------
  const [uploadEnCours, setUploadEnCours] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoPourItem, setPhotoPourItem] = useState<string | null>(null)

  async function uploaderPhoto(itemId: string, fichier: File) {
    setUploadEnCours(itemId)
    try {
      const fd = new FormData()
      fd.append("photo", fichier)
      const res = await fetch("/api/public/upload", { method: "POST", body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec upload")
      const url = json.data.url as string
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, photoUrl: url } : it))
      )
      toast({ title: "Photo ajoutée ✓" })
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Upload impossible",
        variant: "destructive",
      })
    } finally {
      setUploadEnCours(null)
    }
  }

  // ---------- Soumission de l'audit complété ----------
  async function terminerAudit() {
    // Vérifie que tous les items ont été traités (valide !== null)
    const nonTraités = items.filter((it) => it.valide === null)
    if (nonTraités.length > 0) {
      toast({
        title: "Audit incomplet",
        description: `${nonTraités.length} item(s) non traité(s) — validez ou signalez un problème pour chacun.`,
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    setVue("saving")
    try {
      const res = await fetch("/api/pro/audit-matin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({
            id: it.id,
            label: it.label,
            urgence: it.urgence,
            photoRequise: it.photoRequise,
            valide: it.valide === true,
            photoUrl: it.photoUrl,
            note: it.note || null,
          })),
          photoUrls: items.map((it) => it.photoUrl).filter((u): u is string => !!u),
          notes: notesManager.trim() || null,
        }),
      })
      const json = await res.json()
      if (res.ok && json?.ok && json.data.audit) {
        setAuditDuJour(json.data.audit as AuditSerialise)
        setVue("done")
        toast({
          title: "Audit terminé ✓",
          description: `Score du jour : ${json.data.audit.scoreManager}%`,
        })
      } else {
        throw new Error(json?.error || "Échec")
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Enregistrement impossible",
        variant: "destructive",
      })
      setVue("checklist")
    } finally {
      setSaving(false)
    }
  }

  // ---------- Chargement de l'historique (30 jours) ----------
  async function chargerHistorique() {
    setLoadingHisto(true)
    try {
      const res = await fetch("/api/pro/audit-matin/historique", { cache: "no-store" })
      const json = await res.json()
      if (res.ok && json?.ok) {
        setHistorique(json.data.audits as AuditHistorique[])
        setComparaison(json.data.comparaison as Comparaison)
        setVue("historique")
      } else {
        throw new Error(json?.error || "Échec")
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger l'historique.",
        variant: "destructive",
      })
    } finally {
      setLoadingHisto(false)
    }
  }

  // ---------- Calcul de la progression (items traités / total) ----------
  const itemsTraites = items.filter((it) => it.valide !== null).length
  const itemsValides = items.filter((it) => it.valide === true).length
  const progression = items.length > 0 ? Math.round((itemsTraites / items.length) * 100) : 0

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  // ====== Vue : Historique (30 jours) ======
  if (vue === "historique") {
    return (
      <VueHistorique
        audits={historique}
        comparaison={comparaison}
        loading={loadingHisto}
        onRetour={() => (auditDuJour ? setVue("done") : setVue("idle"))}
      />
    )
  }

  // ====== Vue : Audit déjà complété aujourd'hui ======
  if (vue === "done" && auditDuJour) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/10">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <span aria-hidden>✅</span>
                Audit du matin terminé
              </CardTitle>
              <CardDescription className="mt-1 text-emerald-700/80 dark:text-emerald-300/80">
                {formatDateLong(auditDuJour.date)}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-emerald-700 dark:text-emerald-300">
                {auditDuJour.scoreManager}%
              </div>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Score du jour</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Récap items */}
          <div className="space-y-2">
            {(auditDuJour.items as ItemAuditState[]).map((it) => (
              <div
                key={it.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3",
                  it.valide
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                    : "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    it.valide
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                  )}
                  aria-hidden
                >
                  {it.valide ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{it.label}</p>
                  {it.note && (
                    <p className="mt-1 text-xs text-muted-foreground">{it.note}</p>
                  )}
                  {it.photoUrl && (
                    <a
                      href={it.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                      <Camera className="size-3" aria-hidden /> Voir la photo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Notes libres */}
          {auditDuJour.notes && (
            <div className="rounded-2xl bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Notes du manager</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">{auditDuJour.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void chargerHistorique()}>
              <History className="mr-2 size-4" aria-hidden />
              Voir l'historique (30 jours)
            </Button>
            <Button variant="ghost" onClick={() => void charger()}>
              Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ====== Vue : Checklist interactive ======
  if (vue === "checklist" || vue === "saving") {
    return (
      <div className="space-y-4">
        {/* En-tête : progression + bouton retour */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Sunrise className="size-5 text-amber-500" aria-hidden />
              Audit du matin
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {itemsTraites} / {items.length} items traités · {itemsValides} validés
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVue("idle")}
            disabled={vue === "saving"}
          >
            <ArrowLeft className="mr-1.5 size-4" aria-hidden />
            Retour
          </Button>
        </div>

        {/* Barre de progression */}
        <div className="space-y-1.5">
          <Progress value={progression} className="h-2.5" />
          <p className="text-right text-xs text-muted-foreground">{progression}%</p>
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map((it, idx) => {
            const badge = badgeUrgence(it.urgence)
            return (
              <Card key={it.id} className="overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                  {/* Label + badge urgence */}
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground sm:text-base">
                        {it.label}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn("mt-1.5 text-[10px] font-medium", badge.className)}
                      >
                        {badge.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Boutons d'action */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant={it.valide === true ? "default" : "outline"}
                      className={cn(
                        "h-9",
                        it.valide === true
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"
                      )}
                      onClick={() => validerItem(it.id, true)}
                      disabled={vue === "saving"}
                    >
                      <Check className="mr-1.5 size-3.5" aria-hidden />
                      Validé ✓
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant={it.valide === false ? "default" : "outline"}
                      className={cn(
                        "h-9",
                        it.valide === false
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                      )}
                      onClick={() => validerItem(it.id, false)}
                      disabled={vue === "saving"}
                    >
                      <X className="mr-1.5 size-3.5" aria-hidden />
                      Problème ✗
                    </Button>
                  </div>

                  {/* Si "Problème" : photo + notes (optionnels) */}
                  {it.valide === false && (
                    <div className="mt-3 space-y-2 rounded-2xl bg-rose-50/60 p-3 dark:bg-rose-950/20">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={photoPourItem === it.id ? photoInputRef : undefined}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploaderPhoto(it.id, f)
                            e.target.value = ""
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled={vue === "saving" || uploadEnCours === it.id}
                          onClick={() => {
                            setPhotoPourItem(it.id)
                            // Laisse le temps à l'input d'être associé au ref
                            setTimeout(() => photoInputRef.current?.click(), 0)
                          }}
                        >
                          {uploadEnCours === it.id ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Camera className="mr-1.5 size-3.5" aria-hidden />
                          )}
                          {it.photoUrl ? "Changer la photo" : "Ajouter une photo"}
                        </Button>
                        {it.photoUrl && (
                          <a
                            href={it.photoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline"
                          >
                            Voir la photo
                          </a>
                        )}
                      </div>
                      <Textarea
                        placeholder="Notes sur le problème rencontré (optionnel)"
                        value={it.note}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) =>
                              x.id === it.id ? { ...x, note: e.target.value.slice(0, 500) } : x
                            )
                          )
                        }
                        maxLength={500}
                        disabled={vue === "saving"}
                        className="min-h-[60px] resize-y bg-card text-sm"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Notes libres du manager */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <label htmlFor="audit-notes" className="text-sm font-medium text-foreground">
              Notes libres du manager (optionnel)
            </label>
            <Textarea
              id="audit-notes"
              placeholder="Observations globales, points d'attention pour l'équipe…"
              value={notesManager}
              onChange={(e) => setNotesManager(e.target.value.slice(0, 2000))}
              maxLength={2000}
              disabled={vue === "saving"}
              className="mt-2 min-h-[80px] resize-y text-sm"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {notesManager.length} / 2000
            </p>
          </CardContent>
        </Card>

        {/* Bouton "Terminer l'audit" */}
        <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
          <Button
            type="button"
            className="h-12 w-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
            disabled={vue === "saving" || itemsTraites < items.length}
            onClick={() => void terminerAudit()}
          >
            {vue === "saving" ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
                Enregistrement…
              </>
            ) : (
              <>
                <Check className="mr-2 size-5" aria-hidden />
                Terminer l&apos;audit
              </>
            )}
          </Button>
          {itemsTraites < items.length && (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Validez ou signalez un problème pour chaque item ({items.length - itemsTraites} restant)
            </p>
          )}
        </div>
      </div>
    )
  }

  // ====== Vue : idle (accueil) ======
  // Par défaut : Card "Bonjour ! Votre audit du matin vous attend"
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sunrise className="size-5 text-amber-500" aria-hidden />
            Audit du matin
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Une checklist dictée par le Coach IA, basée sur les retours de la veille.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void chargerHistorique()} disabled={loadingHisto}>
          {loadingHisto ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <History className="mr-1.5 size-4" aria-hidden />}
          Historique
        </Button>
      </div>

      {/* Card "Bonjour" */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-orange-950/20">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-3xl dark:bg-amber-900/40" aria-hidden>
              🌅
            </div>
            <div>
              <h3 className="text-xl font-bold text-amber-900 dark:text-amber-100 sm:text-2xl">
                Bonjour ! Votre audit du matin vous attend.
              </h3>
              <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">
                {formatDateLong(new Date().toISOString())}
              </p>
            </div>

            {/* Résumé des retours de la veille */}
            {donneesVeille && (
              <div className="mt-2 grid w-full grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/70 p-3 text-center dark:bg-amber-950/30">
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{donneesVeille.total}</p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Retours (24h)</p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3 text-center dark:bg-amber-950/30">
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{donneesVeille.totalNegatifs}</p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Négatifs ≤ 2★</p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3 text-center dark:bg-amber-950/30">
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300">
                    {donneesVeille.noteMoyenne.toFixed(1)}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Note moyenne /5</p>
                </div>
              </div>
            )}

            {/* Source de la checklist */}
            <div className="flex items-center gap-2 text-xs text-amber-700/80 dark:text-amber-300/80">
              {source === "ia" ? (
                <>
                  <Sparkles className="size-3.5" aria-hidden />
                  Checklist générée par le Coach IA
                </>
              ) : (
                <>
                  <ClipboardCheck className="size-3.5" aria-hidden />
                  Checklist heuristique (Coach IA indisponible)
                </>
              )}
              <span aria-hidden>·</span>
              <span>{checklist.length} items</span>
            </div>

            {/* Boutons d'action */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => demarrerAudit()}
                disabled={generating || checklist.length === 0}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Génération…
                  </>
                ) : (
                  <>
                    <Sunrise className="mr-2 size-4" aria-hidden />
                    Commencer l&apos;audit
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => void regenererChecklist()} disabled={generating}>
                <Sparkles className="mr-2 size-4" aria-hidden />
                Régénérer la checklist
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aperçu des items (sans action) */}
      {checklist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aperçu de votre checklist du jour</CardTitle>
            <CardDescription>
              {checklist.length} items — basés sur les problèmes récurrents détectés la veille.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklist.map((c, idx) => {
              const badge = badgeUrgence(c.urgence)
              return (
                <div
                  key={c.id}
                  className="flex items-start gap-3 rounded-xl border border-border p-3"
                >
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                    aria-hidden
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{c.label}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] font-medium", badge.className)}
                      >
                        {badge.label}
                      </Badge>
                      {c.photoRequise && (
                        <Badge variant="outline" className="text-[10px] font-medium">
                          <Camera className="mr-1 size-2.5" aria-hidden />
                          Photo requise
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Tags/zones problématiques de la veille */}
      {donneesVeille && donneesVeille.topTagsNegatifs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" aria-hidden />
              Problèmes récurrents de la veille
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {donneesVeille.topTagsNegatifs.map((t) => (
                <Badge
                  key={t.tag}
                  variant="outline"
                  className="border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
                >
                  {t.label} · {t.count}× · {t.zone}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------- Sous-composant : Vue Historique (30 jours) ----------

function VueHistorique({
  audits,
  comparaison,
  loading,
  onRetour,
}: {
  audits: AuditHistorique[]
  comparaison: Comparaison | null
  loading: boolean
  onRetour: () => void
}) {
  // Données pour le mini-graphe de tendance (date + score)
  const dataGraph = audits
    .slice()
    .reverse()
    .map((a) => ({
      date: formatDateCourt(a.date),
      score: a.scoreManager,
      valides: a.itemsValides,
      total: a.itemsTotal,
    }))

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <History className="size-5 text-primary" aria-hidden />
            Historique — 30 derniers jours
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {audits.length} audit(s) complété(s) sur la période.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRetour}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden />
          Retour
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : audits.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Aucun audit enregistré sur les 30 derniers jours. Commencez dès aujourd&apos;hui !
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Comparaison Vision client vs Vision manager */}
          {comparaison && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" aria-hidden />
                  Comparaison 30 jours
                </CardTitle>
                <CardDescription>
                  Vision client (note moyenne des retours) vs Vision manager (score moyen des audits).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-primary/5 p-4 text-center">
                    <p className="text-2xl font-black text-primary">
                      {comparaison.noteMoyenneClient.toFixed(1)}<span className="text-sm font-medium">/5</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Note client moyenne</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-950/20">
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                      {comparaison.noteMoyenneManagerSur5.toFixed(1)}<span className="text-sm font-medium">/5</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Score audit (transposé /5)</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4 text-center dark:bg-amber-950/20">
                    <p className="text-2xl font-black text-amber-700 dark:text-amber-300">
                      {comparaison.scoreMoyenManager}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Score audit moyen</p>
                  </div>
                  <div className="rounded-2xl bg-muted p-4 text-center">
                    <p className="text-2xl font-black text-foreground">
                      {comparaison.totalAudits30j}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Audits complétés</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {comparaison.totalRetours30j} retour(s) client sur la période.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Mini-graphe de tendance */}
          {dataGraph.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tendance des scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dataGraph} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        name="Score manager (%)"
                        dot={{ r: 3, fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline des audits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="size-4 text-primary" aria-hidden />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-4 border-l-2 border-border pl-4">
                {audits.map((a) => (
                  <div key={a.id} className="relative">
                    {/* Point sur la timeline */}
                    <span
                      className={cn(
                        "absolute -left-[21px] top-1.5 size-3 rounded-full border-2 border-background",
                        a.scoreManager >= 80
                          ? "bg-emerald-500"
                          : a.scoreManager >= 60
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      )}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {formatDateLong(a.date)}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          a.scoreManager >= 80
                            ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                            : a.scoreManager >= 60
                              ? "border-amber-300 text-amber-700 dark:text-amber-300"
                              : "border-rose-300 text-rose-700 dark:text-rose-300"
                        )}
                      >
                        {a.scoreManager}% · {a.itemsValides}/{a.itemsTotal} validés
                      </Badge>
                    </div>
                    {a.notes && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
