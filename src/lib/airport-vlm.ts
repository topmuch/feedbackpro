// ============================================================
// FeedbackPro — Analyse VLM des photos de signalements aéroport
// ------------------------------------------------------------
// Utilise le modèle de vision de z-ai-web-dev-sdk (backend only)
// pour catégoriser automatiquement les photos envoyées par les
// voyageurs et router le signalement vers la bonne équipe ops.
//
// Flow :
//   1. Le voyageur upload une photo via /api/public/upload
//   2. POST /api/airport/report crée le signalement puis appelle
//      analyserPhotoAirport(photoUrl) EN ASYNCHRONE (non bloquant)
//   3. Le VLM retourne { category, team, urgency, description }
//   4. On met à jour AirportReport avec photoCategory, routedTeam,
//      photoAnalysis
//
// En cas d'échec VLM (réseau, SDK indisponible, JSON invalide),
// on dégrade silencieusement — le signalement reste valide, juste
// sans auto-catégorisation. L'ops le traite manuellement.
// ============================================================

import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

// --- Catégories connues (mappées à des équipes ops) ---
// Le VLM doit choisir parmi ces catégories. Si la photo ne match
// aucune, il retourne "autre" et le signalement reste non routé.

export type AirportPhotoCategory =
  | "poubelle_pleine"
  | "papier_toilette_epuise"
  | "savon_epuise"
  | "sol_sale"
  | "cuvette_sale"
  | "chasse_eau_cassee"
  | "robinet_fuit"
  | "prise_usb_cassee"
  | "borne_recharge_hs"
  | "wifi_degrade"
  | "siege_casse"
  | "tapis_arrete"
  | "tapis_bloque"
  | "chariot_manquant"
  | "bagage_endommage"
  | "file_longue"
  | "guichet_ferme"
  | "bac_manquant"
  | "temperature_anormale"
  | "table_sale"
  | "distributeur_panne"
  | "prix_non_affiche"
  | "autre"

export type OpsTeam = "nettoyage" | "maintenance" | "securite" | "accueil" | "logistique" | "autre"

/** Mapping catégorie → équipe ops responsable */
const CATEGORY_TO_TEAM: Record<AirportPhotoCategory, OpsTeam> = {
  poubelle_pleine: "nettoyage",
  papier_toilette_epuise: "nettoyage",
  savon_epuise: "nettoyage",
  sol_sale: "nettoyage",
  cuvette_sale: "nettoyage",
  table_sale: "nettoyage",
  chasse_eau_cassee: "maintenance",
  robinet_fuit: "maintenance",
  prise_usb_cassee: "maintenance",
  borne_recharge_hs: "maintenance",
  siege_casse: "maintenance",
  distributeur_panne: "maintenance",
  tapis_arrete: "logistique",
  tapis_bloque: "logistique",
  chariot_manquant: "logistique",
  bagage_endommage: "accueil",
  file_longue: "securite",
  guichet_ferme: "securite",
  bac_manquant: "securite",
  wifi_degrade: "maintenance",
  temperature_anormale: "maintenance",
  prix_non_affiche: "accueil",
  autre: "autre",
}

export type PhotoAnalysisResult = {
  category: AirportPhotoCategory
  team: OpsTeam
  urgency: "faible" | "moyenne" | "elevee" | "critique"
  description: string
  objects_detected: string[]
  confidence: number  // 0-1
}

/** Labels lisibles pour l'affichage wallboard/dashboard */
export const CATEGORY_LABELS: Record<AirportPhotoCategory, { fr: string; emoji: string }> = {
  poubelle_pleine: { fr: "Poubelle pleine", emoji: "🗑️" },
  papier_toilette_epuise: { fr: "Papier toilette épuisé", emoji: "🧻" },
  savon_epuise: { fr: "Savon/gel épuisé", emoji: "🧼" },
  sol_sale: { fr: "Sol sale", emoji: "🧹" },
  cuvette_sale: { fr: "Cuvette sale", emoji: "🚽" },
  chasse_eau_cassee: { fr: "Chasse d'eau cassée", emoji: "💧" },
  robinet_fuit: { fr: "Robinet qui fuit", emoji: "🔧" },
  prise_usb_cassee: { fr: "Prise USB cassée", emoji: "🔌" },
  borne_recharge_hs: { fr: "Borne de recharge HS", emoji: "🔋" },
  wifi_degrade: { fr: "Wi-Fi dégradé", emoji: "📶" },
  siege_casse: { fr: "Siège cassé", emoji: "🪑" },
  tapis_arrete: { fr: "Tapis arrêté", emoji: "🛢️" },
  tapis_bloque: { fr: "Tapis bloqué", emoji: "🛑" },
  chariot_manquant: { fr: "Chariots manquants", emoji: "🛒" },
  bagage_endommage: { fr: "Bagage endommagé", emoji: "🧳" },
  file_longue: { fr: "File d'attente longue", emoji: "⏳" },
  guichet_ferme: { fr: "Guichet fermé", emoji: "🚫" },
  bac_manquant: { fr: "Bacs manquants (sécurité)", emoji: "🧺" },
  temperature_anormale: { fr: "Température anormale", emoji: "🌡️" },
  table_sale: { fr: "Table non débarrassée", emoji: "🍽️" },
  distributeur_panne: { fr: "Distributeur en panne", emoji: "🤖" },
  prix_non_affiche: { fr: "Prix non affiché", emoji: "💰" },
  autre: { fr: "Autre / non catégorisé", emoji: "❓" },
}

export const TEAM_LABELS: Record<OpsTeam, { fr: string; emoji: string; color: string }> = {
  nettoyage: { fr: "Nettoyage", emoji: "🧹", color: "emerald" },
  maintenance: { fr: "Maintenance", emoji: "🔧", color: "amber" },
  securite: { fr: "Sécurité", emoji: "🛡️", color: "rose" },
  accueil: { fr: "Accueil", emoji: "👋", color: "sky" },
  logistique: { fr: "Logistique bagages", emoji: "🛃", color: "violet" },
  autre: { fr: "Non routé", emoji: "❓", color: "slate" },
}

const VLM_TIMEOUT_MS = 20_000

/**
 * Analyse une photo de signalement aéroport via le VLM.
 * Retourne null en cas d'échec (jamais d'exception).
 */
export async function analyserPhotoAirport(photoUrl: string): Promise<PhotoAnalysisResult | null> {
  try {
    // --- Lecture de l'image depuis le disque et conversion base64 ---
    // Le VLM est un service distant : il ne peut pas accéder à
    // localhost:3000/api/uploads/... On lit donc le fichier WebP
    // directement depuis data/uploads/ et on l'envoie en base64.
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data")
    // photoUrl = "/api/uploads/<uuid>.webp" → on extrait le nom de fichier
    const fileName = photoUrl.split("/").pop() || ""
    const filePath = path.join(dataDir, "uploads", fileName)
    if (!fileName || !existsSync(filePath)) {
      console.warn(`[airport-vlm] Fichier photo introuvable: ${filePath}`)
      return null
    }
    const imageBuffer = await readFile(filePath)
    const base64Image = imageBuffer.toString("base64")
    const imageUrl = `data:image/webp;base64,${base64Image}`

    const zai = await ZAI.create()

    const prompt = `Tu es un assistant ops aéroport. Analyse cette photo de signalement envoyée par un voyageur.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte avant/après) au format:
{
  "category": "<une des catégories suivantes exactement>",
  "urgency": "faible|moyenne|elevee|critique",
  "description": "<description courte en français, max 120 chars>",
  "objects_detected": ["<objet1>", "<objet2>"],
  "confidence": <nombre entre 0 et 1>
}

Catégories autorisées (choisis la plus précise):
- poubelle_pleine, papier_toilette_epuise, savon_epuise, sol_sale, cuvette_sale, table_sale
- chasse_eau_cassee, robinet_fuit, prise_usb_cassee, borne_recharge_hs, siege_casse, distributeur_panne, wifi_degrade, temperature_anormale
- tapis_arrete, tapis_bloque, chariot_manquant, bagage_endommage
- file_longue, guichet_ferme, bac_manquant
- prix_non_affiche
- autre (si rien ne match)

Niveau d'urgence:
- critique: risque sécurité, feu, fuite importante, tapis complètement arrêté
- elevee: service totalement bloqué, file très longue, équipement HS
- moyenne: service dégradé mais utilisable, saleté visible
- faible: problème mineur, esthétique, confort

Sois factuel, basé uniquement sur ce que tu vois. Si la photo est floue ou inutilisable, mets confidence bas (<0.4) et category "autre".`

    // Le SDK z-ai-web-dev-sdk expose createVision mais les types TS
    // sont parfois imprécis — on cast en unknown puis en any pour
    // éviter les frictions de typage. L'appel est valide à l'exécution.
    const visionBody = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as unknown as Parameters<typeof zai.chat.completions.createVision>[0]

    const completion = (await Promise.race([
      zai.chat.completions.createVision(visionBody),
      new Promise((_, rej) => setTimeout(() => rej(new Error("VLM timeout")), VLM_TIMEOUT_MS)),
    ])) as { choices?: { message?: { content?: string } }[] }

    const rawText = completion?.choices?.[0]?.message?.content ?? ""
    const parsed = extraireJsonVLM(rawText)
    if (!parsed) return null

    // Valider la catégorie
    const validCategories = Object.keys(CATEGORY_TO_TEAM) as AirportPhotoCategory[]
    const rawCategory = String(parsed.category ?? "autre")
    const category: AirportPhotoCategory = validCategories.includes(rawCategory as AirportPhotoCategory)
      ? (rawCategory as AirportPhotoCategory)
      : "autre"
    const team = CATEGORY_TO_TEAM[category]

    const validUrgencies = ["faible", "moyenne", "elevee", "critique"] as const
    const rawUrgency = String(parsed.urgency ?? "moyenne")
    const urgency: "faible" | "moyenne" | "elevee" | "critique" =
      (validUrgencies as readonly string[]).includes(rawUrgency)
        ? (rawUrgency as "faible" | "moyenne" | "elevee" | "critique")
        : "moyenne"

    return {
      category,
      team,
      urgency,
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 200) : "",
      objects_detected: Array.isArray(parsed.objects_detected)
        ? parsed.objects_detected.slice(0, 10).map(String)
        : [],
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    }
  } catch (err) {
    console.warn("[airport-vlm] Échec analyse photo:", err instanceof Error ? err.message : String(err))
    return null
  }
}

/** Extrait le JSON de la réponse VLM (gère markdown ```json ... ```) */
function extraireJsonVLM(text: string): Record<string, unknown> | null {
  if (!text) return null
  // 1. Tenter JSON.parse direct
  try {
    return JSON.parse(text)
  } catch {
    // continue
  }
  // 2. Extraire entre ```json ... ```
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) {
    try {
      return JSON.parse(match[1])
    } catch {
      // continue
    }
  }
  // 3. Extraire la première sous-chaîne { ... }
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      // continue
    }
  }
  return null
}

/**
 * Analyse une photo et met à jour le signalement en BDD.
 * Fonction "fire and forget" — appelée en arrière-plan après la
 * création du signalement. Ne lève jamais.
 */
export async function analyserEtRouterReport(reportId: string, photoUrl: string): Promise<void> {
  const result = await analyserPhotoAirport(photoUrl)
  if (!result) {
    console.log(`[airport-vlm] Pas d'analyse pour report ${reportId} (VLM indisponible ou photo invalide)`)
    return
  }
  try {
    await db.airportReport.update({
      where: { id: reportId },
      data: {
        photoCategory: result.category,
        routedTeam: result.team,
        photoAnalysis: JSON.stringify(result),
      },
    })
    console.log(`[airport-vlm] Report ${reportId} → category=${result.category}, team=${result.team}, urgency=${result.urgency}, confidence=${result.confidence}`)
  } catch (err) {
    console.warn(`[airport-vlm] Échec MAJ report ${reportId}:`, err instanceof Error ? err.message : String(err))
  }
}
