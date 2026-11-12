'use client'

// ============================================================
// <AirportReportsTab /> — Liste filtrable des signalements
// ------------------------------------------------------------
// Filtres : zone (toutes + 5), statut (tous/EN_ATTENTE/EN_COURS/
// RESOLU), recherche numéro de vol.
//
// APIs :
//   GET  /api/airport/reports?zone=<code>&statut=<s>&limit=<n>
//   POST /api/airport/ops/resolve  body { reportId }
//
// Polling : refresh auto toutes les 10 s + bouton manuel.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hand,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plane,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Download,
  User,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------
// Types (contrat API)
// ---------------------------------------------------------------

type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

type StaffScanLite = {
  id: string
  action: string // "TAKE_CHARGE" | "RESOLVE"
  photoUrl: string | null
  staffName: string | null
  createdAt: string
}

type Report = {
  id: string
  zone: { code: string; nom: string; emoji: string } | null
  tagScanne: string
  problemType: string
  commentaire: string | null
  photoUrl: string | null
  photoCategory: string | null
  routedTeam: string | null
  photoAnalysis: string | null
  flightNumber: string | null
  whatsappOptin: boolean
  whatsappPhone: string | null
  statut: string
  whatsappPayload: string | null
  // Feature 2 — destinataire d'affectation (numéro WhatsApp, email ou token push)
  assignedTo?: string | null
  createdAt: string
  resolvedAt: string | null
  // Task B (Phase 3) — scans staff liés (TAKE_CHARGE avant / RESOLVE après)
  staffScans?: StaffScanLite[]
}

type HelpStatut = 'EN_ATTENTE' | 'PRIS_EN_CHARGE' | 'RESOLU'

type HelpRequest = {
  id: string
  tagScanne: string
  zoneCode: string | null
  message: string | null
  travelerPhone: string | null
  reportId: string | null
  statut: string
  assignedTo: string | null
  createdAt: string
  resolvedAt: string | null
}

type ReportsResponse = {
  ok: true
  data: { reports: Report[]; count: number }
}

type ErrorResponse = { ok: false; error: string }

type ZoneLite = { code: string; nom: string; emoji: string }

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const STATUT_META: Record<Statut, { label: string; cls: string; dot: string }> = {
  EN_ATTENTE: {
    label: 'EN ATTENTE',
    cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  EN_COURS: {
    label: 'EN COURS',
    cls: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
    dot: 'bg-sky-400',
  },
  RESOLU: {
    label: 'RÉSOLU',
    cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
}

function statutMeta(s: string): { label: string; cls: string; dot: string } {
  return (
    STATUT_META[s as Statut] ?? {
      label: s,
      cls: 'bg-muted/15 text-muted-foreground border-border/30',
      dot: 'bg-muted-foreground',
    }
  )
}

const TEAM_META: Record<string, { emoji: string; label: string; cls: string }> = {
  nettoyage: { emoji: '🧹', label: 'Nettoyage', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' },
  maintenance: { emoji: '🔧', label: 'Maintenance', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700' },
  securite: { emoji: '🛡️', label: 'Sécurité', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-700' },
  accueil: { emoji: '👋', label: 'Accueil', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-700' },
  other: { emoji: '❓', label: 'Autre', cls: 'border-border/40 bg-muted/30 text-muted-foreground' },
}

function teamMeta(t: string | null): { emoji: string; label: string; cls: string } | null {
  if (!t) return null
  return TEAM_META[t] ?? { emoji: '❓', label: t, cls: TEAM_META.other.cls }
}

// ---------------------------------------------------------------
// VLM photoAnalysis parsing
// ---------------------------------------------------------------

type PhotoAnalysis = {
  description?: string
  urgency?: 'faible' | 'moyenne' | 'elevee' | 'critique' | string
  objects_detected?: string[]
  confidence?: number
  category?: string
  team?: string
}

const URGENCY_META: Record<string, { label: string; cls: string }> = {
  faible: {
    label: 'Faible',
    cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  },
  moyenne: {
    label: 'Moyenne',
    cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  },
  elevee: {
    label: 'Élevée',
    cls: 'border-orange-500/30 bg-orange-500/10 text-orange-700',
  },
  critique: {
    label: 'Critique',
    cls: 'border-rose-500/30 bg-rose-500/10 text-rose-700',
  },
}

function urgencyMeta(u: string | undefined): { label: string; cls: string } | null {
  if (!u) return null
  return URGENCY_META[u] ?? {
    label: u,
    cls: 'border-border/40 bg-muted/30 text-muted-foreground',
  }
}

function parsePhotoAnalysis(raw: string | null): PhotoAnalysis | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PhotoAnalysis
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed
  } catch {
    return null
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return "à l'instant"
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return "à l'instant"
  if (sec < 60) return `il y a ${sec} s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(-8) : id
}

// ---------------------------------------------------------------
// Task B (Phase 3) — helpers pour les photos staff AVANT / APRÈS
// ---------------------------------------------------------------

type StaffPhotos = {
  before: StaffScanLite | null
  after: StaffScanLite | null
  count: number // 0, 1 ou 2
}

// Extrait le premier scan TAKE_CHARGE (= avant) et RESOLVE (= après).
// L'API les renvoie déjà triés ASC par createdAt, donc le "premier"
// trouvé correspond à la prise en charge / résolution initiale.
function getStaffPhotos(report: Report): StaffPhotos {
  const scans = report.staffScans ?? []
  const before = scans.find((s) => s.action === 'TAKE_CHARGE') ?? null
  const after = scans.find((s) => s.action === 'RESOLVE') ?? null
  const count = (before ? 1 : 0) + (after ? 1 : 0)
  return { before, after, count }
}

// Formate une date ISO en horodatage lisible FR (date + heure courte).
function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

async function fetchReports(
  zone: string,
  statut: string,
  limit: number,
): Promise<Report[]> {
  const params = new URLSearchParams()
  if (zone && zone !== 'all') params.set('zone', zone)
  if (statut && statut !== 'all') params.set('statut', statut)
  params.set('limit', String(limit))
  const res = await fetch(`/api/airport/reports?${params.toString()}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as ReportsResponse | ErrorResponse
  if (!json.ok) throw new Error(json.error)
  return json.data.reports
}

async function resolveReport(reportId: string): Promise<void> {
  const res = await fetch('/api/airport/ops/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId }),
  })
  const json = (await res.json()) as { ok: boolean; error?: string }
  if (!json.ok) throw new Error(json.error ?? 'Erreur résolution')
}

// ---------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------
async function downloadExportCsv(zone: string, statut: string): Promise<void> {
  const params = new URLSearchParams()
  if (zone && zone !== 'all') params.set('zone', zone)
  if (statut && statut !== 'all') params.set('statut', statut)
  const res = await fetch(`/api/airport/reports/export?${params.toString()}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = new Date().toISOString().slice(0, 10)
  a.download = `signalements-airport_${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export default function AirportReportsTab() {
  const { toast } = useToast()

  // Filtres
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [statutFilter, setStatutFilter] = useState<string>('all')
  const [flightSearch, setFlightSearch] = useState<string>('')

  // Données
  const [reports, setReports] = useState<Report[]>([])
  const [zones, setZones] = useState<ZoneLite[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<boolean>(false)

  // Ref pour éviter un poll en cours
  const pollingRef = useRef<boolean>(false)

  // --- Chargement initial des zones (pour le filtre) ---
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/airport/zones', { cache: 'no-store' })
        const json = (await res.json()) as {
          ok: boolean
          data?: { zones: ZoneLite[] }
          error?: string
        }
        if (!cancelled && json.ok && json.data) {
          setZones(
            json.data.zones.map((z) => ({ code: z.code, nom: z.nom, emoji: z.emoji })),
          )
        }
      } catch {
        // Silencieux : le filtre "toutes" fonctionne sans cette liste
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // --- Fetch des reports ---
  const load = useCallback(async () => {
    if (pollingRef.current) return
    pollingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const r = await fetchReports(zoneFilter, statutFilter, 100)
      setReports(r)
      setLastFetch(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
      pollingRef.current = false
    }
  }, [zoneFilter, statutFilter])

  // Re-fetch quand filtre change
  useEffect(() => {
    void load()
  }, [load])

  // Polling 10s
  useEffect(() => {
    const t = setInterval(() => {
      void load()
    }, 10000)
    return () => clearInterval(t)
  }, [load])

  // --- Filtrage local par numéro de vol ---
  const filteredReports = useMemo(() => {
    if (!flightSearch.trim()) return reports
    const q = flightSearch.trim().toUpperCase()
    return reports.filter((r) => (r.flightNumber ?? '').toUpperCase().includes(q))
  }, [reports, flightSearch])

  // --- Resolve handler ---
  const handleResolve = useCallback(
    async (reportId: string) => {
      setResolvingId(reportId)
      try {
        await resolveReport(reportId)
        // Mise à jour locale immédiate (optimistic)
        setReports((prev) =>
          prev.map((r) =>
            r.id === reportId
              ? { ...r, statut: 'RESOLU', resolvedAt: new Date().toISOString() }
              : r,
          ),
        )
        toast({
          title: 'Signalement résolu',
          description: `ID ${shortId(reportId)} marqué RESOLU.`,
        })
      } catch (e) {
        toast({
          title: 'Erreur de résolution',
          description: e instanceof Error ? e.message : 'Erreur inconnue',
          variant: 'destructive',
        })
      } finally {
        setResolvingId(null)
      }
    },
    [toast],
  )

  // --- Export CSV handler ---
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await downloadExportCsv(zoneFilter, statutFilter)
      toast({
        title: 'Export CSV généré',
        description: 'Le fichier des signalements a été téléchargé.',
      })
    } catch (e) {
      toast({
        title: 'Erreur export CSV',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }, [zoneFilter, statutFilter, toast])


  return (
    <div className="flex h-[calc(100vh-128px)] flex-col">
      {/* ---------- DEMANDES D'AIDE EN ATTENTE ---------- */}
      <HelpRequestsBar />

      {/* ---------- FILTRES ---------- */}
      <div className="shrink-0 border-b border-border bg-card/40 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Zone select */}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="h-8 w-40 border-border bg-card text-xs text-foreground">
                <SelectValue placeholder="Toutes les zones" />
              </SelectTrigger>
              <SelectContent className="border-border bg-card text-foreground">
                <SelectItem value="all" className="text-xs">Toutes les zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.code} value={z.code} className="text-xs">
                    {z.emoji} {z.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Statut select */}
          <Select value={statutFilter} onValueChange={setStatutFilter}>
            <SelectTrigger className="h-8 w-36 border-border bg-card text-xs text-foreground">
              <SelectValue placeholder="Tous statuts" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-foreground">
              <SelectItem value="all" className="text-xs">Tous statuts</SelectItem>
              <SelectItem value="EN_ATTENTE" className="text-xs">🟡 En attente</SelectItem>
              <SelectItem value="EN_COURS" className="text-xs">🔵 En cours</SelectItem>
              <SelectItem value="RESOLU" className="text-xs">🟢 Résolu</SelectItem>
            </SelectContent>
          </Select>

          {/* Recherche vol */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={flightSearch}
              onChange={(e) => setFlightSearch(e.target.value)}
              placeholder="Rechercher n° de vol (ex: AF123)"
              className="h-8 border-border bg-card pl-8 text-xs text-foreground"
            />
          </div>

          {/* Refresh */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="h-8 border-border bg-muted/40 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5 hidden sm:inline">Rafraîchir</span>
          </Button>

          {/* Export CSV */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="h-8 border-border bg-muted/40 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Exporter les signalements filtrés en CSV"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5 hidden sm:inline">Exporter CSV</span>
          </Button>

          {/* Compteur + last fetch */}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <span className="tabular-nums">
              {filteredReports.length} signalement{filteredReports.length > 1 ? 's' : ''}
            </span>
            {lastFetch && (
              <span className="hidden items-center gap-1 sm:flex">
                <Clock className="h-3 w-3" />
                MAJ {relativeTime(lastFetch.toISOString())}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- LISTE ---------- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-rose-600" />
              <div>
                <p className="font-semibold text-rose-700">Erreur</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Réessayer
              </Button>
            </div>
          </div>
        ) : loading && reports.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Chargement des signalements…
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground/70">
            <span className="text-4xl" aria-hidden>
              📭
            </span>
            <p className="text-sm">Aucun signalement pour ces filtres.</p>
            <p className="text-[11px] text-muted-foreground/70">
              Modifiez les filtres ou rafraîchissez dans quelques secondes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredReports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                onResolve={handleResolve}
                resolving={resolvingId === r.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Sous-composant : ligne de signalement
// ---------------------------------------------------------------

type ReportRowProps = {
  report: Report
  onResolve: (id: string) => void
  resolving: boolean
}

function ReportRow({ report, onResolve, resolving }: ReportRowProps) {
  const s = statutMeta(report.statut)
  const team = teamMeta(report.routedTeam)
  const isResolved = report.statut === 'RESOLU'
  const analysis = useMemo(() => parsePhotoAnalysis(report.photoAnalysis), [report.photoAnalysis])
  const urgency = urgencyMeta(analysis?.urgency)
  const confidencePct =
    typeof analysis?.confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, analysis.confidence)) * 100)
      : null

  // Task B (Phase 3) — photos staff avant/après pour badge + dialog
  const staffPhotos = useMemo(() => getStaffPhotos(report), [report])
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false)

  return (
    <div className="px-4 py-3 transition hover:bg-card/40 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Photo thumbnail (si présente) */}
        <div className="shrink-0 sm:order-1">
          {report.photoUrl ? (
            <PhotoLightbox
              src={report.photoUrl}
              alt={`Photo jointe au signalement ${shortId(report.id)}`}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border bg-card/40 text-muted-foreground">
              <Camera className="h-5 w-5" />
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1 sm:order-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base" aria-hidden>
              {report.zone?.emoji ?? '📍'}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {report.zone?.nom ?? 'Zone inconnue'}
            </span>
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {report.zone?.code ?? '—'}
            </code>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                s.cls,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
              {s.label}
            </span>
          </div>

          <div className="mt-1 text-sm text-muted-foreground">{report.problemType}</div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <span className="font-mono">{report.tagScanne}</span>
            {report.flightNumber && (
              <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-700">
                <Plane className="h-3 w-3" />
                {report.flightNumber}
              </span>
            )}
            {report.photoCategory && (
              <span className="inline-flex items-center gap-1 rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 font-medium text-fuchsia-700">
                📷 {report.photoCategory}
              </span>
            )}
            {team && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium',
                  team.cls,
                )}
              >
                {team.emoji} {team.label}
              </span>
            )}
            {report.whatsappOptin && report.whatsappPhone && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-600">
                💬 notifié
              </span>
            )}
            {report.assignedTo && (
              <span
                className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-700"
                title={`Affecté à ${report.assignedTo}`}
              >
                <UserCog className="h-3 w-3" />
                Affecté
              </span>
            )}
            {/* Task B (Phase 3) — badge photos staff avant/après */}
            {staffPhotos.count === 2 && (
              <span
                className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-600"
                title="Photo AVANT et APRÈS jointes par le staff"
              >
                <Camera className="h-3 w-3" />
                2 photos
              </span>
            )}
            {staffPhotos.count === 1 && (
              <span
                className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700"
                title={
                  staffPhotos.before
                    ? 'Photo AVANT jointe — résolution en cours'
                    : 'Photo APRÈS jointe (avant manquant)'
                }
              >
                <Camera className="h-3 w-3" />
                1 photo
              </span>
            )}
            {staffPhotos.count === 0 && report.photoUrl === null && (
              <span
                className="inline-flex items-center gap-1 rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 font-medium text-muted-foreground/60"
                title="Aucune photo staff jointe — prise en charge non tracée"
                aria-hidden
              >
                <CameraOff className="h-3 w-3" />
              </span>
            )}
          </div>

          {report.commentaire && (
            <p className="mt-1.5 line-clamp-2 text-xs italic text-muted-foreground/70">
              « {report.commentaire} »
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/70">
            <span className="tabular-nums" title={new Date(report.createdAt).toLocaleString('fr-FR')}>
              Créé {relativeTime(report.createdAt)}
            </span>
            {report.resolvedAt && (
              <span
                className="tabular-nums text-emerald-500/80"
                title={new Date(report.resolvedAt).toLocaleString('fr-FR')}
              >
                Résolu {relativeTime(report.resolvedAt)}
              </span>
            )}
            <span className="font-mono text-muted-foreground/70">#{shortId(report.id)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 sm:order-3">
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            {/* Feature 2 — boutons d'affectation (WhatsApp / Email) */}
            {!isResolved && (
              <AssignButtons report={report} />
            )}
            {!isResolved && (
              <Button
                type="button"
                size="sm"
                onClick={() => onResolve(report.id)}
                disabled={resolving}
                className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-muted"
              >
                {resolving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Résoudre
              </Button>
            )}
            {isResolved && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Traité
              </Badge>
            )}
            {/* Task B (Phase 3) — bouton d'ouverture du dialog détails
                (incluant la section Photos Avant/Après) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDetailsOpen(true)}
              className="h-7 border-border bg-muted/40 px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="mr-1 h-3 w-3" />
              Détails
              {(staffPhotos.count > 0 || report.photoUrl) && (
                <Camera className="ml-1.5 h-3 w-3 text-fuchsia-600" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Task B (Phase 3) — dialog de détails avec photos Avant/Après */}
      <ReportDetailsDialog
        report={report}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onResolve={onResolve}
        resolving={resolving}
      />

      {/* VLM photo analysis (dépliable) */}
      {analysis && (
        <details className="mt-2 rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 px-3 py-2 text-xs open:bg-fuchsia-500/10">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-fuchsia-700 marker:content-none">
            <Sparkles className="h-3.5 w-3.5" />
            Analyse VLM de la photo
            {urgency && (
              <span
                className={cn(
                  'ml-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase',
                  urgency.cls,
                )}
              >
                Urgence : {urgency.label}
              </span>
            )}
            {confidencePct !== null && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                Confiance : {confidencePct}%
              </span>
            )}
          </summary>
          <div className="mt-2 space-y-2 text-foreground">
            {analysis.description && (
              <p className="text-xs text-foreground/90">
                <span className="font-semibold">Description :</span>{' '}
                {analysis.description}
              </p>
            )}
            {Array.isArray(analysis.objects_detected) &&
              analysis.objects_detected.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Objets détectés :
                  </span>
                  {analysis.objects_detected.map((obj, i) => (
                    <span
                      key={`${obj}-${i}`}
                      className="inline-flex items-center rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80"
                    >
                      {obj}
                    </span>
                  ))}
                </div>
              )}
            {!analysis.description &&
              (!Array.isArray(analysis.objects_detected) ||
                analysis.objects_detected.length === 0) && (
                <p className="text-[11px] italic text-muted-foreground">
                  Analyse présente mais sans détails exploitables.
                </p>
              )}
          </div>
        </details>
      )}
    </div>
  )
}

// ============================================================
// Feature 2 — <AssignButtons /> : affecter un signalement
// ------------------------------------------------------------
// Deux petits boutons (WhatsApp vert, Email bleu) qui ouvrent un
// dialog permettant de saisir le destinataire (téléphone ou email)
// et de pré-visualiser le message pré-rempli avec les détails du
// signalement. À la validation :
//   - WhatsApp : POST /api/airport/assign → renvoie un deep link
//     wa.me qu'on ouvre dans un nouvel onglet.
//   - Email    : POST /api/airport/assign → envoie un email via
//     Resend (mode démo si pas de clé API).
//
// Le champ `assignedTo` du signalement est mis à jour côté serveur.
// ============================================================

type AssignMethod = 'whatsapp' | 'email'

type AssignApiResponse = {
  method: string
  phone?: string
  email?: string
  link?: string
  sent?: boolean
  message: string
}

function buildPrefilledMessage(report: Report): string {
  const lignes: string[] = [
    'AFFECTATION SIGNALEMENT AÉROPORT',
    '',
    `Zone : ${report.zone?.emoji ?? '📍'} ${report.zone?.nom ?? 'Zone inconnue'}`,
    `Problème : ${report.problemType}`,
    `Emplacement : ${report.tagScanne}`,
    `Réf : #${shortId(report.id)}`,
  ]
  if (report.flightNumber) lignes.push(`Vol : ${report.flightNumber}`)
  if (report.commentaire && report.commentaire.trim()) {
    lignes.push(`Précision voyageur : ${report.commentaire.trim()}`)
  }
  lignes.push(
    '',
    'Action : Merci de prendre en charge ce signalement sur place.',
  )
  return lignes.join('\n')
}

function AssignButtons({ report }: { report: Report }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<AssignMethod>('whatsapp')
  const [destinataire, setDestinataire] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const message = useMemo(() => buildPrefilledMessage(report), [report])

  const openDialog = useCallback((m: AssignMethod) => {
    setMethod(m)
    setDestinataire('')
    setNote('')
    setOpen(true)
  }, [])

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    const dest = destinataire.trim()
    if (!dest) {
      toast({
        title: method === 'whatsapp' ? 'Numéro requis' : 'Email requis',
        variant: 'destructive',
      })
      return
    }
    setSending(true)
    try {
      const body: {
        reportId: string
        method: AssignMethod
        phone?: string
        email?: string
        message?: string
      } = { reportId: report.id, method }
      if (method === 'whatsapp') body.phone = dest
      else body.email = dest
      const n = note.trim()
      if (n) body.message = n

      const res = await fetch('/api/airport/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { ok: boolean; data?: AssignApiResponse; error?: string }
      if (!json.ok || !json.data) {
        throw new Error(json.error ?? 'Affectation impossible')
      }
      const data = json.data
      if (method === 'whatsapp' && data.link) {
        // Ouvre WhatsApp dans un nouvel onglet avec le message pré-rempli
        try {
          window.open(data.link, '_blank', 'noopener,noreferrer')
        } catch {
          /* ignore — le manager peut copier le lien depuis le toast */
        }
        toast({
          title: 'Lien WhatsApp généré ✓',
          description: `WhatsApp ouvert pour ${data.phone ?? dest}. Le signalement est affecté.`,
        })
      } else if (method === 'email') {
        if (data.sent) {
          toast({
            title: 'Email envoyé ✓',
            description: `Affectation envoyée à ${data.email ?? dest}.`,
          })
        } else {
          toast({
            title: 'Email non envoyé',
            description: "L'envoi a échoué (vérifiez la configuration Resend).",
            variant: 'destructive',
          })
        }
      }
      setOpen(false)
    } catch (e) {
      toast({
        title: 'Erreur',
        description: e instanceof Error ? e.message : 'Affectation impossible',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={() => openDialog('whatsapp')}
          className="h-7 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-500"
          title="Affecter via WhatsApp"
        >
          <MessageCircle className="mr-1 h-3 w-3" aria-hidden />
          WhatsApp
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => openDialog('email')}
          className="h-7 bg-sky-600 px-2 text-[11px] text-white hover:bg-sky-500"
          title="Affecter via Email"
        >
          <Mail className="mr-1 h-3 w-3" aria-hidden />
          Email
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {method === 'whatsapp' ? (
                <>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  </span>
                  Affecter via WhatsApp
                </>
              ) : (
                <>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700">
                    <Mail className="h-4 w-4" aria-hidden />
                  </span>
                  Affecter via Email
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Le signalement #{shortId(report.id)} ({report.zone?.nom ?? 'Zone'}) sera affecté à cet
              employé. Le destinataire recevra les détails ci-dessous.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={envoyer} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-dest" className="text-xs font-semibold">
                {method === 'whatsapp'
                  ? 'Numéro WhatsApp (international sans +)'
                  : 'Email destinataire'}
              </Label>
              <Input
                id="assign-dest"
                type={method === 'whatsapp' ? 'tel' : 'email'}
                inputMode={method === 'whatsapp' ? 'tel' : 'email'}
                value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)}
                placeholder={
                  method === 'whatsapp' ? 'Ex : 33612345678' : 'employe@aeroport.fr'
                }
                required
                autoFocus
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {method === 'whatsapp'
                  ? 'Format international sans + ni espaces. Un deep link wa.me sera ouvert.'
                  : "L'email sera envoyé via le service transactionnel configuré."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-note" className="text-xs font-semibold">
                Note manager <span className="font-normal text-muted-foreground">(optionnel)</span>
              </Label>
              <Input
                id="assign-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                maxLength={200}
                placeholder="Ex : intervention prioritaire — passager en transit"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Message pré-rempli</Label>
              <Textarea
                value={message}
                readOnly
                rows={7}
                className="resize-none bg-muted/40 font-mono text-[11px] leading-relaxed text-foreground/80"
                aria-label="Message pré-rempli envoyé au destinataire"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={sending}
                className={
                  method === 'whatsapp'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-sky-600 text-white hover:bg-sky-500'
                }
              >
                {sending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : method === 'whatsapp' ? (
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                {method === 'whatsapp' ? 'Générer le lien' : 'Envoyer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------
// Sous-composant : <PhotoLightbox />
// ---------------------------------------------------------------
// Bouton-thumbnail qui ouvre un Dialog affichant la photo en grand.
// Remplace le <a target="_blank"> précédent (F11) pour offrir une
// expérience lightbox in-app cohérente avec le reste de l'UI.
// ---------------------------------------------------------------

type PhotoLightboxProps = {
  src: string
  alt: string
}

function PhotoLightbox({ src, alt }: PhotoLightboxProps) {
  const [open, setOpen] = useState<boolean>(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block h-16 w-16 cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted transition hover:border-fuchsia-500/40 hover:ring-2 hover:ring-fuchsia-500/30"
        title="Agrandir la photo"
        aria-label={`Agrandir la photo : ${alt}`}
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-3xl border-border bg-background p-2 sm:p-3"
          showCloseButton
        >
          <DialogTitle className="sr-only">Photo agrandie</DialogTitle>
          <DialogDescription className="sr-only">
            {alt}
          </DialogDescription>
          <img
            src={src}
            alt={alt}
            className="max-h-[80vh] w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// Task B (Phase 3) — <ReportDetailsDialog />
// ------------------------------------------------------------
// Dialog de détails complet d'un signalement, ouvert via le bouton
// "Détails" de chaque ligne (<ReportRow>). Inclut :
//   • Récap info (zone, problème, tag, vol, statut, dates, commentaire)
//   • Photo voyageur (si présente) via <PhotoLightbox>
//   • Analyse VLM (si présente)
//   • Section "Photos Avant / Après" issue des <AirportStaffScan>
//     (action TAKE_CHARGE → avant, RESOLVE → après), affichées
//     côte à côte avec une flèche entre les deux.
// ============================================================

type ReportDetailsDialogProps = {
  report: Report
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolve: (id: string) => void
  resolving: boolean
}

function ReportDetailsDialog({
  report,
  open,
  onOpenChange,
  onResolve,
  resolving,
}: ReportDetailsDialogProps) {
  const s = statutMeta(report.statut)
  const team = teamMeta(report.routedTeam)
  const isResolved = report.statut === 'RESOLU'
  const analysis = useMemo(() => parsePhotoAnalysis(report.photoAnalysis), [report.photoAnalysis])
  const urgency = urgencyMeta(analysis?.urgency)
  const confidencePct =
    typeof analysis?.confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, analysis.confidence)) * 100)
      : null
  const staffPhotos = useMemo(() => getStaffPhotos(report), [report])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="text-lg" aria-hidden>
              {report.zone?.emoji ?? '📍'}
            </span>
            <span>{report.zone?.nom ?? 'Zone inconnue'}</span>
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {report.zone?.code ?? '—'}
            </code>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                s.cls,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
              {s.label}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
              #{shortId(report.id)}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Détails du signalement et preuves visuelles de la prise en charge staff.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ---------- Infos essentielles ---------- */}
          <section className="rounded-lg border border-border bg-card/40 p-3">
            <div className="text-sm font-semibold text-foreground">
              {report.problemType}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <span className="inline-flex items-center gap-1 rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 font-mono">
                <MapPin className="h-3 w-3" />
                {report.tagScanne}
              </span>
              {report.flightNumber && (
                <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-700">
                  <Plane className="h-3 w-3" />
                  {report.flightNumber}
                </span>
              )}
              {team && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium',
                    team.cls,
                  )}
                >
                  {team.emoji} {team.label}
                </span>
              )}
              {report.photoCategory && (
                <span className="inline-flex items-center gap-1 rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 font-medium text-fuchsia-700">
                  📷 {report.photoCategory}
                </span>
              )}
            </div>
            {report.commentaire && (
              <p className="mt-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs italic text-foreground/80">
                « {report.commentaire} »
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/70">
              <span className="inline-flex items-center gap-1 tabular-nums" title={new Date(report.createdAt).toLocaleString('fr-FR')}>
                <Clock className="h-3 w-3" />
                Créé {relativeTime(report.createdAt)}
              </span>
              {report.resolvedAt && (
                <span
                  className="inline-flex items-center gap-1 tabular-nums text-emerald-500/80"
                  title={new Date(report.resolvedAt).toLocaleString('fr-FR')}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Résolu {relativeTime(report.resolvedAt)}
                </span>
              )}
            </div>
          </section>

          {/* ---------- Photo voyageur ---------- */}
          {report.photoUrl && (
            <section className="rounded-lg border border-border bg-card/40 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Camera className="h-3.5 w-3.5" />
                Photo voyageur
              </h3>
              <div className="flex justify-center">
                <PhotoLightbox
                  src={report.photoUrl}
                  alt={`Photo jointe au signalement ${shortId(report.id)}`}
                />
              </div>
            </section>
          )}

          {/* ---------- Photos Avant / Après (Task B Phase 3) ---------- */}
          <section className="rounded-lg border border-border bg-card/40 p-3">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              Photos Avant / Après
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {staffPhotos.count} / 2
              </span>
            </h3>

            <BeforeAfterPhotos before={staffPhotos.before} after={staffPhotos.after} />
          </section>

          {/* ---------- Analyse VLM ---------- */}
          {analysis && (
            <section className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-700">
                <Sparkles className="h-3.5 w-3.5" />
                Analyse VLM
                {urgency && (
                  <span
                    className={cn(
                      'ml-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase',
                      urgency.cls,
                    )}
                  >
                    Urgence : {urgency.label}
                  </span>
                )}
                {confidencePct !== null && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    Confiance : {confidencePct}%
                  </span>
                )}
              </h3>
              {analysis.description && (
                <p className="text-xs text-foreground/90">
                  <span className="font-semibold">Description :</span>{' '}
                  {analysis.description}
                </p>
              )}
              {Array.isArray(analysis.objects_detected) &&
                analysis.objects_detected.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Objets :
                    </span>
                    {analysis.objects_detected.map((obj, i) => (
                      <span
                        key={`${obj}-${i}`}
                        className="inline-flex items-center rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80"
                      >
                        {obj}
                      </span>
                    ))}
                  </div>
                )}
            </section>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isResolved && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onResolve(report.id)
              }}
              disabled={resolving}
              className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-muted"
            >
              {resolving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Marquer résolu
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------
// Sous-composant : <BeforeAfterPhotos />
// ---------------------------------------------------------------
// Affiche les photos staff AVANT (TAKE_CHARGE) et APRÈS (RESOLVE)
// côte à côte avec une flèche. 4 états gérés :
//   • both  → 2 cartes + flèche
//   • before only → 1 carte "AVANT (en cours de résolution)"
//   • after only  → 1 carte "APRÈS" (cas rare : avant manquant)
//   • none   → hint muted
// ---------------------------------------------------------------

type BeforeAfterPhotosProps = {
  before: StaffScanLite | null
  after: StaffScanLite | null
}

function StaffPhotoCard({
  scan,
  variant,
  hint,
}: {
  scan: StaffScanLite
  variant: 'before' | 'after'
  hint?: string
}) {
  const isBefore = variant === 'before'
  const label = isBefore ? 'AVANT' : 'APRÈS'
  const badgeCls = isBefore
    ? 'border-amber-500/40 bg-amber-500/15 text-amber-700'
    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600'
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            badgeCls,
          )}
        >
          {isBefore ? <Camera className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {label}
          {hint && (
            <span className="ml-1 font-normal normal-case text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <User className="h-3 w-3" />
          {scan.staffName ?? 'Staff inconnu'}
        </span>
      </div>
      {scan.photoUrl ? (
        <a
          href={scan.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block cursor-zoom-in"
          title="Ouvrir la photo en plein écran"
        >
          <img
            src={scan.photoUrl}
            alt={`Photo ${label} prise par ${scan.staffName ?? 'un membre du staff'}`}
            className="h-48 w-full object-cover transition hover:opacity-90"
            loading="lazy"
          />
        </a>
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-slate-900/70 text-muted-foreground">
          <span className="flex flex-col items-center gap-1 text-[11px]">
            <Camera className="h-6 w-6 opacity-50" />
            Photo manquante
          </span>
        </div>
      )}
      <div className="flex items-center gap-1 px-3 py-2 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span className="tabular-nums" title={scan.createdAt}>
          {formatTimestamp(scan.createdAt)}
        </span>
      </div>
    </div>
  )
}

function BeforeAfterPhotos({ before, after }: BeforeAfterPhotosProps) {
  // Cas 1 : aucune photo staff
  if (!before && !after) {
    return (
      <p className="rounded-md border border-dashed border-border/50 bg-muted/20 px-3 py-3 text-center text-xs italic text-muted-foreground">
        Aucune photo staff jointe — prise en charge non tracée.
      </p>
    )
  }

  // Cas 2 : les deux → grille 2 colonnes avec flèche entre
  if (before && after) {
    return (
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <StaffPhotoCard scan={before} variant="before" />
        </div>
        <div className="flex shrink-0 items-center justify-center self-stretch text-muted-foreground">
          <ArrowRight className="h-5 w-5 rotate-90 sm:rotate-0" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <StaffPhotoCard scan={after} variant="after" />
        </div>
      </div>
    )
  }

  // Cas 3 : seulement avant (résolution en cours)
  if (before && !after) {
    return (
      <div className="max-w-sm">
        <StaffPhotoCard
          scan={before}
          variant="before"
          hint="(en cours de résolution)"
        />
      </div>
    )
  }

  // Cas 4 : seulement après (avant manquant — rare)
  return (
    <div className="max-w-sm">
      <StaffPhotoCard scan={after as StaffScanLite} variant="after" />
      <p className="mt-2 text-[10px] italic text-muted-foreground/70">
        Photo AVANT non jointe — prise en charge non tracée avant résolution.
      </p>
    </div>
  )
}

// ============================================================
// Sous-composant : <HelpRequestsBar />
// ------------------------------------------------------------
// Bannière en haut de l'onglet "Signalements" qui affiche les
// demandes d'aide voyageur en attente (EN_ATTENTE) et celles
// récemment prises en charge (PRIS_EN_CHARGE). Polling 10s.
//
// APIs :
//   GET  /api/airport/help?statut=EN_ATTENTE
//   POST /api/airport/help/[id]/take     body { phone }
//   POST /api/airport/help/[id]/resolve
// ============================================================

const ZONE_EMOJI: Record<string, string> = {
  bagages: '🛢️',
  sanitaires: '🚻',
  files_attente: '⏳',
  embarquement: '🛋️',
  restauration: '🍽️',
}

function zoneEmoji(code: string | null): string {
  if (!code) return '📍'
  return ZONE_EMOJI[code] ?? '📍'
}

function HelpRequestsBar() {
  const { toast } = useToast()
  const [pending, setPending] = useState<HelpRequest[]>([])
  const [inProgress, setInProgress] = useState<HelpRequest[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const pollingRef = useRef<boolean>(false)

  const load = useCallback(async () => {
    if (pollingRef.current) return
    pollingRef.current = true
    try {
      const [pendRes, progRes] = await Promise.all([
        fetch('/api/airport/help?statut=EN_ATTENTE', { cache: 'no-store' }),
        fetch('/api/airport/help?statut=PRIS_EN_CHARGE', { cache: 'no-store' }),
      ])
      const pendJson = (await pendRes.json()) as
        | { ok: true; data: { requests: HelpRequest[] } }
        | { ok: false; error: string }
      const progJson = (await progRes.json()) as
        | { ok: true; data: { requests: HelpRequest[] } }
        | { ok: false; error: string }
      if (pendJson.ok) setPending(pendJson.data.requests)
      if (progJson.ok) setInProgress(progJson.data.requests)
    } catch {
      // Silencieux : la bannière se recharge au prochain poll
    } finally {
      setLoading(false)
      pollingRef.current = false
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 10000)
    return () => clearInterval(t)
  }, [load])

  const handleTake = useCallback(
    async (id: string) => {
      // Demande le numéro de l'agent ops (audit)
      const phone = window.prompt(
        'Votre numéro WhatsApp ops (pour audit et contact voyageur) :',
      )
      if (!phone) return
      const cleaned = phone.replace(/[^0-9]/g, '')
      if (!/^\d{8,15}$/.test(cleaned)) {
        toast({
          title: 'Numéro invalide',
          description: 'Format attendu : international sans + (ex: 33612345678)',
          variant: 'destructive',
        })
        return
      }
      setActionId(id)
      try {
        const res = await fetch(`/api/airport/help/${id}/take`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleaned }),
        })
        const json = (await res.json()) as { ok: boolean; error?: string }
        if (!json.ok) throw new Error(json.error ?? 'Erreur')
        toast({
          title: 'Demande prise en charge',
          description: `Affectée à ${cleaned}.`,
        })
        await load()
      } catch (e) {
        toast({
          title: 'Erreur',
          description: e instanceof Error ? e.message : 'Erreur inconnue',
          variant: 'destructive',
        })
      } finally {
        setActionId(null)
      }
    },
    [load, toast],
  )

  const handleResolve = useCallback(
    async (id: string) => {
      setActionId(id)
      try {
        const res = await fetch(`/api/airport/help/${id}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const json = (await res.json()) as { ok: boolean; error?: string }
        if (!json.ok) throw new Error(json.error ?? 'Erreur')
        toast({
          title: 'Demande résolue',
          description: 'Le voyageur a été aidé sur place.',
        })
        await load()
      } catch (e) {
        toast({
          title: 'Erreur',
          description: e instanceof Error ? e.message : 'Erreur inconnue',
          variant: 'destructive',
        })
      } finally {
        setActionId(null)
      }
    },
    [load, toast],
  )

  const all = [...pending, ...inProgress]
  const isEmpty = !loading && all.length === 0

  return (
    <div className="shrink-0 border-b border-rose-500/20 bg-rose-500/5 px-4 py-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700">
          <Hand className="h-3.5 w-3.5" />
          Demandes d'aide en attente
          {!loading && all.length > 0 && (
            <Badge className="ml-1 border-rose-500/40 bg-rose-500/20 text-rose-700 hover:bg-rose-500/20">
              {all.length}
            </Badge>
          )}
        </h2>
        {loading && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            chargement…
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">
          Aucune demande d'aide en attente.
        </p>
      ) : (
        <div className="flex flex-col gap-2 lg:flex-row lg:overflow-x-auto lg:pb-1">
          {all.map((h) => (
            <HelpRequestCard
              key={h.id}
              help={h}
              actionLoading={actionId === h.id}
              onTake={() => void handleTake(h.id)}
              onResolve={() => void handleResolve(h.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Sous-composant : carte demande d'aide
// ---------------------------------------------------------------

type HelpRequestCardProps = {
  help: HelpRequest
  actionLoading: boolean
  onTake: () => void
  onResolve: () => void
}

function HelpRequestCard({
  help,
  actionLoading,
  onTake,
  onResolve,
}: HelpRequestCardProps) {
  const isPending = help.statut === 'EN_ATTENTE'
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2 rounded-lg border bg-card p-3 lg:w-80',
        isPending
          ? 'border-rose-500/40 bg-rose-500/5'
          : 'border-amber-500/40 bg-amber-500/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-base leading-none">{zoneEmoji(help.zoneCode)}</span>
          <code className="truncate font-mono text-[11px] text-muted-foreground">
            {help.tagScanne}
          </code>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-[9px] font-bold uppercase',
            isPending
              ? 'border-rose-500/40 bg-rose-500/15 text-rose-700'
              : 'border-amber-500/40 bg-amber-500/15 text-amber-700',
          )}
        >
          {isPending ? 'En attente' : 'En cours'}
        </Badge>
      </div>

      {help.message && (
        <p className="line-clamp-2 text-xs italic text-foreground">
          « {help.message} »
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {help.travelerPhone && (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700">
            <Phone className="h-3 w-3" />
            +{help.travelerPhone}
          </span>
        )}
        <span className="tabular-nums">{relativeTime(help.createdAt)}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {isPending && (
          <Button
            type="button"
            size="sm"
            onClick={onTake}
            disabled={actionLoading}
            className="h-7 flex-1 bg-amber-600 text-[11px] text-white hover:bg-amber-500"
          >
            {actionLoading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Hand className="mr-1 h-3 w-3" />
            )}
            Prendre en charge
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={onResolve}
          disabled={actionLoading}
          className="h-7 flex-1 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500"
        >
          {actionLoading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1 h-3 w-3" />
          )}
          Résoudre
        </Button>
      </div>
    </div>
  )
}
