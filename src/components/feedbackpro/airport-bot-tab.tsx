'use client'

// ============================================================
// <AirportBotTab /> — Panneau info & statut du bot WhatsApp
// ------------------------------------------------------------
// Pas d'interactivité complexe : documentation statique + liste
// des numéros ops autorisés (fetch /api/airport/ops-contacts).
//
// Sections :
//   1. Status card (Bot actif / Mode démo)
//   2. Webhook URL (copyable)
//   3. Commandes (7 commandes)
//   4. Numéros autorisés (table)
//   5. Configuration Twilio (env vars)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Shield,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------
// Types (contrat API)
// ---------------------------------------------------------------

type OpsContact = {
  id: string
  phone: string
  name: string
  role: string
  actif: boolean
  createdAt: string
}

type ContactsResponse = {
  ok: true
  data: { contacts: OpsContact[]; count: number; actifs: number }
}

type ErrorResponse = { ok: false; error: string }

// ---------------------------------------------------------------
// Données statiques (commandes du bot)
// ---------------------------------------------------------------

type Command = {
  cmd: string
  desc: string
  example?: string
}

const COMMANDS: readonly Command[] = [
  {
    cmd: '/aide',
    desc: 'Affiche la liste des commandes disponibles et les codes zones.',
  },
  {
    cmd: '/priorites',
    desc: 'Top 3 zones à traiter (24h) — les zones avec le plus de signalements en attente.',
  },
  {
    cmd: '/zone <code>',
    desc: "État détaillé d'une zone : bilan statut + 3 derniers signalements.",
    example: '/zone bagages',
  },
  {
    cmd: '/signalement <id>',
    desc: 'Fiche complète d\'un signalement (zone, problème, emplacement, photo, vol…).',
    example: '/signalement ab12cd34',
  },
  {
    cmd: '/resoudre <id>',
    desc: 'Marque un signalement comme RÉSOLU et notifie le voyageur si opt-in.',
    example: '/resoudre ab12cd34',
  },
  {
    cmd: '/stats',
    desc: 'Statistiques 24h : total, en attente, en cours, résolus, temps moyen.',
  },
  {
    cmd: '/liste',
    desc: '5 derniers signalements en attente (avec ID court et horodatage).',
  },
] as const

const ROLE_META: Record<string, { label: string; cls: string }> = {
  ops: { label: 'Ops', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' },
  manager: { label: 'Manager', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-700' },
  nettoyage: { label: 'Nettoyage', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700' },
  maintenance: { label: 'Maintenance', cls: 'border-orange-500/30 bg-orange-500/10 text-orange-700' },
  securite: { label: 'Sécurité', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-700' },
}

function roleMeta(r: string): { label: string; cls: string } {
  return ROLE_META[r] ?? { label: r, cls: 'border-border/40 bg-muted/30 text-muted-foreground' }
}

function formatPhone(p: string): string {
  // Format international : 33612345678 → +33 6 12 34 56 78
  if (p.startsWith('33') && p.length === 11) {
    return `+33 ${p.slice(2, 3)} ${p.slice(3, 5)} ${p.slice(5, 7)} ${p.slice(7, 9)} ${p.slice(9, 11)}`
  }
  return `+${p}`
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export default function AirportBotTab() {
  const { toast } = useToast()
  const [contacts, setContacts] = useState<OpsContact[]>([])
  const [count, setCount] = useState<number>(0)
  const [actifs, setActifs] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Statut "Bot actif" déduit côté client (on ne peut pas lire process.env
  // côté client, donc on se base sur la présence de numéros actifs et
  // on affiche le statut "Mode démo" si 0 contacts actifs — indication
  // visuelle simple. Le vrai mode est déterminé côté serveur par la
  // présence de TWILIO_TOKEN.)
  const modeDemo = actifs === 0

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/airport/ops-contacts', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ContactsResponse | ErrorResponse
      if (!json.ok) throw new Error(json.error)
      setContacts(json.data.contacts)
      setCount(json.data.count)
      setActifs(json.data.actifs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast({ title: 'Copié', description: label })
      } catch {
        toast({
          title: 'Copie impossible',
          description: "Votre navigateur ne supporte pas le presse-papiers.",
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  // Webhook URL (construite côté client depuis window.location)
  const [webhookUrl, setWebhookUrl] = useState<string>('/api/airport/whatsapp-webhook')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/airport/whatsapp-webhook`)
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* ---------- HEADER ---------- */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card text-2xl">
          🤖
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Bot WhatsApp Ops</h2>
          <p className="text-xs text-muted-foreground/70">
            Assistant conversationnel pour les équipes terrain — commandes par SMS WhatsApp.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---------- COLONNE GAUCHE : status + webhook + commands ---------- */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Status card */}
          <div
            className={cn(
              'rounded-lg border p-4',
              modeDemo
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5',
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                  modeDemo ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-600',
                )}
              >
                {modeDemo ? <AlertCircle className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {modeDemo ? 'Mode démo' : 'Bot actif'}
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      modeDemo
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600',
                    )}
                  >
                    {modeDemo ? 'DÉMO' : 'LIVE'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {modeDemo
                    ? "Aucun numéro ops actif enregistré. Le webhook accepte les requêtes mais aucun agent n'est autorisé à recevoir des réponses. Ajoutez des contacts ci-contre."
                    : `${actifs} numéro${actifs > 1 ? 's' : ''} ops actif${actifs > 1 ? 's' : ''}. Le webhook Twilio est prêt à recevoir des messages.`}
                </p>
              </div>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">URL du webhook Twilio</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground/70">
              Configurez cette URL dans la console Twilio → Messaging → A MESSAGE COMES IN → WhatsApp.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-emerald-600">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'URL du webhook copiée')}
                className="shrink-0 border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Commandes */}
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Commandes disponibles</h3>
              <Badge variant="outline" className="ml-auto border-border text-[10px] text-muted-foreground">
                {COMMANDS.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {COMMANDS.map((c) => (
                <div
                  key={c.cmd}
                  className="rounded-md border border-border bg-background/60 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600">
                      {c.cmd}
                    </code>
                    {c.example && (
                      <code className="font-mono text-[10px] text-muted-foreground/70">ex: {c.example}</code>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------- COLONNE DROITE : contacts + twilio config ---------- */}
        <div className="flex flex-col gap-5">
          {/* Numéros autorisés */}
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Numéros autorisés</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                onClick={() => void load()}
                disabled={loading}
                title="Rafraîchir"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {error ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">
                {error}
              </div>
            ) : loading && contacts.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/70">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : contacts.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-background/40 p-4 text-center text-xs text-muted-foreground/70">
                <Phone className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
                Aucun numéro ops enregistré.
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  Ajoutez des enregistrements dans la table <code>AirportOpsContact</code> via le seed.
                </p>
              </div>
            ) : (
              <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                {contacts.map((c) => {
                  const r = roleMeta(c.role)
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-md border p-2.5',
                        c.actif
                          ? 'border-border bg-background/60'
                          : 'border-border bg-background/30 opacity-60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">
                            {c.name}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {formatPhone(c.phone)}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn('shrink-0 text-[9px]', r.cls)}
                        >
                          {r.label}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {c.actif ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                            <Check className="h-2.5 w-2.5" /> Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                            <AlertCircle className="h-2.5 w-2.5" /> Suspendu
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground/70">
              <span>{count} contact{count > 1 ? 's' : ''}</span>
              <span className="text-emerald-600">{actifs} actif{actifs > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Twilio config */}
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Variables d'environnement</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground/70">
              À définir dans <code className="font-mono">.env</code> pour activer le bot en production.
            </p>
            <div className="flex flex-col gap-2">
              {[
                { key: 'TWILIO_SID', desc: 'Account SID Twilio' },
                { key: 'TWILIO_TOKEN', desc: 'Auth Token (vérifie signature webhook)' },
                { key: 'TWILIO_PHONE', desc: 'Numéro WhatsApp expéditeur (sandbox ou production)' },
                { key: 'AIRPORT_OPS_WHATSAPP', desc: 'Numéro ops destinataire (routage alertes)' },
              ].map((v) => (
                <div key={v.key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5">
                  <code className="font-mono text-[11px] text-emerald-600">{v.key}</code>
                  <span className="truncate text-[10px] text-muted-foreground/70" title={v.desc}>
                    {v.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- PLANIFICATION DES QUARTS (Feature 4) ---------- */}
      <ShiftsSection />
    </div>
  )
}

// ============================================================
// Sous-composant : ShiftsSection (Feature 4 — Planification des quarts)
// ------------------------------------------------------------
// Tableau des quarts ops avec édition inline (debounce 600 ms) :
//   - colonnes : Nom | Début | Fin | Jours | Numéros ops | Actif | Actions
//   - bouton "Ajouter un quart" → POST /api/airport/shifts
//   - toggle ops phones : cliquez sur un chip pour ajouter/retirer
//   - switch "Actif" : bascule la planification
//   - bouton poubelle : DELETE /api/airport/shifts/[id]
//
// En-tête : badge "QUART ACTUEL" rafraîchi toutes les 60 s via
// GET /api/airport/shifts/active.
// ============================================================

type ShiftDto = {
  id: string
  name: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
  opsPhones: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

type ShiftsListResponse = {
  ok: true
  data: { shifts: ShiftDto[]; count: number }
}

type ShiftCreateResponse = {
  ok: true
  data: { shift: ShiftDto }
}

type ShiftUpdateResponse = {
  ok: true
  data: { shift: ShiftDto }
}

type ActiveShiftInfo = {
  shift: { id: string; name: string; startTime: string; endTime: string } | null
  activePhones: string[]
  allPhones: string[]
}

type ActiveShiftResponse = {
  ok: true
  data: ActiveShiftInfo
}

const DAY_LABELS: Array<{ dow: number; short: string }> = [
  { dow: 1, short: 'L' },
  { dow: 2, short: 'M' },
  { dow: 3, short: 'M' },
  { dow: 4, short: 'J' },
  { dow: 5, short: 'V' },
  { dow: 6, short: 'S' },
  { dow: 0, short: 'D' },
]

function ShiftsSection() {
  const { toast } = useToast()
  const [shifts, setShifts] = useState<ShiftDto[]>([])
  const [contacts, setContacts] = useState<OpsContact[]>([])
  const [active, setActive] = useState<ActiveShiftInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // --- Chargement initial : shifts + contacts ---
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [shiftsRes, contactsRes] = await Promise.all([
        fetch('/api/airport/shifts', { cache: 'no-store' }),
        fetch('/api/airport/ops-contacts', { cache: 'no-store' }),
      ])
      if (!shiftsRes.ok) throw new Error(`HTTP ${shiftsRes.status}`)
      if (!contactsRes.ok) throw new Error(`HTTP ${contactsRes.status}`)
      const sj = (await shiftsRes.json()) as ShiftsListResponse | ErrorResponse
      const cj = (await contactsRes.json()) as ContactsResponse | ErrorResponse
      if (!sj.ok) throw new Error(sj.error)
      if (!cj.ok) throw new Error(cj.error)
      setShifts(sj.data.shifts)
      setContacts(cj.data.contacts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // --- Poll du quart actif toutes les 60s ---
  const loadActive = useCallback(async () => {
    try {
      const res = await fetch('/api/airport/shifts/active', { cache: 'no-store' })
      if (!res.ok) return
      const j = (await res.json()) as ActiveShiftResponse | ErrorResponse
      if (j.ok) setActive(j.data)
    } catch {
      // silent — le statut reste stal, sans bloquer l'UI
    }
  }, [])

  useEffect(() => {
    void loadActive()
    const t = setInterval(() => void loadActive(), 60_000)
    return () => clearInterval(t)
  }, [loadActive])

  // --- Création d'un nouveau quart ---
  const handleAdd = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/airport/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Nouveau quart',
          startTime: '08:00',
          endTime: '16:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          opsPhones: [],
          active: true,
        }),
      })
      const j = (await res.json()) as ShiftCreateResponse | ErrorResponse
      if (!j.ok) throw new Error(j.error)
      setShifts((prev) => [...prev, j.data.shift])
      toast({
        title: 'Quart créé',
        description: 'Modifiez les champs ci-dessous pour le configurer.',
      })
    } catch (e) {
      toast({
        title: 'Erreur création',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }, [toast])

  // --- Mise à jour d'un quart (callback pour ShiftRow) ---
  const handleShiftUpdate = useCallback((updated: ShiftDto) => {
    setShifts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }, [])

  // --- Suppression d'un quart ---
  const handleShiftDelete = useCallback((id: string) => {
    setShifts((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // --- Construction du libellé "QUART ACTUEL" ---
  const activeShiftLabel = buildActiveShiftLabel(active, contacts)

  return (
    <div className="mt-6 rounded-lg border border-border bg-card/40 p-4">
      {/* Header : titre + statut quart actuel + bouton ajouter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-emerald-600" />
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Planification des quarts
            </Label>
            <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
              {shifts.length}
            </Badge>
          </div>
          {/* QUART ACTUEL */}
          <div className="flex items-center gap-2 text-xs">
            {active && active.shift ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {activeShiftLabel}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-medium text-rose-700">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Aucun quart actif
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/70">
              · Rafraîchi toutes les 60 s
            </span>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={creating}
          className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-800"
        >
          {creating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Ajouter un quart
        </Button>
      </div>

      {/* Erreur */}
      {error && (
        <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground/70">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement des quarts…
        </div>
      ) : shifts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background/40 p-6 text-center text-xs text-muted-foreground/70">
          <Calendar className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
          Aucun quart planifié. Cliquez sur « Ajouter un quart » pour commencer.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="px-2 py-2 font-medium">Nom</th>
                <th className="px-2 py-2 font-medium">Début</th>
                <th className="px-2 py-2 font-medium">Fin</th>
                <th className="px-2 py-2 font-medium">Jours</th>
                <th className="px-2 py-2 font-medium">Numéros ops</th>
                <th className="px-2 py-2 text-center font-medium">Actif</th>
                <th className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <ShiftRow
                  key={s.id}
                  initial={s}
                  contacts={contacts}
                  onUpdate={handleShiftUpdate}
                  onDelete={handleShiftDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- Helper : construit le libellé "🟢 Matin (06:00-14:00) — Marc" ---
function buildActiveShiftLabel(
  active: ActiveShiftInfo | null,
  contacts: OpsContact[],
): string {
  if (!active || !active.shift) return 'Aucun quart actif'
  const { shift, activePhones } = active
  // On cherche les noms des ops dont le phone est dans activePhones
  const names = contacts
    .filter((c) => activePhones.includes(c.phone))
    .map((c) => c.name)
    .slice(0, 2)
  const more = activePhones.length - names.length
  const namesSuffix =
    names.length > 0
      ? ` — ${names.join(', ')}${more > 0 ? ` +${more}` : ''}`
      : activePhones.length > 0
        ? ` — ${activePhones.length} op(s)`
        : ''
  return `${shift.name} (${shift.startTime}-${shift.endTime})${namesSuffix}`
}

// ============================================================
// Sous-composant : ShiftRow
// ------------------------------------------------------------
// Une ligne du tableau des quarts. Édition inline avec debounce
// 600 ms : à chaque modification d'un champ, on programme un PUT
// /api/airport/shifts/[id]. Si une nouvelle modif arrive avant
// l'expiration du timer, on annule et reprogramme.
// ============================================================

type ShiftRowProps = {
  initial: ShiftDto
  contacts: OpsContact[]
  onUpdate: (next: ShiftDto) => void
  onDelete: (id: string) => void
}

function ShiftRow({ initial, contacts, onUpdate, onDelete }: ShiftRowProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<ShiftDto>(initial)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<ShiftDto>(initial)

  // Quand le prop `initial` change (suite à un save serveur), on
  // resync le form pour éviter une boucle de save infinie.
  useEffect(() => {
    setForm(initial)
    lastSavedRef.current = initial
  }, [initial])

  // Nettoyage du timer à l'unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const patch = (p: Partial<ShiftDto>) => {
    const next = { ...form, ...p }
    setForm(next)
    scheduleSave(next)
  }

  const scheduleSave = (next: ShiftDto) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void doSave(next)
    }, 600)
  }

  const doSave = async (next: ShiftDto) => {
    // Évite un PUT si rien n'a changé depuis le dernier save.
    if (
      lastSavedRef.current.name === next.name &&
      lastSavedRef.current.startTime === next.startTime &&
      lastSavedRef.current.endTime === next.endTime &&
      lastSavedRef.current.daysOfWeek.join(',') === next.daysOfWeek.join(',') &&
      lastSavedRef.current.opsPhones.join(',') === next.opsPhones.join(',') &&
      lastSavedRef.current.active === next.active
    ) {
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/airport/shifts/${next.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: next.name,
          startTime: next.startTime,
          endTime: next.endTime,
          daysOfWeek: next.daysOfWeek,
          opsPhones: next.opsPhones,
          active: next.active,
        }),
      })
      const j = (await res.json()) as ShiftUpdateResponse | ErrorResponse
      if (!j.ok) throw new Error(j.error)
      lastSavedRef.current = j.data.shift
      onUpdate(j.data.shift)
    } catch (e) {
      toast({
        title: 'Erreur sauvegarde',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
      // Restore la dernière version serveur connue
      setForm(lastSavedRef.current)
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (dow: number) => {
    const has = form.daysOfWeek.includes(dow)
    const next = has
      ? form.daysOfWeek.filter((d) => d !== dow)
      : [...form.daysOfWeek, dow].sort((a, b) => {
          // Tri par ordre L M M J V S D
          const order = [1, 2, 3, 4, 5, 6, 0]
          return order.indexOf(a) - order.indexOf(b)
        })
    patch({ daysOfWeek: next })
  }

  const togglePhone = (phone: string) => {
    const has = form.opsPhones.includes(phone)
    const next = has
      ? form.opsPhones.filter((p) => p !== phone)
      : [...form.opsPhones, phone]
    patch({ opsPhones: next })
  }

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer le quart « ${form.name} » ?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/airport/shifts/${form.id}`, { method: 'DELETE' })
      const j = (await res.json()) as { ok: true; data: { id: string } } | ErrorResponse
      if (!j.ok) throw new Error(j.error)
      onDelete(form.id)
      toast({ title: 'Quart supprimé', description: form.name })
    } catch (e) {
      toast({
        title: 'Erreur suppression',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <tr className="border-b border-border/60 align-middle">
      {/* Nom */}
      <td className="px-2 py-2">
        <Input
          value={form.name}
          onChange={(e) => patch({ name: e.target.value.slice(0, 40) })}
          maxLength={40}
          className="h-8 w-32 border-border bg-card text-xs"
          placeholder="Matin"
        />
      </td>

      {/* Début */}
      <td className="px-2 py-2">
        <Input
          type="time"
          value={form.startTime}
          onChange={(e) => patch({ startTime: e.target.value })}
          className="h-8 w-24 border-border bg-card font-mono text-xs tabular-nums"
        />
      </td>

      {/* Fin */}
      <td className="px-2 py-2">
        <Input
          type="time"
          value={form.endTime}
          onChange={(e) => patch({ endTime: e.target.value })}
          className="h-8 w-24 border-border bg-card font-mono text-xs tabular-nums"
        />
      </td>

      {/* Jours */}
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          {DAY_LABELS.map(({ dow, short }) => {
            const on = form.daysOfWeek.includes(dow)
            return (
              <button
                key={`d-${dow}`}
                type="button"
                onClick={() => toggleDay(dow)}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded border text-[10px] font-semibold transition',
                  on
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700'
                    : 'border-border bg-background/60 text-muted-foreground/70 hover:border-emerald-500/30 hover:text-emerald-700',
                )}
                aria-pressed={on}
                title={`Jour ${dow}`}
              >
                {short}
              </button>
            )
          })}
        </div>
      </td>

      {/* Numéros ops */}
      <td className="px-2 py-2">
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {contacts.length === 0 ? (
            <span className="text-[10px] text-muted-foreground/70">Aucun contact ops</span>
          ) : (
            contacts.map((c) => {
              const on = form.opsPhones.includes(c.phone)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => togglePhone(c.phone)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition',
                    on
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700'
                      : 'border-border bg-background/60 text-muted-foreground/70 hover:border-emerald-500/30 hover:text-emerald-700',
                  )}
                  title={`${c.name} · ${formatPhone(c.phone)}`}
                >
                  {on && <Check className="h-2.5 w-2.5" />}
                  <span className="max-w-[80px] truncate">{c.name}</span>
                </button>
              )
            })
          )}
        </div>
        <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/70">
          {form.opsPhones.length} sélectionné{form.opsPhones.length > 1 ? 's' : ''}
        </div>
      </td>

      {/* Actif */}
      <td className="px-2 py-2 text-center">
        <Switch
          checked={form.active}
          onCheckedChange={(checked) => patch({ active: checked })}
          aria-label="Activer ce quart"
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {saving && (
            <span className="text-[10px] text-muted-foreground/70">
              <Loader2 className="inline h-3 w-3 animate-spin" /> sauvegarde…
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:bg-rose-500/10 hover:text-rose-600"
            onClick={() => void handleDelete()}
            disabled={deleting}
            aria-label="Supprimer ce quart"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  )
}
