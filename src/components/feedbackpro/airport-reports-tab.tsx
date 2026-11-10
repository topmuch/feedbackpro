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
  Camera,
  CheckCircle2,
  Clock,
  Hand,
  Loader2,
  MapPin,
  Phone,
  Plane,
  RefreshCw,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------
// Types (contrat API)
// ---------------------------------------------------------------

type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

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
  createdAt: string
  resolvedAt: string | null
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

  return (
    <div className="px-4 py-3 transition hover:bg-card/40 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Photo thumbnail (si présente) */}
        <div className="shrink-0 sm:order-1">
          {report.photoUrl ? (
            <a
              href={report.photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-16 w-16 overflow-hidden rounded-md border border-border bg-muted"
              title="Voir la photo"
            >
              <img
                src={report.photoUrl}
                alt={`Photo jointe au signalement ${shortId(report.id)}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </a>
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
        </div>
      </div>
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
