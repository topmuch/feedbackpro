// ============================================================
// API publique - Upload d'une photo jointe à un retour client (D2)
// POST /api/public/upload  (multipart/form-data, champ "photo")
// → { ok: true, data: { url: "/uploads/<hash>.webp" } }
//
// Contraintes :
//   - Public (pas d'auth) : appelé depuis la page de scan client
//   - Max 5 Mo
//   - MIME acceptés : image/png, image/jpeg, image/webp, image/gif
//   - Redimensionnement côté serveur avec sharp (max 1280×1280, cover)
//   - Conversion WebP pour limiter le poids et normaliser le format
//   - Nom de fichier aléatoire (crypto.randomUUID) — jamais le nom original
//     (anti-énumération / anti-fuite de métadonnées)
//   - Sauvegarde dans public/uploads/ (servi statiquement par Next.js)
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import sharp from "sharp"
import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

const MAX_BYTES = 5 * 1024 * 1024 // 5 Mo
const MIME_AUTORISES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
])
const DOSSIER_UPLOADS = path.join(process.cwd(), "public", "uploads")
const MAX_DIMENSION = 1280

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(() => null)
    if (!formData) return fail("Requête multipart invalide", 400)

    const fichier = formData.get("photo")
    if (!fichier || !(fichier instanceof File)) {
      return fail("Aucune photo reçue (champ « photo » manquant)", 400)
    }

    // ---------- Validation taille + MIME ----------
    if (fichier.size > MAX_BYTES) {
      return fail("Photo trop volumineuse (5 Mo maximum)", 413)
    }
    // fichier.type peut être vide pour certains navigateurs : on se fie aussi
    // à l'extension du nom original en dernier recours.
    const mime = fichier.type || mimeDepuisNom(fichier.name)
    if (!mime || !MIME_AUTORISES.has(mime.toLowerCase())) {
      return fail("Format de photo non supporté (PNG, JPEG, WebP ou GIF)", 415)
    }

    // ---------- Lecture + redimensionnement (sharp) ----------
    const buffer = Buffer.from(await fichier.arrayBuffer())
    // sharp ignore les erreurs d'entête en mode `failOn: "truncated"` ; on
    // reste strict pour refuser les fichiers corrompus.
    let imageRedimensionnee: Buffer
    try {
      imageRedimensionnee = await sharp(buffer, { failOn: "error" })
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer()
    } catch (e) {
      console.warn("upload photo : sharp a rejeté l'image", e)
      return fail("Image illisible ou corrompue", 400)
    }

    // ---------- Sauvegarde sur disque (public/uploads/) ----------
    if (!existsSync(DOSSIER_UPLOADS)) {
      try {
        await mkdir(DOSSIER_UPLOADS, { recursive: true })
      } catch (e) {
        console.error("upload photo : mkdir impossible", e)
        return fail("Stockage indisponible", 500)
      }
    }
    const nom = `${randomUUID()}.webp`
    const cheminComplet = path.join(DOSSIER_UPLOADS, nom)
    try {
      await writeFile(cheminComplet, imageRedimensionnee)
    } catch (e) {
      console.error("upload photo : écriture impossible", e)
      return fail("Stockage indisponible", 500)
    }

    // URL relative servie statiquement par Next.js
    return ok({ url: `/uploads/${nom}` })
  } catch (e) {
    console.error("upload photo error", e)
    return fail("Erreur serveur lors de l'upload", 500)
  }
}

/** Déduit le MIME depuis l'extension du nom de fichier (repli si type absent) */
function mimeDepuisNom(nom: string): string | null {
  const ext = path.extname(nom).toLowerCase()
  switch (ext) {
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".gif":
      return "image/gif"
    default:
      return null
  }
}
