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
  LifeBuoy,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Plane,
  Send,
  ShieldCheck,
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
  const [helpSuccess, setHelpSuccess] = useState<string | null>(null)

  // ---------- Effet : fetch de la zone au montage + quand le tag change ----------
  useEffect(() => {
    let cancelled = false
    setPhase("loading")
    setZoneData(null)
    apiGet<{ zone: ZoneData }>(`/api/airport/zone/${encodeURIComponent(tag)}`)
      .then((res) => {
        if (cancelled) return
        setZoneData(res.zone)
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

  // ---------- Soumission du signalement (POST /api/airport/report) ----------
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
      const result = await apiPost<ReportResult>("/api/airport/report", body)
      setReportResult(result)
      setPhase("confirmation")
      try {
        window.scrollTo({ top: 0, behavior: "smooth" })
      } catch {
        /* ignore */
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Envoi impossible")
    } finally {
      setSubmitting(false)
    }
  }, [zoneData, selectedProblem, submitting, commentaire, photoUrl, flightNumber])

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
    setPhase("zone_detectee")
    try {
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch {
      /* ignore */
    }
  }, [])

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
        {/* Décoration : blobs flottants colorés en arrière-plan */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-20 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-56 w-56 rounded-full bg-sky-300/15 blur-3xl" />

        {/* Header — gradient vibrant avec glassmorphism */}
        <header className="relative z-10 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/20">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                <Plane className="size-4 text-white" aria-hidden />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-white/90">
                Aéroport
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

          {/* Commentaire optionnel — glassmorphism */}
          <div className="mt-5 space-y-2">
            <Label htmlFor="airport-commentaire" className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <span className="inline-block h-1 w-4 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
              Précisez le problème si besoin
            </Label>
            <Textarea
              id="airport-commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={1000}
              placeholder="Ex: Le tapis est arrêté depuis 10 minutes, environ 30 personnes attendent..."
              className="min-h-24 resize-none rounded-2xl border-2 border-white bg-white/70 backdrop-blur-md text-sm shadow-sm ring-1 ring-white/60 focus:border-violet-400 focus:ring-violet-200"
            />
            <p className="text-right text-xs text-slate-400">{commentaire.length}/1000</p>
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
              Numéro de vol <span className="font-normal text-slate-400">(optionnel)</span>
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
              />
            </div>
            <p className="text-xs text-slate-400">Pour escalade compagnie en cas de problème critique sur ce vol.</p>
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
      <div className="flex min-h-screen flex-col bg-background">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
          {/* Coche succès animée (pop-in) */}
          <div className="flex flex-col items-center text-center">
            <div className="flex size-24 animate-in fade-in zoom-in-50 items-center justify-center rounded-full bg-emerald-50 ring-4 ring-emerald-100 duration-500">
              <CheckCircle2 className="size-20 text-emerald-500" aria-hidden />
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-900">Merci !</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Votre signalement a bien été reçu. L'équipe technique de l'aéroport a été notifiée
              et intervient sur place.
            </p>
          </div>

          {/* Carte récapitulatif */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>
                {reportResult.zone.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Zone
                </p>
                <p className="truncate text-sm font-bold text-slate-900">
                  {reportResult.zone.nom}
                </p>
              </div>
            </div>
            <div className="my-3 h-px bg-slate-100" />
            <div className="flex items-start gap-2">
              <span className="mt-0.5 min-w-[64px] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Problème
              </span>
              <p className="flex-1 text-sm font-semibold text-slate-800">
                {reportResult.report.problemType}
              </p>
            </div>
            {reportResult.report.flightNumber ? (
              <div className="mt-2 flex items-start gap-2">
                <span className="mt-0.5 min-w-[64px] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Vol
                </span>
                <p className="flex-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Plane className="size-3.5 text-slate-500" aria-hidden />
                  <span className="font-mono">{reportResult.report.flightNumber}</span>
                </p>
              </div>
            ) : null}
            {reportResult.vlmPending ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-violet-50 p-2.5 text-xs text-violet-800">
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-violet-600" aria-hidden />
                <p>
                  <strong>Analyse IA de votre photo en cours…</strong> Le système catégorise
                  automatiquement le problème et route vers la bonne équipe ops.
                </p>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Signalement
              </span>
              <span className="font-mono text-xs text-slate-500">
                #{reportResult.report.id.slice(0, 8)} · {dateFormatee}
              </span>
            </div>
          </div>

          {/* Section opt-in WhatsApp */}
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-start gap-2">
              <MessageSquare className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-emerald-900">
                  Recevoir un WhatsApp lorsque le problème est résolu
                </h2>
                <p className="mt-0.5 text-xs text-emerald-800/80">
                  On vous prévient dès qu'une équipe intervient. Aucun usage commercial.
                </p>
              </div>
            </div>

            {whatsappSubmitted ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-100 p-3 text-sm text-emerald-900">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                <p>
                  ✅ Vous serez notifié au{" "}
                  <strong>{masquerTelephone(whatsappSubmitted.whatsappPhone)}</strong> dès que le
                  problème sera résolu.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <Input
                  type="tel"
                  inputMode="tel"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                  className="h-11 bg-white text-base"
                  aria-label="Numéro WhatsApp"
                />
                {whatsappError ? (
                  <p className="flex items-center gap-1.5 text-xs text-rose-600">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {whatsappError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  onClick={activerWhatsapp}
                  disabled={whatsappSubmitting}
                  className="h-11 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-70"
                >
                  {whatsappSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Activation…
                    </>
                  ) : (
                    <>
                      <MessageSquare className="size-4" aria-hidden />
                      Activer la notification
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>

          {/* ---------- Bouton "Aide" PWA ---------- */}
          {/* Bouton rouge plein large — reste visible même après une demande réussie. */}
          <section className="mt-4">
            <button
              type="button"
              onClick={ouvrirAide}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-4 text-base font-bold text-white shadow-lg shadow-rose-600/20 transition-all hover:bg-rose-700 active:scale-[0.99]"
              aria-label="Demander de l'aide immédiatement"
            >
              <LifeBuoy className="size-5" aria-hidden />
              🆘 Demander de l'aide immédiatement
            </button>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Un agent ops vient vous aider sur place
            </p>
          </section>

          {/* ---------- Dialog "Demande d'aide" ---------- */}
          <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogContent className="sm:max-w-md">
              {helpSuccess ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex size-16 animate-in fade-in zoom-in-50 items-center justify-center rounded-full bg-emerald-50 ring-4 ring-emerald-100 duration-300">
                    <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      ✅ Demande envoyée
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {helpSuccess}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Fermer
                  </Button>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-rose-700">
                      <LifeBuoy className="size-5" aria-hidden />
                      Demander de l'aide
                    </DialogTitle>
                    <DialogDescription>
                      Un agent ops est notifié et vient vous aider sur place.
                      Position détectée : {zoneData?.tagScanne ?? "—"}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="help-message"
                        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Précisez votre besoin (optionnel)
                      </Label>
                      <Textarea
                        id="help-message"
                        value={helpMessage}
                        onChange={(e) =>
                          setHelpMessage(e.target.value.slice(0, 500))
                        }
                        maxLength={500}
                        rows={3}
                        placeholder="Ex : mon bagage est bloqué, j'ai besoin d'aide pour le récupérer…"
                        className="resize-none bg-white text-sm"
                      />
                      <p className="text-right text-[10px] text-muted-foreground">
                        {helpMessage.length}/500
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="help-phone"
                        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        <Phone className="size-3" aria-hidden />
                        Pour que l'agent vous contacte (optionnel)
                      </Label>
                      <Input
                        id="help-phone"
                        type="tel"
                        inputMode="tel"
                        value={helpPhone}
                        onChange={(e) => setHelpPhone(e.target.value)}
                        placeholder="+33 6 12 34 56 78"
                        className="h-11 bg-white text-base"
                      />
                    </div>

                    {helpError ? (
                      <Alert variant="destructive">
                        <AlertTriangle className="size-4" aria-hidden />
                        <AlertTitle>Envoi impossible</AlertTitle>
                        <AlertDescription>{helpError}</AlertDescription>
                      </Alert>
                    ) : null}

                    <Button
                      type="button"
                      onClick={envoyerDemandeAide}
                      disabled={helpSubmitting}
                      className="h-11 w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-70"
                    >
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
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Tertiaire : voir le message envoyé aux équipes */}
          <details className="mt-4 group rounded-xl border border-slate-200 bg-white p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-900">
              <span>Voir le message envoyé aux équipes</span>
              <span className="text-xs text-muted-foreground group-open:hidden">afficher</span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">masquer</span>
            </summary>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
              {reportResult.whatsapp.message}
            </pre>
          </details>

          {/* Actions collées en bas (mt-auto sur flex-col min-h-screen) */}
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <button
              type="button"
              onClick={signalerAutre}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-slate-900 text-sm font-bold text-white transition-colors hover:bg-slate-800"
            >
              Signaler un autre problème
            </button>
            <button
              type="button"
              onClick={onExit}
              className="text-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-slate-700 hover:underline"
            >
              Quitter
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              ✈️ Aéroport — Service voyageur
            </p>
          </div>
        </main>
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
