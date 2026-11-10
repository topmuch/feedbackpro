// ============================================================
// GET /api/airport/qrcode?tag=<tag>&format=png|pdf
// ------------------------------------------------------------
// Génère le QR code d'un tag URL aéroport (ex: toilettes_T2_porteB).
// Le QR code pointe vers /?airport=<tag> (PWA aéroport voyageur).
//
// Query params :
//   tag (obligatoire) : le tag URL scanné (ex: toilettes_T2_porteB)
//   format (optionnel) : "png" (défaut, data URL) | "pdf" (poster A4)
//
// Réponse PNG : { ok: true, data: { url: "/?airport=<tag>", pngDataUrl, tag, zoneNom, zoneEmoji } }
// Réponse PDF : binary PDF (Content-Type: application/pdf)
//
// Public (pas d'auth) — les QR codes aéroport sont imprimés et
// affichés publiquement dans l'aéroport.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { resoudreZoneParTag } from '@/lib/airport-config'

export const runtime = 'nodejs'

const TAILLE_QR = 1000

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tag = url.searchParams.get('tag')
  const format = url.searchParams.get('format') ?? 'png'

  if (!tag) return fail('Tag manquant', 400)

  // Résoudre le tag → zone (config statique + BDD pour le nom/emoji)
  const config = resoudreZoneParTag(tag)
  if (!config) return fail(`Tag inconnu : ${tag}`, 404)

  const zoneBdd = await db.airportZone.findUnique({ where: { code: config.code } })
  const zoneNom = zoneBdd?.nom ?? config.nom
  const zoneEmoji = zoneBdd?.emoji ?? config.emoji

  // URL publique de la PWA aéroport
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/$/, '')
  const scanUrl = `${appUrl}/?airport=${encodeURIComponent(tag)}`

  // Générer le QR code (PNG data URL, tolérance H pour impression)
  const pngDataUrl = await QRCode.toDataURL(scanUrl, {
    width: TAILLE_QR,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  })

  // Format PDF : poster A4 avec QR + nom zone + instructions
  if (format === 'pdf') {
    const pdfBuffer = await genererPosterPdf(pngDataUrl, tag, zoneNom, zoneEmoji, scanUrl)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="qr-${tag}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  // Format PNG (défaut) : retourne la data URL
  return ok({ url: scanUrl, pngDataUrl, tag, zoneNom, zoneEmoji })
}

/**
 * Génère un poster A4 PDF avec le QR code + le nom de la zone +
 * instructions pour le voyageur.
 */
async function genererPosterPdf(
  pngDataUrl: string,
  tag: string,
  zoneNom: string,
  zoneEmoji: string,
  scanUrl: string,
): Promise<Buffer> {
  // Construction d'un PDF simple via une approche minimaliste :
  // on utilise la lib jsPDF (déjà installée pour les affiches FeedbackPro)
  const { default: jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const pageHeight = 297

  // Bande supérieure (slate-900)
  pdf.setFillColor(15, 23, 42) // slate-900
  pdf.rect(0, 0, pageWidth, 50, 'F')

  // Titre dans la bande
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(28)
  pdf.text(`${zoneEmoji} ${zoneNom}`, pageWidth / 2, 28, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.setTextColor(148, 163, 184) // slate-400
  pdf.text('Scannez pour signaler un problème', pageWidth / 2, 40, { align: 'center' })

  // QR code centré (120×120 mm)
  const qrSize = 120
  const qrX = (pageWidth - qrSize) / 2
  const qrY = 70
  pdf.addImage(pngDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

  // Instructions sous le QR
  pdf.setTextColor(15, 23, 42)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('Comment signaler ?', pageWidth / 2, qrY + qrSize + 18, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  pdf.setTextColor(71, 85, 105) // slate-600
  const instructions = [
    '1. Scannez ce QR code avec votre telephone',
    '2. Selectionnez le probleme rencontre',
    '3. Ajoutez une photo si necessaire',
    '4. Validez — l equipe ops est notifiee',
  ]
  instructions.forEach((line, i) => {
    pdf.text(line, pageWidth / 2, qrY + qrSize + 32 + i * 8, { align: 'center' })
  })

  // Pied de page
  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, pageHeight - 25, pageWidth, 25, 'F')
  pdf.setTextColor(148, 163, 184)
  pdf.setFontSize(9)
  pdf.text('Aeroport Ops — Service voyageur', pageWidth / 2, pageHeight - 14, { align: 'center' })
  pdf.text(`Tag: ${tag}`, pageWidth / 2, pageHeight - 9, { align: 'center' })

  return Buffer.from(pdf.output('arraybuffer'))
}
