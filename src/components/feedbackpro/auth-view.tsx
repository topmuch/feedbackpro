"use client"

// ============================================================
// FeedbackPro — Vue Authentification
// Mode Connexion : carte centrée (email + mot de passe)
// Mode Inscription : wizard 3 étapes (Compte · Établissement ·
// Finalisation) avec validation zod PAR ÉTAPE via react-hook-form.
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
  ScanLine,
  Smartphone,
  Store,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { TYPES_ETABLISSEMENT } from "@/lib/constants"
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

    // Étape 3 — Finalisation
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
  { numero: 3, titre: "Finalisation" },
] as const

const CHAMPS_PAR_ETAPE: (keyof ValeursInscription)[][] = [
  ["email", "password", "confirmation"],
  ["nomEtablissement", "typeEtablissement", "adresse", "ville", "whatsapp"],
  ["logoUrl", "accepteCgu"],
]

// ============================================================
// Vue racine : bascule Connexion / Inscription via le store
// ============================================================

export function AuthView() {
  const authMode = useAppStore((s) => s.authMode)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setView = useAppStore((s) => s.setView)

  const modeInscription = authMode === "signup"

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#F3F4F6] px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        {/* Logo + titre */}
        <div className="mb-6 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => setView("landing")}
            aria-label="FeedbackPro — retour à l'accueil"
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 outline-none transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ScanLine className="h-6 w-6" aria-hidden />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            {modeInscription ? "Créez votre compte" : "Bon retour !"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {modeInscription
              ? "Votre Coach IA d'audit qualité en 3 étapes"
              : "Heureux de vous revoir. Votre rapport du jour vous attend."}
          </p>
        </div>

        <Card className="border-border/70 shadow-xl shadow-black/5">
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
  )
}

// ============================================================
// Bloc de message d'erreur API (identifiants / suspension / générique)
// ============================================================

function ErreurApi({ message }: { message: string }) {
  return (
    <p
      className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm leading-snug text-rose-700"
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
    <p className="text-xs text-rose-600" role="alert">
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
      logoUrl: "",
      accepteCgu: false,
    },
  })

  const logoActuel = watch("logoUrl")

  /** Valide les champs de l'étape courante avant de passer à la suivante */
  async function continuer() {
    const valide = await trigger(CHAMPS_PAR_ETAPE[etape - 1], { shouldFocus: true })
    if (valide) setEtape((e) => Math.min(3, e + 1))
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
        description: "Votre première zone « Accueil » a été créée",
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
                <Label htmlFor="typeEtablissement">Type d'établissement</Label>
                <Controller
                  control={control}
                  name="typeEtablissement"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="typeEtablissement"
                        className="h-11 w-full"
                        aria-invalid={!!errors.typeEtablissement}
                      >
                        <SelectValue placeholder="Sélectionnez le type d'établissement" />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES_ETABLISSEMENT.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
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

          {/* ============ ÉTAPE 3 — FINALISATION ============ */}
          {etape === 3 && (
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
                        className="text-xs font-medium text-rose-600 hover:underline"
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

      {/* Navigation du wizard (étapes 1 et 2) + erreur API */}
      {etape < 3 && (
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
                      ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-white text-primary"
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
