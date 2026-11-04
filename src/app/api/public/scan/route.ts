// ============================================================
// API publique - Infos de la ZONE pour la page de scan
// POST /api/public/scan  { qrToken }
// → { zone: { nom, description }, pro: { nomEtablissement, logoUrl, recompense, whatsapp },
//     tagsPositifs: string[], tagsNegatifs: string[] }
// 404 si le token est inconnu.
//
// v2 : la réponse est ÉTENDUE (additif, contrat préservé) avec :
//   - macroSecteur           : "RESTAURATION" | "HOTELLERIE" | … (ou null)
//   - piliers                : string[] (4 axes d'audit du macro-secteur)
//   - tagsPositifsDetails    : { id, label, pilier }[] (résolu depuis macro)
//   - tagsNegatifsDetails    : { id, label, pilier }[]
//   - tagsEmployes           : { positifs: [{id,label}], negatifs: [{id,label}] }
//                              (filtrés par contexte du macro-secteur)
//
// Règle d'override : si le Pro est rattaché à un SecteurConfig
// couvert par un macro-secteur v2 (via secteurId ou
// typeEtablissement), les tagsPositifs/tagsNegatifs renvoyés sont
// REMPLACÉS par les 4 tags sectoriels du macro (1 par pilier). Cela
// permet au scan-view de grouper les tags par pilier. Pour les
// secteurs non couverts (Boutique, Salon, Institut, Garage, Autre),
// on conserve les tags de la zone (UX inchangée).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { scanSchema, firstError } from "@/lib/validation"
import { parseJsonArray } from "@/lib/ia"
import {
  macroSecteurPourSecteur,
  MACRO_SECTEURS,
  tagsEmployesPourMacro,
  type MacroSecteurId,
} from "@/lib/secteurs-v2"
import type { Secteur } from "@/lib/questionnaire-config"

/**
 * Mappe un macro-secteur v2 (issu de secteurs-v2.ts) vers l'id de secteur
 * du questionnaire adaptatif (questionnaire-config.ts). Renvoie null si le
 * macro-secteur n'est pas couvert par le questionnaire (cas rare — les 5
 * macro-secteurs v2 sont tous couverts).
 *
 * Mapping :
 *   RESTAURATION               → RESTAURATION
 *   HOTELLERIE                 → HOTELLERIE
 *   TRANSPORT_AEROPORT_GARE    → TRANSPORT
 *   SANTE_HOPITAL_CLINIQUE     → SANTE
 *   ADMINISTRATION_ERP_PUBLIC  → ADMINISTRATION
 */
function secteurQuestionnairePourMacro(macroId: MacroSecteurId | null): Secteur | null {
  if (!macroId) return null
  switch (macroId) {
    case "RESTAURATION":
      return "RESTAURATION"
    case "HOTELLERIE":
      return "HOTELLERIE"
    case "TRANSPORT_AEROPORT_GARE":
      return "TRANSPORT"
    case "SANTE_HOPITAL_CLINIQUE":
      return "SANTE"
    case "ADMINISTRATION_ERP_PUBLIC":
      return "ADMINISTRATION"
    default:
      return null
  }
}

/** Parse un JSON string[] avec tolérance (champ SQLite string JSON). */
function parseArray(v: string | null | undefined): string[] {
  if (!v) return []
  try {
    const p = JSON.parse(v) as unknown
    return Array.isArray(p) ? p.map(String) : []
  } catch {
    return []
  }
}

/**
 * Cherche la SecteurConfig d'un Pro :
 *   1) par secteurId (si présent)
 *   2) par nom exact = typeEtablissement
 *   3) par nom insensible à la casse (fetch all + filter JS)
 *
 * Retourne null si rien trouvé (Pro sans fiche secteur — cas rare
 * mais possible pour les anciens comptes).
 */
async function chercherSecteurDuPro(pro: {
  secteurId: string | null
  typeEtablissement: string
}) {
  if (pro.secteurId) {
    const s = await db.secteurConfig.findUnique({ where: { id: pro.secteurId } })
    if (s) return s
  }
  const exact = await db.secteurConfig.findUnique({ where: { nom: pro.typeEtablissement } })
  if (exact) return exact
  // Recherche insensible à la casse (ex : "restaurant" → "Restaurant").
  // 15 secteurs en BDD → fetch all + filter en JS reste très bon marché.
  const tous = await db.secteurConfig.findMany()
  const lower = pro.typeEtablissement.toLowerCase()
  return (
    tous.find((s) => s.nom.toLowerCase() === lower) ??
    null
  )
}

export async function POST(req: NextRequest) {
  try {
    const parsed = scanSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { qrToken } = parsed.data

    // Résolution de la zone scannée + établissement propriétaire
    const zone = await db.zone.findUnique({
      where: { qrToken },
      include: { pro: true },
    })

    if (!zone) return fail("QR code invalide ou expiré", 404)

    // ----- v2 : résolution du contexte sectoriel du Pro -----
    const secteur = await chercherSecteurDuPro(zone.pro)
    const macroId: MacroSecteurId | null = secteur
      ? macroSecteurPourSecteur(secteur.nom)?.nom ?? null
      : null
    const macro = macroId ? MACRO_SECTEURS.find((m) => m.nom === macroId) ?? null : null

    // Tags affichés :
    //   - Si macro-secteur couvert : on REMPLACE par les 4 tags sectoriels
    //     (1 par pilier) du macro — c'est la base pour le groupage par pilier.
    //   - Sinon : on garde les tags de la zone (UX inchangée, repli vieux
    //     catalogue ALL_TAGS côté client).
    const tagsPositifsIds = macro ? macro.tagsPositifs.map((t) => t.id) : parseJsonArray(zone.tagsPositifs)
    const tagsNegatifsIds = macro ? macro.tagsNegatifs.map((t) => t.id) : parseJsonArray(zone.tagsNegatifs)

    // Piliers + détails structurés (label + pilier) pour le groupage UI
    const piliers = macro ? macro.piliers : (secteur ? parseArray(secteur.piliers) : [])
    const tagsPositifsDetails = macro
      ? macro.tagsPositifs.map((t) => ({ id: t.id, label: t.label, pilier: t.pilier }))
      : []
    const tagsNegatifsDetails = macro
      ? macro.tagsNegatifs.map((t) => ({ id: t.id, label: t.label, pilier: t.pilier }))
      : []

    // Tags employés transversaux (filtrés par contexte du macro-secteur,
    // ou "TOUS" pour les secteurs non couverts). Le scan-view les affiche
    // dans une section dédiée si la note est ≤ 2★ OU si le client mentionne
    // un employé.
    const tagsEmployesBrut = tagsEmployesPourMacro(macroId)

    return ok({
      zone: { nom: zone.nom, description: zone.description },
      pro: {
        nomEtablissement: zone.pro.nomEtablissement,
        logoUrl: zone.pro.logoUrl,
        // Récompense affichée en AVANCEMENT (teaser de l'étape 3) — uniquement
        // si le commerçant l'a activée (Session 3)
        recompense: zone.pro.recompenseActive && zone.pro.recompense ? zone.pro.recompense : null,
        // Numéro utilisé par la page de scan pour construire le lien
        // « Envoyer via WhatsApp » (canalChoisi = "whatsapp")
        whatsapp: zone.pro.whatsapp,
        // Signature personnalisée du pied de message WhatsApp du Pro
        messageWhatsapp: zone.pro.messageWhatsapp,
        // D8 : URL d'avis Google (saisie manuelle par le commerçant) — proposée
        // sur l'écran de succès uniquement pour les notes ≥ 4★
        googleReviewUrl: zone.pro.googleReviewUrl,
        // Task 4 — White-label : si whiteLabel=true, la page de scan remplace
        // le logo FeedbackPro par brandLogoUrl, le nom par brandName et la
        // couleur #002e85 par brandColor. Fallback sur les valeurs par défaut.
        whiteLabel:
          (zone.pro as unknown as { whiteLabel?: boolean }).whiteLabel ?? false,
        brandName:
          (zone.pro as unknown as { brandName?: string | null }).brandName ?? null,
        brandColor:
          (zone.pro as unknown as { brandColor?: string | null }).brandColor ?? null,
        brandLogoUrl:
          (zone.pro as unknown as { brandLogoUrl?: string | null }).brandLogoUrl ?? null,
      },
      // Tags affichés (IDs seuls — pour compatibilité avec le contrat v1).
      // Le scan-view utilise tagsPositifsDetails/tagsNegatifsDetails quand
      // ils sont non vides (v2), sinon il résout via ALL_TAGS (v1).
      tagsPositifs: tagsPositifsIds,
      tagsNegatifs: tagsNegatifsIds,
      // ----- v2 : contexte sectoriel -----
      macroSecteur: macroId,
      piliers,
      tagsPositifsDetails,
      tagsNegatifsDetails,
      tagsEmployes: tagsEmployesBrut,
      // ----- v3 : secteur du questionnaire adaptatif -----
      // Mappe le macro-secteur vers l'id Secteur du questionnaire-config
      // (RESTAURATION, HOTELLERIE, TRANSPORT, SANTE, ADMINISTRATION).
      // Null si le Pro n'est pas rattaché à un macro-secteur couvert
      // (Boutique, Salon, Institut, Garage, Autre) — auquel cas le scan-view
      // retombe sur le flux historique (tags + commentaire + NPS + photo).
      secteurQuestionnaire: secteurQuestionnairePourMacro(macroId),
    })
  } catch (e) {
    console.error("scan error", e)
    return fail("Erreur serveur", 500)
  }
}
