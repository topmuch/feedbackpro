// ============================================================
// POST /api/public/upload — Upload d'une photo (multipart "photo")
// ------------------------------------------------------------
// Redimensionne via sharp (max 1280px, WebP) et stocke dans
// data/uploads/<uuid>.webp. Retourne l'URL relative.
//
// Utilisé par la PWA aéroport (et le scan-view FeedbackPro).
// Public (pas d'auth) — le voyageur n'est pas connecté.
//
// ROBUSTESSE : crée les dossiers data/ et data/uploads/ s'ils
// n'existent pas (déploiement frais sans volume persistant).
// Si sharp échoue, sauvegarde l'image brute sans redimensionnement
// (mieux que de rejeter la photo).
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import sharp from "sharp"
import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024 // 5 Mo
const MIME_AUTORISES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
])

const MAX_DIMENSION = 1280

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData().catch(() => null)
    if (!formData) return fail("Requête multipart invalide", 400)

    const fichier = formData.get("photo")
    if (!fichier || !(fichier instanceof File)) {
      return fail('Aucune photo reçue (champ "photo" manquant)', 400)
    }

    // ---------- Validation taille + MIME ----------
    if (fichier.size > MAX_BYTES) {
      return fail("Photo trop volumineuse (5 Mo maximum)", 413)
    }
    const mime = (fichier.type || "").toLowerCase()
    if (!mime || !MIME_AUTORISES.has(mime)) {
      return fail("Format non supporté (PNG, JPEG, WebP ou GIF)", 415)
    }

    // ---------- Lecture du buffer ----------
    const buffer = Buffer.from(await fichier.arrayBuffer())

    // ---------- Dossiers de stockage ----------
    // data/ puis data/uploads/ — créés récursivement si absents
    // (déploiement frais sans volume persistant).
    const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
    const DOSSIER_UPLOADS = path.join(DATA_DIR, "uploads")
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true })
    }
    if (!existsSync(DOSSIER_UPLOADS)) {
      await mkdir(DOSSIER_UPLOADS, { recursive: true })
    }

    const nom = `${randomUUID()}.webp`
    const cheminComplet = path.join(DOSSIER_UPLOADS, nom)

    // ---------- Redimensionnement + conversion WebP ----------
    // Si sharp échoue (environnement sans native bindings), on
    // sauvegarde l'image brute avec son extension d'origine (mieux
    // que de rejeter la photo du voyageur).
    let urlFinale: string
    try {
      const imageRedimensionnee = await sharp(buffer, { failOn: "error" })
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
      await writeFile(cheminComplet, imageRedimensionnee)
      urlFinale = `/api/uploads/${nom}`
      console.log(`[upload] Photo sauvée : ${urlFinale} (${(imageRedimensionnee.length / 1024).toFixed(0)} Ko)`)
    } catch (err) {
      // Fallback : sauvegarde brute sans sharp
      console.warn("[upload] sharp error, fallback sauvegarde brute:", err instanceof Error ? err.message : String(err))
      const ext = mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "jpg"
      const nomBrut = `${randomUUID()}.${ext}`
      await writeFile(path.join(DOSSIER_UPLOADS, nomBrut), buffer)
      urlFinale = `/api/uploads/${nomBrut}`
      console.log(`[upload] Photo brute sauvée (fallback) : ${urlFinale} (${(buffer.length / 1024).toFixed(0)} Ko)`)
    }

    return ok({ url: urlFinale })
  } catch (err) {
    console.error("[upload] Erreur:", err)
    return fail("Erreur serveur lors de l'upload", 500)
  }
}
