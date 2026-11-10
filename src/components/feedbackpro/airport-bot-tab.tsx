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

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
    </div>
  )
}
