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
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Bandeau sombre aéroport */}
        <header className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Plane className="size-4 text-amber-300" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Aéroport
              </span>
            </div>
            <button
              type="button"
              onClick={onExit}
              aria-label="Quitter le signalement"
              className="flex size-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        {/* Hero zone */}
        <section className="mx-auto w-full max-w-md px-4 pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="text-6xl leading-none" aria-hidden>
              {zoneData.emoji}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              {zoneData.nom}
            </h1>
            {zoneData.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{zoneData.description}</p>
            ) : null}
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
              <MapPin className="size-3.5 text-amber-300" aria-hidden />
              <span className="font-mono">{zoneData.tagScanne}</span>
              <span className="text-slate-400">· Vous êtes ici</span>
            </div>
          </div>
        </section>

        {/* Section : Quel est le problème ? */}
        <section className="mx-auto w-full max-w-md px-4 py-6">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Quel est le problème ?</h2>
          <ul className="flex flex-col gap-3">
            {zoneData.problemes.map((probleme, idx) => {
              const isSelected = highlightedProblem === probleme
              return (
                <li key={`${idx}-${probleme}`}>
                  <button
                    type="button"
                    onClick={() => choisirProbleme(probleme)}
                    aria-label={`Signaler : ${probleme}`}
                    className={cn(
                      "group flex w-full items-center justify-between gap-3 rounded-xl border bg-white py-5 pe-4 ps-5 text-left shadow-sm transition-all duration-200",
                      "min-h-[60px] hover:-translate-y-0.5 hover:shadow-md",
                      "border-l-4",
                      isSelected
                        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
                        : "border-l-slate-200 hover:border-l-amber-400"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-semibold leading-snug sm:text-base",
                        isSelected ? "text-amber-900" : "text-slate-800"
                      )}
                    >
                      {probleme}
                    </span>
                    {isSelected ? (
                      <CheckCircle2 className="size-5 shrink-0 text-amber-600" aria-hidden />
                    ) : (
                      <span
                        className="size-5 shrink-0 rounded-full border-2 border-slate-200 transition-colors group-hover:border-amber-400"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    )
  }

  // ---------- Phase : probleme_choisi ----------
  if (phase === "probleme_choisi" && zoneData && selectedProblem) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Bandeau sombre aéroport avec retour + zone sticky */}
        <header className="sticky top-0 z-10 bg-slate-900 text-white shadow-md">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setSelectedProblem(null)
                setHighlightedProblem(null)
                setPhase("zone_detectee")
              }}
              aria-label="Revenir au choix du problème"
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="size-5" aria-hidden />
              <span className="text-xs font-semibold">Changer</span>
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xl" aria-hidden>
                {zoneData.emoji}
              </span>
              <span className="truncate text-sm font-bold">{zoneData.nom}</span>
            </div>
            <button
              type="button"
              onClick={onExit}
              aria-label="Quitter"
              className="flex size-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-5">
          {/* Problème sélectionné (carte amber) */}
          <div className="flex items-start gap-3 rounded-xl border border-amber-500 bg-amber-50 p-4">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Problème signalé
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-amber-900">
                {selectedProblem}
              </p>
            </div>
          </div>

          {/* Commentaire optionnel */}
          <div className="mt-5 space-y-2">
            <Label htmlFor="airport-commentaire" className="text-sm font-semibold text-slate-800">
              Précisez le problème si besoin
            </Label>
            <Textarea
              id="airport-commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={1000}
              placeholder="Ex: Le tapis est arrêté depuis 10 minutes, environ 30 personnes attendent..."
              className="min-h-24 resize-none bg-white text-sm"
            />
            <p className="text-right text-xs text-muted-foreground">
              {commentaire.length}/1000
            </p>
          </div>

          {/* Photo optionnelle */}
          <div className="mt-2 space-y-2">
            <Label htmlFor="airport-photo-input" className="text-sm font-semibold text-slate-800">
              Photo (optionnel)
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
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-sm font-medium text-slate-600 transition-colors hover:border-amber-400 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {photoUploading ? (
                  <>
                    <Loader2 className="size-5 animate-spin text-amber-600" aria-hidden />
                    <span>Envoi de la photo…</span>
                  </>
                ) : (
                  <>
                    <Camera className="size-5 text-amber-600" aria-hidden />
                    <span>Ajouter une photo</span>
                  </>
                )}
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                <img
                  src={photoUrl}
                  alt="Photo jointe au signalement"
                  className="h-40 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  aria-label="Retirer la photo"
                  className="absolute end-2 top-2 flex size-9 items-center justify-center rounded-full bg-slate-900/80 text-white backdrop-blur transition-colors hover:bg-slate-900"
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

          {/* Numéro de vol optionnel (rattachement signalement → vol) */}
          <div className="mt-2 space-y-2">
            <Label htmlFor="airport-flight" className="text-sm font-semibold text-slate-800">
              Numéro de vol <span className="font-normal text-slate-500">(optionnel)</span>
            </Label>
            <div className="flex items-center gap-2">
              <Plane className="size-4 shrink-0 text-slate-400" aria-hidden />
              <Input
                id="airport-flight"
                type="text"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase().slice(0, 8))}
                placeholder="Ex : AF123, DL6049…"
                className="bg-white font-mono text-sm uppercase tracking-wider"
                autoComplete="off"
                inputMode="text"
              />
            </div>
            <p className="text-xs text-slate-500">
              Pour escalade compagnie en cas de problème critique sur ce vol.
            </p>
          </div>

          {/* Erreur de soumission */}
          {submitError ? (
            <Alert variant="destructive" className="mt-5">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Envoi impossible</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          {/* Bouton d'envoi (poussé en bas via mt-auto) */}
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={envoyerSignalement}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-5 text-lg font-bold text-white shadow-lg shadow-rose-600/20 transition-all hover:bg-rose-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
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
