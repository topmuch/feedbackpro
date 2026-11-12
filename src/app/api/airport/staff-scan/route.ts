// ============================================================
// POST /api/airport/staff-scan
// GET  /api/airport/staff-scan?reportId=xxx
// ------------------------------------------------------------
// QR Staff Only — les employés scannent pour :
// 1. TAKE_CHARGE : prendre en charge un signalement (+ photo AVANT)
// 2. RESOLVE : marquer résolu (+ photo APRÈS) → déclenche voix wallboard
// 3. REPORT_ISSUE : signaler un problème interne (manque papier, clim)
//    → déclenche voix wallboard + alerte manager par email
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET — liste des scans staff (pour le dashboard)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const reportId = url.searchParams.get('reportId')
  const where: { reportId?: string } = {}
  if (reportId) where.reportId = reportId

  const scans = await db.airportStaffScan.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return ok({ scans })
}

// POST — employé scanne un QR staff
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    staffTag: string
    action: string
    reportId?: string
    photoUrl?: string
    message?: string
    staffPhone?: string
    staffName?: string
  }

  if (!b.staffTag || !b.action) {
    return fail('staffTag et action requis', 400)
  }

  const validActions = ['TAKE_CHARGE', 'RESOLVE', 'REPORT_ISSUE']
  if (!validActions.includes(b.action)) {
    return fail(`action invalide (TAKE_CHARGE | RESOLVE | REPORT_ISSUE)`, 400)
  }

  // Résoudre la zone depuis le staffTag (ex: "staff_nettoyage_T2" → "sanitaires")
  const zoneCode = resolveZoneFromStaffTag(b.staffTag)

  // Créer le scan
  const scan = await db.airportStaffScan.create({
    data: {
      staffTag: b.staffTag,
      action: b.action,
      reportId: b.reportId ?? null,
      photoUrl: b.photoUrl ?? null,
      message: b.message ?? null,
      staffPhone: b.staffPhone ?? null,
      staffName: b.staffName ?? null,
      zoneCode,
    },
  })

  // --- Traitement selon l'action ---
  if (b.action === 'TAKE_CHARGE' && b.reportId) {
    // Marquer le signalement EN_COURS
    await db.airportReport.update({
      where: { id: b.reportId },
      data: { statut: 'EN_COURS' },
    })
    console.log(`[staff-scan] TAKE_CHARGE — report ${b.reportId} → EN_COURS par ${b.staffName ?? 'staff'}`)
  }

  if (b.action === 'RESOLVE' && b.reportId) {
    // Marquer le signalement RESOLU + stocker la photo APRÈS
    const now = new Date()
    const report = await db.airportReport.update({
      where: { id: b.reportId },
      data: { statut: 'RESOLU', resolvedAt: now },
    })
    console.log(`[staff-scan] RESOLVE — report ${b.reportId} résolu par ${b.staffName ?? 'staff'}`)

    // Le wallboard détectera la résolution via recently_resolved (poll 5s)
    // → son résolu + TTS "Signalement résolu. [zone]. [problème]. Bien fait."
  }

  if (b.action === 'REPORT_ISSUE') {
    // Signalement interne — créer un AirportReport aussi pour que ça
    // apparaisse sur le wallboard ET déclenche la voix Denise
    const zone = await db.airportZone.findFirst({
      where: { code: zoneCode ?? undefined },
    })
    if (zone) {
      const report = await db.airportReport.create({
        data: {
          zoneId: zone.id,
          tagScanne: b.staffTag,
          problemType: b.message ?? 'Signalement interne staff',
          commentaire: `Signalé par ${b.staffName ?? 'employé'} (${b.staffTag})`,
          statut: 'EN_ATTENTE',
          whatsappPayload: `📢 SIGNALEMENT INTERNE STAFF\nZone: ${zone.nom}\nMessage: ${b.message ?? 'N/A'}`,
        },
      })
      // Lier le scan au report créé
      await db.airportStaffScan.update({
        where: { id: scan.id },
        data: { reportId: report.id },
      })
      console.log(`[staff-scan] REPORT_ISSUE — report ${report.id} créé: ${b.message}`)
    }

    // Alerte manager par email (fire-and-forget)
    notifyManagerStaffIssue(b.staffTag, b.message ?? '', b.staffName ?? 'Employé').catch(() => {})
  }

  return ok({ scan, triggeredVoice: b.action === 'RESOLVE' || b.action === 'REPORT_ISSUE' })
}

function resolveZoneFromStaffTag(tag: string): string | null {
  const t = tag.toLowerCase()
  if (t.includes('toilette') || t.includes('sanitaire') || t.includes('wc')) return 'sanitaires'
  if (t.includes('bagage') || t.includes('tapis')) return 'bagages'
  if (t.includes('securite') || t.includes('paf') || t.includes('file')) return 'files_attente'
  if (t.includes('porte') || t.includes('embarquement') || t.includes('lounge')) return 'embarquement'
  if (t.includes('food') || t.includes('duty') || t.includes('restauration')) return 'restauration'
  return null
}

async function notifyManagerStaffIssue(staffTag: string, message: string, staffName: string): Promise<void> {
  const pros = await db.pro.findMany({
    where: { typeEtablissement: 'Aéroport', suspendu: false },
    include: { user: { select: { email: true } } },
  })
  if (pros.length === 0) return

  const sujet = `📢 Signalement interne staff — ${staffTag}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #5257C9; padding: 20px; color: white;">
        <h2 style="margin: 0;">📢 Signalement interne staff</h2>
        <p style="margin: 5px 0 0; opacity: 0.8;">FeedbackPro — QR Staff Only</p>
      </div>
      <div style="padding: 20px;">
        <p><strong>Employé :</strong> ${staffName}</p>
        <p><strong>QR scanné :</strong> ${staffTag}</p>
        <p><strong>Message :</strong> ${message}</p>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
          Cet email a été envoyé automatiquement par FeedbackPro.
        </p>
      </div>
    </div>
  `
  for (const pro of pros) {
    const email = pro.user?.email
    if (!email) continue
    try {
      await sendEmail(email, sujet, html)
      console.log(`[staff-scan] Email envoyé à ${email}`)
    } catch (err) {
      console.warn(`[staff-scan] Échec email à ${email}:`, err)
    }
  }
}
