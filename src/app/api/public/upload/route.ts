// ============================================================
// POST /api/public/upload
// ------------------------------------------------------------
// Upload d'image (multipart/form-data, champ "photo").
// Sauvegarde dans data/uploads/ avec un nom unique.
// Retourne l'URL relative pour afficher l'image via /api/uploads/[file].
//
// Utilisé par :
//   - Flash Rewards (visuel campagne 1200x800)
//   - Staff PWA (body cam photos AVANT/APRÈS)
//   - Signalement voyageur (photo problème)
//   - Resolve confirm (photo après résolution)
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const DOSSIER_UPLOADS = path.join(DATA_DIR, "uploads")

// Extensions autorisées
const EXT_AUTORISEES = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif"])
const MIME_VERS_EXT: Record<string, string> = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
}

// Taille max : 10 Mo
const TAILLE_MAX = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fichier = formData.get("photo") || formData.get("file") || formData.get("image")

    if (!fichier || !(fichier instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Aucun fichier reçu (champ 'photo' requis)" },
        { status: 400 },
      )
    }

    // Valider le type MIME
    const mime = fichier.type
    if (!mime || !mime.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "Le fichier doit être une image" },
        { status: 415 },
      )
    }

    // Valider la taille
    if (fichier.size > TAILLE_MAX) {
      return NextResponse.json(
        { ok: false, error: `Fichier trop lourd (max ${TAILLE_MAX / 1024 / 1024} Mo)` },
        { status: 413 },
      )
    }

    // Déterminer l'extension
    let ext = MIME_VERS_EXT[mime]
    if (!ext) {
      ext = path.extname(fichier.name).toLowerCase()
    }
    if (!ext || !EXT_AUTORISEES.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "Format non supporté (webp, jpg, png, gif)" },
        { status: 415 },
      )
    }

    // Créer le dossier s'il n'existe pas
    if (!existsSync(DOSSIER_UPLOADS)) {
      await mkdir(DOSSIER_UPLOADS, { recursive: true })
    }

    // Nom unique : timestamp + hash court
    const hash = crypto.randomBytes(6).toString("hex")
    const timestamp = Date.now()
    const nomFichier = `${timestamp}-${hash}${ext}`
    const cheminComplet = path.join(DOSSIER_UPLOADS, nomFichier)

    // Écrire le fichier
    const bytes = await fichier.arrayBuffer()
    await writeFile(cheminComplet, Buffer.from(bytes))

    // URL relative (servie par /api/uploads/[file])
    const url = `/api/uploads/${nomFichier}`

    return NextResponse.json({
      ok: true,
      data: { url, filename: nomFichier, size: fichier.size },
    })
  } catch (e) {
    console.error("upload error", e)
    return NextResponse.json(
      { ok: false, error: "Erreur lors de l'upload" },
      { status: 500 },
    )
  }
}
