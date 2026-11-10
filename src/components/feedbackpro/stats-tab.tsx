"use client"

// ============================================================
// FeedbackPro - Onglet "Statistiques" du dashboard Pro (pivot Zones)
// Données : GET /api/pro/stats?periode=7j|30j|90j|1an (défaut 30j)
//   → { periode, nbJours, courbe (+alias courbe30j), parTag, parHeure,
//      parHeureMatrice, parZone, kpis }
// Graphiques : courbe des scores · camembert répartition par zone ·
// barres horizontales tags · note moyenne par zone · heatmap 7j × 24h
// Exports : CSV (API) + PDF (jsPDF, généré localement)
// ============================================================

import { useEffect, useState } from "react"
import { Download, FileText, Star, MessageSquare, AlertTriangle, MapPin } from "lucide-react"
import { jsPDF } from "jspdf"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatCard } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { JOURS, tagLabel, POSITIVE_TAGS_ETENDUS, NEGATIVE_TAGS_ETENDUS } from "@/lib/constants"
import { exportToCsv } from "@/lib/export-csv"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts"

// ---------- Contrat API (avec normalisation tolérante aux champs) ----------

type PointCourbeApi = {
  jour?: string
  date?: string
  score?: number | null
  note?: number | null
  noteMoy?: number | null
  retours?: number
  count?: number
}

type StatsApi = {
  periode?: string
  nbJours?: number
  /** Courbe de la période sélectionnée */
  courbe?: PointCourbeApi[]
  /** Alias rétro-compatible de `courbe` (consommateurs Session 1-3) */
  courbe30j?: PointCourbeApi[]
  /** Mentions par tag : [{ tag | id, label?, type?, count }] trié par count desc */
  parTag?: { tag?: string; id?: string; label?: string; type?: string; count?: number }[]
  /** Heatmap 7 jours × 24h : [{ jour (0-6 ou nom), heure, total }] */
  parHeure?: { jour?: number | string; heure?: number; total?: number; count?: number }[]
  /** [{ zoneNom, noteMoy, total }] */
  parZone?: { zoneNom?: string; nom?: string; noteMoy?: number; total?: number }[]
  /** KPIs libres (noteMoyenne, total, alertes…) */
  kpis?: Record<string, number>
  /** D1 : NPS (Net Promoter Score) sur la période — null si aucun NPS renseigné */
  nps?: {
    score: number | null
    total: number
    promoteurs: number
    passifs: number
    detracteurs: number
    pctPromoteurs: number
    pctPassifs: number
    pctDetracteurs: number
  } | null
  /** D5 : Benchmark sectoriel anonymisé */
  benchmark?: {
    scoreEtablissement: number
    scoreSectorielMoyen: number | null
    ecart: number | null
    nbEtablissements: number
  }
}

// ---------- Périodes (contrat API : ?periode=7j|30j|90j|1an) ----------

type Periode = "7j" | "30j" | "90j" | "1an"

const PERIODES: { value: Periode; label: string }[] = [
  { value: "7j", label: "7 derniers jours" },
  { value: "30j", label: "30 derniers jours" },
  { value: "90j", label: "90 derniers jours" },
  { value: "1an", label: "1 an" },
]

function libellePeriode(p: Periode): string {
  return PERIODES.find((x) => x.value === p)?.label ?? "30 derniers jours"
}

const BLEU = "#3B82F6"
const VERT = "#10B981"
const ROUGE = "#EF4444"
/** Audit UX : rose-500 (#F43F5E) pour les tags négatifs (fill-rose-500) */
const ROSE = "#F43F5E"
/** Palette du thème (6 teintes distinctes) pour le camembert des zones */
const ZONE_COLORS = ["#3B82F6", "#0891b2", "#7c3aed", "#f59e0b", "#10B981", "#EF4444"]

/** Ensembles d'IDs de tags positifs/négatifs pour la coloration par sentiment. */
const IDS_TAGS_POSITIFS = new Set(POSITIVE_TAGS_ETENDUS.map((t) => t.id))
const IDS_TAGS_NEGATIFS = new Set(NEGATIVE_TAGS_ETENDUS.map((t) => t.id))

/**
 * Détermine le sentiment d'un tag à partir de son ID (ou label).
 * Audit UX : colore les barres — vert pour positif, rouge pour négatif,
 * bleu pour neutre. On vérifie l'appartenance aux catalogues de constants.ts.
 */
function sentimentTag(id: string, label: string): "positif" | "negatif" | "neutre" {
  if (IDS_TAGS_POSITIFS.has(id)) return "positif"
  if (IDS_TAGS_NEGATIFS.has(id)) return "negatif"
  // Repli heuristique sur le label (tags libres hors catalogue)
  const l = label.toLowerCase()
  if (/(prop|rapide|accueill|excellent|chaleureux|propre|agreable|bien)/.test(l)) return "positif"
  if (/(impol|froid|lent|sale|attente|distrait|erreur|tiede|desagreable|manque)/.test(l)) return "negatif"
  return "neutre"
}

/** Garde-fou : renvoie toujours un tableau (l'API peut être en cours de migration) */
function enArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

export function StatsTab() {
  // ProData finale (pivot Zones) — cast local pendant la migration du store
  const nomEtablissement =
    (useAppStore((s) => s.session?.pro) as unknown as { nomEtablissement?: string } | null | undefined)
      ?.nomEtablissement ?? "Mon établissement"
  const [data, setData] = useState<StatsApi | null>(null)
  const [loading, setLoading] = useState(true)
  const [periode, setPeriode] = useState<Periode>("30j")
  // Filtre par zone ("" = toutes les zones ; sinon le nom de la zone filtrée)
  const [zoneFiltre, setZoneFiltre] = useState<string>("")
  const { toast } = useToast()

  useEffect(() => {
    let annule = false
    const qs = new URLSearchParams({ periode })
    if (zoneFiltre) qs.set("zone", zoneFiltre)
    fetch(`/api/pro/stats?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j.ok) setData(j.data)
        else toast({ title: "Erreur", description: "Impossible de charger les statistiques", variant: "destructive" })
      })
      .catch(() => {
        if (!annule) toast({ title: "Erreur", description: "Impossible de charger les statistiques", variant: "destructive" })
      })
      .finally(() => {
        if (!annule) setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [periode, zoneFiltre, toast])

  // ---------- Normalisation des données ----------
  const k = data?.kpis ?? {}
  const noteMoyenne = k.noteMoyenne ?? k.noteMoy ?? 0
  const totalRetours = k.total ?? k.totalRetours ?? k.retours30j ?? 0
  const alertes = k.alertes ?? k.nbAlertes ?? k.alertes30j ?? 0

  // Courbe de la période (alias courbe30j rétro-compatible).
  // Un jour/sans semaine sans retour → note nulle pour ne pas tirer la ligne
  // vers 0 (connectNulls assure la continuité visuelle).
  // `noteMoy` est la note moyenne réelle sur /5 (prioritaire sur l'ancien
  // `note` qui était alias du score /100). L'axe Y est désormais sur /5.
  const courbe = enArray(data?.courbe30j ?? data?.courbe).map((p) => {
    const count = p.count ?? p.retours ?? 0
    const noteMoy = p.noteMoy ?? null
    const noteLegacy = p.note ?? p.score ?? null
    return {
      jour: p.jour ?? p.date ?? "",
      note: noteMoy != null ? noteMoy : noteLegacy != null ? Number(noteLegacy) / 4 : null,
      count,
    }
  })
  // Intervalle des labels X calculé pour rester lisible même sur ~53 points
  // (agrégation hebdomadaire de la période 1 an).
  const intervalleX = Math.max(0, Math.floor(courbe.length / 8) - 1)

  // Tags les plus fréquents (déjà triés par count desc côté API, top 8)
  // Audit UX : sentiment déterminé via POSITIVE/NEGATIVE_TAGS (constants.ts)
  // plutôt que via le champ `type` de l'API qui peut être absent.
  const parTag = enArray(data?.parTag)
    .map((t) => {
      const id = t.tag ?? t.id ?? "?"
      const label = t.label ?? tagLabel(id)
      return {
        label,
        count: t.count ?? 0,
        type: sentimentTag(id, label),
      }
    })
    .filter((t) => t.count > 0)
    .slice(0, 8)
  // Inversé pour l'affichage : en BarChart vertical, la 1re catégorie se
  // dessine en bas → on inverse pour avoir le tag n°1 en haut.
  const parTagGraphique = [...parTag].reverse()

  // Par zone : note moyenne + volume
  const parZone = enArray(data?.parZone).map((z) => ({
    zoneNom: z.zoneNom ?? z.nom ?? "Zone",
    noteMoy: z.noteMoy ?? 0,
    total: z.total ?? 0,
  }))

  /** Audit UX : la zone la plus faible (note moyenne la plus basse, avec ≥ 1 retour).
   *  Utilisée pour personnaliser le conseil du benchmark sectoriel. */
  const zoneLaPlusFaible =
    parZone.filter((z) => z.total > 0).sort((a, b) => a.noteMoy - b.noteMoy)[0]?.zoneNom ?? null

  // Heatmap 7 jours × 24h : matrice [jour][heure] à partir des lignes API
  const indexJour = (jour: number | string | undefined): number => {
    if (typeof jour === "number") return Math.min(6, Math.max(0, jour))
    const nom = String(jour ?? "").toLowerCase()
    const idx = JOURS.findIndex((j) => j.toLowerCase().startsWith(nom.slice(0, 3)))
    return idx >= 0 ? idx : 0
  }
  const matrice: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const cell of enArray(data?.parHeure)) {
    const j = indexJour(cell.jour)
    const h = Math.min(23, Math.max(0, Math.round(cell.heure ?? 0)))
    matrice[j][h] += cell.total ?? cell.count ?? 0
  }
  const maxCellule = Math.max(1, ...matrice.flat())

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }

  // Libellés adaptés à la période sélectionnée
  const periodeLabel = libellePeriode(periode)
  const periodeCourt = periode === "1an" ? "1 an" : periode

  // ---------- Export PDF (généré localement avec jsPDF) ----------
  function exporterPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const W = 210
    const M = 15
    doc.setFillColor(37, 99, 235)
    doc.rect(0, 0, W, 36, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(20)
    doc.setTextColor(255, 255, 255)
    doc.text("Rapport statistiques", M, 16)
    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    doc.text(`${nomEtablissement} — Période : ${periodeLabel}`, M, 26)
    doc.text(
      `Généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`,
      W - M,
      26,
      { align: "right" }
    )

    let y = 52
    // KPIs
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor(30, 30, 30)
    doc.text("Vue d'ensemble", M, y)
    y += 4
    const kpis: [string, string][] = [
      ["Note moyenne", noteMoyenne ? `${noteMoyenne.toFixed(2)} / 5` : "—"],
      [`Retours (${periodeCourt})`, String(totalRetours)],
      ["Alertes (≤ 2★)", String(alertes)],
      ["Zones suivies", String(parZone.length)],
    ]
    const colW = (W - 2 * M) / 4
    kpis.forEach(([label, value], i) => {
      const x = M + i * colW
      doc.setDrawColor(225, 228, 232)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x, y, colW - 4, 22, 2, 2, "FD")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(110, 115, 120)
      doc.text(label, x + 4, y + 7)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.setTextColor(30, 30, 30)
      doc.text(value, x + 4, y + 16)
    })
    y += 34

    // Par zone
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("Performance par zone", M, y)
    y += 8
    if (parZone.length === 0) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.setTextColor(120, 120, 120)
      doc.text("Aucune zone avec des retours sur la période", M, y + 4)
      y += 12
    } else {
      parZone.forEach((z) => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(z.zoneNom.slice(0, 42), M, y + 4)
        doc.setFont("helvetica", "bold")
        doc.text(`${z.noteMoy ? z.noteMoy.toFixed(2) : "—"} / 5 · ${z.total} retour(s)`, M + 70, y + 4)
        y += 7
      })
      y += 8
    }

    // Top tags
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("Mentions clients par thème", M, y)
    y += 8
    const tags = parTag.slice(0, 8)
    if (tags.length === 0) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
      doc.setTextColor(120, 120, 120)
      doc.text("Aucune mention sur la période", M, y + 4)
      y += 12
    } else {
      tags.forEach((t) => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(t.label.slice(0, 42), M, y + 4)
        doc.setFont("helvetica", "bold")
        doc.text(`${t.count} mention(s)`, M + 90, y + 4)
        y += 7
      })
      y += 8
    }

    // Heures critiques (top 5 des cellules de la heatmap)
    const critiques = matrice
      .flatMap((ligne, j) => ligne.map((total, h) => ({ jour: JOURS[j], heure: h, total })))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .filter((c) => c.total > 0)
    if (critiques.length > 0) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.text("Heures critiques", M, y)
      y += 8
      critiques.forEach((c) => {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(`${c.jour} à ${c.heure}h`, M, y + 4)
        doc.setFont("helvetica", "bold")
        doc.text(`${c.total} retour(s)`, M + 90, y + 4)
        y += 7
      })
    }

    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(150, 150, 150)
    doc.text("Propulsé par FeedbackPro — Le Coach IA d'audit qualité continu", W / 2, 287, { align: "center" })
    doc.save(`rapport-stats-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div className="space-y-6">
      {/* ---------- En-tête : sélecteur de période + filtre zone + exports ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Statistiques</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit qualité continu de vos zones — {periodeLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={periode}
            onValueChange={(v) => {
              // setLoading ici (et non dans l'effet) : re-skeleton immédiat
              // pendant le re-chargement de la nouvelle période
              setLoading(true)
              setPeriode(v as Periode)
            }}
          >
            <SelectTrigger className="h-9 w-[176px]" aria-label="Période d'analyse">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Filtre par zone : affiné les graphiques à une zone précise */}
          <Select
            value={zoneFiltre || "__all__"}
            onValueChange={(v) => {
              setLoading(true)
              setZoneFiltre(v === "__all__" ? "" : v)
            }}
          >
            <SelectTrigger className="h-9 w-[180px]" aria-label="Filtrer par zone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes les zones</SelectItem>
              {parZone.map((z) => (
                <SelectItem key={z.zoneNom} value={z.zoneNom}>
                  {z.zoneNom} ({z.total})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={exporterPdf}>
            <FileText className="mr-1.5 h-4 w-4" aria-hidden />
            Exporter PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              const lignes: Record<string, unknown>[] = []
              lignes.push({ Indicateur: "Période", Valeur: periodeLabel })
              lignes.push({ Indicateur: "Note moyenne (/5)", Valeur: noteMoyenne ? noteMoyenne.toFixed(2) : "" })
              lignes.push({ Indicateur: `Retours (${periodeCourt})`, Valeur: totalRetours })
              lignes.push({ Indicateur: "Alertes (≤ 2★)", Valeur: alertes })
              lignes.push({ Indicateur: "Zones suivies", Valeur: parZone.length })
              lignes.push({ Indicateur: "", Valeur: "" })
              lignes.push({ Indicateur: "— Performance par zone —", Valeur: "" })
              for (const z of parZone) {
                lignes.push({
                  Indicateur: `Zone : ${z.zoneNom}`,
                  Valeur: `Note ${z.noteMoy ? z.noteMoy.toFixed(2) : "—"} / 5 — ${z.total} retour(s)`,
                })
              }
              lignes.push({ Indicateur: "", Valeur: "" })
              lignes.push({ Indicateur: "— Top tags —", Valeur: "" })
              for (const t of parTag) {
                lignes.push({ Indicateur: `Tag : ${t.label}`, Valeur: t.count })
              }
              lignes.push({ Indicateur: "", Valeur: "" })
              lignes.push({ Indicateur: "— Heures critiques (top 5) —", Valeur: "" })
              const critiques = matrice
                .flatMap((ligne, j) => ligne.map((total, h) => ({ jour: JOURS[j], heure: h, total })))
                .sort((a, b) => b.total - a.total)
                .slice(0, 5)
                .filter((c) => c.total > 0)
              for (const c of critiques) {
                lignes.push({ Indicateur: `${c.jour} à ${c.heure}h`, Valeur: c.total })
              }
              exportToCsv(`statistiques-${periode}-${new Date().toISOString().slice(0, 10)}`, lignes)
            }}
            aria-label="Exporter les statistiques en CSV"
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            Exporter CSV
          </Button>
          <a href="/api/pro/retours/export" download className="hidden sm:block">
            <Button variant="ghost" size="sm" className="h-9 text-xs">
              Exporter retours (serveur)
            </Button>
          </a>
        </div>
      </div>

      {/* ---------- KPIs (période sélectionnée) ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Star} label={`Note moyenne (${periodeCourt})`} value={noteMoyenne ? noteMoyenne.toFixed(2) : "—"} />
        <StatCard icon={MessageSquare} label={`Retours (${periodeCourt})`} value={totalRetours} />
        <StatCard icon={AlertTriangle} label="Alertes (note ≤ 2)" value={alertes} />
        <StatCard icon={MapPin} label="Zones suivies" value={parZone.length} />
      </div>

      {/* ---------- D1 : NPS (Net Promoter Score) + D5 : Benchmark sectoriel ---------- */}
      {(data?.nps || data?.benchmark) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* NPS */}
          {data.nps && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg">Net Promoter Score (NPS)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Sur {data.nps.total} retour{data.nps.total > 1 ? "s" : ""} avec NPS renseigné ({periodeCourt})
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Score NPS géant */}
                <div className="flex items-end gap-2">
                  <span
                    className={`text-4xl font-bold ${
                      (data.nps.score ?? 0) >= 50
                        ? "text-green-600"
                        : (data.nps.score ?? 0) >= 0
                          ? "text-amber-600"
                          : "text-rose-600"
                    }`}
                  >
                    {data.nps.score !== null ? (data.nps.score > 0 ? "+" : "") + data.nps.score : "—"}
                  </span>
                  <span className="mb-1 text-xs text-muted-foreground">échelle −100 à +100</span>
                </div>
                {/* Segmentation Promoteurs / Passifs / Détracteurs */}
                <div className="flex h-3 overflow-hidden rounded-full">
                  <div className="bg-green-500" style={{ width: `${data.nps.pctPromoteurs}%` }} title={`Promoteurs : ${data.nps.pctPromoteurs}%`} />
                  <div className="bg-amber-400" style={{ width: `${data.nps.pctPassifs}%` }} title={`Passifs : ${data.nps.pctPassifs}%`} />
                  <div className="bg-rose-500" style={{ width: `${data.nps.pctDetracteurs}%` }} title={`Détracteurs : ${data.nps.pctDetracteurs}%`} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-green-50 p-2">
                    <p className="font-bold text-green-700">{data.nps.promoteurs}</p>
                    <p className="text-muted-foreground">Promoteurs (9-10)</p>
                    <p className="text-[10px] text-muted-foreground">{data.nps.pctPromoteurs}%</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2">
                    <p className="font-bold text-amber-700">{data.nps.passifs}</p>
                    <p className="text-muted-foreground">Passifs (7-8)</p>
                    <p className="text-[10px] text-muted-foreground">{data.nps.pctPassifs}%</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 p-2">
                    <p className="font-bold text-rose-700">{data.nps.detracteurs}</p>
                    <p className="text-muted-foreground">Détracteurs (0-6)</p>
                    <p className="text-[10px] text-muted-foreground">{data.nps.pctDetracteurs}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Benchmark sectoriel (D5) */}
          {data.benchmark && data.benchmark.scoreSectorielMoyen !== null && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg">Benchmark sectoriel</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Comparaison anonymisée avec {data.benchmark.nbEtablissements} établissement
                  {data.benchmark.nbEtablissements > 1 ? "s" : ""} du même secteur
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Votre score</p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      {data.benchmark.scoreEtablissement.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">/ 5 ({periodeCourt})</p>
                  </div>
                  <div
                    className={`rounded-lg border border-stone-200 bg-muted/30 p-3 text-center`}
                  >
                    <p className="text-xs text-muted-foreground">Moyenne du secteur</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {data.benchmark.scoreSectorielMoyen.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">/ 5 (toutes périodes)</p>
                  </div>
                </div>
                <div
                  className={`flex items-center justify-center gap-2 rounded-lg p-2.5 text-sm font-semibold ${
                    (data.benchmark.ecart ?? 0) > 0
                      ? "bg-green-50 text-green-700"
                      : (data.benchmark.ecart ?? 0) < 0
                        ? "bg-rose-50 text-rose-700"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {(data.benchmark.ecart ?? 0) > 0 ? "▲" : (data.benchmark.ecart ?? 0) < 0 ? "▼" : "="}{" "}
                  {data.benchmark.ecart !== null && data.benchmark.ecart > 0 ? "+" : ""}
                  {data.benchmark.ecart?.toFixed(2)} pts vs secteur
                </div>
                {/* Conseil contextuel : si écart négatif, orienter le pro vers sa zone la plus faible.
                    Audit UX : personnalisation avec le nom de la zone la moins bien notée. */}
                {(data.benchmark.ecart ?? 0) < 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                    <p className="font-semibold">💡 Conseil du Coach IA</p>
                    <p className="mt-0.5">
                      {zoneLaPlusFaible
                        ? `Concentrez-vous sur ${zoneLaPlusFaible} pour dépasser la moyenne de votre secteur.`
                        : "Concentrez-vous sur vos zones les plus faibles pour dépasser la moyenne du secteur."}
                    </p>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  🔒 Comparaison anonyme : aucun nom d&apos;établissement n&apos;est divulgué, seule la moyenne du secteur est calculée.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---------- Évolution des scores sur la période ---------- */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Évolution des scores ({periodeLabel})</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={courbe} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              {/* scale="point" : empêche Recharts de parser les labels « JJ/MM » comme dates US ;
                  intervalle dynamique pour rester lisible même sur ~53 points (1 an hebdo) */}
              <XAxis dataKey="jour" scale="point" tick={{ fontSize: 10 }} interval={intervalleX} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v) => [v != null ? `${v} ★` : "—", "Note moyenne (/5)"]}
                labelStyle={{ color: "#1c1917" }}
              />
              <Line type="monotone" dataKey="note" stroke={BLEU} strokeWidth={2.5} dot={false} connectNulls activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------- Par zone : note moyenne + répartition ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Note moyenne par zone</CardTitle>
            <p className="text-sm text-muted-foreground">Repérez les zones à retravailler en priorité</p>
          </CardHeader>
          <CardContent className="h-72">
            {parZone.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucun retour par zone sur la période
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parZone} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="zoneNom"
                    width={110}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={(v) => [`${v} ★`, "Note moyenne"]} labelStyle={{ color: "#1c1917" }} />
                  <Bar dataKey="noteMoy" fill={BLEU} radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Répartition des retours par zone</CardTitle>
            <p className="text-sm text-muted-foreground">Part de chaque point de contact dans le volume total</p>
          </CardHeader>
          <CardContent className="h-72">
            {parZone.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucun retour par zone sur la période
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={parZone} dataKey="total" nameKey="zoneNom" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {parZone.map((z, i) => (
                      <Cell key={z.zoneNom} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} retours`, ""]} labelStyle={{ color: "#1c1917" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Tags les plus fréquents (barres horizontales) ---------- */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Tags les plus fréquents</CardTitle>
          <p className="text-sm text-muted-foreground">
            Top 8 des mentions clients — vert : positif · rouge : négatif · bleu : neutre
          </p>
        </CardHeader>
        <CardContent className="h-80">
          {parTagGraphique.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucun tag sur la période</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={parTagGraphique} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={180}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(v) => [`${v} mention(s)`, ""]} labelStyle={{ color: "#1c1917" }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                  {parTagGraphique.map((t, i) => (
                    <Cell key={`${t.label}-${i}`} fill={t.type === "positif" ? VERT : t.type === "negatif" ? ROSE : BLEU} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---------- Heatmap jour × heure (7j × 24h) ---------- */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Heatmap jour × heure</CardTitle>
          <p className="text-sm text-muted-foreground">
            Volume de retours par créneau horaire (intensité = nombre de retours)
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[760px] border-separate border-spacing-1" aria-label="Heatmap des retours par jour et heure">
            <thead>
              <tr>
                <th className="w-20 text-left text-xs font-medium text-muted-foreground" scope="col">
                  Jour
                </th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} scope="col" className="text-center text-[10px] font-medium text-muted-foreground pb-1">
                    {h % 3 === 0 ? `${h}h` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {JOURS.map((jour, j) => (
                <tr key={jour}>
                  <th scope="row" className="text-left text-xs font-medium text-muted-foreground pr-2 whitespace-nowrap">
                    {jour}
                  </th>
                  {Array.from({ length: 24 }, (_, h) => {
                    const total = matrice[j][h]
                    const ratio = total / maxCellule
                    const classe =
                      total === 0
                        ? "bg-muted text-muted-foreground/50"
                        : ratio > 0.66
                          ? "bg-blue-600 text-white"
                          : ratio > 0.33
                            ? "bg-blue-300 text-blue-950 dark:text-blue-50"
                            : "bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100"
                    return (
                      <td key={h} className="p-0">
                        <div
                          className={`flex h-9 items-center justify-center rounded-md text-sm font-semibold transition-transform hover:scale-110 hover:shadow-md ${classe}`}
                          title={`${jour} à ${h}h : ${total} retour(s)`}
                        >
                          {total || ""}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
