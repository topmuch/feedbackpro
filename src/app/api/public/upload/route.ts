// ============================================================
// POST /api/public/upload  (multipart/form-data, champ "photo")
// ------------------------------------------------------------
// Upload d'une image côté client (photos voyageur, photos staff
// avant/après, logos, etc.). L'image est redimensionnée/compressée
// en WebP via sharp, puis stockée dans data/uploads/ (volume
// persistant). Servie ensuite par GET /api/uploads/[file].
//
// Body (multipart/form-data) :
//   - photo : fichier image (PNG / JPEG / WebP / GIF) — max 8 Mo
//
// Réponse :
//   200 { ok: true, data: { url: "/api/uploads/<uuid>.webp" } }
//   400 { ok: false, error: string }
//   413 { ok: false, error: "Image trop volumineuse" }
//   415 { ok: false, error: "Format non supporté" }
// ============================================================

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/session'
import sharp from 'sharp'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const DOSSIER_UPLOADS = path.join(DATA_DIR, 'uploads')

const MAX_SIZE = 8 * 1024 * 1024 // 8 Mo
const MAX_WIDTH = 1600 // px — on redimensionne tout ce qui dépasse
const WEBP_QUALITY = 80

const ACCEPTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

export async function POST(req: NextRequest) {
  try {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return fail('Payload multipart/form-data invalide', 400)
    }

    const file = formData.get('photo')
    if (!file || !(file instanceof File)) {
      return fail('Champ "photo" manquant (fichier attendu)', 400)
    }

    if (file.size > MAX_SIZE) {
      return fail(`Image trop volumineuse (max ${MAX_SIZE / 1024 / 1024} Mo)`, 413)
    }

    if (!ACCEPTED_MIME.has(file.type)) {
      return fail(
        `Format non supporté : ${file.type || 'inconnu'} (PNG, JPEG, WebP, GIF acceptés)`,
        415,
      )
    }

    // Lecture du buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Conversion WebP via sharp — redimensionne si > MAX_WIDTH
    // (préserve l'aspect ratio). Optimise le stockage et le temps de
    // transfert (une photo iPhone 12MP passe de 4Mo → ~150Ko).
    let pipeline = sharp(buffer, { failOn: 'none' }).rotate() // auto-rotate depuis EXIF
    const metadata = await pipeline.metadata().catch(() => null)
    if (metadata && metadata.width && metadata.width > MAX_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true })
    }
    const webpBuffer = await pipeline
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    // S'assure que le dossier d'uploads existe
    if (!existsSync(DOSSIER_UPLOADS)) {
      await mkdir(DOSSIER_UPLOADS, { recursive: true })
    }

    // Nom de fichier unique : <uuid>.webp
    const filename = `${randomUUID()}.webp`
    const cheminComplet = path.join(DOSSIER_UPLOADS, filename)
    await writeFile(cheminComplet, webpBuffer)

    const url = `/api/uploads/${filename}`
    console.log(
      `[public/upload] Photo uploadée : ${filename} — ${(webpBuffer.length / 1024).toFixed(0)} Ko (origine ${file.size} Octets)`,
    )

    return ok({ url, size: webpBuffer.length, originalName: file.name })
  } catch (err) {
    console.error('[public/upload] Erreur inattendue :', err)
    return fail("Erreur lors de l'upload", 500)
  }
}
