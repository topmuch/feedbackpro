// ============================================================
// GET /api/airport/reports/export
// ------------------------------------------------------------
// Export CSV (compatible Excel FR) des signalements aéroport.
// Filtres optionnels : ?zone=bagages&statut=EN_ATTENTE
//
// Colonnes CSV : id, date, zone, tag, problem, statut, flight,
//                team, photoCategory
//
// Réponse : text/csv (UTF-8 BOM), Content-Disposition attachment.
// En cas d'erreur (statut/zone invalide), renvoie JSON { ok: false, error }
// pour rester cohérent avec l'envelope utilisé ailleurs.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUTS = new Set(['EN_ATTENTE', 'EN_COURS', 'RESOLU'])

const ZONE_LABEL: Record<string, string> = Object.fromEntries(
  AIRPORT_ZONES.map((z) => [z.code, `${z.emoji} ${z.nom}`]),
)

/** Échappe une cellule CSV : entoure de " et échappe les " internes. */
function escapeCell(v: string | null | undefined): string {
  if (v === null || v === undefined) return '""'
  return `"${String(v).replace(/"/g, '""')}"`
}

function formatDateCsv(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const CSV_HEADERS = [
  'id',
  'date',
  'zone',
  'tag',
  'problem',
  'statut',
  'flight',
  'team',
  'photoCategory',
] as const

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const zoneCode = url.searchParams.get('zone')
  const statut = url.searchParams.get('statut')

  // Validation du statut (B10 — cohérent avec /api/airport/reports)
  if (statut && !VALID_STATUTS.has(statut)) {
    return fail(
      `Statut invalide : "${statut}". Valeurs acceptées : EN_ATTENTE, EN_COURS, RESOLU.`,
      400,
    )
  }

  const where: { zoneId?: string; statut?: string } = {}
  if (zoneCode) {
    const zone = await db.airportZone.findUnique({
      where: { code: zoneCode },
      select: { id: true },
    })
    if (!zone) return fail(`Zone inconnue : ${zoneCode}`, 404)
    where.zoneId = zone.id
  }
  if (statut) where.statut = statut

  const reports = await db.airportReport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 2000, // plafond de sécurité
    include: {
      zone: { select: { code: true, nom: true, emoji: true } },
    },
  })

  // Construction du CSV (BOM UTF-8 + séparateur ; pour Excel FR)
  const lignes: string[] = []
  lignes.push(CSV_HEADERS.map((h) => escapeCell(h)).join(';'))
  for (const r of reports) {
    const zoneLabel =
      r.zone?.code && ZONE_LABEL[r.zone.code]
        ? (ZONE_LABEL[r.zone.code] ?? r.zone?.nom ?? '')
        : (r.zone?.nom ?? '')
    const row = [
      r.id,
      formatDateCsv(r.createdAt),
      zoneLabel,
      r.tagScanne,
      r.problemType,
      r.statut,
      r.flightNumber ?? '',
      r.routedTeam ?? '',
      r.photoCategory ?? '',
    ]
    lignes.push(row.map((c) => escapeCell(c)).join(';'))
  }

  const csv = '\uFEFF' + lignes.join('\r\n')

  // Le succès suit l'envelope mais renvoie un blob CSV (text/csv).
  // Le client (airport-reports-tab.tsx → downloadExportCsv) consomme
  // directement res.blob() → pas besoin de JSON.
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `signalements-airport_${stamp}.csv`
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
