'use client'

// ============================================================
// <AirportBlackboxTab /> — Black Box · Audit Trail Immuable
// ------------------------------------------------------------
// Affiche l'historique immuable de toutes les actions effectuées
// sur les signalements aéroport (CREATED / TAKE_CHARGE /
// RESOLVED / ASSIGNED). Les entrées ne sont jamais modifiées ni
// supprimées : la Black Box est la source de vérité légale.
//
// Source : GET /api/airport/audit (50 dernières entrées)
// Polling : 30 s + refresh manuel.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck,
  Lock,
  RefreshCw,
  Loader2,
  Search,
  Clock,
  Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------
// Types (contrat API)
// ---------------------------------------------------------------

type AuditAction = 'CREATED' | 'TAKE_CHARGE' | 'RESOLVED' | 'ASSIGNED'

type AuditEntry = {
  id: string
  reportId: string
  action: AuditAction
  actor: string
  fromStatut: string | null
  toStatut: string
  elapsedMin: number | null
  photoUrl: string | null
  note: string | null
  createdAt: string
}

type AuditResponse = {
  ok: true
  data: { entries: AuditEntry[] }
}

// ---------------------------------------------------------------
// Helpers visuels
// ---------------------------------------------------------------

const ACTION_BADGE: Record<
  AuditAction,
  { label: string; className: string }
> = {
  CREATED: {
    label: 'CREATED',
    className:
      'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/20',
  },
  TAKE_CHARGE: {
    label: 'TAKE_CHARGE',
    className:
      'bg-sky-500/15 text-sky-300 border-sky-500/40 hover:bg-sky-500/20',
  },
  RESOLVED: {
    label: 'RESOLVED',
    className:
      'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20',
  },
  ASSIGNED: {
    label: 'ASSIGNED',
    className:
      'bg-violet-500/15 text-violet-300 border-violet-500/40 hover:bg-violet-500/20',
  },
}

const ACTION_FILTERS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'CREATED', label: 'CREATED' },
  { value: 'TAKE_CHARGE', label: 'TAKE_CHARGE' },
  { value: 'RESOLVED', label: 'RESOLVED' },
  { value: 'ASSIGNED', label: 'ASSIGNED' },
] as const

function formatHorodatage(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function truncateId(id: string, max = 10): string {
  if (!id) return '—'
  return id.length > max ? `${id.slice(0, max)}…` : id
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export function AirportBlackboxTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // Filtres
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Entrée sélectionnée pour le dialog
  const [selected, setSelected] = useState<AuditEntry | null>(null)

  // ---------------------------------------------------------------
  // Chargement + polling 30s
  // ---------------------------------------------------------------
  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const res = await fetch('/api/airport/audit', { cache: 'no-store' })
      const json: AuditResponse = await res.json()
      if (json.ok) {
        setEntries(json.data.entries ?? [])
        setLastSync(new Date())
      }
    } catch {
      /* silencieux */
    } finally {
      if (manual) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(false), 30000)
    return () => clearInterval(t)
  }, [load])

  // ---------------------------------------------------------------
  // Filtrage
  // ---------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false
      if (q) {
        const haystack =
          `${e.actor} ${e.reportId} ${e.note ?? ''} ${e.toStatut} ${e.fromStatut ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [entries, actionFilter, search])

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="flex h-full flex-col space-y-4 p-4 sm:p-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <ShieldCheck className="size-5 text-amber-400" aria-hidden />
          </div>
          <div>
            <h1 className="font-mono text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
              BLACK BOX{' '}
              <span className="text-amber-400">— Audit Trail Immuable</span>
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="size-3" aria-hidden />
              Toute action sur un signalement est tracée de façon définitive et
              non modifiable.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] uppercase tracking-wider text-slate-500 sm:inline">
            {lastSync
              ? `Sync ${lastSync.toLocaleTimeString('fr-FR')}`
              : '—'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/50 hover:bg-slate-800 hover:text-amber-300"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="ml-1.5">Rafraîchir</span>
          </Button>
        </div>
      </div>

      {/* ---------- Filter bar ---------- */}
      <Card className="border-slate-800 bg-slate-900/60">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Action
            </span>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px] border-slate-700 bg-slate-950 text-slate-200">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-slate-200">
                {ACTION_FILTERS.map((f) => (
                  <SelectItem
                    key={f.value}
                    value={f.value}
                    className="focus:bg-slate-800"
                  >
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher acteur, reportId, note…"
              className="border-slate-700 bg-slate-950 pl-8 text-slate-200 placeholder:text-slate-600 focus-visible:border-amber-500/40"
            />
          </div>

          <div className="text-[11px] tabular-nums text-slate-500">
            {filtered.length} / {entries.length} entrée
            {entries.length > 1 ? 's' : ''}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Table ---------- */}
      <Card className="flex min-h-0 flex-1 flex-col border-slate-800 bg-slate-900/40">
        <CardHeader className="border-b border-slate-800 px-4 py-3">
          <CardTitle className="flex items-center gap-2 font-mono text-sm font-semibold text-slate-300">
            <Clock className="size-4 text-amber-400" aria-hidden />
            Journal d&apos;audit
          </CardTitle>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 w-full bg-slate-800/60"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-slate-800/60">
                <ShieldCheck className="size-6 text-slate-600" aria-hidden />
              </div>
              <p className="text-sm font-medium text-slate-300">
                Aucune entrée d&apos;audit — la Black Box se remplit à chaque
                action sur un signalement
              </p>
              <p className="max-w-md text-xs text-slate-500">
                Les actions CREATED / TAKE_CHARGE / RESOLVED / ASSIGNED seront
                listées ici en temps réel.
              </p>
            </div>
          ) : (
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#475569_#020617] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-950 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb:hover]:bg-slate-600">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                  <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">Horodatage</th>
                    <th className="px-4 py-2.5">Report ID</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Acteur</th>
                    <th className="px-4 py-2.5">Avant → Après</th>
                    <th className="px-4 py-2.5 text-right">Écoulé</th>
                    <th className="px-4 py-2.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const badge = ACTION_BADGE[e.action]
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className="cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/40"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs tabular-nums text-slate-300">
                          {formatHorodatage(e.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                          {truncateId(e.reportId)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'font-mono text-[10px] font-bold',
                              badge.className,
                            )}
                          >
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-200">
                          {e.actor || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="text-slate-500">
                            {e.fromStatut ?? '∅'}
                          </span>
                          <span className="mx-1.5 text-slate-600">→</span>
                          <span className="font-medium text-slate-200">
                            {e.toStatut}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-amber-300">
                          {e.elapsedMin != null ? `${e.elapsedMin}′` : '—'}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-slate-500">
                          {e.note ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Dialog Détails ---------- */}
      <Dialog
        open={selected != null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-base">
              <ShieldCheck className="size-4 text-amber-400" aria-hidden />
              Entrée d&apos;audit — {selected && truncateId(selected.id, 16)}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Détail immuable de l&apos;action tracée.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 py-2 text-sm">
              <Row label="Horodatage" value={formatHorodatage(selected.createdAt)} mono />
              <Row label="Report ID" value={selected.reportId} mono />
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Action
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono text-[10px] font-bold',
                    ACTION_BADGE[selected.action].className,
                  )}
                >
                  {ACTION_BADGE[selected.action].label}
                </Badge>
              </div>
              <Row label="Acteur" value={selected.actor || '—'} />
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Transition
                </span>
                <span className="text-xs">
                  <span className="text-slate-500">
                    {selected.fromStatut ?? '∅'}
                  </span>
                  <span className="mx-1.5 text-slate-600">→</span>
                  <span className="font-semibold text-slate-100">
                    {selected.toStatut}
                  </span>
                </span>
              </div>
              <Row
                label="Écoulé"
                value={
                  selected.elapsedMin != null
                    ? `${selected.elapsedMin} min`
                    : '—'
                }
              />
              <Row
                label="Note"
                value={selected.note ?? '—'}
              />

              {selected.photoUrl && (
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <Camera className="size-3" /> Photo
                  </span>
                  <img
                    src={selected.photoUrl}
                    alt={`Photo jointe à l'entrée ${selected.id}`}
                    className="max-h-64 w-full rounded-lg border border-slate-800 object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------
// Sous-composant : ligne clé/valeur pour le dialog
// ---------------------------------------------------------------

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={cn(
          'flex-1 break-words text-xs text-slate-200',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  )
}
