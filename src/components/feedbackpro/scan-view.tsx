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
function definitionTag(id: string, positif: boolean): TagDef {
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

function ConfettiLeger() {
  // Généré une seule fois au montage (memo) — pas de boucle infinie
  const morceaux = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        // dx : dérive horizontale (-140 à +140 px)
        const dx = Math.round((Math.random() - 0.5) * 280)
        // dy : chute verticale (220 à 360 px)
        const dy = Math.round(220 + Math.random() * 140)
        // rotation finale aléatoire
        const dr = Math.round(Math.random() * 720 - 360)
        // délai d'apparition échelonné
        const delai = Math.round(Math.random() * 40) / 100
        const couleur = COULEURS_CONFETTI[i % COULEURS_CONFETTI.length]
        const largeur = 6 + Math.round(Math.random() * 6)
        return { id: i, dx, dy, dr, delai, couleur, largeur }
      }),
    []
  )
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
    >
      {morceaux.map((m) => (
        <span
          key={m.id}
          className="fp-scan-confetti absolute top-6 block rounded-[2px]"
          style={{
            backgroundColor: m.couleur,
            width: m.largeur,
            height: Math.round(m.largeur * 0.5),
            // Variables CSS consommées par la keyframe fp-scan-confetti
            ["--dx" as string]: `${m.dx}px`,
            ["--dy" as string]: `${m.dy}px`,
            ["--dr" as string]: `${m.dr}deg`,
            animationDelay: `${m.delai}s`,
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

    try {
      const res = await fetch("/api/public/retour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
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
      // Échec : on ferme l'onglet vide et on garde toutes les réponses saisies
      fenetre?.close()
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

  // Indice d'étape pour la barre de progression (3 segments : Note | Tags | Envoi)
  // welcome = 0 actif (tout muted) ; step1 = seg1 ; step2 = seg2 ; step3/success = seg3
  const etapeIdx =
    phase === "welcome" ? -1 : phase === "step1" ? 0 : phase === "step2" ? 1 : 2

  // Classe d'animation de transition entre étapes (CSS pur — pas de framer)
  const classeTransition =
    phase === "welcome"
      ? "fp-scan-welcome"
      : sens === 1
        ? "fp-scan-slide-right"
        : "fp-scan-slide-left"

  // Fond contextuel de la carte (spec refonte) :
  // - step1 : vert très pâle si 4-5★, rouge très pâle si 1-3★ (transition 300 ms)
  // - step2 : bg-emerald-50 si positif, bg-rose-50 si négatif
  // - autres : bg-card
  const fondContextuel = (() => {
    if (phase === "step1") {
      if (note === 0) return "border-border bg-card"
      return estPositif
        ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20"
        : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20"
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
            "relative overflow-hidden rounded-3xl border shadow-xl transition-colors duration-300",
            fondContextuel
          )}
        >
          {/* Barre de progression fine (3 px) — 3 segments Note | Tags | Envoi */}
          {phase !== "error" && (
            <div className="flex gap-1.5 px-6 pt-4 sm:px-8" aria-hidden>
              {[0, 1, 2].map((s) => (
                <div
                  key={s}
                  className={cn(
                    "h-[3px] flex-1 rounded-full transition-colors duration-300",
                    phase === "success" || s <= etapeIdx ? "bg-primary" : "bg-muted"
                  )}
                />
              ))}
            </div>
          )}

          {/* Sélecteur de langue (D3) — discret, en haut à gauche */}
          {phase !== "error" && (
            <div className="absolute left-4 top-3 sm:left-6 sm:top-4">
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

          <div className="p-5 sm:p-7">
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
                ou la gauche selon le sens, ou fade-scale pour la bienvenue). */}
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

              {/* ---------- ÉTAPE 0 — BIENVENUE (auto-transition 2 s) ---------- */}
              {phase === "welcome" && scanData && (
                <button
                  type="button"
                  onClick={passerAuStep1}
                  className="flex w-full flex-col items-center gap-4 py-6 text-center outline-none"
                  aria-label={t.bienvenueTap}
                >
                  {/* Logo centré (ou initiale si pas de logo) */}
                  <LogoEtablissementBig pro={scanData.pro} />

                  <div className="space-y-1.5">
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

                  {/* Phrase d'accroche adaptée au type de zone */}
                  <p className="mt-2 max-w-xs text-balance text-base font-medium leading-snug text-foreground/80">
                    {phraseAccroche(scanData.zone.nom, t)}
                  </p>

                  {/* Indicateur "tap to start" pulsé */}
                  <span
                    aria-hidden
                    className="fp-scan-tap-pulse mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
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

                  {/* 5 étoiles très grandes (taille 64 px desktop, 56 px mobile).
                      flex-1 + max-w évite tout débordement horizontal, même sur
                      iPhone SE. Touch target ≥ 56 px (≥ 48 px spec accessibilité). */}
                  <div
                    role="radiogroup"
                    aria-label={t.ariaEtoiles}
                    onKeyDown={etoileClavier}
                    className="mt-7 flex w-full justify-center gap-0.5 sm:gap-1"
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
                            "flex h-16 min-w-0 max-w-[4.5rem] flex-1 items-center justify-center rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-20",
                            isClicked && "fp-scan-star-bounce",
                            isCascading && "fp-scan-star-fill"
                          )}
                          style={isCascading ? { animationDelay: `${(i - 1) * 50}ms` } : undefined}
                        >
                          <Star
                            aria-hidden
                            strokeWidth={1.5}
                            className={cn(
                              "size-14 transition-colors duration-150 sm:size-16",
                              active
                                ? "fill-amber-400 text-amber-400"
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

                  <div
                    role="group"
                    aria-label={estPositif ? t.ariaTagsPositifs : t.ariaTagsNegatifs}
                    className="mt-5 flex flex-wrap gap-2.5"
                  >
                    {idsTags.map((id) => {
                      const def = definitionTag(id, estPositif)
                      const actif = tags.includes(id)
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={actif}
                          onClick={() => basculerTag(id)}
                          className={cn(
                            "inline-flex min-h-12 min-w-0 max-w-full items-center gap-1.5 rounded-full border-2 px-4 py-2.5 text-sm font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-base",
                            actif
                              ? estPositif
                                ? "scale-105 border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-100"
                                : "scale-105 border-rose-500 bg-rose-100 text-rose-900 dark:border-rose-400 dark:bg-rose-900/40 dark:text-rose-100"
                              : "border-border bg-background text-foreground/80 hover:border-foreground/30 hover:bg-muted",
                            actif && "fp-scan-tag-pop"
                          )}
                        >
                          <span aria-hidden className="text-base leading-none">
                            {actif ? <Check className="size-4" /> : def.emoji}
                          </span>
                          <span className="min-w-0 break-words leading-tight">{def.label}</span>
                        </button>
                      )
                    })}
                  </div>

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

                  {/* Bouton Continuer — bleu plein, gros, en bas de l'étape */}
                  <div className="mt-auto pt-6">
                    <Button
                      onClick={() => allerEtape("step3", 1)}
                      className="h-14 w-full rounded-2xl text-base font-semibold"
                    >
                      {t.continuer} <ArrowRight aria-hidden className="size-4" />
                    </Button>
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

                  {/* Récapitulatif visuel (mini-carte) : note + tags + personnel */}
                  <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
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

                  {/* Textarea auto-resize (field-sizing natif), max 500 chars, compteur */}
                  <div className="mt-4">
                    <Textarea
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value.slice(0, MAX_COMMENTAIRE))}
                      rows={3}
                      maxLength={MAX_COMMENTAIRE}
                      aria-label={t.titreCommentaire}
                      placeholder={estPositif ? t.commentairePositif : t.commentaireNegatif}
                      className="max-h-48 min-h-24 text-base"
                    />
                    <div className="mt-1 text-right text-xs text-muted-foreground">
                      {t.compteurChars(commentaire.length, MAX_COMMENTAIRE)}
                    </div>
                  </div>

                  {/* D1 : slider NPS (uniquement si note ≥ 4) */}
                  {estPositif && (
                    <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
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
                        <span className="inline-flex min-w-16 items-center justify-center rounded-full bg-primary px-4 py-1.5 text-2xl font-bold text-primary-foreground">
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

                  {/* Bouton principal « Envoyer » (bleu plein, gros, h-14 rounded-2xl) */}
                  <Button
                    onClick={() => envoyer("aucun")}
                    disabled={soumission !== null}
                    className="mt-5 h-14 w-full rounded-2xl text-base font-bold"
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
                  </Button>

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

                  {/* Récompense : carte mise en valeur + code promo en gros */}
                  {recompenseFinale ? (
                    <div className="fp-scan-reward-in w-full rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-md shadow-amber-500/10 dark:border-amber-700 dark:bg-amber-950/30">
                      <p className="text-balance text-lg font-bold leading-snug text-amber-900 dark:text-amber-200">
                        {t.recompenseTitre(recompenseFinale)}
                      </p>
                      {codeRecompense && (
                        <span
                          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-white px-3 py-1.5 font-mono text-base font-bold tracking-wide text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
                          aria-label={`Code promo : ${codeRecompense}`}
                        >
                          <Ticket className="size-4" aria-hidden />
                          {codeRecompense}
                        </span>
                      )}
                      <p className="mt-1.5 text-sm text-amber-800/90 dark:text-amber-300/80">
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
