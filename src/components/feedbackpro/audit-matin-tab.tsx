"use client"

// ============================================================
// Feedback 2 — Onglet « Audit Matin » du dashboard Pro
// ------------------------------------------------------------
// Checklist du matin dictée par le Coach IA basée sur les problèmes
// récurrents détectés la veille (tags négatifs, zones problématiques).
//
// États :
//   1. idle     : pas d'audit aujourd'hui → Card premium "Bonjour !
//                 Votre audit du matin vous attend" + bouton "Commencer"
//   2. checklist: checklist interactive (3-6 items) avec validation/
//                 invalidation + photos + notes par item, items groupés
//                 par urgence (haute / moyenne / basse)
//   3. saving   : enregistrement en cours (POST /api/pro/audit-matin)
//   4. done     : audit complété → score du jour (jauge circulaire) +
//                 récap + lien historique
//   5. historique : timeline 30 jours + graphe de tendance + comparaison
//                   "Vision client" vs "Vision manager"
//
// Secteur Aéroport : si session.pro.typeEtablissement === "Aéroport",
//   l'audit intègre une section dédiée « Aéroport — 24h » agrégeant les
//   signalements (total, par statut, par zone, conformité SLA). Cette
//   section est masquée pour les autres secteurs.
//
// Contrats :
//   GET  /api/pro/audit-matin              → { audit?, checklist?, source,
//                                              dejaComplete, donnees?,
//                                              airportStats? }
//   POST /api/pro/audit-matin              → { audit }
//   GET  /api/pro/audit-matin/historique   → { audits, comparaison }
//   POST /api/public/upload                → { url }
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
  Plane,
  Clock,
  Activity,
  Gauge,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
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

type AirportZoneStat = {
  code: string
  nom: string
  emoji: string
  count: number
  enAttente: number
}

type AirportStats = {
  total24h: number
  enAttente: number
  enCours: number
  resolus: number
  byZone: AirportZoneStat[]
  slaCompliance: number
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

type Urgence = ItemChecklist["urgence"]

function badgeUrgence(u: Urgence) {
  if (u === "haute")
    return {
      label: "Haute",
      className: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300",
    }
  if (u === "moyenne")
    return {
      label: "Moyenne",
      className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300",
    }
  return {
    label: "Basse",
    className: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  }
}

/** Métadonnée de section (regroupement d'items par urgence) */
type SectionMeta = {
  key: Urgence
  titre: string
  sousTitre: string
  icone: typeof AlertTriangle
  accent: string
  dot: string
}

const SECTIONS: SectionMeta[] = [
  {
    key: "haute",
    titre: "Priorités hautes",
    sousTitre: "À traiter en premier — impact direct sur l'expérience client",
    icone: AlertTriangle,
    accent: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  {
    key: "moyenne",
    titre: "Points de vigilance",
    sousTitre: "Vérifications recommandées avant l'ouverture",
    icone: Activity,
    accent: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    key: "basse",
    titre: "Vérifications de routine",
    sousTitre: "Standards de service quotidiens",
    icone: Check,
    accent: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
]

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

/** Salue selon l'heure courante (bonjour / bon après-midi / bonsoir) */
function salutation(): string {
  const h = new Date().getHours()
  if (h < 12) return "Bonjour"
  if (h < 18) return "Bon après-midi"
  return "Bonsoir"
}

// ---------- Jauge circulaire (score manager) ----------

function ScoreGauge({
  value,
  size = 140,
  label = "Score du jour",
}: {
  value: number
  size?: number
  label?: string
}) {
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const offset = circumference - (clamped / 100) * circumference
  const color =
    clamped >= 80 ? "#10b981" : clamped >= 60 ? "#f59e0b" : "#ef4444"
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} : ${clamped}%`}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted/25"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-black tabular-nums"
          style={{ color }}
        >
          {clamped}
          <span className="text-base font-bold">%</span>
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  )
}

// ---------- Section Aéroport (signalements 24h) ----------

function AirportSection({ stats }: { stats: AirportStats }) {
  const slaColor =
    stats.slaCompliance >= 80
      ? "text-emerald-700 dark:text-emerald-300"
      : stats.slaCompliance >= 60
        ? "text-amber-700 dark:text-amber-300"
        : "text-rose-700 dark:text-rose-300"

  return (
    <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-sky-50/40 dark:border-emerald-900/40 dark:from-emerald-950/20 dark:via-card dark:to-sky-950/10">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              aria-hidden
            >
              <Plane className="size-5" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-emerald-900 dark:text-emerald-100">
                Aéroport — Signalements 24h
              </CardTitle>
              <CardDescription className="text-xs text-emerald-800/70 dark:text-emerald-200/70">
                Vue temps réel agrégée par zone · SLA opérationnel
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-300 bg-white/80 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            {stats.total24h} signalement{stats.total24h > 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs globaux */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <KpiAirport
            label="En attente"
            value={stats.enAttente}
            icone={Clock}
            className="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          />
          <KpiAirport
            label="En cours"
            value={stats.enCours}
            icone={Loader2}
            className="bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
          />
          <KpiAirport
            label="Résolus"
            value={stats.resolus}
            icone={Check}
            className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
          />
          <KpiAirport
            label="Conformité SLA"
            value={`${stats.slaCompliance}%`}
            icone={Gauge}
            className={cn(
              "bg-emerald-50 dark:bg-emerald-950/30",
              slaColor
            )}
          />
        </div>

        {/* Détail par zone */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Par zone
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stats.byZone.map((z) => (
              <div
                key={z.code}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2.5",
                  z.enAttente > 0
                    ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
                    : "border-border bg-card/60"
                )}
              >
                <span className="text-xl" aria-hidden>
                  {z.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {z.nom}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {z.count} signalement{z.count > 1 ? "s" : ""}
                    {z.enAttente > 0 && (
                      <span className="text-amber-700 dark:text-amber-300">
                        {" · "}
                        {z.enAttente} en attente
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function KpiAirport({
  label,
  value,
  icone: Icone,
  className,
}: {
  label: string
  value: number | string
  icone: typeof Clock
  className: string
}) {
  return (
    <div className={cn("rounded-xl border border-transparent p-3 text-center", className)}>
      <Icone className="mx-auto size-4 opacity-70" aria-hidden />
      <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">
        {label}
      </p>
    </div>
  )
}

// ---------- Section d'en-tête premium (sunrise + date) ----------

function PremiumHeader({
  titre,
  sousTitre,
  avecBoutonHistorique,
  loadingHisto,
  onHistorique,
  onRetour,
  variant = "sunrise",
}: {
  titre: string
  sousTitre: string
  avecBoutonHistorique?: boolean
  loadingHisto?: boolean
  onHistorique?: () => void
  onRetour?: () => void
  variant?: "sunrise" | "compact"
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl text-amber-600 shadow-sm",
            variant === "sunrise"
              ? "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40"
              : "bg-amber-100/70 dark:bg-amber-900/40"
          )}
          aria-hidden
        >
          <Sunrise className="size-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {titre}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRetour && (
          <Button variant="ghost" size="sm" onClick={onRetour}>
            <ArrowLeft className="mr-1.5 size-4" aria-hidden />
            Retour
          </Button>
        )}
        {avecBoutonHistorique && onHistorique && (
          <Button
            variant="outline"
            size="sm"
            onClick={onHistorique}
            disabled={loadingHisto}
          >
            {loadingHisto ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : (
              <History className="mr-1.5 size-4" aria-hidden />
            )}
            Historique
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------- Photo miniature cliquable ----------

function PhotoThumb({ url, alt }: { url: string; alt: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
      aria-label={alt}
    >
      <img
        src={url}
        alt={alt}
        className="size-12 object-cover transition group-hover:scale-105"
        loading="lazy"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
        <Camera className="size-3.5 text-white" aria-hidden />
      </span>
    </a>
  )
}

// ---------- Section de regroupement (urgence) ----------

function SectionHeader({ section, count }: { section: SectionMeta; count: number }) {
  const Icone = section.icone
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 rounded-full", section.dot)} aria-hidden />
      <Icone className={cn("size-4", section.accent)} aria-hidden />
      <h3 className="text-sm font-bold tracking-tight text-foreground">
        {section.titre}
      </h3>
      <Badge
        variant="secondary"
        className="ml-1 bg-muted/60 text-[10px] font-medium tabular-nums text-muted-foreground"
      >
        {count}
      </Badge>
      <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
        · {section.sousTitre}
      </span>
    </div>
  )
}

// ---------- Composant principal ----------

type EtatVue = "idle" | "checklist" | "saving" | "done" | "historique"

export function AuditMatinTab() {
  const { toast } = useToast()
  const session = useAppStore((s) => s.session)
  const isAeroport = session?.pro?.typeEtablissement === "Aéroport"

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
  // Stats aéroport 24h (uniquement pour secteur Aéroport)
  const [airportStats, setAirportStats] = useState<AirportStats | null>(null)
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
        // Stats aéroport (présentes uniquement pour le secteur Aéroport)
        if (json.data.airportStats) {
          setAirportStats(json.data.airportStats as AirportStats)
        }
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
        if (json.data.airportStats) {
          setAirportStats(json.data.airportStats as AirportStats)
        }
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

  // ---------- Regroupement des items par urgence ----------
  const itemsGroupes = SECTIONS.map((s) => ({
    section: s,
    items: items.filter((it) => it.urgence === s.key),
  })).filter((g) => g.items.length > 0)

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
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
    const itemsDone = auditDuJour.items as ItemAuditState[]
    const itemsDoneGroupes = SECTIONS.map((s) => ({
      section: s,
      items: itemsDone.filter((it) => it.urgence === s.key),
    })).filter((g) => g.items.length > 0)

    return (
      <div className="space-y-5">
        {/* Card premium "audit terminé" avec jauge circulaire */}
        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-amber-50/40 dark:border-emerald-900/40 dark:from-emerald-950/20 dark:via-card dark:to-amber-950/10">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
              {/* Bloc gauche : titre + date + résumé */}
              <div className="flex flex-1 flex-col items-center text-center sm:items-start sm:text-left">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <span className="flex size-7 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-bold uppercase tracking-wide">
                    Audit terminé
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-emerald-900 dark:text-emerald-100 sm:text-3xl">
                  Votre audit du matin est enregistré
                </h2>
                <p className="mt-1.5 text-sm text-emerald-800/70 dark:text-emerald-200/70">
                  {formatDateLong(auditDuJour.date)}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-white/80 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    <Check className="mr-1 size-3" aria-hidden />
                    {itemsDone.filter((it) => it.valide === true).length} validés
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-border bg-white/70 text-muted-foreground dark:bg-card/70"
                  >
                    {itemsDone.length} items au total
                  </Badge>
                </div>
              </div>

              {/* Jauge circulaire */}
              <ScoreGauge value={auditDuJour.scoreManager} />
            </div>
          </CardContent>
        </Card>

        {/* Section aéroport (si applicable) */}
        {isAeroport && airportStats && <AirportSection stats={airportStats} />}

        {/* Récap items groupés par urgence */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-primary" aria-hidden />
              Détail de l&apos;audit
            </CardTitle>
            <CardDescription>
              {itemsDone.length} items répartis par priorité
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {itemsDoneGroupes.map(({ section, items: itemsSection }) => (
              <div key={section.key} className="space-y-2.5">
                <SectionHeader section={section} count={itemsSection.length} />
                <div className="space-y-2">
                  {itemsSection.map((it) => (
                    <div
                      key={it.id}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-3.5",
                        it.valide
                          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                          : "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                          it.valide
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                        )}
                        aria-hidden
                      >
                        {it.valide ? <Check className="size-4" /> : <X className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{it.label}</p>
                        {it.note && (
                          <p className="mt-1 text-xs text-muted-foreground">{it.note}</p>
                        )}
                      </div>
                      {it.photoUrl && (
                        <PhotoThumb url={it.photoUrl} alt="Photo du problème signalé" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notes libres */}
        {auditDuJour.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes du manager</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {auditDuJour.notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void chargerHistorique()}>
            <History className="mr-2 size-4" aria-hidden />
            Voir l&apos;historique (30 jours)
          </Button>
          <Button variant="ghost" onClick={() => void charger()}>
            Rafraîchir
          </Button>
        </div>
      </div>
    )
  }

  // ====== Vue : Checklist interactive ======
  if (vue === "checklist" || vue === "saving") {
    return (
      <div className="space-y-5">
        {/* En-tête premium + jauge progression */}
        <Card className="overflow-hidden border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/50 dark:border-amber-900/40 dark:from-amber-950/20 dark:via-card dark:to-orange-950/10">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 dark:from-amber-900/40 dark:to-orange-900/40"
                  aria-hidden
                >
                  <Sunrise className="size-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {salutation()}, votre audit
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatDateLong(new Date().toISOString())}
                  </p>
                </div>
              </div>

              {/* Jauge de progression (items traités) */}
              <div className="flex items-center gap-4">
                <ScoreGauge
                  value={progression}
                  size={104}
                  label="Progression"
                />
                <div className="hidden text-sm text-muted-foreground sm:block">
                  <p className="font-medium text-foreground">
                    {itemsTraites} / {items.length}
                  </p>
                  <p>items traités</p>
                  <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-300">
                    {itemsValides} validés
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Barre de progression (vue mobile) */}
        <div className="space-y-1.5 sm:hidden">
          <Progress value={progression} className="h-2" />
          <p className="text-right text-xs text-muted-foreground">
            {itemsTraites} / {items.length} · {progression}%
          </p>
        </div>

        {/* Section aéroport (si applicable) — visible pendant l'audit */}
        {isAeroport && airportStats && <AirportSection stats={airportStats} />}

        {/* Items groupés par urgence */}
        <div className="space-y-6">
          {itemsGroupes.map(({ section, items: itemsSection }) => {
            const SectionIcon = section.icone
            return (
              <div key={section.key} className="space-y-3">
                {/* En-tête de section */}
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border-l-4 bg-card/80 py-2 pl-3 pr-2",
                    section.key === "haute" && "border-rose-500",
                    section.key === "moyenne" && "border-amber-500",
                    section.key === "basse" && "border-emerald-500"
                  )}
                >
                  <SectionIcon className={cn("size-4", section.accent)} aria-hidden />
                  <h3 className="text-sm font-bold tracking-tight text-foreground">
                    {section.titre}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="bg-muted/60 text-[10px] font-medium tabular-nums text-muted-foreground"
                  >
                    {itemsSection.length}
                  </Badge>
                </div>

                {/* Items de la section */}
                <div className="space-y-3">
                  {itemsSection.map((it) => {
                    const badge = badgeUrgence(it.urgence)
                    return (
                      <Card key={it.id} className="overflow-hidden transition hover:shadow-md">
                        <CardContent className="p-4 sm:p-5">
                          {/* Label + badge urgence */}
                          <div className="flex items-start gap-3">
                            <span
                              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                              aria-hidden
                            >
                              {items.indexOf(it) + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug text-foreground sm:text-base">
                                {it.label}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] font-medium", badge.className)}
                                >
                                  {badge.label}
                                </Badge>
                                {it.photoRequise && (
                                  <Badge variant="outline" className="text-[10px] font-medium">
                                    <Camera className="mr-1 size-2.5" aria-hidden />
                                    Photo requise
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {/* Thumbnail si photo déjà présente */}
                            {it.photoUrl && (
                              <PhotoThumb url={it.photoUrl} alt="Photo jointe" />
                            )}
                          </div>

                          {/* Boutons d'action */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              type="button"
                              variant={it.valide === true ? "default" : "outline"}
                              className={cn(
                                "h-10 px-4",
                                it.valide === true
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300"
                              )}
                              onClick={() => validerItem(it.id, true)}
                              disabled={vue === "saving"}
                            >
                              <Check className="mr-1.5 size-4" aria-hidden />
                              Validé ✓
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant={it.valide === false ? "default" : "outline"}
                              className={cn(
                                "h-10 px-4",
                                it.valide === false
                                  ? "bg-rose-600 text-white hover:bg-rose-700"
                                  : "border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                              )}
                              onClick={() => validerItem(it.id, false)}
                              disabled={vue === "saving"}
                            >
                              <X className="mr-1.5 size-4" aria-hidden />
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
                                    Voir en grand
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
              </div>
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
  // Par défaut : Card premium "Bonjour ! Votre audit du matin vous attend"
  return (
    <div className="space-y-5">
      {/* En-tête premium */}
      <PremiumHeader
        titre="Audit du matin"
        sousTitre="Une checklist dictée par le Coach IA, basée sur les retours de la veille."
        avecBoutonHistorique
        loadingHisto={loadingHisto}
        onHistorique={() => void chargerHistorique()}
      />

      {/* Card "Bonjour" premium avec gradient + icône sunrise */}
      <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/80 to-rose-50/40 dark:border-amber-900/40 dark:from-amber-950/20 dark:via-orange-950/15 dark:to-rose-950/10">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col items-start gap-5">
            {/* En-tête de la card */}
            <div className="flex items-center gap-4">
              <div
                className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-200 to-orange-200 text-4xl shadow-sm dark:from-amber-900/60 dark:to-orange-900/60"
                aria-hidden
              >
                🌅
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tight text-amber-900 dark:text-amber-100 sm:text-3xl">
                  {salutation()} ! Votre audit vous attend.
                </h3>
                <p className="mt-1 text-sm font-medium text-amber-800/80 dark:text-amber-200/80">
                  {formatDateLong(new Date().toISOString())}
                </p>
              </div>
            </div>

            {/* Résumé des retours de la veille */}
            {donneesVeille && (
              <div className="grid w-full grid-cols-3 gap-3">
                <div className="rounded-2xl border border-amber-200/60 bg-white/70 p-3 text-center dark:border-amber-900/30 dark:bg-amber-950/30">
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300 sm:text-3xl">
                    {donneesVeille.total}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                    Retours (24h)
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200/60 bg-white/70 p-3 text-center dark:border-rose-900/30 dark:bg-rose-950/30">
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400 sm:text-3xl">
                    {donneesVeille.totalNegatifs}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                    Négatifs ≤ 2★
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200/60 bg-white/70 p-3 text-center dark:border-amber-900/30 dark:bg-amber-950/30">
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300 sm:text-3xl">
                    {donneesVeille.noteMoyenne.toFixed(1)}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                    Note moyenne /5
                  </p>
                </div>
              </div>
            )}

            {/* Source de la checklist */}
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700/80 dark:text-amber-300/80">
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
                className="h-11 bg-amber-600 px-6 text-base font-bold text-white hover:bg-amber-700"
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
              <Button
                variant="outline"
                className="h-11"
                onClick={() => void regenererChecklist()}
                disabled={generating}
              >
                <Sparkles className="mr-2 size-4" aria-hidden />
                Régénérer la checklist
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section aéroport (si applicable) */}
      {isAeroport && airportStats && <AirportSection stats={airportStats} />}

      {/* Aperçu de la checklist du jour, groupé par urgence */}
      {checklist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-primary" aria-hidden />
              Aperçu de votre checklist du jour
            </CardTitle>
            <CardDescription>
              {checklist.length} items — basés sur les problèmes récurrents détectés la veille.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {SECTIONS.map((section) => {
              const itemsSection = checklist.filter((c) => c.urgence === section.key)
              if (itemsSection.length === 0) return null
              return (
                <div key={section.key} className="space-y-2.5">
                  <SectionHeader section={section} count={itemsSection.length} />
                  <div className="space-y-2">
                    {itemsSection.map((c) => {
                      const badge = badgeUrgence(c.urgence)
                      return (
                        <div
                          key={c.id}
                          className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3"
                        >
                          <span
                            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                            aria-hidden
                          >
                            {checklist.indexOf(c) + 1}
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
    <div className="space-y-5">
      {/* En-tête */}
      <PremiumHeader
        titre="Historique — 30 derniers jours"
        sousTitre={`${audits.length} audit(s) complété(s) sur la période.`}
        onRetour={onRetour}
        variant="compact"
      />

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
                      {comparaison.noteMoyenneClient.toFixed(1)}
                      <span className="text-sm font-medium">/5</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Note client moyenne</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-950/20">
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                      {comparaison.noteMoyenneManagerSur5.toFixed(1)}
                      <span className="text-sm font-medium">/5</span>
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
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.notes}</p>
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
