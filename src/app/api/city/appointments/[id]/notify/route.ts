// ============================================================
// /api/city/appointments/[id]/notify
// ------------------------------------------------------------
// Envoie un email à la personne assignée avec TOUS les détails
// du rendez-vous : motif, nom, téléphone, email du citoyen.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { sendEmail } from '@/lib/email'
import { getSetting } from '@/lib/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID requis', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { email?: string; assignedTo?: string }
  const email = b.email || b.assignedTo
  if (!email || !email.includes('@')) {
    return fail('Email valide requis', 400)
  }

  const appointment = await db.cityAppointment.findUnique({
    where: { id },
  })
  if (!appointment) return fail('Rendez-vous introuvable', 404)

  // Récupère le nom de l'assistante (Aminata par défaut)
  const aminataName = await getSetting('city_aminata_name', 'Aminata')

  const subject = `Rendez-vous assigné: ${appointment.reference} — ${appointment.name}`
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #0026A3; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">📅 Rendez-vous assigné</h1>
        <p style="margin: 5px 0 0; opacity: 0.8;">Référence: ${appointment.reference}</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e0e0e0; border-radius: 0 0 12px 12px;">
        <h2 style="color: #0026A3; font-size: 16px; margin-top: 0;">Détails du demandeur</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Nom:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Téléphone:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.phone || 'Non fourni'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.email || 'Non fourni'}</td>
          </tr>
        </table>

        <h2 style="color: #0026A3; font-size: 16px;">Objet du rendez-vous</h2>
        <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0; margin-bottom: 20px;">
          <p style="margin: 0;">${appointment.motif}</p>
        </div>

        <h2 style="color: #0026A3; font-size: 16px;">Informations complémentaires</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Date souhaitée:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.preferredDate || 'Non précisée'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Statut:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${appointment.status}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Date de demande:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(appointment.createdAt).toLocaleString('fr-FR')}</td>
          </tr>
        </table>

        <div style="margin-top: 20px; padding: 15px; background: #FFD700; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-weight: bold; color: #0026A3;">
            ${aminataName} — Ville Connectée
          </p>
          <p style="margin: 5px 0 0; font-size: 12px; color: #666;">
            Connectez-vous au dashboard mairie → onglet Rendez-vous pour confirmer ce RDV.
          </p>
        </div>
      </div>
    </div>
  `

  try {
    await sendEmail(email, subject, html)
    console.log(`[city-appointments-notify] 📧 Email envoyé à ${email} pour RDV ${appointment.reference}`)
    return ok({ sent: true, to: email, reference: appointment.reference })
  } catch (e) {
    console.error('[city-appointments-notify] Erreur envoi email:', e)
    return fail('Erreur lors de l\\'envoi de l\\'email', 500)
  }
}
