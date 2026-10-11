"use client"

// ============================================================
// FeedbackPro - Onglet "Statistiques" du dashboard Pro (pivot Zones)
// Données : GET /api/pro/stats → { courbe30j, parTag, parHeure, parZone, kpis }
// Graphiques : courbe 30j · note moyenne par zone · volume par zone ·
// camembert par tag · heatmap jour × heure (7j × 24h)
// Exports : CSV (API) + PDF (jsPDF, généré localement)
// ============================================================

import { useEffect, useState } from "react"
import { Download, FileText } from "lucide-react"
import { jsPDF } from "jspdf"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { JOURS, tagLabel } from "@/lib/constants"
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

type StatsApi = {
  /** Courbe des 30 derniers jours : [{ jour | date, note, count? }] */
  courbe30j?: { jour?: string; date?: string; note?: number | null; count?: number }[]
  /** Mentions par tag : [{ tag | id, count }] */
  parTag?: { tag?: string; id?: string; count?: number }[]
  /** Heatmap 7 jours × 24h : [{ jour (0-6 ou nom), heure, total }] */
  parHeure?: { jour?: number | string; heure?: number; total?: number; count?: number }[]
  /** [{ zoneNom, noteMoy, total }] */
  parZone?: { zoneNom?: string; nom?: string; noteMoy?: number; total?: number }[]
  /** KPIs libres (noteMoyenne, total, alertes…) */
  kpis?: Record<string, number>
}

const BLEU = "#2563eb"
const TAG_COLORS = ["#2563eb", "#f59e0b", "#0891b2", "#e11d48", "#16a34a", "#7c3aed"]

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
  const { toast } = useToast()

  useEffect(() => {
    let annule = false
    fetch("/api/pro/stats", { cache: "no-store" })
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
  }, [toast])

  // ---------- Normalisation des données ----------
  const k = data?.kpis ?? {}
  const noteMoyenne = k.noteMoyenne ?? k.noteMoy ?? 0
  const totalRetours = k.total ?? k.totalRetours ?? k.retours30j ?? 0
  const alertes = k.alertes ?? k.nbAlertes ?? k.alertes30j ?? 0

  // Courbe 30 jours
  const courbe = enArray(data?.courbe30j).map((p) => ({
    jour: p.jour ?? p.date ?? "",
    note: p.note ?? null,
    count: p.count ?? 0,
  }))

  // Camembert par tag (libellés FR via tagLabel)
  const parTag = enArray(data?.parTag)
    .map((t) => ({ label: tagLabel(t.tag ?? t.id ?? "?"), count: t.count ?? 0 }))
    .filter((t) => t.count > 0)

  // Par zone : note moyenne + volume
  const parZone = enArray(data?.parZone).map((z) => ({
    zoneNom: z.zoneNom ?? z.nom ?? "Zone",
    noteMoy: z.noteMoy ?? 0,
    total: z.total ?? 0,
  }))

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
      </div>
    )
  }

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
    doc.text(`${nomEtablissement} — 30 derniers jours`, M, 26)
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
      ["Retours (30j)", String(totalRetours)],
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
      {/* ---------- En-tête : exports ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Statistiques</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit qualité continu de vos zones — 30 derniers jours.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={exporterPdf}>
            <FileText className="mr-1.5 h-4 w-4" aria-hidden />
            Exporter PDF
          </Button>
          <a href="/api/pro/retours/export" download>
            <Button variant="outline" size="sm" className="h-9">
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Exporter CSV
            </Button>
          </a>
        </div>
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={() => <span className="text-lg">⭐</span>} label="Note moyenne (30j)" value={noteMoyenne ? noteMoyenne.toFixed(2) : "—"} />
        <StatCard icon={() => <span className="text-lg">💬</span>} label="Retours (30 jours)" value={totalRetours} />
        <StatCard icon={() => <span className="text-lg">🚨</span>} label="Alertes (note ≤ 2)" value={alertes} />
        <StatCard icon={() => <span className="text-lg">📍</span>} label="Zones suivies" value={parZone.length} />
      </div>

      {/* ---------- Courbe 30 jours ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Évolution des notes (30 jours)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={courbe} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              {/* scale="point" : empêche Recharts de parser les labels « JJ/MM » comme dates US */}
              <XAxis dataKey="jour" scale="point" tick={{ fontSize: 10 }} interval={3} tickLine={false} axisLine={false} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => [v ? `${v} ★` : "—", "Note moyenne"]} labelStyle={{ color: "#1c1917" }} />
              <Line type="monotone" dataKey="note" stroke={BLEU} strokeWidth={2.5} dot={false} connectNulls activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ---------- Par zone : note moyenne + volume ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Volume par zone</CardTitle>
            <p className="text-sm text-muted-foreground">Nombre de retours collectés par point de contact</p>
          </CardHeader>
          <CardContent className="h-72">
            {parZone.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucun retour par zone sur la période
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parZone} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="zoneNom"
                    width={110}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip formatter={(v) => [`${v} retours`, "Volume"]} labelStyle={{ color: "#1c1917" }} />
                  <Bar dataKey="total" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Camembert par tag ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Mentions clients par tag</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {parTag.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucun tag sur la période</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={parTag} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {parTag.map((_, i) => (
                    <Cell key={i} fill={TAG_COLORS[i % TAG_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${v} mentions`, ""]} labelStyle={{ color: "#1c1917" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ---------- Heatmap jour × heure (7j × 24h) ---------- */}
      <Card>
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
                        ? "bg-stone-100 text-stone-400"
                        : ratio > 0.66
                          ? "bg-blue-600 text-white"
                          : ratio > 0.33
                            ? "bg-blue-300 text-blue-950"
                            : "bg-blue-100 text-blue-900"
                    return (
                      <td key={h} className="p-0">
                        <div
                          className={`flex h-8 items-center justify-center rounded-md text-[10px] font-semibold transition-transform hover:scale-110 ${classe}`}
                          title={`${jour} ${h}h : ${total} retour(s)`}
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
