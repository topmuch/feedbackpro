// ============================================================
// QR Code Premium — Plaque physique ville connectée
// ============================================================
// Compose un QR code dans un design premium :
//   - Fond anthracite #1A1A1A avec cadre doré #C9A961
//   - Titre "Ville Connectée" (Playfair Display)
//   - Nom de la ville
//   - QR code centré avec logo superposé
//   - Numéro de plaque + "Scannez pour accéder aux services"
//   - Tagline "Aminata · Votre guide citoyenne"
//
// Retourne un dataURL PNG 800x1000 (format plaque portrait)
// ============================================================

const PREMIUM_W = 800
const PREMIUM_H = 1000
const QR_SIZE = 480
const LOGO_BOX = 120

function chargerImage(src: string, avecCors = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (avecCors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function cheminArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

/**
 * Compose un QR code premium pour une plaque ville connectée.
 *
 * @param qrDataUrl - Le QR code brut (depuis api.qrserver.com)
 * @param logoUrl - Logo de la ville (dataURL ou URL https)
 * @param plateNumber - Numéro de la plaque (ex: "#0023")
 * @param cityName - Nom de la ville (ex: "Dakar")
 * @returns dataURL PNG 800x1000
 */
export async function composeQrPremium(
  qrDataUrl: string,
  logoUrl: string | null | undefined,
  plateNumber: string,
  cityName: string = 'Dakar',
): Promise<string> {
  const [qrImg, logoImg] = await Promise.all([
    chargerImage(qrDataUrl),
    logoUrl ? chargerImage(logoUrl, !logoUrl.startsWith('data:')) : Promise.resolve(null),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = PREMIUM_W
  canvas.height = PREMIUM_H
  const ctx = canvas.getContext('2d')
  if (!ctx || !qrImg) return qrDataUrl

  // === 1. Fond anthracite ===
  ctx.fillStyle = '#1A1A1A'
  ctx.fillRect(0, 0, PREMIUM_W, PREMIUM_H)

  // === 2. Cadre doré (double bordure) ===
  // Bordure extérieure
  ctx.strokeStyle = '#C9A961'
  ctx.lineWidth = 4
  cheminArrondi(ctx, 20, 20, PREMIUM_W - 40, PREMIUM_H - 40, 24)
  ctx.stroke()

  // Bordure intérieure (fine)
  ctx.strokeStyle = 'rgba(201, 169, 97, 0.4)'
  ctx.lineWidth = 1
  cheminArrondi(ctx, 30, 30, PREMIUM_W - 60, PREMIUM_H - 60, 20)
  ctx.stroke()

  // === 3. Coins décoratifs dorés ===
  const cornerSize = 40
  ctx.strokeStyle = '#C9A961'
  ctx.lineWidth = 3
  // Coin haut-gauche
  ctx.beginPath()
  ctx.moveTo(40, 40 + cornerSize)
  ctx.lineTo(40, 40)
  ctx.lineTo(40 + cornerSize, 40)
  ctx.stroke()
  // Coin haut-droit
  ctx.beginPath()
  ctx.moveTo(PREMIUM_W - 40 - cornerSize, 40)
  ctx.lineTo(PREMIUM_W - 40, 40)
  ctx.lineTo(PREMIUM_W - 40, 40 + cornerSize)
  ctx.stroke()
  // Coin bas-gauche
  ctx.beginPath()
  ctx.moveTo(40, PREMIUM_H - 40 - cornerSize)
  ctx.lineTo(40, PREMIUM_H - 40)
  ctx.lineTo(40 + cornerSize, PREMIUM_H - 40)
  ctx.stroke()
  // Coin bas-droit
  ctx.beginPath()
  ctx.moveTo(PREMIUM_W - 40 - cornerSize, PREMIUM_H - 40)
  ctx.lineTo(PREMIUM_W - 40, PREMIUM_H - 40)
  ctx.lineTo(PREMIUM_W - 40, PREMIUM_H - 40 - cornerSize)
  ctx.stroke()

  // === 4. Titre "Ville Connectée" ===
  ctx.textAlign = 'center'
  ctx.fillStyle = '#C9A961'
  ctx.font = 'bold 32px Georgia, "Playfair Display", serif'
  ctx.fillText('VILLE CONNECTÉE', PREMIUM_W / 2, 100)

  // === 5. Nom de la ville ===
  ctx.fillStyle = '#FAFAF7'
  ctx.font = '20px Georgia, "Playfair Display", serif'
  ctx.fillText(cityName, PREMIUM_W / 2, 135)

  // === 6. Logo (au-dessus du QR) ===
  if (logoImg) {
    const logoY = 170
    const logoW = 80
    const logoH = 80
    const logoX = (PREMIUM_W - logoW) / 2
    // Fond arrondi blanc derrière le logo
    ctx.fillStyle = '#FFFFFF'
    cheminArrondi(ctx, logoX - 6, logoY - 6, logoW + 12, logoH + 12, 12)
    ctx.fill()
    // Logo "cover"
    const ratio = Math.max(logoW / logoImg.width, logoH / logoImg.height)
    const lw = logoImg.width * ratio
    const lh = logoImg.height * ratio
    ctx.save()
    cheminArrondi(ctx, logoX, logoY, logoW, logoH, 8)
    ctx.clip()
    ctx.drawImage(logoImg, logoX + (logoW - lw) / 2, logoY + (logoH - lh) / 2, lw, lh)
    ctx.restore()
  }

  // === 7. QR Code centré avec fond blanc ===
  const qrX = (PREMIUM_W - QR_SIZE) / 2
  const qrY = 280

  // Fond blanc arrondi derrière le QR
  ctx.fillStyle = '#FFFFFF'
  cheminArrondi(ctx, qrX - 16, qrY - 16, QR_SIZE + 32, QR_SIZE + 32, 16)
  ctx.fill()

  // QR code
  ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE)

  // === 8. Logo superposé au centre du QR (si fourni) ===
  if (logoImg) {
    const overlayX = (PREMIUM_W - LOGO_BOX) / 2
    const overlayY = qrY + (QR_SIZE - LOGO_BOX) / 2
    // Fond blanc arrondi
    ctx.fillStyle = '#FFFFFF'
    cheminArrondi(ctx, overlayX - 6, overlayY - 6, LOGO_BOX + 12, LOGO_BOX + 12, 16)
    ctx.fill()
    // Logo "cover"
    const ratio2 = Math.max(LOGO_BOX / logoImg.width, LOGO_BOX / logoImg.height)
    const lw2 = logoImg.width * ratio2
    const lh2 = logoImg.height * ratio2
    ctx.save()
    cheminArrondi(ctx, overlayX, overlayY, LOGO_BOX, LOGO_BOX, 12)
    ctx.clip()
    ctx.drawImage(logoImg, overlayX + (LOGO_BOX - lw2) / 2, overlayY + (LOGO_BOX - lh2) / 2, lw2, lh2)
    ctx.restore()
  }

  // === 9. Numéro de plaque ===
  ctx.fillStyle = '#C9A961'
  ctx.font = 'bold 36px Georgia, "Playfair Display", serif'
  ctx.fillText(plateNumber, PREMIUM_W / 2, 820)

  // === 10. Call to action ===
  ctx.fillStyle = '#FAFAF7'
  ctx.font = '16px Arial, sans-serif'
  ctx.fillText('Scannez pour accéder aux services', PREMIUM_W / 2, 855)

  // === 11. Tagline Aminata ===
  ctx.fillStyle = 'rgba(201, 169, 97, 0.7)'
  ctx.font = 'italic 14px Georgia, "Playfair Display", serif'
  ctx.fillText('Aminata · Votre guide citoyenne', PREMIUM_W / 2, 890)

  // === 12. FeedVoice branding (bas) ===
  ctx.fillStyle = 'rgba(250, 250, 247, 0.3)'
  ctx.font = '11px Arial, sans-serif'
  ctx.fillText('FeedVoice', PREMIUM_W / 2, 950)

  return canvas.toDataURL('image/png')
}

/**
 * Génère l'URL du QR code brut depuis api.qrserver.com
 */
export function qrServerUrl(data: string, size: number = 400): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
}
