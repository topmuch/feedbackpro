// ============================================================
// GET /api/cron/rapport-ville
// ------------------------------------------------------------
// Feature #8 — Rapport quotidien de la Ville Connectée.
//
// Planifié chaque jour à 7h30 UTC par Vercel Cron (vercel.json).
// Peut aussi être appelé manuellement :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedvoice.fr/api/cron/rapport-ville
//
// Agrège sur la journée écoulée (UTC, 00h00 → maintenant) :
//   - total incidents créés aujourd'hui
//   - incidents résolus aujourd'hui + temps moyen de résolution
//   - signalements fiscaux (CityTaxReport) créés aujourd'hui
//   - nouveaux commerces/artisans (CityArtisan) créés aujourd'hui
//   - annonces de quartier (CityQuartierAd) publiées aujourd'hui
//   - orientations (incidents type='orientation') aujourd'hui
//
// Sauvegarde le tout dans CityReport (type='daily',
// period=YYYY-MM-DD). Si un rapport existe déjà pour aujourd'hui,
// on l'écrase (idempotent — relance manuelle du cron safe).
//
// Envoie un email récapitulatif à la mairie (destinataire via
// CITY_MAIRIE_EMAIL, fallback mairie@feedvoice.local — en mode
// démo sans clé Resend, l'email est loggué).
//
// Réponse : { ok: true, data: { period, metrics, reportId, emailSent } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Formate une date en « YYYY-MM-DD » (UTC). */
function formatDatePeriod(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** HTML d'échappement minimal pour l'email récap. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET(req: NextRequest) {
  try {
    // ---------- Sécurité : CRON_SECRET obligatoire ----------
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return fail('Cron non configuré (CRON_SECRET absent)', 501)
    }
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return fail('Non autorisé', 401)
    }

    // ---------- Période : journée courante (UTC) ----------
    const now = new Date()
    const period = formatDatePeriod(now)
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
    )

    // ---------- Agrégations parallèles ----------
    const [
      incidentsToday,
      resolvedToday,
      taxReportsToday,
      newBusinessesToday,
      quartierAdsToday,
      orientationsToday,
    ] = await Promise.all([
      // 1. Total incidents créés aujourd'hui
      db.cityIncident.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      // 2. Incidents résolus aujourd'hui (avec createdAt pour calculer
      //    le temps moyen de résolution)
      db.cityIncident.findMany({
        where: {
          resolvedAt: { gte: startOfDay, not: null },
        },
        select: { createdAt: true, resolvedAt: true },
      }),
      // 3. Signalements fiscaux créés aujourd'hui
      db.cityTaxReport.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      // 4. Nouveaux commerces/artisans créés aujourd'hui
      db.cityArtisan.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      // 5. Annonces de quartier publiées aujourd'hui
      db.cityQuartierAd.count({
        where: { createdAt: { gte: startOfDay } },
      }),
      // 6. Orientations (incidents type='orientation') aujourd'hui
      db.cityIncident.count({
        where: {
          createdAt: { gte: startOfDay },
          type: 'orientation',
        },
      }),
    ])

    // ---------- Temps moyen de résolution (en minutes) ----------
    let totalResolutionMin = 0
    let resolutionCount = 0
    for (const inc of resolvedToday) {
      if (!inc.resolvedAt) continue
      const elapsedMs = inc.resolvedAt.getTime() - inc.createdAt.getTime()
      if (elapsedMs < 0) continue // anomaly: resolved before created — skip
      totalResolutionMin += Math.round(elapsedMs / 60000)
      resolutionCount += 1
    }
    const avgResolutionMin =
      resolutionCount > 0
        ? Math.round(totalResolutionMin / resolutionCount)
        : 0

    const resolvedCount = resolvedToday.length

    // ---------- Synthèse chiffrée ----------
    const data = {
      period,
      generatedAt: now.toISOString(),
      incidents: {
        total: incidentsToday,
        resolved: resolvedCount,
        pending: incidentsToday - resolvedCount,
        avgResolutionMin,
      },
      taxReports: taxReportsToday,
      newBusinesses: newBusinessesToday,
      quartierAds: quartierAdsToday,
      orientations: orientationsToday,
    }

    // ---------- Persistance : CityReport (upsert logique) ----------
    // Pas de contrainte unique sur (type, period) → on cherche puis
    // update/create. Idempotent : relancer le cron le même jour
    // écrase le rapport existant plutôt que d'en créer un doublon.
    const existing = await db.cityReport.findFirst({
      where: { type: 'daily', period },
      select: { id: true },
    })

    let reportId: string
    if (existing) {
      const updated = await db.cityReport.update({
        where: { id: existing.id },
        data: {
          totalIncidents: incidentsToday,
          resolvedCount,
          avgResolutionMin,
          orientationCount: orientationsToday,
          satisfaction: 0, // pas encore calculé en V1 (pas de notation citoyenne)
          data: JSON.stringify(data),
        },
      })
      reportId = updated.id
    } else {
      const created = await db.cityReport.create({
        data: {
          type: 'daily',
          period,
          totalIncidents: incidentsToday,
          resolvedCount,
          avgResolutionMin,
          orientationCount: orientationsToday,
          satisfaction: 0,
          data: JSON.stringify(data),
        },
      })
      reportId = created.id
    }

    console.log(
      `[cron-ville] Rapport quotidien ${period} sauvegardé — ` +
        `${incidentsToday} incidents, ${resolvedCount} résolus, ` +
        `temps moyen ${avgResolutionMin} min`,
    )

    // ---------- Email récapitulatif à la mairie ----------
    const mairieEmail =
      process.env.CITY_MAIRIE_EMAIL || 'mairie@feedvoice.local'

    const html = emailRapportVille(data)
    const sujet = `Rapport quotidien Ville Connectée — ${period}`
    const emailSent = await sendEmail(mairieEmail, sujet, html)

    console.log(
      `[cron-ville] Email ${emailSent ? 'envoyé' : 'simulé/loggué'} → ${mairieEmail}`,
    )

    return ok({
      period,
      reportId,
      metrics: data,
      emailSent,
      emailRecipient: mairieEmail,
    })
  } catch (e) {
    console.error('[cron-ville] Erreur:', e)
    return fail('Erreur serveur lors de la génération du rapport ville', 500)
  }
}

// ---------------------------------------------------------------
// Template HTML de l'email récapitulatif (inline-CSS responsive)
// ---------------------------------------------------------------
type VilleMetrics = {
  period: string
  generatedAt: string
  incidents: {
    total: number
    resolved: number
    pending: number
    avgResolutionMin: number
  }
  taxReports: number
  newBusinesses: number
  quartierAds: number
  orientations: number
}

function emailRapportVille(m: VilleMetrics): string {
  const tauxResolution =
    m.incidents.total > 0
      ? Math.round((m.incidents.resolved / m.incidents.total) * 100)
      : 0

  const row = (label: string, value: string, sub?: string) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e7e5e4;font-size:15px;color:#44403c;">
        ${escapeHtml(label)}
      </td>
      <td align="right" style="padding:14px 0;border-bottom:1px solid #e7e5e4;font-size:15px;font-weight:700;color:#1c1917;">
        ${escapeHtml(value)}${sub ? `<br/><span style="font-weight:400;font-size:12px;color:#78716c;">${escapeHtml(sub)}</span>` : ''}
      </td>
    </tr>`

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Rapport Ville — ${escapeHtml(m.period)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#1A1A1A;padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Ville Connectée</p>
          <p style="margin:4px 0 0;font-size:13px;color:#C9A961;">Rapport quotidien — ${escapeHtml(m.period)}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#1c1917;">Bonjour,</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#44403c;">
            Voici la synthèse de l'activité citoyenne du <strong>${escapeHtml(m.period)}</strong>.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row('Signalements citoyens', String(m.incidents.total))}
            ${row('Incidents résolus', String(m.incidents.resolved), `${tauxResolution}% de résolution`)}
            ${row('Temps moyen de résolution', `${m.incidents.avgResolutionMin} min`)}
            ${row('En attente de traitement', String(m.incidents.pending))}
            ${row('Signalements fiscaux (radar)', String(m.taxReports))}
            ${row('Nouveaux commerces / artisans', String(m.newBusinesses))}
            ${row('Annonces de quartier', String(m.quartierAds))}
            ${row('Orientations citoyennes', String(m.orientations))}
          </table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
            Rapport généré automatiquement par le cron Ville Connectée.<br/>
            Données consolidées sur la journée UTC (00h00 → maintenant).
          </p>
        </td></tr>
        <tr><td style="background-color:#fafaf9;padding:20px 32px;border-top:1px solid #e7e5e4;">
          <p style="margin:0;font-size:12px;color:#78716c;line-height:1.6;">
            © ${new Date().getFullYear()} Ville Connectée — FeedVoice.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
