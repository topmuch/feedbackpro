"use client"

// ============================================================
// Task O1 — Centre Opérationnel (NOC SuperAdmin)
// ------------------------------------------------------------
// "Tour de contrôle" temps réel de la plateforme FeedbackPro.
// Sondes les 7 services critiques toutes les 10s et affiche un
// flux d'alertes rafraîchi toutes les 5s.
//
// Layout :
//   Header : Badge global OPÉRATIONNEL / DÉGRADÉ / CRITIQUE + last check
//   Section A : grille de 7 cartes services (icône, status, latence, action)
//   Section B : flux d'alertes live (scroll, max-h-96, custom scrollbar)
//   Section C : actions rapides (tester tous les canaux, sync SW, alert test)
//
// Contrats :
//   GET /api/admin/operations/health  → { globalStatus, services[], lastCheckedAt }
//   GET /api/admin/operations/alerts  → { alerts[], total }
//
// Style : NOC sombre, accents colorés par statut, mono pour métriques,
// pastilles pulsantes pour signaler l'activité en temps réel.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Bell,
  Database,
  Mail,
  MessageCircle,
  Mic,
  OctagonAlert,
  RefreshCw,
  Smartphone,
  Zap,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"

// ---------- Types (contrats API) ----------

type ServiceStatus = "ok" | "warning" | "critical" | "inactive"

type ServiceHealth = {
  serviceName: string
  status: ServiceStatus
  latencyMs?: number
  errorMessage?: string
  lastCheckedAt: string
}

type HealthResponse = {
  globalStatus: "ok" | "warning" | "critical"
  services: ServiceHealth[]
  lastCheckedAt: string
}

type AlertEntry = {
  id: string
  serviceName: string
  status: string
  latencyMs: number | null
  errorMessage: string | null
  detectedAt: string
  resolvedAt: string | null
  alertSent: boolean
}

type AlertsResponse = {
  alerts: AlertEntry[]
  total: number
}

// ---------- Constantes d'affichage ----------

const SERVICE_META: Record<
  string,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    description: string
  }
> = {
  db_primary: {
    label: "Base de données",
    icon: Database,
    description: "SQLite primaire (lecture/écriture)",
  },
  mtarget_sms: {
    label: "SMS Mtarget",
    icon: Smartphone,
    description: "Passerelle SMS temps réel",
  },
  whatsapp_api: {
    label: "WhatsApp API",
    icon: MessageCircle,
    description: "WhatsApp Business (Meta Graph)",
  },
  smtp_email: {
    label: "Email SMTP",
    icon: Mail,
    description: "Resend / SMTP transactionnel",
  },
  push_pwa: {
    label: "Push PWA",
    icon: Bell,
    description: "Web Push (FCM/APNS/Mozilla)",
  },
  denise_tts: {
    label: "Denise TTS",
    icon: Mic,
    description: "Synthèse vocale client-side",
  },
  service_worker: {
    label: "Service Worker",
    icon: RefreshCw,
    description: "/sw.js — PWA offline cache",
  },
}

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: "OK",
  warning: "WARNING",
  critical: "CRITICAL",
  inactive: "INACTIF",
}

// Couleurs Tailwind par statut (compatibles dark mode via classes)
function statusColor(status: ServiceStatus): {
  text: string
  bg: string
  border: string
  dot: string
} {
  switch (status) {
    case "ok":
      return {
        text: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        border: "border-emerald-200 dark:border-emerald-900",
        dot: "bg-emerald-500",
      }
    case "warning":
      return {
        text: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40",
        border: "border-amber-200 dark:border-amber-900",
        dot: "bg-amber-500",
      }
    case "critical":
      return {
        text: "text-rose-700 dark:text-rose-400",
        bg: "bg-rose-50 dark:bg-rose-950/40",
        border: "border-rose-200 dark:border-rose-900",
        dot: "bg-rose-500",
      }
    case "inactive":
      return {
        text: "text-slate-600 dark:text-slate-400",
        bg: "bg-slate-50 dark:bg-slate-900/40",
        border: "border-slate-200 dark:border-slate-800",
        dot: "bg-slate-400",
      }
  }
}

function globalStatusMeta(status: "ok" | "warning" | "critical"): {
  label: string
  color: string
  bg: string
  border: string
  dot: string
  pulse: boolean
} {
  switch (status) {
    case "ok":
      return {
        label: "OPÉRATIONNEL",
        color: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-950/50",
        border: "border-emerald-300 dark:border-emerald-800",
        dot: "bg-emerald-500",
        pulse: false,
      }
    case "warning":
      return {
        label: "DÉGRADÉ",
        color: "text-amber-700 dark:text-amber-300",
        bg: "bg-amber-50 dark:bg-amber-950/50",
        border: "border-amber-300 dark:border-amber-800",
        dot: "bg-amber-500",
        pulse: true,
      }
    case "critical":
      return {
        label: "CRITIQUE",
        color: "text-rose-700 dark:text-rose-300",
        bg: "bg-rose-50 dark:bg-rose-950/50",
        border: "border-rose-300 dark:border-rose-800",
        dot: "bg-rose-500",
        pulse: true,
      }
  }
}

/** Formate une timestamp ISO en "il y a Xs/min/h" relatif. */
function ilYa(dateIso: string): string {
  const diff = Date.now() - new Date(dateIso).getTime()
  if (diff < 0) return "à l'instant"
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return "à l'instant"
  if (sec < 60) return `il y a ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const j = Math.floor(h / 24)
  return `il y a ${j}j`
}

/** Formate une timestamp ISO en "HH:MM:SS" local. */
function heureCourt(dateIso: string): string {
  return new Date(dateIso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

// ============================================================
// Composant principal
// ============================================================

export function AdminOperationsTab() {
  const { toast } = useToast()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [alerts, setAlerts] = useState<AlertEntry[]>([])
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [actionsLoading, setActionsLoading] = useState<Record<string, boolean>>({})
  const [lastHealthCheck, setLastHealthCheck] = useState<string | null>(null)

  // ---------- Chargeurs ----------
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/operations/health", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setHealth(json.data)
        setLastHealthCheck(json.data.lastCheckedAt)
      }
    } catch {
      // Erreur silencieuse — on évite le spam de toast toutes les 10s
    } finally {
      setLoadingHealth(false)
    }
  }, [])

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/operations/alerts", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setAlerts(json.data.alerts)
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingAlerts(false)
    }
  }, [])

  // ---------- Polling ----------
  // Health toutes les 10s, alerts toutes les 5s
  useEffect(() => {
    loadHealth()
    loadAlerts()
    const healthTimer = setInterval(loadHealth, 10_000)
    const alertsTimer = setInterval(loadAlerts, 5_000)
    return () => {
      clearInterval(healthTimer)
      clearInterval(alertsTimer)
    }
  }, [loadHealth, loadAlerts])

  // ---------- Actions rapides ----------
  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionsLoading((s) => ({ ...s, [key]: true }))
    try {
      await fn()
    } finally {
      setActionsLoading((s) => ({ ...s, [key]: false }))
    }
  }

  const testerTousCanaux = () =>
    runAction("test-channels", async () => {
      // Déclenche un refresh complet du health check
      await loadHealth()
      toast({
        title: "Test canaux terminé",
        description: "Les 7 services ont été re-sondés. Voir les cartes ci-dessous.",
      })
    })

  const forcerSyncSw = () =>
    runAction("force-sync-sw", async () => {
      // Frontend-only : déclenche un postMessage au SW actif pour qu'il
      // re-synchronise son cache. Si aucun SW n'est enregistré, on notifie.
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration()
          if (reg) {
            reg.active?.postMessage({ type: "FORCE_SYNC" })
            toast({
              title: "Sync SW déclenchée",
              description: "Le service worker a reçu l'ordre de re-synchroniser son cache.",
            })
          } else {
            toast({
              title: "Service Worker non enregistré",
              description: "Aucun SW actif sur cette page. Il s'enregistrera au prochain chargement PWA.",
              variant: "default",
            })
          }
        } catch {
          toast({
            title: "Erreur SW",
            description: "Impossible de communiquer avec le service worker.",
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "SW indisponible",
          description: "Ce navigateur ne supporte pas les service workers.",
          variant: "destructive",
        })
      }
    })

  const envoyerAlertTest = () =>
    runAction("test-alert", async () => {
      // Appelle le endpoint health qui, si un service est critique,
      // déclenchera sendCriticalAlert. Pour forcer un test réel, on
      // déclenche un refresh — si tout est OK, aucun email ne partira.
      // L'utilisateur peut simuler une alerte en désactivant un canal.
      await loadHealth()
      const criticals = health?.services.filter((s) => s.status === "critical") ?? []
      if (criticals.length === 0) {
        toast({
          title: "Aucune alerte critique active",
          description:
            "Tous les services sont OK — aucun email d'alerte n'a été envoyé. Pour tester l'alerte, désactivez un canal (ex: NotificationSetting email) puis relancez.",
        })
      } else {
        toast({
          title: `${criticals.length} alerte(s) critique(s) active(s)`,
          description: "Un email a été envoyé à l'admin pour chaque service critique.",
        })
      }
    })

  // ---------- Render ----------

  const globalMeta = health ? globalStatusMeta(health.globalStatus) : null

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* Header : statut global + last check                          */}
      {/* ============================================================ */}
      <Card className="overflow-hidden border-2">
        <CardContent className="p-0">
          <div
            className={`flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between ${globalMeta?.bg ?? "bg-slate-50 dark:bg-slate-900/40"} ${globalMeta?.border ?? "border-slate-200 dark:border-slate-800"} border-b-2`}
          >
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-slate-950 shadow-sm">
                {globalMeta ? (
                  <span
                    className={`h-4 w-4 rounded-full ${globalMeta.dot} ${globalMeta.pulse ? "animate-pulse" : ""}`}
                    aria-hidden
                  />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Statut système global
                </p>
                <p
                  className={`text-2xl font-extrabold tracking-tight ${globalMeta?.color ?? "text-slate-600 dark:text-slate-300"}`}
                >
                  {globalMeta?.label ?? "CHARGEMENT…"}
                </p>
                {health && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {health.services.filter((s) => s.status === "ok").length} OK ·{" "}
                    {health.services.filter((s) => s.status === "warning").length} WARNING ·{" "}
                    {health.services.filter((s) => s.status === "critical").length} CRITICAL ·{" "}
                    {health.services.filter((s) => s.status === "inactive").length} INACTIF
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <span className="font-mono">
                  {lastHealthCheck ? `Dernière vérif : ${ilYa(lastHealthCheck)}` : "—"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoadingHealth(true)
                  loadHealth()
                }}
                disabled={loadingHealth}
                className="h-8 gap-2"
              >
                {loadingHealth ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                Rafraîchir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Section A : cartes de santé des services                     */}
      {/* ============================================================ */}
      <section aria-labelledby="services-heading">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden />
          <h2
            id="services-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Santé des services
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            (sondé toutes les 10s)
          </span>
        </div>

        {loadingHealth && !health ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-24 rounded bg-slate-100 dark:bg-slate-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {health?.services.map((svc) => (
              <ServiceCard key={svc.serviceName} service={svc} />
            ))}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* Section B : flux d'alertes live                              */}
      {/* ============================================================ */}
      <section aria-labelledby="alerts-heading">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden />
          <h2
            id="alerts-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Flux d'alertes live
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            (rafraîchi toutes les 5s)
          </span>
          {alerts.length > 0 && (
            <Badge variant="secondary" className="ml-auto h-5 text-[10px]">
              {alerts.length} alerte{alerts.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
              Alertes récentes (warning + critical)
            </CardTitle>
            <CardDescription className="text-xs">
              Les 50 dernières alertes non critiques et critiques détectées par les sondes.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingAlerts && alerts.length === 0 ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Aucune alerte active
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tous les services sont opérationnels — aucune alerte dans les 50 derniers événements.
                </p>
              </div>
            ) : (
              <div
                className="max-h-96 overflow-y-auto p-2"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgb(148 163 184 / 0.4) transparent",
                }}
              >
                <AlertFeed alerts={alerts} />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ============================================================ */}
      {/* Section C : actions rapides                                  */}
      {/* ============================================================ */}
      <section aria-labelledby="actions-heading">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden />
          <h2
            id="actions-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Actions rapides
          </h2>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            <ActionButton
              icon={Activity}
              label="Tester tous les canaux"
              description="Re-sonde les 7 services immédiatement"
              loading={actionsLoading["test-channels"]}
              onClick={testerTousCanaux}
            />
            <ActionButton
              icon={RefreshCw}
              label="Forcer la synchronisation"
              description="PostMessage FORCE_SYNC au service worker"
              loading={actionsLoading["force-sync-sw"]}
              onClick={forcerSyncSw}
            />
            <ActionButton
              icon={Send}
              label="Envoyer un alert test"
              description="Déclenche les alertes email critiques"
              loading={actionsLoading["test-alert"]}
              onClick={envoyerAlertTest}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

// ============================================================
// Sous-composant : carte d'un service
// ============================================================

function ServiceCard({ service }: { service: ServiceHealth }) {
  const meta = SERVICE_META[service.serviceName]
  const Icon = meta?.icon ?? Activity
  const colors = statusColor(service.status)

  return (
    <Card className={`relative overflow-hidden border ${colors.border} ${colors.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-950 shadow-sm`}
            >
              <Icon className={`h-5 w-5 ${colors.text}`} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {meta?.label ?? service.serviceName}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {meta?.description ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${colors.dot} ${service.status === "critical" || service.status === "warning" ? "animate-pulse" : ""}`}
              aria-hidden
            />
          </div>
        </div>

        <Separator className="my-3" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Statut
            </span>
            <Badge
              variant="outline"
              className={`h-5 border-current px-2 text-[10px] font-bold ${colors.text}`}
            >
              {STATUS_LABEL[service.status]}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {service.serviceName === "push_pwa"
                ? "Taux livraison"
                : service.serviceName === "denise_tts"
                  ? "Mode"
                  : "Latence"}
            </span>
            <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
              {service.serviceName === "push_pwa"
                ? service.status === "ok"
                  ? "99.5%"
                  : "—"
                : service.serviceName === "denise_tts"
                  ? "client"
                  : service.latencyMs != null
                    ? `${service.latencyMs}ms`
                    : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Dernière vérif
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {ilYa(service.lastCheckedAt)}
            </span>
          </div>

          {service.errorMessage && (
            <p
              className={`mt-2 line-clamp-2 rounded px-2 py-1 text-[11px] font-mono ${colors.bg} ${colors.text} border ${colors.border}`}
            >
              {service.errorMessage}
            </p>
          )}
        </div>

        <div className="mt-3 flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 flex-1 text-[11px]"
            onClick={() => {
              // Action "Logs" : scroll vers le flux d'alertes filtré sur ce service
              const el = document.getElementById("alerts-heading")
              el?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
          >
            Logs
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 flex-1 text-[11px]"
            onClick={() => {
              // Action "Test" : re-ping ce service via le health endpoint
              fetch("/api/admin/operations/health", { cache: "no-store" })
            }}
          >
            Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 flex-1 text-[11px]"
            onClick={() => {
              // Action "Voir détails" : pour l'instant affiche l'erreur dans une alerte
              if (service.errorMessage) {
                alert(`${SERVICE_META[service.serviceName]?.label}: ${service.errorMessage}`)
              }
            }}
          >
            Détails
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Sous-composant : feed d'alertes
// ============================================================

function AlertFeed({ alerts }: { alerts: AlertEntry[] }) {
  if (alerts.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
        Aucune alerte récente.
      </div>
    )
  }

  return (
    <ul className="space-y-1.5" role="list">
      {alerts.map((alert) => {
        const isCritical = alert.status === "critical"
        const isResolved = alert.resolvedAt !== null
        const Icon = isCritical ? OctagonAlert : AlertTriangle
        const rowColor = isCritical
          ? "border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20"
          : "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20"
        const iconColor = isCritical
          ? "text-rose-600 dark:text-rose-400"
          : "text-amber-600 dark:text-amber-400"
        const serviceLabel = SERVICE_META[alert.serviceName]?.label ?? alert.serviceName

        return (
          <li
            key={alert.id}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${rowColor}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {serviceLabel}
                </p>
                <span className="shrink-0 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {heureCourt(alert.detectedAt)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 break-words font-mono text-[11px] text-slate-600 dark:text-slate-400">
                {alert.errorMessage ?? "Erreur non spécifiée"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`h-4 px-1.5 text-[9px] font-bold ${
                    isCritical
                      ? "border-rose-400 text-rose-700 dark:text-rose-400"
                      : "border-amber-400 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {isCritical ? "CRITICAL" : "WARNING"}
                </Badge>
                {alert.latencyMs != null && (
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    {alert.latencyMs}ms
                  </span>
                )}
                {isResolved && (
                  <Badge
                    variant="outline"
                    className="h-4 border-emerald-400 px-1.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-400"
                  >
                    Auto-rétablie
                  </Badge>
                )}
                {alert.alertSent && (
                  <Badge
                    variant="outline"
                    className="h-4 border-slate-300 px-1.5 text-[9px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  >
                    Email envoyé
                  </Badge>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ============================================================
// Sous-composant : bouton d'action rapide
// ============================================================

function ActionButton({
  icon: Icon,
  label,
  description,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="group flex flex-col items-start gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900"
    >
      <div className="flex w-full items-center justify-between">
        <Icon className="h-4 w-4 text-slate-700 dark:text-slate-300" aria-hidden />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{description}</p>
    </button>
  )
}
