// ============================================================
// /api/city/appointments
// ------------------------------------------------------------
// Ville Connectée — Rendez-vous citoyen avec la mairie.
// Le citoyen demande un RDV depuis le QR code (module Mairie).
// Le RDV atterrit dans l'onglet "Rendez-vous" du dashboard.
// Notification email au secretariat.
//
// GET  → liste des RDV (triés par createdAt DESC)
// POST → crée un RDV + envoie email au secretariat
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { sendEmail } from '@/lib/email'
import { getSetting } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Génère une référence unique: RDV-XXXXYYY (4 chiffres + 3 lettres)
function generateReference(): string {
  const nums = Math.floor(1000 + Math.random() * 9000)
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('')
  return `RDV-${nums}${letters}`
}

// ---------------------------------------------------------------
// GET — liste des RDV
// ---------------------------------------------------------------
export async function GET() {
  const appointments = await db.cityAppointment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      plate: {
        select: { id: true, plateNumber: true, label: true, district: true },
      },
    },
  })

  const serialized = appointments.map((a) => ({
    id: a.id,
    reference: a.reference,
    name: a.name,
    phone: a.phone,
    email: a.email,
    motif: a.motif,
    plateId: a.plateId,
    plate: a.plate
      ? {
          id: a.plate.id,
          plateNumber: a.plate.plateNumber,
          label: a.plate.label,
          district: a.plate.district,
        }
      : null,
    qrToken: a.qrToken,
    status: a.status,
    assignedTo: a.assignedTo,
    preferredDate: a.preferredDate,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }))

  return ok({ appointments: serialized, count: serialized.length })
}

// ---------------------------------------------------------------
// POST — créer un RDV + email secretariat
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    name?: string
    phone?: string
    email?: string
    motif?: string
    plateId?: string
    qrToken?: string
    preferredDate?: string
  }

  // Validation
  if (!b.name || typeof b.name !== 'string' || b.name.trim().length < 3) {
    return fail('Nom et prénom requis (min. 3 caractères)', 400)
  }
  if (!b.motif || typeof b.motif !== 'string' || b.motif.trim().length < 5) {
    return fail('Motif du rendez-vous requis', 400)
  }

  // Génère une référence unique (vérifie non-collision)
  let reference = generateReference()
  const existing = await db.cityAppointment.findUnique({ where: { reference } })
  if (existing) {
    reference = generateReference() + 'X'
  }

  // Récupère les infos de la plaque si fournie
  let plateInfo: { plateNumber: string; label: string; district: string | null } | null = null
  if (b.plateId) {
    const plate = await db.cityPlate.findUnique({
      where: { id: b.plateId },
      select: { plateNumber: true, label: true, district: true },
    })
    if (plate) {
      plateInfo = plate
    }
  }

  // Crée le RDV
  const appointment = await db.cityAppointment.create({
    data: {
      reference,
      name: b.name.trim().slice(0, 120),
      phone: b.phone?.trim().slice(0, 30) || null,
      email: b.email?.trim().slice(0, 120) || null,
      motif: b.motif.trim().slice(0, 500),
      plateId: b.plateId || null,
      qrToken: b.qrToken || null,
      preferredDate: b.preferredDate?.trim().slice(0, 100) || null,
      status: 'pending',
    },
  })

  console.log(
    `[city-appointments] 📅 RDV créé: ${reference} — ${appointment.name} — ${appointment.motif}`,
  )

  // Email au secretariat (non bloquant)
  try {
    const subject = `Nouveau rendez-vous: ${reference} — ${appointment.name}`
    const html = `
      <h2>Nouveau rendez-vous demandé</h2>
      <p><strong>Référence:</strong> ${reference}</p>
      <p><strong>Nom:</strong> ${appointment.name}</p>
      <p><strong>Téléphone:</strong> ${appointment.phone || 'Non fourni'}</p>
      <p><strong>Email:</strong> ${appointment.email || 'Non fourni'}</p>
      <p><strong>Motif:</strong> ${appointment.motif}</p>
      <p><strong>Date souhaitée:</strong> ${appointment.preferredDate || 'Non précisée'}</p>
      ${plateInfo ? `<p><strong>Plaque:</strong> ${plateInfo.plateNumber} — ${plateInfo.label} (${plateInfo.district || 'Dakar'})</p>` : ''}
      <p><strong>Créé le:</strong> ${new Date(appointment.createdAt).toLocaleString('fr-FR')}</p>
      <hr>
      <p>Connectez-vous au dashboard mairie → onglet Rendez-vous pour confirmer ou assigner ce RDV.</p>
    `
    await sendEmail(
      await getSetting('city_secretariat_email', 'oni@gmail.com'),
      subject,
      html,
    )
    console.log('[city-appointments] 📧 Email envoyé au secretariat')
  } catch (e) {
    console.warn('[city-appointments] Email non envoyé (non bloquant):', e)
  }

  return ok(
    {
      appointment: {
        id: appointment.id,
        reference: appointment.reference,
        name: appointment.name,
        motif: appointment.motif,
        status: appointment.status,
        createdAt: appointment.createdAt.toISOString(),
      },
    },
    201,
  )
}
