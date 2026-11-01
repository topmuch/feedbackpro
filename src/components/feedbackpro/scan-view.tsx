"use client"

// ============================================================
// FeedbackPro - ScanView (flux client final, 100 % mobile)
// Le client a scanné le QR code d'une ZONE (Accueil, Salle,
// Toilettes RDC…) imprimée dans le commerce. Sans authentification.
// Machine à états :
//   loading → error | step1 (note) → [step1b (NPS si note ≥ 4)] →
//   step2 (tags) → step3 (commentaire + photo + envoi) → success
//
// D1 (NPS) : si la note est ≥ 4★, on demande le NPS (0-10) avant les tags.
// D2 (Photos) : un bouton « Ajouter une photo » à l'étape 3 (upload
//   POST /api/public/upload, max 5 Mo, redimensionné côté serveur).
// D3 (i18n) : FR / EN / AR avec dir="rtl" pour l'arabe.
// D8 (Google) : si pro.googleReviewUrl est défini et note ≥ 4★, l'écran de
//   succès propose « Laissez un avis Google ».
//
// Contrat API :
//   POST /api/public/scan   { qrToken }
//     → { ok, data: { zone: { nom, description }, pro: { nomEtablissement, logoUrl, recompense, whatsapp, messageWhatsapp, googleReviewUrl }, tagsPositifs: string[], tagsNegatifs: string[] } }
//   POST /api/public/retour { qrToken, note, tags[], commentaire?, personnelMentionne?, canalChoisi?, nps?, photoUrl? }
//     → { ok, data: { retour, recompense: string | null, codeRecompense: string | null } }
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
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
    // Non listé dans le contrat minimal mais indispensable pour le bouton WhatsApp :
    // s'il est absent, le bouton WhatsApp est masqué (uniquement « Terminer »).
    whatsapp?: string | null
    // Signature personnalisée du pied du message WhatsApp (optionnel)
    messageWhatsapp?: string | null
    // D8 : URL d'avis Google (saisie manuelle par le commerçant)
    googleReviewUrl?: string | null
  }
  tagsPositifs: string[]
  tagsNegatifs: string[]
}

type Phase = "loading" | "error" | "step1" | "step1b" | "step2" | "step3" | "success"
type CanalEnvoi = "whatsapp" | "aucun"

// ---------- Constantes d'affichage ----------

// Émoji affichés sous les étoiles selon la note survolée / choisie
const EMOJIS_NOTE: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😍" }

// Palette du confetti de l'écran de succès (léger, one-shot)
const COULEURS_CONFETTI = ["#2563EB", "#22C55E", "#F59E0B", "#EC4899", "#8B5CF6"]

// Transition slide + fade entre les étapes (sens = 1 avancer / -1 reculer)
const variantesEtape = {
  entree: (sens: number) => ({ opacity: 0, x: 40 * sens }),
  visible: { opacity: 1, x: 0 },
  sortie: (sens: number) => ({ opacity: 0, x: -40 * sens }),
}

// ---------- Petits utilitaires ----------

// Retrouve le libellé + l'émoji d'un id de tag reçu de l'API.
// On cherche d'abord dans la liste correspondant au contexte (positif/négatif),
// puis dans les deux listes, et en dernier recours on affiche l'id brut.
function definitionTag(id: string, positif: boolean): TagDef {
  const liste = positif ? POSITIVE_TAGS_ETENDUS : NEGATIVE_TAGS_ETENDUS
  return (
    liste.find((t) => t.id === id) ?? ALL_TAGS.find((t) => t.id === id) ?? { id, label: id, emoji: "🏷️" }
  )
}

// ---------- Sélecteur de langue (D3) ----------

function SelecteurLangue({ langue, onChange }: { langue: LangueScan; onChange: (l: LangueScan) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const courant = LANGUES_SCAN.find((l) => l.id === langue) ?? LANGUES_SCAN[0]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
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
          <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
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
                  l.id === langue ? "bg-primary/5 font-semibold text-primary" : "text-stone-700 hover:bg-stone-50"
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-stone-100 p-4" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <div
        aria-hidden
        className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-lg"
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
        <Skeleton className="mt-8 h-14 w-full rounded-xl" />
      </div>
      <p className="text-sm text-muted-foreground">{t.charger}</p>
    </div>
  )
}

// ---------- En-tête commun : logo + nom + badge zone + sous-titre ----------

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
  // Fallback local si le logo distant ne charge pas : on mémorise l'URL en échec
  // (pas d'effet nécessaire : un changement de logoUrl est retenté automatiquement)
  const [logoUrlEnEchec, setLogoUrlEnEchec] = useState<string | null>(null)
  const afficherLogo = Boolean(pro.logoUrl) && logoUrlEnEchec !== pro.logoUrl
  const initiale = pro.nomEtablissement.charAt(0).toUpperCase()

  return (
    <header className={cn("mb-6", avecMarge && "pr-12")}>
      <div className="flex items-center gap-3">
        {afficherLogo && pro.logoUrl ? (
          <img
            src={pro.logoUrl}
            alt={`Logo ${pro.nomEtablissement}`}
            className="size-14 shrink-0 rounded-2xl border border-stone-200 object-cover"
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
          <p className="truncate text-lg font-bold leading-tight text-stone-900">
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
        <p className="mt-3 border-t border-stone-100 pt-3 text-sm font-medium text-stone-500">
          {t.sousTitre}
        </p>
      )}
    </header>
  )
}

// ---------- Confetti léger (one-shot, aria-hidden, aucune boucle infinie) ----------

function ConfettiLeger() {
  const morceaux = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.round((Math.random() - 0.5) * 280),
        y: Math.round(100 + Math.random() * 90),
        rotation: Math.round(Math.random() * 360 - 180),
        delai: Math.round(Math.random() * 30) / 100,
        couleur: COULEURS_CONFETTI[i % COULEURS_CONFETTI.length],
        largeur: 6 + Math.round(Math.random() * 5),
      })),
    []
  )
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
    >
      {morceaux.map((m) => (
        <motion.span
          key={m.id}
          className="absolute top-5 block rounded-[2px]"
          style={{ backgroundColor: m.couleur, width: m.largeur, height: Math.round(m.largeur * 0.55) }}
          initial={{ opacity: 0, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: [0, 1, 1, 0], x: m.x, y: m.y, rotate: m.rotation }}
          transition={{ duration: 1.5, delay: m.delai, ease: "easeOut" }}
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
  const [sens, setSens] = useState(1)
  const [scanData, setScanData] = useState<ScanData | null>(null)
  const [erreurScan, setErreurScan] = useState<string | null>(null)

  // Réponses du client
  const [note, setNote] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [personnel, setPersonnel] = useState("")
  const [commentaire, setCommentaire] = useState("")
  // Email (optionnel) : permet au commerçant de répondre au client par email
  const [emailClient, setEmailClient] = useState("")

  // D1 : NPS (0-10) — collecté à l'étape 1b, uniquement si note ≥ 4
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
  // Code promo dévoilé sur l'écran de remerciement (Session 3)
  const [codeRecompense, setCodeRecompense] = useState<string | null>(null)
  // Audit RGPD : consentement opt-in pour enregistrer la ville approximative
  // (déduite de l'IP) — décoché par défaut, jamais requis pour envoyer un retour
  const [geoConsent, setGeoConsent] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Nettoyage du timer de transition étoile → étape suivante
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // D3 : détection initiale de la langue (une seule fois au montage)
  useEffect(() => {
    const mem = lireLangueMemorisee()
    setLangue(mem ?? detecterLangueNavigateur())
  }, [])

  function changerLangue(l: LangueScan) {
    setLangue(l)
    memoriserLangue(l)
  }

  const estPositif = note >= 4
  // Note affichée : celle survolée (prévisualisation) sinon celle choisie
  const afficheNote = survol ?? note

  // Récompense affichée sur l'écran de succès : celle gagnée à l'envoi, sinon celle du pro
  const recompenseFinale = recompenseGagnee ?? scanData?.pro.recompense ?? null
  const numeroWhatsApp = (scanData?.pro.whatsapp ?? "").replace(/[^0-9]/g, "")
  const aWhatsApp = numeroWhatsApp.length > 0
  // D8 : avis Google proposé si l'URL est configurée ET que la note est positive
  const lienAvisGoogle = estPositif && scanData?.pro.googleReviewUrl ? scanData.pro.googleReviewUrl : null

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
      setSens(1)
      setPhase("step1")
    } catch (e) {
      setScanData(null)
      setErreurScan(e instanceof Error ? e.message : null)
      setPhase("error")
    }
  }, [token])

  useEffect(() => {
    chargerScan()
  }, [chargerScan])

  // ---------- Navigation entre les étapes ----------
  function allerEtape(suivante: Phase, direction: number) {
    setSens(direction)
    setPhase(suivante)
  }

  function annulerTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // ---------- Étape 1 : la note ----------
  function choisirNote(n: number) {
    setNote(n)
    // Les tags dépendent de la note : on repart d'une sélection vide
    setTags([])
    setPulse(n)
    annulerTimer()
    // D1 : si la note est ≥ 4★, on propose le NPS (étape 1b) avant les tags ;
    // sinon on passe directement aux tags négatifs (étape 2).
    timerRef.current = setTimeout(() => allerEtape(n >= 4 ? "step1b" : "step2", 1), 600)
  }

  function retourVersNote() {
    annulerTimer()
    setPulse(null)
    allerEtape("step1", -1)
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

  // ---------- Étape 2 : les tags (adaptés à la note ET à la zone) ----------
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
    // Validation côté client (taille + type) — le serveur re-valide aussi
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
          // RGPD : la ville approximative n'est enregistrée que si le client
          // a explicitement coché la case de consentement à l'étape 3
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
      // Code promo dévoilé APRÈS l'envoi effectif (jamais avant — Session 3)
      if (typeof json.data?.codeRecompense === "string" && json.data.codeRecompense) {
        setCodeRecompense(json.data.codeRecompense as string)
      }

      // Ouvre WhatsApp avec le message pré-rempli (uniquement si un numéro est configuré)
      if (canal === "whatsapp" && numero) {
        // Message structuré selon la spec (lib partagée) :
        // 🎉/⚠️ · 📍 Établissement - Zone · ⭐ Note · 📅 Date+heure ·
        // 🏷️ Tags (avec émojis) · 👤 Personnel · 💬 Détails · pied FeedbackPro
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
      const message = e instanceof Error ? e.message : "Impossible d'envoyer le retour pour le moment"
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

  // Indice d'étape pour la barre de progression (3 segments ; step1b compté
  // comme faisant partie du segment 0 — la barre reste visuellement stable).
  const etapeIdx = phase === "step1" || phase === "step1b" ? 0 : phase === "step2" ? 1 : 2

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-stone-100 p-3 sm:p-6" dir={t.dir}>
      <div className="w-full max-w-md">
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border shadow-lg transition-colors duration-300",
            // Fond contextuel de l'étape 2 (spec Session 3) :
            // vert clair si 4-5★ · rouge/orange clair si 1-3★
            phase === "step2" && estPositif && "border-green-200 bg-green-50",
            phase === "step2" && !estPositif && "border-orange-200 bg-orange-50",
            phase !== "step2" && "border-stone-200 bg-white"
          )}
        >
          {/* Barre de progression fine : 3 segments */}
          {phase !== "error" && (
            <div className="flex gap-1.5 px-6 pt-5 sm:px-8" aria-hidden>
              {[0, 1, 2].map((s) => (
                <div
                  key={s}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors duration-300",
                    phase === "success" || s <= etapeIdx ? "bg-primary" : "bg-stone-200"
                  )}
                />
              ))}
            </div>
          )}

          {/* Sélecteur de langue (D3) — discret, en haut à droite */}
          {phase !== "error" && (
            <div className="absolute left-6 top-4 sm:left-8">
              <SelecteurLangue langue={langue} onChange={changerLangue} />
            </div>
          )}

          {/* Bouton discret Quitter (étapes 1 à 3) */}
          {onExit &&
            (phase === "step1" || phase === "step1b" || phase === "step2" || phase === "step3") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onExit}
                aria-label={t.quitter}
                className="absolute right-3 top-4 z-10 size-11 rounded-full text-stone-400 hover:text-stone-600"
              >
                <X className="size-5" aria-hidden />
              </Button>
            )}

          <div className="p-6 sm:p-8">
            {/* En-tête du pro + zone sur toutes les étapes du formulaire et l'écran de succès */}
            {scanData && phase !== "error" && (
              <EnTeteEtablissement
                pro={scanData.pro}
                zone={scanData.zone}
                avecSousTitre={phase !== "success"}
                avecMarge={phase !== "success"}
                t={t}
              />
            )}

            <AnimatePresence mode="wait" initial={false} custom={sens}>
              <motion.div
                key={phase}
                custom={sens}
                variants={variantesEtape}
                initial="entree"
                animate="visible"
                exit="sortie"
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {/* ---------- ERREUR : QR code inconnu ou expiré ---------- */}
                {phase === "error" && (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-rose-50">
                      <AlertCircle className="size-9 text-rose-500" aria-hidden />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-stone-900">
                        {t.erreurQr}
                      </h1>
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

                {/* ---------- ÉTAPE 1 : la note ---------- */}
                {phase === "step1" && scanData && (
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      {t.questionNotePrefix}
                      <span className="text-primary">{scanData.zone.nom}</span>
                      {t.questionNoteSuffix}
                    </h1>

                    {/* 5 étoiles très grandes (hauteur 68 px ≥ 60 px de zone tactile).
                        flex-1 + max-w évite tout débordement horizontal, même sur iPhone SE 320 px. */}
                    <div
                      role="radiogroup"
                      aria-label={t.ariaEtoiles}
                      onKeyDown={etoileClavier}
                      className="mt-7 flex w-full justify-center gap-1"
                    >
                      {[1, 2, 3, 4, 5].map((i) => {
                        const active = i <= afficheNote
                        return (
                          <motion.button
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
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.85 }}
                            animate={pulse === i ? { scale: [1, 1.28, 1] } : { scale: 1 }}
                            transition={{ duration: 0.35, ease: "easeInOut" }}
                            className="flex h-[4.25rem] min-w-0 max-w-[4.5rem] flex-1 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <Star
                              aria-hidden
                              strokeWidth={1.5}
                              className={cn(
                                "size-11 transition-colors duration-150",
                                active
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-stone-200 text-stone-300"
                              )}
                            />
                          </motion.button>
                        )
                      })}
                    </div>

                    {/* Émoji correspondant à la note (réagit aussi au survol) */}
                    <div className="mt-4 flex h-20 items-start justify-center" aria-live="polite">
                      <AnimatePresence mode="wait" initial={false}>
                        {afficheNote > 0 && (
                          <motion.div
                            key={afficheNote}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="text-center"
                          >
                            <span aria-hidden className="text-4xl leading-none">
                              {EMOJIS_NOTE[afficheNote]}
                            </span>
                            <p className="mt-1.5 text-sm font-medium text-stone-500">
                              {t.libellesNote[afficheNote]}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
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

                {/* ---------- ÉTAPE 1b (D1) : NPS — uniquement si note ≥ 4 ---------- */}
                {phase === "step1b" && scanData && (
                  <div>
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      {t.questionNps}
                    </h1>
                    <p className="mt-1 text-center text-sm text-muted-foreground">
                      {t.npsSousTitre}
                    </p>

                    {/* Slider 0-10 avec graduated labels */}
                    <div className="mt-6 px-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
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
                        className="mt-3"
                      />
                      <div className="mt-4 flex items-center justify-center">
                        <span className="inline-flex min-w-16 items-center justify-center rounded-full bg-primary px-4 py-1.5 text-2xl font-bold text-primary-foreground">
                          {nps}
                        </span>
                        <span className="ms-2 text-sm text-muted-foreground">/ 10</span>
                      </div>
                      {/* Libellé sémantique selon le score */}
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        {nps >= 9 ? "😊" : nps >= 7 ? "🙂" : "😐"}
                      </p>
                    </div>

                    <Button
                      onClick={() => allerEtape("step2", 1)}
                      className="mt-6 h-14 w-full text-lg font-semibold"
                    >
                      {t.continuer}
                    </Button>
                    <div className="mt-1 flex gap-2">
                      <Button
                        variant="ghost"
                        onClick={retourVersNote}
                        className="min-h-11 flex-1 text-sm text-muted-foreground"
                      >
                        <ArrowLeft aria-hidden className="size-4" /> {t.retour}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => allerEtape("step2", 1)}
                        className="min-h-11 flex-1 text-sm text-muted-foreground"
                      >
                        {t.npsIgnorer}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ---------- ÉTAPE 2 : les tags dynamiques de la zone ---------- */}
                {phase === "step2" && scanData && (
                  <div>
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      {estPositif ? t.titrePositif : t.titreNegatif}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.sousTitreTags}
                    </p>

                    <div
                      role="group"
                      aria-label={estPositif ? t.ariaTagsPositifs : t.ariaTagsNegatifs}
                      className="mt-5 flex flex-wrap gap-2.5"
                    >
                      {idsTags.map((id) => {
                        const def = definitionTag(id, estPositif)
                        const actif = tags.includes(id)
                        return (
                          <motion.button
                            key={id}
                            type="button"
                            aria-pressed={actif}
                            onClick={() => basculerTag(id)}
                            whileTap={{ scale: 0.93 }}
                            animate={{ scale: actif ? 1.04 : 1 }}
                            className={cn(
                              "inline-flex min-h-12 min-w-0 max-w-full items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-base",
                              actif
                                ? estPositif
                                  ? "border-green-500 bg-green-100 text-green-900"
                                  : "border-orange-500 bg-orange-100 text-orange-900"
                                : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                            )}
                          >
                            <span aria-hidden className="text-base leading-none">
                              {def.emoji}
                            </span>
                            <span className="min-w-0 break-words leading-tight">{def.label}</span>
                          </motion.button>
                        )
                      })}
                    </div>

                    {/* Champ optionnel : personnel concerné */}
                    <div className="mt-6">
                      <label
                        htmlFor="personnel"
                        className="mb-1.5 block text-sm font-medium text-stone-700"
                      >
                        {t.personnelLabel}{" "}
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

                    <Button
                      onClick={() => allerEtape("step3", 1)}
                      className="mt-6 h-14 w-full text-lg font-semibold"
                    >
                      {t.continuer}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => allerEtape(estPositif ? "step1b" : "step1", -1)}
                      className="mt-1 min-h-11 w-full text-sm text-muted-foreground"
                    >
                      <ArrowLeft aria-hidden className="size-4" /> {t.retour}
                    </Button>
                  </div>
                )}

                {/* ---------- ÉTAPE 3 : commentaire + photo + envoi ---------- */}
                {phase === "step3" && scanData && (
                  <div>
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      {t.titreCommentaire}{" "}
                      <span className="text-sm font-normal text-muted-foreground">{t.optionnel}</span>
                    </h1>

                    {/* Rappel discret de la sélection (tags + personnel) */}
                    {(tags.length > 0 || personnel.trim()) && (
                      <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
                        {[
                          ...tags.map((id) => definitionTag(id, estPositif).label),
                          personnel.trim() ? `👤 ${personnel.trim()}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}

                    <Textarea
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      aria-label={t.titreCommentaire}
                      placeholder={estPositif ? t.commentairePositif : t.commentaireNegatif}
                      className="mt-4 min-h-28 text-base"
                    />

                    {/* D2 : ajout de photo (optionnel) */}
                    <div className="mt-4">
                      <p className="mb-1.5 text-sm font-medium text-stone-700">{t.photoLabel}</p>
                      {photoUrl ? (
                        <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-2.5">
                          <img
                            src={photoUrl}
                            alt="Photo jointe"
                            className="size-16 shrink-0 rounded-lg border border-stone-200 object-cover"
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
                                className="h-8 text-rose-600 hover:bg-rose-50"
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
                          className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            {photoEnCours ? (
                              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                            ) : (
                              <ImagePlus className="h-5 w-5" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-stone-700">
                              {photoEnCours ? t.photoEnCours : t.photoChoisir}
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

                    {/* Email optionnel : permet au commerçant de répondre au client */}
                    <div className="mt-3">
                      <Input
                        type="email"
                        inputMode="email"
                        value={emailClient}
                        onChange={(e) => setEmailClient(e.target.value)}
                        maxLength={120}
                        autoComplete="off"
                        aria-label={t.emailLabel}
                        placeholder={t.emailLabel}
                        className="text-base"
                      />
                      <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
                        {t.emailAide}
                      </p>
                    </div>

                    {/* Erreur d'envoi : message inline + réessayer (les données sont conservées) */}
                    {erreurEnvoi && (
                      <div
                        role="alert"
                        className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                      >
                        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <div>
                          <p>{erreurEnvoi}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => envoyer(dernierCanal)}
                            className="mt-1 h-9 px-2 text-sm font-semibold text-rose-700 underline underline-offset-2 hover:bg-rose-100 hover:text-rose-800"
                          >
                            {t.reessayer}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Consentement géolocalisation approximative (RGPD — opt-in,
                        jamais requis pour envoyer le retour) */}
                    <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          id="geo-consent"
                          checked={geoConsent}
                          onCheckedChange={(v) => setGeoConsent(v === true)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor="geo-consent"
                          className="cursor-pointer text-xs leading-relaxed text-stone-600"
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

                    {/* Teaser micro-récompense (Session 3) : montrée AVANT l'envoi
                        SANS le code promo, qui n'est dévoilé qu'à l'écran suivant */}
                    {scanData.pro.recompense && (
                      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
                        <Gift className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-amber-900">🎁 {scanData.pro.recompense}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                            — dévoilée juste après l&apos;envoi&nbsp;!
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-5 flex flex-col gap-2.5">
                      {/* Bouton GÉANT vert WhatsApp (masqué si aucun numéro configuré) */}
                      {aWhatsApp && (
                        <Button
                          onClick={() => envoyer("whatsapp")}
                          disabled={soumission !== null}
                          className="h-16 w-full bg-green-500 text-lg font-bold text-white hover:bg-green-600"
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

                      {/* Canal secondaire : « Terminer » devient principal si pas de WhatsApp */}
                      <Button
                        variant={aWhatsApp ? "outline" : "default"}
                        onClick={() => envoyer("aucun")}
                        disabled={soumission !== null}
                        className={cn(
                          "w-full text-base font-semibold",
                          aWhatsApp ? "h-14" : "h-16 text-lg font-bold"
                        )}
                      >
                        {soumission === "aucun" ? (
                          <>
                            <Loader2 className="size-5 animate-spin" aria-hidden /> {t.envoiEnCours}
                          </>
                        ) : aWhatsApp ? (
                          t.envoyerSansWhatsapp
                        ) : (
                          t.envoyerTerminer
                        )}
                      </Button>
                    </div>

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

                {/* ---------- SUCCÈS : merci + récompense éventuelle + avis Google ---------- */}
                {phase === "success" && scanData && (
                  <div className="relative flex flex-col items-center gap-4 py-2 text-center">
                    <ConfettiLeger />

                    {/* Grande coche verte animée (ressort) */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.05 }}
                      className="flex size-20 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30"
                      aria-hidden
                    >
                      <Check className="size-10" strokeWidth={3} />
                    </motion.div>

                    <h1 className="text-balance text-2xl font-bold text-stone-900">
                      {t.merci}
                    </h1>

                    {recompenseFinale ? (
                      /* Carte récompense mise en valeur (data.recompense ou pro.recompense)
                         + CODE PROMO dévoilé dans une puce dédiée (Session 3) */
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.3, type: "spring", stiffness: 220, damping: 18 }}
                        className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-md shadow-amber-500/10"
                      >
                        <p className="text-balance text-lg font-bold leading-snug text-amber-900">
                          {t.recompenseTitre(recompenseFinale)}
                        </p>
                        {codeRecompense && (
                          <span
                            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-white px-3 py-1.5 font-mono text-base font-bold tracking-wide text-amber-900"
                            aria-label={`Code promo : ${codeRecompense}`}
                          >
                            <Ticket className="size-4" aria-hidden />
                            {codeRecompense}
                          </span>
                        )}
                        <p className="mt-1.5 text-sm text-amber-800/90">
                          {t.recompenseMontrez}
                        </p>
                      </motion.div>
                    ) : estPositif ? (
                      <p className="text-balance text-base text-stone-600">
                        {t.merciPositif(scanData.pro.nomEtablissement)}
                      </p>
                    ) : (
                      /* Carte rassurante pour les retours 1-3★ */
                      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left">
                        <ShieldCheck className="mt-0.5 size-8 shrink-0 text-primary" aria-hidden />
                        <p className="text-sm leading-relaxed text-stone-600">
                          {t.merciNegatif}
                        </p>
                      </div>
                    )}

                    {/* D8 : avis Google — proposé si note ≥ 4★ + URL configurée */}
                    {lienAvisGoogle && (
                      <motion.a
                        href={lienAvisGoogle}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        {/* « G » stylisé pour Google */}
                        <span className="flex size-5 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-700" aria-hidden>
                          G
                        </span>
                        {t.avisGoogle}
                      </motion.a>
                    )}

                    <Button
                      onClick={onExit}
                      className="mt-1 h-14 w-full text-base font-semibold"
                    >
                      {t.envoyerTerminer}
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-stone-400">
          {t.propulsePar} <span className="font-semibold text-stone-500">FeedbackPro</span>
        </p>
      </div>
    </div>
  )
}
