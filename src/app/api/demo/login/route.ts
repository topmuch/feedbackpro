// ============================================================
// API - Connexion à la démo sandbox (un clic, session posée)
// POST /api/demo/login  (aucun corps requis)
// → { ok: true, redirect: "/", data: { seeded, nbZones, nbEmployes, nbRetours } }
// ------------------------------------------------------------
// IDEMPOTENT : crée (ou réutilise) le tenant démo fixe :
//   - User : demo@feedvoice.fr (rôle PRO)
//        Mot de passe fixe, documenté ici : "demo-feedvoice-2025"
//        (SHA256 — même algorithme que /api/auth/login et
//        prisma/seed.ts via hashSha256). Documenté volontairement :
//        le compte est purement démonstration, sans donnée réelle.
//   - Pro  : « Restaurant Le Bristol (Démo) » (type restaurant)
// puis seede des données réalistes SI elles n'existent pas encore
// (ou si les comptes sont trop faibles) :
//   - 5 zones avec QR tokens (générés par le défaut cuid du modèle
//     Zone — même mécanisme que POST /api/pro/zones)
//   - 5 employés rattachés aux zones
//   - ~18 retours répartis sur les 7 derniers jours (notes 2-5,
//     commentaires français réalistes, tags contextuels)
//   - récompense active sur le Pro + 3 retours "récompense utilisée"
//     (le système de récompense d'un Pro classique est une config
//     unique sur le modèle Pro — pas de table dédiée)
//   - 2 rapports Coach IA (RapportIA) pour la page Rapports
//   - alertes temps réel pour les retours ≤ 2 étoiles
// AUCUNE donnée n'est créée pour les autres tenants : tout est
// scoppé sur le proId du tenant démo. Toutes les dates sont
// calculées RELATIVEMENT à maintenant (aucun timestamp codé en dur).
//
// SESSION : EXACTEMENT le même mécanisme que /api/auth/login —
// ligne Session en base + cookie httpOnly "fp_session" posé via
// createSession() / attachSessionCookie() de src/lib/session.ts.
// GARDE-FOU : jamais de session sur un compte dont le rôle n'est
// pas "PRO" (aucun admin ne peut être loggué par cette route).
//
// RATE LIMIT : max 1 appel / 10 s / IP (compteur mémoire simple,
// persisté sur globalThis pour survivre au HMR en dev).
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { createSession, attachSessionCookie } from "@/lib/session"

// ---------- Compte démo (identifiants fixes documentés) ----------
const DEMO_EMAIL = "demo@feedvoice.fr"
const DEMO_PASSWORD = "demo-feedvoice-2025" // SHA256 au repos, cf. commentaire d'entête
const DEMO_PRO_NOM = "Restaurant Le Bristol (Démo)"
const CIBLE_RETOURS = 18 // cap raisonnable : ~18 retours sur 7 jours

/** SHA256 — même algorithme que hashPassword (src/lib/auth.ts) et prisma/seed.ts */
function hashSha256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

// ---------- Rate limit mémoire : max 1 appel / 10 s / IP ----------
const FENETRE_MS = 10_000
const globalRate = globalThis as unknown as {
  __demoLoginDerniersAppels?: Map<string, number>
}
const derniersAppels = globalRate.__demoLoginDerniersAppels ?? new Map<string, number>()
globalRate.__demoLoginDerniersAppels = derniersAppels

function autoriseParIp(ip: string): boolean {
  const maintenant = Date.now()
  const dernier = derniersAppels.get(ip)
  if (dernier && maintenant - dernier < FENETRE_MS) return false
  derniersAppels.set(ip, maintenant)
  // Nettoyage opportuniste : évite une croissance infinie de la Map
  if (derniersAppels.size > 500) {
    for (const [cle, t] of derniersAppels) {
      if (maintenant - t > FENETRE_MS * 60) derniersAppels.delete(cle)
    }
  }
  return true
}

// ---------- Données de seed (réalistes, secteur restaurant) ----------

const ZONES_DEMO = [
  {
    nom: "Accueil",
    description: "Réception, prise en charge et installation des clients",
    tagsPositifs: ["accueil_chaleureux", "prise_en_charge_rapide", "bien_renseigne_accueil"],
    tagsNegatifs: ["accueil_froid", "attente_accueil", "personnel_distrait_accueil"],
  },
  {
    nom: "Salle principale",
    description: "Expérience à table : commande, plats, débarras",
    tagsPositifs: ["plat_excellent", "service_rapide_repas", "serveur_accueillant"],
    tagsNegatifs: ["service_lent", "plat_tiede", "personnel_impoli_repas"],
  },
  {
    nom: "Terrasse",
    description: "Service en extérieur aux heures de pointe",
    tagsPositifs: ["service_rapide_repas", "accueil_chaleureux", "propre"],
    tagsNegatifs: ["service_lent", "attente", "mal_range"],
  },
  {
    nom: "Bar",
    description: "Cocktails, apéritifs et attente au comptoir",
    tagsPositifs: ["serveur_accueillant", "rapide", "plat_excellent"],
    tagsNegatifs: ["attente", "distrait", "erreur"],
  },
  {
    nom: "Toilettes RDC",
    description: "Propreté et état des sanitaires",
    tagsPositifs: ["propre", "bien_approvisionne", "odeur_agreable"],
    tagsNegatifs: ["sale", "manque_papier", "odeur_desagreable"],
  },
]

const EMPLOYES_DEMO = [
  { nom: "Julie Marchand", poste: "Cheffe de rang", zones: ["Accueil", "Salle principale"] },
  { nom: "Karim Benali", poste: "Chef de cuisine", zones: ["Salle principale"] },
  { nom: "Sophie Dubois", poste: "Serveuse", zones: ["Salle principale", "Terrasse"] },
  { nom: "Marc Vasseur", poste: "Barman", zones: ["Bar"] },
  {
    nom: "Léa Fontaine",
    poste: "Manager de salle",
    zones: ["Accueil", "Salle principale", "Terrasse", "Bar", "Toilettes RDC"],
  },
]

// Distribution des notes réaliste (majoritairement satisfait, quelques frictions) :
// 18 valeurs → 7×5, 5×4, 3×3, 3×2 — moyenne ≈ 3,9/5.
const NOTES_DEMO = [5, 4, 5, 3, 2, 4, 5, 2, 4, 5, 3, 5, 4, 2, 5, 3, 5, 4]
// Rotation des zones (index dans l'ordre ZONES_DEMO, modulo le nombre réel de zones)
const ROTATION_ZONES = [1, 0, 2, 1, 3, 4, 1, 0, 2, 3, 1, 0, 4, 1, 2, 0, 3, 1]

const COMMENTAIRES_POSITIFS = [
  "Repas parfait du début à la fin, bravo à toute l'équipe.",
  "Service rapide et très souriant, on se sent tout de suite bien.",
  "La suggestion du chef était excellente, belle présentation.",
  "Terrasse agréable et service aux petits soins, je recommande.",
  "Addition claire, aucune surprise et un café offert en plus.",
  "Le barman prépare les meilleurs cocktails du quartier.",
  "Réservation respectée, table prête à l'heure. Rien à redire.",
  "Cuisine généreuse et serveuse adorable avec les enfants.",
]

const COMMENTAIRES_NEGATIFS = [
  "Attente de 25 minutes avant que quelqu'un prenne notre commande.",
  "Les plats sont arrivés tièdes, dommage pour un restaurant de ce niveau.",
  "Personnel distrait, il a fallu réclamer l'eau trois fois.",
  "Nous n'avons pas été salués en arrivant, accueil très froid.",
  "Erreur sur la facture, corrigée seulement après discussion.",
  "Les toilettes n'étaient pas propres en fin de soirée.",
  "Trop de monde au bar, un seul serveur pour toute la terrasse.",
  "Le plat du jour était épuisé dès midi, prévenez à l'avance.",
]

const REPONSES_PRO = [
  "Merci pour votre retour. Le point a été corrigé avec l'équipe dès le service suivant.",
  "Merci de nous avoir signalé cela : la situation a été revue avec la personne concernée.",
]

const ACTIONS_PRISES = [
  "Rappel des standards de service en réunion d'équipe",
  "Brief accueil + renfort aux heures de pointe",
]

// ---------- Helpers de seed ----------

function parseJsonTags(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

/** Tags contextuels de la zone selon la note (positifs si ≥ 4, négatifs sinon) */
function piocherTags(zone: { tagsPositifs: string; tagsNegatifs: string }, note: number): string[] {
  const positifs = parseJsonTags(zone.tagsPositifs)
  const negatifs = parseJsonTags(zone.tagsNegatifs)
  if (note >= 4 && positifs.length > 0) {
    const nb = 1 + Math.floor(Math.random() * Math.min(3, positifs.length))
    return [...positifs].sort(() => Math.random() - 0.5).slice(0, nb)
  }
  if (note <= 3 && negatifs.length > 0) {
    const nb = 1 + Math.floor(Math.random() * Math.min(2, negatifs.length))
    return [...negatifs].sort(() => Math.random() - 0.5).slice(0, nb)
  }
  return []
}

/** ~80 % de commentaires, alternance déterministe pour éviter les doublons rapprochés */
function piocherCommentaire(j: number, note: number): string | null {
  if (j % 5 === 3) return null
  if (note >= 4) return COMMENTAIRES_POSITIFS[j % COMMENTAIRES_POSITIFS.length]
  return COMMENTAIRES_NEGATIFS[j % COMMENTAIRES_NEGATIFS.length]
}

type TenantDemo =
  | {
      ok: true
      userId: string
      proId: string
      aSeede: boolean
      nbZones: number
      nbEmployes: number
      nbRetours: number
    }
  | { ok: false }

/**
 * Crée (ou réutilise) le tenant démo et garantit un volume de données
 * suffisant. Entièrement idempotent : chaque étape vérifie l'existant
 * avant de créer, et ne touche JAMAIS aux données des autres tenants
 * (toutes les requêtes sont filtrées par le proId du tenant démo).
 */
async function assurerTenantDemo(): Promise<TenantDemo> {
  // 1. User démo (idempotent) — jamais de rôle autre que PRO
  let user = await db.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { pro: true },
  })
  if (!user) {
    user = await db.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash: hashSha256(DEMO_PASSWORD),
        role: "PRO",
        tenantType: "classic",
      },
      include: { pro: true },
    })
  }
  // Garde-fou absolu : on ne loggue JAMAIS un admin via la démo
  if (user.role !== "PRO") {
    console.error("demo login : le compte démo existe avec un rôle inattendu", user.role)
    return { ok: false }
  }

  // 2. Pro démo (idempotent) — recréé si orphelin
  let pro = user.pro
  if (!pro) {
    pro = await db.pro.create({
      data: {
        userId: user.id,
        nomEtablissement: DEMO_PRO_NOM,
        typeEtablissement: "restaurant",
        adresse: "12 avenue Montaigne",
        ville: "Paris",
        email: DEMO_EMAIL,
        whatsapp: "33612345678",
        plan: "PRO",
        frequenceRapport: "quotidien",
        onboardingDone: true,
        onboardingStep: 5,
        smsAlertes: true,
        messageWhatsapp: "Merci pour votre retour. L'équipe du Bristol vous répond sous 24h.",
      },
    })
  }

  let aSeede = false

  // 3. Récompense active (idempotent) — la récompense d'un Pro classique
  //    est une configuration unique portée par le modèle Pro.
  if (!pro.recompenseActive || !pro.recompense) {
    pro = await db.pro.update({
      where: { id: pro.id },
      data: {
        recompense: "Café offert sur votre prochaine visite",
        recompenseActive: true,
        recompenseType: "cafe",
        recompenseCode: "DEMO-BRISTOL",
        recompenseLimite: "1 par client / jour",
      },
    })
    aSeede = true
  }

  // 4. Zones (idempotent) : complète les zones manquantes jusqu'à 5
  const zones = await db.zone.findMany({
    where: { proId: pro.id },
    orderBy: { createdAt: "asc" },
  })
  if (zones.length < ZONES_DEMO.length) {
    const nomsExistants = new Set(zones.map((z) => z.nom))
    for (const z of ZONES_DEMO) {
      if (nomsExistants.has(z.nom)) continue
      // qrToken : non fourni → généré par le défaut cuid du modèle Zone
      // (même mécanisme que POST /api/pro/zones)
      zones.push(
        await db.zone.create({
          data: {
            proId: pro.id,
            nom: z.nom,
            description: z.description,
            tagsPositifs: JSON.stringify(z.tagsPositifs),
            tagsNegatifs: JSON.stringify(z.tagsNegatifs),
          },
        })
      )
      aSeede = true
    }
  }

  // 5. Employés (idempotent) : complète jusqu'à 5 si moins de 4
  const employes = await db.employe.findMany({
    where: { proId: pro.id },
    orderBy: { createdAt: "asc" },
  })
  if (employes.length < 4) {
    const nomsExistants = new Set(employes.map((e) => e.nom))
    const idsZonesPour = (noms: string[]): string[] => {
      const ids = zones.filter((z) => noms.includes(z.nom)).map((z) => z.id)
      return ids.length > 0 ? ids : zones.map((z) => z.id)
    }
    for (const e of EMPLOYES_DEMO) {
      if (employes.length >= 5) break
      if (nomsExistants.has(e.nom)) continue
      employes.push(
        await db.employe.create({
          data: {
            proId: pro.id,
            nom: e.nom,
            poste: e.poste,
            zoneIds: JSON.stringify(idsZonesPour(e.zones)),
            actif: true,
          },
        })
      )
      aSeede = true
    }
  }

  // 6. Retours (idempotent) : complète jusqu'à ~18 sur les 7 derniers jours
  const nbRetoursAvant = await db.retour.count({ where: { proId: pro.id } })
  let nbRetours = nbRetoursAvant
  if (nbRetoursAvant < CIBLE_RETOURS) {
    const aCreer = CIBLE_RETOURS - nbRetoursAvant
    const maintenant = new Date()
    let nbRecompensesPosees = 0

    for (let j = 0; j < aCreer; j++) {
      const note = NOTES_DEMO[j % NOTES_DEMO.length]
      const zone = zones[ROTATION_ZONES[j % ROTATION_ZONES.length] % zones.length]
      const employe = j % 3 !== 2 ? employes[j % employes.length] : null

      // Date relative à maintenant : jamais dans le futur, répartie sur 7 jours
      const jourOffset = j % 7
      const createdAt = new Date(
        maintenant.getTime() -
          jourOffset * 24 * 3600 * 1000 -
          (1 + Math.floor(Math.random() * 12)) * 3600 * 1000 -
          Math.floor(Math.random() * 60) * 60 * 1000
      )
      const ancien = jourOffset >= 2 // aujourd'hui + hier restent "frais"
      const tags = piocherTags(zone, note)
      const commentaire = piocherCommentaire(j, note)

      const statut =
        note <= 2
          ? ancien
            ? j % 2 === 0
              ? "RESOLVED"
              : "IN_PROGRESS"
            : "NEW"
          : note === 3
            ? ancien
              ? "IN_PROGRESS"
              : "NEW"
            : ancien
              ? "RESOLVED"
              : "NEW"
      const lu = ancien || Math.random() < 0.3

      // 3 récompenses distribuées (notes ≥ 4) : matérialise le système
      // de récompense du Pro (config active posée à l'étape 3)
      const utiliseRecompense = note >= 4 && nbRecompensesPosees < 3 && pro.recompenseActive
      if (utiliseRecompense) nbRecompensesPosees++

      const nps = note >= 5 ? 10 : note === 4 ? 8 : note === 3 ? 6 : null
      const canalChoisi =
        note >= 4 ? (j % 3 === 0 ? "aucun" : "whatsapp") : j % 2 === 0 ? "whatsapp" : "aucun"
      const reponsePro =
        statut === "RESOLVED" && note <= 3 ? REPONSES_PRO[j % REPONSES_PRO.length] : null
      const actionPrise =
        statut === "RESOLVED" && note <= 2 ? ACTIONS_PRISES[j % ACTIONS_PRISES.length] : null
      const personnelMentionne = !employe && note <= 3 && j % 4 === 1 ? "Le serveur du bar" : null

      const historique: { statut: string; at: string }[] = [
        { statut: "NEW", at: createdAt.toISOString() },
      ]
      if (statut !== "NEW") {
        const t = Math.min(createdAt.getTime() + 24 * 3600 * 1000, maintenant.getTime())
        historique.push({ statut, at: new Date(t).toISOString() })
      }

      await db.retour.create({
        data: {
          proId: pro.id,
          zoneId: zone.id,
          employeId: employe?.id ?? null,
          note,
          tags: JSON.stringify(tags),
          commentaire,
          personnelMentionne,
          nps,
          canalChoisi,
          recompenseUtilisee: utiliseRecompense,
          statut,
          historique: JSON.stringify(historique),
          lu,
          reponsePro,
          actionPrise,
          createdAt,
        },
      })

      // Alerte temps réel pour les retours négatifs (≤ 2 étoiles)
      if (note <= 2) {
        await db.alerte.create({
          data: {
            proId: pro.id,
            titre: `Retour négatif — ${zone.nom}`,
            message:
              `Note ${note}/5 signalée en ${zone.nom}` +
              (commentaire ? ` : « ${commentaire} »` : ""),
            canal: "DASHBOARD",
            type: "TEMPS_REEL",
            lu: ancien,
          },
        })
      }
      nbRetours++
    }
    aSeede = true
  }

  // 7. Rapports Coach IA (idempotent) : 2 rapports quotidiens si absents
  const nbRapports = await db.rapportIA.count({ where: { proId: pro.id } })
  if (nbRapports < 2) {
    const retoursDemo = await db.retour.findMany({
      where: { proId: pro.id },
      select: { note: true },
    })
    const moyenne = retoursDemo.length
      ? retoursDemo.reduce((s, r) => s + r.note, 0) / retoursDemo.length
      : 4
    const score = Math.min(95, Math.max(55, Math.round((moyenne / 5) * 100)))

    const debutJour = new Date()
    debutJour.setHours(0, 0, 0, 0)
    const hier = new Date(debutJour.getTime() - 24 * 3600 * 1000)
    const avantHier = new Date(debutJour.getTime() - 2 * 24 * 3600 * 1000)
    // Heure de génération "matinale" (07:30) — jamais dans le futur
    const matin = (jour: Date): Date => {
      const t = new Date(jour.getTime() + 7.5 * 3600 * 1000)
      return t > new Date() ? new Date() : t
    }

    const contenuMarkdown = [
      "## Synthèse",
      `${retoursDemo.length} retours clients sur les 7 derniers jours (note moyenne ${moyenne.toFixed(1)}/5). L'accueil et la qualité des plats sont les points forts ; l'attente en salle au pic de 12h-14h reste la première source de friction.`,
      "",
      "## Priorités du jour",
      "1. Renforcer un runner en salle entre 12h et 14h.",
      "2. Brief accueil : des clients signalent une prise en charge lente.",
      "3. Contrôle propreté des sanitaires avant le service du soir.",
    ].join("\n")

    if (nbRapports === 0) {
      await db.rapportIA.create({
        data: {
          proId: pro.id,
          type: "quotidien",
          periodeDebut: hier,
          periodeFin: debutJour,
          scoreGlobal: score,
          contenuMarkdown,
          priorites: JSON.stringify([
            "Attente en salle au pic de 12h-13h : renforcer un runner",
            "Accueil distrait signalé : brief équipe du midi",
            "Propreté des sanitaires : contrôle avant le service du soir",
          ]),
          recommandations: JSON.stringify([
            "Mettre en place un runner de salle entre 12h et 14h",
            "Relire la grille d'accueil avec l'équipe du midi",
            "Ajouter un passage sanitaire à 19h00 dans la checklist du soir",
          ]),
          predictions: JSON.stringify([
            "Risque de hausse des retours « service lent » le week-end si le staffing du midi n'évolue pas",
          ]),
          source: "ia",
          envoyeParEmail: true,
          envoyeParSMS: false,
          createdAt: matin(debutJour),
        },
      })
    }
    await db.rapportIA.create({
      data: {
        proId: pro.id,
        type: "quotidien",
        periodeDebut: avantHier,
        periodeFin: hier,
        scoreGlobal: Math.min(95, score + 3),
        contenuMarkdown,
        priorites: JSON.stringify([
          "Plats tièdes signalés : contrôle des passages en cuisine",
          "Personnel distrait au bar : recentrage pendant les pics",
        ]),
        recommandations: JSON.stringify([
          "Vérifier la température des plats avant le départ en salle",
          "Limiter les discussions entre serveurs pendant le service",
        ]),
        predictions: JSON.stringify([]),
        source: "ia",
        envoyeParEmail: true,
        envoyeParSMS: false,
        createdAt: matin(hier),
      },
    })
    aSeede = true
  }

  return {
    ok: true,
    userId: user.id,
    proId: pro.id,
    aSeede,
    nbZones: zones.length,
    nbEmployes: employes.length,
    nbRetours,
  }
}

export async function POST(req: NextRequest) {
  try {
    // ---- Rate limit : max 1 appel / 10 s / IP ----
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "local"
    if (!autoriseParIp(ip)) {
      return NextResponse.json(
        { ok: false, error: "Trop de demandes. Réessayez dans quelques secondes." },
        { status: 429 }
      )
    }

    // ---- Tenant démo (idempotent) ----
    const tenant = await assurerTenantDemo()
    if (!tenant.ok) {
      return NextResponse.json(
        { ok: false, error: "Compte de démonstration indisponible." },
        { status: 403 }
      )
    }

    // ---- Session : même mécanique que /api/auth/login ----
    const sessionId = await createSession(tenant.userId)

    // Trace la dernière connexion (même pattern défensif que le login)
    try {
      await db.$executeRaw`UPDATE User SET derniereConnexion = ${new Date().toISOString()} WHERE id = ${tenant.userId}`
    } catch (e) {
      console.warn("demo login : derniereConnexion non mise à jour (non bloquant)", e)
    }

    const res = NextResponse.json({
      ok: true,
      redirect: "/",
      data: {
        seeded: tenant.aSeede,
        nbZones: tenant.nbZones,
        nbEmployes: tenant.nbEmployes,
        nbRetours: tenant.nbRetours,
      },
    })
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("demo login error", e)
    return NextResponse.json(
      { ok: false, error: "Erreur serveur lors de la préparation de la démo." },
      { status: 500 }
    )
  }
}
