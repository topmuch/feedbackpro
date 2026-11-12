'use client'

// ============================================================
// <AirportFlightGatesTab /> — QR Dynamique Vol (Task D Phase 3)
// ------------------------------------------------------------
// Permet au manager ops d'assigner un vol à une porte d'embarquement.
// Le QR physique collé à la porte encode /?airport=porte_A12 ; quand
// le voyageur le scanne, la PWA reçoit automatiquement le vol courant
// (champ "numéro de vol" pré-rempli + verrouillé).
//
// APIs :
//   GET    /api/airport/flight-gates            → { gates: [...] }
//   POST   /api/airport/flight-gates            body { gateTag, flightNumber, ... }
//   PATCH  /api/airport/flight-gates/[id]       body { status?, active?, notes? }
//   DELETE /api/airport/flight-gates/[id]
//
// Polling : refresh auto toutes les 30 s + bouton manuel.
// Palette aéroport : slate-950 + accents amber.
// Export nommé : `import { AirportFlightGatesTab }`.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plane,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

type FlightStatus = 'BOARDING' | 'DEPARTED' | 'CANCELLED' | 'DELAYED'

type FlightGate = {
  id: string
  gateTag: string
  flightNumber: string
  airline: string | null
  destination: string | null
  scheduledDeparture: string | null
  status: string
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

type GatesResponse = {
  ok: true
  data: { gates: FlightGate[] }
}

type GateMutationResponse = {
  ok: true
  data: { gate: FlightGate }
}

type DeleteResponse = {
  ok: true
  data: { deleted: string }
}

type ApiError = {
  ok: false
  error: string
}

// ---------------------------------------------------------------
// Constantes UI
// ---------------------------------------------------------------

const GATE_OPTIONS: string[] = [
  'porte_A12',
  'porte_B07',
  'lounge_coworking_T2',
  'lounge_business_T1',
  'porte_A08',
  'porte_B03',
]

const STATUS_BADGE: Record<
  FlightStatus,
  { label: string; className: string; icon: typeof Plane }
> = {
  BOARDING: {
    label: 'Embarquement',
    className:
      'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    icon: Plane,
  },
  DEPARTED: {
    label: 'Décollé',
    className:
      'border-slate-400/40 bg-slate-500/10 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400',
    icon: CheckCircle2,
  },
  DELAYED: {
    label: 'Retardé',
    className:
      'border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
    icon: AlertTriangle,
  },
  CANCELLED: {
    label: 'Annulé',
    className:
      'border-rose-500/40 bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400',
    icon: XCircle,
  },
}

const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2}[0-9]{1,4}$/

// ---------------------------------------------------------------
// Composant
// ---------------------------------------------------------------

export function AirportFlightGatesTab() {
  const { toast } = useToast()
  const [gates, setGates] = useState<FlightGate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Form state (nouvelle assignation)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    gateTag: GATE_OPTIONS[0],
    flightNumber: '',
    airline: '',
    destination: '',
    scheduledDeparture: '',
    notes: '',
  })

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true)
      try {
        const res = await fetch('/api/airport/flight-gates', {
          cache: 'no-store',
        })
        const json = (await res.json()) as GatesResponse | ApiError
        if (json.ok) {
          setGates(json.data.gates)
        } else if (!silent) {
          toast({
            title: 'Erreur',
            description: json.error,
            variant: 'destructive',
          })
        }
      } catch {
        if (!silent) {
          toast({
            title: 'Erreur réseau',
            description: 'Impossible de charger les assignations.',
            variant: 'destructive',
          })
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 30_000)
    return () => clearInterval(interval)
  }, [load])

  const resetForm = useCallback(() => {
    setForm({
      gateTag: GATE_OPTIONS[0],
      flightNumber: '',
      airline: '',
      destination: '',
      scheduledDeparture: '',
      notes: '',
    })
  }, [])

  const handleCreate = useCallback(async () => {
    const flightNumber = form.flightNumber.trim().toUpperCase()
    if (!FLIGHT_NUMBER_RE.test(flightNumber)) {
      toast({
        title: 'Numéro de vol invalide',
        description: 'Format attendu : 2 lettres + 1 à 4 chiffres (ex : AF123).',
        variant: 'destructive',
      })
      return
    }
    if (!form.gateTag) {
      toast({
        title: 'Porte manquante',
        description: 'Sélectionnez une porte d\'embarquement.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/airport/flight-gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateTag: form.gateTag,
          flightNumber,
          airline: form.airline.trim() || undefined,
          destination: form.destination.trim() || undefined,
          scheduledDeparture: form.scheduledDeparture.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })
      const json = (await res.json()) as GateMutationResponse | ApiError
      if (json.ok) {
        toast({
          title: 'Vol assigné',
          description: `${form.gateTag} → ${flightNumber} (embarquement ouvert).`,
        })
        setDialogOpen(false)
        resetForm()
        await load()
      } else {
        toast({
          title: 'Erreur',
          description: json.error,
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Erreur réseau',
        description: 'Impossible d\'assigner le vol.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }, [form, load, resetForm, toast])

  const handlePatch = useCallback(
    async (
      gate: FlightGate,
      patch: { status?: FlightStatus; active?: boolean },
    ) => {
      setBusyId(gate.id)
      try {
        const res = await fetch(`/api/airport/flight-gates/${gate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const json = (await res.json()) as GateMutationResponse | ApiError
        if (json.ok) {
          const status = patch.status
          const verb =
            status === 'DEPARTED'
              ? 'décollé'
              : status === 'CANCELLED'
                ? 'annulé'
                : status === 'DELAYED'
                  ? 'retardé'
                  : 'mis à jour'
          toast({
            title: 'Statut mis à jour',
            description: `Vol ${gate.flightNumber} — ${verb}.`,
          })
          await load()
        } else {
          toast({
            title: 'Erreur',
            description: json.error,
            variant: 'destructive',
          })
        }
      } catch {
        toast({
          title: 'Erreur réseau',
          description: 'Impossible de mettre à jour le vol.',
          variant: 'destructive',
        })
      } finally {
        setBusyId(null)
      }
    },
    [load, toast],
  )

  const handleDelete = useCallback(
    async (gate: FlightGate) => {
      const confirm = window.confirm(
        `Supprimer définitivement l'assignation ${gate.gateTag} ↔ ${gate.flightNumber} ?`,
      )
      if (!confirm) return
      setBusyId(gate.id)
      try {
        const res = await fetch(`/api/airport/flight-gates/${gate.id}`, {
          method: 'DELETE',
        })
        const json = (await res.json()) as DeleteResponse | ApiError
        if (json.ok) {
          toast({
            title: 'Assignation supprimée',
            description: `${gate.gateTag} est désormais libre.`,
          })
          await load()
        } else {
          toast({
            title: 'Erreur',
            description: json.error,
            variant: 'destructive',
          })
        }
      } catch {
        toast({
          title: 'Erreur réseau',
          description: 'Impossible de supprimer l\'assignation.',
          variant: 'destructive',
        })
      } finally {
        setBusyId(null)
      }
    },
    [load, toast],
  )

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Plane className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              QR Dynamique Vol — Assignations porte ↔ vol
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Le QR collé sur une porte porte automatiquement le vol à quai.
              Le voyageur n'a plus à saisir son numéro de vol.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={refreshing}
            className="border-border bg-background text-foreground hover:bg-muted"
          >
            {refreshing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Rafraîchir
          </Button>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-b from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-600 hover:to-amber-700"
          >
            <Plus className="mr-2 size-4" />
            Nouvelle assignation
          </Button>
        </div>
      </div>

      {/* Content */}
      <Card className="overflow-hidden border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border bg-muted/60 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Plane className="size-4 text-amber-600 dark:text-amber-400" />
            Portes assignées ({gates.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          ) : gates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Plane className="size-6" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Aucune assignation active — les portes sont libres
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(true)}
                className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-amber-500/15"
              >
                <Plus className="mr-2 size-4" />
                Assigner un premier vol
              </Button>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {/* Desktop table */}
              <table className="hidden w-full table-fixed md:table">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Porte</th>
                    <th className="px-4 py-2 text-left font-semibold">Vol</th>
                    <th className="px-4 py-2 text-left font-semibold">Compagnie</th>
                    <th className="px-4 py-2 text-left font-semibold">Destination</th>
                    <th className="px-4 py-2 text-left font-semibold">Départ</th>
                    <th className="px-4 py-2 text-left font-semibold">Statut</th>
                    <th className="px-4 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gates.map((gate) => {
                    const status = (gate.status as FlightStatus) ?? 'BOARDING'
                    const badge = STATUS_BADGE[status]
                    const StatusIcon = badge.icon
                    const isBusy = busyId === gate.id
                    return (
                      <tr
                        key={gate.id}
                        className={cn(
                          'text-sm transition-colors',
                          gate.active
                            ? 'bg-card hover:bg-amber-500/10 dark:hover:bg-amber-500/15'
                            : 'bg-muted/40 text-muted-foreground',
                        )}
                      >
                        <td className="px-4 py-3 align-middle">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {gate.gateTag}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
                            <Plane className="size-3.5 text-amber-600 dark:text-amber-400" />
                            {gate.flightNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground">
                          {gate.airline ?? '—'}
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground">
                          {gate.destination ?? '—'}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {gate.scheduledDeparture ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="size-3.5 text-muted-foreground" />
                              {gate.scheduledDeparture}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge
                            variant="outline"
                            className={cn('gap-1 text-xs', badge.className)}
                          >
                            <StatusIcon className="size-3" />
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() =>
                                handlePatch(gate, {
                                  status: 'DEPARTED',
                                  active: false,
                                })
                              }
                              className="h-8 px-2 text-xs text-muted-foreground hover:bg-muted"
                              title="Marquer décollé (libère la porte)"
                            >
                              {isBusy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-3.5" />
                              )}
                              <span className="ml-1">Décollé</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() =>
                                handlePatch(gate, { status: 'DELAYED' })
                              }
                              className="h-8 px-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-amber-500/15"
                              title="Retarder"
                            >
                              <AlertTriangle className="size-3.5" />
                              <span className="ml-1">Retarder</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() =>
                                handlePatch(gate, {
                                  status: 'CANCELLED',
                                  active: false,
                                })
                              }
                              className="h-8 px-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/15"
                              title="Annuler (libère la porte)"
                            >
                              <XCircle className="size-3.5" />
                              <span className="ml-1">Annuler</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() => handleDelete(gate)}
                              className="h-8 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-rose-600 dark:hover:text-rose-400"
                              title="Supprimer l'assignation"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="divide-y divide-border md:hidden">
                {gates.map((gate) => {
                  const status = (gate.status as FlightStatus) ?? 'BOARDING'
                  const badge = STATUS_BADGE[status]
                  const StatusIcon = badge.icon
                  const isBusy = busyId === gate.id
                  return (
                    <div
                      key={gate.id}
                      className={cn(
                        'p-4',
                        gate.active ? 'bg-card' : 'bg-muted/40',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                              {gate.gateTag}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn('gap-1 text-[10px]', badge.className)}
                            >
                              <StatusIcon className="size-2.5" />
                              {badge.label}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Plane className="size-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-base font-bold text-foreground">
                              {gate.flightNumber}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {gate.airline ?? '—'} · {gate.destination ?? '—'}
                            {gate.scheduledDeparture
                              ? ` · ${gate.scheduledDeparture}`
                              : ''}
                          </div>
                          {gate.notes ? (
                            <div className="mt-1 text-xs italic text-muted-foreground">
                              {gate.notes}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() =>
                            handlePatch(gate, {
                              status: 'DEPARTED',
                              active: false,
                            })
                          }
                          className="h-8 border-border px-2 text-xs text-muted-foreground"
                        >
                          {isBusy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          <span className="ml-1">Décollé</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() =>
                            handlePatch(gate, { status: 'DELAYED' })
                          }
                          className="h-8 border-amber-500/40 px-2 text-xs text-amber-600 dark:text-amber-400"
                        >
                          <AlertTriangle className="size-3.5" />
                          <span className="ml-1">Retarder</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() =>
                            handlePatch(gate, {
                              status: 'CANCELLED',
                              active: false,
                            })
                          }
                          className="h-8 border-rose-500/40 px-2 text-xs text-rose-600 dark:text-rose-400"
                        >
                          <XCircle className="size-3.5" />
                          <span className="ml-1">Annuler</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => handleDelete(gate)}
                          className="ml-auto h-8 px-2 text-xs text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog nouvelle assignation */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg border-border bg-background p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Plane className="size-4 text-amber-600 dark:text-amber-400" />
              Nouvelle assignation porte ↔ vol
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Le vol sera immédiatement actif à quai. Le QR de la porte se met
              à jour automatiquement pour les prochains scans.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
            {/* Porte */}
            <div className="space-y-1.5">
              <Label htmlFor="fg-gateTag" className="text-xs font-semibold text-muted-foreground">
                Porte d'embarquement
              </Label>
              <Select
                value={form.gateTag}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, gateTag: v }))
                }
              >
                <SelectTrigger
                  id="fg-gateTag"
                  className="bg-background text-sm"
                >
                  <SelectValue placeholder="Sélectionnez une porte" />
                </SelectTrigger>
                <SelectContent>
                  {GATE_OPTIONS.map((g) => (
                    <SelectItem key={g} value={g} className="font-mono text-xs">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Numéro de vol */}
            <div className="space-y-1.5">
              <Label htmlFor="fg-flightNumber" className="text-xs font-semibold text-muted-foreground">
                Numéro de vol
              </Label>
              <Input
                id="fg-flightNumber"
                value={form.flightNumber}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    flightNumber: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="AF123"
                autoCapitalize="characters"
                className="font-mono uppercase tracking-wide text-sm"
                maxLength={10}
              />
              <p className="text-[11px] text-muted-foreground">
                2 lettres + 1-4 chiffres (ex : AF123, DL6049).
              </p>
            </div>

            {/* Compagnie + Destination */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fg-airline" className="text-xs font-semibold text-muted-foreground">
                  Compagnie
                </Label>
                <Input
                  id="fg-airline"
                  value={form.airline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, airline: e.target.value }))
                  }
                  placeholder="Air France"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fg-destination" className="text-xs font-semibold text-muted-foreground">
                  Destination
                </Label>
                <Input
                  id="fg-destination"
                  value={form.destination}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, destination: e.target.value }))
                  }
                  placeholder="Paris CDG"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Départ prévu */}
            <div className="space-y-1.5">
              <Label htmlFor="fg-departure" className="text-xs font-semibold text-muted-foreground">
                Heure de départ prévue (HH:MM)
              </Label>
              <Input
                id="fg-departure"
                type="time"
                value={form.scheduledDeparture}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    scheduledDeparture: e.target.value,
                  }))
                }
                className="text-sm"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="fg-notes" className="text-xs font-semibold text-muted-foreground">
                Notes (optionnel)
              </Label>
              <Textarea
                id="fg-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Retardé 15min, vol groupé AF1180/AF1181…"
                rows={3}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                resetForm()
              }}
              disabled={submitting}
              className="border-border text-muted-foreground"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="bg-gradient-to-b from-amber-500 to-amber-600 text-white shadow-sm hover:from-amber-600 hover:to-amber-700"
            >
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plane className="mr-2 size-4" />
              )}
              Activer à quai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
