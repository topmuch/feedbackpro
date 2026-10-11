// ============================================================
// FeedbackPro - Le Coach IA (cœur du produit, pivot Session 1)
// ------------------------------------------------------------
// Chaque jour (ou semaine), agrège les retours des Clients Mystères
// et génère un rapport d'audit qualité : score global /100, rapport
// markdown FR, 3 priorités du jour, recommandations et prédictions.
//
// - LLM : z-ai-web-dev-sdk (BACKEND UNIQUEMENT)
// - Parsing robuste : le JSON est extrait même s'il est enveloppé
//   dans des blocs ```json … ```
// - FALLBACK DÉTERMINISTE : en cas d'échec LLM (réseau, JSON invalide,
//   timeout…), un rapport calculé depuis les statistiques est produit.
//   Cette fonction ne lève JAMAIS d'exception vers la route appelante.
// ============================================================

import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { tagLabel } from "@/lib/constants"
import { sendEmail, emailRapportIA } from "@/lib/email"
import type { Pro, RapportIA } from "@prisma/client"

/** Consigne système du Coach IA (FR strict, sortie JSON uniquement) */
export const SYSTEM_PROMPT_FR =
  "Tu es le Coach IA de FeedbackPro, expert en management de la qualité de service en établissement " +
  "(restaurants, hôtels, salons, boutiques…). Tu analyses les retours anonymes de « Clients Mystères » " +
  "(note 1-5, tags, commentaires) collectés par zone (Accueil, Salle, Toilettes…) et tu rédiges un audit " +
  "actionnable pour le gérant. Ton ton est direct, bienveillant et concret, comme un coach de terrain. " +
  'Réponds UNIQUEMENT avec un JSON valide : {"scoreGlobal": <0-100>, "contenuMarkdown": "<rapport markdown FR avec sections Points forts / Points de vigilance / Analyse>", "priorites": [3 actions précises], "recommandations": [2-4 strings], "predictions": [1-3 strings]}'

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

// ---------- Agrégation des données d'une période ----------

/**
 * Agrège les retours d'un Pro sur une période : notes, zones, tags,
 * heures de pointe et employés cités. C'est la matière première du Coach IA.
 */
export async function agregerDonnees(
  pro: Pick<Pro, "id" | "nomEtablissement" | "typeEtablissement">,
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

  const lignes: string[] = []
  lignes.push(`# 📋 Rapport d'audit qualité — ${d.nomEtablissement}`)
  lignes.push("")
  lignes.push(`**Score global : ${scoreGlobal}/100** (période du ${d.periode}, ${d.totalRetours} retour(s) de Clients Mystères)`)
  lignes.push("")
  lignes.push(`Répartition des notes : ${d.totalRetours > 0 ? repartitionTxt : "aucun retour sur la période"}`)
  lignes.push("")
  lignes.push("## Points forts")
  for (const p of pointsForts) lignes.push(`- ${p}`)
  lignes.push("")
  lignes.push("## Points de vigilance")
  if (pointsVigilance.length === 0) {
    lignes.push("- Aucun point de vigilance majeur détecté sur la période 👏")
  } else {
    for (const p of pointsVigilance) lignes.push(`- ${p}`)
  }
  lignes.push("")
  lignes.push("## Analyse")
  if (d.totalRetours === 0) {
    lignes.push(
      "Aucun retour collecté sur la période. Rendez vos QR codes plus visibles à l'entrée, en salle et aux toilettes : chaque zone scannée est une zone auditée."
    )
  } else if (d.heuresPics.length > 0) {
    lignes.push(
      `L'activité de vos retours se concentre autour de ${d.heuresPics.join(", ")} : faites coïncider vos renforts avec ces créneaux. ` +
        (d.topTagsNegatifs.length > 0
          ? `Le motif « ${d.topTagsNegatifs[0].tag} » revient le plus souvent dans les retours négatifs — c'est votre levier d'amélioration n°1.`
          : "Peu de réclamations : maintenez vos standards actuels.")
    )
  } else {
    lignes.push(
      d.topTagsNegatifs.length > 0
        ? `Le motif « ${d.topTagsNegatifs[0].tag} » revient le plus souvent dans les retours négatifs — c'est votre levier d'amélioration n°1.`
        : "Vos Clients Mystères sont globalement satisfaits : maintenez vos standards actuels."
    )
  }
  const cites = d.employesCites.filter((e) => e.negatifs >= 2)
  if (cites.length > 0) {
    lignes.push("")
    lignes.push(`Personnel à accompagner : ${cites.map((e) => `${e.nom} (${e.negatifs} retour(s) négatif(s))`).join(", ")}.`)
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
  const priorites = d.topTagsNegatifs
    .slice(0, 3)
    .map((t, i) => `${verbeParTag[t.tag] ?? "Traiter"} : ${t.tag} (${t.count} mention(s) sur la période)`)
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
