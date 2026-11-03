// ============================================================
// API publique - Upload d'une photo jointe à un retour client (D2)
// POST /api/public/upload  (multipart/form-data, champ "photo")
// → { ok: true, data: { url: "/api/uploads/<hash>.webp" } }
//
// Stockage PERSISTANT : /app/data/uploads/ (volume Docker persistant)
// En dev : <cwd>/data/uploads/
// Les images sont servies via GET /api/uploads/[file] (route dynamique).
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

// Dossier persistant : /app/data/uploads/ en production (volume Docker),
// <cwd>/data/uploads/ en dev. On ne stocke JAMAIS dans public/uploads/
// car ce dossier n'est pas persistant en production (perdu à chaque rebuild).
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const DOSSIER_UPLOADS = path.join(DATA_DIR, "uploads")
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
    const mime = fichier.type || mimeDepuisNom(fichier.name)
    if (!mime || !MIME_AUTORISES.has(mime.toLowerCase())) {
      return fail("Format de photo non supporté (PNG, JPEG, WebP ou GIF)", 415)
    }

    // ---------- Lecture + redimensionnement (sharp) ----------
    const buffer = Buffer.from(await fichier.arrayBuffer())
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

    // ---------- Sauvegarde sur disque (data/uploads/ — PERSISTANT) ----------
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

    // URL servie via la route dynamique /api/uploads/[file]
    return ok({ url: `/api/uploads/${nom}` })
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
