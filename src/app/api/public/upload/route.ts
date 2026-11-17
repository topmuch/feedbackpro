import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const DOSSIER_UPLOADS = path.join(DATA_DIR, "uploads")
const EXT_AUTORISEES = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif"])
const MIME_VERS_EXT: Record<string, string> = { "image/webp": ".webp", "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif" }
const TAILLE_MAX = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fichier = formData.get("photo") || formData.get("file") || formData.get("image")
    if (!fichier || !(fichier instanceof File)) return NextResponse.json({ ok: false, error: "Aucun fichier (champ 'photo')" }, { status: 400 })
    const mime = fichier.type
    if (!mime || !mime.startsWith("image/")) return NextResponse.json({ ok: false, error: "Doit être une image" }, { status: 415 })
    if (fichier.size > TAILLE_MAX) return NextResponse.json({ ok: false, error: "Trop lourd (max 10Mo)" }, { status: 413 })
    let ext = MIME_VERS_EXT[mime] || path.extname(fichier.name).toLowerCase()
    if (!ext || !EXT_AUTORISEES.has(ext)) return NextResponse.json({ ok: false, error: "Format non supporté" }, { status: 415 })
    if (!existsSync(DOSSIER_UPLOADS)) await mkdir(DOSSIER_UPLOADS, { recursive: true })
    const hash = crypto.randomBytes(6).toString("hex")
    const nomFichier = `${Date.now()}-${hash}${ext}`
    await writeFile(path.join(DOSSIER_UPLOADS, nomFichier), Buffer.from(await fichier.arrayBuffer()))
    return NextResponse.json({ ok: true, data: { url: `/api/uploads/${nomFichier}`, filename: nomFichier, size: fichier.size } })
  } catch (e) {
    console.error("upload error", e)
    return NextResponse.json({ ok: false, error: "Erreur upload" }, { status: 500 })
  }
}
