"use client"

// ============================================================
// FeedbackPro - ScanView (flux client final, 100 % mobile)
// Le client a scanné le QR code d'une ZONE (Accueil, Salle,
// Toilettes RDC…) imprimée dans le commerce. Sans authentification.
// Machine à états : loading → error | step1 (note) → step2 (tags) → step3 (commentaire + envoi) → success
//
// Contrat API (implémenté par l'agent backend) :
//   POST /api/public/scan   { qrToken }
//     → { ok, data: { zone: { nom, description }, pro: { nomEtablissement, logoUrl, recompense }, tagsPositifs: string[], tagsNegatifs: string[] } }
//   POST /api/public/retour { qrToken, note, tags[], commentaire?, personnelMentionne?, canalChoisi? }
//     → { ok, data: { retour, recompense: string | null } }
//   Réponses en erreur : { ok: false, error: "message FR" }
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Star,
  X,
} from "lucide-react"
import { ALL_TAGS, NEGATIVE_TAGS, POSITIVE_TAGS, type TagDef } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

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
  }
  tagsPositifs: string[]
  tagsNegatifs: string[]
}

type Phase = "loading" | "error" | "step1" | "step2" | "step3" | "success"
type CanalEnvoi = "whatsapp" | "aucun"

// ---------- Constantes d'affichage ----------

// Émoji + libellé affichés sous les étoiles selon la note survolée / choisie
const EMOJIS_NOTE: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😍" }
const LIBELLES_NOTE: Record<number, string> = {
  1: "Aïe, désolé…",
  2: "Bof…",
  3: "Moyen",
  4: "Très bien !",
  5: "Génial !",
}

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
  const liste = positif ? POSITIVE_TAGS : NEGATIVE_TAGS
  return (
    liste.find((t) => t.id === id) ?? ALL_TAGS.find((t) => t.id === id) ?? { id, label: id, emoji: "🏷️" }
  )
}

// Message WhatsApp construit côté client : le gérant le reçoit en direct
function construireMessageWhatsApp(args: {
  positif: boolean
  nomZone: string
  note: number
  tags: string[]
  personnel?: string | null
  commentaire?: string | null
}): string {
  const lignes = [
    args.positif ? "🎉 RETOUR POSITIF" : "⚠️ RÉCLAMATION",
    `📍 Zone : ${args.nomZone}`,
    `⭐ Note : ${args.note}/5`,
  ]
  if (args.tags.length > 0) {
    const labels = args.tags.map((id) => {
      const def = definitionTag(id, args.positif)
      return `${def.emoji} ${def.label}`
    })
    lignes.push(`🏷️ ${labels.join(", ")}`)
  }
  if (args.personnel) lignes.push(`👤 Personnel : ${args.personnel}`)
  if (args.commentaire) lignes.push(`💬 ${args.commentaire}`)
  lignes.push("")
  lignes.push("Envoyé via FeedbackPro ✨")
  return lignes.join("\n")
}

// ---------- Écran de chargement : skeleton + spinner léger ----------

function EcranChargement() {
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
      <p className="text-sm text-muted-foreground">Chargement de votre formulaire…</p>
    </div>
  )
}

// ---------- En-tête commun : logo + nom + badge zone + sous-titre ----------

function EnTeteEtablissement({
  pro,
  zone,
  avecSousTitre,
  avecMarge,
}: {
  pro: ScanData["pro"]
  zone: ScanData["zone"]
  avecSousTitre: boolean
  avecMarge: boolean
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
          Votre avis compte — 15 secondes chrono ⏱️
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

  // Animation d'étoile + prévisualisation au survol/focus (desktop)
  const [pulse, setPulse] = useState<number | null>(null)
  const [survol, setSurvol] = useState<number | null>(null)

  // Envoi
  const [soumission, setSoumission] = useState<CanalEnvoi | null>(null)
  const [dernierCanal, setDernierCanal] = useState<CanalEnvoi>("whatsapp")
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null)
  const [recompenseGagnee, setRecompenseGagnee] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Nettoyage du timer de transition étoile → étape 2
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const estPositif = note >= 4
  // Note affichée : celle survolée (prévisualisation) sinon celle choisie
  const afficheNote = survol ?? note

  // Récompense affichée sur l'écran de succès : celle gagnée à l'envoi, sinon celle du pro
  const recompenseFinale = recompenseGagnee ?? scanData?.pro.recompense ?? null
  const numeroWhatsApp = (scanData?.pro.whatsapp ?? "").replace(/[^0-9]/g, "")
  const aWhatsApp = numeroWhatsApp.length > 0

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
      if (!res.ok || !json?.ok) throw new Error(json?.error || "QR code inconnu ou expiré")
      setScanData(json.data as ScanData)
      // Nouveau scan = nouvelles réponses
      setNote(0)
      setTags([])
      setPersonnel("")
      setCommentaire("")
      setRecompenseGagnee(null)
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
    // Petite pause pour laisser l'animation respirer, puis auto-avance
    timerRef.current = setTimeout(() => allerEtape("step2", 1), 600)
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
    setTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
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
          canalChoisi: canal,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Impossible d'envoyer le retour pour le moment")
      }

      if (typeof json.data?.recompense === "string" && json.data.recompense) {
        setRecompenseGagnee(json.data.recompense as string)
      }

      // Ouvre WhatsApp avec le message pré-rempli (uniquement si un numéro est configuré)
      if (canal === "whatsapp" && numero) {
        const message = construireMessageWhatsApp({
          positif: estPositif,
          nomZone: scanData.zone.nom,
          note,
          tags,
          personnel: personnel.trim() || null,
          commentaire: commentaire.trim() || null,
        })
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
      toast({ title: "Envoi impossible", description: message, variant: "destructive" })
    } finally {
      setSoumission(null)
    }
  }

  // ---------- Écran de chargement ----------
  if (phase === "loading") {
    return <EcranChargement />
  }

  // Indice d'étape pour la barre de progression (3 segments)
  const etapeIdx = phase === "step1" ? 0 : phase === "step2" ? 1 : 2

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-stone-100 p-3 sm:p-6">
      <div className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-lg">
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

          {/* Bouton discret Quitter (étapes 1 à 3) */}
          {onExit &&
            (phase === "step1" || phase === "step2" || phase === "step3") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onExit}
                aria-label="Quitter et revenir en arrière"
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
                        QR code inconnu ou expiré
                      </h1>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {erreurScan
                          ? `${erreurScan}. `
                          : ""}
                        Vérifiez le QR code affiché chez le commerçant, puis réessayez.
                      </p>
                    </div>
                    <Button
                      onClick={chargerScan}
                      className="h-12 min-w-40 text-base font-semibold"
                      aria-label="Réessayer le chargement du QR code"
                    >
                      Réessayer
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={onExit}
                      className="min-h-11 text-sm text-muted-foreground"
                    >
                      Retour à l&apos;accueil
                    </Button>
                  </div>
                )}

                {/* ---------- ÉTAPE 1 : la note ---------- */}
                {phase === "step1" && scanData && (
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      Comment s&apos;est passée votre expérience dans{" "}
                      <span className="text-primary">{scanData.zone.nom}</span>&nbsp;?
                    </h1>

                    {/* 5 étoiles très grandes (hauteur 68 px ≥ 60 px de zone tactile).
                        flex-1 + max-w évite tout débordement horizontal, même sur iPhone SE 320 px. */}
                    <div
                      role="radiogroup"
                      aria-label="Votre note de 1 à 5 étoiles"
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
                            aria-label={`Donner ${i} étoile${i > 1 ? "s" : ""}`}
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
                              {LIBELLES_NOTE[afficheNote]}
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
                      <ArrowLeft aria-hidden className="size-4" /> Retour
                    </Button>
                  </div>
                )}

                {/* ---------- ÉTAPE 2 : les tags dynamiques de la zone ---------- */}
                {phase === "step2" && scanData && (
                  <div>
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      {estPositif
                        ? "Qu'est-ce qui a fait la différence\u00a0?"
                        : "Qu'est-ce qui n'a pas été à la hauteur\u00a0?"}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sélectionnez tout ce qui s&apos;applique (optionnel)
                    </p>

                    <div
                      role="group"
                      aria-label={estPositif ? "Points positifs" : "Points à améliorer"}
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
                        Personnel concerné&nbsp;?{" "}
                        <span className="font-normal text-muted-foreground">(optionnel)</span>
                      </label>
                      <Input
                        id="personnel"
                        value={personnel}
                        onChange={(e) => setPersonnel(e.target.value)}
                        placeholder="Ex : Julie, la serveuse du midi..."
                        maxLength={120}
                        autoComplete="off"
                        className="h-12 text-base"
                      />
                    </div>

                    <Button
                      onClick={() => allerEtape("step3", 1)}
                      className="mt-6 h-14 w-full text-lg font-semibold"
                    >
                      Continuer
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={retourVersNote}
                      className="mt-1 min-h-11 w-full text-sm text-muted-foreground"
                    >
                      <ArrowLeft aria-hidden className="size-4" /> Retour
                    </Button>
                  </div>
                )}

                {/* ---------- ÉTAPE 3 : commentaire + envoi ---------- */}
                {phase === "step3" && scanData && (
                  <div>
                    <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                      Un commentaire pour le gérant&nbsp;?{" "}
                      <span className="text-sm font-normal text-muted-foreground">(optionnel)</span>
                    </h1>

                    {/* Rappel discret de la sélection (tags + personnel) */}
                    {(tags.length > 0 || personnel.trim()) && (
                      <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
                        Votre sélection :{" "}
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
                      aria-label="Votre commentaire pour le gérant (optionnel)"
                      placeholder={
                        estPositif
                          ? "Ce qui vous a marqué, ce qui a été bien…"
                          : "Décrivez ce qui s'est passé — seul le gérant le lira."
                      }
                      className="mt-4 min-h-28 text-base"
                    />

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
                            Réessayer
                          </Button>
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
                              <Loader2 className="size-5 animate-spin" aria-hidden /> Envoi en
                              cours…
                            </>
                          ) : (
                            <>
                              <MessageCircle className="size-5" aria-hidden /> Envoyer via WhatsApp
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
                            <Loader2 className="size-5 animate-spin" aria-hidden /> Envoi en cours…
                          </>
                        ) : aWhatsApp ? (
                          "Terminer sans WhatsApp"
                        ) : (
                          "Terminer"
                        )}
                      </Button>
                    </div>

                    {/* Rassurance selon la note */}
                    <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                      {estPositif
                        ? "Votre compliment est transmis au gérant avec votre note et vos mots 🎉"
                        : "🔒 Votre retour reste privé : il est transmis uniquement au gérant."}
                    </p>

                    <Button
                      variant="ghost"
                      onClick={() => allerEtape("step2", -1)}
                      className="mt-2 min-h-11 w-full text-sm text-muted-foreground"
                    >
                      <ArrowLeft aria-hidden className="size-4" /> Retour
                    </Button>
                  </div>
                )}

                {/* ---------- SUCCÈS : merci + récompense éventuelle ---------- */}
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
                      Merci pour votre retour&nbsp;! 🙏
                    </h1>

                    {recompenseFinale ? (
                      /* Carte récompense mise en valeur (data.recompense ou pro.recompense) */
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.3, type: "spring", stiffness: 220, damping: 18 }}
                        className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-md shadow-amber-500/10"
                      >
                        <p className="text-balance text-lg font-bold leading-snug text-amber-900">
                          🎁 Votre récompense : {recompenseFinale}
                        </p>
                        <p className="mt-1.5 text-sm text-amber-800/90">
                          Montrez cet écran au personnel pour en profiter
                        </p>
                      </motion.div>
                    ) : estPositif ? (
                      <p className="text-balance text-base text-stone-600">
                        Votre avis fait toute la différence pour toute l&apos;équipe de{" "}
                        {scanData.pro.nomEtablissement}. Merci du fond du cœur&nbsp;! 💚
                      </p>
                    ) : (
                      /* Carte rassurante pour les retours 1-3★ */
                      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left">
                        <ShieldCheck className="mt-0.5 size-8 shrink-0 text-primary" aria-hidden />
                        <p className="text-sm leading-relaxed text-stone-600">
                          Votre retour a été transmis en privé au gérant, il a été alerté
                          directement.
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={onExit}
                      className="mt-1 h-14 w-full text-base font-semibold"
                    >
                      Terminer
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-stone-400">
          Propulsé par <span className="font-semibold text-stone-500">FeedbackPro</span>
        </p>
      </div>
    </div>
  )
}
