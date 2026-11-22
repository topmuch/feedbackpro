// ============================================================
// FeedVoice - Cron : sauvegarde SQLite automatique
// GET /api/cron/backup-db
// ------------------------------------------------------------
// Planifiable chaque nuit (ex. 3h00) via le même mécanisme que les
// autres /api/cron/* (Authorization: Bearer $CRON_SECRET) :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://feedback.qrbags.com/api/cron/backup-db
//
// Mécanisme : SQLite `VACUUM INTO` → snapshot consistant (compatible
// concurrent writes, contrairement à un simple copyFileSync) vers
// db/backups/feedvoice-<timestamp>.db, puis rotation : garde les 7
// sauvegardes les plus récentes.
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import { db } from "@/lib/db"
import fs from "fs"
import path from "path"

/** Nombre de sauvegardes conservées. */
const RETENTION = 7

/** Résout le chemin absolu du fichier SQLite depuis DATABASE_URL. */
function cheminDb(): string {
  const url = process.env.DATABASE_URL ?? ""
  // Format attendu : file:/absolu/custom.db
  if (url.startsWith("file:")) {
    const p = url.slice("file:".length)
    if (path.isAbsolute(p)) return p
    return path.join(process.cwd(), p)
  }
  return path.join(process.cwd(), "db", "custom.db")
}

/** Alphanumérique, /, -, _, . — anti-injection pour VACUUM INTO (SQL brut). */
function cheminSur(chaine: string): boolean {
  return /^[A-Za-z0-9/_.-]+$/.test(chaine) && !chaine.includes("..")
}

export async function GET(req: NextRequest) {
  try {
    // ---------- Sécurité : CRON_SECRET obligatoire (même pattern que les crons rapports) ----------
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return fail("Cron non configuré (CRON_SECRET absent)", 501)
    }
    const auth = req.headers.get("authorization") ?? ""
    if (auth !== `Bearer ${secret}`) {
      return fail("Non autorisé", 401)
    }

    const source = cheminDb()
    if (!fs.existsSync(source)) {
      return fail(`Base introuvable : ${source}`, 500)
    }

    const dossier = path.join(path.dirname(source), "backups")
    fs.mkdirSync(dossier, { recursive: true })

    const nom = `feedvoice-${new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19)}.db`
    const cible = path.join(dossier, nom)

    if (!cheminSur(cible)) {
      return fail("Chemin de sauvegarde invalide", 500)
    }

    // Snapshot consistant (SQLite >= 3.27). Paramétrage impossible avec
    // VACUUM INTO → chemin validé par cheminSur() ci-dessus.
    await db.$executeRawUnsafe(`VACUUM INTO '${cible}'`)

    // ---------- Rotation : garde les RETENTION plus récentes ----------
    const fichiers = fs
      .readdirSync(dossier)
      .filter((f) => f.startsWith("feedvoice-") && f.endsWith(".db"))
      .map((f) => {
        const st = fs.statSync(path.join(dossier, f))
        return { nom: f, mtime: st.mtimeMs, taille: st.size }
      })
      .sort((a, b) => b.mtime - a.mtime)

    const supprimes: string[] = []
    for (const f of fichiers.slice(RETENTION)) {
      try {
        fs.unlinkSync(path.join(dossier, f.nom))
        supprimes.push(f.nom)
      } catch {
        /* suppression best-effort */
      }
    }

    const dernier = fichiers[0]
    return ok({
      fichier: nom,
      tailleOctets: dernier?.taille ?? 0,
      conserves: Math.min(fichiers.length, RETENTION),
      supprimes,
    })
  } catch (e) {
    console.error("cron backup-db error", e)
    return fail("Erreur serveur lors de la sauvegarde", 500)
  }
}
