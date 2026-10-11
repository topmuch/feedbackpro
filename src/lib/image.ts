// ============================================================
// FeedbackPro - Utilitaire image côté client uniquement
// Redimensionne un fichier image en data URL compacte (logo)
// ============================================================

const LOGO_MAX_SIDE = 256 // px — suffisant pour un logo de scan/dashboard
const LOGO_QUALITY = 0.85

/**
 * Lit un fichier image, le redimensionne (max 256px de côté, fond blanc
 * pour la transparence) et renvoie une data URL JPEG compacte.
 * Lève une Error avec un message français si le fichier est invalide.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error("Format non supporté (PNG, JPEG ou WebP attendu)")
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image trop volumineuse (8 Mo maximum)")
  }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas indisponible sur ce navigateur")

    // Fond blanc : évite le fond noir lors de la conversion JPEG des PNG transparents
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL("image/jpeg", LOGO_QUALITY)
  } finally {
    bitmap.close()
  }
}
