// ============================================================
// POST /api/airport/assign
// ------------------------------------------------------------
// Affecte un signalement aéroport à un employé via WhatsApp,
// email ou notification push.
//
// Body attendu :
//   {
//     reportId: string,
//     method: "whatsapp" | "email" | "push",
//     phone?: string,    // (pour whatsapp)
//     email?: string,    // (pour email)
//     message?: string   // message additionnel optionnel
//   }
//
// - whatsapp : génère un deep link wa.me pré-rempli avec les
//   détails du signalement et le renvoie dans la réponse. Le
//   client (dashboard) ouvre ce lien dans un nouvel onglet.
// - email    : envoie un email (via Resend) à l'adresse fournie.
//   Renvoie { sent: true/false }.
// - push     : pas d'implémentation réelle — juste un log serveur.
//   Renvoie { sent: true }.
//
// Dans tous les cas, le champ `assignedTo` du AirportReport est
// mis à jour avec le destinataire (phone, email ou token push).
// Réponse enveloppe { ok, data } | { ok: false, error }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AssignMethod = 'whatsapp' | 'email' | 'push'

type AssignBody = {
  reportId?: unknown
  method?: unknown
  phone?: unknown
  email?: unknown
  message?: unknown
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  // Garde uniquement les chiffres (supprime + et espaces)
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!/^\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

function buildAssignMessage(args: {
  zoneNom: string
  zoneEmoji: string
  tagScanne: string
  problemType: string
  commentaire: string | null
  flightNumber: string | null
  reportId: string
  createdAt: Date
  note: string | null
}): string {
  const heure = args.createdAt.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const lignes: string[] = [
    '*AFFECTATION SIGNALEMENT AÉROPORT*',
    '',
    `*Zone :* ${args.zoneEmoji} ${args.zoneNom}`,
    `*Problème :* ${args.problemType}`,
    `*Emplacement :* ${args.tagScanne}`,
    `*Heure :* ${heure}`,
    `*Réf :* #${args.reportId.slice(-8)}`,
  ]
  if (args.flightNumber) lignes.push(`*Vol :* ${args.flightNumber}`)
  if (args.commentaire && args.commentaire.trim()) {
    lignes.push(`*Précision voyageur :* ${args.commentaire.trim()}`)
  }
  if (args.note && args.note.trim()) {
    lignes.push(`*Note manager :* ${args.note.trim()}`)
  }
  lignes.push('', '*Action :* Merci de prendre en charge ce signalement sur place.')
  return lignes.join('\n')
}

export async function POST(req: NextRequest) {
  let body: AssignBody
  try {
    body = (await req.json()) as AssignBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : ''
  if (!reportId) return fail('`reportId` est requis', 400)

  const method = typeof body.method === 'string' ? (body.method as AssignMethod) : null
  if (!method || !['whatsapp', 'email', 'push'].includes(method)) {
    return fail('`method` doit être "whatsapp", "email" ou "push"', 400)
  }

  // Charge le signalement + zone pour construire le message
  const report = await db.airportReport.findUnique({
    where: { id: reportId },
    include: { zone: { select: { code: true, nom: true, emoji: true } } },
  })
  if (!report) return fail('Signalement introuvable', 404)

  const note =
    typeof body.message === 'string' ? body.message.trim().slice(0, 500) : null

  const messageText = buildAssignMessage({
    zoneNom: report.zone?.nom ?? 'Zone inconnue',
    zoneEmoji: report.zone?.emoji ?? '📍',
    tagScanne: report.tagScanne,
    problemType: report.problemType,
    commentaire: report.commentaire,
    flightNumber: report.flightNumber,
    reportId: report.id,
    createdAt: report.createdAt,
    note,
  })

  // ---------- Méthode WhatsApp ----------
  if (method === 'whatsapp') {
    const phone = normalizePhone(
      typeof body.phone === 'string' ? body.phone : null,
    )
    if (!phone) {
      return fail(
        'Numéro WhatsApp invalide (format attendu : international sans +, ex: 33612345678)',
        400,
      )
    }
    const link = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(messageText)}&type=phone_number&app_absent=0`
    await db.airportReport.update({
      where: { id: report.id },
      data: { assignedTo: phone },
    })
    return ok({ method: 'whatsapp', phone, link, message: messageText })
  }

  // ---------- Méthode Email ----------
  if (method === 'email') {
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('Email destinataire invalide', 400)
    }

    const sujet = `Affectation signalement aéroport — ${report.zone?.nom ?? 'Zone'} — #${report.id.slice(-8)}`
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background-color:#0f172a;padding:24px 32px;">
<p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Aéroport — Affectation signalement</p>
<p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">Réf #${escapeHtml(report.id.slice(-8))}</p>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1917;">Bonjour,</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#44403c;">Un signalement voyageur vient de vous être affecté pour prise en charge sur place :</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;margin:0 0 16px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 6px;font-size:14px;color:#1c1917;"><strong>Zone :</strong> ${escapeHtml(report.zone?.nom ?? 'Zone inconnue')}</p>
<p style="margin:0 0 6px;font-size:14px;color:#1c1917;"><strong>Problème :</strong> ${escapeHtml(report.problemType)}</p>
<p style="margin:0 0 6px;font-size:14px;color:#1c1917;"><strong>Emplacement :</strong> <code style="font-family:monospace;">${escapeHtml(report.tagScanne)}</code></p>
${report.flightNumber ? `<p style="margin:0 0 6px;font-size:14px;color:#1c1917;"><strong>Vol :</strong> ${escapeHtml(report.flightNumber)}</p>` : ''}
${report.commentaire ? `<p style="margin:0 0 6px;font-size:14px;color:#1c1917;"><strong>Précision voyageur :</strong> ${escapeHtml(report.commentaire)}</p>` : ''}
${note ? `<p style="margin:0;font-size:14px;color:#1c1917;"><strong>Note manager :</strong> ${escapeHtml(note)}</p>` : ''}
</td></tr>
</table>
<p style="margin:0 0 8px;font-size:13px;color:#78716c;">Message envoyé aux équipes :</p>
<pre style="margin:0 0 16px;padding:16px;background-color:#1e293b;border-radius:8px;font-family:monospace;font-size:12px;line-height:1.6;color:#e2e8f0;white-space:pre-wrap;">${escapeHtml(messageText)}</pre>
<p style="margin:0;font-size:13px;color:#78716c;">Merci de prendre en charge ce signalement sur place.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`

    const sent = await sendEmail(email, sujet, html)
    await db.airportReport.update({
      where: { id: report.id },
      data: { assignedTo: email },
    })
    return ok({ method: 'email', email, sent, message: messageText })
  }

  // ---------- Méthode Push ----------
  // Pas d'implémentation réelle (pas de FCM/APNs configuré). On log
  // côté serveur et on renvoie un succès factice.
  console.log(
    `[airport/assign] PUSH notification (simulée) pour signalement ${report.id}`,
  )
  await db.airportReport.update({
    where: { id: report.id },
    data: { assignedTo: 'push' },
  })
  return ok({ method: 'push', sent: true, message: messageText })
}
