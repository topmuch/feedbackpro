'use client'

// ============================================================
// VipReportsTab — Rapports manager (module fondamental)
// ------------------------------------------------------------
// Métriques : incidents résolus vs temps moyen · satisfaction ·
// récompenses offertes (coût) · utilisation douches · heures de
// pointe · upsells + commissions · prêts express · Lost & Found.
// Comparaison automatique avec la période précédente (deltas %).
// Livrables : export CSV (Excel, séparateur ; BOM UTF-8) et
// rapport PDF mensuel (jsPDF). Le 1er du mois, le cron
// /api/cron/rapports-mensuels-vip envoie le rapport au manager.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import {
  FileBarChart,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Star,
  Gift,
  ShowerHead,
  Hourglass,
  ShoppingBag,
  Briefcase,
  PackageSearch,
  Download,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

interface Deltas {
  incidentsResolus: number | null
  tempsMoyenMin: number | null
  satisfaction: number | null
  recompensesCout: number | null
  douchesUtilisees: number | null
  upsellCa: number | null
  pretsCount: number | null
  lostFoundTotal: number | null
}

interface ReportData {
  periode: { label: string; debut: string; fin: string }
  periodePrecedente: { label: string }
  metriques: {
    incidentsCrees: number
    incidentsResolus: number
    tempsMoyenMin: number | null
    satisfaction: number | null
    satisfactionNb: number
    recompensesCount: number
    recompensesCout: number
    douchesTotal: number
    douchesUtilisees: number
    upsellCa: number
    upsellCommissions: number
    upsellNb: number
    pretsCount: number
    lostFoundTotal: number
    lostFoundRestitues: number
    heurePointe: number
    heures?: number[]
    deltas: Deltas
  }
  comparaison: { precedent: Record<string, unknown> }
}

function fmtFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`
}

function DeltaBadge({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[#8B6F47]/70">
        <Minus className="h-3 w-3" aria-hidden /> n/d
      </span>
    )
  }
  const positif = invert ? value < 0 : value > 0
  const negatif = invert ? value > 0 : value < 0
  const Icon = value === 0 ? Minus : value > 0 ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
        positif && 'bg-[#4A7C59]/12 text-[#4A7C59]',
        negatif && 'bg-[#C97B63]/12 text-[#C97B63]',
        value === 0 && 'bg-[#EAE5DC] text-[#8B6F47]',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {value > 0 ? '+' : ''}{value}%
    </span>
  )
}

function MetricCard({
  titre,
  valeur,
  sous,
  icone: Icon,
  delta,
  invertDelta,
}: {
  titre: string
  valeur: string
  sous?: string
  icone: typeof Clock
  delta?: number | null
  invertDelta?: boolean
}) {
  return (
    <Card className="border border-[#EAE5DC] bg-white p-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C9A961]/12 text-[#8B6F47]">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        {delta !== undefined && <DeltaBadge value={delta} invert={invertDelta} />}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#8B6F47]">{titre}</p>
      <p className="mt-0.5 text-xl font-bold text-[#2C2C2C]" style={SERIF}>{valeur}</p>
      {sous && <p className="mt-0.5 text-[11px] text-[#8B6F47]">{sous}</p>}
    </Card>
  )
}

export function VipReportsTab() {
  const { toast } = useToast()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState<string>('')

  const charger = useCallback(async () => {
    try {
      setLoading(true)
      const url = month ? `/api/vip/reports?month=${month}` : '/api/vip/reports'
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) setData(json.data)
      else throw new Error(json?.error ?? 'Erreur')
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les rapports.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [month, toast])

  useEffect(() => {
    charger()
  }, [charger])

  // Mois par défaut = mois courant (input month, format YYYY-MM)
  useEffect(() => {
    if (!month) {
      const now = new Date()
      setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    }
  }, [month])

  const exporterPdf = () => {
    if (!data) return
    const m = data.metriques
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()

    // Bandeau or
    doc.setFillColor(201, 169, 97)
    doc.rect(0, 0, W, 70, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('times', 'bold')
    doc.setFontSize(20)
    doc.text('Rapport mensuel — Salon VIP', 40, 34)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`Période : ${data.periode.label} · Comparaison vs ${data.periodePrecedente.label}`, 40, 54)

    doc.setTextColor(44, 44, 44)
    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.text('Indicateurs clés', 40, 110)

    const lignes: [string, string][] = [
      ['Incidents résolus', `${m.incidentsResolus} / ${m.incidentsCrees} créés`],
      ['Temps moyen de résolution', m.tempsMoyenMin !== null ? `${m.tempsMoyenMin} min` : '—'],
      ['Satisfaction', m.satisfaction !== null ? `${m.satisfaction}/5 (${m.satisfactionNb} avis)` : '—'],
      ['Récompenses offertes', `${m.recompensesCount} — coût ${fmtFcfa(m.recompensesCout)}`],
      ['Réservations douches', `${m.douchesUtilisees} utilisées / ${m.douchesTotal}`],
      ['Ventes upsell', `${fmtFcfa(m.upsellCa)} (${m.upsellNb} commandes)`],
      ['Commissions générées', fmtFcfa(m.upsellCommissions)],
      ['Prêts express', `${m.pretsCount}`],
      ['Lost & Found', `${m.lostFoundTotal} déclaré(s) — ${m.lostFoundRestitues} restitué(s)`],
      ['Heure de pointe', `${String(m.heurePointe).padStart(2, '0')}h`],
    ]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    let y = 135
    lignes.forEach(([k, v], i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 247)
        doc.rect(40, y - 12, W - 80, 22, 'F')
      }
      doc.setTextColor(139, 111, 71)
      doc.text(k, 50, y)
      doc.setTextColor(44, 44, 44)
      doc.text(v, W - 50, y, { align: 'right' })
      y += 24
    })

    y += 16
    doc.setDrawColor(201, 169, 97)
    doc.line(40, y, W - 40, y)
    y += 18
    doc.setFontSize(10)
    doc.setTextColor(139, 111, 71)
    doc.text(
      `Évolutions vs ${data.periodePrecedente.label} : incidents ${m.deltas.incidentsResolus ?? 'n/d'}% · temps moyen ${m.deltas.tempsMoyenMin ?? 'n/d'}% · satisfaction ${m.deltas.satisfaction ?? 'n/d'}% · upsell ${m.deltas.upsellCa ?? 'n/d'}%`,
      40,
      y,
      { maxWidth: W - 80 },
    )
    y += 30
    doc.setFontSize(9)
    doc.text('Rapport généré automatiquement le 1er du mois et envoyé au manager (cron mensuel).', 40, y)

    doc.save(`rapport-vip-${data.periode.label.replace('/', '-')}.pdf`)
    toast({ title: 'PDF généré', description: 'Le rapport mensuel a été téléchargé.' })
  }

  const exporterCsv = () => {
    if (!data) return
    window.location.href = `/api/vip/reports/export?format=csv${month ? `&month=${month}` : ''}`
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-[#8B6F47]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="ml-2 text-sm">Chargement des rapports…</span>
      </div>
    )
  }

  const m = data.metriques

  return (
    <div className="space-y-5">
      {/* En-tête + exports */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
            Rapports & ROI
          </h2>
          <p className="mt-1 text-sm text-[#8B6F47]">
            Période {data.periode.label} — comparaison automatique avec {data.periodePrecedente.label}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border border-[#EAE5DC] bg-white px-3 text-sm text-[#2C2C2C]"
            aria-label="Mois du rapport"
          />
          <Button variant="outline" size="sm" className="gap-1.5 border-[#EAE5DC] bg-white text-[#8B6F47]" onClick={charger} aria-label="Actualiser">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-[#C9A961]/40 bg-white text-[#8B6F47] hover:bg-[#C9A961]/10" onClick={exporterCsv}>
            <FileText className="h-3.5 w-3.5" aria-hidden /> Excel / CSV
          </Button>
          <Button className="gap-1.5 bg-gradient-to-br from-[#C9A961] to-[#8B6F47] text-white hover:opacity-90" onClick={exporterPdf}>
            <Download className="h-3.5 w-3.5" aria-hidden /> PDF mensuel
          </Button>
        </div>
      </div>

      {/* Bandeau cron mensuel */}
      <div className="flex items-center gap-2 rounded-lg border border-[#C9A961]/25 bg-[#C9A961]/8 px-3 py-2 text-xs text-[#8B6F47]">
        <FileBarChart className="h-3.5 w-3.5 shrink-0 text-[#C9A961]" aria-hidden />
        <span>
          Le 1er de chaque mois à 7h30 UTC, le rapport complet (PDF/Excel) est généré automatiquement et envoyé au manager par email.
        </span>
      </div>

      {/* Métriques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          titre="Incidents résolus"
          valeur={`${m.incidentsResolus}/${m.incidentsCrees}`}
          sous={m.tempsMoyenMin !== null ? `temps moyen ${m.tempsMoyenMin} min` : 'aucun résolu'}
          icone={Clock}
          delta={m.deltas.incidentsResolus}
        />
        <MetricCard
          titre="Satisfaction"
          valeur={m.satisfaction !== null ? `${m.satisfaction}/5` : '—'}
          sous={`${m.satisfactionNb} avis clients`}
          icone={Star}
          delta={m.deltas.satisfaction}
        />
        <MetricCard
          titre="Récompenses offertes"
          valeur={fmtFcfa(m.recompensesCout)}
          sous={`${m.recompensesCount} offerte(s)`}
          icone={Gift}
          delta={m.deltas.recompensesCout}
          invertDelta
        />
        <MetricCard
          titre="Douches"
          valeur={`${m.douchesUtilisees}`}
          sous={`sur ${m.douchesTotal} réservation(s)`}
          icone={ShowerHead}
          delta={m.deltas.douchesUtilisees}
        />
        <MetricCard
          titre="Ventes upsell"
          valeur={fmtFcfa(m.upsellCa)}
          sous={`${m.upsellNb} commande(s)`}
          icone={ShoppingBag}
          delta={m.deltas.upsellCa}
        />
        <MetricCard
          titre="Commissions générées"
          valeur={fmtFcfa(m.upsellCommissions)}
          sous="10% du CA upsell"
          icone={Briefcase}
          delta={m.deltas.upsellCa}
        />
        <MetricCard
          titre="Prêts express"
          valeur={`${m.pretsCount}`}
          sous="demande(s) sur la période"
          icone={Hourglass}
          delta={m.deltas.pretsCount}
        />
        <MetricCard
          titre="Lost & Found"
          valeur={`${m.lostFoundRestitues}/${m.lostFoundTotal}`}
          sous="restitués / déclarés"
          icone={PackageSearch}
          delta={m.deltas.lostFoundTotal}
        />
      </div>

      {/* Heures de pointe */}
      <Card className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#2C2C2C]" style={SERIF}>
            Heures de pointe
          </h3>
          <Badge variant="outline" className="border-[#C9A961]/40 bg-[#C9A961]/10 text-[#8B6F47]">
            Pic : {String(m.heurePointe).padStart(2, '0')}h
          </Badge>
        </div>
        <div className="mt-4 flex h-28 items-end gap-1" aria-label="Distribution de l'activité par heure">
          {(() => {
            // Distribution horaire 0-23 renvoyée par l'API
            const heures: number[] = data.metriques.heures ?? []
            if (!heures.length) {
              return (
                <p className="w-full text-center text-xs text-[#8B6F47]">
                  Distribution horaire disponible au prochain rafraîchissement.
                </p>
              )
            }
            const max = Math.max(1, ...heures)
            return heures.map((v, h) => (
              <div key={h} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn(
                    'w-full rounded-t transition-all',
                    v === max ? 'bg-gradient-to-t from-[#8B6F47] to-[#C9A961]' : 'bg-[#C9A961]/35 group-hover:bg-[#C9A961]/60',
                  )}
                  style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 4 : 2 }}
                />
                <span className={cn('mt-1 text-center text-[9px]', h === m.heurePointe ? 'font-bold text-[#8B6F47]' : 'text-[#8B6F47]/50')}>
                  {h % 3 === 0 ? h : ''}
                </span>
                <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-[#2C2C2C] px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                  {h}h — {v}
                </span>
              </div>
            ))
          })()}
        </div>
      </Card>

      {/* Comparaison période précédente */}
      <Card className="border border-[#EAE5DC] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <h3 className="text-base font-semibold text-[#2C2C2C]" style={SERIF}>
          Comparaison — {data.periodePrecedente.label}
        </h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-[#EAE5DC]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAF7] text-left text-[11px] uppercase tracking-wide text-[#8B6F47]">
                <th className="px-3 py-2 font-semibold">Indicateur</th>
                <th className="px-3 py-2 text-right font-semibold">{data.periodePrecedente.label}</th>
                <th className="px-3 py-2 text-right font-semibold">{data.periode.label}</th>
                <th className="px-3 py-2 text-right font-semibold">Évolution</th>
              </tr>
            </thead>
            <tbody className="text-[#2C2C2C]">
              {(() => {
                const p = data.comparaison.precedent as Record<string, number | null>
                const rows: [string, string | null, string, number | null, boolean?][] = [
                  ['Incidents résolus', p.incidentsResolus != null ? String(p.incidentsResolus) : null, String(m.incidentsResolus), m.deltas.incidentsResolus],
                  ['Temps moyen (min)', p.tempsMoyenMin != null ? String(p.tempsMoyenMin) : null, m.tempsMoyenMin !== null ? String(m.tempsMoyenMin) : '—', m.deltas.tempsMoyenMin, true],
                  ['Satisfaction (/5)', p.satisfaction != null ? String(p.satisfaction) : null, m.satisfaction !== null ? String(m.satisfaction) : '—', m.deltas.satisfaction],
                  ['Coût récompenses', p.recompensesCout != null ? fmtFcfa(p.recompensesCout) : null, fmtFcfa(m.recompensesCout), m.deltas.recompensesCout, true],
                  ['Douches utilisées', p.douchesUtilisees != null ? String(p.douchesUtilisees) : null, String(m.douchesUtilisees), m.deltas.douchesUtilisees],
                  ['CA upsell', p.upsellCa != null ? fmtFcfa(p.upsellCa) : null, fmtFcfa(m.upsellCa), m.deltas.upsellCa],
                  ['Prêts express', p.pretsCount != null ? String(p.pretsCount) : null, String(m.pretsCount), m.deltas.pretsCount],
                  ['Lost & Found', p.lostFoundTotal != null ? String(p.lostFoundTotal) : null, String(m.lostFoundTotal), m.deltas.lostFoundTotal, true],
                ]
                return rows.map(([label, avant, apres, d, invert], i) => (
                  <tr key={label} className={cn('border-t border-[#EAE5DC]', i % 2 === 0 && 'bg-white', i % 2 === 1 && 'bg-[#FAFAF7]/50')}>
                    <td className="px-3 py-2">{label}</td>
                    <td className="px-3 py-2 text-right text-[#8B6F47]">{avant ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{apres}</td>
                    <td className="px-3 py-2 text-right"><DeltaBadge value={d} invert={invert} /></td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[#8B6F47]">
          N/d = pas de donnée comparable sur la période précédente (base vide ou période sans activité).
        </p>
      </Card>
    </div>
  )
}
