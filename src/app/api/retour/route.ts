// ============================================================
// API publique (canonique) - Enregistrement d'un retour Client Mystère
// POST /api/retour
// Body : { qrToken, note, tags[], commentaire?, personnelMentionne?, canalChoisi? }
// → { retour, recompense: string | null, alerte?: { recurrente, nbSignalements, canal } }
// - Résout la ZONE par son qrToken (chaque zone a son QR)
// - Crée le Retour avec proId + zoneId (+ rattachement employé par nom)
// - Note ≤ 2 → alerte temps réel (Session 5 §4) : analyse de récurrence
//   dans la zone (src/lib/alertes.ts) → SMS si récurrent, sinon
//   notification dashboard uniquement
// - Récompense (micro-avantage) renvoyée pour l'écran de remerciement
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { retourSchema, firstError } from "@/lib/validation"
import { tagLabel } from "@/lib/constants"
import { parseJsonArray, detecterAlertesIntelligentes } from "@/lib/ia"
import { analyserEtAlerterRetour } from "@/lib/alertes"
import { creerNotification } from "@/lib/notifications"
import {
  macroSecteurPourSecteur,
  MACRO_SECTEURS,
  tagsEmployesPourMacro,
  type MacroSecteurId,
} from "@/lib/secteurs-v2"

/** Adresses locales/privées : aucune recherche géo (inutile et hors RGPD utile) */
function estIpPrivee(ip: string): boolean {
  return (
    ip === "" ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

/** Ville approximative via ipapi.co — jamais bloquante (timeout 1,5 s, échec = null) */
async function villeDepuisIp(req: NextRequest): Promise<string | null> {
  try {
    const enTete =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      ""
    const ip = enTete.split(",")[0].trim()
    if (!ip || estIpPrivee(ip)) return null
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(1500),
      headers: { "User-Agent": "FeedbackPro/1.0" },
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { city?: unknown } | null
    const ville = json?.city
    return typeof ville === "string" && ville.trim() ? ville.trim().slice(0, 80) : null
  } catch {
    return null
  }
}

/**
 * v2 — Résout le macro-secteur d'un Pro (depuis son SecteurConfig via
 * secteurId, ou par typeEtablissement en correspondance insensible à
 * la casse). Permet d'autoriser les tags sectoriels v2 (acc_chaleureux,
 * srv_rapide…) et les tags employés transversaux (emp_*) même si la
 * zone a des tags historiques (accueil_chaleureux, propre…).
 *
 * Retourne null si le Pro n'est pas rattaché à un macro-secteur v2
 * (Boutique, Salon, Institut, Garage, Autre) — auquel cas on retombe
 * sur le filtrage historique par tags de la zone.
 */
async function resoudreMacroSecteurDuPro(pro: {
  secteurId: string | null
  typeEtablissement: string
}): Promise<MacroSecteurId | null> {
  // 1) Par secteurId
  if (pro.secteurId) {
    const s = await db.secteurConfig.findUnique({
      where: { id: pro.secteurId },
      select: { nom: true },
    })
    if (s && macroSecteurPourSecteur(s.nom)) return macroSecteurPourSecteur(s.nom)!.nom
  }
  // 2) Par typeEtablissement (exact)
  if (macroSecteurPourSecteur(pro.typeEtablissement)) {
    return macroSecteurPourSecteur(pro.typeEtablissement)!.nom
  }
  // 3) Par typeEtablissement (insensible à la casse — ex : "restaurant" → "Restaurant")
  const tous = await db.secteurConfig.findMany({ select: { nom: true } })
  const lower = pro.typeEtablissement.toLowerCase()
  const match = tous.find((s) => s.nom.toLowerCase() === lower)
  if (match && macroSecteurPourSecteur(match.nom)) {
    return macroSecteurPourSecteur(match.nom)!.nom
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    // ---------- Validation Zod du corps de requête ----------
    const brut = await req.json().catch(() => null)
    const parsed = retourSchema.safeParse(brut)
    if (!parsed.success) {
      return fail(firstError(parsed.error), 400)
    }
    const { qrToken, note, tags, commentaire, personnelMentionne, canalChoisi, emailClient, nps, photoUrl } = parsed.data

    // ---------- Résolution de la zone via le QR token ----------
    const zone = await db.zone.findUnique({
      where: { qrToken },
      include: { pro: { include: { user: { select: { email: true } } } } },
    })
    if (!zone) return fail("QR code invalide", 404)
    const pro = zone.pro

    // ---------- Cohérence des tags avec la zone/secteur et la note ----------
    // Le scan n'affiche que les tags configurés ; on filtre silencieusement
    // (aucune erreur 400 côté client mystère) pour garantir la qualité des
    // données sans casser le parcours public.
    //
    // v2 — Si le Pro est rattaché à un macro-secteur (RESTAURATION, HÔTEL,
    // AÉROPORT/GARE, HÔPITAL, ADMINISTRATION), on autorise en PLUS des tags
    // de la zone :
    //   - les 4 tags sectoriels du macro (1 par pilier, polarité = note)
    //   - les tags employés transversaux (emp_*) filtrés par contexte
    // Cela permet au scan-view (qui affiche les tags macro-sectoriels) de
    // soumettre des tags que la zone ne connaissait pas historiquement.
    const positifsZone = parseJsonArray(zone.tagsPositifs)
    const negatifsZone = parseJsonArray(zone.tagsNegatifs)
    const macroId = await resoudreMacroSecteurDuPro(pro)
    const macro = macroId ? MACRO_SECTEURS.find((m) => m.nom === macroId) : null
    const tagsEmployesMacro = tagsEmployesPourMacro(macroId)
    // Tags autorisés pour la polarité de la note :
    //   - tags de la zone (filtrage historique, pour les secteurs non v2)
    //   - tags sectoriels du macro v2 (si le Pro est rattaché)
    const autorisesPolarite = note >= 4
      ? [...positifsZone, ...(macro ? macro.tagsPositifs.map((t) => t.id) : [])]
      : [...negatifsZone, ...(macro ? macro.tagsNegatifs.map((t) => t.id) : [])]
    // Tags employés (toutes polarités, filtrés par contexte du macro).
    // Autorisés quelles que soient la note — le scan-view les affiche
    // conditionnellement mais on reste permissif côté serveur pour ne pas
    // rejeter un retour légitime.
    const autorisesEmployes = [
      ...tagsEmployesMacro.positifs.map((t) => t.id),
      ...tagsEmployesMacro.negatifs.map((t) => t.id),
    ]
    const validTags = tags.filter((t) => {
      // Tag employé : autorisé s'il est dans le contexte du macro
      if (t.startsWith("emp_")) return autorisesEmployes.includes(t)
      // Tag sectoriel : autorisé s'il est dans la polarité de la note
      // (soit dans la zone, soit dans le macro v2)
      return autorisesPolarite.includes(t)
    })

    // ---------- Rattachement employé (affecté à cette zone) ----------
    let employeId: string | null = null
    if (personnelMentionne) {
      const needle = personnelMentionne.trim().toLowerCase()
      if (needle.length >= 3) {
        const employesZone = await db.employe.findMany({ where: { proId: pro.id, actif: true } })
        const match = employesZone.find((e) => {
          const affecte = parseJsonArray(e.zoneIds).includes(zone.id)
          const nom = e.nom.toLowerCase()
          return affecte && (nom.includes(needle) || needle.includes(nom.split(" ")[0]))
        })
        if (match) employeId = match.id
      }
    }

    // Ville par IP : best effort et UNIQUEMENT avec le consentement explicite
    // du client (opt-in à l'étape 3 du scan — RGPD). Ne doit jamais ralentir
    // l'envoi de plus d'1,5 s. Sans consentement : aucune donnée géo enregistrée.
    const ipCity = parsed.data.geoConsent ? await villeDepuisIp(req) : null

    // ---------- Enregistrement (proId + zoneId) ----------
    const retour = await db.retour.create({
      data: {
        proId: pro.id,
        zoneId: zone.id,
        employeId,
        note,
        tags: JSON.stringify(validTags),
        commentaire,
        personnelMentionne,
        emailClient: emailClient || null,
        canalChoisi,
        ipCity,
        // D1 : NPS (0-10) — transmis uniquement pour les notes ≥ 4 côté client.
        nps: typeof nps === "number" ? nps : null,
        // D2 : photo jointe (URL relative /uploads/…), None si pas de photo.
        photoUrl: photoUrl || null,
        statut: "NEW",
        // Historique des statuts : entrée initiale à la création
        historique: JSON.stringify([{ statut: "NEW", at: new Date().toISOString() }]),
        lu: false,
      },
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
    })

    // ---------- Alerte temps réel pour les réclamations (note <= 2) ----------
    // Session 5 §4 : sauvegarde déjà faite ; analyse rapide de récurrence
    // dans la zone → SMS (Twilio) si problème récurrent, sinon simple
    // notification dashboard. Strictement non bloquant.
    let infoAlerte: { recurrente: boolean; nbSignalements: number; canal: "SMS" | "DASHBOARD" } | null = null
    if (note <= 2) {
      infoAlerte = await analyserEtAlerterRetour(
        pro,
        { id: zone.id, nom: zone.nom },
        { id: retour.id, note: retour.note },
        validTags.map(tagLabel)
      )
    }

    // ---------- Notification in-app (cloche) ----------
    // Nouveau retour négatif (≤ 2) → titre distinct ; sinon « nouveau retour ».
    await creerNotification(
      pro.userId,
      note <= 2 ? "retour_negatif" : "nouveau_retour",
      note <= 2 ? "🚨 Nouveau retour négatif" : "💬 Nouveau retour client",
      `Note ${note}/5 sur la zone « ${zone.nom} »${retour.commentaire ? ` — ${retour.commentaire.slice(0, 80)}` : ""}`
    )

    // ---------- D4 : Alertes intelligentes du Coach IA ----------
    // Compare les notes des dernières 24 h vs 7 jours précédents, zone par
    // zone. Si une baisse tendancielle est détectée, crée une Notification
    // (alerte_coach) + une Alerte (INTELLIGENTE). Strictement non bloquant
    // et appelé en arrière-plan pour ne pas ralentir la réponse au client.
    detecterAlertesIntelligentes(pro.id).catch((e) => {
      console.warn("detecterAlertesIntelligentes (arrière-plan) :", e)
    })

    return ok({
      retour: {
        id: retour.id,
        note: retour.note,
        tags: validTags,
        commentaire: retour.commentaire,
        statut: retour.statut,
        createdAt: retour.createdAt.toISOString(),
        zone: { nom: zone.nom },
        employe: retour.employe?.nom ? { nom: retour.employe.nom } : null,
      },
      // Micro-récompense affichée à l'écran de remerciement — uniquement si
      // le commerçant l'a activée (Session 3) ; le code promo est transmis
      // séparément pour être mis en valeur dans une puce dédiée.
      recompense: pro.recompenseActive && pro.recompense ? pro.recompense : null,
      codeRecompense: pro.recompenseActive ? pro.recompenseCode || null : null,
      // Session 5 : info d'alerte temps réel (récurrente ? SMS ou dashboard ?)
      alerte: infoAlerte,
    })
  } catch (e) {
    console.error("retour error", e)
    return fail("Erreur serveur lors de l'enregistrement", 500)
  }
}
