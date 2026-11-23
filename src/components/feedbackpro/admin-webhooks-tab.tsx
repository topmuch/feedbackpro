"use client"

// ============================================================
// Task F3 — Marketplace Webhooks (SuperAdmin)
// ------------------------------------------------------------
// Composant premium pour piloter les webhooks sortants vers les
// intégrations tierces (Slack, Microsoft Teams, Zapier, Make.com,
// n8n, IFTTT, etc.).
//
// Sections :
//   A. Tableau des webhooks (name, URL, events, status, actions)
//   B. Formulaire de création (name, URL, event checkboxes)
//   C. Bouton "Tester" — envoie un payload de test
//   D. Bouton "Supprimer" + toggle actif/inactif
//
// Contrats :
//   GET    /api/admin/webhooks            → { webhooks, availableEvents }
//   POST   /api/admin/webhooks            → { webhook }
//   DELETE /api/admin/webhooks/[id]       → { deleted: true }
//   PATCH  /api/admin/webhooks/[id]       → { webhook }
//   POST   /api/admin/webhooks/test       → { sent, status, error? }
//
// Style : V2.0 — cartes blanches, coins arrondis, palette neutre
// + badges colorés par statut, scrollable list (max-h-96), custom
// scrollbar.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Power,
  ExternalLink,
  Bell,
  CheckCheck,
  TrendingUp,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/components/feedbackpro/shared"

// ---------- Types (mirroir des réponses API) ----------

type WebhookRow = {
  id: string
  name: string
  url: string
  events: string[]
  active: boolean
  createdAt: string
}

type ListResponse = {
  webhooks: WebhookRow[]
  availableEvents: string[]
}

// ---------- Meta des événements (label + icône + couleur) ----------

const EVENT_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  new_incident: { label: "Nouvel incident", icon: Bell, color: "bg-rose-100 text-rose-700 border-rose-200" },
  resolved: { label: "Résolu", icon: CheckCheck, color: "bg-[#f3ddd2] text-[#8a4f3b] border-[#e7c1ae]" },
  escalation: { label: "Escalade SLA", icon: AlertTriangle, color: "bg-[#f3ddd2] text-[#8a4f3b] border-[#e7c1ae]" },
  prediction_alert: { label: "Alerte prédiction IA", icon: TrendingUp, color: "bg-[#f3ddd2] text-[#8a4f3b] border-[#e7c1ae]" },
}

const FALLBACK_META = { label: "Événement", icon: Bell, color: "bg-slate-100 text-slate-700 border-slate-200" }

// ============================================================
// Composant principal exporté
// ============================================================

export function AdminWebhooksTab() {
  const { toast } = useToast()
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [availableEvents, setAvailableEvents] = useState<string[]>([
    "new_incident",
    "resolved",
    "escalation",
    "prediction_alert",
  ])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Formulaire création
  const [formName, setFormName] = useState("")
  const [formUrl, setFormUrl] = useState("")
  const [formEvents, setFormEvents] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  // ---------- Chargeur ----------
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/webhooks", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        const data = json.data as ListResponse
        setWebhooks(data.webhooks)
        if (Array.isArray(data.availableEvents) && data.availableEvents.length > 0) {
          setAvailableEvents(data.availableEvents)
        }
      } else {
        toast({
          title: "Erreur",
          description: json.error ?? "Impossible de charger les webhooks",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Impossible de joindre le serveur",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  // ---------- Actions ----------

  const resetForm = () => {
    setFormName("")
    setFormUrl("")
    setFormEvents([])
  }

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast({ title: "Nom requis", variant: "destructive" })
      return
    }
    if (!formUrl.trim()) {
      toast({ title: "URL requise", variant: "destructive" })
      return
    }
    if (formEvents.length === 0) {
      toast({ title: "Sélectionnez au moins un événement", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), url: formUrl.trim(), events: formEvents }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({
          title: "Webhook créé",
          description: `${json.data.webhook.name} — ${formEvents.length} événement(s) abonné(s)`,
        })
        setCreateOpen(false)
        resetForm()
        load()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Création impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le webhook "${name}" ?`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Webhook supprimé", description: name })
        load()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Suppression impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggle = async (id: string, current: boolean) => {
    setTogglingId(id)
    try {
      const res = await fetch(`/api/admin/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !current }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({
          title: !current ? "Webhook activé" : "Webhook désactivé",
        })
        load()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Mise à jour impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setTogglingId(null)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      const res = await fetch("/api/admin/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (json.ok) {
        const data = json.data as { sent: boolean; status?: number; error?: string }
        if (data.sent) {
          toast({
            title: "Test réussi",
            description: `HTTP ${data.status ?? 200} — webhook joignable`,
          })
        } else {
          toast({
            title: "Test échoué",
            description: data.error ?? `HTTP ${data.status ?? 0}`,
            variant: "destructive",
          })
        }
      } else {
        toast({ title: "Erreur", description: json.error ?? "Test impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setTestingId(null)
    }
  }

  const toggleFormEvent = (ev: string) => {
    setFormEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]))
  }

  // ---------- Rendu ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Marketplace Intégrations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Webhooks sortants vers Slack, Microsoft Teams, Zapier, Make.com, n8n…
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Rafraîchir
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-slate-900 hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Nouveau webhook
          </Button>
        </div>
      </div>

      {/* KPI résumé */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Total webhooks"
          value={webhooks.length}
          icon={WebhookIcon}
        />
        <SummaryCard
          label="Actifs"
          value={webhooks.filter((w) => w.active).length}
          icon={CheckCircle2}
          tone="emerald"
        />
        <SummaryCard
          label="Inactifs"
          value={webhooks.filter((w) => !w.active).length}
          icon={XCircle}
          tone="slate"
        />
        <SummaryCard
          label="Événements abonnés"
          value={new Set(webhooks.flatMap((w) => w.events)).size}
          icon={Bell}
          tone="violet"
        />
      </div>

      {/* Tableau */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <WebhookIcon className="size-4 text-slate-500" />
            Endpoints configurés
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Chaque endpoint reçoit un POST JSON pour les événements auxquels il est abonné.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-slate-100">
                <WebhookIcon className="size-6 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Aucun webhook configuré</p>
                <p className="mt-1 text-xs text-slate-500">
                  Créez votre premier webhook pour recevoir les événements FeedVoice dans Slack, Teams, Zapier…
                </p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-2">
                <Plus className="size-4" />
                Créer un webhook
              </Button>
            </div>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nom</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">URL</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Événements</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((w) => (
                    <TableRow key={w.id} className="border-slate-100">
                      <TableCell className="font-medium text-slate-900">{w.name}</TableCell>
                      <TableCell className="max-w-[18rem]">
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-slate-600 hover:text-slate-900 hover:underline"
                          title={w.url}
                        >
                          <span className="truncate">{w.url}</span>
                          <ExternalLink className="size-3 shrink-0 text-slate-400" />
                        </a>
                        <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(w.createdAt)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {w.events.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            w.events.map((ev) => {
                              const meta = EVENT_META[ev] ?? FALLBACK_META
                              const Icon = meta.icon
                              return (
                                <Badge
                                  key={ev}
                                  variant="outline"
                                  className={`gap-1 text-[10px] ${meta.color}`}
                                >
                                  <Icon className="size-3" />
                                  {meta.label}
                                </Badge>
                              )
                            })
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {w.active ? (
                          <Badge className="gap-1 bg-[#faf1ec] text-[#8a4f3b] border border-[#e7c1ae]">
                            <span className="size-1.5 rounded-full bg-[#bc7155]" />
                            Actif
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="size-1.5 rounded-full bg-slate-400" />
                            Inactif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTest(w.id)}
                            disabled={testingId === w.id}
                            className="gap-1 text-xs"
                            title="Envoyer un payload de test"
                          >
                            {testingId === w.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            Tester
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggle(w.id, w.active)}
                            disabled={togglingId === w.id}
                            className="gap-1 text-xs"
                            title={w.active ? "Désactiver" : "Activer"}
                          >
                            {togglingId === w.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Power className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(w.id, w.name)}
                            disabled={deletingId === w.id}
                            className="gap-1 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            title="Supprimer"
                          >
                            {deletingId === w.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4" />
              Nouveau webhook
            </DialogTitle>
            <DialogDescription>
              Les intégrations recevront un POST JSON pour chaque événement coché.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nom */}
            <div className="space-y-1.5">
              <Label htmlFor="wh-name" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Nom <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="wh-name"
                placeholder="Slack #ops-aeroport"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={80}
              />
              <p className="text-[11px] text-slate-400">
                Libellé affiché dans la liste (ex: « Slack #ops », « Teams NOC »…)
              </p>
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <Label htmlFor="wh-url" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                URL du webhook <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="wh-url"
                type="url"
                placeholder="https://hooks.slack.com/services/T…/B…/…"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
              <p className="text-[11px] text-slate-400">
                URL HTTPS fournie par Slack / Teams / Zapier / Make / n8n…
              </p>
            </div>

            {/* Événements */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Événements à recevoir <span className="text-rose-500">*</span>
              </Label>
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                {availableEvents.map((ev) => {
                  const meta = EVENT_META[ev] ?? FALLBACK_META
                  const Icon = meta.icon
                  const checked = formEvents.includes(ev)
                  return (
                    <label
                      key={ev}
                      htmlFor={`ev-${ev}`}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                        checked
                          ? "border-slate-400 bg-white shadow-sm"
                          : "border-transparent hover:bg-white"
                      }`}
                    >
                      <Checkbox
                        id={`ev-${ev}`}
                        checked={checked}
                        onCheckedChange={() => toggleFormEvent(ev)}
                      />
                      <Icon className="size-4 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{meta.label}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{ev}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2 bg-slate-900 hover:bg-slate-800">
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Créer le webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Sous-composants
// ============================================================

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone?: "slate" | "emerald" | "violet"
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]",
    violet: "bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]",
  }
  return (
    <Card className={`border ${tones[tone]} shadow-sm`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/80">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
