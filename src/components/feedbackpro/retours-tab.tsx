"use client"

// ============================================================
// FeedbackPro - Onglet "Retours clients" du dashboard Pro (pivot Zones)
// Refonte "Inbox Intelligente" (liste) + "Dashboard d'Urgence" (détail)
// Liste : cards intelligentes, filtres pills, résumé IA Coach, regroupement
// Détail : en-tête sticky, layout 3 colonnes, recommandation IA dégradée
// Toute la logique métier (majRetour, envoyerReponse, genererRecommandationIA,
// statsEmploye, etc.) est conservée à l'identique.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  MailOpen,
  MessageSquareReply,
  RefreshCw,
  Loader2,
  Eye,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  X,
  Inbox,
  ArrowLeft,
  Send,
  Bot,
  Lightbulb,
  AlertTriangle,
  Smartphone,
  TrendingUp,
  Sparkles,
  User,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  Camera,
  Flame,
  Layers,
  Target,
  ArrowRight,
  CheckCheck,
  Trash2,
  ZoomIn,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { Stars, formatDate, formatRelative } from "@/components/feedbackpro/shared"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { exportToCsv } from "@/lib/export-csv"
import { ALL_TAGS, NEGATIVE_TAGS_ETENDUS, POSITIVE_TAGS_ETENDUS, STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"
import { useAppStore } from "@/store/app-store"

type StatutRetour = "NEW" | "IN_PROGRESS" | "RESOLVED"

// Retour renvoyé par GET/PATCH /api/pro/retours (pivot Zones)
type Retour = {
  id: string
  note: number
  tags: string[]
  commentaire: string | null
  personnelMentionne: string | null
  emailClient: string | null
  canalChoisi: string | null
  statut: StatutRetour
  historique: { statut: string; at: string }[]
  lu: boolean
  reponsePro: string | null
  actionPrise: string | null
  createdAt: string
  zone: { nom: string } | null
  employe: { nom: string } | null
  // D1 : NPS (0-10), null si non renseigné (note < 4)
  nps?: number | null
  // D2 : photo jointe (URL relative /uploads/…), null si aucune
  photoUrl?: string | null
}

type ZoneFiltre = { id: string; nom: string }

// Employé du filtre (GET /api/pro/employes → { employes: [{ id, nom, poste, actif, … }] })
type EmployeFiltre = { id: string; nom: string; poste?: string | null; actif?: boolean }

const PAGE_SIZE = 50

// ---------- IA côté client (Recommandations, récurrence, templates) ----------

// Jeu de tags positifs/négatifs en Set pour lookup O(1)
const SET_POSITIFS = new Set(POSITIVE_TAGS_ETENDUS.map((t) => t.id))
const SET_NEGATIFS = new Set(NEGATIVE_TAGS_ETENDUS.map((t) => t.id))

/** Renvoie les tags négatifs du retour (parmi le catalogue étendu). */
function tagsNegatifsDe(r: Retour): string[] {
  return r.tags.filter((t) => SET_NEGATIFS.has(t))
}

/** Renvoie les tags positifs du retour (parmi le catalogue étendu). */
function tagsPositifsDe(r: Retour): string[] {
  return r.tags.filter((t) => SET_POSITIFS.has(t))
}

/** "il y a 30 jours" comme timestamp (utilisé pour filtrer les récurrences). */
function ilYA30Jours(): number {
  return Date.now() - 30 * 24 * 60 * 60 * 1000
}

/**
 * Catégorise un tag négatif en « problème IA » (problème détecté).
 * Permet d'identifier le thème principal du retour et de proposer
 * des actions concrètes adaptées.
 */
type CategorieIA =
  | "Accueil"
  | "Rapidité"
  | "Compétence"
  | "Qualité"
  | "Attention"
  | "Propreté"
  | "Positif"

const CATEGORIE_PAR_TAG: Record<string, CategorieIA> = {
  // Négatifs
  impoli: "Accueil",
  personnel_impoli_repas: "Accueil",
  accueil_froid: "Accueil",
  attente: "Rapidité",
  service_lent: "Rapidité",
  attente_accueil: "Rapidité",
  mal_renseigne: "Compétence",
  distrait: "Attention",
  personnel_distrait_accueil: "Attention",
  erreur: "Qualité",
  plat_tiede: "Qualité",
  mal_range: "Propreté",
  sale: "Propreté",
  manque_papier: "Propreté",
  odeur_desagreable: "Propreté",
  // Positifs
  accueillant: "Positif",
  serveur_accueillant: "Positif",
  accueil_chaleureux: "Positif",
  rapide: "Positif",
  service_rapide_repas: "Positif",
  prise_en_charge_rapide: "Positif",
  competent: "Positif",
  bien_renseigne_accueil: "Positif",
  pro: "Positif",
  plat_excellent: "Positif",
  propre: "Positif",
  bien_approvisionne: "Positif",
  odeur_agreable: "Positif",
}

/** Map un tag vers sa catégorie IA, fallback "Qualité" si inconnu. */
function categorieTag(t: string): CategorieIA {
  return CATEGORIE_PAR_TAG[t] ?? "Qualité"
}

/** Détermine la catégorie IA dominante du retour (sur les tags négatifs). */
function categorieDominante(r: Retour): CategorieIA {
  const neg = tagsNegatifsDe(r)
  if (neg.length === 0) return "Positif"
  // Vote majoritaire sur les tags négatifs
  const votes = new Map<CategorieIA, number>()
  for (const t of neg) {
    const c = categorieTag(t)
    votes.set(c, (votes.get(c) ?? 0) + 1)
  }
  let best: CategorieIA = "Qualité"
  let bestN = -1
  for (const [c, n] of votes) {
    if (n > bestN) {
      best = c
      bestN = n
    }
  }
  return best
}

const LIBELLE_PROBLEME: Record<CategorieIA, string> = {
  Accueil: "Accueil / politesse de l'équipe",
  Rapidité: "Rapidité du service",
  Compétence: "Compétence de l'équipe sur les produits",
  Qualité: "Qualité produit / service",
  Attention: "Attention portée au client",
  Propreté: "Propreté / entretien du lieu",
  Positif: "Bonne expérience signalée",
}

/**
 * Compte les retours des 30 derniers jours partageant au moins un tag
 * avec le retour courant. Renvoie { count, tagFrequent, libelleTag }.
 * On utilise `items` (toutes les retours déjà chargés dans le tableau).
 */
function compterRecurrence(
  retour: Retour,
  tous: Retour[]
): { count: number; tagFrequent: string | null; libelleTag: string | null } {
  if (retour.tags.length === 0) return { count: 0, tagFrequent: null, libelleTag: null }
  const seuil = ilYA30Jours()
  const memesTags = new Set(retour.tags)
  // Compter les occurrences de chaque tag sur 30 j
  const occ = new Map<string, number>()
  let count = 0
  for (const r of tous) {
    if (r.id === retour.id) continue
    const t = new Date(r.createdAt).getTime()
    if (t < seuil) continue
    const partage = r.tags.some((tag) => memesTags.has(tag))
    if (!partage) continue
    count++
    for (const tag of r.tags) {
      if (memesTags.has(tag)) occ.set(tag, (occ.get(tag) ?? 0) + 1)
    }
  }
  // Le retour courant compte aussi (1er signalement)
  count += 1
  // Tag le plus fréquent (pour l'affichage "Xème signalement 'Y'")
  let tagFrequent: string | null = null
  let maxOcc = -1
  for (const [tag, n] of occ) {
    if (n > maxOcc) {
      maxOcc = n
      tagFrequent = tag
    }
  }
  return {
    count,
    tagFrequent,
    libelleTag: tagFrequent ? tagLabel(tagFrequent) : null,
  }
}

/** Libellé ordinal en français : 1 → "1er", 2 → "2ème", 4 → "4ème". */
function ordinalFr(n: number): string {
  return n === 1 ? "1er" : `${n}ème`
}

/**
 * Génère 3 actions concrètes selon la catégorie IA dominante.
 * Les actions sont des phrases courtes et applicables immédiatement.
 */
function genererActions(c: CategorieIA): string[] {
  switch (c) {
    case "Accueil":
      return [
        "Organiser un rappel des standards d'accueil (sourire, formules de politesse) avec l'équipe concernée.",
        "Mettre en place un mot d'accueil standardisé affiché en back-office.",
        "Programmer un shadowing de 30 min avec un collaborateur référence.",
      ]
    case "Rapidité":
      return [
        "Auditer le flux de service aux heures de pointe et identifier le goulot.",
        "Revoir le planning pour renforcer l'effectif sur les créneaux critiques.",
        "Mettre en place un objectif de temps de prise en charge (ex : ≤ 2 min).",
      ]
    case "Compétence":
      return [
        "Programmer une formation produit ciblée (1h, en interne) cette semaine.",
        "Créer une fiche mémo produit accessible en back-office.",
        "Tester la connaissance produit de l'équipe lors de la prochaine réunion.",
      ]
    case "Attention":
      return [
        "Rappeler l'interdiction des discussions personnelles en présence de clients.",
        "Mettre en place un briefing de 5 min en début de service sur l'attention client.",
        "Désigner un référent « tour de salle » par créneau.",
      ]
    case "Propreté":
      return [
        "Mettre en place un check-list de propreté horaire (cocher toutes les heures).",
        "Renforcer la fréquence de passage nettoyage sur la zone concernée.",
        "Auditer le stock de produits d'entretien et réapprovisionner si besoin.",
      ]
    case "Qualité":
      return [
        "Vérifier la chaîne de production / livraison du produit incriminé.",
        "Mettre en place un contrôle qualité avant remise au client.",
        "Documenter le problème dans un journal des incidents qualité.",
      ]
    case "Positif":
      return [
        "Féliciter publiquement l'équipe concernée lors du prochain briefing.",
        "Identifier ce qui a bien fonctionné et le formaliser en bonne pratique.",
        "Demander au client s'il accepterait de laisser un avis Google.",
      ]
  }
}

/** Estime l'impact attendu selon la catégorie (texte affiché). */
function impactEstime(c: CategorieIA): string {
  if (c === "Positif") return "+30% de chances que le client revienne et recommande l'établissement."
  return "-60% de plaintes similaires sous 2 semaines si les actions sont mises en œuvre."
}

// Niveau IA déterminé par la NOTE du retour (prioritaire sur la catégorie) :
// - "crise"    : note ≤ 2 → recommandations d'urgence (briefing, formation, compensation)
// - "mitige"   : note = 3 → identification des points de friction + ajustements
// - "positif"  : note ≥ 4 → félicitations, formalisation, demande d'avis Google
type NiveauIA = "crise" | "mitige" | "positif"

type RecommandationIA = {
  categorie: CategorieIA
  niveau: NiveauIA
  probleme: string
  contexte: string
  recurrence: { count: number; tagFrequent: string | null; libelleTag: string | null }
  actions: string[]
  impact: string
}

/**
 * Détermine le niveau IA (crise / mitigé / positif) selon la note du retour.
 * Cette fonction est le cœur de la correction du bug « recommandations inversées » :
 * c'est la NOTE qui pilote le ton et le type d'actions, pas uniquement les tags.
 */
function niveauDeNote(note: number): NiveauIA {
  if (note <= 2) return "crise"
  if (note === 3) return "mitige"
  return "positif"
}

// Config visuelle du Coach IA selon le niveau (dégradé de fond + libellé).
// - Crise   : rouge bordeaux (urgence maximale)
// - Mitigé  : ambre/orange (alerte modérée)
// - Positif : vert (succès)
const NIVEAU_IA_CONFIG: Record<
  NiveauIA,
  { label: string; emoji: string; gradient: string; badgeBg: string }
> = {
  crise: {
    label: "Urgent / Crise",
    emoji: "🚨",
    gradient: "from-[#720032] to-[#5a0026]",
    badgeBg: "bg-white/25",
  },
  mitige: {
    label: "Mitigé",
    emoji: "⚠️",
    gradient: "from-amber-500 to-orange-600",
    badgeBg: "bg-white/25",
  },
  positif: {
    label: "Positif",
    emoji: "✅",
    gradient: "from-[#0da14b] to-[#0a8f3f]",
    badgeBg: "bg-white/25",
  },
}

/**
 * Construit la recommandation IA d'un retour à partir des données chargées.
 * Pure : aucun effet de bord, aucun appel réseau.
 *
 * CORRECTION DU BUG IA : Les recommandations sont désormais adaptées à la NOTE
 * du retour (et non plus uniquement à la catégorie de tags). Un retour à 1-2★
 * ne produira plus jamais de recommandations positives (« Féliciter l'équipe »,
 * « Demander un avis Google ») — voir `niveauDeNote`.
 *
 * - 1-2★ (Crise)   : briefing équipe, formation, contact client (compensation)
 * - 3★   (Mitigé)  : identification point de friction, ajustement processus, suivi
 * - 4-5★ (Positif) : félicitations, formalisation bonne pratique, avis Google
 */
function genererRecommandationIA(retour: Retour, tous: Retour[]): RecommandationIA {
  const categorie = categorieDominante(retour)
  const recurrence = compterRecurrence(retour, tous)
  const niveau = niveauDeNote(retour.note)
  const zoneNom = retour.zone?.nom ?? "zone non précisée"
  const libelleTag = recurrence.libelleTag

  // Phrase de récurrence réutilisée dans le diagnostic
  const phraseRecurrence =
    recurrence.count >= 2 && libelleTag
      ? `${ordinalFr(recurrence.count)} signalement « ${libelleTag} » ces 30 derniers jours.`
      : retour.note <= 2
        ? "Premier signalement de ce type — réagir vite pour éviter la récurrence."
        : "Retour isolé — surveiller l'évolution sur les prochains jours."

  // Libellés du problème / point fort principal (1er tag négatif / positif)
  const premierNeg = tagsNegatifsDe(retour).map(tagLabel)[0] ?? null
  const premierPos = tagsPositifsDe(retour).map(tagLabel)[0] ?? null
  const libelleCategorie = LIBELLE_PROBLEME[categorie]

  // Libellé court de la formation (sans « Formation » / « Atelier » / parenthèses)
  const formationCourte = (() => {
    const f = formationPourCategorie(categorie)
    if (!f) return "ciblée"
    return f
      .replace(/^(Formation|Atelier)\s*«?\s*/i, "")
      .replace(/»?\s*$/, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim()
      .toLowerCase()
  })()

  let contexte: string
  let actions: string[]
  let impact: string

  // Sujet de l'action corrective : on utilise le libellé de la catégorie IA
  // lorsqu'elle est pertinente (catégorie négative identifiée via les tags).
  // Si la catégorie est "Positif" (aucun tag négatif — ex : retour 2/5 sans
  // tag), on retombe sur un libellé générique pour éviter l'absurdité
  // « Briefing équipe demain sur bonne expérience signalée ».
  const sujetAction =
    categorie !== "Positif"
      ? libelleCategorie.toLowerCase()
      : "le problème signalé par le client"

  if (niveau === "crise") {
    const problemeTxt = premierNeg ?? sujetAction
    contexte = `🚨 Client mécontent (${retour.note}/5) — ${zoneNom}. ${phraseRecurrence} Risque d'avis négatif public si non traité.`
    actions = [
      `Briefing équipe demain sur ${sujetAction} (point signalé : « ${problemeTxt.toLowerCase()} »).`,
      `Formation ${formationCourte} pour l'équipe concernée.`,
      "Contacter le client pour résoudre la situation (compensation si nécessaire).",
    ]
    impact =
      "Prévention d'un avis négatif public et -60% de plaintes similaires sous 2 semaines."
  } else if (niveau === "mitige") {
    const problemeTxt = premierNeg ?? "le point de friction identifié"
    contexte = `⚠️ Expérience mitigée (${retour.note}/5) — ${zoneNom}. ${phraseRecurrence} Point de friction identifié : « ${problemeTxt.toLowerCase()} ».`
    actions = [
      `Identifier le point de friction principal (« ${problemeTxt.toLowerCase()} ») avec l'équipe.`,
      `Ajuster le processus sur ${sujetAction}.`,
      "Mettre en place un suivi personnalisé pour convertir ce client en promoteur.",
    ]
    impact =
      "Transformation d'un client mitigé en client satisfait et fidélisé."
  } else {
    const pointFortTxt = premierPos ?? "l'accueil et le service"
    contexte = `✅ Client satisfait (${retour.note}/5) — ${zoneNom}. ${phraseRecurrence} Point fort identifié : « ${pointFortTxt.toLowerCase()} ».`
    actions = [
      `Féliciter publiquement l'équipe pour « ${pointFortTxt.toLowerCase()} » lors du prochain briefing.`,
      "Identifier ce qui a bien fonctionné et le formaliser en bonne pratique.",
      "Demander au client s'il accepterait de laisser un avis Google.",
    ]
    impact =
      "Renforcement de la réputation en ligne et fidélisation (+30% de chances que le client recommande l'établissement)."
  }

  return {
    categorie,
    niveau,
    probleme: libelleCategorie,
    contexte,
    recurrence,
    actions,
    impact,
  }
}

/**
 * Génère 3 templates de réponse au client selon la note et les tags.
 * Le commerçant peut éditer le texte avant envoi.
 */
function genererTemplatesReponse(retour: Retour): string[] {
  const pos = tagsPositifsDe(retour).map(tagLabel)
  const neg = tagsNegatifsDe(retour).map(tagLabel)
  const posTxt = pos[0] ?? "votre expérience"
  const negTxt = neg[0] ?? "ce désagrément"
  const actionTxt =
    neg[0] != null
      ? `mettre en place une action correctrice sur le point suivant : ${negTxt.toLowerCase()}`
      : "mettre en place des actions correctives"

  if (retour.note >= 4) {
    return [
      `Bonjour, merci beaucoup pour votre retour positif ! Nous sommes ravis que vous ayez apprécié ${posTxt.toLowerCase()}. Au nom de toute l'équipe, à très bientôt !`,
      `Merci pour votre retour et votre confiance ! C'est grâce à vos retours que nous continuons à progresser. Nous espérons vous revoir très prochainement.`,
      `Un grand merci pour ce retour qui fait plaisir à toute l'équipe. N'hésitez pas à revenir, nous serons ravis de vous accueillir à nouveau !`,
    ]
  }
  if (retour.note <= 2) {
    return [
      `Bonjour, toutes nos excuses pour ${negTxt.toLowerCase()}. Nous prenons votre retour très au sérieux et mettons en place des actions correctives immédiates. N'hésitez pas à nous recontacter, nous serons heureux de vous proposer une compensation.`,
      `Bonjour, nous sommes sincèrement désolés pour cette mauvaise expérience. Votre retour est précieux : nous allons ${actionTxt}. Merci de nous avoir alertés, nous espérons vous réserver un accueil à la hauteur de vos attentes lors de votre prochaine visite.`,
      `Toutes nos excuses pour ce désagrément. Soyez assuré que votre retour a été remonté à la direction et fait l'objet d'un suivi. Nous vous recontacterons si vous le souhaitez pour faire le point. Cordialement.`,
    ]
  }
  // note === 3
  return [
    `Bonjour, nous sommes sincèrement désolés pour votre expérience. Votre retour est précieux et nous allons immédiatement ${actionTxt}. Merci de nous avoir alertés.`,
    `Merci pour votre retour. Nous prenons acte de votre déception et mettons tout en œuvre pour améliorer ce point. Nous espérons vous proposer une meilleure expérience lors de votre prochaine visite.`,
    `Bonjour, désolé que l'expérience n'ait pas été à la hauteur de vos attentes. Vos remarques ont bien été prises en compte. N'hésitez pas à nous recontacter pour en discuter.`,
  ]
}

type StatsEmploye = {
  nom: string
  total: number
  moyenne: number
  pointsForts: { tag: string; label: string; count: number }[]
  pointsFaibles: { tag: string; label: string; count: number }[]
  formations: string[]
}

/** Libellé d'une formation recommandée selon une catégorie IA. */
function formationPourCategorie(c: CategorieIA): string | null {
  switch (c) {
    case "Accueil":
      return "Formation « Accueil & politesse client » (1h, en interne)"
    case "Rapidité":
      return "Formation « Gestion du flux de service aux heures de pointe » (1h)"
    case "Compétence":
      return "Formation produit ciblée (1h, en interne)"
    case "Attention":
      return "Atelier « Attention client & posture » (45 min)"
    case "Propreté":
      return "Formation « Procédures de nettoyage & hygiène » (1h)"
    case "Qualité":
      return "Formation « Contrôle qualité produit » (1h)"
    default:
      return null
  }
}

/**
 * Calcule les statistiques d'un employé à partir de tous les retours chargés
 * (filtrage sur `personnelMentionne`). Renvoie les 30 derniers retours,
 * le score moyen, les points forts/faibles et les formations conseillées.
 */
function statsEmploye(nom: string, tous: Retour[]): StatsEmploye | null {
  const clean = nom.trim().toLowerCase()
  if (!clean) return null
  // Filtrer par personnelMentionne OU employe.nom (insensible à la casse)
  const retoursEmp = tous.filter((r) => {
    const pers = r.personnelMentionne?.trim().toLowerCase()
    const emp = r.employe?.nom?.trim().toLowerCase()
    return (pers && pers === clean) || (emp && emp === clean)
  })
  if (retoursEmp.length === 0) return null

  const moyenne = retoursEmp.reduce((s, r) => s + r.note, 0) / retoursEmp.length

  const compteTag = (filtre: Set<string>) => {
    const m = new Map<string, number>()
    for (const r of retoursEmp) {
      for (const t of r.tags) {
        if (filtre.has(t)) m.set(t, (m.get(t) ?? 0) + 1)
      }
    }
    return [...m.entries()]
      .map(([tag, count]) => ({ tag, label: tagLabel(tag), count }))
      .sort((a, b) => b.count - a.count)
  }
  const pointsForts = compteTag(SET_POSITIFS).slice(0, 3)
  const pointsFaibles = compteTag(SET_NEGATIFS).slice(0, 3)

  // Formations : pour chaque catégorie issue des tags négatifs, on propose
  // une formation (sans doublons).
  const cats = new Set<CategorieIA>()
  for (const r of retoursEmp) {
    for (const t of tagsNegatifsDe(r)) cats.add(categorieTag(t))
  }
  const formations: string[] = []
  for (const c of cats) {
    const f = formationPourCategorie(c)
    if (f) formations.push(f)
  }

  return {
    nom,
    total: retoursEmp.length,
    moyenne,
    pointsForts,
    pointsFaibles,
    formations,
  }
}

/** Garde-fou : renvoie toujours un tableau (l'API peut être en cours de migration) */
function enArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

// ---------- Helpers d'affichage ----------

/** Tronque un commentaire à ~60 caractères */
function tronquer(texte: string, max = 60): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte
}

/** Libellé du canal d'envoi */
function canalLabel(canal: string | null): string {
  if (!canal) return "—"
  if (canal === "whatsapp") return "via WhatsApp"
  if (canal === "google") return "via Google"
  return "via formulaire"
}

/** Badge de statut coloré : Nouveau rouge / En cours orange / Résolu vert */
function statutBadgeClass(statut: string): string {
  if (statut === "RESOLVED") return "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
  if (statut === "IN_PROGRESS") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
  return "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
}

/** Couleur de la pastille de la timeline de suivi */
function pastilleClass(statut: string): string {
  if (statut === "RESOLVED") return "bg-green-500"
  if (statut === "IN_PROGRESS") return "bg-amber-500"
  return "bg-rose-500"
}

// ---------- NOUVEAU : Code couleur par urgence (Refonte Liste) ----------

type Urgence = "urgent" | "atraiter" | "mitige" | "positif"

// Code couleur par urgence (spec Refonte Liste) :
// - 🔴 Urgent   : note ≤ 2 + récidive  → badge "🚨 Urgent"  (bg-red-500    text-white)
// - 🟠 À traiter: note ≤ 2 isolé       → badge "À traiter" (bg-orange-500 text-white)
// - 🟡 Mitigé   : note = 3             → badge "Mitigé"    (bg-yellow-500 text-white)
// - 🟢 Positif  : note ≥ 4             → badge "Positif"   (bg-green-500  text-white)
// Les badges sont en fond plein (solid) avec texte blanc, bordure transparente
// pour un rendu lumineux qui se distingue des autres badges « outline ».
const URGENCE_CONFIG: Record<Urgence, {
  label: string
  emoji: string
  dot: string
  badge: string
  border: string
  glow: string
  cardBg: string
  cardText: string
}> = {
  urgent: {
    label: "Urgent",
    emoji: "🚨",
    dot: "bg-[#720032]",
    badge: "border-transparent bg-white/25 text-white shadow-sm shadow-[#720032]/30",
    border: "border-l-[#720032]",
    glow: "hover:shadow-[#720032]/40",
    cardBg: "bg-[#720032]",
    cardText: "text-white",
  },
  atraiter: {
    label: "À traiter",
    emoji: "🟠",
    dot: "bg-orange-500",
    badge: "border-transparent bg-white/25 text-white shadow-sm shadow-orange-500/30",
    border: "border-l-orange-500",
    glow: "hover:shadow-orange-500/40",
    cardBg: "bg-orange-500",
    cardText: "text-white",
  },
  mitige: {
    label: "Mitigé",
    emoji: "🟡",
    dot: "bg-yellow-500",
    badge: "border-transparent bg-white/25 text-white shadow-sm shadow-yellow-500/30",
    border: "border-l-yellow-500",
    glow: "hover:shadow-yellow-500/40",
    cardBg: "bg-yellow-500",
    cardText: "text-white",
  },
  positif: {
    label: "Positif",
    emoji: "🟢",
    dot: "bg-[#0da14b]",
    badge: "border-transparent bg-white/25 text-white shadow-sm shadow-[#0da14b]/30",
    border: "border-l-[#0da14b]",
    glow: "hover:shadow-[#0da14b]/40",
    cardBg: "bg-[#0da14b]",
    cardText: "text-white",
  },
}

/**
 * Détermine l'urgence d'un retour :
 * - 🔴 Urgent : note ≤ 2 ET récidive (count >= 2)
 * - 🟠 À traiter : note ≤ 2 isolé
 * - 🟡 Mitigé : note = 3
 * - 🟢 Positif : note ≥ 4
 */
function urgenceDe(r: Retour, recurrence: { count: number }): Urgence {
  if (r.note >= 4) return "positif"
  if (r.note === 3) return "mitige"
  if (r.note <= 2 && recurrence.count >= 2) return "urgent"
  return "atraiter"
}

// ---------- NOUVEAU : Résumé IA Coach (top of list) ----------

// Évolution d'une priorité entre cette semaine (7j) et la semaine précédente.
// `pct` est arrondi (peut être négatif si la tendance s'améliore).
// `nouveau` = true si le tag n'existait pas la semaine précédente.
type EvolutionSemaine = { pct: number; nouveau: boolean; thisWeek: number; lastWeek: number }

/**
 * Calcule l'évolution d'un tag entre cette semaine (7 derniers jours) et
 * la semaine précédente (7 à 14 jours). Renvoie null si aucune occurrence
 * sur les deux semaines (tag inconnu).
 */
function evolutionTag(tag: string, items: Retour[]): EvolutionSemaine | null {
  const maintenant = Date.now()
  const JOUR = 24 * 60 * 60 * 1000
  const seuilCetteSemaine = maintenant - 7 * JOUR
  const seuilSemainePrecedente = maintenant - 14 * JOUR
  let thisWeek = 0
  let lastWeek = 0
  for (const r of items) {
    if (!r.tags.includes(tag)) continue
    const t = new Date(r.createdAt).getTime()
    if (t >= seuilCetteSemaine) thisWeek++
    else if (t >= seuilSemainePrecedente) lastWeek++
  }
  if (thisWeek === 0 && lastWeek === 0) return null
  const nouveau = lastWeek === 0 && thisWeek > 0
  const pct = nouveau
    ? 100
    : lastWeek === 0
      ? 0
      : Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
  return { pct, nouveau, thisWeek, lastWeek }
}

type PrioriteIA =
  | { type: "tag"; emoji: string; titre: string; detail: string; tagId?: string; evolution?: EvolutionSemaine | null }
  | { type: "zone"; emoji: string; titre: string; detail: string; zoneNom?: string }
  | { type: "employe"; emoji: string; titre: string; detail: string; employeNom?: string }

/** Calcule 3 priorités IA côté client : tag négatif dominant, zone la plus basse, employé problématique. */
function calculerResumeIA(items: Retour[]): PrioriteIA[] {
  if (items.length === 0) return []
  const priorites: PrioriteIA[] = []

  // 1) Tag négatif le plus fréquent (avec son libellé) + évolution vs semaine précédente
  const occTag = new Map<string, number>()
  for (const r of items) {
    for (const t of tagsNegatifsDe(r)) occTag.set(t, (occTag.get(t) ?? 0) + 1)
  }
  let bestTag: string | null = null
  let bestTagN = 0
  for (const [t, n] of occTag) {
    if (n > bestTagN) {
      bestTagN = n
      bestTag = t
    }
  }
  if (bestTag && bestTagN >= 2) {
    const evolution = evolutionTag(bestTag, items)
    // Libellé d'évolution utilisé dans le détail de la priorité
    let detail = "Thème récurrent à traiter en priorité"
    if (evolution) {
      if (evolution.nouveau) {
        detail = `🆕 ${evolution.thisWeek} cette semaine — nouveau vs semaine précédente`
      } else if (evolution.pct > 0) {
        detail = `↗️ +${evolution.pct}% vs semaine précédente (${evolution.lastWeek} → ${evolution.thisWeek})`
      } else if (evolution.pct < 0) {
        detail = `↘️ ${evolution.pct}% vs semaine précédente (${evolution.lastWeek} → ${evolution.thisWeek})`
      } else {
        detail = `→ Stable vs semaine précédente (${evolution.thisWeek} cette semaine)`
      }
    }
    priorites.push({
      type: "tag",
      emoji: "⚠️",
      titre: `${bestTagN} retours « ${tagLabel(bestTag)} »`,
      detail,
      tagId: bestTag,
      evolution,
    })
  }

  // 2) Zone avec la note moyenne la plus basse (au moins 2 retours)
  const zoneNotes = new Map<string, { sum: number; count: number; nom: string }>()
  for (const r of items) {
    const nom = r.zone?.nom
    if (!nom) continue
    const cur = zoneNotes.get(nom) ?? { sum: 0, count: 0, nom }
    cur.sum += r.note
    cur.count += 1
    zoneNotes.set(nom, cur)
  }
  let worstZone: { nom: string; moyenne: number; count: number } | null = null
  for (const z of zoneNotes.values()) {
    if (z.count < 2) continue
    const moyenne = z.sum / z.count
    if (!worstZone || moyenne < worstZone.moyenne) {
      worstZone = { nom: z.nom, moyenne, count: z.count }
    }
  }
  if (worstZone && worstZone.moyenne < 3.5) {
    priorites.push({
      type: "zone",
      emoji: "📍",
      titre: `Zone « ${worstZone.nom} » : ${worstZone.moyenne.toFixed(1)}/5`,
      detail: `${worstZone.count} retours — à surveiller`,
      zoneNom: worstZone.nom,
    })
  }

  // 3) Employé avec le plus de retours négatifs (note ≤ 2)
  const occEmp = new Map<string, number>()
  for (const r of items) {
    if (r.note > 2) continue
    const nom = r.employe?.nom ?? r.personnelMentionne
    if (!nom) continue
    occEmp.set(nom, (occEmp.get(nom) ?? 0) + 1)
  }
  let worstEmp: { nom: string; n: number } | null = null
  for (const [nom, n] of occEmp) {
    if (!worstEmp || n > worstEmp.n) worstEmp = { nom, n }
  }
  if (worstEmp && worstEmp.n >= 2) {
    priorites.push({
      type: "employe",
      emoji: "👥",
      titre: `${worstEmp.nom} : ${worstEmp.n} retours négatifs`,
      detail: "Formation suggérée — voir le profil",
      employeNom: worstEmp.nom,
    })
  }

  // Si moins de 3 priorités, on complète avec un message neutre
  return priorites.slice(0, 3)
}

// ---------- NOUVEAU : Regroupement intelligent des retours similaires ----------

type GroupeSimilaires = {
  cle: string
  libelle: string
  zone: string | null
  count: number
  retours: Retour[]
}

/** Regroupe les retours partageant le même tag négatif dominant. */
function grouperParTagSimilaire(items: Retour[]): GroupeSimilaires[] {
  const map = new Map<string, GroupeSimilaires>()
  for (const r of items) {
    const neg = tagsNegatifsDe(r)
    if (neg.length === 0) continue
    // Tag négatif dominant du retour
    const cle = neg[0]
    const libelle = tagLabel(cle)
    const zone = r.zone?.nom ?? null
    const cleGroupe = `${cle}__${zone ?? "_"}`
    const g = map.get(cleGroupe) ?? { cle, libelle, zone, count: 0, retours: [] }
    g.retours.push(r)
    g.count += 1
    map.set(cleGroupe, g)
  }
  // On ne regroupe que si ≥ 2 retours ; sinon c'est un singleton
  return [...map.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count)
}

/** Note moyenne d'une zone parmi les items chargés. */
function noteMoyenneZone(nom: string, tous: Retour[]): number | null {
  const retours = tous.filter((r) => r.zone?.nom === nom)
  if (retours.length === 0) return null
  return retours.reduce((s, r) => s + r.note, 0) / retours.length
}

/**
 * Identifie la zone la plus touchée par un retour (celle qui concentre le
 * plus de retours partageant au moins un tag avec `retour`, sur 30 jours).
 * Renvoie { nom, count } ou null si aucune zone n'est ressortie.
 */
function zoneLaPlusTouchee(
  retour: Retour,
  tous: Retour[]
): { nom: string; count: number } | null {
  if (retour.tags.length === 0) return null
  const memesTags = new Set(retour.tags)
  const seuil = ilYA30Jours()
  const occ = new Map<string, number>()
  for (const r of tous) {
    if (r.id === retour.id) continue
    const t = new Date(r.createdAt).getTime()
    if (t < seuil) continue
    if (!r.tags.some((tag) => memesTags.has(tag))) continue
    const nom = r.zone?.nom
    if (!nom) continue
    occ.set(nom, (occ.get(nom) ?? 0) + 1)
  }
  let best: { nom: string; count: number } | null = null
  for (const [nom, count] of occ) {
    if (!best || count > best.count) best = { nom, count }
  }
  return best
}

// ---------- Mini-graphique de récurrence (Improvement 7) ----------
// Affiche 10 seaux de 3 jours (≈30 jours) avec le nombre de retours partageant
// au moins un tag avec le retour courant. Implémenté en CSS pur (pas de chart
// library) pour rester léger et responsive.
function MiniGraphiqueRecurrence({
  retourCourant,
  tous,
  tagFrequent,
}: {
  retourCourant: Retour
  tous: Retour[]
  tagFrequent: string | null
}) {
  const NB_SEAUX = 10
  const TAILLE_SEAU_JOURS = 3
  const maintenant = Date.now()
  const debut = maintenant - NB_SEAUX * TAILLE_SEAU_JOURS * 24 * 60 * 60 * 1000
  const memesTags = new Set(retourCourant.tags)

  // Initialiser les seaux
  const seaux: { count: number; label: string }[] = []
  for (let i = 0; i < NB_SEAUX; i++) {
    const debutSeau = debut + i * TAILLE_SEAU_JOURS * 24 * 60 * 60 * 1000
    const finSeau = debutSeau + TAILLE_SEAU_JOURS * 24 * 60 * 60 * 1000
    let count = 0
    for (const r of tous) {
      const t = new Date(r.createdAt).getTime()
      if (t < debutSeau || t >= finSeau) continue
      if (r.tags.some((tag) => memesTags.has(tag))) count++
    }
    // Libellé court : J-27, J-24, … J-3, "ces 3 j"
    const joursAvant = Math.round((maintenant - finSeau) / (24 * 60 * 60 * 1000))
    const label = i === NB_SEAUX - 1 ? "3 j" : `J-${joursAvant}`
    seaux.push({ count, label })
  }
  const max = Math.max(1, ...seaux.map((s) => s.count))
  const total = seaux.reduce((s, b) => s + b.count, 0)

  return (
    <div>
      <div className="flex items-end gap-1 h-16" role="img" aria-label={`Tendance : ${total} retours similaires sur 30 jours`}>
        {seaux.map((b, i) => {
          const hauteurPct = (b.count / max) * 100
          const estActuel = i === NB_SEAUX - 1
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-0.5">
              <span className="text-[10px] font-medium text-amber-200/90 tabular-nums">
                {b.count > 0 ? b.count : ""}
              </span>
              <div
                className={cn(
                  "w-full rounded-t-sm transition-all",
                  estActuel ? "bg-amber-300" : "bg-amber-300/60"
                )}
                style={{ height: `${Math.max(2, hauteurPct)}%` }}
                title={`${b.count} retour(s) — ${b.label}`}
              />
              <span className="text-[9px] text-white/70">{b.label}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-amber-100/90">
        {total} retour{total > 1 ? "s" : ""} similaire{total > 1 ? "s" : ""}
        {tagFrequent ? ` « ${tagLabel(tagFrequent)} »` : ""} sur les 30 derniers jours.
      </p>
    </div>
  )
}

// ---------- NOUVEAU : Carte unique d'un retour (Refonte Liste) ----------

function CarteRetour({
  r,
  recurrence,
  onVoir,
  onRepondre,
  onResoudre,
  onFiltrerTag,
  onVoirEmploye,
}: {
  r: Retour
  recurrence: { count: number; libelleTag: string | null }
  onVoir: () => void
  onRepondre: () => void
  onResoudre: () => void
  onFiltrerTag: (tag: string) => void
  onVoirEmploye: (nom: string) => void
}) {
  const urgence = urgenceDe(r, recurrence)
  const cfg = URGENCE_CONFIG[urgence]
  const personnel = r.employe?.nom ?? r.personnelMentionne
  const nbTags = r.tags.length

  return (
    <Card
      className={cn(
        "rounded-3xl border-0 shadow-md transition-all duration-200 overflow-hidden",
        "hover:shadow-xl hover:-translate-y-0.5",
        cfg.cardBg,
        cfg.cardText,
        cfg.glow
      )}
    >
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Ligne 1 : note + zone + date + badge urgence */}
        <div className="flex flex-wrap items-center gap-2">
          <Stars note={r.note} size={16} />
          <span className="text-sm font-bold tabular-nums">{r.note}/5</span>
          <span className="opacity-60">•</span>
          {r.zone?.nom ? (
            <Badge className="h-6 gap-1 px-2 text-xs font-normal bg-white/20 border-0 text-white hover:bg-white/30">
              <MapPin className="h-3 w-3 opacity-80" aria-hidden />
              {r.zone.nom}
            </Badge>
          ) : (
            <span className="text-xs opacity-60">Zone non précisée</span>
          )}
          <span className="opacity-60">•</span>
          <span className="text-xs opacity-80" title={formatDate(r.createdAt)}>
            {formatRelative(r.createdAt)}
          </span>
          {!r.lu && (
            <Badge className="h-5 gap-0.5 border border-white/40 bg-white/30 px-1.5 text-[10px] font-bold text-white shadow-sm">
              <span aria-hidden>✨</span>
              Nouveau
            </Badge>
          )}
          <Badge variant="outline" className={cn("ml-auto h-6 px-2 text-xs font-bold", cfg.badge)}>
            <span aria-hidden>{cfg.emoji}</span>
            {cfg.label}
          </Badge>
        </div>

        {/* Ligne 2 : tags (cliquables pour filtrage instantané) */}
        {nbTags > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.tags.slice(0, 5).map((t) => {
              const neg = SET_NEGATIFS.has(t)
              const pos = SET_POSITIFS.has(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onFiltrerTag(t)}
                  title={`Filtrer par « ${tagLabel(t)} »`}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-all",
                    "hover:scale-105 hover:shadow-sm",
                    "border-white/30 bg-white/15 text-white hover:bg-white/25"
                  )}
                >
                  {tagLabel(t)}
                </button>
              )
            })}
            {nbTags > 5 && (
              <Badge className="h-5 px-1.5 text-[10px] font-normal bg-white/20 border-0 text-white">
                +{nbTags - 5}
              </Badge>
            )}
          </div>
        )}

        {/* Ligne 3 : commentaire client (citation italique) */}
        {r.commentaire && (
          <blockquote className="border-l-2 border-white/40 bg-white/10 px-3 py-2 text-sm italic leading-relaxed text-white/90">
            &ldquo;{tronquer(r.commentaire, 160)}&rdquo;
          </blockquote>
        )}

        {/* Ligne 4 : métadonnées (personnel | photo | récurrence) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/70">
          {personnel && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" aria-hidden />
              <button
                type="button"
                onClick={() => onVoirEmploye(personnel)}
                className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {personnel}
              </button>
            </span>
          )}
          {r.photoUrl && (
            <span className="inline-flex items-center gap-1 text-white">
              <Camera className="h-3 w-3" aria-hidden />
              Photo jointe
            </span>
          )}
          {recurrence.count >= 2 && recurrence.libelleTag && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white"
              title={`${ordinalFr(recurrence.count)} signalement « ${recurrence.libelleTag} » sur 30 jours`}
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              {ordinalFr(recurrence.count)} similaire
            </span>
          )}
          {r.statut === "RESOLVED" && (
            <span className="inline-flex items-center gap-1 text-white/90">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Résolu
            </span>
          )}
          {r.reponsePro && (
            <span className="inline-flex items-center gap-1 text-white">
              <MessageSquareReply className="h-3 w-3" aria-hidden />
              Répondu
            </span>
          )}
        </div>

        {/* Ligne 5 : 3 boutons d'action */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-white/90 text-gray-900 hover:bg-white transition-transform hover:scale-105"
            onClick={onVoir}
          >
            <Eye className="h-4 w-4" aria-hidden />
            Voir détail
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white transition-transform hover:scale-105"
            onClick={onRepondre}
          >
            <MessageSquareReply className="h-4 w-4" aria-hidden />
            Répondre
          </Button>
          {r.statut !== "RESOLVED" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-white hover:bg-white/20 hover:text-white"
              onClick={onResoudre}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Marquer résolu
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- NOUVEAU : Carte groupée de retours similaires ----------

function GroupeCartes({
  groupe,
  deploye,
  onToggle,
  onVoir,
  onRepondre,
  onResoudre,
  onFiltrerTag,
  onVoirEmploye,
}: {
  groupe: GroupeSimilaires
  deploye: boolean
  onToggle: () => void
  onVoir: (r: Retour) => void
  onRepondre: (r: Retour) => void
  onResoudre: (r: Retour) => void
  onFiltrerTag: (tag: string) => void
  onVoirEmploye: (nom: string) => void
}) {
  const tous = groupe.retours
  // Récurrence du premier retour du groupe (représentatif)
  const recurrencePremier = useMemo(
    () => compterRecurrence(groupe.retours[0], tous),
    [groupe.retours, tous]
  )

  return (
    <Card className="rounded-3xl border bg-card shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={deploye}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Layers className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            📦 {groupe.count} retours similaires « {groupe.libelle} »
          </p>
          <p className="text-xs text-muted-foreground">
            {groupe.zone ? `Zone : ${groupe.zone}` : "Zones multiples"}
            {" — "}note moyenne{" "}
            {(groupe.retours.reduce((s, r) => s + r.note, 0) / groupe.count).toFixed(1)}/5
          </p>
        </div>
        <Badge variant="outline" className="border-transparent bg-amber-500 text-white shadow-sm shadow-amber-500/30">
          🔁 Récurrence
        </Badge>
        {deploye ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>
      {deploye && (
        <div className="space-y-3 border-t bg-muted/20 p-4 sm:p-5">
          {groupe.retours.map((r) => (
            <CarteRetour
              key={r.id}
              r={r}
              recurrence={compterRecurrence(r, tous)}
              onVoir={() => onVoir(r)}
              onRepondre={() => onRepondre(r)}
              onResoudre={() => onResoudre(r)}
              onFiltrerTag={onFiltrerTag}
              onVoirEmploye={onVoirEmploye}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

// ---------- NOUVEAU : En-tête Résumé IA Coach (top of list) ----------

/** Rendu compact d'une évolution hebdomadaire (badge coloré selon la tendance). */
function BadgeEvolution({ evolution }: { evolution: EvolutionSemaine }) {
  if (evolution.nouveau) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
        <span aria-hidden>🆕</span> Nouveau
      </span>
    )
  }
  if (evolution.pct > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300" title={`Cette semaine : ${evolution.thisWeek} · Semaine précédente : ${evolution.lastWeek}`}>
        <span aria-hidden>↗️</span> +{evolution.pct}%
      </span>
    )
  }
  if (evolution.pct < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" title={`Cette semaine : ${evolution.thisWeek} · Semaine précédente : ${evolution.lastWeek}`}>
        <span aria-hidden>↘️</span> {evolution.pct}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground" title={`Cette semaine : ${evolution.thisWeek} · Semaine précédente : ${evolution.lastWeek}`}>
      <span aria-hidden>→</span> Stable
    </span>
  )
}

function ResumeCoachIA({
  items,
  onVoirRapport,
  onFiltrerTag,
  onVoirEmploye,
}: {
  items: Retour[]
  onVoirRapport: () => void
  onFiltrerTag: (tag: string) => void
  onVoirEmploye: (nom: string) => void
}) {
  const priorites = useMemo(() => calculerResumeIA(items), [items])

  if (priorites.length === 0) return null

  return (
    <Card className="rounded-3xl border-primary/20 bg-primary/[0.04] shadow-sm">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <span aria-hidden>📊</span>
              Résumé de la semaine
              <span className="text-xs font-normal text-muted-foreground">(Coach IA)</span>
            </h2>
            <p className="text-xs text-muted-foreground">Coach IA — priorités détectées sur les retours chargés</p>
          </div>
          <Badge variant="outline" className="ml-auto h-6 gap-1 px-2 text-xs font-normal">
            <Sparkles className="h-3 w-3" aria-hidden />
            {priorites.length} priorité{priorites.length > 1 ? "s" : ""}
          </Badge>
        </div>

        <ol className="space-y-2">
          {priorites.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  if (p.type === "tag" && p.tagId) onFiltrerTag(p.tagId)
                  else if (p.type === "employe" && p.employeNom) onVoirEmploye(p.employeNom)
                  // zone : pas d'action directe (le filtre zone est dans la barre pills)
                }}
                className="flex w-full items-start gap-3 rounded-2xl border border-primary/10 bg-card p-3 text-left transition-all hover:bg-muted/40 hover:shadow-sm"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      <span aria-hidden className="mr-1">{p.emoji}</span>
                      {p.titre}
                    </p>
                    {p.type === "tag" && p.evolution && (
                      <BadgeEvolution evolution={p.evolution} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.detail}</p>
                </div>
                {(p.type === "tag" || p.type === "employe") && (
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ol>

        <Button variant="default" size="sm" className="gap-1.5" onClick={onVoirRapport}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Voir le rapport complet
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Composant principal : RetoursTab
// ============================================================

export function RetoursTab({ onOuvrirCoachIA }: { onOuvrirCoachIA?: () => void } = {}) {
  const [items, setItems] = useState<Retour[]>([])
  const [zones, setZones] = useState<ZoneFiltre[]>([])
  const [employes, setEmployes] = useState<EmployeFiltre[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filtres (contrat API : note, zoneId, employeId, statut, tag, dateDebut, dateFin, page)
  const [fNote, setFNote] = useState("all")
  const [fZone, setFZone] = useState("all")
  const [fEmploye, setFEmploye] = useState("") // "" = tous les employés
  const [fStatut, setFStatut] = useState("all")
  const [fTag, setFTag] = useState("all")
  const [fDu, setFDu] = useState("") // dateDebut (AAAA-MM-JJ)
  const [fAu, setFAu] = useState("") // dateFin (AAAA-MM-JJ)

  // NOUVEAU : Filtres rapides (pills) et temporels + toggle regroupement
  const [fRapide, setFRapide] = useState<"all" | "urgent" | "inprogress" | "resolved">("all")
  const [fTemporel, setFTemporel] = useState<"all" | "today" | "week" | "month">("all")
  const [grouperSimilaires, setGrouperSimilaires] = useState(false)
  const [groupesDeployes, setGroupesDeployes] = useState<Set<string>>(new Set())

  // Modale de détail
  const [detail, setDetail] = useState<Retour | null>(null)
  const [editionReponse, setEditionReponse] = useState(false)
  const [confirmSuppression, setConfirmSuppression] = useState(false)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)
  const [texteReponse, setTexteReponse] = useState("")
  const [envoiReponse, setEnvoiReponse] = useState(false)
  const [editionAction, setEditionAction] = useState(false)
  const [texteAction, setTexteAction] = useState("")

  // Task 1 — Recommandation IA via le vrai LLM (z-ai-web-dev-sdk, backend).
  // Au lieu de calculer les recommandations côté client (heuristiques), on
  // appelle /api/pro/coach/recommandation qui interroge le LLM et renvoie
  // un JSON structuré (diagnostic, actions, impact, niveau, source).
  // Pendant l'attente (LLM ~3-10s), on affiche le fallback heuristique
  // (recoIA calculé côté client) pour que la card IA ne soit jamais vide.
  type RecoLLM = {
    source: "ia" | "fallback"
    niveau: "crise" | "mitige" | "positif"
    diagnostic: string
    actions: string[]
    impact: string
    pointsPositifs: string[]
  }
  const [recoLLM, setRecoLLM] = useState<RecoLLM | null>(null)
  const [recoLLMLoading, setRecoLLMLoading] = useState(false)
  const [envoiAction, setEnvoiAction] = useState(false)
  // Workflow unifié d'action managériale : statut choisi dans le même formulaire
  const [texteActionStatut, setTexteActionStatut] = useState<StatutRetour>("IN_PROGRESS")
  // Dialog d'historique d'un employé (Improvement 6)
  const [dialogEmployeNom, setDialogEmployeNom] = useState<string | null>(null)
  // NOUVEAU : Dialog plein écran pour la photo
  const [photoZoom, setPhotoZoom] = useState(false)
  // NOUVEAU : Section "Détails & Historique" repliable (NIVEAU 3 du Dashboard d'Urgence).
  // Repliée par défaut : le Coach IA (NIVEAU 2) reste le focus visuel.
  const [detailsOuverts, setDetailsOuverts] = useState(false)
  const reponseRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLTextAreaElement>(null)
  // Refs pour le scroll
  const iaRef = useRef<HTMLDivElement>(null)
  const actionFormRef = useRef<HTMLDivElement>(null)

  // Session globale (Pro : pour récupérer nomEtablissement + whatsapp)
  const session = useAppStore((s) => s.session)
  const pro = session?.pro ?? null
  const proWhatsapp = pro?.whatsapp ?? null
  const proNom = pro?.nomEtablissement ?? "Établissement"

  const { toast } = useToast()

  // Chargement des listes de filtrage : zones + employés (en parallèle)
  useEffect(() => {
    let annule = false
    fetch("/api/pro/zones", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!annule && j.ok) setZones(enArray(j.data.zones))
      })
      .catch(() => {
        /* silencieux : le filtre zone restera simplement vide */
      })
    fetch("/api/pro/employes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!annule && j.ok) setEmployes(enArray(j.data.employes))
      })
      .catch(() => {
        /* silencieux : le filtre employé restera simplement vide */
      })
    return () => {
      annule = true
    }
  }, [])

  // Synchronisation des filtres rapides/temporels avec les filtres API
  // - fRapide "urgent" : pas d'API filter (note ≤ 2), on filtre côté client
  //   → on ne touche pas à fStatut/fNote ; on garde fRapide pour le post-traitement
  // - fRapide "inprogress" → fStatut = "IN_PROGRESS"
  // - fRapide "resolved" → fStatut = "RESOLVED"
  // - fTemporel → fDu / fAu
  useEffect(() => {
    if (fRapide === "inprogress") setFStatut("IN_PROGRESS")
    else if (fRapide === "resolved") setFStatut("RESOLVED")
    else if (fRapide === "all" && (fStatut === "IN_PROGRESS" || fStatut === "RESOLVED")) {
      // Si on désactive le filtre rapide, on réinitialise le statut
      // uniquement s'il avait été positionné par le filtre rapide
      setFStatut("all")
    }
  }, [fRapide])

  useEffect(() => {
    const aujourdhui = new Date()
    const yyyy = aujourdhui.getFullYear()
    const mm = String(aujourdhui.getMonth() + 1).padStart(2, "0")
    const jj = String(aujourdhui.getDate()).padStart(2, "0")
    const aujourdhuiStr = `${yyyy}-${mm}-${jj}`
    if (fTemporel === "today") {
      setFDu(aujourdhuiStr)
      setFAu(aujourdhuiStr)
    } else if (fTemporel === "week") {
      // Lundi de la semaine courante
      const jour = aujourdhui.getDay() || 7 // 0 = dimanche → 7
      const lundi = new Date(aujourdhui)
      lundi.setDate(aujourdhui.getDate() - jour + 1)
      const lyyyy = lundi.getFullYear()
      const lmm = String(lundi.getMonth() + 1).padStart(2, "0")
      const ljj = String(lundi.getDate()).padStart(2, "0")
      setFDu(`${lyyyy}-${lmm}-${ljj}`)
      setFAu(aujourdhuiStr)
    } else if (fTemporel === "month") {
      setFDu(`${yyyy}-${mm}-01`)
      setFAu(aujourdhuiStr)
    } else {
      // "all" : on ne réinitialise pas (l'utilisateur peut avoir des dates custom)
    }
  }, [fTemporel])

  const load = useCallback(
    async (p = page) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p) })
        if (fNote !== "all") params.set("note", fNote)
        if (fZone !== "all") params.set("zoneId", fZone)
        if (fEmploye) params.set("employeId", fEmploye)
        if (fStatut !== "all") params.set("statut", fStatut)
        if (fTag !== "all") params.set("tag", fTag)
        if (fDu) params.set("dateDebut", fDu)
        if (fAu) params.set("dateFin", fAu)
        const res = await fetch(`/api/pro/retours?${params.toString()}`, { cache: "no-store" })
        const json = await res.json()
        if (json.ok) {
          setItems(enArray(json.data.retours))
          setTotal(json.data.total ?? 0)
        } else {
          toast({ title: "Erreur", description: "Impossible de charger les retours", variant: "destructive" })
        }
      } catch {
        toast({ title: "Erreur", description: "Impossible de charger les retours", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    },
    [fNote, fZone, fEmploye, fStatut, fTag, fDu, fAu, page, toast]
  )

  // Rechargement quand un filtre ou la page change
  useEffect(() => {
    load(page)
  }, [fNote, fZone, fEmploye, fStatut, fTag, fDu, fAu, page, load])

  // Task 1 — Fetch de la recommandation IA (vrai LLM) quand on ouvre un retour.
  // On appelle /api/pro/coach/recommandation qui interroge le LLM (backend).
  // Pendant l'attente, l'UI affiche le fallback heuristique (recoIA calculé
  // ci-dessous à partir des données client). Dès que le LLM répond, on remplace
  // les champs affichés (diagnostic, actions, impact, niveau) par sa réponse.
  useEffect(() => {
    if (!detail) {
      setRecoLLM(null)
      setRecoLLMLoading(false)
      return
    }
    let annule = false
    setRecoLLM(null)
    setRecoLLMLoading(true)
    fetch("/api/pro/coach/recommandation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        retourId: detail.id,
        // Recurrence pré-calculée côté client (sera recalculée côté serveur,
        // mais on l'envoie pour fallback immédiat si DB indisponible).
        recurrence: compterRecurrence(detail, items),
      }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j.ok && j.data) {
          setRecoLLM(j.data as RecoLLM)
        }
        // Si l'API échoue, on garde le fallback heuristique (recoIA)
      })
      .catch(() => {
        /* silencieux : fallback heuristique déjà affiché */
      })
      .finally(() => {
        if (!annule) setRecoLLMLoading(false)
      })
    return () => {
      annule = true
    }
    // items est volontairement omis : on ne veut pas relancer le LLM à chaque
    // mise à jour de la liste. Seul l'ID du retour déclenche un nouvel appel.
  }, [detail?.id])

  // Focus sur la zone de texte dès que le mode édition s'ouvre
  useEffect(() => {
    if (editionReponse) reponseRef.current?.focus()
  }, [editionReponse, detail?.id])

  useEffect(() => {
    if (editionAction) actionRef.current?.focus()
  }, [editionAction, detail?.id])

  // Mise à jour d'un retour (statut / lu / réponse / action) :
  // synchronise la liste ET l'item affiché dans la modale
  async function majRetour(id: string, data: { statut?: StatutRetour; lu?: boolean; reponsePro?: string; actionPrise?: string }) {
    try {
      const res = await fetch("/api/pro/retours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      })
      const json = await res.json()
      if (json.ok) {
        // La réponse serveur contient le retour à jour ({ retour })
        const maj = json.data.retour ?? json.data
        setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...maj } : r)))
        setDetail((prev) => (prev && prev.id === id ? { ...prev, ...maj } : prev))
      } else {
        toast({ title: "Erreur", description: json.error || "Mise à jour impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Mise à jour impossible", variant: "destructive" })
    }
  }

  // Ouverture de la modale
  function ouvrirDetail(r: Retour) {
    setDetail(r)
    setTexteReponse(r.reponsePro || "")
    setTexteAction(r.actionPrise || "")
    setTexteActionStatut(r.statut === "NEW" ? "IN_PROGRESS" : r.statut)
    setEditionReponse(false)
    setEditionAction(false)
    // Scroll en haut de page pour le détail
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function ouvrirReponse(r: Retour) {
    setDetail(r)
    setTexteReponse(r.reponsePro || "")
    setTexteAction(r.actionPrise || "")
    setTexteActionStatut(r.statut === "NEW" ? "IN_PROGRESS" : r.statut)
    setEditionReponse(true)
    setEditionAction(false)
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function fermerDetail() {
    setDetail(null)
    setEditionReponse(false)
    setEditionAction(false)
    setDialogEmployeNom(null)
    setPhotoZoom(false)
    setConfirmSuppression(false)
  }

  // Suppression d'un retour (POST /api/pro/retours action=supprimer)
  async function supprimerRetour() {
    if (!detail) return
    setSuppressionEnCours(true)
    try {
      const res = await fetch("/api/pro/retours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "supprimer", id: detail.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Erreur lors de la suppression")
      }
      // Retirer le retour de la liste
      setItems((prev) => prev.filter((r) => r.id !== detail.id))
      toast({ title: "Retour supprimé", description: "Le retour a été définitivement supprimé." })
      fermerDetail()
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Suppression impossible",
        variant: "destructive",
      })
    } finally {
      setSuppressionEnCours(false)
    }
  }

  // Enregistrement de la réponse du commerçant.
  // Si le retour possède un email client → POST /api/pro/retours action=repondre
  // (enregistre reponsePro + envoie l'email au client via Resend si configuré).
  // Sinon → fallback PATCH (enregistre reponsePro sans envoi d'email).
  async function enregistrerReponse() {
    if (!detail || !texteReponse.trim()) return
    setEnvoiReponse(true)
    const message = texteReponse.trim()
    const statutPasse = detail.statut === "NEW"

    if (detail.emailClient) {
      // Envoi par email au client (et enregistrement de la réponse)
      try {
        const res = await fetch("/api/pro/retours", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "repondre", id: detail.id, message }),
        })
        const json = await res.json()
        if (json.ok) {
          const maj = json.data.retour ?? json.data
          setItems((prev) => prev.map((r) => (r.id === detail.id ? { ...r, ...maj } : r)))
          setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, ...maj } : prev))
          toast({
            title: "Réponse envoyée par email ✓",
            description: `Le client recevra votre réponse à l'adresse ${detail.emailClient}.`,
          })
        } else {
          toast({
            title: "Erreur",
            description: json.error || "Envoi impossible",
            variant: "destructive",
          })
          setEnvoiReponse(false)
          return
        }
      } catch {
        toast({ title: "Erreur", description: "Envoi impossible pour le moment", variant: "destructive" })
        setEnvoiReponse(false)
        return
      }
    } else {
      // Pas d'email client : on enregistre juste la réponse interne (PATCH)
      await majRetour(detail.id, {
        reponsePro: message,
        lu: true,
        ...(statutPasse ? { statut: "IN_PROGRESS" as StatutRetour } : {}),
      })
      toast({
        title: "Réponse enregistrée",
        description: statutPasse
          ? "Le statut du retour est passé à « En cours » (le client n'a pas laissé d'email, réponse conservée en interne)."
          : "Le client n'a pas laissé d'email — réponse conservée en interne.",
      })
    }

    setEnvoiReponse(false)
    setEditionReponse(false)
  }

  // Enregistrement de l'action managériale + statut (workflow unifié).
  // Le commerçant consigne son action ET choisit le nouveau statut dans le
  // même formulaire. Le dropdown de statut séparé en bas de page est supprimé.
  async function enregistrerAction() {
    if (!detail || !texteAction.trim()) return
    setEnvoiAction(true)
    const nouveauStatut = texteActionStatut
    await majRetour(detail.id, {
      actionPrise: texteAction.trim(),
      statut: nouveauStatut,
      lu: true,
    })
    setEnvoiAction(false)
    setEditionAction(false)
    toast({
      title: "Action managériale enregistrée",
      description:
        nouveauStatut !== detail.statut
          ? `Statut mis à jour : « ${STATUT_RETOUR_LABEL[nouveauStatut] ?? nouveauStatut} ».`
          : undefined,
    })
  }

  // NOUVEAU : Navigation vers Coach IA (prop ou fallback URL)
  function ouvrirCoachIA() {
    if (onOuvrirCoachIA) {
      onOuvrirCoachIA()
    } else if (typeof window !== "undefined") {
      try {
        window.history.pushState({}, "", "/dashboard/coach")
        window.dispatchEvent(new PopStateEvent("popstate"))
      } catch {
        /* ignore */
      }
    }
  }

  // NOUVEAU : Filtrage instantané par tag (depuis une carte)
  function filtrerParTag(tag: string) {
    setPage(1)
    setFTag(tag)
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // NOUVEAU : Ouvrir le Dialog employé (depuis une carte ou le résumé IA)
  function voirEmploye(nom: string) {
    setDialogEmployeNom(nom)
  }

  // NOUVEAU : Pré-remplir le formulaire d'action avec les reco IA
  function appliquerRecommandationsIA(reco: RecommandationIA) {
    const texte = reco.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")
    setTexteAction(texte)
    setTexteActionStatut("IN_PROGRESS")
    setEditionAction(true)
    setTimeout(() => {
      actionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      actionRef.current?.focus()
    }, 80)
    toast({
      title: "Recommandations appliquées",
      description: "Le formulaire d'action managériale a été pré-rempli.",
    })
  }

  const nbPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const datesActives = fDu !== "" || fAu !== ""

  // Timeline de suivi : historique trié chronologiquement.
  // Pour les anciens retours (sans entrée "NEW"), on préfixe la création
  // afin que le suivi commence toujours par « Nouveau ».
  const historiqueAffiche: { statut: string; at: string }[] = detail
    ? (() => {
        const hist = enArray(detail.historique).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        if (hist.length === 0) return [{ statut: "NEW", at: detail.createdAt }]
        if (!hist.some((h) => h.statut === "NEW")) {
          return [{ statut: "NEW", at: detail.createdAt }, ...hist]
        }
        return hist
      })()
    : []

  // Items filtrés côté client pour "Urgents (note ≤ 2)" et grouping
  const itemsFiltresClient = useMemo(() => {
    if (fRapide === "urgent") return items.filter((r) => r.note <= 2)
    return items
  }, [items, fRapide])

  // Groupes de retours similaires (si toggle activé)
  const groupes = useMemo(
    () => (grouperSimilaires ? grouperParTagSimilaire(itemsFiltresClient) : []),
    [grouperSimilaires, itemsFiltresClient]
  )
  // Retours non groupés (singletons) à afficher tels quels
  const retoursGroupesIds = useMemo(
    () => new Set(groupes.flatMap((g) => g.retours.map((r) => r.id))),
    [groupes]
  )
  const retoursSeuls = useMemo(
    () => itemsFiltresClient.filter((r) => !retoursGroupesIds.has(r.id)),
    [itemsFiltresClient, retoursGroupesIds]
  )

  // ---------- Memoïsations pour la Vue Liste (calculées avant le `if (detail)`
  // pour respecter les règles de hooks — jamais appelées conditionnellement) ----------

  // Calcul du résumé IA (Coach) — top 3 priorités de la semaine
  const resumeIA = useMemo(() => calculerResumeIA(items), [items])

  // Récurrence par retour (pour badge et urgence dans les cards)
  const recurrenceParRetour = useMemo(() => {
    const m = new Map<string, { count: number; libelleTag: string | null }>()
    for (const r of itemsFiltresClient) {
      m.set(r.id, compterRecurrence(r, items))
    }
    return m
  }, [itemsFiltresClient, items])

  // Compteurs pour les filtres rapides (urgents / à traiter / résolus)
  const compteurs = useMemo(() => {
    let urgents = 0
    let enCours = 0
    let resolus = 0
    for (const r of items) {
      if (r.note <= 2) urgents++
      if (r.statut === "IN_PROGRESS") enCours++
      if (r.statut === "RESOLVED") resolus++
    }
    return { urgents, enCours, resolus }
  }, [items])

  // ---------- Vue détaillée pleine page d'un retour (Dashboard d'Urgence) ----------
  if (detail) {
    // Recommandation IA + récurrence (memoïsées côté client à partir de `items`)
    const recoIA = genererRecommandationIA(detail, items)
    const recurrence = recoIA.recurrence
    const templatesReponse = genererTemplatesReponse(detail)
    const statsEmp = dialogEmployeNom ? statsEmploye(dialogEmployeNom, items) : null
    const urgence = urgenceDe(detail, recurrence)
    const cfgUrgence = URGENCE_CONFIG[urgence]
    const noteZone = detail.zone?.nom ? noteMoyenneZone(detail.zone.nom, items) : null

    // Task 1 — Recommandation IA effective : LLM si disponible, sinon fallback
    // heuristique (recoIA). Les champs affichés (diagnostic, actions, impact,
    // niveau) proviennent du LLM dès qu'il a répondu ; sinon on garde l'analyse
    // locale déterministe pour que la card IA ne soit jamais vide.
    const recoEffective: {
      niveau: NiveauIA
      diagnostic: string
      actions: string[]
      impact: string
      source: "ia" | "fallback"
    } = recoLLM
      ? {
          niveau: recoLLM.niveau,
          diagnostic: recoLLM.diagnostic,
          actions: recoLLM.actions,
          impact: recoLLM.impact,
          source: recoLLM.source,
        }
      : {
          niveau: recoIA.niveau,
          diagnostic: recoIA.contexte,
          actions: recoIA.actions,
          impact: recoIA.impact,
          source: "fallback",
        }

    // Construction du message WhatsApp pré-formaté pour alerter l'équipe
    const numeroWhatsapp = (proWhatsapp || "").replace(/[^0-9]/g, "")
    const messageWhatsapp = (() => {
      const lignes: string[] = []
      lignes.push(`⚠️ Alerte qualité - ${proNom}`)
      lignes.push(`Note : ${"★".repeat(detail.note)}${"☆".repeat(5 - detail.note)} (${detail.note}/5)`)
      const neg = tagsNegatifsDe(detail).map(tagLabel)
      lignes.push(`Motifs : ${neg.length > 0 ? neg.join(", ") : "—"}`)
      lignes.push(`Commentaire : ${detail.commentaire?.trim() || "(aucun commentaire)"}`)
      lignes.push("Action requise : vérifier le service.")
      lignes.push("- Management FeedbackPro")
      return lignes.join("\n")
    })()
    const lienWhatsapp =
      numeroWhatsapp.length > 0
        ? `https://api.whatsapp.com/send?phone=${numeroWhatsapp}&text=${encodeURIComponent(messageWhatsapp)}&type=phone_number&app_absent=0`
        : null

    // Stats rapides (colonne droite) : zone la plus touchée + tendance hebdo
    const zoneTouchee = zoneLaPlusTouchee(detail, items)
    const tendance = recurrence.tagFrequent ? evolutionTag(recurrence.tagFrequent, items) : null

    // NOUVEAU : Niveau IA (crise / mitigé / positif) + config visuelle du Coach IA
    // Task 1 : le niveau provient du LLM si disponible, sinon du fallback heuristique.
    const niveau = recoEffective.niveau
    const cfgNiveau = NIVEAU_IA_CONFIG[niveau]

    // Phrase de contexte affichée dans l'en-tête sticky (NIVEAU 1) selon la note
    const phraseContexte =
      niveau === "crise"
        ? "Client mécontent — Risque d'avis négatif public"
        : niveau === "mitige"
          ? "Expérience mitigée — Points de friction à adresser"
          : "Client satisfait — Opportunité de fidélisation et d'avis Google"

    // Initiales de l'employé pour l'avatar
    const initialesEmploye = (() => {
      const nom = detail.employe?.nom ?? detail.personnelMentionne ?? ""
      return nom
        .split(" ")
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    })()

    return (
      <div className="space-y-5">
        {/* Bouton retour (au-dessus du sticky header) */}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fermerDetail} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour à la liste
          </Button>
        </div>

        {/* ============ NIVEAU 1 — En-tête Sticky (toujours visible au scroll) ============ */}
        <div className="sticky top-0 z-20 rounded-3xl border bg-card/95 backdrop-blur shadow-md">
          <div className="p-4 sm:p-5 space-y-3">
            {/* Ligne 1 : note + zone + date + badge urgence (à droite) */}
            <div className="flex flex-wrap items-center gap-2">
              <Stars note={detail.note} size={18} />
              <span className="text-sm font-semibold tabular-nums">{detail.note}/5</span>
              <span className="text-muted-foreground">•</span>
              {detail.zone?.nom ? (
                <Badge variant="outline" className="h-6 gap-1 px-2 text-xs font-normal">
                  <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
                  {detail.zone.nom}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Zone non précisée</span>
              )}
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground" title={formatDate(detail.createdAt)}>
                {formatRelative(detail.createdAt)}
              </span>
              {!detail.lu && (
                <Badge className="h-5 gap-0.5 border border-blue-300 bg-blue-500 px-1.5 text-[10px] font-semibold text-white shadow-sm shadow-blue-500/30">
                  <span aria-hidden>✨</span>
                  Nouveau
                </Badge>
              )}
              {typeof detail.nps === "number" && (
                <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal" title="Net Promoter Score (0-10)">
                  NPS {detail.nps}/10
                  {(detail.nps ?? 0) >= 9 ? " 🟢" : (detail.nps ?? 0) >= 7 ? " 🟡" : " 🔴"}
                </Badge>
              )}
              {/* Badge d'urgence aligné à droite (couleur selon la note) */}
              <Badge
                variant="outline"
                className={cn("ml-auto h-6 px-2 text-xs font-semibold", cfgUrgence.badge)}
                title={recurrence.count >= 2 && recurrence.libelleTag ? `${ordinalFr(recurrence.count)} signalement « ${recurrence.libelleTag} » ce mois` : undefined}
              >
                <span aria-hidden>{cfgUrgence.emoji}</span>
                {urgence === "urgent" ? "URGENT" : urgence === "atraiter" ? "À TRAITER" : urgence === "mitige" ? "MITIGÉ" : "POSITIF"}
              </Badge>
            </div>

            {/* Ligne 2 : phrase de contexte selon la note (spécification Dashboard d'Urgence) */}
            <p className="text-sm font-medium text-foreground">
              {phraseContexte}
            </p>

            {/* Ligne 3 : 3 boutons d'action rapide (Répondre / WhatsApp / Marquer résolu) */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={editionReponse ? "default" : "outline"}
                className="h-10 gap-1.5 transition-transform hover:scale-105"
                onClick={() => {
                  setTexteReponse(detail.reponsePro || "")
                  setEditionReponse(true)
                  setTimeout(() => reponseRef.current?.focus(), 50)
                }}
              >
                <MessageSquareReply className="h-4 w-4" aria-hidden />
                <span>Répondre</span>
              </Button>
              {lienWhatsapp && (
                <a href={lienWhatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex">
                  <Button variant="outline" className="h-10 gap-1.5 transition-transform hover:scale-105" type="button">
                    <Smartphone className="h-4 w-4" aria-hidden />
                    <span>WhatsApp équipe</span>
                  </Button>
                </a>
              )}
              {detail.statut !== "RESOLVED" ? (
                <Button
                  variant="ghost"
                  className="h-10 gap-1.5 ml-auto text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  onClick={() => majRetour(detail.id, { statut: "RESOLVED", lu: true })}
                >
                  <CheckCheck className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Marquer résolu</span>
                  <span className="sm:hidden">Résolu</span>
                </Button>
              ) : (
                <Badge
                  variant="outline"
                  className="ml-auto h-9 gap-1 px-3 text-xs font-medium border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Résolu
                </Badge>
              )}
              {/* Bouton supprimer */}
              <Button
                variant="ghost"
                className="h-10 gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                onClick={() => setConfirmSuppression(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Supprimer</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ============ NIVEAU 2 — Coach IA (mise en avant maximale, juste sous le header) ============
            Fond dégradé selon l'urgence : rouge bordeaux (1-2★), ambre/orange (3★), vert (4-5★).
            CRITIQUE : les recommandations (recoIA.actions / contexte / impact) sont adaptées à la
            note via genererRecommandationIA() — plus de recommandations positives sur un 2/5. */}
        <div ref={iaRef} className="scroll-mt-24">
          <Card className={cn("rounded-3xl border-none text-white shadow-lg bg-gradient-to-br", cfgNiveau.gradient)}>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {/* Header : icône + titre + badge niveau (Urgent/Crise, Mitigé, Positif) */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15" aria-hidden>
                  <Bot className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold">🧠 Recommandation du Coach IA</h3>
                <Badge variant="outline" className={cn("ml-auto h-6 border-white/30 px-2 text-xs font-semibold text-white", cfgNiveau.badgeBg)}>
                  <span aria-hidden>{cfgNiveau.emoji}</span>
                  {cfgNiveau.label}
                </Badge>
              </div>

              {/* Diagnostic (phrase adaptée à la note) */}
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  🔍 Diagnostic
                </p>
                <p className="text-sm leading-relaxed">{recoEffective.diagnostic}</p>
              </div>

              {/* Tendance / mini-graphique (uniquement si récurrence ≥ 2) */}
              {recurrence.count >= 2 && (
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/90">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                    Tendance sur 30 jours
                  </p>
                  <MiniGraphiqueRecurrence
                    retourCourant={detail}
                    tous={items}
                    tagFrequent={recurrence.tagFrequent}
                  />
                </div>
              )}

              {/* Actions prioritaires (adaptées à la note) */}
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                  👉 Actions prioritaires
                </p>
                <ol className="space-y-2">
                  {recoEffective.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-white/95">{a}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Impact attendu */}
              <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                <p className="flex items-start gap-1.5 text-sm font-medium">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="text-[10px] uppercase tracking-wide text-white/70">📈 Impact prévu — </span>
                    {recoEffective.impact}
                  </span>
                </p>
              </div>

              {/* Bouton Appliquer → pré-remplit le formulaire d'action managériale */}
              <Button
                type="button"
                className="w-full gap-1.5 bg-white text-foreground hover:bg-white/90"
                onClick={() =>
                  appliquerRecommandationsIA({
                    ...recoIA,
                    niveau: recoEffective.niveau,
                    contexte: recoEffective.diagnostic,
                    actions: recoEffective.actions,
                    impact: recoEffective.impact,
                  })
                }
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Appliquer ces recommandations
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>

              {/* Task 1 — Indicateur de source (LLM ou heuristique) + état de chargement */}
              <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-white/70">
                {recoLLMLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    <span>Coach IA en cours d'analyse…</span>
                  </>
                ) : recoEffective.source === "ia" ? (
                  <>
                    <Sparkles className="h-3 w-3" aria-hidden />
                    <span>Recommandation générée par le Coach IA (LLM)</span>
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-3 w-3" aria-hidden />
                    <span>Analyse heuristique (LLM indisponible — fallback local)</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============ NIVEAU 3 — Détails & Historique (section repliable par défaut) ============
            Repliée par défaut : le Coach IA (NIVEAU 2) reste le focus visuel.
            Contient : tags (visibles !), zone, employé, commentaire, photo, contexte, timeline. */}
        <Card className="rounded-3xl shadow-sm">
          <Collapsible open={detailsOuverts} onOpenChange={setDetailsOuverts}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-3xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                aria-expanded={detailsOuverts}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />
                  📋 Détails du retour
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {detailsOuverts ? "Replier" : "Déplier"}
                  {detailsOuverts ? (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  )}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-5 border-t px-4 pt-5 sm:px-5">
                {/* Tags associés (VISIBLES — c'était un des bugs : ils n'apparaissaient pas) */}
                {detail.tags.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Target className="h-3.5 w-3.5" aria-hidden />
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.tags.map((t) => {
                        const neg = SET_NEGATIFS.has(t)
                        const pos = SET_POSITIFS.has(t)
                        return (
                          <span
                            key={t}
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              neg
                                ? "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                                : pos
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  : "border-border bg-muted text-muted-foreground"
                            )}
                            title={tagLabel(t)}
                          >
                            <span className="truncate">{tagLabel(t)}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Zone + Employé (grille 2 colonnes sur desktop) */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Zone + note moyenne */}
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Zone
                    </p>
                    {detail.zone?.nom ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{detail.zone.nom}</p>
                        {noteZone !== null && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Stars note={noteZone} size={12} />
                            <span>
                              note moy. <span className="font-medium text-foreground">{noteZone.toFixed(2)}/5</span>
                            </span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Non précisée</p>
                    )}
                  </div>

                  {/* Employé (nom cliquable → Dialog historique) */}
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <User className="h-3.5 w-3.5" aria-hidden />
                      Employé
                    </p>
                    {(() => {
                      const emp = detail.employe?.nom ?? null
                      const pers = detail.personnelMentionne ?? null
                      const nomCliquable = emp || pers
                      if (!nomCliquable) {
                        return <p className="text-sm text-muted-foreground">Non spécifié</p>
                      }
                      const statsDispos = statsEmploye(nomCliquable, items) !== null
                      return (
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {initialesEmploye || "?"}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{emp ?? pers}</p>
                            {pers && emp && pers !== emp && (
                              <p className="truncate text-xs text-muted-foreground">Mentionné : {pers}</p>
                            )}
                            <button
                              type="button"
                              onClick={() => statsDispos && setDialogEmployeNom(nomCliquable)}
                              disabled={!statsDispos}
                              className={cn(
                                "mt-0.5 inline-flex items-center gap-1 text-xs",
                                statsDispos
                                  ? "text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                                  : "text-muted-foreground cursor-default"
                              )}
                              title={statsDispos ? "Voir l'historique de l'employé" : undefined}
                            >
                              <GraduationCap className="h-3 w-3" aria-hidden />
                              Voir le profil
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Commentaire client */}
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
                    Commentaire client
                  </p>
                  {detail.commentaire ? (
                    <blockquote className="border-l-4 border-primary/30 bg-muted/40 px-4 py-3 text-sm italic leading-relaxed">
                      &ldquo;{detail.commentaire}&rdquo;
                    </blockquote>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">Aucun commentaire</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Reçu {canalLabel(detail.canalChoisi)} · {formatDate(detail.createdAt)}
                  </p>
                </div>

                {/* Photo jointe (avec zoom au clic → Dialog plein écran) */}
                {detail.photoUrl && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Camera className="h-3.5 w-3.5" aria-hidden />
                      Photo jointe par le client
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhotoZoom(true)}
                      className="group relative block w-full max-w-xs overflow-hidden rounded-2xl border"
                    >
                      <img
                        src={detail.photoUrl}
                        alt="Photo jointe au retour par le client"
                        className="max-h-64 w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          <ZoomIn className="h-5 w-5" aria-hidden />
                        </span>
                      </span>
                    </button>
                  </div>
                )}

                {/* Contexte : récurrence + tendance zone + zone la plus touchée + catégorie/canal/statut */}
                <div className="rounded-2xl border bg-muted/30 p-3 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    📊 Contexte
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • {recurrence.count >= 2
                      ? `${ordinalFr(recurrence.count)} signalement similaire ce mois`
                      : "1er signalement similaire ce mois"}
                    {recurrence.libelleTag ? ` (« ${recurrence.libelleTag} »)` : ""}
                  </p>
                  {detail.zone?.nom && (
                    <p className="text-xs text-muted-foreground">
                      • Tendance zone {detail.zone.nom} :{" "}
                      {tendance
                        ? tendance.nouveau
                          ? "🆕 nouveau vs semaine dernière"
                          : tendance.pct > 0
                            ? `↗️ +${tendance.pct}% vs semaine dernière`
                            : tendance.pct < 0
                              ? `↘️ ${tendance.pct}% vs semaine dernière`
                              : "→ stable vs semaine dernière"
                        : "—"}
                    </p>
                  )}
                  {zoneTouchee && (
                    <p className="text-xs text-muted-foreground">
                      • Zone la plus touchée (30 j) :{" "}
                      <span className="font-medium text-foreground">{zoneTouchee.nom}</span>{" "}
                      ({zoneTouchee.count} signalement{zoneTouchee.count > 1 ? "s" : ""})
                    </p>
                  )}
                  <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                    <span>• Catégorie IA : <span className="font-medium text-foreground capitalize">{recoIA.categorie}</span></span>
                    <span>· Canal : <span className="font-medium text-foreground">{canalLabel(detail.canalChoisi)}</span></span>
                    <span>· Statut :</span>
                    <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px] align-middle", statutBadgeClass(detail.statut))}>
                      {STATUT_RETOUR_LABEL[detail.statut] ?? detail.statut}
                    </Badge>
                  </p>
                </div>

                {/* Timeline : historique des statuts/actions */}
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    🕐 Timeline
                  </p>
                  {historiqueAffiche.length > 0 ? (
                    <ol>
                      {historiqueAffiche.map((h, i) => (
                        <li key={`${h.statut}-${h.at}-${i}`} className="relative flex items-start gap-2.5 pb-4 last:pb-0">
                          {i < historiqueAffiche.length - 1 && (
                            <span className="absolute top-4 bottom-0 left-[6px] w-px bg-border" aria-hidden />
                          )}
                          <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${pastilleClass(h.statut)}`} aria-hidden />
                          <div className="min-w-0 text-xs">
                            <Badge variant="outline" className={`h-5 px-1.5 text-[11px] ${statutBadgeClass(h.statut)}`}>
                              {STATUT_RETOUR_LABEL[h.statut] ?? h.statut}
                            </Badge>
                            <p className="mt-1 text-muted-foreground">{formatDate(h.at)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Aucun historique</p>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* ---------- Formulaire de réponse (pleine largeur) ---------- */}
        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <MessageSquareReply className="h-4 w-4 text-primary" aria-hidden />
                Réponse au client
              </h3>
              {detail.emailClient ? (
                <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal text-blue-700 dark:text-blue-300">
                  <Send className="h-3 w-3" aria-hidden />
                  {detail.emailClient}
                </Badge>
              ) : (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-normal text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Pas d'email client
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Le client n'a pas laissé d'email — la réponse sera conservée en interne.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {editionReponse ? (
              <div className="space-y-2">
                {/* 3 templates de réponse IA */}
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Suggestions de réponses IA
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {templatesReponse.map((tpl, i) => (
                      <Button
                        key={i}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => {
                          setTexteReponse(tpl)
                          setTimeout(() => reponseRef.current?.focus(), 30)
                        }}
                      >
                        <Sparkles className="h-3 w-3" aria-hidden />
                        Template {i + 1}
                      </Button>
                    ))}
                  </div>
                </div>
                <Textarea
                  ref={reponseRef}
                  id="reponse-pro"
                  rows={4}
                  value={texteReponse}
                  onChange={(e) => setTexteReponse(e.target.value)}
                  placeholder={
                    detail.emailClient
                      ? "Votre réponse sera envoyée par email au client."
                      : "Réponse conservée en interne (le client n'a pas laissé d'email)."
                  }
                  aria-label="Votre réponse"
                />
                <div className="flex justify-end gap-2">
                  {detail.reponsePro && (
                    <Button
                      variant="ghost"
                      className="h-10"
                      onClick={() => { setTexteReponse(detail.reponsePro || ""); setEditionReponse(false) }}
                    >
                      Annuler
                    </Button>
                  )}
                  <Button
                    className="h-10 px-4"
                    onClick={enregistrerReponse}
                    disabled={envoiReponse || !texteReponse.trim()}
                  >
                    {envoiReponse && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    {detail.emailClient ? "Envoyer la réponse" : "Enregistrer"}
                  </Button>
                </div>
              </div>
            ) : detail.reponsePro ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail.reponsePro}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-9"
                  onClick={() => { setTexteReponse(detail.reponsePro || ""); setEditionReponse(true) }}
                >
                  <MessageSquareReply className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Modifier la réponse
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="h-10"
                onClick={() => { setTexteReponse(""); setEditionReponse(true) }}
              >
                <MessageSquareReply className="mr-1.5 h-4 w-4" aria-hidden />
                {detail.emailClient ? "Rédiger une réponse" : "Consigner une réponse interne"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ---------- Formulaire d'action managériale (pleine largeur) ---------- */}
        <div ref={actionFormRef} className="scroll-mt-24">
          <Card className="rounded-3xl shadow-sm">
            <CardContent className="p-4 sm:p-6 space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />
                Action managériale prise
              </h3>
              {editionAction ? (
                <div className="space-y-3">
                  <Textarea
                    ref={actionRef}
                    id="action-prise"
                    rows={4}
                    value={texteAction}
                    onChange={(e) => setTexteAction(e.target.value)}
                    placeholder="Ex : Recadrage verbal, formation produit programmée, réorganisation du créneau du soir…"
                    aria-label="Action managériale prise"
                  />
                  {/* Choix du statut dans le même formulaire (workflow unifié) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="action-statut" className="text-xs text-muted-foreground">
                      Nouveau statut
                    </Label>
                    <Select
                      value={texteActionStatut}
                      onValueChange={(v) => setTexteActionStatut(v as StatutRetour)}
                    >
                      <SelectTrigger id="action-statut" className="h-9 w-44" aria-label="Nouveau statut">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW">Nouveau</SelectItem>
                        <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                        <SelectItem value="RESOLVED">Résolu</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {texteActionStatut !== detail.statut
                        ? `Le statut passera de « ${STATUT_RETOUR_LABEL[detail.statut] ?? detail.statut} » à « ${STATUT_RETOUR_LABEL[texteActionStatut] ?? texteActionStatut} » à l'enregistrement.`
                        : "Le statut reste inchangé."}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    {detail.actionPrise && (
                      <Button
                        variant="ghost"
                        className="h-10"
                        onClick={() => {
                          setTexteAction(detail.actionPrise || "")
                          setTexteActionStatut(detail.statut === "NEW" ? "IN_PROGRESS" : detail.statut)
                          setEditionAction(false)
                        }}
                      >
                        Annuler
                      </Button>
                    )}
                    <Button
                      className="h-10 px-4"
                      onClick={enregistrerAction}
                      disabled={envoiAction || !texteAction.trim()}
                    >
                      {envoiAction && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                      Enregistrer l&apos;action et le statut
                    </Button>
                  </div>
                </div>
              ) : detail.actionPrise ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail.actionPrise}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-9"
                    onClick={() => {
                      setTexteAction(detail.actionPrise || "")
                      setTexteActionStatut(detail.statut === "NEW" ? "IN_PROGRESS" : detail.statut)
                      setEditionAction(true)
                    }}
                  >
                    <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Modifier l&apos;action
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    setTexteAction("")
                    setTexteActionStatut(detail.statut === "NEW" ? "IN_PROGRESS" : detail.statut)
                    setEditionAction(true)
                  }}
                >
                  <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden />
                  Consigner une action managériale
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- Bouton retour bas de page ---------- */}
        <div className="flex justify-end">
          <Button variant="outline" className="h-10" onClick={fermerDetail}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Retour à la liste
          </Button>
        </div>

        {/* ---------- Dialog historique de l'employé ---------- */}
        <Dialog open={dialogEmployeNom !== null} onOpenChange={(o) => !o && setDialogEmployeNom(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" aria-hidden />
                Historique de l&apos;employé
              </DialogTitle>
              <DialogDescription>
                Statistiques calculées sur les retours chargés dans le tableau.
              </DialogDescription>
            </DialogHeader>
            {dialogEmployeNom && statsEmp ? (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-base font-semibold">{statsEmp.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {statsEmp.total} retour{statsEmp.total > 1 ? "s" : ""} · moyenne{" "}
                      <span className="font-medium text-foreground">{statsEmp.moyenne.toFixed(2)}/5</span>
                    </p>
                  </div>
                </div>

                {/* Score moyen visualisé */}
                <div className="rounded-lg border bg-card p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Score moyen</p>
                  <div className="flex items-center gap-2">
                    <Stars note={statsEmp.moyenne} size={16} />
                    <span className="text-sm font-medium">{statsEmp.moyenne.toFixed(2)}/5</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Points forts */}
                  <div className="rounded-lg border bg-card p-3">
                    <p className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Points forts
                    </p>
                    {statsEmp.pointsForts.length > 0 ? (
                      <ul className="space-y-1.5">
                        {statsEmp.pointsForts.map((p) => (
                          <li key={p.tag} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{p.label}</span>
                            <Badge variant="outline" className="h-5 shrink-0 border-emerald-300 bg-emerald-50 px-1.5 text-[10px] text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                              ×{p.count}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">Aucun tag positif signalé.</p>
                    )}
                  </div>

                  {/* Points faibles */}
                  <div className="rounded-lg border bg-card p-3">
                    <p className="mb-2 text-xs font-medium text-rose-700 dark:text-rose-400">
                      Points faibles
                    </p>
                    {statsEmp.pointsFaibles.length > 0 ? (
                      <ul className="space-y-1.5">
                        {statsEmp.pointsFaibles.map((p) => (
                          <li key={p.tag} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">{p.label}</span>
                            <Badge variant="outline" className="h-5 shrink-0 border-rose-300 bg-rose-50 px-1.5 text-[10px] text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300">
                              ×{p.count}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">Aucun tag négatif signalé.</p>
                    )}
                  </div>
                </div>

                {/* Formations recommandées */}
                <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                    Formations recommandées par l&apos;IA
                  </p>
                  {statsEmp.formations.length > 0 ? (
                    <ul className="space-y-1.5">
                      {statsEmp.formations.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{f}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      Aucune formation recommandée — aucun tag négatif détecté sur cet employé.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée disponible pour cet employé.</p>
            )}
          </DialogContent>
        </Dialog>

        {/* ---------- Dialog zoom photo (plein écran) ---------- */}
        <Dialog open={photoZoom} onOpenChange={setPhotoZoom}>
          <DialogContent className="sm:max-w-4xl p-0 border-none bg-black/90">
            <DialogHeader className="sr-only">
              <DialogTitle>Photo jointe au retour</DialogTitle>
              <DialogDescription>Photo agrandie</DialogDescription>
            </DialogHeader>
            {detail.photoUrl && (
              <img
                src={detail.photoUrl}
                alt="Photo jointe au retour par le client"
                className="max-h-[85vh] w-full object-contain"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* ---------- Dialog confirmation suppression ---------- */}
        <Dialog open={confirmSuppression} onOpenChange={(o) => !o && setConfirmSuppression(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-rose-600" />
                Supprimer ce retour ?
              </DialogTitle>
              <DialogDescription>
                Cette action est irréversible. Le retour client (note, tags, commentaire, photo) sera définitivement supprimé de votre dashboard et de vos statistiques.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setConfirmSuppression(false)} disabled={suppressionEnCours}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={supprimerRetour}
                disabled={suppressionEnCours}
                className="gap-1.5"
              >
                {suppressionEnCours ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Supprimer définitivement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Retours clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} retour{total > 1 ? "s" : ""} collecté{total > 1 ? "s" : ""} via vos QR codes — votre inbox intelligente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => load()}
            disabled={loading}
            aria-label="Rafraîchir"
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} aria-hidden />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* ---------- 1. Résumé IA Coach (en haut, avant les filtres) ---------- */}
      {resumeIA.length > 0 && !loading && (
        <div className="animate-fadeIn">
          <ResumeCoachIA
            items={items}
            onVoirRapport={ouvrirCoachIA}
            onFiltrerTag={filtrerParTag}
            onVoirEmploye={voirEmploye}
          />
        </div>
      )}

      {/* ---------- 2. Filtres intelligents (pills) ---------- */}
      <Card className="rounded-3xl shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          {/* Ligne 1 : pills dropdowns (Zone / Employé / Note / Statut / Tag) */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fZone} onValueChange={(v) => { setPage(1); setFZone(v) }}>
              <SelectTrigger className="h-9 w-auto min-w-32 gap-1.5 rounded-full" aria-label="Filtrer par zone">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={fEmploye || "all"}
              onValueChange={(v) => { setPage(1); setFEmploye(v === "all" ? "" : v) }}
            >
              <SelectTrigger className="h-9 w-auto min-w-32 gap-1.5 rounded-full" aria-label="Filtrer par employé">
                <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <SelectValue placeholder="Employé" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les employés</SelectItem>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom}
                    {e.actif === false ? " (inactif)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fNote} onValueChange={(v) => { setPage(1); setFNote(v) }}>
              <SelectTrigger className="h-9 w-auto min-w-32 gap-1.5 rounded-full" aria-label="Filtrer par note">
                <span className="text-sm">★</span>
                <SelectValue placeholder="Note" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes notes</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {"★".repeat(n)} ({n}/5)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fStatut} onValueChange={(v) => { setPage(1); setFStatut(v); setFRapide("all") }}>
              <SelectTrigger className="h-9 w-auto min-w-32 gap-1.5 rounded-full" aria-label="Filtrer par statut">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="NEW">Nouveau</SelectItem>
                <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                <SelectItem value="RESOLVED">Résolu</SelectItem>
              </SelectContent>
            </Select>

            <Select value={fTag} onValueChange={(v) => { setPage(1); setFTag(v) }}>
              <SelectTrigger className="h-9 w-auto min-w-32 gap-1.5 rounded-full" aria-label="Filtrer par tag">
                <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les tags</SelectItem>
                {ALL_TAGS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {`${t.emoji} ${t.label}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Dates (Du / Au) */}
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={fDu}
                onChange={(e) => { setPage(1); setFDu(e.target.value); setFTemporel("all") }}
                className="h-9 w-auto min-w-32 text-muted-foreground"
                aria-label="Date de début"
              />
              <Input
                type="date"
                value={fAu}
                onChange={(e) => { setPage(1); setFAu(e.target.value); setFTemporel("all") }}
                className="h-9 w-auto min-w-32 text-muted-foreground"
                aria-label="Date de fin"
              />
              {(datesActives || fTemporel !== "all") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => { setPage(1); setFDu(""); setFAu(""); setFTemporel("all") }}
                  aria-label="Réinitialiser les dates"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>

            {(fZone !== "all" || fEmploye || fNote !== "all" || fStatut !== "all" || fTag !== "all" || fRapide !== "all" || fTemporel !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-xs"
                onClick={() => {
                  setPage(1)
                  setFZone("all")
                  setFEmploye("")
                  setFNote("all")
                  setFStatut("all")
                  setFTag("all")
                  setFRapide("all")
                  setFTemporel("all")
                  setFDu("")
                  setFAu("")
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Tout réinitialiser
              </Button>
            )}
          </div>

          {/* Ligne 2 : Filtres rapides (urgents / à traiter / résolus) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filtres rapides :</span>
            <button
              type="button"
              onClick={() => setFRapide(fRapide === "urgent" ? "all" : "urgent")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                fRapide === "urgent"
                  ? "bg-[#002e85] text-white dark:bg-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              🔴 Urgents
              <span className={cn(
                "rounded-full px-1.5 text-[10px]",
                fRapide === "urgent" ? "bg-white/20" : "bg-background"
              )}>
                {compteurs.urgents}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFRapide(fRapide === "inprogress" ? "all" : "inprogress")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                fRapide === "inprogress"
                  ? "bg-[#002e85] text-white dark:bg-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              🟡 À traiter
              <span className={cn(
                "rounded-full px-1.5 text-[10px]",
                fRapide === "inprogress" ? "bg-white/20" : "bg-background"
              )}>
                {compteurs.enCours}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFRapide(fRapide === "resolved" ? "all" : "resolved")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                fRapide === "resolved"
                  ? "bg-[#002e85] text-white dark:bg-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              🟢 Résolus
              <span className={cn(
                "rounded-full px-1.5 text-[10px]",
                fRapide === "resolved" ? "bg-white/20" : "bg-background"
              )}>
                {compteurs.resolus}
              </span>
            </button>

            <span className="mx-1 h-4 w-px bg-border" aria-hidden />

            {/* Ligne 3 : Filtres temporels */}
            <span className="text-xs font-medium text-muted-foreground">Période :</span>
            {([
              { id: "today" as const, label: "Aujourd'hui" },
              { id: "week" as const, label: "Cette semaine" },
              { id: "month" as const, label: "Ce mois" },
            ]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFTemporel(fTemporel === opt.id ? "all" : opt.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  fTemporel === opt.id
                    ? "bg-[#002e85] text-white dark:bg-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {opt.label}
              </button>
            ))}

            {/* Toggle regroupement (à droite) */}
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="grouper-similaires" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground cursor-pointer">
                <Layers className="h-3.5 w-3.5" aria-hidden />
                Regrouper les similaires
              </Label>
              <Switch
                id="grouper-similaires"
                checked={grouperSimilaires}
                onCheckedChange={setGrouperSimilaires}
                aria-label="Activer le regroupement des retours similaires"
              />
            </div>
          </div>

          {/* Ligne info + export */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              {itemsFiltresClient.length} retour{itemsFiltresClient.length > 1 ? "s" : ""} affiché{itemsFiltresClient.length > 1 ? "s" : ""}
              {total > PAGE_SIZE ? ` — page ${page}/${nbPages}` : ""}
              {fRapide === "urgent" && " (filtre urgent actif)"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() =>
                  exportToCsv(
                    `retours-${new Date().toISOString().slice(0, 10)}`,
                    items.map((r) => ({
                      Date: formatDate(r.createdAt),
                      Note: r.note,
                      Zone: r.zone?.nom ?? "",
                      Tags: r.tags.map(tagLabel).join(", "),
                      Employe: r.employe?.nom ?? r.personnelMentionne ?? "",
                      Commentaire: r.commentaire ?? "",
                      EmailClient: r.emailClient ?? "",
                      Canal: r.canalChoisi ?? "",
                      Statut: STATUT_RETOUR_LABEL[r.statut] ?? r.statut,
                      Lu: r.lu ? "Oui" : "Non",
                      ReponsePro: r.reponsePro ?? "",
                    }))
                  )
                }
                disabled={items.length === 0}
                aria-label="Exporter en CSV (page courante)"
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Exporter CSV
              </Button>
              <a href="/api/pro/retours/export" download className="hidden sm:block">
                <Button variant="ghost" size="sm" className="h-9 px-3 text-xs">
                  Exporter tout (serveur)
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 3. Cards de retours ---------- */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-3xl" />
          ))}
        </div>
      ) : itemsFiltresClient.length === 0 ? (
        // Empty state soigné
        <Card className="rounded-3xl shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted" aria-hidden>
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">Aucun retour ne correspond à ces filtres</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Essayez d&apos;élargir la période ou de sélectionner « Toutes les zones ».
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 animate-fadeIn">
          {/* Mode regroupement : d'abord les groupes, puis les singletons */}
          {grouperSimilaires && groupes.length > 0 && (
            <>
              {groupes.map((g) => {
                const cleGroupe = `${g.cle}__${g.zone ?? "_"}`
                return (
                  <GroupeCartes
                    key={cleGroupe}
                    groupe={g}
                    deploye={groupesDeployes.has(cleGroupe)}
                    onToggle={() =>
                      setGroupesDeployes((prev) => {
                        const next = new Set(prev)
                        if (next.has(cleGroupe)) next.delete(cleGroupe)
                        else next.add(cleGroupe)
                        return next
                      })
                    }
                    onVoir={ouvrirDetail}
                    onRepondre={ouvrirReponse}
                    onResoudre={(r) => majRetour(r.id, { statut: "RESOLVED", lu: true })}
                    onFiltrerTag={filtrerParTag}
                    onVoirEmploye={voirEmploye}
                  />
                )
              })}
            </>
          )}

          {/* Cards individuelles (ou tous les retours si pas de regroupement) */}
          {(grouperSimilaires ? retoursSeuls : itemsFiltresClient).map((r) => (
            <CarteRetour
              key={r.id}
              r={r}
              recurrence={recurrenceParRetour.get(r.id) ?? { count: 0, libelleTag: null }}
              onVoir={() => ouvrirDetail(r)}
              onRepondre={() => ouvrirReponse(r)}
              onResoudre={() => majRetour(r.id, { statut: "RESOLVED", lu: true })}
              onFiltrerTag={filtrerParTag}
              onVoirEmploye={voirEmploye}
            />
          ))}
        </div>
      )}

      {/* ---------- Pagination ---------- */}
      {nbPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} / {nbPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= nbPages} onClick={() => setPage((p) => p + 1)}>
            Suivant
          </Button>
        </div>
      )}

      {/* ---------- Dialog historique de l'employé (depuis liste) ---------- */}
      <Dialog open={dialogEmployeNom !== null} onOpenChange={(o) => !o && setDialogEmployeNom(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" aria-hidden />
              Historique de l&apos;employé
            </DialogTitle>
            <DialogDescription>
              Statistiques calculées sur les retours chargés dans le tableau.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const stats = dialogEmployeNom ? statsEmploye(dialogEmployeNom, items) : null
            if (dialogEmployeNom && stats) {
              return (
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-base font-semibold">{stats.nom}</p>
                      <p className="text-xs text-muted-foreground">
                        {stats.total} retour{stats.total > 1 ? "s" : ""} · moyenne{" "}
                        <span className="font-medium text-foreground">{stats.moyenne.toFixed(2)}/5</span>
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Score moyen</p>
                    <div className="flex items-center gap-2">
                      <Stars note={stats.moyenne} size={16} />
                      <span className="text-sm font-medium">{stats.moyenne.toFixed(2)}/5</span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-card p-3">
                      <p className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">Points forts</p>
                      {stats.pointsForts.length > 0 ? (
                        <ul className="space-y-1.5">
                          {stats.pointsForts.map((p) => (
                            <li key={p.tag} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate">{p.label}</span>
                              <Badge variant="outline" className="h-5 shrink-0 border-emerald-300 bg-emerald-50 px-1.5 text-[10px] text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                                ×{p.count}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">Aucun tag positif signalé.</p>
                      )}
                    </div>
                    <div className="rounded-lg border bg-card p-3">
                      <p className="mb-2 text-xs font-medium text-rose-700 dark:text-rose-400">Points faibles</p>
                      {stats.pointsFaibles.length > 0 ? (
                        <ul className="space-y-1.5">
                          {stats.pointsFaibles.map((p) => (
                            <li key={p.tag} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate">{p.label}</span>
                              <Badge variant="outline" className="h-5 shrink-0 border-rose-300 bg-rose-50 px-1.5 text-[10px] text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300">
                                ×{p.count}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm italic text-muted-foreground">Aucun tag négatif signalé.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                      Formations recommandées par l&apos;IA
                    </p>
                    {stats.formations.length > 0 ? (
                      <ul className="space-y-1.5">
                        {stats.formations.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{f}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        Aucune formation recommandée — aucun tag négatif détecté sur cet employé.
                      </p>
                    )}
                  </div>
                </div>
              )
            }
            return <p className="text-sm text-muted-foreground">Aucune donnée disponible pour cet employé.</p>
          })()}
        </DialogContent>
      </Dialog>

    </div>
  )
}
