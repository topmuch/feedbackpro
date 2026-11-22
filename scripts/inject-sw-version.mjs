// ============================================================
// FeedVoice - Auto-versionnement du Service Worker au build
// ------------------------------------------------------------
// Problème historique : le CACHE_NAME du SW (public/sw.js) était
// bumpé À LA MAIN à chaque changement visuel (v7, v8, v9…) — quand
// l'oubli survenait, les visiteurs PWA hors-ligne gardaient l'ancien
// shell (bug « l'ancienne image est toujours là »).
//
// Solution : ce script tourne en `prebuild` (bun run build) et
// réécrit CACHE_NAME avec une version unique par build :
//   1. SOURCE_COMMIT  (injecté par Coolify — SHA du déploiement)
//   2. GIT_COMMIT_SHA (variante selon le runtime CI)
//   3. fallback timestamp (build local sans git)
// → chaque déploiement purge automatiquement les caches v<version
//   (le handler activate du SW supprime tout cache ≠ courant).
//
// En dev (bun run dev), le script ne tourne pas : la valeur statique
// du fichier reste utilisée — comportement inchangé.
// ============================================================

import fs from "node:fs"
import path from "node:path"

const CHEMIN_SW = path.join(process.cwd(), "public", "sw.js")

const brut = String(
  process.env.SOURCE_COMMIT || process.env.GIT_COMMIT_SHA || ""
).trim()

// Garde-fou : alphanumérique + tirets uniquement (valeur embarquée dans
// un littéral JS) ; 24 chars max (SHA complet inutile).
const version =
  brut.replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || `t${Date.now()}`

let source
try {
  source = fs.readFileSync(CHEMIN_SW, "utf8")
} catch {
  console.warn("[sw-version] public/sw.js introuvable — ignoré")
  process.exit(0)
}

const regex = /const CACHE_NAME = "feedvoice-airport-[^"]*"/
if (!regex.test(source)) {
  console.warn("[sw-version] CACHE_NAME introuvable dans sw.js — inchangé")
  process.exit(0)
}

source = source.replace(regex, `const CACHE_NAME = "feedvoice-airport-${version}"`)
fs.writeFileSync(CHEMIN_SW, source)
console.log(`[sw-version] CACHE_NAME → feedvoice-airport-${version}`)
