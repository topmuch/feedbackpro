"use client"

// ============================================================
// FeedbackPro - Onglet "Retours clients" du dashboard Pro (pivot Zones)
// Tableau filtrable (note, zone, employé, statut, tag, dates) + pagination +
// modale de détail : réponse Pro éditable, action managériale éditable,
// timeline de l'historique des statuts
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Stars, formatDate } from "@/components/feedbackpro/shared"
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

type RecommandationIA = {
  categorie: CategorieIA
  probleme: string
  contexte: string
  recurrence: { count: number; tagFrequent: string | null; libelleTag: string | null }
  actions: string[]
  impact: string
}

/**
 * Construit la recommandation IA d'un retour à partir des données chargées.
 * Pure : aucun effet de bord, aucun appel réseau.
 */
function genererRecommandationIA(retour: Retour, tous: Retour[]): RecommandationIA {
  const categorie = categorieDominante(retour)
  const recurrence = compterRecurrence(retour, tous)
  const actions = genererActions(categorie)
  const impact = impactEstime(categorie)
  const libelleTag = recurrence.libelleTag
  const contexte =
    recurrence.count >= 2 && libelleTag
      ? `${ordinalFr(recurrence.count)} signalement « ${libelleTag} » ces 30 derniers jours.`
      : retour.note <= 2
        ? "Premier signalement de ce type — réagir vite pour éviter la récurrence."
        : "Retour isolé — surveiller l'évolution sur les prochains jours."
  return {
    categorie,
    probleme: LIBELLE_PROBLEME[categorie],
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
  if (statut === "RESOLVED") return "border-green-300 bg-green-50 text-green-800"
  if (statut === "IN_PROGRESS") return "border-amber-300 bg-amber-50 text-amber-800"
  return "border-rose-300 bg-rose-50 text-rose-800"
}

/** Couleur de la pastille de la timeline de suivi */
function pastilleClass(statut: string): string {
  if (statut === "RESOLVED") return "bg-green-500"
  if (statut === "IN_PROGRESS") return "bg-amber-500"
  return "bg-rose-500"
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
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 tabular-nums">
                {b.count > 0 ? b.count : ""}
              </span>
              <div
                className={cn(
                  "w-full rounded-t-sm transition-all",
                  estActuel
                    ? "bg-amber-500 dark:bg-amber-400"
                    : "bg-amber-300/70 dark:bg-amber-700/70"
                )}
                style={{ height: `${Math.max(2, hauteurPct)}%` }}
                title={`${b.count} retour(s) — ${b.label}`}
              />
              <span className="text-[9px] text-muted-foreground">{b.label}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-200">
        {total} retour{total > 1 ? "s" : ""} similaire{total > 1 ? "s" : ""}
        {tagFrequent ? ` « ${tagLabel(tagFrequent)} »` : ""} sur les 30 derniers jours.
      </p>
    </div>
  )
}

export function RetoursTab() {
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

  // Modale de détail
  const [detail, setDetail] = useState<Retour | null>(null)
  const [editionReponse, setEditionReponse] = useState(false)
  const [texteReponse, setTexteReponse] = useState("")
  const [envoiReponse, setEnvoiReponse] = useState(false)
  const [editionAction, setEditionAction] = useState(false)
  const [texteAction, setTexteAction] = useState("")
  const [envoiAction, setEnvoiAction] = useState(false)
  // Workflow unifié d'action managériale : statut choisi dans le même formulaire
  const [texteActionStatut, setTexteActionStatut] = useState<StatutRetour>("IN_PROGRESS")
  // Dialog d'historique d'un employé (Improvement 6)
  const [dialogEmployeNom, setDialogEmployeNom] = useState<string | null>(null)
  const reponseRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLTextAreaElement>(null)
  // Ref pour le scroll "Voir IA" (Improvement 4)
  const iaRef = useRef<HTMLDivElement>(null)

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
  }

  function ouvrirReponse(r: Retour) {
    setDetail(r)
    setTexteReponse(r.reponsePro || "")
    setTexteAction(r.actionPrise || "")
    setTexteActionStatut(r.statut === "NEW" ? "IN_PROGRESS" : r.statut)
    setEditionReponse(true)
    setEditionAction(false)
  }

  function fermerDetail() {
    setDetail(null)
    setEditionReponse(false)
    setEditionAction(false)
    setDialogEmployeNom(null)
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

  // ---------- Vue détaillée pleine page d'un retour (remplace la modale) ----------
  if (detail) {
    // Recommandation IA + récurrence (memoïsées côté client à partir de `items`)
    const recoIA = genererRecommandationIA(detail, items)
    const recurrence = recoIA.recurrence
    const templatesReponse = genererTemplatesReponse(detail)
    const statsEmp = dialogEmployeNom ? statsEmploye(dialogEmployeNom, items) : null

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

    // Scroll vers la carte IA
    function scrollToIA() {
      iaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    return (
      <div className="space-y-5">
        {/* En-tête : retour + titre */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={fermerDetail} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour à la liste
          </Button>
          <h2 className="text-lg sm:text-xl font-semibold">Détail du retour</h2>
        </div>

        {/* ---------- Header note + statut + actions rapides (Improvement 4) ---------- */}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Stars note={detail.note} size={18} />
              {!detail.lu && <Badge className="h-5 px-1.5 text-[10px]">Nouveau</Badge>}
              <Badge variant="outline" className={statutBadgeClass(detail.statut)}>
                {STATUT_RETOUR_LABEL[detail.statut] ?? detail.statut}
              </Badge>
              {typeof detail.nps === "number" && (
                <Badge
                  variant="outline"
                  className="h-5 gap-1 px-1.5 text-[10px] font-normal"
                  title="Net Promoter Score (0-10)"
                >
                  NPS {detail.nps}/10
                  {(detail.nps ?? 0) >= 9 ? " 🟢" : (detail.nps ?? 0) >= 7 ? " 🟡" : " 🔴"}
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(detail.createdAt)}</span>
            </div>

            {/* ---------- Indicateur de récurrence (Improvement 7) ---------- */}
            {recurrence.count >= 2 && recurrence.libelleTag && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span className="text-sm font-medium">
                  {ordinalFr(recurrence.count)} signalement « {recurrence.libelleTag} » ce mois-ci
                </span>
                <button
                  type="button"
                  onClick={scrollToIA}
                  className="ml-auto text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  → Voir la tendance complète
                </button>
              </div>
            )}

            {/* ---------- 3 actions rapides (Improvement 4) ---------- */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={editionReponse ? "default" : "outline"}
                className="h-10 gap-1.5"
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
                <a
                  href={lienWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="outline" className="h-10 gap-1.5" type="button">
                    <Smartphone className="h-4 w-4" aria-hidden />
                    <span>Alerter l&apos;équipe</span>
                  </Button>
                </a>
              )}
              <Button
                variant="outline"
                className="h-10 gap-1.5"
                onClick={scrollToIA}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                <span>Voir IA</span>
              </Button>
              {!detail.lu && (
                <Button
                  variant="ghost"
                  className="h-10 gap-1.5 ml-auto"
                  onClick={() => majRetour(detail.id, { lu: true })}
                >
                  <MailOpen className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Marquer comme lu</span>
                  <span className="sm:hidden">Lu</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---------- Carte Recommandation du Coach IA (Improvement 1) ---------- */}
        <div ref={iaRef} className="scroll-mt-4">
          <Card className="border-primary/30 bg-primary/[0.02]">
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                  <Bot className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold">💡 Recommandation du Coach IA</h3>
                <Badge variant="outline" className="ml-auto h-6 px-2 text-xs font-normal capitalize">
                  {recoIA.categorie}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Problème détecté
                  </p>
                  <p className="text-sm font-medium">{recoIA.probleme}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Contexte
                  </p>
                  <p className="text-sm">{recoIA.contexte}</p>
                </div>
              </div>

              {/* Tendance / mini-graphique de récurrence (Improvement 7) */}
              {recurrence.count >= 2 && (
                <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 dark:border-amber-700/60 dark:bg-amber-950/20">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
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

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                  Actions suggérées
                </p>
                <ol className="space-y-2">
                  {recoIA.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{a}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/60 p-3 dark:border-emerald-700/60 dark:bg-emerald-950/20">
                <p className="flex items-start gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Impact attendu — </span>
                    {recoIA.impact}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------- Carte infos (employé cliquable) ---------- */}
        <Card>
          <CardContent className="space-y-5 p-4 sm:p-6">
            {/* Grille d'infos : zone, employé, canal */}
            <div className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Zone concernée</p>
                {detail.zone?.nom ? (
                  <Badge variant="outline" className="h-6 gap-1 px-2 text-xs font-normal">
                    <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
                    {detail.zone.nom}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Employé concerné</p>
                {/* Improvement 6 : nom de l'employé cliquable → Dialog historique */}
                {(() => {
                  const emp = detail.employe?.nom ?? null
                  const pers = detail.personnelMentionne ?? null
                  const nomCliquable = emp || pers
                  if (!nomCliquable) {
                    return <span className="text-muted-foreground">Non spécifié</span>
                  }
                  const statsDispos = statsEmploye(nomCliquable, items) !== null
                  return (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {emp && (
                        <button
                          type="button"
                          onClick={() => statsDispos && setDialogEmployeNom(nomCliquable)}
                          disabled={!statsDispos}
                          className={cn(
                            "inline-flex items-center gap-1 truncate rounded-md text-sm",
                            statsDispos
                              ? "text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                              : "text-foreground cursor-default"
                          )}
                          title={statsDispos ? "Voir l'historique de l'employé" : undefined}
                        >
                          <User className="h-3.5 w-3.5" aria-hidden />
                          {emp}
                        </button>
                      )}
                      {pers && emp && pers !== emp && (
                        <span className="text-xs text-muted-foreground">({pers})</span>
                      )}
                      {pers && !emp && (
                        <button
                          type="button"
                          onClick={() => statsDispos && setDialogEmployeNom(nomCliquable)}
                          disabled={!statsDispos}
                          className={cn(
                            "inline-flex items-center gap-1 truncate rounded-md text-sm",
                            statsDispos
                              ? "text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                              : "text-foreground cursor-default"
                          )}
                          title={statsDispos ? "Voir l'historique de l'employé" : undefined}
                        >
                          <User className="h-3.5 w-3.5" aria-hidden />
                          {pers}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Canal</p>
                <p>{canalLabel(detail.canalChoisi)}</p>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Reçu le</p>
                <p>{formatDate(detail.createdAt)}</p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tags</p>
              {detail.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="h-6 min-w-0 max-w-full px-2 text-xs font-normal"
                      title={tagLabel(t)}
                    >
                      <span className="truncate">{tagLabel(t)}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Aucun tag</span>
              )}
            </div>

            {/* Commentaire client */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Commentaire client</p>
              {detail.commentaire ? (
                <blockquote className="border-l-4 border-primary/30 bg-muted/50 px-4 py-3 text-sm italic leading-relaxed">
                  &ldquo;{detail.commentaire}&rdquo;
                </blockquote>
              ) : (
                <p className="text-sm italic text-muted-foreground">Aucun commentaire</p>
              )}
            </div>

            {/* D2 : photo jointe par le client (cliquable pour agrandir) */}
            {detail.photoUrl && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Photo jointe</p>
                <a href={detail.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                  <img
                    src={detail.photoUrl}
                    alt="Photo jointe au retour par le client"
                    className="max-h-64 rounded-lg border border-border object-cover transition-opacity hover:opacity-90"
                  />
                </a>
              </div>
            )}

            {/* Réponse du commerçant (éditable → POST repondre ou PATCH reponsePro) */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Réponse du commerçant
                {detail.emailClient ? (
                  <Badge variant="outline" className="ml-2 h-5 gap-1 px-1.5 text-[10px] font-normal text-blue-700">
                    <Send className="h-3 w-3" aria-hidden />
                    Email client : {detail.emailClient}
                  </Badge>
                ) : (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-normal text-amber-700">
                          Pas d&apos;email client
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Le client n&apos;a pas laissé d&apos;email — la réponse sera conservée en interne.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </p>
              {editionReponse ? (
                <div className="space-y-2">
                  {/* Improvement 5 : 3 templates de réponse IA */}
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
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
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
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* span pour porter le tooltip quand le bouton est désactivé */}
                      <span tabIndex={0} className="inline-block">
                        <Button
                          variant="outline"
                          className="h-10 pointer-events-auto"
                          onClick={() => { setTexteReponse(""); setEditionReponse(true) }}
                        >
                          <MessageSquareReply className="mr-1.5 h-4 w-4" aria-hidden />
                          {detail.emailClient ? "Rédiger une réponse" : "Consigner une réponse interne"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!detail.emailClient && (
                      <TooltipContent>Le client n&apos;a pas laissé d&apos;email — la réponse sera conservée en interne.</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Action managériale + statut unifié (Improvement 8) */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Action managériale prise</p>
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
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
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
            </div>

            {/* Suivi du retour : timeline de l'historique des statuts */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Suivi du retour</p>
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
            </div>
          </CardContent>
        </Card>

        {/* ---------- Actions bas de page (Improvement 3 : dropdown de statut supprimé) ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          {!detail.lu && (
            <Button variant="outline" className="h-10" onClick={() => majRetour(detail.id, { lu: true })}>
              <MailOpen className="mr-1.5 h-4 w-4" aria-hidden />
              Marquer comme lu
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Le statut se modifie via le workflow « Action managériale » ci-dessus.
          </span>
          <Button variant="outline" className="h-10 ml-auto" onClick={fermerDetail}>
            Retour à la liste
          </Button>
        </div>

        {/* ---------- Dialog historique de l'employé (Improvement 6) ---------- */}
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
            {total} retour{total > 1 ? "s" : ""} collecté{total > 1 ? "s" : ""} via vos QR codes — filtrez, répondez et suivez chaque réclamation.
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

      {/* ---------- Barre de filtres ---------- */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {/* Zone (pivot : chaque retour est rattaché à une zone de contact) */}
            <Select value={fZone} onValueChange={(v) => { setPage(1); setFZone(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par zone">
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

            {/* Employé (Session 4 : filtre par employé mentionné/affecté) */}
            <Select
              value={fEmploye || "all"}
              onValueChange={(v) => { setPage(1); setFEmploye(v === "all" ? "" : v) }}
            >
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par employé">
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

            {/* Note */}
            <Select value={fNote} onValueChange={(v) => { setPage(1); setFNote(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par note">
                <SelectValue placeholder="Note" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes notes</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {"★".repeat(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Statut */}
            <Select value={fStatut} onValueChange={(v) => { setPage(1); setFStatut(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par statut">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="NEW">Nouveau</SelectItem>
                <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                <SelectItem value="RESOLVED">Résolu</SelectItem>
              </SelectContent>
            </Select>

            {/* Tag */}
            <Select value={fTag} onValueChange={(v) => { setPage(1); setFTag(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par tag">
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

            {/* Dates (Du / Au) + réinitialisation */}
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <Input
                type="date"
                value={fDu}
                onChange={(e) => { setPage(1); setFDu(e.target.value) }}
                className="h-10 min-w-0 flex-1 text-muted-foreground"
                aria-label="Date de début"
              />
              <Input
                type="date"
                value={fAu}
                onChange={(e) => { setPage(1); setFAu(e.target.value) }}
                className="h-10 min-w-0 flex-1 text-muted-foreground"
                aria-label="Date de fin"
              />
              {datesActives && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-9 shrink-0"
                  onClick={() => { setPage(1); setFDu(""); setFAu("") }}
                  aria-label="Réinitialiser les dates"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>

            {/* Rafraîchir */}
            <div className="flex items-center">
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => load()} aria-label="Rafraîchir">
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          {/* Ligne info + export */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {total} retour{total > 1 ? "s" : ""}
              {total > PAGE_SIZE ? ` — page ${page}/${nbPages}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-3"
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
                <Button variant="ghost" size="sm" className="h-10 px-3 text-xs">
                  Exporter tout (serveur)
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Tableau des retours ---------- */}
      {loading ? (
        <Card className="py-0 shadow-sm">
          <CardContent className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        // Empty state soigné
        <Card className="shadow-sm">
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
        <Card className="overflow-hidden py-0 shadow-sm">
          <CardContent className="p-0">
            {/* Tableau scrollable horizontalement sur mobile */}
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="hidden md:table-cell">Tags</TableHead>
                    <TableHead className="hidden lg:table-cell">Commentaire</TableHead>
                    <TableHead className="hidden md:table-cell">Personnel</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => ouvrirDetail(r)}>
                      {/* Date */}
                      <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </TableCell>

                      {/* Note */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Stars note={r.note} size={14} />
                          {!r.lu && <Badge className="h-5 px-1.5 text-[10px]">Nouveau</Badge>}
                        </div>
                      </TableCell>

                      {/* Zone */}
                      <TableCell className="max-w-40">
                        <Badge variant="outline" className="h-6 min-w-0 max-w-full gap-1 px-2 text-xs font-normal">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{r.zone?.nom ?? "—"}</span>
                        </Badge>
                      </TableCell>

                      {/* Tags (masqué < md) */}
                      <TableCell className="hidden md:table-cell">
                        {r.tags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex max-w-56 flex-wrap gap-1">
                            {r.tags.slice(0, 3).map((t) => (
                              <Badge
                                key={t}
                                variant="outline"
                                className="h-5 min-w-0 max-w-full px-1.5 text-xs font-normal"
                                title={tagLabel(t)}
                              >
                                <span className="truncate">{tagLabel(t)}</span>
                              </Badge>
                            ))}
                            {r.tags.length > 3 && (
                              <Badge variant="outline" className="h-5 px-1.5 text-xs font-normal">
                                +{r.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Commentaire (masqué < lg) */}
                      <TableCell className="hidden max-w-72 whitespace-normal lg:table-cell">
                        {r.commentaire ? (
                          <span className="text-sm italic leading-snug">{tronquer(r.commentaire)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Personnel (masqué < md) */}
                      <TableCell className="hidden text-xs md:table-cell">
                        {r.employe?.nom || r.personnelMentionne || <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Statut */}
                      <TableCell>
                        <Badge variant="outline" className={statutBadgeClass(r.statut)}>
                          {STATUT_RETOUR_LABEL[r.statut] ?? r.statut}
                        </Badge>
                      </TableCell>

                      {/* Actions (clics isolés du clic-ligne) */}
                      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Voir le détail"
                            onClick={() => ouvrirDetail(r)}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Répondre"
                            onClick={() => ouvrirReponse(r)}
                          >
                            <MessageSquareReply className="h-4 w-4" aria-hidden />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plus d'actions">
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {!r.lu && (
                                <DropdownMenuItem onClick={() => majRetour(r.id, { lu: true })}>
                                  <MailOpen aria-hidden />
                                  Marquer comme lu
                                </DropdownMenuItem>
                              )}
                              {r.statut !== "IN_PROGRESS" && (
                                <DropdownMenuItem onClick={() => majRetour(r.id, { statut: "IN_PROGRESS" })}>
                                  <Clock aria-hidden />
                                  Passer en cours
                                </DropdownMenuItem>
                              )}
                              {r.statut !== "RESOLVED" && (
                                <DropdownMenuItem onClick={() => majRetour(r.id, { statut: "RESOLVED" })}>
                                  <CheckCircle2 aria-hidden />
                                  Marquer résolu
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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

    </div>
  )
}
