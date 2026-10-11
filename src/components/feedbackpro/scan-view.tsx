"use client"

// ============================================================
// FeedbackPro - ScanView
// Page publique mobile qu'un client voit après avoir scanné le
// QR code d'un commerce. Sans authentification, 3 étapes :
//   step1 : la note (étoiles) → step2 : tags dynamiques → step3 : commentaire + envoi
// Machine à états : loading → error | step1 → step2 → step3 → success
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
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
import { POSITIVE_TAGS, NEGATIVE_TAGS, ALL_TAGS, tagLabel } from "@/lib/constants"
import { buildWaLink } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

// ---------- Types locaux ----------

type EmployeScan = { id: string; nom: string; poste?: string | null }

type ScanData = {
  nomCommerce: string
  categorie?: string | null
  ville?: string | null
  logoUrl?: string | null
  googleUrl?: string | null
  whatsapp?: string | null
  messageWhatsapp?: string | null
  employes: EmployeScan[]
}

type Phase = "loading" | "error" | "step1" | "step2" | "step3" | "success"
type CanalEnvoi = "whatsapp" | "aucun"

// Transition fade + slide entre les étapes
const variantesEtape = {
  entree: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0 },
  sortie: { opacity: 0, x: -32 },
}

// En-tête commun : logo circulaire + nom du commerce + catégorie · ville
function EnteteCommerce({ pro, avecMarge }: { pro: ScanData; avecMarge: boolean }) {
  // Fallback local si le logo distant ne charge pas
  const [logoErreur, setLogoErreur] = useState(false)
  const initiale = pro.nomCommerce.charAt(0).toUpperCase()

  return (
    <div className={cn("mb-6 flex items-center gap-3", avecMarge && "pr-12")}>
      {pro.logoUrl && !logoErreur ? (
        <img
          src={pro.logoUrl}
          alt={`Logo ${pro.nomCommerce}`}
          className="size-14 shrink-0 rounded-full border border-stone-200 object-cover"
          onError={() => setLogoErreur(true)}
        />
      ) : (
        <div
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xl font-bold text-primary"
        >
          {initiale}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-bold leading-tight text-stone-900">{pro.nomCommerce}</p>
        {(pro.categorie || pro.ville) && (
          <p className="truncate text-sm text-muted-foreground">
            {[pro.categorie, pro.ville].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------- Composant principal ----------

export function ScanView({ token, onExit }: { token: string; onExit?: () => void }) {
  const { toast } = useToast()

  // Machine à états
  const [phase, setPhase] = useState<Phase>("loading")
  const [pro, setPro] = useState<ScanData | null>(null)

  // Réponses du client
  const [note, setNote] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [employeId, setEmployeId] = useState("") // "" = non précisé, "autre" = autre / je ne sais pas
  const [personnelLibre, setPersonnelLibre] = useState("") // input texte si aucun employé enregistré
  const [commentaire, setCommentaire] = useState("")

  // Animation d'étoile + envoi
  const [pulse, setPulse] = useState<number | null>(null)
  const [soumission, setSoumission] = useState<CanalEnvoi | null>(null)
  const [dernierCanal, setDernierCanal] = useState<CanalEnvoi>("whatsapp")
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Nettoyage du timer de transition étoile → étape 2
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const estPositif = note >= 4

  // ---------- Chargement des infos du commerce ----------
  const chargerScan = useCallback(async () => {
    setPhase("loading")
    setErreurEnvoi(null)
    try {
      const res = await fetch(`/api/public/scan?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || "QR code invalide ou expiré")
      setPro(json.data as ScanData)
      setPhase("step1")
    } catch {
      setPro(null)
      setPhase("error")
    }
  }, [token])

  useEffect(() => {
    chargerScan()
  }, [chargerScan])

  // ---------- Étape 1 : la note ----------
  function choisirNote(n: number) {
    setNote(n)
    // Réinitialise les choix dépendants de la note (tags positifs ↔ négatifs)
    setTags([])
    setEmployeId("")
    setPersonnelLibre("")
    setPulse(n)
    if (timerRef.current) clearTimeout(timerRef.current)
    // Petite animation pulse puis passage auto à l'étape 2
    timerRef.current = setTimeout(() => setPhase("step2"), 350)
  }

  // Navigation clavier dans le radiogroup des étoiles
  function etoileClavier(e: React.KeyboardEvent, valeurCourante: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault()
      const n = Math.min(5, valeurCourante + 1)
      if (n >= 1) choisirNote(n)
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault()
      choisirNote(Math.max(1, (valeurCourante || 2) - 1))
    }
  }

  // ---------- Étape 2 : les tags ----------
  const tagsDisponibles = estPositif ? POSITIVE_TAGS : NEGATIVE_TAGS

  function basculerTag(id: string) {
    setTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  // ---------- Soumission ----------
  async function envoyer(canal: CanalEnvoi) {
    if (!pro || soumission) return
    setDernierCanal(canal)
    setSoumission(canal)
    setErreurEnvoi(null)
    try {
      // Sécurité : on ne transmet que des ids de tags connus
      const tagsValides = tags.filter((id) => ALL_TAGS.some((t) => t.id === id))
      const res = await fetch("/api/retour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          note,
          tags: tagsValides,
          commentaire: commentaire.trim() || null,
          // Selon la configuration du commerce : employeId OU personnel libre
          employeId: pro.employes.length > 0 && employeId && employeId !== "autre" ? employeId : null,
          personnelMentionne: pro.employes.length === 0 ? personnelLibre.trim() || null : null,
          canalChoisi: canal,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erreur lors de l'envoi du retour")

      // Ouvre WhatsApp avec le message pré-rempli ; si popup bloqué → navigation directe
      if (canal === "whatsapp" && pro.whatsapp) {
        const employeNom = pro.employes.find((e) => e.id === employeId)?.nom ?? null
        const lien = buildWaLink(
          {
            nomCommerce: pro.nomCommerce,
            whatsapp: pro.whatsapp,
            messageWhatsapp: pro.messageWhatsapp,
          },
          {
            note,
            tags: tagsValides,
            commentaire: commentaire.trim() || null,
            personnelMentionne: pro.employes.length === 0 ? personnelLibre.trim() || null : null,
          },
          employeNom
        )
        const fenetre = window.open(lien, "_blank")
        if (!fenetre) window.location.href = lien
      }

      setPhase("success")
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur lors de l'envoi du retour"
      setErreurEnvoi(message)
      toast({ title: "Envoi impossible", description: message, variant: "destructive" })
    } finally {
      setSoumission(null)
    }
  }

  // ---------- Écrans plein écran : chargement ----------
  if (phase === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-50 p-6">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Chargement du formulaire de retour…</p>
      </div>
    )
  }

  // Indice d'étape pour la barre de progression (3 segments)
  const etapeIdx = phase === "step1" ? 0 : phase === "step2" ? 1 : 2

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 p-3 sm:p-6">
      <div className="w-full max-w-md">
          <div
            className={cn(
              "relative overflow-hidden rounded-3xl border border-stone-200 shadow-lg transition-colors duration-300",
              // Fond teinté selon le contexte (spec) : vert clair si positif, rouge/orange clair si négatif
              phase === "step2" ? (estPositif ? "bg-green-50" : "bg-orange-50") : "bg-white"
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

            {/* Bouton discret Quitter (étapes 1 à 3) */}
            {onExit && (phase === "step1" || phase === "step2" || phase === "step3") && (
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
              {/* En-tête du commerce sur toutes les étapes du formulaire */}
              {pro && phase !== "error" && <EnteteCommerce pro={pro} avecMarge={phase !== "success"} />}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={phase}
                  variants={variantesEtape}
                  initial="entree"
                  animate="visible"
                  exit="sortie"
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  {/* ---------- ERREUR : token invalide ---------- */}
                  {phase === "error" && (
                    <div className="flex flex-col items-center gap-4 py-8 text-center">
                      <div className="flex size-16 items-center justify-center rounded-full bg-rose-50">
                        <AlertCircle className="size-9 text-rose-500" aria-hidden />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold text-stone-900">QR code invalide ou expiré</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ce lien de scan n&apos;est plus actif. Vérifiez le QR code affiché chez le
                          commerçant.
                        </p>
                      </div>
                      <Button
                        onClick={chargerScan}
                        className="h-12 min-w-40 text-base font-semibold"
                        aria-label="Réessayer le chargement"
                      >
                        Réessayer
                      </Button>
                      {onExit && (
                        <Button
                          variant="ghost"
                          onClick={onExit}
                          className="min-h-11 text-sm text-muted-foreground"
                        >
                          Retour à l&apos;accueil
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ---------- ÉTAPE 1 : la note ---------- */}
                  {phase === "step1" && pro && (
                    <div className="flex flex-col items-center text-center">
                      <h1 className="text-balance text-2xl font-bold leading-snug text-stone-900">
                        Comment s&apos;est passée votre visite chez{" "}
                        <span className="text-primary">{pro.nomCommerce}</span> ?
                      </h1>

                      <div
                        role="radiogroup"
                        aria-label="Votre note de 1 à 5 étoiles"
                        className="my-7 flex w-full justify-center gap-0.5 sm:gap-2"
                      >
                        {[1, 2, 3, 4, 5].map((i) => (
                          <motion.button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={note === i}
                            aria-label={`Noter ${i} sur 5`}
                            onClick={() => choisirNote(i)}
                            onKeyDown={(e) => etoileClavier(e, note)}
                            whileHover={{ scale: 1.12 }}
                            whileTap={{ scale: 0.88 }}
                            animate={pulse === i ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                            transition={{ duration: 0.35, ease: "easeInOut" }}
                            className="flex size-[clamp(2.9rem,15.5vw,3.75rem)] shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <Star
                              aria-hidden
                              strokeWidth={1.5}
                              className={cn(
                                "h-[80%] w-[80%] transition-colors duration-150",
                                i <= note ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-300"
                              )}
                            />
                          </motion.button>
                        ))}
                      </div>

                      <p className="text-sm text-muted-foreground">30 secondes suffisent, merci !</p>
                    </div>
                  )}

                  {/* ---------- ÉTAPE 2 : les tags dynamiques ---------- */}
                  {phase === "step2" && pro && (
                    <div>
                      <h1 className="text-balance text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
                        {estPositif
                          ? "\ud83c\udf89 Super ! Qu'avez-vous particulièrement apprécié ?"
                          : "\ud83d\ude14 Nous sommes désolés. Qu'est-ce qui n'a pas été ?"}
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sélectionnez tout ce qui s&apos;applique (optionnel)
                      </p>

                      <div
                        role="group"
                        aria-label={estPositif ? "Points positifs" : "Points à améliorer"}
                        className="mt-5 grid grid-cols-2 gap-3"
                      >
                        {tagsDisponibles.map((t) => {
                          const actif = tags.includes(t.id)
                          return (
                            <button
                              key={t.id}
                              type="button"
                              aria-pressed={actif}
                              onClick={() => basculerTag(t.id)}
                              className={cn(
                                "flex min-h-12 min-w-0 items-center gap-2 rounded-2xl border-2 px-3 py-3 text-left text-sm font-medium transition-all active:scale-95 sm:text-base",
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                actif
                                  ? estPositif
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-rose-500 bg-rose-50 text-rose-700"
                                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                              )}
                            >
                              <span aria-hidden className="text-lg leading-none">
                                {t.emoji}
                              </span>
                              <span className="min-w-0 leading-tight break-words">{t.label}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Champ optionnel : personnel concerné */}
                      <div className="mt-5">
                        <label
                          htmlFor="personnel"
                          className="mb-1.5 block text-sm font-medium text-stone-700"
                        >
                          Personnel concerné{" "}
                          <span className="font-normal text-muted-foreground">(optionnel)</span>
                        </label>
                        {pro.employes.length > 0 ? (
                          <Select value={employeId} onValueChange={setEmployeId}>
                            <SelectTrigger
                              id="personnel"
                              className="h-12 w-full text-base"
                              aria-label="Sélectionner le personnel concerné"
                            >
                              <SelectValue placeholder="Personnel concerné (optionnel)" />
                            </SelectTrigger>
                            <SelectContent>
                              {pro.employes.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.nom}
                                  {e.poste ? ` — ${e.poste}` : ""}
                                </SelectItem>
                              ))}
                              <SelectItem value="autre">Autre / je ne sais pas</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id="personnel"
                            value={personnelLibre}
                            onChange={(e) => setPersonnelLibre(e.target.value)}
                            placeholder="Ex : la serveuse du midi"
                            maxLength={120}
                            className="h-12 text-base"
                          />
                        )}
                      </div>

                      <Button
                        onClick={() => setPhase("step3")}
                        className="mt-6 h-14 w-full text-lg font-semibold"
                      >
                        Continuer
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPulse(null)
                          setPhase("step1")
                        }}
                        className="mt-1 min-h-11 w-full text-sm text-muted-foreground"
                      >
                        <ArrowLeft aria-hidden className="size-4" /> Modifier la note
                      </Button>
                    </div>
                  )}

                  {/* ---------- ÉTAPE 3 : commentaire + envoi ---------- */}
                  {phase === "step3" && pro && (
                    <div>
                      <h1 className="text-2xl font-bold text-stone-900">Dernière étape 💬</h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Un mot à nous dire ? (optionnel)
                      </p>

                      {/* Rappel de la sélection de tags */}
                      {tags.length > 0 && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Votre sélection : {tags.map(tagLabel).join(" · ")}
                        </p>
                      )}

                      <Textarea
                        value={commentaire}
                        onChange={(e) => setCommentaire(e.target.value)}
                        rows={5}
                        maxLength={2000}
                        aria-label="Votre commentaire (optionnel)"
                        placeholder={
                          estPositif
                            ? "Ce qui vous a marqué..."
                            : "Décrivez ce qui s'est passé, la direction sera alertée immédiatement"
                        }
                        className="mt-4 min-h-28 text-base"
                      />

                      {/* Erreur d'envoi : message inline + réessayer */}
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

                      <div className="mt-4 flex flex-col gap-2.5">
                        {/* Canal WhatsApp : gros bouton vert géant (spec), seulement si le numéro est configuré */}
                        {pro.whatsapp && (
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
                                <MessageCircle className="size-5" aria-hidden /> Envoyer via
                                WhatsApp
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => envoyer("aucun")}
                          disabled={soumission !== null}
                          className="h-14 w-full text-lg font-semibold"
                        >
                          {soumission === "aucun" ? (
                            <>
                              <Loader2 className="size-5 animate-spin" aria-hidden /> Envoi en
                              cours…
                            </>
                          ) : (
                            "Envoyer sans WhatsApp"
                          )}
                        </Button>

                        {/* 4-5★ uniquement : partage Google en lien secondaire (optionnel, conforme aux règles Google) */}
                        {note >= 4 && pro.googleUrl && (
                          <button
                            type="button"
                            onClick={() => window.open(pro.googleUrl!, "_blank", "noopener,noreferrer")}
                            className="mx-auto min-h-11 rounded-md px-3 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            ⭐ Partager sur Google
                          </button>
                        )}
                      </div>

                      {/* Mentions discrètes selon la note */}
                      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                        {note <= 2
                          ? "🔒 Votre retour est transmis en interne à la direction uniquement."
                          : note >= 4
                            ? `Partager sur Google est 100 % optionnel, et ça aide beaucoup ${pro.nomCommerce} 🙏`
                            : "Votre retour est transmis au commerce pour l'aider à progresser."}
                      </p>

                      <Button
                        variant="ghost"
                        onClick={() => setPhase("step2")}
                        className="mt-2 min-h-11 w-full text-sm text-muted-foreground"
                      >
                        <ArrowLeft aria-hidden className="size-4" /> Retour
                      </Button>
                    </div>
                  )}

                  {/* ---------- SUCCESS ---------- */}
                  {phase === "success" && pro && (
                    <div className="flex flex-col items-center gap-4 py-2 text-center">
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

                      <h1 className="text-2xl font-bold text-stone-900">
                        Merci pour votre retour&nbsp;! 🙏
                      </h1>

                      {note >= 4 ? (
                        pro.googleUrl ? (
                          <>
                            <Button
                              onClick={() => window.open(pro.googleUrl!, "_blank", "noopener,noreferrer")}
                              className="h-14 w-full text-lg font-semibold"
                            >
                              ⭐ Partager mon avis sur Google
                            </Button>
                            <p className="text-sm text-muted-foreground">
                              Cela aide énormément {pro.nomCommerce}, merci&nbsp;!
                            </p>
                          </>
                        ) : (
                          <p className="text-balance text-base text-stone-600">
                            Votre avis fait toute la différence pour toute l&apos;équipe de{" "}
                            {pro.nomCommerce}. Merci du fond du cœur&nbsp;! 💚
                          </p>
                        )
                      ) : note === 3 ? (
                        <p className="text-balance text-base text-stone-600">
                          Votre avis a bien été transmis à {pro.nomCommerce}. Merci de nous aider à
                          progresser&nbsp;!
                        </p>
                      ) : (
                        /* Carte rassurante pour les retours négatifs */
                        <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left">
                          <ShieldCheck className="mt-0.5 size-8 shrink-0 text-primary" aria-hidden />
                          <p className="text-sm leading-relaxed text-stone-600">
                            Votre retour a été transmis en interne à la direction. Elle a été
                            alertée et pourra revenir vers vous.
                          </p>
                        </div>
                      )}

                      {onExit && (
                        <Button
                          variant="outline"
                          onClick={onExit}
                          className="mt-1 h-12 w-full text-base font-semibold"
                        >
                          Fermer
                        </Button>
                      )}
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
