// ============================================================
// GET /api/airport/staff-qrcode?tag=<staffTag>&format=png|pdf
// ------------------------------------------------------------
// Génère un QR code "Staff Only" pour les employés.
// URL encodée: /?staff=<tag>
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'

const TAILLE_QR = 1000

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tag = url.searchParams.get('tag')
  const format = url.searchParams.get('format') ?? 'png'

  if (!tag) return fail('Tag staff manquant', 400)

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || url.origin).replace(/\/$/, '')
  const scanUrl = `${appUrl}/?staff=${encodeURIComponent(tag)}`

  const pngDataUrl = await QRCode.toDataURL(scanUrl, {
    width: TAILLE_QR,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#5257C9', light: '#ffffff' },
  })

  if (format === 'pdf') {
    const { default: jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = 210

    // Bande indigo
    pdf.setFillColor(82, 87, 201)
    pdf.rect(0, 0, pageWidth, 50, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(28)
    pdf.text('STAFF ONLY', pageWidth / 2, 28, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.setTextColor(200, 200, 220)
    pdf.text('QR code employé — FeedbackPro', pageWidth / 2, 40, { align: 'center' })

    // QR code
    const qrSize = 120
    const qrX = (pageWidth - qrSize) / 2
    pdf.addImage(pngDataUrl, 'PNG', qrX, 65, qrSize, qrSize)

    // Instructions
    pdf.setTextColor(30, 30, 46)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('Scan employé', pageWidth / 2, 210, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(12)
    pdf.setTextColor(100, 100, 120)
    const instr = [
      '1. Scannez ce QR avec votre telephone',
      '2. Choisissez: Prendre en charge / Resolu / Signaler',
      '3. Prenez une photo (avant / apres)',
      '4. Le wallboard est notifie en temps reel',
    ]
    instr.forEach((line, i) => {
      pdf.text(line, pageWidth / 2, 225 + i * 8, { align: 'center' })
    })

    // Pied
    pdf.setFillColor(82, 87, 201)
    pdf.rect(0, 272, pageWidth, 25, 'F')
    pdf.setTextColor(200, 200, 220)
    pdf.setFontSize(9)
    pdf.text(`Tag: ${tag}`, pageWidth / 2, 285, { align: 'center' })

    return new NextResponse(new Uint8Array(Buffer.from(pdf.output('arraybuffer'))), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="qr-staff-${tag}.pdf"`,
      },
    })
  }

  return ok({ url: scanUrl, pngDataUrl, tag })
}
