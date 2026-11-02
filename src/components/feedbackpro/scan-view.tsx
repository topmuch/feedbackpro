"use client"

// ============================================================
// FeedbackPro - ScanView (refonte "Wahoo" — UX mobile premium)
// ------------------------------------------------------------
// Le client a scanné le QR code d'une ZONE (Accueil, Salle,
// Toilettes RDC…) imprimée dans le commerce. Sans auth.
//
// Machine à états (5 étapes fluides, animations CSS pur —
// aucune dépendance à framer-motion) :
//   loading → error | welcome (2 s auto) → step1 (note) →
//   step2 (tags dynamiques) → step3 (commentaire + NPS +
//   photo + envoi) → success (remerciement)
//
// D1 (NPS) : si note ≥ 4★, le slider NPS est proposé à
//   l'étape 3 (plus d'étape 1b séparée — flux plus court).
// D2 (Photos) : bouton « Ajouter une photo » à l'étape 3
//   (upload POST /api/public/upload, max 5 Mo).
// D3 (i18n) : FR / EN / AR avec dir="rtl" pour l'arabe.
// D8 (Google) : si pro.googleReviewUrl défini ET note ≥ 4★,
//   l'écran de succès propose « Laisser un avis Google ».
//
// Contrat API (PRESERVÉ — aucune casse) :
//   POST /api/public/scan   { qrToken }
//     → { ok, data: { zone, pro, tagsPositifs[], tagsNegatifs[] } }
//   POST /api/public/retour { qrToken, note, tags[], commentaire?,
//       personnelMentionne?, emailClient?, canalChoisi?, geoConsent?,
//       nps?, photoUrl? }
//     → { ok, data: { retour, recompense, codeRecompense, alerte? } }
//   POST /api/public/upload (multipart "photo")
//     → { ok, data: { url } }
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Gift,
  Globe,
  ImagePlus,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Star,
  Ticket,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  ALL_TAGS,
  NEGATIVE_TAGS_ETENDUS,
  POSITIVE_TAGS_ETENDUS,
  presetPourZone,
  type TagDef,
} from "@/lib/constants"
import { labelPourTagSectoriel } from "@/lib/secteurs-v2"
import { buildWhatsAppMessage } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  TRADUCTIONS_SCAN,
  LANGUES_SCAN,
  detecterLangueNavigateur,
  lireLangueMemorisee,
  memoriserLangue,
  type LangueScan,
  type TraductionsScan,
} from "@/lib/i18n"

// ---------- Types locaux (contrat API) ----------

type ScanData = {
  zone: { nom: string; description?: string | null }
  pro: {
    nomEtablissement: string
    logoUrl?: string | null
    recompense?: string | null
    // Numéro WhatsApp du pro — masque le bouton WhatsApp si absent.
    whatsapp?: string | null
    // Signature personnalisée du pied de message WhatsApp (optionnel)
    messageWhatsapp?: string | null
    // D8 : URL d'avis Google (saisie manuelle par le commerçant)
    googleReviewUrl?: string | null
  }
  tagsPositifs: string[]
  tagsNegatifs: string[]
  // ----- v2 : contexte sectoriel (issu de /api/public/scan) -----
  // macroSecteur : "RESTAURATION" | "HOTELLERIE" | … (null si secteur non couvert)
  macroSecteur?: string | null
  // piliers : 4 axes d'audit du macro-secteur (ex : "Accueil & Service")
  piliers?: string[]
  // tagsPositifsDetails / tagsNegatifsDetails : tags enrichis avec
  // leur label COMPLET (incluant l'émoji) et leur pilier. Non vide
  // uniquement si le Pro est rattaché à un macro-secteur v2.
  tagsPositifsDetails?: { id: string; label: string; pilier: string }[]
  tagsNegatifsDetails?: { id: string; label: string; pilier: string }[]
  // tagsEmployes : tags transversaux filtrés par contexte du macro-secteur
  tagsEmployes?: {
    positifs: { id: string; label: string }[]
    negatifs: { id: string; label: string }[]
  }
}

type Phase = "loading" | "error" | "welcome" | "step1" | "step2" | "step3" | "success"
type CanalEnvoi = "whatsapp" | "aucun"

// ---------- Constantes d'affichage ----------

// Émojis au survol / à la sélection (spec refonte) :
// 1★ 😡 · 2★ 😕 · 3★ 😐 · 4★ 😊 · 5★ 🤩
const EMOJIS_NOTE: Record<number, string> = { 1: "😡", 2: "😕", 3: "😐", 4: "😊", 5: "🤩" }

// Palette du confetti de l'écran de succès positif (one-shot, CSS pur)
const COULEURS_CONFETTI = ["#2563EB", "#10B981", "#FBBF24", "#EC4899", "#8B5CF6"]

// Longueur maximale du commentaire côté client (spec refonte : 500).
// Le schéma serveur (retourSchema) reste à 2000 — plus permissif.
const MAX_COMMENTAIRE = 500

// ---------- Petits utilitaires ----------

// Retrouve le libellé + l'émoji d'un id de tag reçu de l'API.
// v2 : on consulte d'abord le catalogue v2 (secteurs-v2.ts) qui contient
// les labels complets des tags sectoriels ("😊 Très accueillant") et des
// tags employés transversaux ("À l'écoute / humain"). Si l'id n'est pas
// dans le catalogue v2, on retombe sur le catalogue historique ALL_TAGS.
function definitionTag(id: string, positif: boolean): TagDef {
  // 1) Catalogue v2 (sectoriel + employés transversaux) — labels avec emoji
  const labelV2 = labelPourTagSectoriel(id)
  if (labelV2 !== id) {
    // Les labels v2 commencent par un emoji (ex : "😊 Très accueillant")
    // suivi d'un espace puis du texte. On extrait l'emoji et le texte.
    // Si pas d'emoji détecté (ex : "À l'écoute / humain"), on garde un
    // emoji générique et le label complet.
    const match = labelV2.match(/^(\S+)\s+(.*)$/)
    if (match && /\p{Emoji}/u.test(match[1])) {
      return { id, emoji: match[1], label: match[2] }
    }
    return { id, emoji: "🏷️", label: labelV2 }
  }
  // 2) Catalogue historique (ALL_TAGS étendu)
  const liste = positif ? POSITIVE_TAGS_ETENDUS : NEGATIVE_TAGS_ETENDUS
  return (
    liste.find((tg) => tg.id === id) ??
    ALL_TAGS.find((tg) => tg.id === id) ?? { id, label: id, emoji: "🏷️" }
  )
}

// Phrase d'accroche adaptée au type de zone (étape 0 — Bienvenue).
// Détecte le preset (restauration, toilettes, bien-être, accueil) à
// partir du nom de la zone ; retombe sur une phrase générique.
function phraseAccroche(nomZone: string, t: TraductionsScan): string {
  const preset = presetPourZone(nomZone)
  if (!preset) return t.phraseDefault
  switch (preset.id) {
    case "restauration":
      return t.phraseRestauration
    case "toilettes":
      return t.phraseToilettes
    case "entretien":
      return t.phraseBienEtre
    case "accueil":
      return t.phraseAccueil
    default:
      return t.phraseDefault
  }
}

// ---------- Sélecteur de langue (D3 — Globe) ----------

function SelecteurLangue({
  langue,
  onChange,
}: {
  langue: LangueScan
  onChange: (l: LangueScan) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const courant = LANGUES_SCAN.find((l) => l.id === langue) ?? LANGUES_SCAN[0]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
        aria-label="Change language"
        aria-expanded={ouvert}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden />
        <span aria-hidden>{courant.flag}</span>
        <span className="hidden sm:inline">{courant.label}</span>
      </button>
      {ouvert && (
        <>
          {/* Clique hors du menu pour fermer */}
          <div className="fixed inset-0 z-0" aria-hidden onClick={() => setOuvert(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
            {LANGUES_SCAN.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onChange(l.id)
                  setOuvert(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  l.id === langue
                    ? "bg-primary/5 font-semibold text-primary"
                    : "text-foreground/80 hover:bg-muted"
                )}
              >
                <span aria-hidden>{l.flag}</span>
                <span>{l.label}</span>
                {l.id === langue && <Check className="ms-auto h-3.5 w-3.5" aria-hidden />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Écran de chargement : skeleton + spinner léger ----------

function EcranChargement({ t }: { t: TraductionsScan }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background p-4"
      aria-busy="true"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <div
        aria-hidden
        className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lg"
      >
        {/* Simulation de l'en-tête (logo + nom + badge zone) */}
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
        {/* Simulation de la question + étoiles + bouton */}
        <Skeleton className="mt-6 h-5 w-3/4" />
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="size-12 rounded-full" />
          ))}
        </div>
        <Skeleton className="mt-8 h-14 w-full rounded-2xl" />
      </div>
      <p className="text-sm text-muted-foreground">{t.charger}</p>
    </div>
  )
}

// ---------- En-tête commun : logo + nom + badge zone ----------

function EnTeteEtablissement({
  pro,
  zone,
  avecSousTitre,
  avecMarge,
  t,
}: {
  pro: ScanData["pro"]
  zone: ScanData["zone"]
  avecSousTitre: boolean
  avecMarge: boolean
  t: TraductionsScan
}) {
  // Fallback local si le logo distant ne charge pas
  const [logoUrlEnEchec, setLogoUrlEnEchec] = useState<string | null>(null)
  const afficherLogo = Boolean(pro.logoUrl) && logoUrlEnEchec !== pro.logoUrl
  const initiale = pro.nomEtablissement.charAt(0).toUpperCase()

  return (
    <header className={cn("mb-5", avecMarge && "pe-12")}>
      <div className="flex items-center gap-3">
        {afficherLogo && pro.logoUrl ? (
          <img
            src={pro.logoUrl}
            alt={`Logo ${pro.nomEtablissement}`}
            className="size-14 shrink-0 rounded-2xl border border-border object-cover"
            onError={() => setLogoUrlEnEchec(pro.logoUrl ?? null)}
          />
        ) : (
          <div
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-xl font-bold text-primary"
          >
            {initiale}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight text-foreground">
            {pro.nomEtablissement}
          </p>
          <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <span aria-hidden>📍</span>
            <span className="truncate">{zone.nom}</span>
          </p>
        </div>
      </div>

      {zone.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted-foreground">
          {zone.description}
        </p>
      )}

      {avecSousTitre && (
        <p className="mt-3 border-t border-border/60 pt-3 text-sm font-medium text-muted-foreground">
          {t.sousTitre}
        </p>
      )}
    </header>
  )
}

// ---------- Confetti CSS pur (one-shot, aria-hidden) ----------
// Spec refonte : 60 particules colorées (violet/bleu/rose/jaune/vert)
// tombent depuis le haut de l'écran avec rotation (720°) — keyframe
// fp-scan-confetti (translateY 0 → 100vh). Chaque particule a une
// position horizontale aléatoire, une taille, une durée et un délai
// aléatoires (générés une seule fois au montage via useMemo).
function ConfettiLeger() {
  const morceaux = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        // Position horizontale aléatoire (0-100 % de la largeur du conteneur)
        const gauche = Math.round(Math.random() * 100)
        // Durée aléatoire (1,6 à 2,8 s) — particules plus rapides et plus lentes
        const duree = Math.round((16 + Math.random() * 12)) / 10 // 1.6 → 2.8
        // Délai d'apparition échelonné (0 à 0,7 s)
        const delai = Math.round(Math.random() * 7) / 10
        // Couleur (palette spec : violet/bleu/rose/jaune/vert)
        const couleur = COULEURS_CONFETTI[i % COULEURS_CONFETTI.length]
        // Taille : rectangle allongé (larger → plus visible en tombant)
        const largeur = 6 + Math.round(Math.random() * 7) // 6 → 12 px
        const hauteur = Math.max(3, Math.round(largeur * 0.4)) // 3 → 5 px
        return { id: i, gauche, duree, delai, couleur, largeur, hauteur }
      }),
    []
  )
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 overflow-visible"
    >
      {morceaux.map((m) => (
        <span
          key={m.id}
          className="fp-scan-confetti absolute block rounded-[2px]"
          style={{
            backgroundColor: m.couleur,
            width: m.largeur,
            height: m.hauteur,
            left: `${m.gauche}%`,
            top: "-20px",
            // Variables CSS consommées par la keyframe fp-scan-confetti
            ["--fp-confetti-dur" as string]: `${m.duree}s`,
            ["--fp-confetti-delay" as string]: `${m.delai}s`,
          }}
        />
      ))}
    </div>
  )
}

// ---------- Composant principal ----------

export function ScanView({ token, onExit }: { token: string; onExit: () => void }) {
  const { toast } = useToast()

  // D3 : langue (détection navigateur au premier scan, puis mémorisée)
  const [langue, setLangue] = useState<LangueScan>("fr")
  const t = TRADUCTIONS_SCAN[langue]

  // Machine à états + sens de la transition (1 = avancer, -1 = reculer)
  const [phase, setPhase] = useState<Phase>("loading")
  const [sens, setSens] = useState<1 | -1>(1)
  const [scanData, setScanData] = useState<ScanData | null>(null)
  const [erreurScan, setErreurScan] = useState<string | null>(null)

  // Réponses du client
  const [note, setNote] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [personnel, setPersonnel] = useState("")
  const [commentaire, setCommentaire] = useState("")
  // Email (optionnel) : permet au commerçant de répondre par email
  const [emailClient, setEmailClient] = useState("")

  // D1 : NPS (0-10) — collecté à l'étape 3, uniquement si note ≥ 4
  const [nps, setNps] = useState<number>(8)

  // D2 : photo jointe (URL relative retournée par /api/public/upload)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoEnCours, setPhotoEnCours] = useState(false)
  const [photoErreur, setPhotoErreur] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Animation d'étoile + prévisualisation au survol/focus (desktop)
  const [pulse, setPulse] = useState<number | null>(null)
  const [survol, setSurvol] = useState<number | null>(null)

  // Envoi
  const [soumission, setSoumission] = useState<CanalEnvoi | null>(null)
  const [dernierCanal, setDernierCanal] = useState<CanalEnvoi>("whatsapp")
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null)
  const [recompenseGagnee, setRecompenseGagnee] = useState<string | null>(null)
  // Code promo dévoilé sur l'écran de remerciement (APRÈS envoi effectif)
  const [codeRecompense, setCodeRecompense] = useState<string | null>(null)
  // Audit RGPD : consentement opt-in pour enregistrer la ville approximative
  // (déduite de l'IP) — décoché par défaut, jamais requis pour envoyer
  const [geoConsent, setGeoConsent] = useState(false)
  // Task M3 — Mode offline : true si le retour a été stocké hors ligne
  // (sans réseau) plutôt qu'envoyé immédiatement. Affiche un message
  // dédié sur l'écran de succès ("sera envoyé à la reconnexion").
  const [horsLigne, setHorsLigne] = useState(false)

  // Référence du textarea : inutilisée (on s'appuie sur le field-sizing
  // natif du composant Textarea shadcn + max-h-48 pour caper la hauteur).
  // Conservée pour une éventuelle logique future d'auto-resize JS.

  // Timer unique pour : auto-transition bienvenue → étape 1 (2 s) ET
  // auto-transition note → étape 2 (500 ms après clic étoile).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // D3 : détection initiale de la langue (une seule fois au montage)
  useEffect(() => {
    const mem = lireLangueMemorisee()
    setLangue(mem ?? detecterLangueNavigateur())
  }, [])

  // Auto-resize du textarea (étape 3) : on s'appuie sur le field-sizing
  // natif (déjà présent sur le composant Textarea shadcn) + max-h-48 pour
  // caper la hauteur. Aucune logique JS nécessaire.

  function changerLangue(l: LangueScan) {
    setLangue(l)
    memoriserLangue(l)
  }

  const estPositif = note >= 4
  // Note affichée : celle survolée (prévisualisation) sinon celle choisie
  const afficheNote = survol ?? note

  // Récompense affichée sur l'écran de succès : gagnée à l'envoi, sinon pro
  const recompenseFinale = recompenseGagnee ?? scanData?.pro.recompense ?? null
  const numeroWhatsApp = (scanData?.pro.whatsapp ?? "").replace(/[^0-9]/g, "")
  const aWhatsApp = numeroWhatsApp.length > 0
  // D8 : avis Google proposé si URL configurée ET note positive
  const lienAvisGoogle =
    estPositif && scanData?.pro.googleReviewUrl ? scanData.pro.googleReviewUrl : null

  // ---------- Chargement des infos de la zone scannée ----------
  const chargerScan = useCallback(async () => {
    setPhase("loading")
    setErreurScan(null)
    setErreurEnvoi(null)
    try {
      const res = await fetch("/api/public/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: token }),
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || t.erreurQr)
      setScanData(json.data as ScanData)
      // Nouveau scan = nouvelles réponses
      setNote(0)
      setTags([])
      setPersonnel("")
      setCommentaire("")
      setEmailClient("")
      setNps(8)
      setPhotoUrl(null)
      setPhotoErreur(null)
      setRecompenseGagnee(null)
      setCodeRecompense(null)
      setGeoConsent(false)
      setPulse(null)
      setSurvol(null)
      setSens(1)
      // Task M3 — reset du flag offline (nouveau scan = repart à zéro)
      setHorsLigne(false)
      // Étape 0 — Bienvenue (auto-transition 2 s vers step1)
      setPhase("welcome")
    } catch (e) {
      setScanData(null)
      setErreurScan(e instanceof Error ? e.message : null)
      setPhase("error")
    }
  }, [token, t.erreurQr])

  useEffect(() => {
    chargerScan()
  }, [chargerScan])

  // ---------- Auto-transition bienvenue → step1 (2 s, cancelable au clic) ----------
  useEffect(() => {
    if (phase !== "welcome") return
    // Nettoie tout timer précédent (sécurité)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setSens(1)
      setPhase("step1")
      timerRef.current = null
    }, 2000)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [phase])

  // ---------- Navigation entre les étapes ----------
  function allerEtape(suivante: Phase, direction: 1 | -1) {
    setSens(direction)
    setPhase(suivante)
  }

  function annulerTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // ---------- Étape 0 — Bienvenue : clic = transition immédiate ----------
  function passerAuStep1() {
    annulerTimer()
    setSens(1)
    setPhase("step1")
  }

  // ---------- Étape 1 — La Note ----------
  function choisirNote(n: number) {
    setNote(n)
    // Les tags dépendent de la note : on repart d'une sélection vide
    setTags([])
    setPulse(n)
    // Feedback haptique (spec refonte) : navigator.vibrate si supporté.
    // Try/catch : certains navigateurs (iOS Safari) rejectent la promesse.
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(50)
      }
    } catch {
      /* silencieux : le haptique est un bonus, pas une nécessité */
    }
    annulerTimer()
    // Auto-transition vers step2 après 500 ms (spec refonte)
    timerRef.current = setTimeout(() => {
      allerEtape("step2", 1)
      timerRef.current = null
    }, 500)
  }

  // Navigation clavier dans le radiogroup des étoiles
  function etoileClavier(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault()
      choisirNote(Math.min(5, (note || 0) + 1))
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault()
      choisirNote(Math.max(1, (note || 2) - 1))
    } else if (e.key === "Home") {
      e.preventDefault()
      choisirNote(1)
    } else if (e.key === "End") {
      e.preventDefault()
      choisirNote(5)
    }
  }

  // ---------- Étape 2 — Tags (adaptés à la note ET à la zone) ----------
  const idsTags = scanData ? (estPositif ? scanData.tagsPositifs : scanData.tagsNegatifs) : []

  // v2 — Tags enrichis (label + pilier) si le Pro est rattaché à un macro-secteur.
  // Permet de grouper les tags par pilier (ex : "Accueil & Service" → 1 tag,
  // "Rapidité & Flux" → 1 tag, etc.). Si vide (secteur non couvert par la v2),
  // on retombe sur l'affichage plat historique (catalogue ALL_TAGS).
  const tagsDetails = scanData
    ? estPositif
      ? (scanData.tagsPositifsDetails ?? [])
      : (scanData.tagsNegatifsDetails ?? [])
    : []

  // Groupe les tagsDetails par pilier, en respectant l'ordre des piliers du macro.
  const groupesParPilier = useMemo(() => {
    if (tagsDetails.length === 0) return []
    const ordrePiliers = scanData?.piliers ?? []
    const parPilier = new Map<string, typeof tagsDetails>()
    for (const tg of tagsDetails) {
      const liste = parPilier.get(tg.pilier) ?? []
      liste.push(tg)
      parPilier.set(tg.pilier, liste)
    }
    return [...parPilier.entries()]
      .sort((a, b) => {
        const ia = ordrePiliers.indexOf(a[0])
        const ib = ordrePiliers.indexOf(b[0])
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      })
      .map(([pilier, list]) => ({ pilier, tags: list }))
  }, [tagsDetails, scanData?.piliers])

  // v2 — Section « Comportement de l'employé » (tags employés transversaux).
  // Affichée si le client saisit un nom d'employé OU si la note est ≤ 2★.
  // Polarity : positifs si note ≥ 4, négatifs si note ≤ 3.
  const tagsEmployesDispos = scanData?.tagsEmployes
  const personnelMentionne = personnel.trim().length > 0
  const noteFaible = note > 0 && note <= 2
  const declencheurTagsEmployes = personnelMentionne || noteFaible
  const tagsEmployesAAfficher = (() => {
    if (!tagsEmployesDispos || !declencheurTagsEmployes) return []
    return note >= 4 ? tagsEmployesDispos.positifs : tagsEmployesDispos.negatifs
  })()

  // Nettoie les tags employés (préfixe "emp_") de la sélection quand la
  // section est masquée — évite les « phantom tags » soumis sans être
  // visibles. La fonction setTags est stable (React useState), on ne
  // dépend que de declencheurTagsEmployes.
  useEffect(() => {
    if (!declencheurTagsEmployes) {
      setTags((prev) => (prev.some((id) => id.startsWith("emp_")) ? prev.filter((id) => !id.startsWith("emp_")) : prev))
    }
  }, [declencheurTagsEmployes])

  function basculerTag(id: string) {
    setTags((prev) => (prev.includes(id) ? prev.filter((tg) => tg !== id) : [...prev, id]))
  }

  // ---------- D2 : upload de photo ----------
  async function onPhotoChoisie(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    // Réinitialise l'input pour permettre de re-sélectionner le même fichier
    e.target.value = ""
    if (!fichier) return
    setPhotoErreur(null)
    if (fichier.size > 5 * 1024 * 1024) {
      setPhotoErreur(t.photoTropGrande)
      return
    }
    if (!fichier.type.startsWith("image/")) {
      setPhotoErreur(t.photoFormat)
      return
    }
    setPhotoEnCours(true)
    try {
      const fd = new FormData()
      fd.append("photo", fichier)
      const res = await fetch("/api/public/upload", { method: "POST", body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t.photoFormat)
      }
      setPhotoUrl(json.data.url as string)
    } catch (err) {
      setPhotoErreur(err instanceof Error ? err.message : t.photoFormat)
    } finally {
      setPhotoEnCours(false)
    }
  }

  // ---------- Étape 3 : envoi (POST) puis ouverture WhatsApp ----------
  async function envoyer(canal: CanalEnvoi) {
    if (!scanData || soumission) return
    setDernierCanal(canal)
    setSoumission(canal)
    setErreurEnvoi(null)

    const numero = (scanData.pro.whatsapp ?? "").replace(/[^0-9]/g, "")
    // Ouvre l'onglet AVANT l'attente réseau : évite le blocage anti-popup
    const fenetre = canal === "whatsapp" && numero ? window.open("", "_blank") : null

    // Task M3 — Payload construit une fois pour pouvoir le stocker hors ligne
    // en cas d'échec réseau (Background Sync via IndexedDB).
    const payload = JSON.stringify({
      qrToken: token,
      note,
      tags,
      commentaire: commentaire.trim() || undefined,
      personnelMentionne: personnel.trim() || undefined,
      emailClient: emailClient.trim() || undefined,
      canalChoisi: canal,
      // RGPD : la ville approximative n'est enregistrée que si opt-in
      geoConsent,
      // D1 : NPS transmis uniquement pour les notes ≥ 4 (sinon undefined)
      nps: estPositif ? nps : undefined,
      // D2 : photo jointe (URL relative) si le client en a ajouté une
      photoUrl: photoUrl || undefined,
    })

    try {
      const res = await fetch("/api/public/retour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Impossible d'envoyer le retour pour le moment")
      }

      if (typeof json.data?.recompense === "string" && json.data.recompense) {
        setRecompenseGagnee(json.data.recompense as string)
      }
      // Code promo dévoilé APRÈS l'envoi effectif (jamais avant)
      if (typeof json.data?.codeRecompense === "string" && json.data.codeRecompense) {
        setCodeRecompense(json.data.codeRecompense as string)
      }

      // Ouvre WhatsApp avec le message pré-rempli (uniquement si numéro configuré)
      if (canal === "whatsapp" && numero) {
        const message = buildWhatsAppMessage(
          {
            nomEtablissement: scanData.pro.nomEtablissement,
            whatsapp: numero,
            messageWhatsapp: scanData.pro.messageWhatsapp ?? null,
          },
          {
            note,
            tags,
            commentaire: commentaire.trim() || null,
            personnelMentionne: personnel.trim() || null,
            zoneNom: scanData.zone.nom,
          }
        )
        // api.whatsapp.com/send plutôt que wa.me : wa.me corrompt les emojis
        // (hors BMP) lors de sa redirection — vérifié par test A/B
        const lien = `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(message)}`
        if (fenetre) fenetre.location.href = lien
        else window.location.href = lien // popup bloquée : dernier recours
      }

      allerEtape("success", 1)
    } catch (e) {
      // Task M3 — Mode offline : si l'envoi échoue (réseau coupé), on stocke
      // le payload dans IndexedDB (en plus du SW Background Sync qui peut le
      // faire lui-même) et on affiche un écran de succès spécifique.
      fenetre?.close()
      const estErreurReseau =
        e instanceof TypeError ||
        (e instanceof Error && /network|fetch|Failed to fetch/i.test(e.message))
      if (estErreurReseau) {
        try {
          // Import dynamique pour ne pas alourdir le bundle initial si l'envoi réussit
          const { stockerRetourOfflineLocal } = await import("@/lib/offline-sync")
          await stockerRetourOfflineLocal(payload)
          // On affiche l'écran de succès avec un message "hors ligne"
          setHorsLigne(true)
          allerEtape("success", 1)
          return
        } catch {
          /* fallback sur l'erreur normale ci-dessous */
        }
      }
      const message =
        e instanceof Error ? e.message : "Impossible d'envoyer le retour pour le moment"
      setErreurEnvoi(message)
      toast({ title: t.erreurQr, description: message, variant: "destructive" })
    } finally {
      setSoumission(null)
    }
  }

  // ---------- Écran de chargement ----------
  if (phase === "loading") {
    return <EcranChargement t={t} />
  }

  // Classe d'animation de transition entre étapes (CSS pur — pas de framer).
  // Pour l'étape "welcome", le conteneur parent n'a PAS d'animation globale :
  // la cascade (logo / nom / séparateur / phrase) est appliquée individuellement
  // sur chaque enfant via les classes fp-scan-welcome-* (délais 200 ms).
  const classeTransition =
    phase === "welcome"
      ? ""
      : sens === 1
        ? "fp-scan-slide-right"
        : "fp-scan-slide-left"

  // Fond contextuel de la carte (spec refonte) :
  // - step1 : vert très pâle #F0FDF4 (bg-green-50) si 4-5★, rouge très pâle
  //   #FEF2F2 (bg-red-50) si 1-3★ — transition 500 ms
  // - step2 : bg-emerald-50 si positif, bg-rose-50 si négatif
  // - autres : bg-card
  const fondContextuel = (() => {
    if (phase === "step1") {
      if (note === 0) return "border-border bg-card"
      return estPositif
        ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20"
        : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
    }
    if (phase === "step2") {
      return estPositif
        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
        : "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
    }
    return "border-border bg-card"
  })()

  return (
    <div
      className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-background p-3 sm:p-6"
      dir={t.dir}
    >
      <div className="w-full max-w-md">
        <div
          className={cn(
            // transition-colors duration-500 : spec refonte (fond contextuel
            // step1 change en 500 ms entre vert très pâle et rouge très pâle)
            "relative overflow-hidden rounded-3xl border shadow-xl transition-colors duration-500",
            fondContextuel
          )}
        >
          {/* Sélecteur de langue (D3) — discret, en haut à gauche */}
          {phase !== "error" && (
            <div className="absolute left-4 top-3 z-20 sm:left-6 sm:top-4">
              <SelecteurLangue langue={langue} onChange={changerLangue} />
            </div>
          )}

          {/* Bouton discret Quitter (étapes welcome à 3) */}
          {onExit &&
            (phase === "welcome" ||
              phase === "step1" ||
              phase === "step2" ||
              phase === "step3") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onExit}
                aria-label={t.quitter}
                className="absolute right-3 top-3 z-20 size-11 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:top-4"
              >
                <X className="size-5" aria-hidden />
              </Button>
            )}

          {/* Contenu principal — pb-9 sm:pb-11 laisse de la place pour la
              barre de progression fixed bottom (4 px) en toute circonstance. */}
          <div className="p-5 pb-9 sm:p-7 sm:pb-11">
            {/* En-tête du pro + zone sur toutes les étapes du formulaire */}
            {scanData && phase !== "error" && phase !== "welcome" && (
              <EnTeteEtablissement
                pro={scanData.pro}
                zone={scanData.zone}
                avecSousTitre={false}
                avecMarge={phase !== "success"}
                t={t}
              />
            )}

            {/* Conteneur animé — key={phase} force le remount → l'animation
                CSS se rejoue à chaque transition (slide-in depuis la droite
                ou la gauche selon le sens). Pour l'étape welcome, la cascade
                est appliquée individuellement sur les enfants. */}
            <div key={phase} className={classeTransition}>
              {/* ---------- ERREUR : QR code inconnu ou expiré ---------- */}
              {phase === "error" && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
                    <AlertCircle className="size-9 text-rose-500" aria-hidden />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-foreground">{t.erreurQr}</h1>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {erreurScan ? `${erreurScan}. ` : ""}
                      {t.erreurQrAide}
                    </p>
                  </div>
                  <Button
                    onClick={chargerScan}
                    className="h-12 min-w-40 text-base font-semibold"
                    aria-label={t.reessayer}
                  >
                    {t.reessayer}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onExit}
                    className="min-h-11 text-sm text-muted-foreground"
                  >
                    {t.retourAccueil}
                  </Button>
                </div>
              )}

              {/* ---------- ÉTAPE 0 — BIENVENUE (auto-transition 2 s) ----------
                  Cascade d'apparition (spec refonte) :
                    0   ms — logo (fade-in + scale)
                    200 ms — nom établissement (slide-up)
                    400 ms — ligne séparatrice (width 0 → 100 %)
                    600 ms — phrase d'accroche (fade-in)
                    800 ms — indicateur « tap to start » (pulse) */}
              {phase === "welcome" && scanData && (
                <button
                  type="button"
                  onClick={passerAuStep1}
                  className="flex w-full flex-col items-center gap-4 py-6 text-center outline-none"
                  aria-label={t.bienvenueTap}
                >
                  {/* Logo centré (ou initiale si pas de logo) — cascade 0 ms */}
                  <div className="fp-scan-welcome-logo" style={{ animationDelay: "0ms" }}>
                    <LogoEtablissementBig pro={scanData.pro} />
                  </div>

                  {/* Nom établissement — cascade 200 ms (slide-up) */}
                  <div
                    className="fp-scan-welcome-name space-y-1.5"
                    style={{ animationDelay: "200ms" }}
                  >
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {t.bienvenueChez}
                    </p>
                    <h1 className="text-balance text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                      {scanData.pro.nomEtablissement}
                    </h1>
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      <span aria-hidden>📍</span>
                      <span className="truncate">{scanData.zone.nom}</span>
                    </p>
                  </div>

                  {/* Ligne séparatrice — cascade 400 ms (width 0 → 100 %) */}
                  <div
                    aria-hidden
                    className="fp-scan-welcome-line h-px w-16 bg-gradient-to-r from-transparent via-primary/40 to-transparent"
                    style={{ animationDelay: "400ms" }}
                  />

                  {/* Phrase d'accroche adaptée au type de zone — cascade 600 ms */}
                  <p
                    className="fp-scan-welcome-phrase mt-1 max-w-xs text-balance text-base font-medium leading-snug text-foreground/80"
                    style={{ animationDelay: "600ms" }}
                  >
                    {phraseAccroche(scanData.zone.nom, t)}
                  </p>

                  {/* Indicateur "tap to start" pulsé — cascade 800 ms */}
                  <span
                    aria-hidden
                    className="fp-scan-tap-pulse mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
                    style={{ animationDelay: "800ms" }}
                  >
                    {t.bienvenueTap}
                  </span>
                </button>
              )}

              {/* ---------- ÉTAPE 1 — LA NOTE ---------- */}
              {phase === "step1" && scanData && (
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-balance text-xl font-bold leading-snug text-foreground sm:text-2xl">
                    {t.questionNotePrefix}
                    <span className="text-primary">{scanData.zone.nom}</span>
                    {t.questionNoteSuffix}
                  </h1>

                  {/* 5 étoiles très grandes (spec refonte : 64 px mobile,
                      80 px desktop — size-16 sm:size-20). Touch target
                      ≥ 64 px (largement au-dessus du minimum 48 px a11y).
                      Glow jaune au survol (shadow-yellow-400/50) pour effet
                      « Waouh ». flex-1 + max-w évite tout débordement
                      horizontal, même sur iPhone SE. */}
                  <div
                    role="radiogroup"
                    aria-label={t.ariaEtoiles}
                    onKeyDown={etoileClavier}
                    className="mt-7 flex w-full justify-center gap-1 sm:gap-1.5"
                  >
                    {[1, 2, 3, 4, 5].map((i) => {
                      const active = i <= afficheNote
                      const isClicked = pulse === i
                      const isCascading = pulse !== null && i < pulse
                      return (
                        <button
                          key={i}
                          type="button"
                          role="radio"
                          aria-checked={note === i}
                          aria-label={t.donnerEtoiles(i)}
                          onClick={() => choisirNote(i)}
                          onMouseEnter={() => setSurvol(i)}
                          onMouseLeave={() => setSurvol(null)}
                          onFocus={() => setSurvol(i)}
                          onBlur={() => setSurvol(null)}
                          className={cn(
                            "flex h-16 min-w-0 max-w-[5rem] flex-1 items-center justify-center rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-20",
                            isClicked && "fp-scan-star-bounce",
                            isCascading && "fp-scan-star-fill"
                          )}
                          style={isCascading ? { animationDelay: `${(i - 1) * 50}ms` } : undefined}
                        >
                          <Star
                            aria-hidden
                            strokeWidth={1.5}
                            className={cn(
                              "size-16 transition-all duration-150 sm:size-20",
                              active
                                ? "fill-amber-400 text-amber-400 drop-shadow-[0_4px_12px_rgba(251,191,36,0.45)]"
                                : "fill-stone-200 text-stone-300 dark:fill-stone-700 dark:text-stone-600"
                            )}
                          />
                        </button>
                      )
                    })}
                  </div>

                  {/* Émoji correspondant à la note (réagit aussi au survol) */}
                  <div className="mt-4 flex h-20 items-start justify-center" aria-live="polite">
                    {afficheNote > 0 && (
                      <div key={afficheNote} className="fp-scan-pop text-center">
                        <span aria-hidden className="text-5xl leading-none">
                          {EMOJIS_NOTE[afficheNote]}
                        </span>
                        <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                          {t.libellesNote[afficheNote]}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Bouton retour visible (quitte le formulaire) */}
                  <Button
                    variant="ghost"
                    onClick={onExit}
                    className="mt-2 min-h-11 text-sm text-muted-foreground"
                  >
                    <ArrowLeft aria-hidden className="size-4" /> {t.retour}
                  </Button>
                </div>
              )}

              {/* ---------- ÉTAPE 2 — TAGS DYNAMIQUES ---------- */}
              {phase === "step2" && scanData && (
                <div className="flex min-h-[28rem] flex-col">
                  <h1 className="text-balance text-xl font-bold leading-snug text-foreground sm:text-2xl">
                    {estPositif ? t.titrePositif : t.titreNegatif}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t.sousTitreTags}</p>

                  {/* v2 — Tags groupés par pilier (si le Pro est rattaché à un
                      macro-secteur v2). Chaque pilier a son sous-titre et un
                      conteneur flex-wrap en dessous.
                      Fallback : si pas de macro-secteur (Boutique, Salon,
                      Institut, Garage, Autre), on garde l'affichage plat
                      historique avec résolution via ALL_TAGS. */}
                  {groupesParPilier.length > 0 ? (
                    <div className="mt-5 space-y-4" role="group" aria-label={estPositif ? t.ariaTagsPositifs : t.ariaTagsNegatifs}>
                      {groupesParPilier.map((groupe, gIdx) => (
                        <div key={groupe.pilier}>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            <span aria-hidden className="me-1">▸</span>
                            {groupe.pilier}
                          </p>
                          <div className="flex flex-wrap gap-2.5">
                            {groupe.tags.map((tg, idx) => {
                              const actif = tags.includes(tg.id)
                              // Utilise definitionTag pour parser proprement
                              // l'emoji et le label (gère les labels v2 avec
                              // emoji prefix et les labels historiques).
                              const def = definitionTag(tg.id, estPositif)
                              return (
                                <button
                                  key={tg.id}
                                  type="button"
                                  aria-pressed={actif}
                                  onClick={() => basculerTag(tg.id)}
                                  className={cn(
                                    "fp-scan-tag-enter inline-flex min-h-12 min-w-0 max-w-full items-center gap-1.5 rounded-full border-2 px-5 py-3 text-sm font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-base",
                                    actif
                                      ? estPositif
                                        ? "border-emerald-500 bg-emerald-100 text-emerald-900 shadow-sm shadow-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-100"
                                        : "border-rose-500 bg-rose-100 text-rose-900 shadow-sm shadow-rose-500/20 dark:border-rose-400 dark:bg-rose-900/40 dark:text-rose-100"
                                      : "border-border bg-background text-foreground/80 hover:border-foreground/30 hover:bg-muted",
                                    actif && "fp-scan-tag-pop"
                                  )}
                                  style={{ animationDelay: `${(gIdx * 4 + idx) * 50}ms` }}
                                >
                                  <span aria-hidden className="text-base leading-none">
                                    {actif ? <Check className="size-4" /> : def.emoji}
                                  </span>
                                  <span className="min-w-0 break-words leading-tight">{def.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      role="group"
                      aria-label={estPositif ? t.ariaTagsPositifs : t.ariaTagsNegatifs}
                      className="mt-5 flex flex-wrap gap-2.5"
                    >
                      {idsTags.map((id, idx) => {
                        const def = definitionTag(id, estPositif)
                        const actif = tags.includes(id)
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={actif}
                            onClick={() => basculerTag(id)}
                            // fp-scan-tag-enter : apparition stagger (fade-in +
                            // slide-up, délai 50 ms par tag, spec refonte)
                            className={cn(
                              "fp-scan-tag-enter inline-flex min-h-12 min-w-0 max-w-full items-center gap-1.5 rounded-full border-2 px-6 py-4 text-sm font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-base",
                              actif
                                ? estPositif
                                  ? "border-emerald-500 bg-emerald-100 text-emerald-900 shadow-sm shadow-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-100"
                                  : "border-rose-500 bg-rose-100 text-rose-900 shadow-sm shadow-rose-500/20 dark:border-rose-400 dark:bg-rose-900/40 dark:text-rose-100"
                                : "border-border bg-background text-foreground/80 hover:border-foreground/30 hover:bg-muted",
                              actif && "fp-scan-tag-pop"
                            )}
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <span aria-hidden className="text-base leading-none">
                              {actif ? <Check className="size-4" /> : def.emoji}
                            </span>
                            <span className="min-w-0 break-words leading-tight">{def.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Champ optionnel : personnel concerné */}
                  <div className="mt-6">
                    <label
                      htmlFor="personnel"
                      className="mb-1.5 block text-sm font-medium text-foreground/80"
                    >
                      👤 {t.personnelLabel}{" "}
                      <span className="font-normal text-muted-foreground">{t.optionnel}</span>
                    </label>
                    <Input
                      id="personnel"
                      value={personnel}
                      onChange={(e) => setPersonnel(e.target.value)}
                      placeholder=""
                      maxLength={120}
                      autoComplete="off"
                      className="h-12 text-base"
                    />
                  </div>

                  {/* v2 — Section « Comportement de l'employé » (tags employés
                      transversaux). Affichée si le client saisit un nom
                      d'employé OU si la note est ≤ 2★. Polarity : positifs si
                      note ≥ 4, négatifs si note ≤ 3. Les tags employés ont
                      tous un id préfixé « emp_ » — ils sont stockés dans le
                      même tableau `tags` que les tags sectoriels et soumis
                      avec le retour. Le Coach IA les distingue par leur id. */}
                  {tagsEmployesAAfficher.length > 0 && (
                    <div
                      className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/40 dark:bg-violet-950/20"
                      role="group"
                      aria-label={t.ariaTagsEmployes}
                    >
                      <p className="text-sm font-bold text-foreground/90">{t.employeTitre}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.employeAide}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tagsEmployesAAfficher.map((tg, idx) => {
                          const actif = tags.includes(tg.id)
                          const positif = note >= 4
                          return (
                            <button
                              key={tg.id}
                              type="button"
                              aria-pressed={actif}
                              onClick={() => basculerTag(tg.id)}
                              className={cn(
                                "fp-scan-tag-enter inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full border-2 px-4 py-2.5 text-xs font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm",
                                actif
                                  ? positif
                                    ? "border-violet-500 bg-violet-100 text-violet-900 shadow-sm shadow-violet-500/20 dark:border-violet-400 dark:bg-violet-900/40 dark:text-violet-100"
                                    : "border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900 shadow-sm shadow-fuchsia-500/20 dark:border-fuchsia-400 dark:bg-fuchsia-900/40 dark:text-fuchsia-100"
                                  : "border-border bg-background text-foreground/80 hover:border-foreground/30 hover:bg-muted",
                                actif && "fp-scan-tag-pop"
                              )}
                              style={{ animationDelay: `${idx * 50}ms` }}
                            >
                              <span aria-hidden className="text-sm leading-none">
                                {actif ? <Check className="size-3.5" /> : positif ? "👍" : "⚠️"}
                              </span>
                              <span className="min-w-0 break-words leading-tight">{tg.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bouton Continuer (spec refonte) : gradient violet → bleu,
                      w-full py-4 text-lg, désactivé si aucun tag sélectionné. */}
                  <div className="mt-auto pt-6">
                    <button
                      type="button"
                      onClick={() => allerEtape("step3", 1)}
                      disabled={tags.length === 0}
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-semibold text-white shadow-lg transition-all",
                        "bg-gradient-to-r from-violet-500 to-blue-500 shadow-violet-500/25",
                        tags.length === 0
                          ? "cursor-not-allowed opacity-50"
                          : "hover:from-violet-600 hover:to-blue-600 hover:shadow-violet-500/40 active:scale-[0.98]"
                      )}
                    >
                      {t.continuer} <ArrowRight aria-hidden className="size-5" />
                    </button>
                    <Button
                      variant="ghost"
                      onClick={() => allerEtape("step1", -1)}
                      className="mt-1 min-h-11 w-full text-sm text-muted-foreground"
                    >
                      <ArrowLeft aria-hidden className="size-4" /> {t.retour}
                    </Button>
                  </div>
                </div>
              )}

              {/* ---------- ÉTAPE 3 — COMMENTAIRE + NPS + PHOTO + ENVOI ---------- */}
              {phase === "step3" && scanData && (
                <div>
                  <h1 className="text-balance text-xl font-bold leading-snug text-foreground sm:text-2xl">
                    {t.titreCommentaire}
                  </h1>

                  {/* Récapitulatif visuel (spec refonte) : card glassmorphism
                      bg-gray-50 border border-gray-200 rounded-2xl p-4. */}
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.recapTitre}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground/80">{t.recapNote} :</span>
                      <div className="flex gap-0.5" aria-label={`${note}/5`}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            aria-hidden
                            className={cn(
                              "size-4",
                              i <= note
                                ? "fill-amber-400 text-amber-400"
                                : "fill-muted text-muted"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div className="mt-2 flex items-start gap-2 text-sm">
                        <span className="shrink-0 font-medium text-foreground/80">
                          {t.recapTags} :
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((id) => {
                            const def = definitionTag(id, estPositif)
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                              >
                                <span aria-hidden>{def.emoji}</span>
                                {def.label}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 text-sm">
                      <span className="font-medium text-foreground/80">{t.recapPersonnel} : </span>
                      <span className="text-foreground/70">
                        {personnel.trim() || t.recapAucun}
                      </span>
                    </div>
                  </div>

                  {/* Textarea auto-resize (spec refonte) : min 120 px, max 300 px,
                      max 500 chars, compteur. field-sizing natif du composant
                      Textarea shadcn + max-h-[300px] pour caper la hauteur. */}
                  <div className="mt-4">
                    <Textarea
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value.slice(0, MAX_COMMENTAIRE))}
                      rows={3}
                      maxLength={MAX_COMMENTAIRE}
                      aria-label={t.titreCommentaire}
                      placeholder={estPositif ? t.commentairePositif : t.commentaireNegatif}
                      className="min-h-[120px] max-h-[300px] text-base"
                    />
                    <div className="mt-1 text-right text-xs text-muted-foreground">
                      {t.compteurChars(commentaire.length, MAX_COMMENTAIRE)}
                    </div>
                  </div>

                  {/* D1 : slider NPS (uniquement si note ≥ 4) — spec refonte :
                      gradient violet → bleu sur le badge de valeur. */}
                  {estPositif && (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                      <p className="text-sm font-semibold text-foreground/80">{t.questionNps}</p>
                      <p className="text-xs text-muted-foreground">{t.npsSousTitre}</p>
                      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>0</span>
                        <span>5</span>
                        <span>10</span>
                      </div>
                      <Slider
                        value={[nps]}
                        min={0}
                        max={10}
                        step={1}
                        onValueChange={(v) => setNps(v[0] ?? 8)}
                        aria-label={t.questionNps}
                        className="mt-2"
                      />
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <span className="inline-flex min-w-16 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-1.5 text-2xl font-bold text-white shadow-md shadow-violet-500/30">
                          {nps}
                        </span>
                        <span className="text-sm text-muted-foreground">/ 10</span>
                        <span className="ms-2 text-xl" aria-hidden>
                          {nps >= 9 ? "😍" : nps >= 7 ? "😊" : "😐"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* D2 : ajout de photo (optionnel) */}
                  <div className="mt-4">
                    <p className="mb-1.5 text-sm font-medium text-foreground/80">{t.photoLabel}</p>
                    {photoUrl ? (
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-2.5">
                        <img
                          src={photoUrl}
                          alt="Photo jointe"
                          className="size-16 shrink-0 rounded-lg border border-border object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{t.photoAide}</p>
                          <div className="mt-1.5 flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => photoInputRef.current?.click()}
                            >
                              <Upload className="me-1 h-3.5 w-3.5" aria-hidden />
                              {t.photoChanger}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                              onClick={() => {
                                setPhotoUrl(null)
                                setPhotoErreur(null)
                              }}
                            >
                              <Trash2 className="me-1 h-3.5 w-3.5" aria-hidden />
                              {t.photoRetirer}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label
                        htmlFor="photo-input"
                        className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border bg-background/60 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {photoEnCours ? (
                            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                          ) : (
                            <ImagePlus className="h-5 w-5" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground/80">
                            {photoEnCours ? t.photoEnCours : `📷 ${t.photoChoisir}`}
                          </span>
                          <span className="block text-xs text-muted-foreground">{t.photoAide}</span>
                        </span>
                        <input
                          ref={photoInputRef}
                          id="photo-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="sr-only"
                          onChange={onPhotoChoisie}
                        />
                      </label>
                    )}
                    {photoErreur && (
                      <p className="mt-1.5 text-xs text-rose-600" role="alert">
                        {photoErreur}
                      </p>
                    )}
                  </div>

                  {/* Email optionnel : permet au commerçant de répondre par email */}
                  <div className="mt-4">
                    <Input
                      type="email"
                      inputMode="email"
                      value={emailClient}
                      onChange={(e) => setEmailClient(e.target.value)}
                      maxLength={120}
                      autoComplete="off"
                      aria-label={t.emailLabel}
                      placeholder={t.emailLabel}
                      className="h-12 text-base"
                    />
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {t.emailAide}
                    </p>
                  </div>

                  {/* Consentement géolocalisation approximative (RGPD — opt-in,
                      jamais requis pour envoyer le retour) */}
                  <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="geo-consent"
                        checked={geoConsent}
                        onCheckedChange={(v) => setGeoConsent(v === true)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor="geo-consent"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        {t.geoConsent}{" "}
                        <a
                          href="/confidentialite"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          {t.politique}
                        </a>
                      </label>
                    </div>
                  </div>

                  {/* Badge récompense (teaser — code promo dévoilé au succès) */}
                  {scanData.pro.recompense && (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                      <Gift className="size-6 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          {t.recompenseBadgePrefix} {scanData.pro.recompense}
                        </p>
                        <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/80">
                          {t.recompenseMontrez}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Erreur d'envoi : message inline + réessayer (données conservées) */}
                  {erreurEnvoi && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div>
                        <p>{erreurEnvoi}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => envoyer(dernierCanal)}
                          className="mt-1 h-9 px-2 text-sm font-semibold text-rose-700 underline underline-offset-2 hover:bg-rose-100 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/40"
                        >
                          {t.reessayer}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Bouton principal « Envoyer » (spec refonte) :
                      gradient violet → bleu, w-full py-5 text-xl font-bold,
                      pulse subtil (fp-scan-pulse-soft). Désactivé pendant l'envoi. */}
                  <button
                    type="button"
                    onClick={() => envoyer("aucun")}
                    disabled={soumission !== null}
                    className={cn(
                      "fp-scan-pulse-soft mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-xl font-bold text-white shadow-lg transition-all",
                      "bg-gradient-to-r from-violet-500 to-blue-500 shadow-violet-500/30",
                      soumission !== null
                        ? "cursor-wait opacity-80"
                        : "hover:from-violet-600 hover:to-blue-600 hover:shadow-violet-500/40 active:scale-[0.98]"
                    )}
                  >
                    {soumission === "aucun" ? (
                      <>
                        <Loader2 className="size-5 animate-spin" aria-hidden /> {t.envoiEnCours}
                      </>
                    ) : (
                      <>
                        <Check className="size-5" aria-hidden /> {t.envoyer}
                      </>
                    )}
                  </button>

                  {/* Canal secondaire WhatsApp (masqué si aucun numéro configuré) */}
                  {aWhatsApp && (
                    <Button
                      onClick={() => envoyer("whatsapp")}
                      disabled={soumission !== null}
                      className="mt-2.5 h-14 w-full rounded-2xl bg-green-500 text-base font-bold text-white hover:bg-green-600"
                    >
                      {soumission === "whatsapp" ? (
                        <>
                          <Loader2 className="size-5 animate-spin" aria-hidden /> {t.envoiEnCours}
                        </>
                      ) : (
                        <>
                          <MessageCircle className="size-5" aria-hidden /> {t.envoyerWhatsapp}
                        </>
                      )}
                    </Button>
                  )}

                  {/* D8 : avis Google — lien discret (si 4-5★ + URL configurée) */}
                  {lienAvisGoogle && (
                    <a
                      href={lienAvisGoogle}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      <span aria-hidden>⭐</span>
                      {t.avisGoogle}
                    </a>
                  )}

                  {/* Rassurance selon la note */}
                  <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                    {estPositif ? t.rassurancePositif : t.rassuranceNegatif}
                  </p>

                  <Button
                    variant="ghost"
                    onClick={() => allerEtape("step2", -1)}
                    className="mt-2 min-h-11 w-full text-sm text-muted-foreground"
                  >
                    <ArrowLeft aria-hidden className="size-4" /> {t.retour}
                  </Button>
                </div>
              )}

              {/* ---------- ÉTAPE 4 — REMERCIEMENT ---------- */}
              {phase === "success" && scanData && (
                <div className="relative flex flex-col items-center gap-4 py-4 text-center">
                  {/* Confettis (4-5★) OU cœur pulsé (1-3★) */}
                  {estPositif ? (
                    <ConfettiLeger />
                  ) : (
                    <div
                      aria-hidden
                      className="fp-scan-heart flex size-20 items-center justify-center text-5xl"
                    >
                      💗
                    </div>
                  )}

                  {/* Grande coche animée (positif) — remplacée par le cœur au-dessus
                      pour le cas négatif. On garde la coche visible en positif. */}
                  {estPositif && (
                    <div
                      aria-hidden
                      className="fp-scan-pop fp-scan-halo flex size-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    >
                      <Check className="size-10" strokeWidth={3} />
                    </div>
                  )}

                  <h1 className="text-balance text-2xl font-bold text-foreground">{t.merci}</h1>

                  {/* Sous-titre adapté (court) */}
                  <p className="text-balance text-base font-medium text-muted-foreground">
                    {estPositif ? t.merciPositifCourt : t.merciNegatifCourt}
                  </p>

                  {/* Task M3 — Bandeau "hors ligne" si le retour a été stocké
                      sans réseau plutôt qu'envoyé immédiatement. Discret mais
                      rassurant : le client sait que son retour n'est pas perdu. */}
                  {horsLigne && (
                    <div
                      role="status"
                      className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                      <span aria-hidden>📡</span>
                      <span>
                        {t.retourEnregistreHorsLigne ??
                          "✓ Retour enregistré hors ligne — sera envoyé à la reconnexion"}
                      </span>
                    </div>
                  )}

                  {/* Récompense (spec refonte) : carte à bordure dégradée
                      (violet → bleu → rose) + code promo en GROS
                      (text-3xl font-bold text-purple-600). */}
                  {recompenseFinale ? (
                    <div className="fp-scan-reward-in fp-scan-reward-border w-full p-4 shadow-md shadow-purple-500/15">
                      <p className="text-balance text-lg font-bold leading-snug text-foreground">
                        {t.recompenseTitre(recompenseFinale)}
                      </p>
                      {codeRecompense && (
                        <div className="mt-3 flex flex-col items-center gap-1">
                          <span
                            className="inline-flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2 font-mono text-3xl font-bold tracking-wider text-purple-600 dark:bg-purple-950/40 dark:text-purple-300"
                            aria-label={`Code promo : ${codeRecompense}`}
                          >
                            <Ticket className="size-6 text-purple-500" aria-hidden />
                            {codeRecompense}
                          </span>
                        </div>
                      )}
                      <p className="mt-2 text-center text-sm text-muted-foreground">
                        {t.recompenseMontrez}
                      </p>
                    </div>
                  ) : estPositif ? (
                    <p className="text-balance text-sm text-muted-foreground">
                      {t.merciPositif(scanData.pro.nomEtablissement)}
                    </p>
                  ) : (
                    /* Carte rassurante pour les retours 1-3★ */
                    <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-left">
                      <ShieldCheck className="mt-0.5 size-8 shrink-0 text-primary" aria-hidden />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t.merciNegatif}
                      </p>
                    </div>
                  )}

                  {/* D8 : avis Google — proposé si note ≥ 4★ + URL configurée */}
                  {lienAvisGoogle && (
                    <a
                      href={lienAvisGoogle}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      <span aria-hidden>⭐</span>
                      {t.avisGoogle}
                      <span className="text-xs font-normal text-amber-600/80 dark:text-amber-400/80">
                        — {t.avisGoogleAide}
                      </span>
                    </a>
                  )}

                  <Button
                    onClick={onExit}
                    className="mt-1 h-14 w-full rounded-2xl text-base font-semibold"
                  >
                    {t.fermer}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Barre de progression fixed bottom (spec refonte) :
              - hauteur 4 px (h-1)
              - fond gris très clair (bg-gray-200)
              - progress : gradient violet → bleu (from-violet-500 to-blue-500)
              - étapes : welcome = 0 %, step1 = 33 %, step2 = 66 %,
                step3/success = 100 %
              - transition width 300 ms ease-out
              Cachée en cas d'erreur (pas de concept de progression). */}
          {phase !== "error" && (
            <div
              className="absolute inset-x-0 bottom-0 h-1 bg-gray-200 dark:bg-gray-800"
              role="progressbar"
              aria-valuenow={
                phase === "welcome"
                  ? 0
                  : phase === "step1"
                    ? 33
                    : phase === "step2"
                      ? 66
                      : 100
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t.ariaProgression}
            >
              <div
                aria-hidden
                className="h-full rounded-e-full bg-gradient-to-r from-violet-500 to-blue-500 transition-[width] duration-300 ease-out"
                style={{
                  width:
                    phase === "welcome"
                      ? "0%"
                      : phase === "step1"
                        ? "33%"
                        : phase === "step2"
                          ? "66%"
                          : "100%",
                }}
              />
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t.propulsePar} <span className="font-semibold text-foreground/70">FeedbackPro</span>
        </p>
      </div>
    </div>
  )
}

// ---------- Logo centré (étape Bienvenue) ----------

function LogoEtablissementBig({ pro }: { pro: ScanData["pro"] }) {
  const [logoUrlEnEchec, setLogoUrlEnEchec] = useState<string | null>(null)
  const afficherLogo = Boolean(pro.logoUrl) && logoUrlEnEchec !== pro.logoUrl
  const initiale = pro.nomEtablissement.charAt(0).toUpperCase()

  if (afficherLogo && pro.logoUrl) {
    return (
      <img
        src={pro.logoUrl}
        alt={`Logo ${pro.nomEtablissement}`}
        onError={() => setLogoUrlEnEchec(pro.logoUrl ?? null)}
        className="size-24 rounded-3xl border border-border bg-background object-cover shadow-md sm:size-28"
      />
    )
  }
  return (
    <div
      aria-hidden
      className="flex size-24 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-4xl font-bold text-primary shadow-md sm:size-28"
    >
      {initiale}
    </div>
  )
}
