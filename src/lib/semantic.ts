// ============================================================
// FeedbackPro - Analyse sémantique des commentaires (Session 5 §5)
// ------------------------------------------------------------
// Objectif : détecter les THÈMES CACHÉS dans les commentaires libres
// même quand aucun tag n'a été sélectionné. Exemple du cahier des
// charges : 10 commentaires contenant « froid » ou « tiède » doivent
// faire émerger le thème « Température des plats ».
//
// Implémentation (sans dépendance externe) :
// 1. Normalisation FR (minuscules + suppression des accents)
// 2. Détection de thèmes via lexiques métier (8 thèmes typiques
//    de la restauration / du commerce de proximité)
// 3. Mots-clés récurrents (top tokens hors mots vides FR)
// 4. Regroupement des commentaires similaires : clustering glouton
//    par similarité de Jaccard sur les ensembles de mots — l'équivalent
//    local d'un regroupement par embeddings, adapté au volume de
//    retours d'un établissement (quelques dizaines par semaine).
//
// 100 % déterministe et testable : aucun appel réseau, aucune clé API.
// Les thèmes détectés sont aussi injectés dans les données transmises
// au Coach IA (src/lib/ia.ts) pour enrichir les rapports LLM.
// ============================================================

// ---------- Types publics ----------

/** Un thème caché détecté dans les commentaires */
export type ThemeDetecte = {
  /** Nom lisible du thème (ex: « Température des plats ») */
  nom: string
  /** Emoji du thème (affichage dashboard) */
  emoji: string
  /** Nombre de commentaires rattachés au thème */
  occurrences: number
  /** Note moyenne (1-5) des commentaires du thème : < 3 = irritant, >= 4 = satisfaction */
  noteMoyenne: number
  /** Mots du lexique réellement trouvés, avec leur fréquence */
  motsDetectes: { mot: string; count: number }[]
  /** Jusqu'à 3 exemples de commentaires du thème */
  exemples: { commentaire: string; note: number; zoneNom?: string }[]
}

/** Un mot-clé récurrent (hors mots vides) */
export type MotCle = { mot: string; count: number }

/** Un groupe de commentaires similaires (clustering Jaccard) */
export type GroupeSimilaire = {
  /** Nombre de commentaires dans le groupe */
  taille: number
  /** Commentaire représentatif (le plus long du groupe) */
  exemple: string
  /** Note moyenne du groupe */
  noteMoyenne: number
  /** Notes du groupe (ex: [1, 1, 2]) */
  notes: number[]
}

/** Résultat complet de l'analyse sémantique d'un lot de retours */
export type AnalyseSemantique = {
  /** Thèmes cachés détectés, triés par occurrences décroissantes */
  themes: ThemeDetecte[]
  /** Mots-clés récurrents, triés par fréquence décroissante (top 10) */
  motsCles: MotCle[]
  /** Groupes de commentaires similaires (>= 2 commentaires), max 5 */
  groupes: GroupeSimilaire[]
  /** Nombre de commentaires réellement analysés */
  commentairesAnalyses: number
}

/** Entrée minimale : un commentaire + sa note + sa zone */
export type EntreeCommentaire = {
  commentaire: string
  note: number
  zoneNom?: string
}

// ---------- Lexiques de thèmes (FR, mots normalisés sans accents) ----------

/**
 * Chaque thème = liste de mots-clés (déjà normalisés : minuscules, sans
 * accents). Un commentaire est rattaché au thème dès qu'il contient au
 * moins un mot du lexique.
 */
const LEXIQUES_THEMES: { nom: string; emoji: string; mots: string[] }[] = [
  {
    nom: "Température des plats",
    emoji: "🌡️",
    mots: [
      "froid", "froide", "froids", "froides", "tiede", "tiedes", "refroidi",
      "refroidie", "glace", "glacee", "rechauffe", "caille", "micro ondes",
    ],
  },
  {
    nom: "Temps d'attente",
    emoji: "⏳",
    mots: [
      "attente", "attendre", "attendu", "attendue", "lent", "lente", "lents",
      "lentes", "long", "longue", "longs", "longues", "file", "20", "30",
      "45", "retard",
    ],
  },
  {
    nom: "Propreté",
    emoji: "🧹",
    mots: [
      "sale", "sales", "salete", "malpropre", "poussiere", "dechet", "dechets",
      "odeur", "odeurs", "poubelle", "crasse", "toilette", "toilettes", "wc",
      "propre", "nettoye", "hygiene", "impeccable",
    ],
  },
  {
    nom: "Accueil & service",
    emoji: "🙋",
    mots: [
      "impoli", "impolie", "impolis", "desagreable", "desagreables", "antipathique",
      "grognon", "aimable", "sourire", "souriant", "souriante", "sympa", "sympathique",
      "accueillant", "accueillante", "poli", "polie", "courtois", "serviable",
      "inamical", "desinteresse",
    ],
  },
  {
    nom: "Qualité des plats",
    emoji: "🍽️",
    mots: [
      "insipide", "fade", "fades", "sec", "seche", "secs", "seches", "cru",
      "crue", "cuit", "delicieux", "delicieuse", "excellent", "excelente",
      "mauvais", "mauvaise", "mediocre", "gout", "saveur", "portion",
      "portions", "caoutchouteux", "gras", "bourratif",
    ],
  },
  {
    nom: "Erreurs de commande",
    emoji: "📝",
    mots: [
      "erreur", "erreurs", "trompe", "trompee", "oublie", "oubliee", "oublis",
      "manquant", "manquante", "inverse", "inversee", "absent", "absente",
    ],
  },
  {
    nom: "Rapport qualité-prix",
    emoji: "💶",
    mots: ["cher", "chere", "chers", "cheres", "prix", "arnaque", "excessif", "excessive", "exorbitant", "addition"],
  },
  {
    nom: "Ambiance & bruit",
    emoji: "🔊",
    mots: ["bruyant", "bruyante", "bruit", "calme", "musique", "vacarme", "fort", "forte"],
  },
]

// ---------- Mots vides FR (exclus des mots-clés récurrents) ----------

const MOTS_VIDES = new Set([
  "ai", "a", "as", "at", "aucun", "aussi", "autre", "autres", "aux", "avec", "bon", "bien",
  "car", "ce", "cela", "ces", "cet", "cette", "chaque", "comme", "comment", "dans", "de",
  "depuis", "des", "deux", "donc", "dont", "du", "elle", "elles", "en", "encore", "est",
  "et", "etaient", "etait", "ete", "etant", "eux", "faire", "fait", "faut", "hors", "ici",
  "il", "ils", "j", "jai", "je", "l", "la", "le", "les", "leur", "leurs", "lors", "lui",
  "ma", "mais", "me", "meme", "mes", "moi", "mon", "n", "ne", "ni", "nos", "notre", "nous",
  "on", "ont", "ou", "par", "pas", "pendant", "peu", "plus", "pour", "pourquoi", "qu",
  "quand", "que", "quel", "quelle", "quelles", "quels", "qui", "quoi", "s", "sa", "sans",
  "se", "ses", "son", "sont", "sous", "sur", "t", "ta", "tandis", "tant", "te", "tes",
  "toi", "ton", "tous", "tout", "toute", "toutes", "tres", "trop", "tu", "un", "une",
  "vais", "va", "vont", "vos", "votre", "vous", "y", "etait", "apres", "avant", "chez",
  "rien", "trop", "vraiment", "quil", "quils", "cest", "ny", "detre", "jai", "lavais",
])

// ---------- Normalisation ----------

/**
 * Normalise un texte FR : minuscules + suppression des accents.
 * « À la carte » → « a la carte » ; « Tiède » → « tiede ».
 */
export function normaliserTexte(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, " ")
}

/** Découpe un texte normalisé en tokens alphabétiques (>= 2 lettres) */
function tokenizer(texte: string): string[] {
  return normaliserTexte(texte)
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2)
}

// ---------- Détection de thèmes ----------

/**
 * Rattache chaque commentaire aux thèmes dont le lexique matche.
 * Un commentaire peut appartenir à plusieurs thèmes (ex: « pizza froide
 * et serveur impoli » → Température + Accueil).
 */
function detecterThemes(commentaires: EntreeCommentaire[]): ThemeDetecte[] {
  // état par thème : occurrences, notes, mots trouvés, exemples
  const etat = new Map<
    string,
    { theme: (typeof LEXIQUES_THEMES)[number]; notes: number[]; mots: Map<string, number>; exemples: { commentaire: string; note: number; zoneNom?: string }[] }
  >()

  for (const c of commentaires) {
    if (!c.commentaire?.trim()) continue
    const tokens = tokenizer(c.commentaire)
    const ensemble = new Set(tokens)

    for (const theme of LEXIQUES_THEMES) {
      const motsTrouves = theme.mots.filter((m) =>
        // les lexiques sont mono-mot (normalisés) : match exact sur le token
        m.includes(" ") ? normaliserTexte(c.commentaire).includes(m) : ensemble.has(m)
      )
      if (motsTrouves.length === 0) continue

      const e =
        etat.get(theme.nom) ?? { theme, notes: [], mots: new Map<string, number>(), exemples: [] }
      e.notes.push(c.note)
      for (const m of motsTrouves) e.mots.set(m, (e.mots.get(m) ?? 0) + 1)
      if (e.exemples.length < 3) {
        e.exemples.push({ commentaire: c.commentaire.slice(0, 160), note: c.note, zoneNom: c.zoneNom })
      }
      etat.set(theme.nom, e)
    }
  }

  return [...etat.values()]
    .map((e) => ({
      nom: e.theme.nom,
      emoji: e.theme.emoji,
      occurrences: e.notes.length,
      noteMoyenne: e.notes.length ? Number((e.notes.reduce((s, n) => s + n, 0) / e.notes.length).toFixed(2)) : 0,
      motsDetectes: [...e.mots.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([mot, count]) => ({ mot, count })),
      exemples: e.exemples,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
}

// ---------- Mots-clés récurrents ----------

/** Top tokens hors mots vides (les plus répétés dans les commentaires) */
function motsClesRecuvents(commentaires: EntreeCommentaire[], max = 10): MotCle[] {
  const compteur = new Map<string, number>()
  for (const c of commentaires) {
    if (!c.commentaire?.trim()) continue
    for (const token of tokenizer(c.commentaire)) {
      if (token.length < 3 || MOTS_VIDES.has(token)) continue
      compteur.set(token, (compteur.get(token) ?? 0) + 1)
    }
  }
  return [...compteur.entries()]
    .filter(([, count]) => count >= 2) // au moins 2 apparitions = récurrent
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([mot, count]) => ({ mot, count }))
}

// ---------- Regroupement des commentaires similaires ----------

/** Similarité de Jaccard entre deux ensembles de tokens (0 → 1) */
function similariteJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection += 1
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Clustering glouton : chaque commentaire rejoint le premier groupe dont
 * le représentant lui est suffisamment similaire (Jaccard >= seuil),
 * sinon ouvre un nouveau groupe. O(n²) mais n = quelques dizaines.
 */
function regrouperSimilaires(commentaires: EntreeCommentaire[], seuil = 0.4): GroupeSimilaire[] {
  type Cluster = { representant: Set<string>; exemple: string; notes: number[]; membres: EntreeCommentaire[] }
  const clusters: Cluster[] = []

  for (const c of commentaires) {
    const texte = c.commentaire?.trim()
    if (!texte) continue
    const tokens = new Set(tokenizer(texte))

    let place = false
    for (const cl of clusters) {
      if (similariteJaccard(tokens, cl.representant) >= seuil) {
        cl.notes.push(c.note)
        cl.membres.push(c)
        place = true
        break
      }
    }
    if (!place) {
      clusters.push({ representant: tokens, exemple: texte, notes: [c.note], membres: [c] })
    }
  }

  return clusters
    .filter((cl) => cl.membres.length >= 2)
    .sort((a, b) => b.membres.length - a.membres.length)
    .slice(0, 5)
    .map((cl) => {
      // représentatif = le membre le plus long (le plus informatif)
      const exemple = [...cl.membres].sort((a, b) => b.commentaire.length - a.commentaire.length)[0]
      return {
        taille: cl.membres.length,
        exemple: exemple.commentaire.slice(0, 200),
        noteMoyenne: Number((cl.notes.reduce((s, n) => s + n, 0) / cl.notes.length).toFixed(2)),
        notes: cl.notes,
      }
    })
}

// ---------- API principale ----------

/**
 * Analyse sémantique complète d'un lot de retours :
 * thèmes cachés + mots-clés récurrents + commentaires similaires.
 * Jamais d'exception : un lot vide renvoie une structure vide.
 */
export function analyserSemantique(retours: EntreeCommentaire[]): AnalyseSemantique {
  const avecCommentaire = retours.filter((r) => r.commentaire && r.commentaire.trim().length >= 3)
  if (avecCommentaire.length === 0) {
    return { themes: [], motsCles: [], groupes: [], commentairesAnalyses: 0 }
  }
  return {
    themes: detecterThemes(avecCommentaire),
    motsCles: motsClesRecuvents(avecCommentaire),
    groupes: regrouperSimilaires(avecCommentaire),
    commentairesAnalyses: avecCommentaire.length,
  }
}
