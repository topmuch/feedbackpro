// ============================================================
// FeedbackPro - Le Moteur IA : Coach Quotidien et Hebdomadaire
// (cœur du produit, Session 5)
// ------------------------------------------------------------
// genererRapportIA(proId, type) — la fonction principale :
//   1. Récupère tous les retours de la période (Prisma)
//   2. Agrège : score global, score par zone, tags fréquents,
//      employés mentionnés, créneaux problématiques (pics d'alertes),
//      thèmes cachés (analyse sémantique) et ÉVOLUTION vs période
//      précédente
//   3. Construit le prompt (le « Prompt IA parfait »)
//   4. Appelle le LLM (z-ai-web-dev-sdk, backend uniquement)
//   5. Parse la réponse (JSON robuste)
//   6. Sauvegarde dans la table RapportIA (avec la source : ia|fallback)
//   7. Envoie l'email au Pro (Resend — mode démo simulé sans clé)
//   (Les SMS d'alerte critiques sont gérés dans src/lib/alertes.ts)
//
// - FALLBACK DÉTERMINISTE : en cas d'échec LLM (réseau, JSON invalide,
//   timeout…), un rapport calculé depuis les statistiques est produit.
//   Cette fonction ne lève JAMAIS d'exception vers la route appelante.
// - Les crons (src/lib/cron.ts) appellent genererRapportIA en boucle.
// ============================================================

import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { tagLabel } from "@/lib/constants"
import { sendEmail, emailRapportIA } from "@/lib/email"
import { analyserSemantique } from "@/lib/semantic"
import { configSecteur } from "@/lib/secteurs"
import type { Pro, RapportIA } from "@prisma/client"

/**
 * Le « Prompt IA parfait » (Session 5) — consigne système du Coach IA.
 * Le modèle doit parler comme un coach humain, être concret, citer des
 * chiffres, suggérer un ENTRETIEN (jamais un licenciement) pour un
 * employé cité en négatif et une FÉLICITATION PUBLIQUE pour un employé
 * cité en positif. Sortie : JSON strict (contenuMarkdown + tableaux)
 * pour rester compatible avec le parsing et le dashboard.
 *
 * Task M4 — Le prompt est désormais SECTEUR-AWARE : le JSON transmis
 * contient un champ `secteur` avec le nom du secteur, son emoji, sa
 * description et son vocabulaire métier. Le Coach adapte son ton et
 * ses recommandations au secteur (conciergerie pour un hôtel, accueil
 * patient pour un hôpital, fluidité du check-in pour un aéroport…).
 */
export const SYSTEM_PROMPT_FR = `Tu es le Coach IA de FeedbackPro, un expert en management de la qualité pour les commerces.

Tu analyses les retours clients (Clients Mystères) de l'établissement, transmis au format JSON : score global, nombre de retours, répartition par zone (score, volume, tags fréquents), évolution vs période précédente, employés les plus mentionnés, créneaux problématiques, thèmes cachés détectés dans les commentaires libres.

ADAPTATION AU SECTEUR :
Le JSON contient un champ "secteur" avec le nom du secteur (Restaurant, Hôtel, Hôpital/Clinique, Aéroport, Salon, Boutique…), son vocabulaire métier et ses KPIs spéciaux. Adapte ton ton et tes recommandations au secteur :
- Hôtel → parle de "conciergerie", "accueil réception", "qualité de la chambre", "petit-déjeuner"
- Hôpital/Clinique → parle d'"accueil patient", "prise en charge", "salle d'attente", "empathie soignante"
- Aéroport → parle de "fluidité du check-in", "file d'attente sécurité", "embarquement", "info-voyageur"
- Restaurant → parle de "service en salle", "qualité des plats", "accueil", "temps d'attente"
- Boutique/Commerce → parle de "conseil client", "mise en valeur des produits", "caisse"
- Salon/Spa → parle de "prise en charge", "ambiance", "conseil personnalisé"
- Mairie/Administration → parle de "guichet", "clarté des démarches", "accueil usager"

TA MISSION :
Rédige un rapport d'audit qualité en markdown (champ "contenuMarkdown"), structuré ainsi :

## 📊 RAPPORT D'AUDIT QUALITÉ [PÉRIODE]
### 🏢 [Nom de l'établissement]

### 🎯 SCORE GLOBAL : [X]/100 ([hausse/baisse/stable] de [X] points vs période précédente)

### 🔍 ANALYSE PAR ZONE :
[Pour chaque zone : score + commentaire court + points forts/faibles]

### 🧠 ANALYSE & RECOMMANDATIONS :
[Identifie 3 problèmes prioritaires. Pour chacun :]
1. **Problème détecté** : [description avec données précises]
👉 **ACTION RECOMMANDÉE** : [solution concrète et actionnable]
👥 **Personnes concernées** : [employés ou zones]

### 🏆 POINTS POSITIFS À VALORISER :
[Liste des employés/zones performants + suggestions de félicitations]

### 📈 PRÉDICTION :
[Anticipe ce qui risque de se passer si rien n'est fait]

RÈGLES :
- Parle comme un coach humain, pas comme un robot
- Sois concret et actionnable (pas de généralités)
- Cite des chiffres précis
- Propose des solutions réalisables (pas juste "améliorez le service")
- Si un employé est cité en négatif, suggère un entretien, pas un licenciement
- Si un employé est cité en positif, suggère une félicitation publique
- Longueur totale : 500-800 mots

FORMAT DE RÉPONSE : UNIQUEMENT un JSON valide, sans texte autour :
{"scoreGlobal": <0-100>, "contenuMarkdown": "<le rapport markdown ci-dessus>", "priorites": [<les 3 problèmes prioritaires, résumés en une ligne actionnable chacun>], "recommandations": [<2-4 actions concrètes>], "predictions": [<1-3 prédictions du champ PRÉDICTION>]}`

// ---------- Types publics ----------

/** Données agrégées transmises au LLM (et utilisées par le fallback) */
export type DonneesRapport = {
  nomEtablissement: string
  typeEtablissement: string
  periode: string
  totalRetours: number
  noteMoyenne: number
  repartitionNotes: { note: number; count: number }[]
  parZone: { zone: string; noteMoyenne: number; total: number; tagsFrequents: { tag: string; count: number }[] }[]
  topTagsNegatifs: { tag: string; count: number }[]
  heuresPics: string[]
  employesCites: { nom: string; positifs: number; negatifs: number; noteMoyenne: number }[]
  /** Session 5 : évolution vs période précédente (équivalente immédiatement antérieure) */
  evolution: {
    direction: "hausse" | "baisse" | "stable"
    /** Delta en points /100 (arrondi) */
    deltaPoints: number
    scoreActuel: number
    scorePrecedent: number
  }
  /** Session 5 : créneaux horaires des pics d'alertes (retours ≤ 2★) */
  creneauxAlertes: string[]
  /** Session 5 : thèmes cachés détectés par l'analyse sémantique des commentaires */
  themesDetectes: { nom: string; occurrences: number; noteMoyenne: number }[]
  /** Session 5 : mots-clés récurrents des commentaires libres */
  motsClesRecuvents: string[]
  /**
   * Task M4 — Contexte secteur du Pro (depuis SecteurConfig en BDD,
   * ou fallback sur le fichier statique SECTEUR_CONFIG). Injecté dans
   * le prompt pour adapter le ton du Coach au secteur de l'établissement.
   */
  secteur: {
    nom: string
    emoji: string
    description: string
    /** Vocabulaire métier du secteur (conciergerie, accueil patient…) */
    vocabulaire: string[]
    /** KPIs spéciaux du secteur (ex : temps d'attente, délai prise en charge) */
    kpisSpeciaux: { id: string; label: string; target: number; unit: string }[]
    /** Langues supportées par le secteur */
    languesSupportees: string[]
  }
}

/** Contenu d'un rapport généré (par le LLM ou par le fallback déterministe) */
export type ContenuRapport = {
  scoreGlobal: number
  contenuMarkdown: string
  priorites: string[]
  recommandations: string[]
  predictions: string[]
  /** "ia" = généré par le LLM · "fallback" = calcul déterministe depuis les stats */
  source: "ia" | "fallback"
}

/** Rapport sérialisé pour les réponses API (JSON parsé) */
export type RapportSerialise = {
  id: string
  type: string
  periodeDebut: string
  periodeFin: string
  scoreGlobal: number
  contenuMarkdown: string
  priorites: string[]
  recommandations: string[]
  predictions: string[]
  /** "ia" = généré par le LLM · "fallback" = analyse locale déterministe */
  source: "ia" | "fallback"
  envoyeParEmail: boolean
  envoyeParSMS: boolean
  createdAt: string
}

// ---------- Helpers JSON (champs STRING JSON du schéma SQLite) ----------

/** Parse un champ JSON avec repli sûr : valeur invalide → [] */
export function parseJsonArray(valeur: string | null | undefined): string[] {
  if (!valeur) return []
  try {
    const parse = JSON.parse(valeur) as unknown
    return Array.isArray(parse) ? parse.map(String) : []
  } catch {
    return []
  }
}

/** Sérialise un RapportIA de la base vers la forme API (JSON parsé) */
export function serialiserRapport(r: RapportIA): RapportSerialise {
  return {
    id: r.id,
    type: r.type,
    periodeDebut: r.periodeDebut.toISOString(),
    periodeFin: r.periodeFin.toISOString(),
    scoreGlobal: r.scoreGlobal,
    contenuMarkdown: r.contenuMarkdown,
    priorites: parseJsonArray(r.priorites),
    recommandations: parseJsonArray(r.recommandations),
    predictions: parseJsonArray(r.predictions),
    source: r.source === "fallback" ? "fallback" : "ia",
    envoyeParEmail: r.envoyeParEmail,
    envoyeParSMS: r.envoyeParSMS,
    createdAt: r.createdAt.toISOString(),
  }
}

// ---------- Périodes ----------

/** Bornes de la période auditée selon la fréquence du rapport */
export function periodePourType(type: "quotidien" | "hebdomadaire"): { periodeDebut: Date; periodeFin: Date } {
  const periodeFin = new Date()
  const periodeDebut = new Date(periodeFin)
  // quotidien = dernières 24 h · hebdomadaire = derniers 7 jours
  periodeDebut.setTime(periodeFin.getTime() - (type === "quotidien" ? 1 : 7) * 24 * 3600 * 1000)
  return { periodeDebut, periodeFin }
}

// ============================================================
// Task M4 — Résolution du contexte secteur (BDD ou fallback statique)
// ------------------------------------------------------------
// Le Coach IA adapte son ton au secteur de l'établissement. On charge
// la fiche SecteurConfig depuis la BDD (via pro.secteurId si présent,
// sinon par typeEtablissement). En cas d'absence, on retombe sur le
// fichier statique src/lib/secteurs.ts — l'IA reste fonctionnelle.
// ============================================================

/** Vocabulaire métier par secteur (utilisé par le LLM et le fallback). */
const VOCABULAIRE_PAR_SECTEUR: Record<string, string[]> = {
  Restaurant: ["service en salle", "qualité des plats", "accueil", "temps d'attente"],
  "Fast Food": ["rapidité", "retrait commande", "salle", "tri"],
  Hôtel: ["conciergerie", "accueil réception", "qualité de la chambre", "petit-déjeuner"],
  "Café / Bar": ["accueil au comptoir", "ambiance", "service rapide"],
  "Boulangerie / Pâtisserie": ["accueil", "file d'attente", "fraîcheur"],
  "Boutique / Commerce": ["conseil client", "mise en valeur des produits", "caisse"],
  "Salon de coiffure": ["prise en charge", "écoute du besoin", "station de travail"],
  "Institut de beauté / Spa": ["prise en charge", "ambiance", "conseil personnalisé", "cabine"],
  "Garage automobile": ["estimation", "atelier", "transparence"],
  "Hôpital / Clinique": ["accueil patient", "prise en charge", "salle d'attente", "empathie soignante"],
  Aéroport: ["fluidité du check-in", "file d'attente sécurité", "embarquement", "info-voyageur"],
  "Gare / Station": ["info-voyageur", "propreté des quais", "accueil guichet"],
  "Entreprise (accueil public)": ["accueil visiteur", "badge", "attente"],
  "Mairie / Administration": ["guichet", "clarté des démarches", "accueil usager"],
  Autre: ["accueil", "service", "compétence"],
}

/** Charge le contexte secteur d'un Pro (depuis la BDD, ou fallback statique). */
async function chargerContexteSecteur(pro: {
  id: string
  nomEtablissement: string
  typeEtablissement: string
  secteurId?: string | null
}): Promise<DonneesRapport["secteur"]> {
  // 1) Cherche d'abord la fiche BDD par secteurId, puis par typeEtablissement
  const where = pro.secteurId
    ? { id: pro.secteurId }
    : { nom: pro.typeEtablissement }
  const bdd = await db.secteurConfig.findUnique({ where }).catch(() => null)

  if (bdd) {
    const kpis = parseJsonSecteur<{
      id: string
      label: string
      target: number
      unit: string
    }[]>(bdd.kpisSpeciaux, [])
    const langues = parseJsonSecteur<string[]>(bdd.languesSupportees, ["fr"])
    return {
      nom: bdd.nom,
      emoji: bdd.emoji,
      description: bdd.description,
      vocabulaire: VOCABULAIRE_PAR_SECTEUR[bdd.nom] ?? VOCABULAIRE_PAR_SECTEUR.Autre,
      kpisSpeciaux: kpis,
      languesSupportees: langues,
    }
  }

  // 2) Fallback : fichier statique src/lib/secteurs.ts
  const statique = configSecteur(pro.typeEtablissement)
  return {
    nom: pro.typeEtablissement,
    emoji: statique.emoji,
    description: statique.description,
    vocabulaire: VOCABULAIRE_PAR_SECTEUR[pro.typeEtablissement] ?? VOCABULAIRE_PAR_SECTEUR.Autre,
    kpisSpeciaux: [],
    languesSupportees: ["fr"],
  }
}

/** Parse un champ JSON de SecteurConfig (helper local, tolérant). */
function parseJsonSecteur<T>(valeur: string | null | undefined, defaut: T): T {
  if (!valeur) return defaut
  try {
    return JSON.parse(valeur) as T
  } catch {
    return defaut
  }
}

// ---------- Agrégation des données d'une période ----------

/**
 * Agrège les retours d'un Pro sur une période : notes, zones, tags,
 * heures de pointe, employés cités, ÉVOLUTION vs période précédente,
 * CRÉNEAUX D'ALERTES (note ≤ 2) et THÈMES CACHÉS (analyse sémantique).
 * C'est la matière première du Coach IA (Session 5).
 */
export async function agregerDonnees(
  pro: Pick<Pro, "id" | "nomEtablissement" | "typeEtablissement" | "secteurId">,
  periodeDebut: Date,
  periodeFin: Date
): Promise<DonneesRapport> {
  const retours = await db.retour.findMany({
    where: { proId: pro.id, createdAt: { gte: periodeDebut, lte: periodeFin } },
    include: {
      zone: { select: { nom: true } },
      employe: { select: { nom: true } },
    },
  })

  const total = retours.length
  const somme = retours.reduce((s, r) => s + r.note, 0)
  const noteMoyenne = total ? Number((somme / total).toFixed(2)) : 0

  const repartitionNotes = [1, 2, 3, 4, 5].map((n) => ({
    note: n,
    count: retours.filter((r) => r.note === n).length,
  }))

  // ---------- Session 5 : ÉVOLUTION vs période précédente ----------
  // La période précédente = fenêtre de MÊME durée, immédiatement avant.
  const dureeMs = Math.max(1, periodeFin.getTime() - periodeDebut.getTime())
  const prevFin = new Date(periodeDebut.getTime() - 1)
  const prevDebut = new Date(prevFin.getTime() - dureeMs)
  const prevRetours = await db.retour.findMany({
    where: { proId: pro.id, createdAt: { gte: prevDebut, lte: prevFin } },
    select: { note: true },
  })
  const notePrecedente = prevRetours.length
    ? prevRetours.reduce((s, r) => s + r.note, 0) / prevRetours.length
    : 0
  const scoreActuel = Math.round(noteMoyenne * 20)
  const scorePrecedent = Math.round(notePrecedente * 20)
  const deltaBrut = prevRetours.length > 0 && total > 0 ? scoreActuel - scorePrecedent : 0
  const evolution = {
    direction: (Math.abs(deltaBrut) < 2 ? "stable" : deltaBrut > 0 ? "hausse" : "baisse") as
      | "hausse"
      | "baisse"
      | "stable",
    deltaPoints: Math.abs(deltaBrut),
    scoreActuel,
    scorePrecedent,
  }

  // ----- Par zone : note moyenne + tags les plus cités -----
  const zonesMap = new Map<string, { notes: number[]; tags: Map<string, number> }>()
  const negatifsMap = new Map<string, number>()
  const heuresMap = new Map<number, number>()
  const employesMap = new Map<string, { positifs: number; negatifs: number; notes: number[] }>()

  for (const r of retours) {
    const tags = parseJsonArray(r.tags)
    const nomZone = r.zone?.nom ?? "Non définie"
    const zone = zonesMap.get(nomZone) ?? { notes: [], tags: new Map<string, number>() }
    zone.notes.push(r.note)
    for (const t of tags) zone.tags.set(t, (zone.tags.get(t) ?? 0) + 1)
    zonesMap.set(nomZone, zone)

    // Tags négatifs (retours ≤ 3★) pour les priorités
    if (r.note <= 3) {
      for (const t of tags) negatifsMap.set(t, (negatifsMap.get(t) ?? 0) + 1)
    }

    // Heures de pointe
    const h = r.createdAt.getHours()
    heuresMap.set(h, (heuresMap.get(h) ?? 0) + 1)

    // Employés cités (rattachés au retour ou mentionnés librement)
    const nomEmploye = r.employe?.nom ?? r.personnelMentionne
    if (nomEmploye) {
      const e = employesMap.get(nomEmploye) ?? { positifs: 0, negatifs: 0, notes: [] }
      if (r.note >= 4) e.positifs += 1
      else e.negatifs += 1
      e.notes.push(r.note)
      employesMap.set(nomEmploye, e)
    }
  }

  const parZone = [...zonesMap.entries()].map(([zone, v]) => ({
    zone,
    noteMoyenne: v.notes.length ? Number((v.notes.reduce((s, n) => s + n, 0) / v.notes.length).toFixed(2)) : 0,
    total: v.notes.length,
    tagsFrequents: [...v.tags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag: tagLabel(tag), count })),
  }))

  const topTagsNegatifs = [...negatifsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag: tagLabel(tag), count }))

  // Heures de pointe : 3 créneaux les plus chargés (format "19h")
  const heuresPics = [...heuresMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => `${h}h`)

  // ---------- Session 5 : CRÉNEAUX PROBLÉMATIQUES (pics d'alertes ≤ 2★) ----------
  // On regroupe les alertes par heure, on fusionne les heures contiguës en
  // plages (« entre 14h et 16h ») et on garde les 3 plus critiques.
  const alertesParHeure = new Map<number, number>()
  for (const r of retours) {
    if (r.note <= 2) {
      const h = r.createdAt.getHours()
      alertesParHeure.set(h, (alertesParHeure.get(h) ?? 0) + 1)
    }
  }
  const heuresAlertes = [...alertesParHeure.keys()].sort((a, b) => a - b)
  const plagesAlertes: { label: string; total: number }[] = []
  let debutPlage: number | null = null
  let precedente: number | null = null
  const clorePlage = () => {
    if (debutPlage !== null && precedente !== null) {
      const totalPlage = Array.from(
        { length: precedente - debutPlage + 1 },
        (_, i) => alertesParHeure.get(debutPlage! + i) ?? 0
      ).reduce((s, n) => s + n, 0)
      const label =
        debutPlage === precedente
          ? `vers ${debutPlage}h`
          : `entre ${debutPlage}h et ${precedente + 1}h`
      plagesAlertes.push({ label: `${label} (${totalPlage} alerte${totalPlage > 1 ? "s" : ""} ≤ 2★)`, total: totalPlage })
    }
    debutPlage = null
    precedente = null
  }
  for (const h of heuresAlertes) {
    if (debutPlage === null) debutPlage = h
    else if (h === precedente! + 1) {
      // contigu : la plage s'étend
    } else {
      clorePlage()
      debutPlage = h
    }
    precedente = h
  }
  clorePlage()
  const creneauxAlertes = plagesAlertes.sort((a, b) => b.total - a.total).slice(0, 3).map((p) => p.label)

  // ---------- Session 5 : ANALYSE SÉMANTIQUE (thèmes cachés + mots-clés) ----------
  const semantique = analyserSemantique(
    retours.map((r) => ({
      commentaire: r.commentaire ?? "",
      note: r.note,
      zoneNom: r.zone?.nom,
    }))
  )
  const themesDetectes = semantique.themes.slice(0, 3).map((t) => ({
    nom: t.nom,
    occurrences: t.occurrences,
    noteMoyenne: t.noteMoyenne,
  }))
  const motsClesRecuvents = semantique.motsCles.slice(0, 5).map((m) => m.mot)

  const employesCites = [...employesMap.entries()]
    .map(([nom, e]) => ({
      nom,
      positifs: e.positifs,
      negatifs: e.negatifs,
      noteMoyenne: e.notes.length ? Number((e.notes.reduce((s, n) => s + n, 0) / e.notes.length).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.negatifs - a.negatifs || a.noteMoyenne - b.noteMoyenne)
    .slice(0, 6)

  const periodeTxt = `${periodeDebut.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${periodeFin.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`

  // Task M4 — Contexte secteur (BDD ou fallback statique)
  const secteur = await chargerContexteSecteur(pro)

  return {
    nomEtablissement: pro.nomEtablissement,
    typeEtablissement: pro.typeEtablissement,
    periode: periodeTxt,
    totalRetours: total,
    noteMoyenne,
    repartitionNotes,
    parZone,
    topTagsNegatifs,
    heuresPics,
    employesCites,
    evolution,
    creneauxAlertes,
    themesDetectes,
    motsClesRecuvents,
    secteur,
  }
}

// ---------- Parsing robuste de la réponse LLM ----------

/**
 * Extrait et parse le JSON renvoyé par le modèle, même s'il est
 * enveloppé dans des blocs ```json … ``` ou noyé dans du texte.
 * Renvoie null si rien de exploitable n'est trouvé.
 */
function extraireJson(texte: string): Record<string, unknown> | null {
  if (!texte) return null
  // 1) Bloc ```json … ``` (insensible à la casse)
  const bloc = texte.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidats = [bloc?.[1], texte]
  for (const brut of candidats) {
    if (!brut) continue
    // 2) Direct, puis sous-chaîne du premier « { » au dernier « } »
    const essaies = [brut.trim()]
    const debut = brut.indexOf("{")
    const fin = brut.lastIndexOf("}")
    if (debut !== -1 && fin > debut) essaies.push(brut.slice(debut, fin + 1))
    for (const essai of essaies) {
      try {
        const parse = JSON.parse(essai) as unknown
        if (parse && typeof parse === "object" && !Array.isArray(parse)) {
          return parse as Record<string, unknown>
        }
      } catch {
        /* essai suivant */
      }
    }
  }
  return null
}

/** Contraint une valeur inconnue en tableau de chaînes propre */
function enTableauStrings(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is unknown => x !== null && x !== undefined)
    .map((x) => String(x).trim())
    .filter((s) => s.length > 0)
    .slice(0, max)
}

/** Valide et normalise le JSON du LLM ; renvoie null si incomplet */
function validerContenuLLM(obj: Record<string, unknown> | null): ContenuRapport | null {
  if (!obj) return null
  const score = Number(obj.scoreGlobal)
  const md = typeof obj.contenuMarkdown === "string" ? obj.contenuMarkdown : ""
  // Un rapport sans score numérique ou sans contenu n'est pas exploitable
  if (!Number.isFinite(score) || !md.trim()) return null

  const priorites = enTableauStrings(obj.priorites, 3)
  const recommandations = enTableauStrings(obj.recommandations, 4)
  const predictions = enTableauStrings(obj.predictions, 3)
  if (priorites.length === 0) return null

  return {
    scoreGlobal: Math.max(0, Math.min(100, Math.round(score))),
    contenuMarkdown: md,
    priorites,
    recommandations,
    predictions,
    source: "ia",
  }
}

// ---------- Fallback déterministe ----------

/**
 * Rapport calculé uniquement depuis les statistiques (aucun LLM).
 * Garantit que /api/pro/coach et le cron produisent TOUJOURS un rapport
 * exploitable, même sans modèle disponible.
 */
export function rapportFallback(donnees: DonneesRapport): ContenuRapport {
  const scoreGlobal = Math.round(donnees.noteMoyenne * 20)
  const d = donnees

  const repartitionTxt = d.repartitionNotes
    .map((r) => `${r.note}★ : ${r.count}`)
    .join(" · ")

  // Évolution vs période précédente (format du Prompt IA parfait)
  const evoTxt =
    d.evolution.direction === "stable"
      ? "stable"
      : `${d.evolution.direction} de ${d.evolution.deltaPoints} points`

  // Points forts : zones avec la meilleure note + tags positifs les plus cités
  const zonesTriees = [...d.parZone].sort((a, b) => b.noteMoyenne - a.noteMoyenne)
  const meilleureZone = zonesTriees[0]
  const pointsForts: string[] = []
  if (meilleureZone && meilleureZone.total > 0) {
    pointsForts.push(
      `Zone « ${meilleureZone.zone} » la mieux notée (${meilleureZone.noteMoyenne.toFixed(2).replace(".", ",")}/5 sur ${meilleureZone.total} retours)`
    )
    if (meilleureZone.tagsFrequents.length > 0) {
      pointsForts.push(`Ce que vos clients apprécient : ${meilleureZone.tagsFrequents.map((t) => `${t.tag} (${t.count})`).join(", ")}`)
    }
  } else {
    pointsForts.push("Aucun retour négatif majeur signalé sur la période")
  }

  // Points de vigilance : top tags négatifs + zone la plus fragile
  const pointsVigilance: string[] = []
  for (const t of d.topTagsNegatifs.slice(0, 3)) {
    pointsVigilance.push(`${t.tag} — cité ${t.count} fois sur des retours ≤ 3★`)
  }
  const zoneFragile = zonesTriees[zonesTriees.length - 1]
  if (zoneFragile && d.parZone.length > 1 && zoneFragile.noteMoyenne < 4) {
    pointsVigilance.push(
      `Zone « ${zoneFragile.zone} » à surveiller (moyenne ${zoneFragile.noteMoyenne.toFixed(2).replace(".", ",")}/5)`
    )
  }

  // Priorités = top 3 tags négatifs, transformés en actions concrètes
  const verbeParTag: Record<string, string> = {
    "🟥 Personnel impoli / Froid": "Recadrer l'accueil",
    "🟨 Mal renseigné sur les produits": "Former sur les produits",
    "🟦 Attente trop longue": "Réduire l'attente",
    "💬 Personnel distrait / discussions entre eux": "Recentrer l'équipe sur les clients",
    "🧹 Lieu mal rangé / sale": "Renforcer le nettoyage",
    "🟧 Erreur / Problème technique": "Corriger les erreurs récurrentes",
  }

  const lignes: string[] = []
  lignes.push(`## 📊 RAPPORT D'AUDIT QUALITÉ — ${d.periode}`)
  lignes.push("")
  // Task M4 — Affichage du secteur avec son emoji pour adapter le ton
  lignes.push(`### 🏢 ${d.nomEtablissement}`)
  if (d.secteur.nom && d.secteur.nom !== "Autre") {
    lignes.push(`*Secteur : ${d.secteur.emoji} ${d.secteur.nom}* — ${d.secteur.description}`)
  }
  lignes.push("")
  lignes.push(`### 🎯 SCORE GLOBAL : ${scoreGlobal}/100 (${evoTxt})`)
  lignes.push("")
  lignes.push(`**Période auditée :** ${d.periode} — ${d.totalRetours} retour(s) de Clients Mystères`)
  lignes.push("")
  lignes.push(`Répartition des notes : ${d.totalRetours > 0 ? repartitionTxt : "aucun retour sur la période"}`)
  lignes.push("")
  // Task M4 — Vocabulaire métier du secteur (orientations thématiques)
  if (d.secteur.vocabulaire.length > 0) {
    lignes.push(`*Focus secteur : ${d.secteur.vocabulaire.join(" · ")}*`)
    lignes.push("")
  }
  // Task M4 — KPIs spéciaux du secteur (affichés s'ils existent)
  if (d.secteur.kpisSpeciaux.length > 0) {
    lignes.push("**KPIs spécifiques au secteur à surveiller :**")
    for (const k of d.secteur.kpisSpeciaux) {
      lignes.push(`- ${k.label} (cible : ${k.target} ${k.unit})`)
    }
    lignes.push("")
  }
  lignes.push("### 🔍 ANALYSE PAR ZONE :")
  if (d.parZone.length === 0) {
    lignes.push("- Aucune zone scannée sur la période : rendez vos QR codes plus visibles.")
  } else {
    for (const z of [...d.parZone].sort((a, b) => b.noteMoyenne - a.noteMoyenne)) {
      const tagsTxt = z.tagsFrequents.length ? ` — tags : ${z.tagsFrequents.map((t) => t.tag).join(", ")}` : ""
      lignes.push(`- **${z.zone}** : ${z.noteMoyenne.toFixed(2).replace(".", ",")}/5 sur ${z.total} retours${tagsTxt}`)
    }
  }
  lignes.push("")
  lignes.push("### 🧠 ANALYSE & RECOMMANDATIONS :")
  if (pointsVigilance.length === 0 && d.totalRetours === 0) {
    lignes.push(
      "Aucun retour collecté sur la période. Rendez vos QR codes plus visibles à l'entrée, en salle et aux toilettes : chaque zone scannée est une zone auditée."
    )
  } else {
    // 3 problèmes prioritaires au format du Prompt IA parfait
    const nbPriorites = Math.max(pointsVigilance.length, Math.min(3, d.topTagsNegatifs.length), 1)
    for (let i = 0; i < Math.min(3, Math.max(nbPriorites, pointsVigilance.length)); i++) {
      const probleme =
        pointsVigilance[i] ??
        (d.creneauxAlertes[i] ? `Pic d'alertes ${d.creneauxAlertes[i]}` : "Volume de retours insuffisant pour identifier un problème précis")
      const action =
        d.topTagsNegatifs[i] !== undefined
          ? verbeParTag[d.topTagsNegatifs[i].tag] ?? "Traiter ce motif avec l'équipe"
          : i === 0
            ? "Relancer la collecte : objectif +20 % de retours la semaine prochaine"
            : "Repositionner les QR codes dans les zones les moins scannées"
      const concernes =
        i === 0 && zoneFragile && d.parZone.length > 1
          ? `zone « ${zoneFragile.zone} »`
          : d.employesCites[0]
            ? `${d.employesCites[0].nom} et l'équipe en place`
            : "toute l'équipe"
      lignes.push(`${i + 1}. **Problème détecté** : ${probleme}`)
      lignes.push(`   👉 **ACTION RECOMMANDÉE** : ${action}`)
      lignes.push(`   👥 **Personnes concernées** : ${concernes}`)
    }
  }
  if (d.creneauxAlertes.length > 0) {
    lignes.push("")
    lignes.push(`⏰ Créneaux problématiques (alertes ≤ 2★) : ${d.creneauxAlertes.join(" · ")}`)
  }
  if (d.themesDetectes.length > 0) {
    lignes.push("")
    lignes.push(
      `🧩 Thèmes cachés détectés dans les commentaires : ${d.themesDetectes
        .map((t) => `${t.nom} (${t.occurrences} mention(s), note moy. ${t.noteMoyenne.toFixed(2).replace(".", ",")}/5)`)
        .join(" · ")}`
    )
  }
  lignes.push("")
  lignes.push("### 🏆 POINTS POSITIFS À VALORISER :")
  for (const p of pointsForts) lignes.push(`- ${p}`)
  const valoriser = d.employesCites.filter((e) => e.noteMoyenne >= 4 && e.positifs > 0)
  for (const e of valoriser.slice(0, 2)) {
    lignes.push(`- 👏 Félicitez publiquement **${e.nom}** : ${e.positifs} mention(s) positive(s), note moyenne ${e.noteMoyenne.toFixed(2).replace(".", ",")}/5`)
  }
  lignes.push("")

  // Priorités (tableau UI) = top 3 tags négatifs, transformés en actions concrètes
  const priorites = d.topTagsNegatifs
    .slice(0, 3)
    .map((t) => `${verbeParTag[t.tag] ?? "Traiter"} : ${t.tag} (${t.count} mention(s) sur la période)`)
  if (priorites.length === 0) {
    priorites.push("Repositionner les QR codes dans les zones les moins scannées")
    if (meilleureZone) priorites.push(`Féliciter l'équipe de la zone « ${meilleureZone.zone} » pour sa note`)
    priorites.push("Relancer la collecte : objectif +20 % de retours la semaine prochaine")
  }

  const recommandations: string[] = []
  if (zoneFragile && d.parZone.length > 1 && zoneFragile.noteMoyenne < 4) {
    recommandations.push(`Passer la zone « ${zoneFragile.zone} » en revue avec l'équipe (moyenne la plus basse)`)
  }
  if (d.heuresPics.length > 0) {
    recommandations.push(`Renforcer l'équipe sur les créneaux de pointe (${d.heuresPics.join(", ")})`)
  }
  if (d.employesCites.length > 0) {
    const topEmploye = [...d.employesCites].sort((a, b) => b.noteMoyenne - a.noteMoyenne)[0]
    if (topEmploye && topEmploye.noteMoyenne >= 4) {
      recommandations.push(`Valoriser ${topEmploye.nom} (note moyenne ${topEmploye.noteMoyenne.toFixed(2).replace(".", ",")}/5)`)
    }
  }
  recommandations.push("Vérifier la cohérence des tags proposés sur chaque zone avec les irritants réels")

  const predictions: string[] = []
  if (scoreGlobal < 70) {
    predictions.push("Sans action sur les motifs récurrents, le score devrait stater sous 70/100 la semaine prochaine")
  } else {
    predictions.push(`En corrigeant les 3 priorités, le score peut viser ${Math.min(100, scoreGlobal + 5)}/100 la semaine prochaine`)
  }
  if (d.topTagsNegatifs.length > 0) {
    predictions.push(`Le motif « ${d.topTagsNegatifs[0].tag} » risque de représenter la majorité des réclamations s'il n'est pas traité`)
  }
  if (d.totalRetours < 5) {
    predictions.push("Volume de retours faible : le rapport sera plus fiable avec davantage de scans")
  }

  lignes.push("### 📈 PRÉDICTION :")
  for (const p of predictions.slice(0, 3)) lignes.push(`- ${p}`)

  return {
    scoreGlobal,
    contenuMarkdown: lignes.join("\n"),
    priorites: priorites.slice(0, 3),
    recommandations: recommandations.slice(0, 4),
    predictions: predictions.slice(0, 3),
    source: "fallback",
  }
}

// ---------- Génération via le LLM ----------

/** Timeout de sécurité : jamais plus de 45 s d'attente du modèle */
const TIMEOUT_LLM_MS = 45_000

/**
 * Génère le contenu du rapport : appel LLM + validation, repli
 * automatique sur le rapport déterministe en cas de moindre échec.
 * Ne lève JAMAIS d'exception.
 */
export async function genererContenuRapport(donnees: DonneesRapport): Promise<ContenuRapport> {
  try {
    const zai = await ZAI.create()
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT_FR },
          { role: "user", content: JSON.stringify(donnees) },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("Timeout du Coach IA")), TIMEOUT_LLM_MS)),
    ])) as { choices?: { message?: { content?: string } }[] }

    const texte = completion?.choices?.[0]?.message?.content ?? ""
    const contenu = validerContenuLLM(extraireJson(texte))
    if (contenu) return contenu

    console.warn("[Coach IA] Réponse LLM inexploitable → rapport déterministe")
    return rapportFallback(donnees)
  } catch (e) {
    console.warn("[Coach IA] Échec LLM → rapport déterministe (non bloquant)", e)
    return rapportFallback(donnees)
  }
}

// ---------- Génération + enregistrement ----------

/**
 * Génère le rapport d'audit d'un Pro pour sa fréquence (ou un type imposé),
 * l'enregistre en base et envoie l'email au destinataire configuré.
 * L'email est strictement non bloquant. Ne lève jamais d'exception
 * pour la partie génération (fallback déterministe garanti).
 * Renvoie { rapport, source } — source indique si le LLM a répondu.
 */
export async function genererEtEnregistrerRapport(
  pro: Pro,
  type?: "quotidien" | "hebdomadaire",
  options?: { envoyerEmail?: boolean }
): Promise<{ rapport: RapportIA; source: "ia" | "fallback" }> {
  const typeRapport = type ?? (pro.frequenceRapport === "hebdomadaire" ? "hebdomadaire" : "quotidien")
  const { periodeDebut, periodeFin } = periodePourType(typeRapport)

  const donnees = await agregerDonnees(pro, periodeDebut, periodeFin)
  const contenu = await genererContenuRapport(donnees)

  if (contenu.source === "fallback") {
    console.log(`[Coach IA] Rapport déterministe pour ${pro.nomEtablissement} (${typeRapport})`)
  }
  const rapport = await db.rapportIA.create({
    data: {
      proId: pro.id,
      type: typeRapport,
      periodeDebut,
      periodeFin,
      scoreGlobal: contenu.scoreGlobal,
      contenuMarkdown: contenu.contenuMarkdown,
      priorites: JSON.stringify(contenu.priorites),
      recommandations: JSON.stringify(contenu.recommandations),
      predictions: JSON.stringify(contenu.predictions),
      // Session 5 : la source est stockée pour prouver si le rapport a été
      // généré par le LLM ("ia") ou par l'analyse locale ("fallback")
      source: contenu.source,
    },
  })

  // ---------- Email du rapport (non bloquant) ----------
  if (options?.envoyerEmail !== false && pro.email) {
    try {
      const { sujet, html } = emailRapportIA(
        { nomEtablissement: pro.nomEtablissement },
        { ...rapport, priorites: contenu.priorites }
      )
      const succes = await sendEmail(pro.email, sujet, html)
      if (succes) {
        await db.rapportIA.update({ where: { id: rapport.id }, data: { envoyeParEmail: true } })
        rapport.envoyeParEmail = true
      }
    } catch (e) {
      console.warn("Email du rapport IA non envoyé (non bloquant)", e)
    }
  }

  return { rapport, source: contenu.source }
}

// ---------- Fonction principale (signature Session 5) ----------

/**
 * FONCTION PRINCIPALE DU MOTEUR IA (Session 5) :
 * genererRapportIA(proId, type: "quotidien" | "hebdomadaire")
 *
 * 1. Récupère le Pro (et son email de réception)
 * 2. Récupère tous les retours de la période (Prisma) et les agrège
 *    (score global, score par zone, tags, employés, créneaux
 *    problématiques, évolution vs période précédente, thèmes cachés)
 * 3. Construit le prompt (Prompt IA parfait) et appelle le LLM
 * 4. Parse la réponse et sauvegarde dans la table RapportIA
 * 5. Envoie l'email au Pro (Resend — simulé en mode démo)
 * → Les SMS d'alerte temps réel sont gérés séparément (src/lib/alertes.ts)
 *
 * Utilisée par : POST /api/pro/coach, /api/cron/rapports-quotidiens,
 * /api/cron/rapports-hebdomadaires. Ne lève jamais d'exception pour la
 * partie génération (fallback déterministe garanti).
 */
export async function genererRapportIA(
  proId: string,
  type: "quotidien" | "hebdomadaire",
  options?: { envoyerEmail?: boolean }
): Promise<{ rapport: RapportIA; source: "ia" | "fallback" }> {
  const pro = await db.pro.findUnique({ where: { id: proId } })
  if (!pro) throw new Error(`Pro introuvable : ${proId}`)
  return genererEtEnregistrerRapport(pro, type, options)
}

// ============================================================
// D4 — Alertes intelligentes du Coach IA
// ------------------------------------------------------------
// detecterAlertesIntelligentes(proId) :
//   Compare la note moyenne des dernières 24 h à celle des 7 jours
//   précédents, ZONE PAR ZONE. Si l'écart est > 1 point sur une zone
//   (baisse tendancielle), crée :
//     - une Notification (type "alerte_coach") → cloche du dashboard
//     - une Alerte (type "INTELLIGENTE") → bannière du Coach IA
//   Strictement non bloquant : aucune exception propagée.
//
// Appelée après chaque nouveau retour (POST /api/retour) pour réagir
// en temps réel aux baisses de qualité.
// ============================================================

/** Seuil de déclenchement : écart de note > ce seuil déclenche une alerte */
const SEUIL_BAISSE_ALERTE = 1 // point sur l'échelle 1-5

/** Fenêtre de comparaison : dernières 24 h vs 7 jours précédents */
const FENETRE_RECENTE_H = 24
const FENETRE_REFERENCE_J = 7

/** Nombre minimum de retours sur la période de référence pour qu'une baisse soit significative */
const MIN_RETOURS_REFERENCE = 2

export async function detecterAlertesIntelligentes(proId: string): Promise<void> {
  try {
    const now = new Date()
    const debutRecent = new Date(now.getTime() - FENETRE_RECENTE_H * 3600 * 1000)
    const debutReference = new Date(now.getTime() - (FENETRE_REFERENCE_J + 1) * 24 * 3600 * 1000)
    // La période de référence s'arrête au début de la fenêtre récente (pas de chevauchement)
    const finReference = debutRecent

    const retours = await db.retour.findMany({
      where: {
        proId,
        createdAt: { gte: debutReference },
      },
      select: { note: true, zoneId: true, createdAt: true, zone: { select: { nom: true } } },
    })

    // Regroupe par zone : notes récentes (24h) vs notes de référence (7j précédents)
    const parZone = new Map<
      string,
      { nom: string; notesRecentes: number[]; notesReference: number[] }
    >()

    for (const r of retours) {
      const zoneId = r.zoneId
      const entree = parZone.get(zoneId) ?? {
        nom: r.zone?.nom ?? "Zone",
        notesRecentes: [],
        notesReference: [],
      }
      if (r.createdAt >= debutRecent) {
        entree.notesRecentes.push(r.note)
      } else if (r.createdAt < finReference) {
        entree.notesReference.push(r.note)
      }
      parZone.set(zoneId, entree)
    }

    const pro = await db.pro.findUnique({
      where: { id: proId },
      select: { userId: true },
    })
    if (!pro) return

    for (const [zoneId, data] of parZone) {
      // Il faut au moins 1 retour récent ET MIN_RETOURS_REFERENCE retours de référence
      if (data.notesRecentes.length === 0) continue
      if (data.notesReference.length < MIN_RETOURS_REFERENCE) continue

      const moyRecente =
        data.notesRecentes.reduce((s, n) => s + n, 0) / data.notesRecentes.length
      const moyReference =
        data.notesReference.reduce((s, n) => s + n, 0) / data.notesReference.length
      const ecart = moyReference - moyRecente // positif = baisse

      if (ecart > SEUIL_BAISSE_ALERTE) {
        // Anti-spam : ne crée pas une alerte si une alerte INTELLIGENTE non lue
        // existe déjà pour cette zone dans les dernières 24h.
        const existante = await db.alerte.findFirst({
          where: {
            proId,
            type: "INTELLIGENTE",
            lu: false,
            createdAt: { gte: debutRecent },
            message: { contains: data.nom },
          },
          select: { id: true },
        })
        if (existante) continue

        const titre = `📉 Baisse de qualité détectée — ${data.nom}`
        const message =
          `La note moyenne sur la zone « ${data.nom} » a chuté de ${ecart.toFixed(1)} point(s) ` +
          `ces dernières 24 h (${moyRecente.toFixed(1)}/5) par rapport aux ${FENETRE_REFERENCE_J} jours ` +
          `précédents (${moyReference.toFixed(1)}/5). Le Coach IA vous recommande d'investiguer rapidement.`

        // 1. Alerte (bannière Coach IA) — type INTELLIGENTE
        await db.alerte.create({
          data: {
            proId,
            titre,
            message,
            canal: "DASHBOARD",
            type: "INTELLIGENTE",
          },
        })

        // 2. Notification (cloche) — type alerte_coach
        try {
          await db.notification.create({
            data: { userId: pro.userId, type: "alerte_coach", titre, message },
          })
        } catch (e) {
          console.warn("Notification alerte_coach non créée (non bloquant)", e)
        }
      }
    }
  } catch (e) {
    console.warn("detecterAlertesIntelligentes : échec non bloquant", e)
  }
}
