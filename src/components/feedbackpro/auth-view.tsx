"use client"

// ============================================================
// FeedbackPro — Vue Authentification
// Mode Connexion : carte centrée (email + mot de passe)
// Mode Inscription : wizard 4 étapes (Compte · Établissement ·
// Vos zones · Finalisation) avec validation zod PAR ÉTAPE via
// react-hook-form.
// Le store est la source de vérité : authMode / setView /
// refreshSession. Après un succès : refreshSession() puis
// setView(role === "SUPERADMIN" ? "admin" : "dashboard").
// ============================================================

import { useState, type ChangeEvent } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircleMore,
  Plus,
  ScanLine,
  Smartphone,
  Store,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { TYPES_ETABLISSEMENT, tagLabel } from "@/lib/constants"
import { SECTEUR_CONFIG, configSecteur } from "@/lib/secteurs"
import { fileToLogoDataUrl } from "@/lib/image"

// ============================================================
// Schémas de validation locaux (messages 100 % français)
// Définis ici volontairement : l'inscription envoie le payload
// pivot { nomEtablissement, typeEtablissement, ... } (Session 1).
// ============================================================

/** Email : requis + format valide */
const emailChamp = z
  .string()
  .trim()
  .min(1, "L'adresse email est requise")
  .pipe(z.email("Adresse email invalide"))

/** Mot de passe : 6 caractères minimum */
const motDePasseChamp = z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères")

/** Connexion */
const connexionSchema = z.object({
  email: emailChamp,
  password: z.string().min(1, "Le mot de passe est requis"),
})

/** Inscription (formulaire complet du wizard) */
const inscriptionSchema = z
  .object({
    // Étape 1 — Compte
    email: emailChamp,
    password: motDePasseChamp,
    confirmation: z.string().min(1, "Confirmez votre mot de passe"),

    // Étape 2 — Établissement
    nomEtablissement: z
      .string()
      .trim()
      .min(2, "Indiquez le nom de votre établissement")
      .max(80, "Le nom ne peut pas dépasser 80 caractères"),
    typeEtablissement: z
      .string()
      .min(1, "Sélectionnez le type d'établissement")
      .refine((t) => TYPES_ETABLISSEMENT.includes(t), "Type d'établissement invalide"),
    adresse: z.string().trim().min(2, "L'adresse est requise").max(200, "Adresse trop longue"),
    ville: z.string().trim().min(2, "La ville est requise").max(80, "Ville trop longue"),
    whatsapp: z
      .string()
      .trim()
      .transform((v) => v.replace(/[^0-9]/g, ""))
      .refine((v) => /^\d{8,15}$/.test(v), "Numéro invalide : 8 à 15 chiffres, au format international sans « + »"),

    // Étape 3 — Vos zones (chaque zone reçoit son QR code)
    zones: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Le nom d'une zone ne peut pas être vide")
          .max(60, "Nom de zone trop long (60 caractères maximum)")
      )
      .min(1, "Créez au moins une zone pour recevoir vos QR codes")
      .max(10, "10 zones maximum à l'inscription"),

    // Étape 4 — Finalisation
    logoUrl: z.string(),
    accepteCgu: z.boolean().refine((v) => v === true, {
      message: "Vous devez accepter les CGU pour créer votre compte",
    }),
  })
  .refine((d) => d.confirmation === d.password, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmation"],
  })

type ValeursConnexion = z.infer<typeof connexionSchema>
type ValeursInscription = z.infer<typeof inscriptionSchema>

// Wizard : libellés + champs validés à chaque étape
const ETAPES = [
  { numero: 1, titre: "Compte" },
  { numero: 2, titre: "Établissement" },
  { numero: 3, titre: "Vos zones" },
  { numero: 4, titre: "Finalisation" },
] as const

const CHAMPS_PAR_ETAPE: (keyof ValeursInscription)[][] = [
  ["email", "password", "confirmation"],
  ["nomEtablissement", "typeEtablissement", "adresse", "ville", "whatsapp"],
  ["zones"],
  ["logoUrl", "accepteCgu"],
]

/** Suggestions de zones proposées à l'étape 3 (filtrées selon ce qui est déjà saisi) */
const SUGGESTIONS_ZONES = ["Salle", "Terrasse", "Bar", "Cuisine", "Toilettes", "Salon", "Boutique"]

// ============================================================
// Vue racine : bascule Connexion / Inscription via le store
// ============================================================

export function AuthView() {
  const authMode = useAppStore((s) => s.authMode)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setView = useAppStore((s) => s.setView)

  const modeInscription = authMode === "signup"

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 bg-muted/30 lg:grid-cols-2">
      {/* ---------- Colonne gauche : visuel marketing (desktop uniquement) ---------- */}
      <PanneauMarketing modeInscription={modeInscription} />

      {/* ---------- Colonne droite : formulaire ---------- */}
      <div className="flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          {/* Logo + titre */}
          <div className="mb-6 flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => setView("landing")}
              aria-label="FeedbackPro — retour à l'accueil"
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 outline-none transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:hidden"
            >
              <ScanLine className="h-6 w-6" aria-hidden />
            </button>
            <h1 className="text-2xl font-bold tracking-tight">
              {modeInscription ? "Créez votre compte" : "Bon retour !"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {modeInscription
                ? "Votre Coach IA d'audit qualité en 4 étapes"
                : "Heureux de vous revoir. Votre rapport du jour vous attend."}
            </p>
          </div>

          <Card className="border-border/70 shadow-lg shadow-black/5">
            <CardContent className="p-5 sm:p-7">
              {/* key : réinitialise l'état quand on change de mode */}
              {modeInscription ? <InscriptionWizard key="signup" /> : <ConnexionForm key="login" />}
            </CardContent>
          </Card>

          {/* Liens de bascule + retour accueil */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {modeInscription ? (
              <>
                Vous avez déjà un compte ?{" "}
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="font-semibold text-primary hover:underline"
                >
                  Se connecter
                </button>
              </>
            ) : (
              <>
                Pas encore de compte ?{" "}
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
                  className="font-semibold text-primary hover:underline"
                >
                  Créez-le gratuitement
                </button>
              </>
            )}
          </p>
          <p className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setView("landing")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Retour à l'accueil
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Panneau marketing (colonne gauche, desktop uniquement)
// Dégradé bleu + mockup dashboard + témoignage client.
// Masqué en mobile (lg:flex) pour laisser toute la place au formulaire.
// ============================================================

function PanneauMarketing({ modeInscription }: { modeInscription: boolean }) {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12"
    >
      {/* Décoration : cercles translucides en arrière-plan */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-white/5" />

      {/* ---------- En-tête : logo + baseline ---------- */}
      <div className="relative flex items-center gap-3 text-white">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <ScanLine className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-bold leading-tight">FeedbackPro</p>
          <p className="text-xs text-white/80">Le Coach IA d'audit qualité continu</p>
        </div>
      </div>

      {/* ---------- Bloc central : promesse + mockup dashboard ---------- */}
      <div className="relative space-y-6 text-white">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
            {modeInscription
              ? "Transformez chaque client en auditeur qualité."
              : "Votre rapport du jour vous attend."}
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-white/85">
            Scannez un QR code, laissez une note, et notre IA vous livre chaque matin un rapport
            d'audit avec 3 priorités concrètes pour améliorer votre service.
          </p>
        </div>

        {/* Mockup dashboard (aperçu visuel simplifié) */}
        <div className="relative rounded-2xl bg-white/95 p-4 text-stone-900 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
            <div>
              <p className="text-xs font-medium text-stone-500">Rapport du jour</p>
              <p className="text-sm font-bold">Le Petit Bistrot</p>
            </div>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
              +12 % vs hier
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="text-[9px] font-medium text-blue-700">Note moyenne</p>
              <p className="text-lg font-bold text-blue-900">4,6</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2">
              <p className="text-[9px] font-medium text-emerald-700">Retours</p>
              <p className="text-lg font-bold text-emerald-900">38</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <p className="text-[9px] font-medium text-amber-700">Alertes</p>
              <p className="text-lg font-bold text-amber-900">2</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
              3 priorités du jour
            </p>
            <div className="flex items-center gap-2 rounded-md bg-stone-50 p-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                1
              </span>
              <p className="text-[11px] leading-tight text-stone-700">
                Réduire le temps d'attente en salle à 12 h
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-stone-50 p-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                2
              </span>
              <p className="text-[11px] leading-tight text-stone-700">
                Reformuler la carte des desserts
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-stone-50 p-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                3
              </span>
              <p className="text-[11px] leading-tight text-stone-700">
                Féliciter l'équipe pour l'accueil à l'entrée
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Témoignage client ---------- */}
      <figure className="relative rounded-2xl bg-white/10 p-5 text-white backdrop-blur">
        <blockquote className="text-sm leading-relaxed text-white/95">
          « En 3 semaines, notre note moyenne est passée de 4,1 à 4,7. Le rapport quotidien
          devient un réflexe pour toute l'équipe. »
        </blockquote>
        <figcaption className="mt-3 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
            M
          </span>
          <div>
            <p className="text-xs font-semibold">Maria L.</p>
            <p className="text-[11px] text-white/75">Gérante · Pizzeria Da Mario, Lyon</p>
          </div>
        </figcaption>
      </figure>
    </aside>
  )
}

// ============================================================
// Bloc de message d'erreur API (identifiants / suspension / générique)
// ============================================================

function ErreurApi({ message }: { message: string }) {
  return (
    <p
      className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm leading-snug text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

/** Message d'erreur ligne sous un champ */
function ErreurChamp({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
      {message}
    </p>
  )
}

// ============================================================
// FORMULAIRE DE CONNEXION
// ============================================================

function ConnexionForm() {
  const refreshSession = useAppStore((s) => s.refreshSession)
  const setView = useAppStore((s) => s.setView)
  const [erreurApi, setErreurApi] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ValeursConnexion>({
    resolver: zodResolver(connexionSchema),
    defaultValues: { email: "", password: "" },
  })

  async function aLaSoumission(_valeurs: ValeursConnexion) {
    setErreurApi(null)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: _valeurs.email,
          password: _valeurs.password,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        const brut = typeof json?.error === "string" ? json.error : ""
        if (brut.toLowerCase().includes("suspendu")) {
          // Compte suspendu par le superadmin : message clair et dédié
          setErreurApi("Votre compte a été suspendu. Contactez le support.")
        } else {
          setErreurApi(brut || "Email ou mot de passe incorrect.")
        }
        return
      }
      // Succès : recharge la session puis redirige selon le rôle
      await refreshSession()
      const role = useAppStore.getState().session?.user.role
      setView(role === "SUPERADMIN" ? "admin" : "dashboard")
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  return (
    <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email-connexion">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="email-connexion"
            type="email"
            inputMode="email"
            placeholder="vous@etablissement.fr"
            className="h-11 pl-9"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </div>
        <ErreurChamp message={errors.email?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password-connexion">Mot de passe</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="password-connexion"
            type="password"
            placeholder="Votre mot de passe"
            className="h-11 pl-9"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </div>
        <ErreurChamp message={errors.password?.message} />
      </div>

      {erreurApi && <ErreurApi message={erreurApi} />}

      <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Connexion en cours…
          </>
        ) : (
          "Se connecter"
        )}
      </Button>

      {/* Lien « Mot de passe oublié ? » — redirige vers l'email de support
          (aucune route dédiée pour le moment, l'app reste déployable telle quelle). */}
      <p className="text-center">
        <a
          href="mailto:support@feedbackpro.fr?subject=Mot%20de%20passe%20oubli%C3%A9"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          Mot de passe oublié ?
        </a>
      </p>
    </form>
  )
}

// ============================================================
// WIZARD D'INSCRIPTION (3 étapes)
// ============================================================

function InscriptionWizard() {
  const [etape, setEtape] = useState(1)
  const [erreurApi, setErreurApi] = useState<string | null>(null)
  const [erreurLogo, setErreurLogo] = useState<string | null>(null)
  const [logoEnCours, setLogoEnCours] = useState(false)
  // Champ de saisie d'une nouvelle zone (étape 3) — le tableau validé
  // lui-même vit dans react-hook-form (champ "zones")
  const [nouvelleZone, setNouvelleZone] = useState("")
  // Task 2 : mémorise le dernier secteur dont on a appliqué les zones par
  // défaut, pour ne PAS écraser les zones personnalisées par l'utilisateur
  // s'il change de secteur après avoir personnalisé.
  const [secteurApplique, setSecteurApplique] = useState<string | null>(null)

  const refreshSession = useAppStore((s) => s.refreshSession)
  const setView = useAppStore((s) => s.setView)
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    control,
    watch,
    trigger,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ValeursInscription, unknown, ValeursInscription>({
    resolver: zodResolver(inscriptionSchema),
    mode: "onTouched",
    defaultValues: {
      email: "",
      password: "",
      confirmation: "",
      nomEtablissement: "",
      typeEtablissement: "",
      adresse: "",
      ville: "",
      whatsapp: "",
      zones: ["Accueil"],
      logoUrl: "",
      accepteCgu: false,
    },
  })

  const logoActuel = watch("logoUrl")
  const zonesActuelles = watch("zones") ?? []
  const typeChoisi = watch("typeEtablissement")

  /**
   * Task 2 — Applique les zones par défaut du secteur choisi.
   * Stratégie anti-écrasement : on n'écrase les zones courantes QUE si elles
   * sont encore égales aux défauts du précédent secteur appliqué (ou à la
   * valeur initiale ["Accueil"]). Si l'utilisateur a personnalisé ses zones,
   * on conserve son choix. Les tags par défaut sont quant à eux gérés côté
   * serveur (API /auth/register) — on ne stocke pas les tags dans le wizard.
   */
  function appliquerSecteur(nouveauSecteur: string) {
    const config = configSecteur(nouveauSecteur)
    const precedent = secteurApplique ? configSecteur(secteurApplique) : null
    const defautPrecedent = precedent?.zonesParDefaut ?? ["Accueil"]
    const zonesEncoreDefaut =
      zonesActuelles.length === 0 ||
      (zonesActuelles.length === defautPrecedent.length &&
        zonesActuelles.every((z, i) => z === defautPrecedent[i]))
    if (zonesEncoreDefaut && config.zonesParDefaut.length > 0) {
      setValue("zones", [...config.zonesParDefaut], { shouldValidate: true })
    }
    setSecteurApplique(nouveauSecteur)
  }

  /** Ajoute une zone (déduplication insensible à la casse, 10 maximum) */
  function ajouterZone() {
    const nom = nouvelleZone.trim()
    if (!nom || nom.length > 60 || zonesActuelles.length >= 10) return
    if (zonesActuelles.some((z) => z.toLowerCase() === nom.toLowerCase())) return
    setValue("zones", [...zonesActuelles, nom], { shouldValidate: true })
    setNouvelleZone("")
  }

  /** Retire une zone par son nom (affiché exact) */
  function retirerZone(nom: string) {
    setValue("zones", zonesActuelles.filter((z) => z !== nom), { shouldValidate: true })
  }

  /** Valide les champs de l'étape courante avant de passer à la suivante */
  async function continuer() {
    const valide = await trigger(CHAMPS_PAR_ETAPE[etape - 1], { shouldFocus: true })
    if (valide) setEtape((e) => Math.min(4, e + 1))
  }

  function revenir() {
    setEtape((e) => Math.max(1, e - 1))
  }

  /** Logo : fichier → data URL compacte (compression canvas via lib/image) */
  async function onLogoChoisi(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0]
    if (!fichier) return
    setErreurLogo(null)
    setLogoEnCours(true)
    try {
      const dataUrl = await fileToLogoDataUrl(fichier)
      setValue("logoUrl", dataUrl, { shouldValidate: true })
    } catch (e) {
      setErreurLogo(e instanceof Error ? e.message : "Logo invalide. Réessayez avec une autre image.")
    } finally {
      setLogoEnCours(false)
      // Permet de re-choisir le même fichier après retrait
      event.target.value = ""
    }
  }

  function retirerLogo() {
    setValue("logoUrl", "", { shouldValidate: false })
    setErreurLogo(null)
  }

  async function aLaSoumission(valeurs: ValeursInscription) {
    setErreurApi(null)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: valeurs.email,
          password: valeurs.password,
          nomEtablissement: valeurs.nomEtablissement,
          typeEtablissement: valeurs.typeEtablissement,
          adresse: valeurs.adresse,
          ville: valeurs.ville,
          whatsapp: valeurs.whatsapp,
          logoUrl: valeurs.logoUrl,
          zones: valeurs.zones,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setErreurApi(json?.error || "Impossible de créer votre compte. Réessayez dans un instant.")
        return
      }
      // Succès : session fraîche + redirection dashboard + toast de bienvenue
      await refreshSession()
      toast({
        title: "Bienvenue sur FeedbackPro 🎉",
        description: `${valeurs.zones.length} zone${valeurs.zones.length > 1 ? "s" : ""} créée${valeurs.zones.length > 1 ? "s" : ""} — imprimez vos QR codes dans l'onglet QR`,
      })
      setView("dashboard")
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  const valeurs = watch()

  return (
    <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-5" noValidate>
      <IndicateurEtapes etape={etape} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={etape}
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -32 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-4"
        >
          {/* ============ ÉTAPE 1 — COMPTE ============ */}
          {etape === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email-inscription">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="email-inscription"
                    type="email"
                    inputMode="email"
                    placeholder="vous@etablissement.fr"
                    className="h-11 pl-9"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                  />
                </div>
                <ErreurChamp message={errors.email?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password-inscription">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="password-inscription"
                    type="password"
                    placeholder="6 caractères minimum"
                    className="h-11 pl-9"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                </div>
                <ErreurChamp message={errors.password?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmation-inscription">Confirmez le mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="confirmation-inscription"
                    type="password"
                    placeholder="Ressaisissez votre mot de passe"
                    className="h-11 pl-9"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirmation}
                    {...register("confirmation")}
                  />
                </div>
                <ErreurChamp message={errors.confirmation?.message} />
              </div>
            </>
          )}

          {/* ============ ÉTAPE 2 — ÉTABLISSEMENT ============ */}
          {etape === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="nomEtablissement">Nom de l'établissement</Label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="nomEtablissement"
                    placeholder="Ex : Le Petit Bistrot"
                    className="h-11 pl-9"
                    autoComplete="organization"
                    aria-invalid={!!errors.nomEtablissement}
                    {...register("nomEtablissement")}
                  />
                </div>
                <ErreurChamp message={errors.nomEtablissement?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="typeEtablissement">Type d&apos;établissement</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Sélectionnez votre secteur : nous pré-remplissons vos zones et tags par défaut.
                </p>
                <Controller
                  control={control}
                  name="typeEtablissement"
                  render={({ field }) => (
                    <div
                      role="radiogroup"
                      aria-label="Type d'établissement"
                      className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border/60 p-2 custom-scrollbar sm:grid-cols-3"
                    >
                      {TYPES_ETABLISSEMENT.map((type) => {
                        const config = SECTEUR_CONFIG[type] ?? SECTEUR_CONFIG.Autre
                        const selectionne = field.value === type
                        return (
                          <button
                            key={type}
                            type="button"
                            role="radio"
                            aria-checked={selectionne}
                            onClick={() => {
                              field.onChange(type)
                              appliquerSecteur(type)
                            }}
                            className={`flex min-h-[88px] flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                              selectionne
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
                            }`}
                          >
                            <span className="text-2xl leading-none" aria-hidden>
                              {config.emoji}
                            </span>
                            <span className="text-xs font-semibold leading-tight">{type}</span>
                            <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                              {config.description}
                            </span>
                            {selectionne && (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                                <Check className="h-3 w-3" aria-hidden />
                                Sélectionné
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                />
                {/* Aperçu des zones + tags par défaut du secteur choisi */}
                {typeChoisi && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <p className="text-[11px] font-semibold text-primary">
                      Zones suggérées : {(configSecteur(typeChoisi).zonesParDefaut).join(", ")}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      <span className="font-medium text-green-700">Tags + :</span>{" "}
                      {configSecteur(typeChoisi).tagsPositifs.map(tagLabel).join(" · ")}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      <span className="font-medium text-rose-700">Tags − :</span>{" "}
                      {configSecteur(typeChoisi).tagsNegatifs.map(tagLabel).join(" · ")}
                    </p>
                  </div>
                )}
                <ErreurChamp message={errors.typeEtablissement?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adresse">Adresse</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="adresse"
                    placeholder="Ex : 12 rue de la République"
                    className="h-11 pl-9"
                    autoComplete="street-address"
                    aria-invalid={!!errors.adresse}
                    {...register("adresse")}
                  />
                </div>
                <ErreurChamp message={errors.adresse?.message} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ville">Ville</Label>
                  <Input
                    id="ville"
                    placeholder="Ex : Lyon"
                    className="h-11"
                    autoComplete="address-level2"
                    aria-invalid={!!errors.ville}
                    {...register("ville")}
                  />
                  <ErreurChamp message={errors.ville?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="whatsapp"
                      type="tel"
                      inputMode="numeric"
                      placeholder="33612345678"
                      className="h-11 pl-9"
                      autoComplete="tel"
                      aria-invalid={!!errors.whatsapp}
                      aria-describedby="aide-whatsapp"
                      {...register("whatsapp")}
                    />
                  </div>
                  <ErreurChamp message={errors.whatsapp?.message} />
                </div>
              </div>
              <p id="aide-whatsapp" className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MessageCircleMore className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                Ex : 33612345678 — pour recevoir vos alertes WhatsApp
              </p>
            </>
          )}

          {/* ============ ÉTAPE 3 — VOS ZONES ============ */}
          {etape === 3 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="zone-input">Vos zones de contact</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Chaque zone (accueil, salle, terrasse…) reçoit son propre QR code à poser sur le terrain. Votre
                  premier rapport comparera les zones entre elles.
                </p>

                {/* Chips des zones déjà créées */}
                <div className="flex flex-wrap gap-2" aria-live="polite">
                  {zonesActuelles.map((nom) => (
                    <span
                      key={nom}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-primary"
                    >
                      {nom}
                      <button
                        type="button"
                        onClick={() => retirerZone(nom)}
                        aria-label={`Retirer la zone ${nom}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  ))}
                  {zonesActuelles.length === 0 && (
                    <span className="text-sm text-muted-foreground">Aucune zone — créez-en au moins une.</span>
                  )}
                </div>

                {/* Saisie + bouton Ajouter */}
                <div className="flex gap-2 pt-1">
                  <Input
                    id="zone-input"
                    value={nouvelleZone}
                    onChange={(e) => setNouvelleZone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        ajouterZone()
                      }
                    }}
                    placeholder="Ex : Salle"
                    maxLength={60}
                    autoComplete="off"
                    aria-label="Nom de la nouvelle zone"
                    className="h-11"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={ajouterZone}
                    disabled={!nouvelleZone.trim() || zonesActuelles.length >= 10}
                    className="h-11 shrink-0 px-4"
                    aria-label="Ajouter la zone"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Ajouter
                  </Button>
                </div>

                {/* Suggestions cliquables (masquées quand tout est ajouté ou limite atteinte) */}
                {zonesActuelles.length < 10 &&
                  SUGGESTIONS_ZONES.filter(
                    (s) => !zonesActuelles.some((z) => z.toLowerCase() === s.toLowerCase())
                  ).length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">Suggestions :</span>
                      {SUGGESTIONS_ZONES.filter(
                        (s) => !zonesActuelles.some((z) => z.toLowerCase() === s.toLowerCase())
                      ).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setNouvelleZone("")
                            setValue("zones", [...zonesActuelles, s], { shouldValidate: true })
                          }}
                          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          aria-label={`Ajouter la zone ${s}`}
                        >
                          <Plus className="h-3 w-3" aria-hidden />
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                <p className="text-xs text-muted-foreground">{zonesActuelles.length}/10 zones</p>
                <ErreurChamp message={errors.zones?.message as string | undefined} />
              </div>
            </>
          )}

          {/* ============ ÉTAPE 4 — FINALISATION ============ */}
          {etape === 4 && (
            <>
              {/* Logo (optionnel) */}
              <div className="space-y-1.5">
                <Label htmlFor="logo-input">Logo (optionnel)</Label>
                <div className="flex items-center gap-4">
                  {logoActuel ? (
                    <img
                      src={logoActuel}
                      alt="Aperçu du logo de votre établissement"
                      className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 text-muted-foreground" aria-hidden>
                      <Store className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0 space-y-1.5">
                    <label
                      htmlFor="logo-input"
                      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      {logoEnCours ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Traitement…
                        </>
                      ) : (
                        <>
                          <ImagePlus className="h-4 w-4" aria-hidden />
                          Choisir une image
                        </>
                      )}
                    </label>
                    <input
                      id="logo-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={onLogoChoisi}
                    />
                    <p className="text-xs text-muted-foreground">
                      Format carré conseillé (ex. 512×512) · PNG, JPEG ou WebP
                    </p>
                    {logoActuel && (
                      <button
                        type="button"
                        onClick={retirerLogo}
                        className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                      >
                        Retirer le logo
                      </button>
                    )}
                  </div>
                </div>
                <ErreurChamp message={erreurLogo ?? undefined} />
              </div>

              {/* Récapitulatif des informations */}
              <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
                <p className="text-sm font-semibold">Récapitulatif</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">Email</dt>
                    <dd className="min-w-0 truncate text-right font-medium">{valeurs.email || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">Établissement</dt>
                    <dd className="min-w-0 text-right font-medium">
                      {valeurs.nomEtablissement || "—"}
                      {valeurs.typeEtablissement && (
                        <span className="block text-xs text-muted-foreground">{valeurs.typeEtablissement}</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">Adresse</dt>
                    <dd className="min-w-0 text-right font-medium">
                      {valeurs.adresse || "—"}
                      {valeurs.ville && <span className="block text-xs text-muted-foreground">{valeurs.ville}</span>}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">WhatsApp</dt>
                    <dd className="min-w-0 text-right font-medium">
                      {valeurs.whatsapp.replace(/[^0-9]/g, "") || "—"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">Zones</dt>
                    <dd className="min-w-0 text-right">
                      {(valeurs.zones ?? []).length > 0 ? (
                        <span className="flex flex-wrap justify-end gap-1">
                          {(valeurs.zones ?? []).map((nom) => (
                            <span
                              key={nom}
                              className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                            >
                              {nom}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="font-medium">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-3 border-t border-border/60 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setEtape(1)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Modifier le compte
                  </button>
                  <button
                    type="button"
                    onClick={() => setEtape(2)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Modifier l'établissement
                  </button>
                </div>
              </div>

              {/* CGU obligatoires */}
              <div className="space-y-1.5">
                <Controller
                  control={control}
                  name="accepteCgu"
                  render={({ field }) => (
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="accepte-cgu"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        className="mt-0.5 h-5 w-5"
                        aria-invalid={!!errors.accepteCgu}
                      />
                      <Label htmlFor="accepte-cgu" className="text-sm font-normal leading-relaxed">
                        Je dispose de l'établissement et j'accepte les{" "}
                        <a href="/cgu" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
                          CGU
                        </a>
                      </Label>
                    </div>
                  )}
                />
                <ErreurChamp message={errors.accepteCgu?.message} />
              </div>

              {erreurApi && <ErreurApi message={erreurApi} />}

              <Button type="submit" className="h-12 w-full text-base" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Création en cours…
                  </>
                ) : (
                  "Créer mon compte"
                )}
              </Button>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation du wizard (étapes 1 à 3) + erreur API */}
      {etape < 4 && (
        <>
          {erreurApi && <ErreurApi message={erreurApi} />}
          <div className="flex gap-3">
            {etape > 1 && (
              <Button type="button" variant="ghost" onClick={revenir} className="h-11 px-4">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Retour
              </Button>
            )}
            <Button type="button" onClick={continuer} className="h-11 flex-1 text-base">
              Continuer
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

// ============================================================
// Indicateur de progression du wizard (Compte · Établissement ·
// Finalisation) : cercles numérotés + connecteurs
// ============================================================

function IndicateurEtapes({ etape }: { etape: number }) {
  return (
    <ol className="flex items-start" aria-label="Progression de l'inscription">
      {ETAPES.map((e, i) => {
        const finie = e.numero < etape
        const courante = e.numero === etape
        return (
          <li
            key={e.numero}
            className={i < ETAPES.length - 1 ? "flex flex-1 items-start" : "flex items-start"}
            aria-current={courante ? "step" : undefined}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className={
                  finie
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : courante
                      ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-card text-primary"
                      : "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
                }
              >
                {finie ? <Check className="h-4 w-4" aria-hidden /> : <span className="text-xs font-bold">{e.numero}</span>}
              </span>
              <span
                className={
                  courante
                    ? "text-[11px] font-semibold text-primary sm:text-xs"
                    : "text-[11px] font-medium text-muted-foreground sm:text-xs"
                }
              >
                {e.titre}
              </span>
            </div>
            {i < ETAPES.length - 1 && (
              <div
                className={finie ? "mx-2 mb-5 h-0.5 flex-1 rounded-full bg-primary" : "mx-2 mb-5 h-0.5 flex-1 rounded-full bg-border"}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
