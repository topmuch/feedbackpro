// ============================================================
// FeedbackPro - Utilitaires QR code côté client
// Superposition du logo du commerce au centre du QR code
// (la tolérance d'erreur "H" du QR autorise ~30 % d'occultation)
// ============================================================

const TAILLE_QR = 1000 // PNG haute résolution livré au Pro
const BOITE_LOGO = 240 // ~24 % de la surface : marge de sécurité sous la limite de 30 %

/** Charge une image (dataURL ou URL https) ; résout null en cas d'échec */
function chargerImage(src: string, avecCors = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (avecCors) img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Rectangle arrondi avec repli si l'API roundRect n'est pas disponible */
function cheminArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === "function") {
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
 * Compose le QR final : QR + logo centré (si fourni).
 * Retourne un dataURL PNG 1000x1000, ou le QR d'origine si le logo
 * est indisponible (échec de chargement, CORS, etc.).
 */
export async function composeQrAvecLogo(qrDataUrl: string, logoUrl: string | null | undefined): Promise<string> {
  if (!logoUrl) return qrDataUrl
  try {
    const [qrImg, logoImg] = await Promise.all([
      chargerImage(qrDataUrl),
      chargerImage(logoUrl, !logoUrl.startsWith("data:")),
    ])
    if (!qrImg) return qrDataUrl

    const canvas = document.createElement("canvas")
    canvas.width = TAILLE_QR
    canvas.height = TAILLE_QR
    const ctx = canvas.getContext("2d")
    if (!ctx) return qrDataUrl

    ctx.drawImage(qrImg, 0, 0, TAILLE_QR, TAILLE_QR)

    if (logoImg) {
      const x = (TAILLE_QR - BOITE_LOGO) / 2
      const rayon = 28

      // Fond blanc arrondi : respiration autour du logo pour la lisibilité du QR
      ctx.fillStyle = "#ffffff"
      cheminArrondi(ctx, x - 10, x - 10, BOITE_LOGO + 20, BOITE_LOGO + 20, rayon + 6)
      ctx.fill()

      // Logo recadré en "cover", coins arrondis
      const ratio = Math.max(BOITE_LOGO / logoImg.width, BOITE_LOGO / logoImg.height)
      const l = logoImg.width * ratio
      const h = logoImg.height * ratio
      ctx.save()
      cheminArrondi(ctx, x, x, BOITE_LOGO, BOITE_LOGO, rayon - 8)
      ctx.clip()
      ctx.drawImage(logoImg, x + (BOITE_LOGO - l) / 2, x + (BOITE_LOGO - h) / 2, l, h)
      ctx.restore()
    }

    return canvas.toDataURL("image/png")
  } catch {
    // En cas d'échec (CORS, image cassée…) on livre le QR sans logo
    return qrDataUrl
  }
}

/**
 * Normalise un logo en dataURL utilisable par jsPDF / <img>.
 * - data: URL → renvoyée telle quelle
 * - URL https → chargée avec CORS puis redessinée sur canvas (256px max)
 * - échec → null (le PDF sera généré sans logo)
 */
export async function logoVersDataUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null
  if (logoUrl.startsWith("data:")) return logoUrl
  try {
    const img = await chargerImage(logoUrl, true)
    if (!img) return null
    const max = 256
    const ratio = Math.min(max / img.width, max / img.height, 1)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(img.width * ratio))
    canvas.height = Math.max(1, Math.round(img.height * ratio))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}
