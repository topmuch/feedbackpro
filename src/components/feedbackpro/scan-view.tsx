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
  Camera,
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

type Phase = "loading" | "error" | "welcome" | "step1" | "step2" | "step3" | "step4" | "success"
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
// Version QRTags : discret sur fond bleu plein (bg-[#002e85]/5 backdrop-blur,
// texte blanc), menu déroulant blanc classique pour la lisibilité.
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
        className="inline-flex items-center gap-1.5 rounded-full border border-[#002e85]/30 bg-[#002e85]/10 px-3 py-1.5 text-xs font-medium text-[#002e85] shadow-sm backdrop-blur transition-colors hover:bg-[#002e85]/20"
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
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-[#002e85] bg-white py-1 text-gray-900 shadow-lg">
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
                    ? "bg-blue-50 font-semibold text-[#002e85]"
                    : "text-gray-800 hover:bg-gray-100"
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

// ---------- Écran de chargement : wizard QRTags plein écran bleu ----------
// Fond bleu FeedbackPro, spinner blanc, libellé "Chargement…" en blanc.
function EcranChargement({ t }: { t: TraductionsScan }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-white p-4 text-[#002e85]"
      aria-busy="true"
    >
      <Loader2 className="size-10 animate-spin text-[#002e85]" aria-hidden />
      <p className="text-base font-medium text-[#002e85]/80">{t.charger}</p>
    </div>
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
  // Deux inputs distincts : un avec `capture="environment"` (ouvre l'appareil
  // photo sur mobile — bouton « Prendre une photo ») et un sans capture
  // (ouvre la galerie — bouton « Choisir une image »). Sur desktop, les deux
  // ouvrent le sélecteur de fichier classique.
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoCameraRef = useRef<HTMLInputElement>(null)

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

  // Timer unique pour l'auto-transition note → étape 2 (500 ms après clic étoile).
  // NB : la transition bienvenue → étape 1 se fait désormais via le bouton
  // « Continuer » (plus d'auto-redirect après 2 s).
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

  // Fond global plein écran (refonte QRTags) :
  // - welcome / step2 / step3 / step4 / error : bg-white
  // - step1 : bg-white par défaut, bg-emerald-50 si 4-5★, bg-rose-50 si
  //   1-3★ — transition douce 500 ms via transition-colors sur le conteneur
  //   racine (l'utilisateur voit le fond virer au vert ou au rouge quand il
  //   choisit sa note, ce qui conforte son ressenti).
  // - success : bg-emerald-50 si positif (confettis), bg-white sinon.
  const fondGlobal = (() => {
    if (phase === "step1" && note > 0) {
      return estPositif ? "bg-emerald-50" : "bg-rose-50"
    }
    if (phase === "success" && estPositif) {
      return "bg-emerald-50"
    }
    return "bg-white"
  })()

  // Indicateur d'étape (1 à 4) pour les étapes step1 à step4
  const numEtape =
    phase === "step1"
      ? 1
      : phase === "step2"
        ? 2
        : phase === "step3"
          ? 3
          : phase === "step4"
            ? 4
            : 0
  const TOTAL_ETAPES = 4

  // Sujet de l'étape affiché dans l'indicateur (VOTRE NOTE / DÉTAILS…)
  const sujetEtape =
    phase === "step1"
      ? t.sujetNote
      : phase === "step2"
        ? t.sujetDetails
        : phase === "step3"
          ? t.sujetCommentaire
          : phase === "step4"
            ? t.sujetEnvoi
            : ""

  // Bouton « Retour » : recule d'une étape, ou quitte le formulaire à step1.
  function retourEtape() {
    if (phase === "step1") onExit()
    else if (phase === "step2") allerEtape("step1", -1)
    else if (phase === "step3") allerEtape("step2", -1)
    else if (phase === "step4") allerEtape("step3", -1)
  }

  // Affiche le top bar (Retour + langue + exit) sur toutes les étapes sauf
  // error et success (qui ont leurs propres boutons centrés).
  const avecTopBar =
    phase === "welcome" ||
    phase === "step1" ||
    phase === "step2" ||
    phase === "step3" ||
    phase === "step4"

  // Affiche le footer (Suivant + progress bar) sur les étapes 2 à 4.
  // (Step1 a une auto-transition après clic — pas de bouton Suivant visible,
  //  mais on garde quand même la progress bar pour la cohérence visuelle.)
  const avecFooterProgress =
    phase === "step1" || phase === "step2" || phase === "step3" || phase === "step4"

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col text-[#002e85] transition-colors duration-500",
        fondGlobal
      )}
      dir={t.dir}
    >
      {/* ====== Top bar (welcome + steps 1-4) ====== */}
      {avecTopBar && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
          <div className="flex-1">
            {(phase === "step1" ||
              phase === "step2" ||
              phase === "step3" ||
              phase === "step4") && (
              <button
                type="button"
                onClick={retourEtape}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-[#002e85]/60 transition-colors hover:text-[#002e85]"
              >
                <ArrowLeft className="size-4" aria-hidden />
                {t.retour}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SelecteurLangue langue={langue} onChange={changerLangue} />
            {onExit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onExit}
                aria-label={t.quitter}
                className="size-9 rounded-full text-[#002e85]/60 hover:bg-[#002e85]/10 hover:text-[#002e85]"
              >
                <X className="size-5" aria-hidden />
              </Button>
            )}
          </div>
        </header>
      )}

      {/* ====== Contenu principal (centré verticalement) ====== */}
      <main className="flex flex-1 flex-col px-4 pb-4 sm:px-6">
        <div key={phase} className={cn("flex flex-1 flex-col", classeTransition)}>
          {/* ---------- ERREUR : QR code inconnu ou expiré ---------- */}
          {phase === "error" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-[#002e85]/10">
                <AlertCircle className="size-9 text-[#002e85]" aria-hidden />
              </div>
              <div>
                <h1 className="text-balance text-2xl font-black text-[#002e85] sm:text-3xl">
                  {t.erreurQr}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-[#002e85]/80">
                  {erreurScan ? `${erreurScan}. ` : ""}
                  {t.erreurQrAide}
                </p>
              </div>
              <div className="flex w-full max-w-xs flex-col gap-2">
                <button
                  type="button"
                  onClick={chargerScan}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#002e85] py-4 text-base font-bold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {t.reessayer}
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="min-h-11 text-sm font-medium text-[#002e85]/70 transition-colors hover:text-[#002e85]"
                >
                  {t.retourAccueil}
                </button>
              </div>
            </div>
          )}

          {/* ---------- ÉTAPE 0 — BIENVENUE (bouton « Continuer » explicite) ----------
              Cascade d'apparition (spec refonte) :
                0   ms — logo (fade-in + scale)
                200 ms — nom établissement (slide-up)
                400 ms — ligne séparatrice (width 0 → 100 %)
                600 ms — phrase d'accroche (fade-in)
                800 ms — bouton « Continuer » (pulse) */}
          {phase === "welcome" && scanData && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
              {/* Logo centré (ou initiale si pas de logo) — cascade 0 ms */}
              <div className="fp-scan-welcome-logo" style={{ animationDelay: "0ms" }}>
                <LogoEtablissementBig pro={scanData.pro} />
              </div>

              {/* Nom établissement — cascade 200 ms (slide-up) */}
              <div
                className="fp-scan-welcome-name space-y-1.5"
                style={{ animationDelay: "200ms" }}
              >
                <p className="text-sm font-medium uppercase tracking-wide text-[#002e85]/70">
                  {t.bienvenueChez}
                </p>
                <h1 className="text-balance text-3xl font-black leading-tight text-[#002e85] sm:text-4xl">
                  {scanData.pro.nomEtablissement}
                </h1>
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#002e85]/10 px-3 py-1 text-xs font-semibold text-[#002e85]">
                  <span aria-hidden>📍</span>
                  <span className="truncate">{scanData.zone.nom}</span>
                </p>
              </div>

              {/* Ligne séparatrice — cascade 400 ms (width 0 → 100 %) */}
              <div
                aria-hidden
                className="fp-scan-welcome-line h-px w-16 bg-gradient-to-r from-transparent via-[#002e85]/30 to-transparent"
                style={{ animationDelay: "400ms" }}
              />

              {/* Phrase d'accroche adaptée au type de zone — cascade 600 ms */}
              <p
                className="fp-scan-welcome-phrase mt-1 max-w-xs text-balance text-base font-medium leading-snug text-[#002e85]/85"
                style={{ animationDelay: "600ms" }}
              >
                {phraseAccroche(scanData.zone.nom, t)}
              </p>

              {/* Bouton « Continuer » — cascade 800 ms (pulse subtil) */}
              <button
                type="button"
                onClick={passerAuStep1}
                className="fp-scan-tap-pulse mt-3 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[#002e85] px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ animationDelay: "800ms" }}
              >
                {t.continuer}
                <ArrowRight className="size-5" aria-hidden />
              </button>
            </div>
          )}

          {/* ---------- ÉTAPE 1 — LA NOTE (5 cards emoji plein largeur) ---------- */}
          {phase === "step1" && scanData && (
            <div className="flex flex-1 flex-col">
              <div className="mb-5 flex justify-center">
                <LogoPetit pro={scanData.pro} zone={scanData.zone} />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#002e85]/70 sm:text-sm">
                  {t.etapeSur(numEtape, TOTAL_ETAPES, sujetEtape)}
                </p>

                <h1 className="mt-3 text-balance text-2xl font-black leading-tight text-[#002e85] sm:text-3xl">
                  {t.titreNoteH1}
                </h1>

                <p className="mt-2 text-sm text-[#002e85]/70 sm:text-base">
                  {t.sousTitreNote}
                </p>

                {/* Grille de 5 cards (emoji + label "N étoile(s)") —
                    grid-cols-5 desktop, grid-cols-5 mobile aussi (cards
                    étroites mais lisibles : emoji 3xl + label 11px).
                    Touch target ≥ 96 px de haut (h-24 sm:h-28). */}
                <div
                  role="radiogroup"
                  aria-label={t.ariaEtoiles}
                  onKeyDown={etoileClavier}
                  className="mt-6 grid w-full max-w-md grid-cols-5 gap-1.5 sm:gap-2"
                >
                  {[1, 2, 3, 4, 5].map((i) => {
                    const active = note === i
                    const isClicked = pulse === i
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={note === i}
                        aria-label={t.donnerEtoiles(i)}
                        onClick={() => choisirNote(i)}
                        className={cn(
                          "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-1.5 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:min-h-24 sm:p-2",
                          active
                            ? "border-[#002e85] bg-[#002e85] text-white"
                            : "border-[#002e85] bg-white text-gray-900 hover:scale-105",
                          isClicked && "fp-scan-card-pop"
                        )}
                      >
                        <span aria-hidden className="text-3xl leading-none sm:text-4xl">
                          {EMOJIS_NOTE[i]}
                        </span>
                        <span className="text-[10px] font-semibold leading-tight sm:text-xs">
                          {t.etoileLabel(i)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Libellé de la note (réagit au clic) */}
                <div className="mt-6 flex h-16 items-start justify-center" aria-live="polite">
                  {afficheNote > 0 && (
                    <div key={afficheNote} className="fp-scan-pop text-center">
                      <p className="text-sm font-semibold text-[#002e85]/90">
                        {t.libellesNote[afficheNote]}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---------- ÉTAPE 2 — TAGS DYNAMIQUES (grid de cards emoji) ---------- */}
          {phase === "step2" && scanData && (
            <div className="flex flex-1 flex-col">
              <div className="mb-5 flex justify-center">
                <LogoPetit pro={scanData.pro} zone={scanData.zone} />
              </div>

              <div className="flex flex-col items-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#002e85]/70 sm:text-sm">
                  {t.etapeSur(numEtape, TOTAL_ETAPES, sujetEtape)}
                </p>
                <h1 className="mt-3 text-balance text-2xl font-black leading-tight text-[#002e85] sm:text-3xl">
                  {estPositif ? t.titreTagsPositif : t.titreTagsNegatif}
                </h1>
                <p className="mt-2 text-sm text-[#002e85]/70 sm:text-base">
                  {t.sousTitreTagsH1}
                </p>
              </div>

              {/* Liste scrollable des tags + personnel + section employé */}
              <div className="mt-6 max-h-[60vh] flex-1 space-y-5 overflow-y-auto pe-1 fp-scan-scroll">
                {/* v2 — Tags groupés par pilier (si le Pro est rattaché à un
                    macro-secteur v2). Chaque pilier a son sous-titre et un
                    conteneur grid 2x3 en dessous.
                    Fallback : si pas de macro-secteur (Boutique, Salon,
                    Institut, Garage, Autre), on garde l'affichage plat
                    historique avec résolution via ALL_TAGS. */}
                {groupesParPilier.length > 0 ? (
                  <div
                    className="space-y-4"
                    role="group"
                    aria-label={estPositif ? t.ariaTagsPositifs : t.ariaTagsNegatifs}
                  >
                    {groupesParPilier.map((groupe, gIdx) => (
                      <div key={groupe.pilier}>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#002e85]/70">
                          <span aria-hidden className="me-1">▸</span>
                          {groupe.pilier}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                          {groupe.tags.map((tg, idx) => {
                            const actif = tags.includes(tg.id)
                            const def = definitionTag(tg.id, estPositif)
                            return (
                              <button
                                key={tg.id}
                                type="button"
                                aria-pressed={actif}
                                onClick={() => basculerTag(tg.id)}
                                className={cn(
                                  "fp-scan-tag-enter flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:min-h-24 sm:p-3",
                                  actif
                                    ? "border-[#002e85] bg-[#002e85] text-white"
                                    : "border-[#002e85] bg-white text-gray-900 hover:scale-105",
                                  actif && "fp-scan-card-pop"
                                )}
                                style={{ animationDelay: `${(gIdx * 4 + idx) * 50}ms` }}
                              >
                                <span aria-hidden className="text-2xl leading-none sm:text-3xl">
                                  {def.emoji}
                                </span>
                                <span className="text-xs font-semibold leading-tight sm:text-sm">
                                  {def.label}
                                </span>
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
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
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
                          className={cn(
                            "fp-scan-tag-enter flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:min-h-24 sm:p-3",
                            actif
                              ? "border-[#002e85] bg-[#002e85] text-white"
                              : "border-[#002e85] bg-white text-gray-900 hover:scale-105",
                            actif && "fp-scan-card-pop"
                          )}
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <span aria-hidden className="text-2xl leading-none sm:text-3xl">
                            {def.emoji}
                          </span>
                          <span className="text-xs font-semibold leading-tight sm:text-sm">
                            {def.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Champ optionnel : personnel concerné */}
                <div>
                  <label
                    htmlFor="personnel"
                    className="mb-1.5 block text-sm font-medium text-[#002e85]/90"
                  >
                    👤 {t.personnelLabel}{" "}
                    <span className="font-normal text-[#002e85]/60">{t.optionnel}</span>
                  </label>
                  <Input
                    id="personnel"
                    value={personnel}
                    onChange={(e) => setPersonnel(e.target.value)}
                    placeholder=""
                    maxLength={120}
                    autoComplete="off"
                    className="h-12 border-2 border-[#002e85] bg-white text-base text-gray-900 placeholder:text-gray-400"
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
                    className="rounded-2xl border-2 border-[#002e85]/30 bg-[#002e85]/5 p-4"
                    role="group"
                    aria-label={t.ariaTagsEmployes}
                  >
                    <p className="text-sm font-bold text-[#002e85]">{t.employeTitre}</p>
                    <p className="mt-0.5 text-xs text-[#002e85]/70">{t.employeAide}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                              "fp-scan-tag-enter flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-center outline-none transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                              actif
                                ? "border-[#002e85] bg-[#002e85] text-white"
                                : "border-[#002e85] bg-white text-gray-900 hover:scale-105",
                              actif && "fp-scan-card-pop"
                            )}
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <span aria-hidden className="text-base leading-none">
                              {positif ? "👍" : "⚠️"}
                            </span>
                            <span className="text-[11px] font-semibold leading-tight">
                              {tg.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------- ÉTAPE 3 — COMMENTAIRE + NPS + PHOTO ---------- */}
          {phase === "step3" && scanData && (
            <div className="flex flex-1 flex-col">
              <div className="mb-5 flex justify-center">
                <LogoPetit pro={scanData.pro} zone={scanData.zone} />
              </div>

              <div className="flex flex-col items-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#002e85]/70 sm:text-sm">
                  {t.etapeSur(numEtape, TOTAL_ETAPES, sujetEtape)}
                </p>
                <h1 className="mt-3 text-balance text-2xl font-black leading-tight text-[#002e85] sm:text-3xl">
                  {t.titreCommentaireH1}
                </h1>
                <p className="mt-2 text-sm text-[#002e85]/70 sm:text-base">
                  {t.sousTitreCommentaire}
                </p>
              </div>

              <div className="mt-6 max-h-[60vh] flex-1 space-y-4 overflow-y-auto pe-1 fp-scan-scroll">
                {/* Textarea auto-resize : min 120 px, max 300 px, max 500 chars */}
                <div>
                  <Textarea
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value.slice(0, MAX_COMMENTAIRE))}
                    rows={3}
                    maxLength={MAX_COMMENTAIRE}
                    aria-label={t.titreCommentaireH1}
                    placeholder={estPositif ? t.commentairePositif : t.commentaireNegatif}
                    className="min-h-[120px] max-h-[300px] border-2 border-[#002e85] bg-white text-base text-gray-900 placeholder:text-gray-400"
                  />
                  <div className="mt-1 text-right text-xs text-[#002e85]/70">
                    {t.compteurChars(commentaire.length, MAX_COMMENTAIRE)}
                  </div>
                </div>

                {/* D1 : slider NPS (uniquement si note ≥ 4) */}
                {estPositif && (
                  <div className="rounded-2xl border-2 border-[#002e85]/30 bg-[#002e85]/5 p-4">
                    <p className="text-sm font-semibold text-[#002e85]">{t.questionNps}</p>
                    <p className="text-xs text-[#002e85]/70">{t.npsSousTitre}</p>
                    <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#002e85]/70">
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
                      <span className="inline-flex min-w-16 items-center justify-center rounded-full bg-white px-4 py-1.5 text-2xl font-bold text-[#002e85] shadow">
                        {nps}
                      </span>
                      <span className="text-sm text-[#002e85]/80">/ 10</span>
                      <span className="ms-2 text-xl" aria-hidden>
                        {nps >= 9 ? "😍" : nps >= 7 ? "😊" : "😐"}
                      </span>
                    </div>
                  </div>
                )}

                {/* D2 : ajout de photo (optionnel) — 2 cards côte à côte */}
                <div>
                  <p className="mb-1.5 text-sm font-medium text-[#002e85]/90">{t.photoLabel}</p>
                  {photoUrl ? (
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-[#002e85] bg-white p-2.5">
                      <img
                        src={photoUrl}
                        alt="Photo jointe"
                        className="size-16 shrink-0 rounded-lg border border-gray-300 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-600">{t.photoAide}</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            <Upload className="h-3.5 w-3.5" aria-hidden />
                            {t.photoChanger}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoUrl(null)
                              setPhotoErreur(null)
                            }}
                            className="flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            {t.photoRetirer}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Bouton principal : Prendre une photo (mobile-first).
                          Sur mobile, `capture="environment"` ouvre directement
                          l'appareil photo (caméra arrière). Sur desktop, ouvre
                          le sélecteur de fichier classique. */}
                      <button
                        type="button"
                        onClick={() => photoCameraRef.current?.click()}
                        disabled={photoEnCours}
                        className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-[#002e85] bg-white py-2.5 text-sm font-semibold text-gray-900 transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {photoEnCours ? (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        ) : (
                          <Camera className="h-5 w-5" aria-hidden />
                        )}
                        <span className="text-xs">
                          {photoEnCours ? t.photoEnCours : t.photoPrendre}
                        </span>
                      </button>
                      {/* Bouton secondaire : Choisir une image depuis la galerie. */}
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoEnCours}
                        className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-[#002e85] bg-white py-2.5 text-sm font-semibold text-gray-900 transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ImagePlus className="h-5 w-5" aria-hidden />
                        <span className="text-xs">{t.photoChoisir}</span>
                      </button>
                    </div>
                  )}
                  <p className="mt-1.5 text-center text-xs text-[#002e85]/70">{t.photoAide}</p>
                  {/* Input caché appareil photo (capture=environment) */}
                  <input
                    ref={photoCameraRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    capture="environment"
                    className="sr-only"
                    onChange={onPhotoChoisie}
                    aria-label={t.photoPrendre}
                    tabIndex={-1}
                  />
                  {/* Input caché galerie (sans capture) */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={onPhotoChoisie}
                    aria-label={t.photoChoisir}
                    tabIndex={-1}
                  />
                  {photoErreur && (
                    <p className="mt-1.5 text-xs text-rose-200" role="alert">
                      {photoErreur}
                    </p>
                  )}
                </div>

                {/* Email optionnel : permet au commerçant de répondre par email */}
                <div>
                  <Input
                    type="email"
                    inputMode="email"
                    value={emailClient}
                    onChange={(e) => setEmailClient(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                    aria-label={t.emailLabel}
                    placeholder={t.emailLabel}
                    className="h-12 border-2 border-[#002e85] bg-white text-base text-gray-900 placeholder:text-gray-400"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-[#002e85]/70">{t.emailAide}</p>
                </div>

                {/* Consentement géolocalisation approximative (RGPD — opt-in) */}
                <div className="rounded-2xl border-2 border-[#002e85]/30 bg-[#002e85]/5 p-3">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="geo-consent"
                      checked={geoConsent}
                      onCheckedChange={(v) => setGeoConsent(v === true)}
                      className="mt-0.5 border-[#002e85]"
                    />
                    <label
                      htmlFor="geo-consent"
                      className="cursor-pointer text-xs leading-relaxed text-[#002e85]/85"
                    >
                      {t.geoConsent}{" "}
                      <a
                        href="/confidentialite"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#002e85] underline underline-offset-2"
                      >
                        {t.politique}
                      </a>
                    </label>
                  </div>
                </div>

                {/* Badge récompense (teaser — code promo dévoilé au succès) */}
                {scanData.pro.recompense && (
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
                    <Gift className="size-6 shrink-0 text-amber-700" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-900">
                        {t.recompenseBadgePrefix} {scanData.pro.recompense}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800/90">{t.recompenseMontrez}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------- ÉTAPE 4 — RÉCAPITULATIF + ENVOI (NOUVELLE ÉTAPE) ----------
              Écran de vérification visuel : card blanche avec note + tags +
              personnel + commentaire + photo + NPS, boutons « Modifier » pour
              revenir à chaque étape, puis bouton « Envoyer » plein largeur
              dans le footer (et WhatsApp + avis Google si configurés). */}
          {phase === "step4" && scanData && (
            <div className="flex flex-1 flex-col">
              <div className="mb-5 flex justify-center">
                <LogoPetit pro={scanData.pro} zone={scanData.zone} />
              </div>

              <div className="flex flex-col items-center text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#002e85]/70 sm:text-sm">
                  {t.etapeSur(numEtape, TOTAL_ETAPES, sujetEtape)}
                </p>
                <h1 className="mt-3 text-balance text-2xl font-black leading-tight text-[#002e85] sm:text-3xl">
                  {t.titreEnvoiH1}
                </h1>
                <p className="mt-2 text-sm text-[#002e85]/70 sm:text-base">{t.sousTitreEnvoi}</p>
              </div>

              <div className="mt-6 max-h-[60vh] flex-1 overflow-y-auto pe-1 fp-scan-scroll">
                {/* Récap card (blanche, border-2 noir) */}
                <div className="rounded-2xl border-2 border-[#002e85] bg-white p-4 text-gray-900">
                  {/* Note */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-600">
                      {t.recapVotreNote}
                    </span>
                    <button
                      type="button"
                      onClick={() => allerEtape("step1", -1)}
                      className="text-xs font-semibold text-[#002e85] underline underline-offset-2 hover:text-[#002e85]"
                    >
                      {t.recapModifier}
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        aria-hidden
                        className={cn(
                          "size-5",
                          i <= note
                            ? "fill-amber-400 text-amber-400"
                            : "fill-gray-200 text-gray-200"
                        )}
                      />
                    ))}
                    <span className="ms-2 text-sm font-bold text-gray-700">{note}/5</span>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-600">
                          {t.recapTags}
                        </span>
                        <button
                          type="button"
                          onClick={() => allerEtape("step2", -1)}
                          className="text-xs font-semibold text-[#002e85] underline underline-offset-2 hover:text-[#002e85]"
                        >
                          {t.recapModifier}
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {tags.map((id) => {
                          const def = definitionTag(id, estPositif)
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-[#002e85]"
                            >
                              <span aria-hidden>{def.emoji}</span>
                              {def.label}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Personnel */}
                  {personnel.trim() && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <span className="text-sm font-semibold text-gray-600">
                        {t.recapPersonnelAjoute}
                      </span>
                      <p className="mt-0.5 text-sm text-gray-800">{personnel.trim()}</p>
                    </div>
                  )}

                  {/* Commentaire */}
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-600">
                        {t.recapVotreCommentaire}
                      </span>
                      <button
                        type="button"
                        onClick={() => allerEtape("step3", -1)}
                        className="text-xs font-semibold text-[#002e85] underline underline-offset-2 hover:text-[#002e85]"
                      >
                        {t.recapModifier}
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-800">
                      {commentaire.trim() || t.recapAucunCommentaire}
                    </p>
                  </div>

                  {/* Photo */}
                  {photoUrl && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <span className="text-sm font-semibold text-gray-600">
                        {t.recapPhotoAjoutee}
                      </span>
                      <img
                        src={photoUrl}
                        alt="Photo jointe"
                        className="mt-1.5 size-20 rounded-lg border border-gray-300 object-cover"
                      />
                    </div>
                  )}

                  {/* NPS */}
                  {estPositif && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <span className="text-sm font-semibold text-gray-600">{t.recapNps}</span>
                      <p className="mt-0.5 text-sm text-gray-800">{nps}/10</p>
                    </div>
                  )}

                  {/* Email */}
                  {emailClient.trim() && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <span className="text-sm font-semibold text-gray-600">{t.emailLabel}</span>
                      <p className="mt-0.5 text-sm text-gray-800">{emailClient.trim()}</p>
                    </div>
                  )}
                </div>

                {/* Erreur d'envoi (inline, données conservées) */}
                {erreurEnvoi && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <div>
                      <p>{erreurEnvoi}</p>
                      <button
                        type="button"
                        onClick={() => envoyer(dernierCanal)}
                        className="mt-1 text-sm font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-800"
                      >
                        {t.reessayer}
                      </button>
                    </div>
                  </div>
                )}

                {/* Rassurance selon la note */}
                <p className="mt-4 text-center text-xs leading-relaxed text-[#002e85]/80">
                  {estPositif ? t.rassurancePositif : t.rassuranceNegatif}
                </p>
              </div>
            </div>
          )}

          {/* ---------- ÉTAPE 5 — REMERCIEMENT ---------- */}
          {phase === "success" && scanData && (
            <div className="relative flex flex-1 flex-col items-center justify-center gap-4 py-4 text-center">
              {/* Confettis (4-5★) OU cœur pulsé (1-3★) */}
              {estPositif ? <ConfettiLeger /> : null}

              {estPositif ? (
                <div
                  aria-hidden
                  className="fp-scan-pop fp-scan-halo flex size-20 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg"
                >
                  <Check className="size-10" strokeWidth={3} />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="fp-scan-heart flex size-20 items-center justify-center text-5xl"
                >
                  💗
                </div>
              )}

              <h1 className="text-balance text-3xl font-black text-[#002e85] sm:text-4xl">
                {t.merci}
              </h1>

              <p className="text-balance text-base font-medium text-[#002e85]/80">
                {estPositif ? t.merciPositifCourt : t.merciNegatifCourt}
              </p>

              {/* Task M3 — Bandeau "hors ligne" si le retour a été stocké
                  sans réseau plutôt qu'envoyé immédiatement. */}
              {horsLigne && (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-xl border border-[#002e85]/30 bg-[#002e85]/5 px-4 py-2.5 text-sm font-medium text-[#002e85]"
                >
                  <span aria-hidden>📡</span>
                  <span>{t.retourEnregistreHorsLigne}</span>
                </div>
              )}

              {/* Récompense (code promo dévoilé APRÈS envoi) */}
              {recompenseFinale ? (
                <div className="fp-scan-reward-in w-full max-w-md rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-lg">
                  <p className="text-balance text-lg font-bold leading-snug text-gray-900">
                    {t.recompenseTitre(recompenseFinale)}
                  </p>
                  {codeRecompense && (
                    <div className="mt-3 flex flex-col items-center gap-1">
                      <span
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 font-mono text-3xl font-bold tracking-wider text-amber-700"
                        aria-label={`Code promo : ${codeRecompense}`}
                      >
                        <Ticket className="size-6 text-amber-600" aria-hidden />
                        {codeRecompense}
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-center text-sm text-gray-600">
                    {t.recompenseMontrez}
                  </p>
                </div>
              ) : estPositif ? (
                <p className="text-balance text-sm text-[#002e85]/80">
                  {t.merciPositif(scanData.pro.nomEtablissement)}
                </p>
              ) : (
                /* Carte rassurante pour les retours 1-3★ */
                <div className="flex items-start gap-3 rounded-2xl border border-[#002e85]/30 bg-[#002e85]/5 p-4 text-left">
                  <ShieldCheck className="mt-0.5 size-8 shrink-0 text-[#002e85]" aria-hidden />
                  <p className="text-sm leading-relaxed text-[#002e85]/85">{t.merciNegatif}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ====== Footer (progress bar + Suivant/Envoyer) ====== */}
      {avecFooterProgress && (
        <footer className="space-y-3 px-4 pb-4 sm:px-6">
          {/* Barre de progression — 4 segments (QRTags style) */}
          <div
            className="flex gap-1.5"
            role="progressbar"
            aria-valuenow={numEtape}
            aria-valuemin={0}
            aria-valuemax={TOTAL_ETAPES}
            aria-label={t.ariaProgression}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
                aria-hidden
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-colors duration-300",
                    i <= numEtape ? "bg-white" : "bg-transparent"
                  )}
                />
              </div>
            ))}
          </div>

          {/* Bouton « Suivant » (étape 2) — désactivé si aucun tag */}
          {phase === "step2" && (
            <button
              type="button"
              onClick={() => allerEtape("step3", 1)}
              disabled={tags.length === 0}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-2xl bg-[#002e85] py-4 text-lg font-bold text-white shadow-lg transition-all",
                tags.length === 0
                  ? "cursor-not-allowed opacity-50"
                  : "hover:scale-[1.01] active:scale-[0.99]"
              )}
            >
              {t.suivant}
              <ArrowRight className="size-5" aria-hidden />
            </button>
          )}

          {/* Bouton « Suivant » (étape 3) */}
          {phase === "step3" && (
            <button
              type="button"
              onClick={() => allerEtape("step4", 1)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#002e85] py-4 text-lg font-bold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {t.suivant}
              <ArrowRight className="size-5" aria-hidden />
            </button>
          )}

          {/* Étape 4 — Bouton principal « Envoyer » + WhatsApp + avis Google */}
          {phase === "step4" && (
            <>
              <button
                type="button"
                onClick={() => envoyer("aucun")}
                disabled={soumission !== null}
                className={cn(
                  "fp-scan-pulse-soft flex w-full items-center justify-center gap-2 rounded-2xl bg-[#002e85] py-5 text-xl font-bold text-white shadow-lg transition-all",
                  soumission !== null
                    ? "cursor-wait opacity-80"
                    : "hover:scale-[1.01] active:scale-[0.99]"
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

              {/* Canal secondaire WhatsApp (masqué si aucun numéro) */}
              {aWhatsApp && (
                <button
                  type="button"
                  onClick={() => envoyer("whatsapp")}
                  disabled={soumission !== null}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-500 text-base font-bold text-[#002e85] shadow-lg transition-all hover:bg-green-600 disabled:cursor-wait disabled:opacity-80"
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
                </button>
              )}

              {/* D8 : avis Google — lien discret (si 4-5★ + URL configurée) */}
              {lienAvisGoogle && (
                <a
                  href={lienAvisGoogle}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                >
                  <span aria-hidden>⭐</span>
                  {t.avisGoogle}
                </a>
              )}
            </>
          )}
        </footer>
      )}

      {/* ====== Success footer (Fermer + avis Google) ====== */}
      {phase === "success" && (
        <footer className="space-y-3 px-4 pb-4 sm:px-6">
          {lienAvisGoogle && (
            <a
              href={lienAvisGoogle}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
            >
              <span aria-hidden>⭐</span>
              {t.avisGoogle}
              <span className="text-xs font-normal text-amber-700/80">
                — {t.avisGoogleAide}
              </span>
            </a>
          )}
          <button
            type="button"
            onClick={onExit}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#002e85] py-4 text-base font-bold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            {t.fermer}
          </button>
        </footer>
      )}

      {/* ====== "Propulsé par FeedbackPro" discret (welcome + error) ====== */}
      {(phase === "welcome" || phase === "error") && (
        <p className="pb-4 text-center text-xs text-[#002e85]/60">
          {t.propulsePar} <span className="font-semibold text-[#002e85]/80">FeedbackPro</span>
        </p>
      )}
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
        key={pro.logoUrl}
        src={pro.logoUrl}
        alt={`Logo ${pro.nomEtablissement}`}
        onError={() => setLogoUrlEnEchec(pro.logoUrl ?? null)}
        loading="eager"
        decoding="async"
        // referrerPolicy : évite le blocage hotlink sur les logos distants (https);
        // sans effet sur les data: URLs (logos uploadés côté dashboard).
        referrerPolicy="no-referrer"
        className="size-24 rounded-3xl border-2 border-[#002e85] bg-white object-cover shadow-md sm:size-32"
      />
    )
  }
  return (
    <div
      aria-hidden
      className="flex size-24 items-center justify-center rounded-3xl border-2 border-[#002e85] bg-white text-5xl font-black text-[#002e85] shadow-md sm:size-32 sm:text-6xl"
    >
      {initiale}
    </div>
  )
}

// ---------- Logo petit (en-tête wizard QRTags — étapes 1 à 4) ----------
// Petit logo (40 px) + nom établissement. Sur fond bleu plein : le logo est
// cadré sur fond blanc, le nom en blanc bold. Si pas de logo distant, on
// affiche l'initiale dans un cercle blanc.
function LogoPetit({ pro, zone }: { pro: ScanData["pro"]; zone: ScanData["zone"] }) {
  const [logoUrlEnEchec, setLogoUrlEnEchec] = useState<string | null>(null)
  const afficherLogo = Boolean(pro.logoUrl) && logoUrlEnEchec !== pro.logoUrl
  const initiale = pro.nomEtablissement.charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-2.5">
      {afficherLogo && pro.logoUrl ? (
        <img
          key={pro.logoUrl}
          src={pro.logoUrl}
          alt={`Logo ${pro.nomEtablissement}`}
          onError={() => setLogoUrlEnEchec(pro.logoUrl ?? null)}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-10 shrink-0 rounded-xl border-2 border-[#002e85] bg-white object-cover shadow"
        />
      ) : (
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#002e85] bg-white text-lg font-black text-[#002e85] shadow"
        >
          {initiale}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight text-[#002e85]">
          {pro.nomEtablissement}
        </p>
        <p className="truncate text-xs text-[#002e85]/70">
          <span aria-hidden className="me-1">📍</span>
          {zone.nom}
        </p>
      </div>
    </div>
  )
}
