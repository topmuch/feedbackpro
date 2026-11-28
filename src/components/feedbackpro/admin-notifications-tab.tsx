"use client"

// ============================================================
// Task N1 — Centre de Notifications (SuperAdmin)
// ------------------------------------------------------------
// Onglet "Notifications" du dashboard Superadmin. Centralise :
//   - Section A : Canaux de communication (Email, WhatsApp, SMS Mtarget, Push PWA)
//                 avec toggle d'activation, dialog de config, bouton test
//   - Section B : Notifications par projet (6 onglets tenantType) — un switch
//                 principal + 5 pills de canaux (email, push_pwa, whatsapp,
//                 bell, sms_mtarget) par notification, mise à jour 1 clic
//   - Section C : Historique des envois (NotificationLog) — table filtrable
//
// Contrats API :
//   GET/POST /api/admin/notifications/settings  — canaux + config
//   GET/PATCH /api/admin/notifications          — templates groupés par tenant
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
  Volume2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
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

type NotificationTemplate = {
  id: string
  trigger: string
  label: string
  // Array of canal keys, e.g. ["email","push_pwa"]. The API serializes
  // the DB JSON column into a real array (see serializeTemplate / safeParseArray
  // in /api/admin/notifications/route.ts) — never a raw JSON string on the client.
  channels: string[]
  template: string
  recipient: string
  active: boolean
  tenantType?: string
  description?: string
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
  email: { label: "Email", icon: Mail, color: "text-[#3c3e4c]", desc: "Notifications par email (Resend / SendGrid)" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-[#a05f45]", desc: "WhatsApp Business API (Meta / Twilio)" },
  sms_mtarget: { label: "SMS Mtarget", icon: Smartphone, color: "text-[#a05f45]", desc: "SMS Mtarget (Afrique de l'Ouest) — 25 FCFA / SMS" },
  push_pwa: { label: "Push PWA", icon: Bell, color: "text-[#a05f45]", desc: "Web Push notifications (service worker)" },
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

const RECIPIENT_LABELS: Record<string, string> = {
  assigned_staff: "Employé assigné",
  terminal_staff: "Staff terminal",
  supervisor: "Superviseur / Manager",
}

const STATUS_COLOR: Record<string, string> = {
  sent: "bg-[#f3ddd2] text-[#8a4f3b] dark:bg-[#573125]/40 dark:text-[#dba28a]",
  delivered: "bg-[#dcdee0] text-[#2e3040] dark:bg-[#14152a]/40 dark:text-[#8e8e95]",
  read: "bg-[#f3ddd2] text-[#8a4f3b] dark:bg-[#573125]/40 dark:text-[#dba28a]",
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
      <SectionNotifications />
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
                          ? "bg-[#f3ddd2] text-[#8a4f3b] dark:bg-[#573125]/40 dark:text-[#dba28a]"
                          : "bg-[#f3ddd2] text-[#8a4f3b] dark:bg-[#573125]/40 dark:text-[#dba28a]",
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
            { key: "fromName", label: "Nom expéditeur", placeholder: "FeedVoice Alertes" },
            { key: "fromEmail", label: "Email expéditeur", placeholder: "alertes@feedvoice.sn" },
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
// Section B — Notifications par projet (per-project tabs)
// ------------------------------------------------------------
// Vue SuperAdmin : un onglet par tenantType (ville, aéroport,
// salon VIP, commerce, compagnie, plateforme). Chaque projet
// expose sa liste de notifications (trigger) avec :
//   - un switch principal (active)
//   - 5 pills de canaux (email, push_pwa, whatsapp, bell, sms_mtarget)
//   - le destinataire affiché en pied de carte
//
// Contrats API :
//   GET   /api/admin/notifications         → { templates, byTenant }
//   PATCH /api/admin/notifications         → { trigger, active? | channels? }
// ============================================================

type TenantKey = "city" | "airport" | "vip_lounge" | "classic" | "airline" | "platform"

const TENANT_META: Record<
  TenantKey,
  { label: string; emoji: string; color: string; desc: string }
> = {
  city: { label: "Ville Connectée", emoji: "🏛️", color: "#0026A3", desc: "Mairie, services urbains, voirie" },
  airport: { label: "Aéroport", emoji: "✈️", color: "#059669", desc: "Terminal, sécurité, ops aéroportuaires" },
  vip_lounge: { label: "Salon VIP", emoji: "🛋️", color: "#6B4C9A", desc: "Hospitalité, conciergerie, premium" },
  classic: { label: "Commerce", emoji: "🍽️", color: "#F97316", desc: "Restaurants, boutiques, retail" },
  airline: { label: "Compagnie", emoji: "🛩️", color: "#0891B2", desc: "Compagnie aérienne, équipage" },
  platform: { label: "Plateforme", emoji: "🌐", color: "#1A1A1A", desc: "SuperAdmin, monitoring global" },
}

const TENANT_ORDER: TenantKey[] = [
  "city",
  "airport",
  "vip_lounge",
  "classic",
  "airline",
  "platform",
]

const CANAL_PILLS: {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}[] = [
  { key: "email", label: "Email", icon: Mail, color: "#3B82F6" },
  { key: "push_pwa", label: "Push", icon: Smartphone, color: "#059669" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#25D366" },
  { key: "bell", label: "Bell", icon: Bell, color: "#F59E0B" },
  { key: "sms_mtarget", label: "SMS", icon: Volume2, color: "#8B5CF6" },
]

function SectionNotifications() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [byTenant, setByTenant] = useState<Record<string, NotificationTemplate[]>>({})
  const [activeTenant, setActiveTenant] = useState<string>("city")
  const [chargement, setChargement] = useState(true)
  const { toast } = useToast()

  const charger = useCallback(async () => {
    setChargement(true)
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" })
      const json = await res.json()
      if (json?.ok) {
        setTemplates(json.data.templates)
        setByTenant(json.data.byTenant)
      } else {
        toast({
          title: "Erreur",
          description: json?.error ?? "Chargement impossible",
          variant: "destructive",
        })
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

  const updateTemplate = useCallback(
    (trigger: string, patch: Partial<NotificationTemplate>) => {
      setTemplates((prev) => prev.map((t) => (t.trigger === trigger ? { ...t, ...patch } : t)))
      setByTenant((prev) => {
        const next: Record<string, NotificationTemplate[]> = {}
        for (const [k, arr] of Object.entries(prev)) {
          next[k] = arr.map((t) => (t.trigger === trigger ? { ...t, ...patch } : t))
        }
        return next
      })
    },
    [],
  )

  const handleToggle = useCallback(
    async (trigger: string, field: "active" | "channels", value: boolean | string[]) => {
      // Optimistic update — `channels` is stored as a real array in state.
      const patch: Partial<NotificationTemplate> =
        field === "active"
          ? { active: value as boolean }
          : { channels: value as string[] }
      updateTemplate(trigger, patch)

      try {
        const res = await fetch("/api/admin/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger, [field]: value }),
        })
        const json = await res.json()
        if (!json?.ok) {
          // Rollback via re-fetch
          charger()
          toast({
            title: "Erreur",
            description: json?.error ?? "Échec mise à jour",
            variant: "destructive",
          })
        } else {
          toast({ title: "Notification mise à jour" })
        }
      } catch {
        charger()
        toast({ title: "Erreur", description: "Réseau injoignable", variant: "destructive" })
      }
    },
    [charger, toast, updateTemplate],
  )

  const toggleCanalInCard = useCallback(
    (t: NotificationTemplate, canal: string) => {
      const current = t.channels
      const next = current.includes(canal)
        ? current.filter((c) => c !== canal)
        : [...current, canal]
      handleToggle(t.trigger, "channels", next)
    },
    [handleToggle],
  )

  const activeTenantKey = (
    TENANT_ORDER.includes(activeTenant as TenantKey) ? activeTenant : "city"
  ) as TenantKey
  const listeActive: NotificationTemplate[] = byTenant[activeTenantKey] ?? []

  return (
    <section aria-labelledby="titre-notifs" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            id="titre-notifs"
            className="flex items-center gap-2 text-lg font-semibold text-foreground"
          >
            <Bell className="h-5 w-5 text-primary" aria-hidden />
            Notifications par projet
          </h2>
          <p className="text-sm text-muted-foreground">
            Activez et orchestrez les notifications pour chaque projet (ville, aéroport, salon
            VIP…). Un clic par toggle.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={charger}
          aria-label="Rafraîchir les notifications"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/* Onglets projets — chips scrollables horizontalement */}
      <div role="tablist" aria-label="Projets" className="flex gap-2 overflow-x-auto px-1 pb-2">
        {TENANT_ORDER.map((key) => {
          const meta = TENANT_META[key]
          const active = activeTenantKey === key
          const count = byTenant[key]?.length ?? 0
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTenant(key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-border bg-background text-foreground hover:bg-muted/60",
              )}
              style={active ? { backgroundColor: meta.color } : undefined}
            >
              <span aria-hidden>{meta.emoji}</span>
              <span>{meta.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Bandeau projet actif */}
      <div
        className="flex items-center gap-3 rounded-xl border p-3"
        style={{
          borderColor: `${TENANT_META[activeTenantKey].color}33`,
          backgroundColor: `${TENANT_META[activeTenantKey].color}0D`,
        }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: TENANT_META[activeTenantKey].color }}
          aria-hidden
        >
          <span className="text-base">{TENANT_META[activeTenantKey].emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {TENANT_META[activeTenantKey].label}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {TENANT_META[activeTenantKey].desc} — {listeActive.length} notification(s)
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {templates.length} total
        </Badge>
      </div>

      {/* Cartes de notifications */}
      {chargement ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : listeActive.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {listeActive.map((t) => (
            <NotificationCard
              key={t.id ?? t.trigger}
              template={t}
              tenantKey={activeTenantKey}
              onToggleActive={(v) => handleToggle(t.trigger, "active", v)}
              onToggleCanal={(canal) => toggleCanalInCard(t, canal)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucune notification configurée pour ce projet.
          </CardContent>
        </Card>
      )}
    </section>
  )
}

// ---------- Carte de notification (1 trigger, 1 projet) ----------

function NotificationCard({
  template,
  tenantKey,
  onToggleActive,
  onToggleCanal,
}: {
  template: NotificationTemplate
  tenantKey: TenantKey
  onToggleActive: (v: boolean) => void
  onToggleCanal: (canal: string) => void
}) {
  const tenant = TENANT_META[tenantKey]
  const channels = template.channels
  const desc =
    template.description?.trim() || TRIGGER_META[template.trigger]?.desc || template.trigger
  const recipientLabel =
    RECIPIENT_LABELS[template.recipient] ?? template.recipient ?? "—"

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 transition-opacity",
        template.active ? "" : "opacity-70",
      )}
      style={{ borderLeftColor: tenant.color }}
    >
      <CardContent className="space-y-3 p-4">
        {/* Ligne 1 : Switch principal + label + description */}
        <div className="flex items-start gap-3">
          <div className="pt-0.5">
            <Switch
              id={`notif-active-${template.trigger}`}
              checked={template.active}
              onCheckedChange={onToggleActive}
              aria-label={`Activer la notification ${template.label}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-semibold leading-tight"
              style={{ color: tenant.color }}
            >
              {template.label}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>

        {/* Ligne 2 : Pills de canaux */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Canaux
          </p>
          <div className="flex flex-wrap gap-2">
            {CANAL_PILLS.map((c) => {
              const on = channels.includes(c.key)
              const Icon = c.icon
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onToggleCanal(c.key)}
                  aria-pressed={on}
                  aria-label={`${c.label} ${on ? "activé" : "désactivé"}`}
                  title={`${c.label} ${on ? "(activé)" : "(désactivé)"}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                    on
                      ? "border-transparent text-white shadow-sm"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
                  )}
                  style={on ? { backgroundColor: c.color } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  <span>{c.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Ligne 3 : Destinataire */}
        <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <span className="font-medium">Destinataire:</span>
          <span>{recipientLabel}</span>
        </div>
      </CardContent>
    </Card>
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
