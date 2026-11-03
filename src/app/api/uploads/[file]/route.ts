// ============================================================
// API - Sert les images uploadées depuis le stockage persistant
// GET /api/uploads/[file]  → image WebP/JPEG/PNG
//
// Les images sont stockées dans /app/data/uploads/ (volume Docker persistant)
// ou <cwd>/data/uploads/ en dev. Cette route les sert avec les bons headers
// de cache (immutable, 1 an) et le Content-Type correct.
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const DOSSIER_UPLOADS = path.join(DATA_DIR, "uploads")

// MIME types supportés
const MIME_MAP: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params

    // Sécurité : refuser les paths traversaux (../, /, etc.)
    if (!file || file.includes("/") || file.includes("..") || file.includes("\\")) {
      return NextResponse.json({ ok: false, error: "Fichier invalide" }, { status: 400 })
    }

    // Valider l'extension
    const ext = path.extname(file).toLowerCase()
    const contentType = MIME_MAP[ext]
    if (!contentType) {
      return NextResponse.json({ ok: false, error: "Format non supporté" }, { status: 415 })
    }

    const cheminComplet = path.join(DOSSIER_UPLOADS, file)

    // Vérifier l'existence
    if (!existsSync(cheminComplet)) {
      return NextResponse.json({ ok: false, error: "Image introuvable" }, { status: 404 })
    }

    // Lire et servir
    const buffer = await readFile(cheminComplet)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.error("uploads serve error", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }
}
