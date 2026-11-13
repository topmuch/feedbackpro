// ============================================================
// Task O1 — Centre Opérationnel : health checks des 7 services
// ------------------------------------------------------------
// GET /api/admin/operations/health
//   → exécute les 7 checks et renvoie { globalStatus, services[], lastCheckedAt }
//
// Services surveillés :
//   1. db_primary     — db.airportZone.count() (latence < 100ms = ok)
//   2. mtarget_sms    — NotificationSetting("sms_mtarget") actif + ping endpoint
//   3. whatsapp_api   — NotificationSetting("whatsapp") actif + ping endpoint
//   4. smtp_email     — NotificationSetting("email") actif
//   5. push_pwa       — AirportPushSubscription.count() > 0
//   6. denise_tts     — toujours OK (client-side, no server dependency)
//   7. service_worker — fetch HEAD /sw.js (200 = ok)
//
// Robustesse :
//   - chaque check est wrappé dans un try/catch → jamais d'exception non gérée
//   - les timeouts sont systématiques (3s pour les pings externes)
//   - seul le statut "warning" ou "critical" est journalisé dans SystemHealthLog
//     (pour éviter de saturer la table avec des "ok")
//   - les status "critical" déclenchent sendCriticalAlert() (email)
//
// Réponse :
//   { ok: true, data: { globalStatus, services: [{serviceName, status, latencyMs?,
//     errorMessage?, lastCheckedAt}], lastCheckedAt } }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { sendCriticalAlert } from "@/lib/critical-alert"

// ---------- Types ----------

type ServiceStatus = "ok" | "warning" | "critical" | "inactive"

type HealthCheckResult = {
  serviceName: string
  status: ServiceStatus
  latencyMs?: number
  errorMessage?: string
  lastCheckedAt: string
}

// ---------- Helpers ----------

/** Récupère la NotificationSetting pour un canal donné (cast any pour résilience). */
async function getNotificationSetting(canal: string): Promise<{
  active: boolean
  config: string
} | null> {
  try {
    const row = await (db as any).notificationSetting.findUnique({
      where: { canal },
      select: { active: true, config: true },
    })
    return (row ?? null) as { active: boolean; config: string } | null
  } catch {
    return null
  }
}

/** Parse le JSON config d'une NotificationSetting de façon safe. */
function parseConfig(config: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(config)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return {}
}

/** Ping HEAD avec timeout — renvoie { ok, latencyMs, errorMessage? }. */
async function pingEndpoint(
  url: string,
  timeoutMs = 3000
): Promise<{ reachable: boolean; latencyMs: number; errorMessage?: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      // Pas de cache — on veut un vrai ping réseau
      cache: "no-store",
    })
    clearTimeout(timer)
    const latencyMs = Date.now() - start
    if (res.ok || (res.status >= 200 && res.status < 500)) {
      return { reachable: true, latencyMs }
    }
    return {
      reachable: false,
      latencyMs,
      errorMessage: `HTTP ${res.status} ${res.statusText}`,
    }
  } catch (e) {
    const latencyMs = Date.now() - start
    const msg = e instanceof Error ? e.message : String(e)
    // AbortError → timeout
    if (e instanceof Error && e.name === "AbortError") {
      return {
        reachable: false,
        latencyMs,
        errorMessage: `Timeout (${timeoutMs}ms)`,
      }
    }
    return { reachable: false, latencyMs, errorMessage: msg }
  }
}

// ---------- Checks individuels ----------

async function checkDbPrimary(): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    // Compte les AirportZone — c'est une requête légère typique
    await db.airportZone.count()
    const latencyMs = Date.now() - start
    let status: ServiceStatus = "ok"
    let errorMessage: string | undefined
    if (latencyMs > 1000) {
      status = "critical"
      errorMessage = `Latence DB élevée : ${latencyMs}ms (> 1000ms)`
    } else if (latencyMs > 100) {
      status = "warning"
      errorMessage = `Latence DB modérée : ${latencyMs}ms (> 100ms)`
    }
    return {
      serviceName: "db_primary",
      status,
      latencyMs,
      errorMessage,
      lastCheckedAt: new Date().toISOString(),
    }
  } catch (e) {
    const latencyMs = Date.now() - start
    const msg = e instanceof Error ? e.message : String(e)
    return {
      serviceName: "db_primary",
      status: "critical",
      latencyMs,
      errorMessage: `DB injoignable : ${msg}`,
      lastCheckedAt: new Date().toISOString(),
    }
  }
}

async function checkMtargetSms(): Promise<HealthCheckResult> {
  const setting = await getNotificationSetting("sms_mtarget")
  if (!setting || !setting.active) {
    return {
      serviceName: "mtarget_sms",
      status: "inactive",
      errorMessage: "Canal SMS Mtarget non configuré ou inactif",
      lastCheckedAt: new Date().toISOString(),
    }
  }
  const cfg = parseConfig(setting.config)
  const endpoint = typeof cfg.endpoint === "string" ? cfg.endpoint : null
  if (!endpoint) {
    return {
      serviceName: "mtarget_sms",
      status: "warning",
      errorMessage: "NotificationSetting active mais aucun endpoint configuré",
      lastCheckedAt: new Date().toISOString(),
    }
  }
  const ping = await pingEndpoint(endpoint, 3000)
  if (ping.reachable) {
    let status: ServiceStatus = "ok"
    if (ping.latencyMs > 2000) status = "warning"
    return {
      serviceName: "mtarget_sms",
      status,
      latencyMs: ping.latencyMs,
      lastCheckedAt: new Date().toISOString(),
    }
  }
  return {
    serviceName: "mtarget_sms",
    status: "critical",
    latencyMs: ping.latencyMs,
    errorMessage: `Endpoint injoignable : ${ping.errorMessage ?? "erreur inconnue"}`,
    lastCheckedAt: new Date().toISOString(),
  }
}

async function checkWhatsappApi(): Promise<HealthCheckResult> {
  const setting = await getNotificationSetting("whatsapp")
  if (!setting || !setting.active) {
    return {
      serviceName: "whatsapp_api",
      status: "inactive",
      errorMessage: "Canal WhatsApp non configuré ou inactif",
      lastCheckedAt: new Date().toISOString(),
    }
  }
  const cfg = parseConfig(setting.config)
  const endpoint = typeof cfg.endpoint === "string" ? cfg.endpoint : null
  // WhatsApp Business API : si pas d'endpoint explicite, on suppose
  // qu'on utilise l'API Graph Meta (graph.facebook.com) — on ping
  // l'URL de base si aucun endpoint custom n'est fourni.
  const url = endpoint ?? "https://graph.facebook.com/v18.0/"
  const ping = await pingEndpoint(url, 3000)
  if (ping.reachable) {
    let status: ServiceStatus = "ok"
    if (ping.latencyMs > 2000) status = "warning"
    return {
      serviceName: "whatsapp_api",
      status,
      latencyMs: ping.latencyMs,
      lastCheckedAt: new Date().toISOString(),
    }
  }
  return {
    serviceName: "whatsapp_api",
    status: "critical",
    latencyMs: ping.latencyMs,
    errorMessage: `Endpoint injoignable : ${ping.errorMessage ?? "erreur inconnue"}`,
    lastCheckedAt: new Date().toISOString(),
  }
}

async function checkSmtpEmail(): Promise<HealthCheckResult> {
  const setting = await getNotificationSetting("email")
  if (!setting || !setting.active) {
    return {
      serviceName: "smtp_email",
      status: "warning",
      errorMessage: "Canal email inactif — les emails transactionnels peuvent ne pas partir",
      lastCheckedAt: new Date().toISOString(),
    }
  }
  // Si actif, on suppose OK (Resend est fiable ; un vrai check nécessiterait
  // d'envoyer un email test, ce qu'on réserve à l'action manuelle).
  return {
    serviceName: "smtp_email",
    status: "ok",
    lastCheckedAt: new Date().toISOString(),
  }
}

async function checkPushPwa(): Promise<HealthCheckResult> {
  try {
    const count = await db.airportPushSubscription.count()
    if (count > 0) {
      // 99.5% de taux de livraison supposé pour Web Push (FCM/APNS/Mozilla)
      return {
        serviceName: "push_pwa",
        status: "ok",
        latencyMs: 0,
        // successRate est calculé côté client à partir du count
        lastCheckedAt: new Date().toISOString(),
      }
    }
    return {
      serviceName: "push_pwa",
      status: "warning",
      errorMessage: "Aucun appareil staff abonné aux notifications push",
      lastCheckedAt: new Date().toISOString(),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      serviceName: "push_pwa",
      status: "critical",
      errorMessage: `Erreur table AirportPushSubscription : ${msg}`,
      lastCheckedAt: new Date().toISOString(),
    }
  }
}

async function checkDeniseTts(): Promise<HealthCheckResult> {
  // TTS est une feature 100% client-side (Web Speech API du navigateur).
  // Aucune dépendance serveur — donc toujours OK.
  return {
    serviceName: "denise_tts",
    status: "ok",
    latencyMs: 0,
    lastCheckedAt: new Date().toISOString(),
  }
}

async function checkServiceWorker(): Promise<HealthCheckResult> {
  // /sw.js doit être servi par Next.js (fichier statique dans /public/sw.js)
  const url = "/sw.js"
  // On utilise une URL relative résolue contre l'hôte courant
  const host =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")
  const fullUrl = `${host.replace(/\/$/, "")}${url}`
  const ping = await pingEndpoint(fullUrl, 3000)
  if (ping.reachable) {
    return {
      serviceName: "service_worker",
      status: "ok",
      latencyMs: ping.latencyMs,
      lastCheckedAt: new Date().toISOString(),
    }
  }
  return {
    serviceName: "service_worker",
    status: "critical",
    latencyMs: ping.latencyMs,
    errorMessage: `/sw.js injoignable : ${ping.errorMessage ?? "erreur inconnue"}`,
    lastCheckedAt: new Date().toISOString(),
  }
}

// ---------- Journalisation ----------

/**
 * Log les statuts warning/critical dans SystemHealthLog.
 * Les "ok" et "inactive" ne sont PAS loggés pour éviter de saturer la table.
 *
 * Renvoie l'ID de la ligne créée (utile pour sendCriticalAlert qui va
 * marquer alertSent=true après envoi).
 */
async function logHealthCheck(result: HealthCheckResult): Promise<string | null> {
  if (result.status !== "warning" && result.status !== "critical") return null
  try {
    const row = await db.systemHealthLog.create({
      data: {
        serviceName: result.serviceName,
        status: result.status,
        latencyMs: result.latencyMs ?? null,
        errorMessage: result.errorMessage ?? null,
      },
      select: { id: true },
    })
    return row.id
  } catch (e) {
    console.error("[health] logHealthCheck error (non bloquant)", e)
    return null
  }
}

/** Marque les alertes précédentes non résolues d'un service comme résolues si le service est à nouveau OK. */
async function maybeResolveAlerts(serviceName: string, currentStatus: ServiceStatus): Promise<void> {
  if (currentStatus === "ok" || currentStatus === "inactive") {
    try {
      await db.systemHealthLog.updateMany({
        where: {
          serviceName,
          resolvedAt: null,
        },
        data: { resolvedAt: new Date() },
      })
    } catch {
      /* non bloquant */
    }
  }
}

// ---------- Route GET ----------

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    // 1. Exécute les 7 checks en parallèle pour minimiser le temps total
    const results = await Promise.all([
      checkDbPrimary(),
      checkMtargetSms(),
      checkWhatsappApi(),
      checkSmtpEmail(),
      checkPushPwa(),
      checkDeniseTts(),
      checkServiceWorker(),
    ])

    // 2. Statut global : critical > warning > ok
    let globalStatus: "ok" | "warning" | "critical" = "ok"
    if (results.some((r) => r.status === "critical")) {
      globalStatus = "critical"
    } else if (results.some((r) => r.status === "warning")) {
      globalStatus = "warning"
    }

    // 3. Journalise + déclenche les alertes critiques
    //    On le fait en arrière-plan pour ne pas bloquer la réponse HTTP.
    //    (le await reste néanmoins : la journalisation est rapide)
    for (const r of results) {
      await maybeResolveAlerts(r.serviceName, r.status)
      const logId = await logHealthCheck(r)
      if (r.status === "critical" && logId) {
        // Envoi email non bloquant — on await quand même pour la traçabilité
        await sendCriticalAlert(
          r.serviceName,
          r.errorMessage ?? "Erreur non spécifiée",
          {
            impact: undefined, // sera résolu par les defaults de critical-alert.ts
          },
          logId
        )
      }
    }

    // 4. Réponse standardisée
    return ok({
      globalStatus,
      services: results,
      lastCheckedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error("admin operations health error", e)
    return fail("Erreur serveur", 500)
  }
}
