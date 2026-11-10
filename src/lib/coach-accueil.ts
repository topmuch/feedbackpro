// ============================================================
// FeedbackPro - Moteur de l'ACCUEIL du Coach IA (Session 4, §2)
// ------------------------------------------------------------
// Calcule DÉTERMINISTEMENT (à la volée, sans LLM) les 4 sections
// de la page d'accueil du dashboard Pro :
//   1. Rapport du jour      → score du jour + évolutions
//   2. 3 priorités du jour  → { niveau 🔥/⚠️/💡, titre, description
//                              avec données, recommandation, retours liés }
//   3. Points positifs      → employés à valoriser + zones performantes
//   4. Prédictions          → « Si rien n'est fait sur X, vous risquez Y »
//
// Tout est calculé depuis les retours réels de la base : les priorités
// portent les IDs des réclamations concernées, ce qui permet le bouton
// « Marquer traité » (résolution des retours liés) et « Voir détails ».
// ============================================================

import { db } from "@/lib/db"
import { ALL_TAGS, tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"

// ---------- Types publics (contrats consommés par coach-ia-tab.tsx) ----------

export type NiveauPriorite = "critique" | "important" | "suggestion"

export type PrioriteDetaillee = {
  /** 🔥 critique · ⚠️ important · 💡 suggestion */
  niveau: NiveauPriorite
  /** Titre court du problème détecté */
  titre: string
  /** Description avec données concrètes (compteurs, zone, plage horaire) */
  description: string
  /** Recommandation de l'IA (action concrète à faire) */
  recommandation: string
  /** Nom de la zone concernée (facultatif pour les suggestions) */
  zoneNom?: string
  /** IDs des retours (réclamations) concernés — base du « Marquer traité » */
  retourIds: string[]
}

export type AccueilPriorites = {
  scoreDuJour: {
    /** Score /100 du jour (moyenne des notes d'aujourd'hui ×20) */
    score: number
    /** Score /100 des 7 derniers jours (repli d'affichage si pas de retour aujourd'hui) */
    score7j: number
    /** Nombre de retours collectés aujourd'hui */
    retoursAujourdhui: number
    /** Évolution en % du score du jour vs hier (null si incomparable) */
    vsHierPct: number | null
    /** Évolution en % du score des 7 derniers jours vs les 7 précédents */
    vsSemainePct: number | null
  }
  /** 3 priorités structurées (critique → important → suggestion) */
  priorites: PrioriteDetaillee[]
  pointsPositifs: {
    /** Employés salués par les clients sur les 7 derniers jours */
    employes: { nom: string; positifs: number; detail: string }[]
    /** Zones les mieux notées sur les 7 derniers jours (≥ 2 retours) */
    zones: { nom: string; noteMoy: number; total: number }[]
    /** Messages de félicitations prêts à l'emploi */
    messages: string[]
  }
  /** Prédictions de type « Si rien n'est fait sur X, vous risquez Y » */
  predictions: string[]
}

// ---------- Recommandations par motif (mapping déterministe) ----------

/** Recommandation terrain associée à un tag négatif dominant */
function recommandationPourTag(idTag: string, zoneNom: string, heureMediane?: number): string {
  const heure = heureMediane ? ` vers ${heureMediane}h` : ""
  const table: Record<string, string> = {
    sale: `Ajouter un passage nettoyage à ${zoneNom}${heure} dans la checklist journalière`,
    manque_papier: `Prévoir un contrôle des consommables de ${zoneNom} aux heures de pointe`,
    odeur_desagreable: `Vérifier la ventilation et passer un entretien complet de ${zoneNom}`,
    attente: `Renforcer l'équipe ou ouvrir une caisse supplémentaire${heure}`,
    attente_accueil: `Renforcer l'accueil${heure} ou mettre en place un file d'attente claire`,
    service_lent: `Réorganiser le pass en cuisine${heure} pour fluidifier les sorties de plats`,
    plat_tiede: "Contrôler la température des plats à la sortie de cuisine (checklist service)",
    impoli: "Rappeler les standards d'accueil à l'équipe et suivre les prochaines mentions",
    personnel_impoli_repas: "Rappeler les standards d'accueil en salle et suivre les prochaines mentions",
    accueil_froid: "Instaurer un script d'accueil chaleureux et l'observer cette semaine",
    mal_renseigne: "Organiser une fiche produit flash de 10 min en briefing d'équipe",
    bien_renseigne_accueil: "Organiser un point formation de 10 min avant le service",
    distrait: "Rappeler la consigne « clients d'abord » : pas de discussions entre collègues en service",
    personnel_distrait_accueil: "Rappeler la consigne « clients d'abord » au poste d'accueil",
    mal_range: "Inscrire le rangement de la zone dans la checklist de fin de service",
    erreur: "Tracer chaque erreur 48 h pour identifier la cause racine et former dessus",
  }
  return table[idTag] ?? `Ajuster le service de la zone « ${zoneNom} » et surveiller les prochains retours`
}

/** Moyenne d'une liste de notes (0 si vide) */
function moyenne(notes: number[]): number {
  return notes.length ? notes.reduce((s, n) => s + n, 0) / notes.length : 0
}

/** Score /100 à partir d'une note moyenne */
function score(notes: number[]): number {
  const m = moyenne(notes)
  return m > 0 ? Math.round(m * 20) : 0
}

/** Évolution % entre deux notes moyennes (null si la base est vide) */
function evolutionPct(avant: number, maintenant: number): number | null {
  if (avant <= 0 || maintenant <= 0) return null
  return Math.round(((maintenant - avant) / avant) * 100)
}

/** Heure médiane d'une liste d'heures (pour cibler la recommandation) */
function heureMediane(heures: number[]): number | undefined {
  if (!heures.length) return undefined
  const tri = [...heures].sort((a, b) => a - b)
  return tri[Math.floor(tri.length / 2)]
}

// ---------- Calcul principal ----------

/**
 * Calcule les 4 sections de l'accueil Coach IA d'un Pro.
 * Volume maîtrisé : un seul fetch des retours des 14 derniers jours.
 */
export async function calculerAccueil(pro: {
  id: string
  nomEtablissement: string
}): Promise<AccueilPriorites> {
  const now = new Date()

  // ---------- Bornes temporelles ----------
  const debutJour = new Date(now)
  debutJour.setHours(0, 0, 0, 0)
  const debutHier = new Date(debutJour.getTime() - 24 * 3600 * 1000)
  const debut7j = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const debut14j = new Date(now.getTime() - 14 * 24 * 3600 * 1000)
  const debut48h = new Date(now.getTime() - 48 * 3600 * 1000)

  // ---------- Un seul fetch : 14 derniers jours (retours + zone + employé) ----------
  const retours14j = await db.retour.findMany({
    where: { proId: pro.id, createdAt: { gte: debut14j } },
    select: {
      id: true,
      note: true,
      tags: true,
      commentaire: true,
      statut: true,
      createdAt: true,
      zone: { select: { nom: true } },
      employe: { select: { nom: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // ---------- 1) Score du jour + évolutions ----------
  const aujourdhui = retours14j.filter((r) => r.createdAt >= debutJour)
  const hier = retours14j.filter((r) => r.createdAt >= debutHier && r.createdAt < debutJour)
  const notes7j = retours14j.filter((r) => r.createdAt >= debut7j).map((r) => r.note)
  const notes7jAvant = retours14j
    .filter((r) => r.createdAt >= debut14j && r.createdAt < debut7j)
    .map((r) => r.note)

  const scoreJour = score(aujourdhui.map((r) => r.note))
  const score7j = score(notes7j)

  const accueil: AccueilPriorites = {
    scoreDuJour: {
      score: scoreJour || score7j,
      score7j,
      retoursAujourdhui: aujourdhui.length,
      vsHierPct: evolutionPct(moyenne(hier.map((r) => r.note)), moyenne(aujourdhui.map((r) => r.note))),
      vsSemainePct: evolutionPct(moyenne(notes7jAvant), moyenne(notes7j)),
    },
    priorites: [],
    pointsPositifs: { employes: [], zones: [], messages: [] },
    predictions: [],
  }

  // ---------- 2) Priorités structurées ----------
  // Les réclamations déjà RÉSOLUES ne sont pas des priorités : une fois
  // « Marquer traité » actionné, la priorité disparaît au prochain calcul.

  // a) 🔥 CRITIQUE — la zone avec le plus de réclamations ≤ 2★ non résolues sur 48 h
  const reclamations48h = retours14j.filter(
    (r) => r.createdAt >= debut48h && r.note <= 2 && r.statut !== "RESOLVED"
  )
  if (reclamations48h.length > 0) {
    const parZone = new Map<string, typeof reclamations48h>()
    for (const r of reclamations48h) {
      const nom = r.zone?.nom ?? "Non définie"
      parZone.set(nom, [...(parZone.get(nom) ?? []), r])
    }
    const [zoneCritique, retoursZone] = [...parZone.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )[0] ?? [null, []]

    if (zoneCritique && retoursZone.length > 0) {
      // Tag négatif dominant des réclamations critiques
      const compteTags = new Map<string, number>()
      for (const r of retoursZone) {
        for (const t of parseJsonArray(r.tags)) compteTags.set(t, (compteTags.get(t) ?? 0) + 1)
      }
      const tagDominant =
        [...compteTags.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "retour négatif"
      const labelTag = tagLabel(tagDominant)
      // Plage horaire des signalements (ex. « 14h-16h »)
      const heures = retoursZone.map((r) => r.createdAt.getHours())
      const plage =
        heures.length > 1
          ? ` entre ${Math.min(...heures)}h et ${Math.max(...heures) + 1}h`
          : ""
      const nonTraites = retoursZone

      accueil.priorites.push({
        niveau: "critique",
        titre: `${labelTag} — ${zoneCritique}`,
        description: `${nonTraites.length} signalement(s) « ${labelTag} » à « ${zoneCritique} » sur les 48 dernières heures${plage} — encore sans résolution.`,
        recommandation: recommandationPourTag(tagDominant, zoneCritique, heureMediane(heures)),
        zoneNom: zoneCritique,
        retourIds: retoursZone.map((r) => r.id),
      })
    }
  }

  // b) ⚠️ IMPORTANT — tag négatif le plus fréquent sur 7 jours (hors zone critique)
  const retours7j = retours14j.filter((r) => r.createdAt >= debut7j)
  const negatifs7j = retours7j.filter((r) => r.note <= 3 && r.statut !== "RESOLVED")
  const compteTags7j = new Map<string, { count: number; retours: typeof negatifs7j }>()
  for (const r of negatifs7j) {
    for (const t of parseJsonArray(r.tags)) {
      const entree = compteTags7j.get(t) ?? { count: 0, retours: [] }
      entree.count += 1
      entree.retours.push(r)
      compteTags7j.set(t, entree)
    }
  }
  const [tagImportant, donneesImportant] =
    [...compteTags7j.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .find(([tag, d]) => {
        // Exclut le motif déjà couvert par la priorité critique
        if (accueil.priorites[0] && tagDominantDe(accueil.priorites[0]) === tag) return false
        // Exclut les retours déjà couverts par la priorité 1
        const idsPriorite1 = new Set(accueil.priorites[0]?.retourIds ?? [])
        if (d.retours.some((r) => idsPriorite1.has(r.id))) return false
        return true
      }) ?? []

  if (tagImportant && donneesImportant && donneesImportant.count >= 2) {
    const labelTag = tagLabel(tagImportant)
    const zones = [...new Set(donneesImportant.retours.map((r) => r.zone?.nom ?? "Non définie"))]
    const zoneDominante = zones[0] ?? "votre établissement"
    accueil.priorites.push({
      niveau: "important",
      titre: `${labelTag} : motif récurrent de la semaine`,
      description: `${donneesImportant.count} mention(s) sur 7 jours (zones : ${zones.slice(0, 2).join(", ")}) dans des retours ≤ 3★.`,
      recommandation: recommandationPourTag(tagImportant, zoneDominante),
      zoneNom: zoneDominante,
      retourIds: donneesImportant.retours.slice(0, 20).map((r) => r.id),
    })
  }

  // c) 💡 SUGGESTION — valorisation d'un employé étoile, ou relance de collecte
  const positifs7j = retours7j.filter((r) => r.note >= 4)
  const compteEmployesPos = new Map<string, number>()
  for (const r of positifs7j) {
    const nom = r.employe?.nom
    if (nom) compteEmployesPos.set(nom, (compteEmployesPos.get(nom) ?? 0) + 1)
  }
  const topEmploye =
    [...compteEmployesPos.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  if (topEmploye && topEmploye[1] >= 2) {
    accueil.priorites.push({
      niveau: "suggestion",
      titre: `Valoriser ${topEmploye[0]}`,
      description: `${topEmploye[1]} mention(s) positive(s) de clients cette semaine — un exemple à célébrer devant toute l'équipe.`,
      recommandation: `Félicitez ${topEmploye[0]} en briefing aujourd'hui et partagez un de ses retours en exemple.`,
      retourIds: [],
    })
  } else {
    // Pas d'employé à valoriser : suggestion de relance de collecte
    const zones7j = new Set(retours7j.map((r) => r.zone?.nom).filter(Boolean))
    const nbZones = await db.zone.count({ where: { proId: pro.id } })
    const zonesSansRetour = nbZones - zones7j.size
    if (zonesSansRetour > 0 || retours7j.length < 10) {
      accueil.priorites.push({
        niveau: "suggestion",
        titre: "Relancer la collecte de retours",
        description:
          retours7j.length < 10
            ? `Seulement ${retours7j.length} retour(s) cette semaine : le Coach manque de matière pour auditer finement.`
            : `${Math.max(0, zonesSansRetour)} zone(s) n'ont reçu aucun retour cette semaine.`,
        recommandation:
          "Repositionnez les QR codes à hauteur des yeux près des points de contact et annoncez l'objectif à l'équipe.",
        retourIds: [],
      })
    } else {
      // Toutes les zones scannées et pas d'alerte : suggestion d'excellence
      const meilleureZone = [...new Set(retours7j.map((r) => r.zone?.nom).filter((n): n is string => !!n))]
        .map((nom) => ({
          nom,
          notes: retours7j.filter((r) => r.zone?.nom === nom).map((r) => r.note),
        }))
        .sort((a, b) => moyenne(b.notes) - moyenne(a.notes))[0]
      accueil.priorites.push({
        niveau: "suggestion",
        titre: meilleureZone ? `Maintenir l'excellence de « ${meilleureZone.nom} »` : "Maintenir vos standards",
        description: "Aucun irritant majeur cette semaine : profitez-en pour consolider ce qui fonctionne.",
        recommandation: "Notez les pratiques actuelles de la meilleure zone comme standard interne pour les autres.",
        retourIds: [],
      })
    }
  }

  // ---------- 3) Points positifs à valoriser ----------

  // Employés salués (7 j) — top 3
  const employes = [...compteEmployesPos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([nom, positifs]) => {
      const notesEmp = retours7j
        .filter((r) => r.employe?.nom === nom)
        .map((r) => r.note)
      const noteMoy = moyenne(notesEmp)
      return {
        nom,
        positifs,
        detail: `${positifs} mention(s) positive(s) cette semaine · note moyenne ${noteMoy.toFixed(2).replace(".", ",")}/5`,
      }
    })
  accueil.pointsPositifs.employes = employes

  // Zones performantes (7 j, ≥ 2 retours) — top 2
  const zonesMap = new Map<string, number[]>()
  for (const r of retours7j) {
    const nom = r.zone?.nom
    if (!nom) continue
    zonesMap.set(nom, [...(zonesMap.get(nom) ?? []), r.note])
  }
  accueil.pointsPositifs.zones = [...zonesMap.entries()]
    .filter(([, notes]) => notes.length >= 2)
    .map(([nom, notes]) => ({ nom, noteMoy: Number(moyenne(notes).toFixed(2)), total: notes.length }))
    .sort((a, b) => b.noteMoy - a.noteMoy)
    .slice(0, 2)

  // Messages de félicitations prêts à l'emploi
  const messages: string[] = []
  if (employes[0]) {
    messages.push(
      `Bravo à ${employes[0].nom} : ${employes[0].positifs} client(s) ont salué son travail cette semaine 👏`
    )
  }
  if (accueil.pointsPositifs.zones[0]) {
    const z = accueil.pointsPositifs.zones[0]
    messages.push(
      `La zone « ${z.nom} » affiche ${z.noteMoy.toFixed(2).replace(".", ",")}/5 sur ${z.total} retours — bravo à l'équipe en place 🌟`
    )
  }
  if (accueil.scoreDuJour.vsSemainePct != null && accueil.scoreDuJour.vsSemainePct > 0) {
    messages.push(
      `Votre satisfaction progresse de +${accueil.scoreDuJour.vsSemainePct} % vs la semaine précédente : les actions prises portent leurs fruits 💙`
    )
  }
  accueil.pointsPositifs.messages = messages

  // ---------- 4) Prédictions (« Si rien n'est fait sur X, vous risquez Y ») ----------
  const tagLePlusFrequent =
    [...compteTags7j.entries()].sort((a, b) => b[1].count - a[1].count)[0] ?? null

  if (tagLePlusFrequent && tagLePlusFrequent[1].count >= 2) {
    const labelTag = tagLabel(tagLePlusFrequent[0])
    const zoneDominante =
      [...new Set(tagLePlusFrequent[1].retours.map((r) => r.zone?.nom ?? ""))].filter(Boolean)[0] ??
      "votre établissement"
    accueil.predictions.push(
      `Si rien n'est fait sur « ${labelTag} » à ${zoneDominante}, vous risquez de perdre environ ${Math.min(
        30,
        5 * tagLePlusFrequent[1].count
      )} % de satisfaction sur cette zone cette semaine.`
    )
  }
  const zoneFragile = [...zonesMap.entries()]
    .filter(([, notes]) => notes.length >= 2)
    .map(([nom, notes]) => ({ nom, moy: moyenne(notes) }))
    .sort((a, b) => a.moy - b.moy)[0]
  if (zoneFragile && zoneFragile.moy < 3.5) {
    accueil.predictions.push(
      `Sans plan d'action sur « ${zoneFragile.nom} » (moyenne ${zoneFragile.moy.toFixed(2).replace(".", ",")}/5), vous risquez de voir votre score global passer sous ${Math.max(0, Math.round(zoneFragile.moy * 20) - 5)}/100 cette semaine.`
    )
  }
  if (score7j > 0 && score7j < 70) {
    accueil.predictions.push(
      `Avec un score actuel de ${score7j}/100, chaque semaine sans action sur vos priorités coûte en moyenne 2 à 3 points de satisfaction client.`
    )
  }
  if (accueil.predictions.length === 0 && score7j >= 70) {
    accueil.predictions.push(
      `En tenant vos standards actuels et en traitant vos priorités, votre score peut viser ${Math.min(100, score7j + 5)}/100 cette semaine.`
    )
  }

  return accueil
}

/** Récupère l'identifiant de tag placé au début d'un titre de priorité (héuristique) */
function tagDominantDe(priorite: PrioriteDetaillee): string | null {
  // Le titre est « {labelTag} — {zone} » : on retrouve l'id par le libellé complet
  const label = priorite.titre.split(" — ")[0]?.trim()
  if (!label) return null
  const trouve = ALL_TAGS.find((t) => `${t.emoji} ${t.label}` === label)
  return trouve?.id ?? null
}
