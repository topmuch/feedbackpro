// ============================================================
// Feature 2 — Auto-Audit du Matin (checklist dictée par l'IA)
// ------------------------------------------------------------
// genererChecklistMatin(proId) — génère la checklist du matin :
//   1. Récupère les retours des dernières 24h pour ce Pro
//   2. Agrège : top tags négatifs, zones problématiques, commentaires
//   3. Construit le prompt (Coach IA qualité pour le secteur)
//   4. Appelle le LLM (z-ai-web-dev-sdk, backend uniquement)
//   5. Parse la réponse (JSON robuste)
//   6. Fallback heuristique déterministe en cas d'échec LLM
//
// La checklist contient 3-6 items actionnables (ex : « Vérifier la
// propreté des toilettes RDC — 4 plaintes hier »), avec une urgence
// (haute|moyenne|basse) et un flag photoRequise.
// ============================================================

import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { tagLabel } from "@/lib/constants"
import { configSecteur } from "@/lib/secteurs"
import { parseJsonArray } from "@/lib/ia"
import type { Retour, Zone, Pro } from "@prisma/client"

/** Type d'un item de checklist du matin (renvoyé par le LLM ou le fallback) */
export type ItemChecklist = {
  id: string
  label: string
  urgence: "haute" | "moyenne" | "basse"
  photoRequise: boolean
}

/** Données agrégées des retours de la veille (pour le prompt et le fallback) */
export type DonneesRetoursVeille = {
  total: number
  totalNegatifs: number
  noteMoyenne: number
  /** Top tags négatifs (libellé + count + zone la plus touchée) */
  topTagsNegatifs: { tag: string; label: string; count: number; zone: string }[]
  /** Zones avec leur note moyenne et le nombre de retours négatifs */
  zonesProblematiques: { zone: string; noteMoyenne: number; negatifs: number; total: number }[]
  /** Quelques commentaires négatifs (max 5, ≤ 200 car.) pour le contexte LLM */
  commentairesNegatifs: { note: number; zone: string; texte: string }[]
}

/** Timeout LLM (30 s — la génération de checklist reste courte) */
const TIMEOUT_LLM_MS = 30_000

/** Prompt système du Coach IA qualité pour l'audit du matin */
const SYSTEM_PROMPT_AUDIT = `Tu es un Coach IA qualité pour le secteur [secteur].
Analyse les retours de la veille de [nom établissement] :
[liste des retours avec note, tags, commentaire]

Génère une checklist du matin (3-6 items) au format JSON :
{
  "items": [
    { "id": "item1", "label": "Vérifier...", "urgence": "haute|moyenne|basse", "photoRequise": true|false }
  ]
}
Focus sur les problèmes récurrents détectés. Sois concret et actionnable.
Chaque item doit être une action immédiatement exécutable par le manager.
Si un tag négatif revient N fois, cite "N plaintes sur [problème]" dans le label.
Si une zone a une note très basse, propose une vérification physique (photoRequise=true).
Ne propose jamais plus de 6 items ni moins de 3.
Réponse : UNIQUEMENT un JSON valide, sans texte autour.`

/**
 * Récupère et agrège les retours des dernières 24h pour un Pro.
 * Utilisé pour construire le prompt LLM et le fallback heuristique.
 */
export async function agregerRetoursVeille(proId: string): Promise<DonneesRetoursVeille> {
  const ilYA24h = new Date(Date.now() - 24 * 3600 * 1000)
  const retours = await db.retour.findMany({
    where: { proId, createdAt: { gte: ilYA24h } },
    include: { zone: { select: { nom: true } } },
  })

  const total = retours.length
  const totalNegatifs = retours.filter((r) => r.note <= 2).length
  const noteMoyenne =
    total > 0 ? retours.reduce((s, r) => s + r.note, 0) / total : 0

  // Top tags négatifs : on ne compte QUE les tags des retours ≤ 2★
  const tagsCount = new Map<string, { count: number; zone: string }>()
  for (const r of retours) {
    if (r.note > 2) continue
    const tags = parseJsonArray(r.tags)
    for (const t of tags) {
      const cur = tagsCount.get(t) ?? { count: 0, zone: r.zone?.nom ?? "—" }
      cur.count++
      // Conserve la zone la plus récente pour ce tag (contexte actionnable)
      cur.zone = r.zone?.nom ?? cur.zone
      tagsCount.set(t, cur)
    }
  }
  const topTagsNegatifs = [...tagsCount.entries()]
    .map(([tag, info]) => ({
      tag,
      label: tagLabel(tag),
      count: info.count,
      zone: info.zone,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // Zones problématiques : agrégation par zone (note moyenne + nb négatifs)
  const parZone = new Map<
    string,
    { total: number; sommeNotes: number; negatifs: number }
  >()
  for (const r of retours) {
    const nomZone = r.zone?.nom ?? "—"
    const cur = parZone.get(nomZone) ?? { total: 0, sommeNotes: 0, negatifs: 0 }
    cur.total++
    cur.sommeNotes += r.note
    if (r.note <= 2) cur.negatifs++
    parZone.set(nomZone, cur)
  }
  const zonesProblematiques = [...parZone.entries()]
    .map(([zone, info]) => ({
      zone,
      noteMoyenne: info.total > 0 ? info.sommeNotes / info.total : 0,
      negatifs: info.negatifs,
      total: info.total,
    }))
    .sort((a, b) => b.negatifs - a.negatifs || a.noteMoyenne - b.noteMoyenne)
    .slice(0, 5)

  // Quelques commentaires négatifs (max 5, ≤ 200 car.) pour le contexte LLM
  const commentairesNegatifs = retours
    .filter((r) => r.note <= 2 && r.commentaire && r.commentaire.trim().length > 0)
    .slice(0, 5)
    .map((r) => ({
      note: r.note,
      zone: r.zone?.nom ?? "—",
      texte: (r.commentaire ?? "").slice(0, 200),
    }))

  return {
    total,
    totalNegatifs,
    noteMoyenne,
    topTagsNegatifs,
    zonesProblematiques,
    commentairesNegatifs,
  }
}

/**
 * Construit le prompt utilisateur pour la génération de checklist du matin.
 */
function construirePrompt(
  pro: Pick<Pro, "nomEtablissement" | "typeEtablissement">,
  donnees: DonneesRetoursVeille
): string {
  const lignes: string[] = []
  lignes.push(`Secteur : ${pro.typeEtablissement}`)
  lignes.push(`Établissement : ${pro.nomEtablissement}`)
  lignes.push(`Période : dernières 24 h`)
  lignes.push(`Total retours : ${donnees.total} (dont ${donnees.totalNegatifs} négatifs ≤ 2★)`)
  lignes.push(`Note moyenne : ${donnees.noteMoyenne.toFixed(1)}/5`)
  lignes.push("")
  lignes.push("Top tags négatifs :")
  if (donnees.topTagsNegatifs.length === 0) {
    lignes.push("(aucun tag négatif)")
  } else {
    for (const t of donnees.topTagsNegatifs) {
      lignes.push(`- ${t.label} : ${t.count} signalement(s) (zone : ${t.zone})`)
    }
  }
  lignes.push("")
  lignes.push("Zones problématiques :")
  if (donnees.zonesProblematiques.length === 0) {
    lignes.push("(aucune zone problématique)")
  } else {
    for (const z of donnees.zonesProblematiques) {
      lignes.push(
        `- ${z.zone} : note moyenne ${z.noteMoyenne.toFixed(1)}/5, ${z.negatifs} retour(s) négatif(s) sur ${z.total} total`
      )
    }
  }
  lignes.push("")
  lignes.push("Commentaires négatifs (extrait) :")
  if (donnees.commentairesNegatifs.length === 0) {
    lignes.push("(aucun commentaire négatif)")
  } else {
    for (const c of donnees.commentairesNegatifs) {
      lignes.push(`- [${c.note}/5, ${c.zone}] "${c.texte}"`)
    }
  }
  return lignes.join("\n")
}

/**
 * Extrait un JSON robuste depuis la réponse du LLM (accepte les blocs
 * ```json ... ``` ou le JSON brut). Renvoie null si non exploitable.
 */
function extraireJsonItems(texte: string): { items: unknown[] } | null {
  if (!texte) return null
  const bloc = texte.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidats = [bloc?.[1], texte]
  for (const brut of candidats) {
    if (!brut) continue
    const essaies = [brut.trim()]
    const debut = brut.indexOf("{")
    const fin = brut.lastIndexOf("}")
    if (debut !== -1 && fin > debut) essaies.push(brut.slice(debut, fin + 1))
    for (const essai of essaies) {
      try {
        const parse = JSON.parse(essai) as unknown
        if (parse && typeof parse === "object" && !Array.isArray(parse)) {
          const items = (parse as { items?: unknown }).items
          if (Array.isArray(items)) {
            return { items }
          }
        }
      } catch {
        /* essai suivant */
      }
    }
  }
  return null
}

/**
 * Valide et normalise les items renvoyés par le LLM.
 * Garantit : 3-6 items, id unique, urgence dans l'enum, photoRequise booléen.
 * Renvoie null si la liste est vide ou invalide.
 */
function validerItemsLLM(obj: { items: unknown[] } | null): ItemChecklist[] | null {
  if (!obj || !Array.isArray(obj.items)) return null
  const items: ItemChecklist[] = []
  const idsVus = new Set<string>()
  for (let i = 0; i < obj.items.length && items.length < 6; i++) {
    const raw = obj.items[i]
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const label = typeof r.label === "string" ? r.label.trim() : ""
    if (!label) continue
    let id = typeof r.id === "string" && r.id ? r.id : `item${i + 1}`
    if (idsVus.has(id)) id = `item${i + 1}-${Date.now()}`
    idsVus.add(id)
    const urgenceRaw = typeof r.urgence === "string" ? r.urgence.toLowerCase() : "moyenne"
    const urgence: ItemChecklist["urgence"] =
      urgenceRaw === "haute" || urgenceRaw === "basse" ? urgenceRaw : "moyenne"
    items.push({
      id,
      label: label.slice(0, 200),
      urgence,
      photoRequise: r.photoRequise === true,
    })
  }
  return items.length >= 3 ? items : null
}

/**
 * Fallback heuristique déterministe : génère une checklist à partir des
 * données agrégées (top tags négatifs + zones problématiques) sans appel
 * LLM. Garantit que la route /api/pro/audit-matin produit TOUJOURS une
 * checklist exploitable, même si le LLM est indisponible.
 *
 * Stratégie :
 *   1. Pour chaque tag négatif récurrent (count ≥ 2) → item « Valider :
 *      corriger [tag] (N signalements hier, zone [zone]) », urgence haute.
 *   2. Pour chaque zone problématique (note moyenne ≤ 3 OU ≥ 1 négatif)
 *      → item « Vérifier la zone [zone] (note X/5, N retours négatifs) »,
 *      urgence moyenne, photoRequise=true.
 *   3. Si pas assez d'items → items génériques de maintenance.
 */
export function checklistHeuristique(donnees: DonneesRetoursVeille): ItemChecklist[] {
  const items: ItemChecklist[] = []

  // 1) Tags négatifs récurrents (count ≥ 2)
  for (const t of donnees.topTagsNegatifs) {
    if (t.count < 2) continue
    if (items.length >= 6) break
    items.push({
      id: `tag-${t.tag}`,
      label: `Corriger « ${t.label} » — ${t.count} plaintes hier (zone : ${t.zone})`,
      urgence: t.count >= 3 ? "haute" : "moyenne",
      photoRequise: false,
    })
  }

  // 2) Zones problématiques (note ≤ 3 OU ≥ 1 négatif)
  for (const z of donnees.zonesProblematiques) {
    if (items.length >= 6) break
    if (z.noteMoyenne > 3 && z.negatifs === 0) continue
    const noteTxt = z.noteMoyenne.toFixed(1)
    items.push({
      id: `zone-${z.zone.slice(0, 30)}`,
      label: `Vérifier la zone « ${z.zone} » — note moyenne ${noteTxt}/5 (${z.negatifs} retour(s) négatif(s) hier)`,
      urgence: z.noteMoyenne <= 2 ? "haute" : "moyenne",
      photoRequise: true,
    })
  }

  // 3) Items génériques de maintenance si pas assez
  if (items.length < 3) {
    const itemsGeneriques: ItemChecklist[] = [
      {
        id: "generic-1",
        label: "Tour d'inspection des zones de contact (accueil, salle, toilettes)",
        urgence: "moyenne",
        photoRequise: true,
      },
      {
        id: "generic-2",
        label: "Briefing équipe sur les standards de service du jour",
        urgence: "basse",
        photoRequise: false,
      },
      {
        id: "generic-3",
        label: "Vérifier la disponibilité et la fraîcheur des produits proposés",
        urgence: "basse",
        photoRequise: false,
      },
    ]
    for (const it of itemsGeneriques) {
      if (items.length >= 4) break
      // Évite les doublons d'ids avec les items heuristiques précédents
      if (items.some((x) => x.id === it.id)) continue
      items.push(it)
    }
  }

  // Coupe à 6 items max
  return items.slice(0, 6)
}

/**
 * Génère la checklist du matin pour un Pro, via le LLM avec fallback
 * heuristique déterministe. NE LÈVE JAMAIS d'exception.
 *
 * Retourne { items, source } où source est "ia" ou "fallback".
 */
export async function genererChecklistMatin(
  pro: Pick<Pro, "id" | "nomEtablissement" | "typeEtablissement">
): Promise<{ items: ItemChecklist[]; source: "ia" | "fallback"; donnees: DonneesRetoursVeille }> {
  const donnees = await agregerRetoursVeille(pro.id)

  // Si aucun retour sur la veille, on renvoie directement le fallback
  // (pas besoin de solliciter le LLM pour dire "rien à signaler").
  if (donnees.total === 0) {
    return { items: checklistHeuristique(donnees), source: "fallback", donnees }
  }

  try {
    const zai = await ZAI.create()
    const prompt = construirePrompt(pro, donnees)
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT_AUDIT },
          { role: "user", content: prompt },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise((_, rejeter) =>
        setTimeout(
          () => rejeter(new Error("Timeout Coach IA audit matin")),
          TIMEOUT_LLM_MS
        )
      ),
    ])) as { choices?: { message?: { content?: string } }[] }

    const texte = completion?.choices?.[0]?.message?.content ?? ""
    const parsed = extraireJsonItems(texte)
    const items = validerItemsLLM(parsed)
    if (items && items.length >= 3) {
      return { items, source: "ia", donnees }
    }

    console.warn("[Audit Matin] Checklist LLM inexploitable → heuristique")
    return { items: checklistHeuristique(donnees), source: "fallback", donnees }
  } catch (e) {
    console.warn("[Audit Matin] Échec LLM checklist → heuristique (non bloquant)", e)
    return { items: checklistHeuristique(donnees), source: "fallback", donnees }
  }
}

/**
 * Sérialise un AuditMatin de la base vers la forme API (items + photoUrls
 * parsés depuis leur STRING JSON).
 */
export function serialiserAudit(a: {
  id: string
  proId: string
  date: Date
  items: string
  photoUrls: string
  scoreManager: number
  notes: string | null
  createdAt: Date
}) {
  let items: unknown = []
  try {
    const p = JSON.parse(a.items) as unknown
    if (Array.isArray(p)) items = p
  } catch {
    items = []
  }
  let photoUrls: string[] = []
  try {
    const p = JSON.parse(a.photoUrls) as unknown
    if (Array.isArray(p)) photoUrls = p.map(String)
  } catch {
    photoUrls = []
  }
  return {
    id: a.id,
    proId: a.proId,
    date: a.date.toISOString(),
    items,
    photoUrls,
    scoreManager: a.scoreManager,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  }
}

// ---------- Helper pour le calcul du score manager ----------

/** Item d'audit tel que soumis par le manager (validé/invalidé + photo + note) */
export type ItemAuditSoumis = {
  id: string
  label: string
  urgence?: "haute" | "moyenne" | "basse"
  photoRequise?: boolean
  valide: boolean
  photoUrl?: string | null
  note?: string | null
}

/**
 * Calcule le score manager (% d'items validés) à partir de la liste
 * d'items soumise. Si la liste est vide, renvoie 0.
 */
export function calculerScoreManager(items: ItemAuditSoumis[]): number {
  if (items.length === 0) return 0
  const valides = items.filter((it) => it.valide === true).length
  return Math.round((valides / items.length) * 100)
}

// ---------- Référence aux types Prisma pour éviter l'import circulaire ----------

export type { Retour, Zone, Pro }
