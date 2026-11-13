"use client"

// ============================================================
// Task N1 — Centre de Notifications (SuperAdmin)
// ------------------------------------------------------------
// Onglet "Notifications" du dashboard Superadmin. Centralise :
//   - Section A : Canaux de communication (Email, WhatsApp, SMS Mtarget, Push PWA)
//                 avec toggle d'activation, dialog de config, bouton test
//   - Section B : Templates & déclencheurs (5 triggers) — éditeur avec
//                 variables {STAFF_NOM}, {ZONE}, … et sélection des canaux
//   - Section C : Historique des envois (NotificationLog) — table filtrable
//
// Contrats API :
//   GET/POST /api/admin/notifications/settings  — canaux + config
//   GET/POST /api/admin/notifications/templates — templates par trigger
//   GET      /api/admin/notifications/logs      — historique paginé
//   POST     /api/admin/notifications/test      — envoi test d'un canal
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Mail,
  MessageCircle,
  Smartphone,
  Bell,
  Settings,
  TestTube,
  Check,
  X,
  AlertTriangle,
  Send,
  RefreshCw,
  Loader2,
  Save,
  Plus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ---------- Types (contrats API) ----------

type Canal = "email" | "whatsapp" | "sms_mtarget" | "push_pwa"

type NotificationSettingApi = {
  id: string
  canal: Canal
  active: boolean
  config: Record<string, unknown>
  updatedAt: string
}

type NotificationTemplateApi = {
  id: string
  trigger: string
  label: string
  channels: string[]
  template: string
  recipient: "assigned_staff" | "terminal_staff" | "supervisor"
  active: boolean
  updatedAt: string
}

type NotificationLogApi = {
  id: string
  trigger: string
  canal: string
  recipient: string
  status: "sent" | "failed" | "delivered" | "read"
  message: string | null
  cost: number | null
  reportId: string | null
  createdAt: string
}

// ---------- Constantes UI ----------

const CANAL_META: Record<
  Canal,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; desc: string }
> = {
  email: { label: "Email", icon: Mail, color: "text-blue-600", desc: "Notifications par email (Resend / SendGrid)" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-green-600", desc: "WhatsApp Business API (Meta / Twilio)" },
  sms_mtarget: { label: "SMS Mtarget", icon: Smartphone, color: "text-amber-600", desc: "SMS Mtarget (Afrique de l'Ouest) — 25 FCFA / SMS" },
  push_pwa: { label: "Push PWA", icon: Bell, color: "text-purple-600", desc: "Web Push notifications (service worker)" },
}

const CANAL_ORDER: Canal[] = ["email", "sms_mtarget", "whatsapp", "push_pwa"]

const TRIGGER_META: Record<
  string,
  { label: string; desc: string; urgency: "low" | "medium" | "high" | "critical" }
> = {
  new_incident: { label: "Nouvel Incident", desc: "Déclenché à la création d'un signalement voyageur", urgency: "medium" },
  assigned: { label: "Prise en charge", desc: "Quand un employé prend en charge un incident", urgency: "low" },
  resolved: { label: "Résolution", desc: "Quand un incident est marqué comme résolu", urgency: "low" },
  escalation_15min: { label: "Escalade 15 min", desc: "Incident non résolu depuis 15 minutes", urgency: "high" },
  escalation_30min: { label: "Escalade 30 min", desc: "Incident non résolu depuis 30 minutes (critique)", urgency: "critical" },
}

const VARIABLES = ["{STAFF_NOM}", "{INCIDENT_ID}", "{ZONE}", "{TYPE}", "{LIEN_DIRECT}", "{HEURE}", "{TEMPS}"] as const

const RECIPIENT_LABELS: Record<string, string> = {
  assigned_staff: "Employé assigné",
  terminal_staff: "Staff terminal",
  supervisor: "Superviseur / Manager",
}

const URGENCY_COLOR: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

const STATUS_COLOR: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  delivered: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  read: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

const STATUS_LABEL: Record<string, string> = {
  sent: "Envoyé",
  delivered: "Délivré",
  read: "Lu",
  failed: "Échec",
}

const CANAL_LABEL_COURT: Record<string, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms_mtarget: "SMS",
  push_pwa: "Push",
}

// ---------- Helpers ----------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return iso
  }
}

// ============================================================
// Composant principal — AdminNotificationsTab
// ============================================================

export function AdminNotificationsTab() {
  return (
    <div className="space-y-6">
      <SectionCanaux />
      <SectionTemplates />
      <SectionHistorique />
    </div>
  )
}

// ============================================================
// Section A — Canaux de Communication
// ============================================================

function SectionCanaux() {
  const [settings, setSettings] = useState<NotificationSettingApi[] | null>(null)
  const [chargement, setChargement] = useState(true)
  const [canalEnEdition, setCanalEnEdition] = useState<Canal | null>(null)
  const [testsEnCours, setTestsEnCours] = useState<Set<Canal>>(new Set())
  const { toast } = useToast()

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const res = await fetch("/api/admin/notifications/settings", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        // Réordonne selon CANAL_ORDER
        const liste: NotificationSettingApi[] = json.data.settings
        const ordonnee = CANAL_ORDER.map((c) => liste.find((s) => s.canal === c)).filter(
          Boolean,
        ) as NotificationSettingApi[]
        setSettings(ordonnee)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Chargement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    } finally {
      setChargement(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  async function basculerCanal(canal: Canal, active: boolean) {
    if (!settings) return
    const setting = settings.find((s) => s.canal === canal)
    if (!setting) return
    // Optimistic UI
    setSettings((prev) =>
      prev ? prev.map((s) => (s.canal === canal ? { ...s, active } : s)) : prev,
    )
    try {
      const res = await fetch("/api/admin/notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, active, config: setting.config }),
      })
      const json = await res.json()
      if (!json.ok) {
        // Rollback
        setSettings((prev) =>
          prev ? prev.map((s) => (s.canal === canal ? { ...s, active: !active } : s)) : prev,
        )
        toast({ title: "Erreur", description: json.error ?? "Échec sauvegarde", variant: "destructive" })
      } else {
        toast({
          title: `${CANAL_META[canal].label} ${active ? "activé" : "désactivé"}`,
          description: active ? "Le canal reçoit désormais les notifications" : "Aucune notification ne partira via ce canal",
        })
      }
    } catch {
      setSettings((prev) =>
        prev ? prev.map((s) => (s.canal === canal ? { ...s, active: !active } : s)) : prev,
      )
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    }
  }

  async function testerCanal(canal: Canal) {
    setTestsEnCours((prev) => new Set(prev).add(canal))
    try {
      const res = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal }),
      })
      const json = await res.json()
      if (json.ok && json.data?.sent) {
        toast({
          title: `Test ${CANAL_META[canal].label} réussi`,
          description: json.data.note ?? `Notification envoyée à ${json.data.recipient ?? "—"}`,
        })
      } else if (json.ok && json.data?.sent === false) {
        toast({
          title: `Test ${CANAL_META[canal].label} simulé`,
          description: json.data.note ?? "Canal non branché",
        })
      } else {
        toast({
          title: `Test ${CANAL_META[canal].label} échoué`,
          description: json.error ?? "Erreur inconnue",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    } finally {
      setTestsEnCours((prev) => {
        const next = new Set(prev)
        next.delete(canal)
        return next
      })
    }
  }

  async function sauverConfig(canal: Canal, nouvelleConfig: Record<string, unknown>) {
    const setting = settings?.find((s) => s.canal === canal)
    if (!setting) return
    try {
      const res = await fetch("/api/admin/notifications/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, active: setting.active, config: nouvelleConfig }),
      })
      const json = await res.json()
      if (json.ok) {
        setSettings((prev) =>
          prev ? prev.map((s) => (s.canal === canal ? { ...s, config: nouvelleConfig } : s)) : prev,
        )
        toast({ title: "Configuration enregistrée", description: `${CANAL_META[canal].label} mis à jour` })
        setCanalEnEdition(null)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Échec sauvegarde", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    }
  }

  return (
    <section aria-labelledby="titre-canaux" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="titre-canaux" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Send className="h-5 w-5 text-primary" aria-hidden />
            Canaux de Communication
          </h2>
          <p className="text-sm text-muted-foreground">
            Activez et configurez les canaux par lesquels les notifications transitent (Email, SMS Mtarget, WhatsApp, Push PWA).
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={charger} aria-label="Rafraîchir les canaux">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {chargement ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(settings ?? []).map((s) => {
            const meta = CANAL_META[s.canal]
            const Icone = meta.icon
            const enTest = testsEnCours.has(s.canal)
            return (
              <Card key={s.canal} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 rounded-xl bg-muted/50 p-2", meta.color)}>
                        <Icone className="h-5 w-5" aria-hidden />
                      </div>
                      <div>
                        <CardTitle className="text-base">{meta.label}</CardTitle>
                        <CardDescription className="text-xs">{meta.desc}</CardDescription>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        s.active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                      )}
                    >
                      {s.active ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" aria-hidden /> Actif
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden /> Désactivé
                        </span>
                      )}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <Label htmlFor={`switch-${s.canal}`} className="text-xs text-muted-foreground">
                      {s.active ? "Canal opérationnel" : "Canal en pause"}
                    </Label>
                    <Switch
                      id={`switch-${s.canal}`}
                      checked={s.active}
                      onCheckedChange={(v) => basculerCanal(s.canal, v)}
                      aria-label={`Activer le canal ${meta.label}`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setCanalEnEdition(s.canal)}
                    >
                      <Settings className="h-3.5 w-3.5" aria-hidden /> Configurer
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => testerCanal(s.canal)}
                      disabled={enTest}
                    >
                      {enTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <TestTube className="h-3.5 w-3.5" aria-hidden />}
                      Tester
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {canalEnEdition && (
        <DialogConfigCanal
          canal={canalEnEdition}
          config={settings?.find((s) => s.canal === canalEnEdition)?.config ?? {}}
          onClose={() => setCanalEnEdition(null)}
          onSave={(cfg) => sauverConfig(canalEnEdition, cfg)}
        />
      )}
    </section>
  )
}

// ---------- Dialog de configuration d'un canal ----------

function DialogConfigCanal({
  canal,
  config,
  onClose,
  onSave,
}: {
  canal: Canal
  config: Record<string, unknown>
  onClose: () => void
  onSave: (cfg: Record<string, unknown>) => void
}) {
  const meta = CANAL_META[canal]
  const Icone = meta.icon
  // Édition locale des champs (clé → valeur string)
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const [k, v] of Object.entries(config)) {
      init[k] = typeof v === "string" ? v : JSON.stringify(v)
    }
    return init
  })
  const [enregistrement, setEnregistrement] = useState(false)

  // Champs affichés par canal (libellé + placeholder + type)
  const champs: { key: string; label: string; placeholder: string; type?: "password" | "text" }[] =
    canal === "sms_mtarget"
      ? [
          { key: "endpoint", label: "Endpoint API", placeholder: "https://api.mtarget.sn/v1/sms/send" },
          { key: "login", label: "Login Mtarget", placeholder: "votre-login" },
          { key: "password", label: "Mot de passe", placeholder: "••••••••", type: "password" },
          { key: "senderId", label: "Sender ID", placeholder: "FBKPRO" },
          { key: "defaultCountryCode", label: "Indicatif par défaut", placeholder: "221" },
          { key: "testPhone", label: "Numéro de test", placeholder: "22177000000" },
        ]
      : canal === "email"
        ? [
            { key: "provider", label: "Provider", placeholder: "resend | sendgrid" },
            { key: "fromName", label: "Nom expéditeur", placeholder: "FeedbackPro Alertes" },
            { key: "fromEmail", label: "Email expéditeur", placeholder: "alertes@feedbackpro.sn" },
            { key: "apiKey", label: "Clé API", placeholder: "re_… / SG.…", type: "password" },
          ]
        : canal === "whatsapp"
          ? [
              { key: "provider", label: "Provider", placeholder: "meta | twilio" },
              { key: "phoneNumberId", label: "Phone Number ID (Meta)", placeholder: "1029384756" },
              { key: "templateId", label: "Template ID", placeholder: "incident_alert_staff" },
              { key: "accessToken", label: "Access Token", placeholder: "EAAB…", type: "password" },
            ]
          : canal === "push_pwa"
            ? [
                { key: "provider", label: "Provider", placeholder: "web-push | onesignal" },
                { key: "appId", label: "App ID (OneSignal)", placeholder: "os-xxxx-xxxx" },
                { key: "apiKey", label: "REST API Key", placeholder: "os_rest_…", type: "password" },
              ]
            : []

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (enregistrement) return
    setEnregistrement(true)
    const nouvelleConfig: Record<string, unknown> = { ...valeurs }
    // On préserve les champs non éditables (ex: provider par défaut si vidé)
    onSave(nouvelleConfig)
    setEnregistrement(false)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icone className={cn("h-4 w-4", meta.color)} aria-hidden />
            Configuration — {meta.label}
          </DialogTitle>
          <DialogDescription>
            {meta.desc}. Les modifications sont prises en compte immédiatement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enregistrer} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {champs.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <Label htmlFor={`cfg-${c.key}`} className="text-xs">
                  {c.label}
                </Label>
                <Input
                  id={`cfg-${c.key}`}
                  type={c.type ?? "text"}
                  placeholder={c.placeholder}
                  value={valeurs[c.key] ?? ""}
                  onChange={(e) => setValeurs({ ...valeurs, [c.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={enregistrement} className="gap-1.5">
              {enregistrement ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Section B — Templates & Déclencheurs
// ============================================================

function SectionTemplates() {
  const [templates, setTemplates] = useState<NotificationTemplateApi[] | null>(null)
  const [chargement, setChargement] = useState(true)
  const { toast } = useToast()

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const res = await fetch("/api/admin/notifications/templates", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setTemplates(json.data.templates)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Chargement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    } finally {
      setChargement(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  async function sauverTemplate(t: NotificationTemplateApi) {
    try {
      const res = await fetch("/api/admin/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: t.trigger,
          label: t.label,
          channels: t.channels,
          template: t.template,
          recipient: t.recipient,
          active: t.active,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setTemplates((prev) =>
          prev ? prev.map((p) => (p.trigger === t.trigger ? { ...p, ...t, updatedAt: json.data.template.updatedAt } : p)) : prev,
        )
        toast({ title: `Template « ${t.label} » enregistré`, description: `${t.channels.length} canal/canaux — destinataire: ${RECIPIENT_LABELS[t.recipient]}` })
      } else {
        toast({ title: "Erreur", description: json.error ?? "Échec sauvegarde", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    }
  }

  return (
    <section aria-labelledby="titre-templates" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="titre-templates" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Bell className="h-5 w-5 text-primary" aria-hidden />
            Templates & Déclencheurs
          </h2>
          <p className="text-sm text-muted-foreground">
            Personnalisez le message, les canaux et le destinataire pour chaque type d&apos;événement (5 déclencheurs).
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={charger} aria-label="Rafraîchir les templates">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {chargement ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : templates && templates.length > 0 ? (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <Accordion type="single" collapsible className="w-full">
              {templates.map((t) => {
                const meta = TRIGGER_META[t.trigger]
                return (
                  <AccordionItem key={t.trigger} value={t.trigger} className="border-b last:border-b-0">
                    <AccordionTrigger className="hover:no-underline px-2">
                      <div className="flex w-full items-center gap-3 pr-3">
                        <Badge className={cn("shrink-0", URGENCY_COLOR[meta?.urgency ?? "medium"])}>{meta?.urgency ?? "—"}</Badge>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {t.label}
                            {!t.active && <span className="ml-2 text-xs text-muted-foreground">(inactif)</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{meta?.desc ?? t.trigger}</p>
                        </div>
                        <div className="hidden shrink-0 gap-1 sm:flex">
                          {t.channels.map((c) => (
                            <Badge key={c} variant="outline" className="text-[10px]">
                              {CANAL_LABEL_COURT[c] ?? c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 pb-4">
                      <TemplateEditor template={t} onSave={sauverTemplate} />
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun template trouvé. Rechargez la page pour réinitialiser.
          </CardContent>
        </Card>
      )}
    </section>
  )
}

// ---------- Éditeur de template (à l'intérieur d'un AccordionItem) ----------

function TemplateEditor({
  template,
  onSave,
}: {
  template: NotificationTemplateApi
  onSave: (t: NotificationTemplateApi) => void
}) {
  const [label, setLabel] = useState(template.label)
  const [recipient, setRecipient] = useState(template.recipient)
  const [channels, setChannels] = useState<string[]>(template.channels)
  const [texte, setTexte] = useState(template.template)
  const [active, setActive] = useState(template.active)
  const [enregistrement, setEnregistrement] = useState(false)

  // Resync si le template change (ex: après refresh)
  useEffect(() => {
    setLabel(template.label)
    setRecipient(template.recipient)
    setChannels(template.channels)
    setTexte(template.template)
    setActive(template.active)
  }, [template])

  function toggleChannel(c: string) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  function insererVariable(v: string) {
    setTexte((prev) => prev + v)
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (enregistrement) return
    setEnregistrement(true)
    onSave({
      ...template,
      label: label.trim() || template.label,
      recipient,
      channels,
      template: texte,
      active,
    })
    setEnregistrement(false)
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4">
      {/* Ligne 1 : Label + Destinataire + Active */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`tpl-label-${template.trigger}`} className="text-xs">Libellé affiché</Label>
          <Input
            id={`tpl-label-${template.trigger}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`tpl-recipient-${template.trigger}`} className="text-xs">Destinataire</Label>
          <Select value={recipient} onValueChange={(v) => setRecipient(v as typeof recipient)}>
            <SelectTrigger id={`tpl-recipient-${template.trigger}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assigned_staff">Employé assigné</SelectItem>
              <SelectItem value="terminal_staff">Staff terminal</SelectItem>
              <SelectItem value="supervisor">Superviseur / Manager</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <Switch
              id={`tpl-active-${template.trigger}`}
              checked={active}
              onCheckedChange={setActive}
              aria-label="Template actif"
            />
            <Label htmlFor={`tpl-active-${template.trigger}`} className="text-xs text-muted-foreground">
              {active ? "Actif" : "Inactif"}
            </Label>
          </div>
        </div>
      </div>

      {/* Ligne 2 : Canaux (checkboxes) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Canaux utilisés pour ce template</Label>
        <div className="flex flex-wrap gap-4 rounded-lg bg-muted/30 p-3">
          {CANAL_ORDER.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={channels.includes(c)} onCheckedChange={() => toggleChannel(c)} aria-label={`Canal ${c}`} />
              <span className="text-foreground">{CANAL_META[c].label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Ligne 3 : Variables (boutons) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Variables disponibles (cliquez pour insérer)</Label>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] font-mono"
              onClick={() => insererVariable(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      {/* Ligne 4 : Template texte */}
      <div className="space-y-1.5">
        <Label htmlFor={`tpl-text-${template.trigger}`} className="text-xs">Message du template</Label>
        <Textarea
          id={`tpl-text-${template.trigger}`}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={3}
          className="font-mono text-sm"
          placeholder="Incident {TYPE} a {ZONE}. Lien : {LIEN_DIRECT}"
        />
        <p className="text-xs text-muted-foreground">
          Les variables non résolues sont remplacées par une chaîne vide.
        </p>
      </div>

      {/* Ligne 5 : Save */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={enregistrement} className="gap-1.5">
          {enregistrement ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Enregistrer le template
        </Button>
      </div>
    </form>
  )
}

// ============================================================
// Section C — Historique des envois
// ============================================================

function SectionHistorique() {
  const [logs, setLogs] = useState<NotificationLogApi[] | null>(null)
  const [total, setTotal] = useState(0)
  const [chargement, setChargement] = useState(true)
  const [filtreCanal, setFiltreCanal] = useState<string>("all")
  const [filtreStatus, setFiltreStatus] = useState<string>("all")
  const { toast } = useToast()

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" })
      if (filtreCanal !== "all") params.set("canal", filtreCanal)
      if (filtreStatus !== "all") params.set("status", filtreStatus)
      const res = await fetch(`/api/admin/notifications/logs?${params.toString()}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setLogs(json.data.logs)
        setTotal(json.data.total)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Chargement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
    } finally {
      setChargement(false)
    }
  }, [filtreCanal, filtreStatus, toast])

  useEffect(() => {
    charger()
  }, [charger])

  return (
    <section aria-labelledby="titre-historique" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="titre-historique" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" aria-hidden />
            Historique des envois
          </h2>
          <p className="text-sm text-muted-foreground">
            Audit des {total} dernières notifications envoyées (succès + échecs).
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={charger} aria-label="Rafraîchir l'historique">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="filtre-canal" className="text-xs text-muted-foreground">Canal</Label>
          <Select value={filtreCanal} onValueChange={setFiltreCanal}>
            <SelectTrigger id="filtre-canal" className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les canaux</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms_mtarget">SMS Mtarget</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="push_pwa">Push PWA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="filtre-status" className="text-xs text-muted-foreground">Statut</Label>
          <Select value={filtreStatus} onValueChange={setFiltreStatus}>
            <SelectTrigger id="filtre-status" className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="sent">Envoyé</SelectItem>
              <SelectItem value="delivered">Délivré</SelectItem>
              <SelectItem value="read">Lu</SelectItem>
              <SelectItem value="failed">Échec</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {chargement ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead>Déclencheur</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Destinataire</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id} className="text-sm">
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(l.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {TRIGGER_META[l.trigger]?.label ?? l.trigger}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {(() => {
                            const Icon = CANAL_META[l.canal as Canal]?.icon
                            return Icon ? <Icon className={cn("h-3.5 w-3.5", CANAL_META[l.canal as Canal]?.color)} aria-hidden /> : null
                          })()}
                          {CANAL_LABEL_COURT[l.canal] ?? l.canal}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate font-mono text-xs">
                        {l.recipient}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-[10px]", STATUS_COLOR[l.status] ?? "")}>
                          {l.status === "failed" ? (
                            <X className="mr-1 h-3 w-3" aria-hidden />
                          ) : (
                            <Check className="mr-1 h-3 w-3" aria-hidden />
                          )}
                          {STATUS_LABEL[l.status] ?? l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {l.cost != null && l.cost > 0 ? `${l.cost} FCFA` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Aucun envoi enregistré pour ces filtres.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

// ============================================================
// Export secondaire : icône pour la sidebar (utilisée par admin-dashboard)
// ============================================================

export { Bell as NotificationsIcon }
