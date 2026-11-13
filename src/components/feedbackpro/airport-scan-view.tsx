"use client"

// ============================================================
// FeedbackPro - AirportScanView (PWA voyageur aéroport)
// ------------------------------------------------------------
// Le voyageur a scanné un QR code aéroport (ex: tapis_bagages_1)
// et signale un problème en cours (tapis arrêté, file trop longue…).
// L'équipe opérationnelle reçoit une alerte WhatsApp en temps réel.
//
// Machine à états (phases) :
//   loading → error | zone_detectee → probleme_choisi → confirmation
//
// Contrat API (enveloppe { ok, data } | { ok: false, error }) :
//   GET  /api/airport/zone/[tag]
//     → { zone: { code, nom, emoji, description, tags[], problemes[], tagScanne } }
//   POST /api/airport/report
//     body { tag, problemType, commentaire?, photoUrl?, whatsappOptin?, whatsappPhone? }
//     → { report: { id, statut, problemType, tagScanne, createdAt },
//         whatsapp: { message, link },
//         zone: { code, nom, emoji } }
//   POST /api/airport/whatsapp-optin
//     body { reportId, whatsappPhone }
//     → { reportId, whatsappOptin, whatsappPhone }
//   POST /api/public/upload (multipart "photo")
//     → { url: "/api/uploads/<uuid>.webp" }
//
// Palette aéroport (distincte du reste de l'app) :
//   - bandeau sombre (bg-slate-900 text-white)
//   - accents amber (sélection du problème)
//   - accents emerald (succès + opt-in WhatsApp)
//   - rose pour l'action critique de signalement
//   Aucun indigo / bleu FeedbackPro (#002e85 / bg-primary) —
//   l'expérience voyageur doit se distinguer du reste de l'app.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  LifeBuoy,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  Plane,
  Send,
  ShieldCheck,
  Square,
  Star,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getProblemEmoji } from "@/lib/airport-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AirportOfflineBanner } from "@/components/feedbackpro/airport-offline-banner"
import { useAirportOffline } from "@/hooks/use-airport-offline"
import { routerVersService, serviceLabel } from "@/lib/airport-routing"

// ---------- Types locaux (contrat API) ----------

type Phase = "loading" | "error" | "zone_detectee" | "probleme_choisi" | "confirmation"

type ZoneData = {
  code: string
  nom: string
  emoji: string
  description: string | null
  tags: string[]
  problemes: string[]
  tagScanne: string
  airportLogo?: string | null
  airportName?: string | null
  // D8 — URL d'avis Google Reviews de l'aéroport (renvoyée par
  // GET /api/airport/zone/[tag] depuis le champ Pro.googleReviewUrl).
  // Null si aucun Pro "Aéroport" rattaché ou si l'URL n'est pas configurée.
  // Utilisée par la carte de notation de l'écran de confirmation :
  // note 4-5★ → propose un avis Google public, note 1-3★ → retour interne.
  airportGoogleReviewUrl?: string | null
  // Task D Phase 3 — Vol actuellement à quai sur ce tag (porte d'embarquement).
  // Renvoyé par GET /api/airport/zone/[tag] si un AirportFlightGate actif
  // existe pour ce tag. Null pour les tags non-portes (tapis bagages, etc.).
  // Quand non-null, le champ "Numéro de vol" du formulaire est pré-rempli +
  // verrouillé (read-only) — le voyageur n'a pas à le saisir manuellement.
  currentFlight?: {
    flightNumber: string
    airline: string | null
    destination: string | null
    scheduledDeparture: string | null
    status: string
  } | null
}

type ReportResult = {
  report: {
    id: string
    statut: string
    problemType: string
    tagScanne: string
    flightNumber: string | null
    createdAt: string
  }
  whatsapp: {
    message: string
    link: string
  }
  zone: {
    code: string
    nom: string
    emoji: string
  }
  /** Analyse VLM en cours (si photo jointe) */
  vlmPending?: boolean
}

type WhatsappOptinResult = {
  reportId: string
  whatsappOptin: boolean
  whatsappPhone: string
}

// ---------- Publicité (affichée sur l'écran de confirmation avant sortie) ----------
// Contrat : GET /api/airport/ads → { ad: AirportAd | null }
// (incrémente les impressions serveur-side à chaque tirage)
type AirportAd = {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  ctaText: string
}

// ---------- Logo aéroport (affiché dans les headers) ----------
function AirportLogo({ zoneData, size = "sm" }: { zoneData: ZoneData | null; size?: "sm" | "md" }) {
  // Feature 3 — logo agrandi : sm 8 → 12, md 10 → 14, fallback Plane 4/5 → 6/7
  const sz = size === "md" ? "size-14" : "size-12"
  if (zoneData?.airportLogo) {
    return (
      <img
        src={zoneData.airportLogo}
        alt={zoneData.airportName ?? "Aéroport"}
        className={cn(sz, "rounded-lg object-cover bg-white/90 p-0.5 shadow-sm")}
      />
    )
  }
  return (
    <div className={cn("flex items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm", sz)}>
      <Plane className={cn(size === "md" ? "size-7" : "size-6", "text-white")} aria-hidden />
    </div>
  )
}

// ---------- Helpers fetch (enveloppe { ok, data | error }) ----------

/** GET JSON enveloppe { ok, data } — lève sur !ok ou réponse non-JSON. */
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const json = (await res.json().catch(() => null)) as {
    ok: boolean
    data?: T
    error?: string
  } | null
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Erreur ${res.status}`)
  }
  return json.data as T
}

/** POST JSON enveloppe { ok, data } — lève sur !ok ou réponse non-JSON. */
async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as {
    ok: boolean
    data?: T
    error?: string
  } | null
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Erreur ${res.status}`)
  }
  return json.data as T
}

// ---------- Utilitaires d'affichage ----------

/**
 * Masque partiellement un numéro WhatsApp normalisé (chiffres uniquement)
 * pour l'affichage de confirmation. On garde les 2 premiers et les 2
 * derniers chiffres visibles : "33612345678" → "+33 ******* 78".
 */
function masquerTelephone(phone: string): string {
  const cleaned = phone.replace(/[^\d]/g, "")
  if (cleaned.length < 6) return cleaned
  const debut = cleaned.slice(0, 2)
  const fin = cleaned.slice(-2)
  const milieu = "*".repeat(Math.max(2, cleaned.length - 4))
  return `+${debut} ${milieu} ${fin}`
}

/** Formate une date ISO en horaire lisible FR (JJ/MM/AAAA HH:mm). */
function formaterDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

// ---------- Composant principal ----------

type AirportScanViewProps = {
  tag: string
  onExit: () => void
}

export function AirportScanView({ tag, onExit }: AirportScanViewProps) {
  // ---------- State (machine à phases + données métier) ----------
  const [phase, setPhase] = useState<Phase>("loading")
  const [zoneData, setZoneData] = useState<ZoneData | null>(null)

  // Sélection du problème (zone_detectee → probleme_choisi)
  const [selectedProblem, setSelectedProblem] = useState<string | null>(null)
  // Surlignage temporaire du bouton cliqué (auto-advance après ~250 ms)
  const [highlightedProblem, setHighlightedProblem] = useState<string | null>(null)

  // Commentaire + photo (étape probleme_choisi)
  const [commentaire, setCommentaire] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Numéro de vol optionnel (rattachement signalement → vol)
  const [flightNumber, setFlightNumber] = useState("")

  // Soumission du signalement
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [reportResult, setReportResult] = useState<ReportResult | null>(null)

  // Opt-in WhatsApp (écran de confirmation)
  const [whatsappPhone, setWhatsappPhone] = useState("")
  const [whatsappSubmitting, setWhatsappSubmitting] = useState(false)
  const [whatsappSubmitted, setWhatsappSubmitted] = useState<WhatsappOptinResult | null>(null)
  const [whatsappError, setWhatsappError] = useState<string | null>(null)

  // --- Bouton "Aide" PWA (dialog + état de la demande) ---
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpMessage, setHelpMessage] = useState("")
  const [helpPhone, setHelpPhone] = useState("")
  const [helpSubmitting, setHelpSubmitting] = useState(false)
  const [helpError, setHelpError] = useState<string | null>(null)

  // --- Publicité sur écran de confirmation (Feature 1) ---
  // affichée quand le voyageur clique « Quitter ». Si null/absente → onExit direct.
  const [exitAd, setExitAd] = useState<AirportAd | null>(null)
  const [exitAdLoading, setExitAdLoading] = useState(false)
  const [helpSuccess, setHelpSuccess] = useState<string | null>(null)

  // --- D8 — Carte de notation (écran de confirmation) ---
  // Le voyageur note son expérience aéroport (1-5★) juste avant la sortie.
  //  - 4-5★ (positif) + airportGoogleReviewUrl défini : on propose un CTA
  //    « Laisser un avis Google » qui ouvre la page d'avis dans un nouvel onglet.
  //  - 4-5★ (positif) sans URL configurée : message de remerciement, pas de CTA.
  //  - 1-3★ (négatif) : message d'excuse + saisie email optionnelle + bouton
  //    « Envoyer mon retour interne » qui POST /api/airport/help avec la note
  //    et l'email (réutilise le endpoint existant, champ travelerPhone).
  const [rating, setRating] = useState<number | null>(null)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingEmail, setRatingEmail] = useState("")
  const [ratingSubmitting, setRatingSubmitting] = useState(false)

  // --- Voice (Phase 2 — Wolof / Français / Anglais) ---
  // MediaRecorder + ASR + traduction LLM → remplit le commentaire.
  // États : idle (bouton micro violet), recording (pulsant rouge), transcribing (spinner)
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle")
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceLang, setVoiceLang] = useState<"auto" | "wolof" | "fr" | "en">("auto")
  const [voicePreview, setVoicePreview] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const voiceStreamRef = useRef<MediaStream | null>(null)

  // --- Offline PWA (Phase 2 — fonctionne sans 4G) ---
  const offline = useAirportOffline()

  // ---------- Effet : fetch de la zone au montage + quand le tag change ----------
  useEffect(() => {
    let cancelled = false
    setPhase("loading")
    setZoneData(null)
    apiGet<{ zone: ZoneData }>(`/api/airport/zone/${encodeURIComponent(tag)}`)
      .then((res) => {
        if (cancelled) return
        setZoneData(res.zone)
        // Task D Phase 3 — si la porte a un vol à quai, on pré-remplit le
        // champ flightNumber (verrouillé en read-only dans l'UI). Le
        // voyageur n'a pas à saisir le numéro manuellement.
        if (res.zone.currentFlight?.flightNumber) {
          setFlightNumber(res.zone.currentFlight.flightNumber)
        }
        setPhase("zone_detectee")
      })
      .catch(() => {
        if (cancelled) return
        setPhase("error")
      })
    return () => {
      cancelled = true
    }
  }, [tag])

  // ---------- Clic sur un problème : highlight + auto-advance ----------
  const choisirProbleme = useCallback((probleme: string) => {
    setSelectedProblem(probleme)
    setHighlightedProblem(probleme)
    // Auto-advance après ~250 ms (spec) pour laisser voir le surlignage
    window.setTimeout(() => {
      setHighlightedProblem(null)
      setPhase("probleme_choisi")
    }, 250)
  }, [])

  // ---------- Upload de photo (POST /api/public/upload, multipart "photo") ----------
  const onPhotoChoisie = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fichier = e.target.files?.[0]
      // Réinitialise l'input pour autoriser la re-sélection du même fichier
      e.target.value = ""
      if (!fichier) return
      setPhotoError(null)
      if (fichier.size > 5 * 1024 * 1024) {
        setPhotoError("Photo trop volumineuse (5 Mo maximum)")
        return
      }
      if (!fichier.type.startsWith("image/")) {
        setPhotoError("Format non supporté (PNG, JPEG, WebP)")
        return
      }
      setPhotoUploading(true)
      try {
        const fd = new FormData()
        fd.append("photo", fichier)
        const res = await fetch("/api/public/upload", { method: "POST", body: fd })
        const json = (await res.json().catch(() => null)) as {
          ok: boolean
          data?: { url: string }
          error?: string
        } | null
        if (!res.ok || !json?.ok || !json.data) {
          throw new Error(json?.error || "Upload impossible")
        }
        setPhotoUrl(json.data.url)
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : "Upload impossible")
      } finally {
        setPhotoUploading(false)
      }
    },
    []
  )

  // ---------- Voice (Phase 2) : démarrer / arrêter l'enregistrement ----------
  // Démarrage : demande l'accès micro, instancie MediaRecorder, accumule les chunks.
  // Arrêt : stoppe le recorder → onstop() construit le Blob webm/opus → transcribeVoice().
  const demarrerEnregistrement = useCallback(async () => {
    setVoiceError(null)
    setVoicePreview(null)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Micro non supporté sur cet appareil.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      voiceStreamRef.current = stream
      // webm/opus est le format natif de MediaRecorder (Chrome/Firefox).
      // Safari produit mp4 — on laisse le navigateur choisir le mime.
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        // Stoppe toutes les pistes du stream (libère le micro).
        voiceStreamRef.current?.getTracks().forEach((t) => t.stop())
        voiceStreamRef.current = null
        const blob = new Blob(audioChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        })
        audioChunksRef.current = []
        if (blob.size < 500) {
          // Enregistrement vide (< 0.5 s) → on abandonne sans erreur.
          setVoiceState("idle")
          return
        }
        void transcrireEtTraduire(blob)
      }
      mr.start()
      setVoiceState("recording")
    } catch (err) {
      setVoiceState("idle")
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop())
      voiceStreamRef.current = null
      const msg = err instanceof Error ? err.message : "Accès micro refusé"
      setVoiceError(
        /denied|permission|notallowed/i.test(msg)
          ? "Autorisation micro refusée. Activez-le dans les réglages du navigateur."
          : `Micro indisponible : ${msg}`,
      )
    }
  }, [])

  // Arrêt propre du recorder → déclenche onstop() ci-dessus.
  const arreterEnregistrement = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== "inactive") {
      setVoiceState("transcribing")
      try {
        mr.stop()
      } catch {
        setVoiceState("idle")
      }
    } else {
      setVoiceState("idle")
    }
  }, [])

  // ---------- Voice (Phase 2) : appel backend /api/airport/voice/transcribe + translate ----------
  // Pipeline : Blob → POST multipart /transcribe → texte source → POST JSON /translate
  //   → texte français → setCommentaire() + setVoicePreview() pour afficher le compte-rendu.
  // En cas d'erreur, on restore l'état idle et on affiche un message clair.
  const transcrireEtTraduire = useCallback(
    async (audio: Blob) => {
      setVoiceState("transcribing")
      setVoiceError(null)
      try {
        // 1. Transcription ASR (z-ai-web-dev-sdk côté serveur)
        const fd = new FormData()
        fd.append("audio", audio, "voice.webm")
        const resT = await fetch("/api/airport/voice/transcribe", {
          method: "POST",
          body: fd,
        })
        const jsonT = (await resT.json().catch(() => null)) as
          | { ok: boolean; data?: { text: string }; error?: string }
          | null
        if (!resT.ok || !jsonT?.ok || !jsonT.data) {
          throw new Error(jsonT?.error || `Transcription échouée (${resT.status})`)
        }
        const original = (jsonT.data.text || "").trim()
        if (!original) {
          throw new Error("Aucune parole détectée dans l'enregistrement.")
        }

        // 2. Traduction LLM vers le français (Wolof/FR/EN → FR)
        const resTr = await fetch("/api/airport/voice/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: original, source: voiceLang }),
        })
        const jsonTr = (await resTr.json().catch(() => null)) as
          | {
              ok: boolean
              data?: { translated: string; detectedSource?: string }
              error?: string
            }
          | null
        if (!resTr.ok || !jsonTr?.ok || !jsonTr.data) {
          throw new Error(jsonTr?.error || "Traduction échouée")
        }
        const translated = (jsonTr.data.translated || "").trim()
        // 3. On remplit le commentaire (en préservant un éventuel texte déjà tapé).
        setCommentaire((prev) => {
          const base = prev.trim()
          return base ? `${base}\n${translated}` : translated
        })
        setVoicePreview(
          jsonTr.data.detectedSource && jsonTr.data.detectedSource !== "fr"
            ? `Détecté : ${jsonTr.data.detectedSource} → traduit en français`
            : "Transcrit et traduit en français",
        )
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : "Voix indisponible")
      } finally {
        setVoiceState("idle")
      }
    },
    [voiceLang],
  )

  // ---------- Soumission du signalement (POST /api/airport/report) ----------
  // Si le réseau est offline OU que l'API renvoie une erreur réseau/5xx,
  // on enfile le rapport dans IndexedDB (Background Sync le rejouera au
  // retour du réseau). Le voyageur voit l'écran de confirmation comme si
  // tout s'était bien passé — son signalement n'est pas perdu.
  const envoyerSignalement = useCallback(async () => {
    if (!zoneData || !selectedProblem || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body: {
        tag: string
        problemType: string
        commentaire?: string
        photoUrl?: string
        flightNumber?: string
      } = {
        tag: zoneData.tagScanne,
        problemType: selectedProblem,
      }
      const c = commentaire.trim()
      if (c) body.commentaire = c
      if (photoUrl) body.photoUrl = photoUrl
      const fn = flightNumber.trim()
      if (fn) body.flightNumber = fn

      // Tentative online. Si elle échoue (offline / 5xx), on enfile localement.
      try {
        const result = await apiPost<ReportResult>("/api/airport/report", body)
        setReportResult(result)
        setPhase("confirmation")
        try {
          window.scrollTo({ top: 0, behavior: "smooth" })
        } catch {
          /* ignore */
        }
        return
      } catch (netErr) {
        // Si on est offline OU que l'erreur ressemble à un problème réseau,
        // on enfile le rapport pour sync différée. Sinon on propage.
        const offlineNow =
          (typeof navigator !== "undefined" && navigator.onLine === false) ||
          /fetch|network|failed/i.test(netErr instanceof Error ? netErr.message : "")
        if (!offlineNow) throw netErr

        await offline.enqueueReport({
          tag: body.tag,
          problemType: body.problemType,
          commentaire: body.commentaire,
          photoUrl: body.photoUrl,
          flightNumber: body.flightNumber,
        })
        // On génère un pseudo-reportResult local pour l'écran de confirmation
        // (le vrai ID sera assigné au moment de la sync par le backend).
        const localId = `pending-${Date.now()}`
        setReportResult({
          report: {
            id: localId,
            statut: "EN_ATTENTE",
            problemType: body.problemType,
            tagScanne: body.tag,
            flightNumber: body.flightNumber ?? null,
            createdAt: new Date().toISOString(),
          },
          whatsapp: {
            message:
              "Votre signalement a été mis en file d'attente. Il sera envoyé automatiquement dès le retour du réseau.",
            link: "",
          },
          zone: {
            code: zoneData.tagScanne,
            nom: zoneData.nom,
            emoji: zoneData.emoji,
          },
          vlmPending: false,
        })
        setPhase("confirmation")
        try {
          window.scrollTo({ top: 0, behavior: "smooth" })
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Envoi impossible")
    } finally {
      setSubmitting(false)
    }
  }, [zoneData, selectedProblem, submitting, commentaire, photoUrl, flightNumber, offline])

  // ---------- Opt-in WhatsApp (POST /api/airport/whatsapp-optin) ----------
  const activerWhatsapp = useCallback(async () => {
    if (!reportResult || whatsappSubmitting) return
    setWhatsappError(null)
    // On garde le + et les chiffres uniquement
    const phone = whatsappPhone.replace(/[^\d+]/g, "")
    if (!/^\+?\d{8,15}$/.test(phone)) {
      setWhatsappError("Numéro invalide (format attendu : +33 6 12 34 56 78)")
      return
    }
    setWhatsappSubmitting(true)
    try {
      const result = await apiPost<WhatsappOptinResult>("/api/airport/whatsapp-optin", {
        reportId: reportResult.report.id,
        whatsappPhone: phone,
      })
      setWhatsappSubmitted(result)
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : "Activation impossible")
    } finally {
      setWhatsappSubmitting(false)
    }
  }, [reportResult, whatsappSubmitting, whatsappPhone])

  // ---------- Bouton "Aide" PWA (POST /api/airport/help) ----------
  // Ouvre le dialog (avec le numéro WhatsApp pré-rempli si déjà saisi).
  const ouvrirAide = useCallback(() => {
    setHelpError(null)
    setHelpSuccess(null)
    setHelpMessage("")
    setHelpPhone(whatsappPhone)
    setHelpOpen(true)
  }, [whatsappPhone])

  // Envoie effectif de la demande d'aide
  const envoyerDemandeAide = useCallback(async () => {
    if (!zoneData || helpSubmitting) return
    setHelpError(null)
    const tag = zoneData.tagScanne
    const body: {
      tag: string
      message?: string
      travelerPhone?: string
      reportId?: string
    } = { tag }
    const msg = helpMessage.trim()
    if (msg) body.message = msg
    if (helpPhone.trim()) {
      const phone = helpPhone.replace(/[^\d]/g, "")
      if (phone && /^\d{8,15}$/.test(phone)) {
        body.travelerPhone = phone
      } else if (phone) {
        setHelpError("Numéro invalide (format attendu : +33 6 12 34 56 78)")
        return
      }
    }
    if (reportResult?.report.id) body.reportId = reportResult.report.id
    setHelpSubmitting(true)
    try {
      const result = await apiPost<{
        helpRequestId: string
        statut: string
        message: string
      }>("/api/airport/help", body)
      setHelpSuccess(result.message)
    } catch (err) {
      setHelpError(err instanceof Error ? err.message : "Envoi impossible")
    } finally {
      setHelpSubmitting(false)
    }
  }, [zoneData, helpSubmitting, helpMessage, helpPhone, reportResult])

  // ---------- D8 — Ouvrir la page d'avis Google (note 4-5★) ----------
  // Ouvre l'URL d'avis Google Reviews de l'aéroport dans un nouvel onglet,
  // puis masque la carte de notation (le voyageur a fait son action).
  // Si l'URL est absente, le bouton n'est pas rendu — pas besoin de guard ici.
  const ouvrirAvisGoogle = useCallback(() => {
    if (!zoneData?.airportGoogleReviewUrl) return
    try {
      window.open(zoneData.airportGoogleReviewUrl, "_blank", "noopener")
    } catch {
      /* ignore — échec non bloquant */
    }
    setRatingSubmitted(true)
  }, [zoneData])

  // ---------- D8 — Envoyer le retour interne (note 1-3★) ----------
  // Réutilise POST /api/airport/help avec :
  //   - message : "Note: X/5" + commentaire éventuel saisi plus tôt
  //   - travelerPhone : email saisi (champ polymorphe côté backend — tout
  //     identifiant de contact libre est accepté, on transmet l'email brut)
  //   - tag : tag scanné de la zone
  //   - reportId : ID du signalement lié
  // Sur succès : masque la carte + affiche un message de confirmation inline.
  const envoyerRetourInterne = useCallback(async () => {
    if (!zoneData || rating === null || ratingSubmitting) return
    setRatingSubmitting(true)
    try {
      const c = commentaire.trim()
      const message = c
        ? `Note: ${rating}/5 — ${c}`
        : `Note: ${rating}/5`
      const body: {
        tag: string
        message: string
        travelerPhone?: string
        reportId?: string
      } = {
        tag: zoneData.tagScanne,
        message,
      }
      const email = ratingEmail.trim()
      if (email) body.travelerPhone = email
      if (reportResult?.report.id) body.reportId = reportResult.report.id
      // apiPost lève sur !ok — pas besoin de tester la réponse.
      await apiPost<{ helpRequestId: string; statut: string; message: string }>(
        "/api/airport/help",
        body,
      )
      setRatingSubmitted(true)
    } catch {
      // On ne bloque pas le voyageur — on marque quand même comme soumis
      // pour qu'il puisse quitter sans saisir à nouveau. Le retour interne
      // est best-effort : si le réseau flanche, l'écran de confirmation
      // reste utilisable.
      setRatingSubmitted(true)
    } finally {
      setRatingSubmitting(false)
    }
  }, [zoneData, rating, ratingSubmitting, ratingEmail, commentaire, reportResult])

  // ---------- "Signaler un autre problème" : reset vers zone_detectee ----------
  // On conserve le tag/zone (zoneData) — seul le signalement courant est réinitialisé.
  const signalerAutre = useCallback(() => {
    setSelectedProblem(null)
    setHighlightedProblem(null)
    setCommentaire("")
    setPhotoUrl(null)
    setPhotoError(null)
    setFlightNumber("")
    setSubmitError(null)
    setReportResult(null)
    setWhatsappPhone("")
    setWhatsappSubmitted(null)
    setWhatsappError(null)
    setHelpOpen(false)
    setHelpMessage("")
    setHelpPhone("")
    setHelpError(null)
    setHelpSuccess(null)
    // Feature 1 — reset pub éventuelle (si l'on revient signaler autre chose)
    setExitAd(null)
    // D8 — reset carte de notation (note + retour interne / avis Google)
    setRating(null)
    setRatingSubmitted(false)
    setRatingEmail("")
    setRatingSubmitting(false)
    setPhase("zone_detectee")
    try {
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      /* ignore */
    }
  }, [])

  // ---------- "Quitter" avec publicité (Feature 1) ----------
  // Au lieu d'appeler onExit() immédiatement, on tente de tirer une
  // publicité active au hasard via GET /api/airport/ads. Si une pub
  // est renvoyée, on l'affiche en overlay plein écran. Le voyageur
  // la ferme (bouton « Fermer ») → on appelle alors onExit().
  // Si aucune pub active n'est disponible, on appelle onExit() direct.
  const quitterAvecPub = useCallback(async () => {
    if (exitAdLoading) return
    setExitAdLoading(true)
    let ad: AirportAd | null = null
    try {
      ad = await apiGet<{ ad: AirportAd | null }>("/api/airport/ads").then(
        (r) => r.ad ?? null,
      )
    } catch {
      // Erreur réseau / serveur → on ne bloque pas la sortie
      ad = null
    }
    setExitAdLoading(false)
    if (ad) {
      setExitAd(ad)
    } else {
      onExit()
    }
  }, [exitAdLoading, onExit])

  // Clic sur le CTA de la pub → incrémente le compteur serveur (best-effort)
  // puis ouvre le lien externe dans un nouvel onglet. On ne ferme PAS
  // l'overlay : c'est le bouton « Fermer » qui déclenche la sortie.
  const onAdCtaClick = useCallback(() => {
    if (!exitAd) return
    // Incrémentation best-effort (POST /api/airport/ads/[id]/click)
    void fetch(`/api/airport/ads/${encodeURIComponent(exitAd.id)}/click`, {
      method: "POST",
    }).catch(() => {
      /* ignore */
    })
    if (exitAd.linkUrl) {
      try {
        window.open(exitAd.linkUrl, "_blank", "noopener,noreferrer")
      } catch {
        /* ignore */
      }
    }
  }, [exitAd])

  // Ferme l'overlay pub → appelle onExit() pour réellement quitter l'app
  const fermerPubEtQuitter = useCallback(() => {
    setExitAd(null)
    onExit()
  }, [onExit])

  // ============================================================
  // Rendu par phase
  // ============================================================

  // ---------- Phase : loading ----------
  if (phase === "loading") {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-white"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex size-20 items-center justify-center rounded-2xl bg-slate-800/80 ring-1 ring-white/10">
            <Plane className="size-9 text-amber-300" aria-hidden />
            <Loader2
              className="absolute inset-0 m-auto size-10 animate-spin text-amber-300/70"
              aria-hidden
            />
          </div>
          <p className="text-base font-medium text-slate-200">Détection de votre zone…</p>
          <p className="text-xs text-slate-400">Aéroport — Service voyageur</p>
        </div>
      </div>
    )
  }

  // ---------- Phase : error ----------
  if (phase === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-white">
        <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-orange-500/15 ring-1 ring-orange-500/30">
            <AlertTriangle className="size-10 text-orange-400" aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-white">Zone inconnue</h1>
            <p className="text-sm leading-relaxed text-slate-300">
              Le QR code que vous avez scanné n'est pas reconnu. Vérifiez qu'il s'agit bien d'un
              QR code de signalement aéroport, ou demandez l'aide d'un agent.
            </p>
          </div>
          <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 font-mono text-xs text-slate-400 ring-1 ring-white/10">
            tag : {tag}
          </div>
          <Button
            type="button"
            onClick={onExit}
            className="h-11 min-w-44 rounded-xl bg-white px-6 text-slate-900 hover:bg-slate-100"
          >
            Quitter
          </Button>
        </div>
      </div>
    )
  }

  // ---------- Phase : zone_detectee ----------
  if (phase === "zone_detectee" && zoneData) {
    // Couleurs vibrantes qui tournent pour chaque bouton de problème
    const BUTTON_COLORS = [
      { bg: 'from-violet-500 to-purple-600', ring: 'ring-violet-300', selBg: 'bg-violet-50', selBorder: 'border-violet-400', selText: 'text-violet-900', selRing: 'ring-violet-200', glow: 'shadow-violet-300/50' },
      { bg: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-300', selBg: 'bg-emerald-50', selBorder: 'border-emerald-400', selText: 'text-emerald-900', selRing: 'ring-emerald-200', glow: 'shadow-emerald-300/50' },
      { bg: 'from-rose-500 to-pink-600', ring: 'ring-rose-300', selBg: 'bg-rose-50', selBorder: 'border-rose-400', selText: 'text-rose-900', selRing: 'ring-rose-200', glow: 'shadow-rose-300/50' },
      { bg: 'from-sky-500 to-blue-600', ring: 'ring-sky-300', selBg: 'bg-sky-50', selBorder: 'border-sky-400', selText: 'text-sky-900', selRing: 'ring-sky-200', glow: 'shadow-sky-300/50' },
      { bg: 'from-amber-500 to-orange-600', ring: 'ring-amber-300', selBg: 'bg-amber-50', selBorder: 'border-amber-400', selText: 'text-amber-900', selRing: 'ring-amber-200', glow: 'shadow-amber-300/50' },
      { bg: 'from-fuchsia-500 to-pink-600', ring: 'ring-fuchsia-300', selBg: 'bg-fuchsia-50', selBorder: 'border-fuchsia-400', selText: 'text-fuchsia-900', selRing: 'ring-fuchsia-200', glow: 'shadow-fuchsia-300/50' },
    ]

    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-violet-50/30 to-sky-50/40">
        {/* --- Bandeau offline (Phase 2) : sticky en haut --- */}
        <AirportOfflineBanner />

        {/* Décoration : blobs flottants colorés en arrière-plan */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-20 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-56 w-56 rounded-full bg-sky-300/15 blur-3xl" />

        {/* Header — gradient vibrant avec glassmorphism */}
        <header className="relative z-10 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/20">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <AirportLogo zoneData={zoneData} />
              <span className="text-xs font-bold uppercase tracking-widest text-white/90">
                {zoneData.airportName ?? "Aéroport"}
              </span>
            </div>
            <button
              type="button"
              onClick={onExit}
              aria-label="Quitter le signalement"
              className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm text-white transition-all hover:bg-white/25 hover:scale-105"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        {/* Hero zone — immersif avec emoji flottant */}
        <section className="relative z-10 mx-auto w-full max-w-md px-4 pt-8 pb-2">
          <div className="flex flex-col items-center text-center">
            {/* Emoji dans un cercle glassmorphism avec halo */}
            <div className="relative">
              <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-violet-400/30 to-fuchsia-400/30 blur-2xl" />
              <div className="relative flex size-24 items-center justify-center rounded-3xl bg-white/70 shadow-xl backdrop-blur-md ring-1 ring-white/60">
                <span className="text-5xl leading-none" style={{ animation: 'gentleFloat 3s ease-in-out infinite' }} aria-hidden>
                  {zoneData.emoji}
                </span>
              </div>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight bg-gradient-to-r from-slate-900 via-violet-900 to-slate-900 bg-clip-text text-transparent">
              {zoneData.nom}
            </h1>
            {zoneData.description ? (
              <p className="mt-1.5 text-sm text-slate-500">{zoneData.description}</p>
            ) : null}
            {/* Badge localisation — glassmorphism */}
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 shadow-md backdrop-blur-md ring-1 ring-white/60">
              <MapPin className="size-3.5 text-violet-600" aria-hidden />
              <span className="font-mono text-xs font-bold text-slate-700">{zoneData.tagScanne}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Vous êtes ici</span>
            </div>
          </div>
        </section>

        {/* Section : Quel est le problème ? — grille colorée vibrante */}
        <section className="relative z-10 mx-auto w-full max-w-md px-4 py-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-1 w-8 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
            <h2 className="text-lg font-bold text-slate-900">Quel est le problème ?</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {zoneData.problemes.map((probleme, idx) => {
              const isSelected = highlightedProblem === probleme
              const emoji = getProblemEmoji(probleme)
              const colors = BUTTON_COLORS[idx % BUTTON_COLORS.length]
              return (
                <button
                  key={`${idx}-${probleme}`}
                  type="button"
                  onClick={() => choisirProbleme(probleme)}
                  aria-label={`Signaler : ${probleme}`}
                  className={cn(
                    "group relative flex flex-col items-center gap-2.5 overflow-hidden rounded-2xl p-4 text-center transition-all duration-300 min-h-[130px]",
                    "hover:-translate-y-1",
                    isSelected
                      ? cn("border-2 ring-2 shadow-lg", colors.selBorder, colors.selBg, colors.selRing, colors.glow)
                      : "border-2 border-white bg-white/70 backdrop-blur-md shadow-md hover:shadow-xl ring-1 ring-white/60"
                  )}
                >
                  {/* Décor gradient en haut de carte (visible au hover) */}
                  <div className={cn(
                    "absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r transition-opacity duration-300",
                    colors.bg,
                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )} />

                  {/* Émoji dans un cercle coloré */}
                  <div className={cn(
                    "flex size-14 items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                    isSelected
                      ? cn("bg-gradient-to-br text-white shadow-lg", colors.bg)
                      : "bg-gradient-to-br from-slate-100 to-slate-200 group-hover:" + colors.bg.replace('from-', 'from-').replace('to-', 'to-')
                  )}>
                    <span className="text-2xl leading-none" aria-hidden>
                      {emoji}
                    </span>
                  </div>

                  {/* Texte du problème */}
                  <span
                    className={cn(
                      "text-xs font-bold leading-snug sm:text-[13px]",
                      isSelected ? colors.selText : "text-slate-700"
                    )}
                  >
                    {probleme}
                  </span>

                  {/* Indicateur de sélection */}
                  {isSelected ? (
                    <div className="absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md">
                      <CheckCircle2 className="size-4" aria-hidden />
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>

        {/* Style inline pour l'animation float */}
        <style>{`
          @keyframes gentleFloat {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
        `}</style>
      </div>
    )
  }

  // ---------- Phase : probleme_choisi ----------
  if (phase === "probleme_choisi" && zoneData && selectedProblem) {
    const problemEmoji = getProblemEmoji(selectedProblem)
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-violet-50/30 to-sky-50/40">
        {/* --- Bandeau offline (Phase 2) : sticky en haut, au-dessus du header --- */}
        <AirportOfflineBanner />

        {/* Blobs flottants */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />

        {/* Header gradient vibrant */}
        <header className="sticky top-0 z-10 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/20">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setSelectedProblem(null)
                setHighlightedProblem(null)
                setPhase("zone_detectee")
              }}
              aria-label="Revenir au choix du problème"
              className="flex items-center gap-1 rounded-xl bg-white/15 backdrop-blur-sm px-3 py-2 text-white transition-all hover:bg-white/25 hover:scale-105"
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span className="text-xs font-bold">Changer</span>
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <AirportLogo zoneData={zoneData} />
              <span className="text-xl" aria-hidden>{zoneData.emoji}</span>
              <span className="truncate text-sm font-bold">{zoneData.nom}</span>
            </div>
            <button
              type="button"
              onClick={onExit}
              aria-label="Quitter"
              className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm text-white transition-all hover:bg-white/25 hover:scale-105"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-5">
          {/* Problème sélectionné — carte glassmorphism avec emoji coloré */}
          <div className="relative overflow-hidden rounded-2xl bg-white/70 p-4 shadow-lg backdrop-blur-md ring-1 ring-white/60">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-emerald-500" />
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md">
                <span className="text-2xl" aria-hidden>{problemEmoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                  Problème signalé
                </p>
                <p className="mt-0.5 text-sm font-bold leading-snug text-slate-800">
                  {selectedProblem}
                </p>
              </div>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md">
                <CheckCircle2 className="size-4" aria-hidden />
              </div>
            </div>
          </div>

          {/* Commentaire optionnel + saisie vocale (Phase 2 — Wolof/FR/EN) */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="airport-commentaire" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <span className="inline-block h-1 w-4 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                Précisez le problème si besoin
              </Label>
              {/* Sélecteur de langue (auto par défaut) */}
              <div className="flex items-center gap-1 rounded-full bg-white/70 p-0.5 ring-1 ring-white/60 backdrop-blur-md">
                {([
                  { k: "auto", l: "Auto" },
                  { k: "wolof", l: "Wolof" },
                  { k: "fr", l: "FR" },
                  { k: "en", l: "EN" },
                ] as const).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setVoiceLang(opt.k)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold transition-all",
                      voiceLang === opt.k
                        ? "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                    aria-pressed={voiceLang === opt.k}
                    title={`Langue parlée : ${opt.l}`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              id="airport-commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={1000}
              placeholder="Ex: Le tapis est arrêté depuis 10 minutes, environ 30 personnes attendent..."
              className="min-h-24 resize-none rounded-2xl border-2 border-white bg-white/70 backdrop-blur-md text-sm shadow-sm ring-1 ring-white/60 focus:border-violet-400 focus:ring-violet-200"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-right text-xs text-slate-400">{commentaire.length}/1000</p>
              {/* Bouton micro (Phase 2) : enregistre, transcrit (ASR), traduit en FR (LLM) */}
              {voiceState === "recording" ? (
                <button
                  type="button"
                  onClick={arreterEnregistrement}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-600 px-4 py-2 text-xs font-bold text-white shadow-md ring-2 ring-rose-300 transition-all hover:scale-105 animate-pulse"
                  aria-label="Arrêter l'enregistrement"
                >
                  <Square className="size-3.5 fill-current" aria-hidden />
                  <span>Arrêter & transcrire</span>
                </button>
              ) : voiceState === "transcribing" ? (
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-2 rounded-full bg-slate-200 px-4 py-2 text-xs font-bold text-slate-500"
                  aria-label="Transcription en cours"
                >
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  <span>Transcription…</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={demarrerEnregistrement}
                  className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:scale-105 hover:shadow-lg"
                  aria-label="Parler votre commentaire (Wolof, Français ou Anglais)"
                  title="Parlez en Wolof, Français ou Anglais — votre voix sera transcrite et traduite en français automatiquement."
                >
                  <Mic className="size-3.5" aria-hidden />
                  <span>Parler</span>
                </button>
              )}
            </div>
            {/* Aperçu voix : langue détectée + traduite */}
            {voicePreview && voiceState === "idle" && !voiceError && (
              <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="size-3.5" aria-hidden />
                {voicePreview}
              </p>
            )}
            {/* Erreur voix */}
            {voiceError && (
              <p className="flex items-center gap-1.5 rounded-lg bg-rose-50/80 px-3 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                <MicOff className="size-3.5" aria-hidden />
                {voiceError}
              </p>
            )}
          </div>

          {/* Photo optionnelle — glassmorphism avec gradient border */}
          <div className="mt-2 space-y-2">
            <Label htmlFor="airport-photo-input" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <span className="inline-block h-1 w-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" />
              Photo <span className="font-normal text-slate-400">(optionnel)</span>
            </Label>
            <input
              ref={fileInputRef}
              id="airport-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhotoChoisie}
              className="sr-only"
            />
            {!photoUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-violet-200 bg-white/60 backdrop-blur-md px-4 py-6 text-sm font-bold text-slate-600 shadow-sm transition-all hover:border-violet-400 hover:bg-white/80 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                {photoUploading ? (
                  <>
                    <Loader2 className="size-5 animate-spin text-violet-600" aria-hidden />
                    <span>Envoi de la photo…</span>
                  </>
                ) : (
                  <>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md">
                      <Camera className="size-5" aria-hidden />
                    </div>
                    <span>Ajouter une photo</span>
                  </>
                )}
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border-2 border-white bg-white/70 shadow-lg ring-1 ring-white/60">
                <img src={photoUrl} alt="Photo jointe au signalement" className="h-40 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  aria-label="Retirer la photo"
                  className="absolute end-2 top-2 flex size-9 items-center justify-center rounded-xl bg-slate-900/80 text-white backdrop-blur transition-all hover:bg-rose-600 hover:scale-105"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            )}
            {photoError ? (
              <p className="flex items-center gap-1.5 text-xs text-rose-600">
                <AlertTriangle className="size-3.5" aria-hidden />
                {photoError}
              </p>
            ) : null}
          </div>

          {/* Numéro de vol — glassmorphism */}
          <div className="mt-2 space-y-2">
            <Label htmlFor="airport-flight" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <span className="inline-block h-1 w-4 rounded-full bg-gradient-to-r from-sky-500 to-blue-500" />
              Numéro de vol{" "}
              {zoneData?.currentFlight ? (
                <span className="font-normal text-emerald-600">(détecté automatiquement depuis la porte)</span>
              ) : (
                <span className="font-normal text-slate-400">(optionnel)</span>
              )}
            </Label>
            <div className="flex items-center gap-2 rounded-2xl border-2 border-white bg-white/70 backdrop-blur-md px-3 py-1 shadow-sm ring-1 ring-white/60">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                <Plane className="size-4" aria-hidden />
              </div>
              <Input
                id="airport-flight"
                type="text"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase().slice(0, 8))}
                placeholder="Ex : AF123, DL6049…"
                className="border-0 bg-transparent font-mono text-sm uppercase tracking-wider shadow-none focus-visible:ring-0"
                autoComplete="off"
                inputMode="text"
                readOnly={!!zoneData?.currentFlight}
                aria-readonly={!!zoneData?.currentFlight}
              />
              {zoneData?.currentFlight && (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-500/30">
                  Auto
                </span>
              )}
            </div>
            {zoneData?.currentFlight ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50/80 px-3 py-1.5 text-xs text-emerald-800 ring-1 ring-emerald-200">
                <Plane className="size-3.5" aria-hidden />
                <span className="font-semibold">{zoneData.currentFlight.flightNumber}</span>
                {zoneData.currentFlight.airline && (
                  <span className="text-emerald-700">· {zoneData.currentFlight.airline}</span>
                )}
                {zoneData.currentFlight.destination && (
                  <span className="text-emerald-700">→ {zoneData.currentFlight.destination}</span>
                )}
                {zoneData.currentFlight.scheduledDeparture && (
                  <span className="text-emerald-700">· décollage {zoneData.currentFlight.scheduledDeparture}</span>
                )}
                <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  {zoneData.currentFlight.status}
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Pour escalade compagnie en cas de problème critique sur ce vol.</p>
            )}
          </div>

          {/* Erreur de soumission */}
          {submitError ? (
            <div className="mt-5 flex items-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50/80 backdrop-blur-md p-4 shadow-sm">
              <AlertTriangle className="size-5 shrink-0 text-rose-500" aria-hidden />
              <div>
                <p className="text-sm font-bold text-rose-700">Envoi impossible</p>
                <p className="text-xs text-rose-600">{submitError}</p>
              </div>
            </div>
          ) : null}

          {/* Bouton d'envoi — gradient vibrant */}
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={envoyerSignalement}
              disabled={submitting}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 py-5 text-lg font-bold text-white shadow-xl shadow-purple-500/30 transition-all hover:shadow-2xl hover:shadow-purple-500/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {/* Effet shine au hover */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {submitting ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  <span>Envoi en cours…</span>
                </>
              ) : (
                <>
                  <Send className="size-5" aria-hidden />
                  <span>Signaler le problème</span>
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ---------- Phase : confirmation ----------
  if (phase === "confirmation" && reportResult) {
    const dateFormatee = formaterDate(reportResult.report.createdAt)
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-violet-50/40">
        {/* --- Bandeau offline (Phase 2) : sticky en haut --- */}
        <AirportOfflineBanner />

        {/* Blobs flottants — ambiance célébration */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-20 h-64 w-64 rounded-full bg-violet-300/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-56 w-56 rounded-full bg-sky-300/15 blur-3xl" />

        {/* CSS keyframe pour l'onde sonore Denise */}
        <style>{`
          @keyframes fbp-denise-wave {
            0%, 100% { height: 5px; }
            50% { height: 20px; }
          }
        `}</style>

        <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
          {/* Logo aéroport + coche succès */}
          <div className="flex flex-col items-center text-center">
            {/* Logo aéroport (si configuré) OU fallback icône avion */}
            {zoneData?.airportLogo ? (
              <img
                src={zoneData.airportLogo}
                alt={zoneData.airportName ?? "Aéroport"}
                className="mb-4 h-16 w-auto rounded-lg object-contain bg-white/80 p-1 shadow-md backdrop-blur-md"
              />
            ) : (
              <div className="mb-4 flex h-16 items-center justify-center rounded-2xl bg-white/80 px-4 shadow-md backdrop-blur-md ring-1 ring-white/60">
                <Plane className="size-8 text-[#5257C9]" aria-hidden />
              </div>
            )}
            {zoneData?.airportName && (
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
                {zoneData.airportName}
              </p>
            )}
            <div className="relative">
              <div className="absolute inset-0 -m-6 rounded-full bg-gradient-to-br from-emerald-300/40 to-teal-300/30 blur-2xl" />
              <div className="relative flex size-24 animate-in fade-in zoom-in-50 items-center justify-center rounded-3xl bg-white/70 shadow-xl backdrop-blur-md ring-1 ring-white/60 duration-500">
                <CheckCircle2 className="size-14 text-emerald-500" strokeWidth={2.5} aria-hidden />
              </div>
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 bg-clip-text text-transparent">
              Merci !
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Votre signalement a bien été reçu.
            </p>

            {/* ---------- Bloc Denise : confirmation vocale animée ---------- */}
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 px-4 py-3 ring-1 ring-violet-300/30 backdrop-blur-md">
              {/* Onde sonore animée */}
              <div className="flex items-center gap-[3px] h-5" aria-hidden>
                {[0, 0.1, 0.2, 0.3, 0.15].map((delay, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-violet-500"
                    style={{
                      animation: `fbp-denise-wave 1s ${delay}s infinite ease-in-out`,
                      height: '8px',
                    }}
                  />
                ))}
              </div>
              <p className="text-left text-xs font-medium leading-snug text-violet-800">
                <span className="font-bold">Denise confirme :</span> L&apos;équipe{' '}
                <span className="font-bold">
                  {serviceLabel(routerVersService(reportResult.report.problemType))}
                </span>{' '}
                a été alertée vocalement à{' '}
                <span className="font-mono font-bold">
                  {new Date(reportResult.report.createdAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                .
              </p>
            </div>
          </div>

          {/* Carte récapitulatif — glassmorphism */}
          <div className="mt-6 relative overflow-hidden rounded-2xl bg-white/70 p-4 shadow-lg backdrop-blur-md ring-1 ring-white/60">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-emerald-500" />
            {/* Badge statut clignotant */}
            <div className="mb-3 flex justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-400/30 animate-pulse">
                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                En cours de traitement
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md">
                <span className="text-xl" aria-hidden>{reportResult.zone.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Zone</p>
                <p className="truncate text-sm font-bold text-slate-800">{reportResult.zone.nom}</p>
              </div>
            </div>
            <div className="my-3 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <div className="flex items-start gap-2">
              <span className="mt-0.5 min-w-[64px] text-[10px] font-bold uppercase tracking-wider text-slate-400">Problème</span>
              <p className="flex-1 text-sm font-bold text-slate-800">{reportResult.report.problemType}</p>
            </div>
            {reportResult.report.flightNumber ? (
              <div className="mt-2 flex items-start gap-2">
                <span className="mt-0.5 min-w-[64px] text-[10px] font-bold uppercase tracking-wider text-slate-400">Vol</span>
                <p className="flex-1 inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
                  <div className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                    <Plane className="size-3" aria-hidden />
                  </div>
                  <span className="font-mono">{reportResult.report.flightNumber}</span>
                </p>
              </div>
            ) : null}
            {reportResult.vlmPending ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50/80 backdrop-blur-md p-3 text-xs text-violet-800 ring-1 ring-violet-100">
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-violet-600" aria-hidden />
                <p>
                  <strong>Analyse IA de votre photo en cours…</strong> Le système catégorise
                  automatiquement le problème et route vers la bonne équipe ops.
                </p>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signalement</span>
              <span className="font-mono text-xs text-slate-400">#{reportResult.report.id.slice(0, 8)} · {dateFormatee}</span>
            </div>
          </div>

          {/* ---------- Bouton SOS — gradient rose vibrant ---------- */}
          <section className="mt-4">
            <button
              type="button"
              onClick={ouvrirAide}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 py-4 text-base font-bold text-white shadow-xl shadow-rose-500/30 transition-all hover:shadow-2xl hover:shadow-rose-500/40 active:scale-[0.99]"
              aria-label="Demander de l'aide immédiatement"
            >
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <LifeBuoy className="size-5" aria-hidden />
              🆘 Demander de l'aide immédiatement
            </button>
            <p className="mt-1.5 text-center text-xs text-slate-400">
              Un agent ops vient vous aider sur place
            </p>
          </section>

          {/* ---------- Dialog "Demande d'aide" ---------- */}
          <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogContent className="sm:max-w-md rounded-2xl border-2 border-white bg-white/90 backdrop-blur-xl">
              {helpSuccess ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 -m-4 rounded-full bg-emerald-300/30 blur-xl" />
                    <div className="relative flex size-16 animate-in fade-in zoom-in-50 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg duration-300">
                      <CheckCircle2 className="size-9" aria-hidden />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">✅ Demande envoyée</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{helpSuccess}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.99]"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-rose-700">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 text-white">
                        <LifeBuoy className="size-4" aria-hidden />
                      </div>
                      Demander de l'aide
                    </DialogTitle>
                    <DialogDescription>
                      Un agent ops est notifié et vient vous aider sur place.
                      Position détectée : {zoneData?.tagScanne ?? "—"}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="help-message" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span className="inline-block h-1 w-3 rounded-full bg-gradient-to-r from-rose-500 to-pink-500" />
                        Précisez votre besoin (optionnel)
                      </Label>
                      <Textarea
                        id="help-message"
                        value={helpMessage}
                        onChange={(e) => setHelpMessage(e.target.value.slice(0, 500))}
                        maxLength={500}
                        rows={3}
                        placeholder="Ex : mon bagage est bloqué, j'ai besoin d'aide pour le récupérer…"
                        className="resize-none rounded-xl border-2 border-white bg-white/60 backdrop-blur-md text-sm ring-1 ring-white/40 focus:border-rose-400 focus:ring-rose-200"
                      />
                      <p className="text-right text-[10px] text-slate-400">{helpMessage.length}/500</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="help-phone" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span className="inline-block h-1 w-3 rounded-full bg-gradient-to-r from-sky-500 to-blue-500" />
                        Pour que l'agent vous contacte (optionnel)
                      </Label>
                      <Input
                        id="help-phone"
                        type="tel"
                        inputMode="tel"
                        value={helpPhone}
                        onChange={(e) => setHelpPhone(e.target.value)}
                        placeholder="+33 6 12 34 56 78"
                        className="h-11 rounded-xl border-2 border-white bg-white/60 backdrop-blur-md text-base ring-1 ring-white/40 focus:border-sky-400 focus:ring-sky-200"
                      />
                    </div>

                    {helpError ? (
                      <div className="flex items-center gap-2 rounded-xl border-2 border-rose-200 bg-rose-50/80 backdrop-blur-md p-3">
                        <AlertTriangle className="size-4 shrink-0 text-rose-500" aria-hidden />
                        <p className="text-xs text-rose-600">{helpError}</p>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={envoyerDemandeAide}
                      disabled={helpSubmitting}
                      className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-70"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                      {helpSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Envoi en cours…
                        </>
                      ) : (
                        <>
                          <Send className="size-4" aria-hidden />
                          Envoyer la demande
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* ---------- D8 — Carte de notation (avis Google / retour interne) ----------
              Affichée uniquement si le signalement a été réellement soumis
              (pas un pending offline — l'enjeu du voyageur hors-ligne est
              d'abord de savoir si son rapport est en sécurité). Une fois la
              note saisie, on adapte le CTA :
              - 4-5★ + airportGoogleReviewUrl → bouton ouvrant la page d'avis
              - 4-5★ sans URL → message de remerciement (l'aéroport n'a pas
                configuré sa page Google Reviews)
              - 1-3★ → message d'excuse + email optionnel + retour interne
                POST /api/airport/help */}
          {!ratingSubmitted &&
            !reportResult.report.id.startsWith("pending-") && (
              <section
                aria-label="Noter votre expérience à l'aéroport"
                className="mt-4 relative overflow-hidden rounded-2xl bg-white/70 p-5 shadow-lg backdrop-blur-md ring-1 ring-white/60"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-fuchsia-400" />
                <div className="flex items-start gap-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
                    <Star className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-800">
                      Comment évaluez-vous votre expérience à l&apos;aéroport ?
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Votre avis nous aide à améliorer le quotidien des voyageurs.
                    </p>
                  </div>
                </div>

                {/* Sélecteur d&apos;étoiles (1-5) */}
                <div
                  className="mt-4 flex items-center justify-center gap-2"
                  role="radiogroup"
                  aria-label="Note de 1 à 5 étoiles"
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const isFilled = rating !== null && n <= rating
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                        onClick={() => setRating(n)}
                        className="size-10 rounded-xl transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star
                          className={cn(
                            "size-10 transition-colors",
                            isFilled
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-300",
                          )}
                          aria-hidden
                        />
                      </button>
                    )
                  })}
                </div>

                {/* CTA adapté à la note sélectionnée */}
                {rating !== null && (
                  <div className="mt-4">
                    {rating >= 4 ? (
                      // --- Positif (4-5★) ---
                      <>
                        <p className="text-center text-sm leading-relaxed text-slate-700">
                          Merci ! Votre avis positif nous aide beaucoup. Souhaitez-vous
                          le partager sur Google Reviews ?
                        </p>
                        {zoneData?.airportGoogleReviewUrl ? (
                          <button
                            type="button"
                            onClick={ouvrirAvisGoogle}
                            className="group relative mt-3 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:shadow-xl active:scale-[0.99]"
                          >
                            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                            <ExternalLink className="size-4" aria-hidden />
                            Laisser un avis Google ★
                          </button>
                        ) : (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-center text-xs font-medium text-amber-800">
                            L&apos;aéroport n&apos;a pas encore configuré sa page Google
                            Reviews — merci pour votre note !
                          </div>
                        )}
                      </>
                    ) : (
                      // --- Négatif (1-3★) ---
                      <>
                        <p className="text-center text-sm leading-relaxed text-slate-700">
                          Nous sommes désolés pour cette expérience. Votre retour interne
                          nous aide à nous améliorer.
                        </p>
                        <div className="mt-3 space-y-2">
                          <Label
                            htmlFor="rating-email"
                            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            <span className="inline-block h-1 w-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                            Votre email (optionnel, pour être contacté par l&apos;équipe ops)
                          </Label>
                          <Input
                            id="rating-email"
                            type="email"
                            inputMode="email"
                            value={ratingEmail}
                            onChange={(e) => setRatingEmail(e.target.value.slice(0, 120))}
                            placeholder="vous@exemple.com"
                            className="h-11 rounded-xl border-2 border-white bg-white/60 backdrop-blur-md text-base ring-1 ring-white/40 focus:border-violet-400 focus:ring-violet-200"
                            autoComplete="email"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={envoyerRetourInterne}
                          disabled={ratingSubmitting}
                          className="group relative mt-3 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-sm font-bold text-white shadow-lg shadow-purple-500/30 transition-all hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                          {ratingSubmitting ? (
                            <>
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                              Envoi en cours…
                            </>
                          ) : (
                            <>
                              <Send className="size-4" aria-hidden />
                              Envoyer mon retour interne
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

          {/* Confirmation discrète affichée après soumission du retour interne
              (note 1-3★). La carte de notation est masquée (ratingSubmitted=true),
              on montre juste un mini-accusé de réception pour que le voyageur
              sache que son retour est bien parti. */}
          {ratingSubmitted && rating !== null && rating <= 3 && (
            <div
              role="status"
              className="mt-4 flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/80 p-3 backdrop-blur-md text-sm font-medium text-violet-900"
            >
              <ShieldCheck className="size-4 shrink-0 text-violet-600" aria-hidden />
              Merci — votre retour a été transmis à l&apos;équipe ops.
            </div>
          )}

          {/* Actions collées en bas */}
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <button
              type="button"
              onClick={signalerAutre}
              className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-sm font-bold text-white shadow-xl shadow-purple-500/30 transition-all hover:shadow-2xl active:scale-[0.99]"
            >
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              Signaler un autre problème
            </button>
            <button
              type="button"
              onClick={quitterAvecPub}
              disabled={exitAdLoading}
              className="inline-flex items-center gap-1.5 text-center text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-600 hover:underline disabled:opacity-60"
            >
              {exitAdLoading ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Fermeture…
                </>
              ) : (
                "Quitter"
              )}
            </button>
            <p className="mt-2 text-center text-xs text-slate-300">
              ✈️ Aéroport — Service voyageur
            </p>
          </div>
        </main>

        {/* ---------- Feature 1 : overlay publicitaire plein écran ---------- */}
        {/* Affiché quand le voyageur clique « Quitter » ET qu'une publicité
            active a été tirée au sort côté serveur. Glassmorphism + gradient
            vibrant pour matcher le style créatif de la PWA. */}
        {exitAd && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={exitAd.title}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
          >
            {/* Voile gradient sombre avec blobs colorés */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-purple-950/90 to-fuchsia-950/95 backdrop-blur-md" />
            <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />

            {/* Carte publicité — glassmorphism */}
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white/10 shadow-2xl ring-1 ring-white/30 backdrop-blur-xl">
              {/* Bande gradient en haut */}
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" />

              {/* Image plein écran format téléphone (9:16) si présente */}
              {exitAd.imageUrl && (
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '9 / 16', maxHeight: '70vh' }}>
                  <img
                    src={exitAd.imageUrl}
                    alt={exitAd.title}
                    className="h-full w-full object-contain"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                    Publicité
                  </span>
                </div>
              )}

              {/* Contenu texte */}
              <div className="px-5 pb-5 pt-4 text-center">
                {!exitAd.imageUrl && (
                  <span className="mb-3 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">
                    Publicité
                  </span>
                )}
                <h2 className="text-2xl font-black leading-tight text-white drop-shadow-md">
                  {exitAd.title}
                </h2>
                {exitAd.subtitle && (
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white/90">
                    {exitAd.subtitle}
                  </p>
                )}

                {/* CTA — gradient vibrant, incrémente clicks puis ouvre le lien */}
                <button
                  type="button"
                  onClick={onAdCtaClick}
                  className="group relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 py-4 text-base font-black text-white shadow-xl shadow-fuchsia-500/30 transition-all hover:shadow-2xl active:scale-[0.99]"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <span>{exitAd.ctaText || "En savoir plus"}</span>
                  <ExternalLink className="size-4" aria-hidden />
                </button>

                {/* Bouton « Fermer » discret en bas → déclenche la sortie */}
                <button
                  type="button"
                  onClick={fermerPubEtQuitter}
                  className="mt-3 text-xs font-medium text-white/60 underline-offset-4 transition-colors hover:text-white/90 hover:underline"
                >
                  Fermer et quitter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------- Repli défensif (ne devrait jamais arriver) ----------
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <Loader2 className="size-6 animate-spin text-amber-300" aria-hidden />
    </div>
  )
}
