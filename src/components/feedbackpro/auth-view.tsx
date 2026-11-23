"use client"

// ============================================================
// FeedbackPro — Vue Authentification (Refonte Premium)
// ------------------------------------------------------------
// Layout split-screen desktop :
//   - Panneau gauche (lg+) : dégradé bleu aéroport #003399 → jaune
//     IATA #FCD116, 3 aurora blobs flous (CSS keyframes), logo blanc,
//     tagline, témoignage glass dark, ligne de stats sociales.
//   - Panneau droit : formulaire sur fond #F5F5F5, max-w-md,
//     toggle à pastille coulissante (framer-motion layoutId)
//     entre Connexion / Inscription.
// Mobile : colonne unique, formulaire seul (panneau visuel caché).
//
// Le store reste la source de vérité : authMode / setAuthMode /
// demoLogin / prefillLogin / refreshSession / setView. Après un
// succès : refreshSession() puis setView(role === "SUPERADMIN"
// ? "admin" : "dashboard").
// ============================================================

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  Star,
  Store,
  Plane,
  Wine,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"

// ============================================================
// CSS keyframes — aurora blobs (3, flous, loops lents) +
// shimmer dégradé bouton. Injecté via <style> pour rester
// scoped au composant et éviter toute collision de classes.
// Respect de prefers-reduced-motion.
// ============================================================

const AUTH_CSS = `
@keyframes fbp-aurora1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,30px) scale(0.95)} }
@keyframes fbp-aurora2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,40px) scale(1.05)} }
@keyframes fbp-aurora3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(0.9)} }
.fbp-aurora1 { animation: fbp-aurora1 22s ease-in-out infinite; }
.fbp-aurora2 { animation: fbp-aurora2 27s ease-in-out infinite; }
.fbp-aurora3 { animation: fbp-aurora3 32s ease-in-out infinite; }
@keyframes fbp-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
.fbp-shimmer { background-size:200% auto; animation: fbp-shimmer 3.5s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .fbp-aurora1, .fbp-aurora2, .fbp-aurora3, .fbp-shimmer { animation: none; }
}
`

// ============================================================
// Schémas de validation locaux (messages 100 % français)
// Le endpoint /api/auth/register exige aussi adresse + ville
// (min 5 / min 2) — le formulaire simplifié ne les collecte
// pas : on envoie des valeurs-joker valides que l'utilisateur
// complètera ensuite dans son dashboard (Paramètres).
// ============================================================

const emailChamp = z
  .string()
  .trim()
  .min(1, "L'adresse email est requise")
  .pipe(z.email("Adresse email invalide"))

const motDePasseChamp = z
  .string()
  .min(6, "Le mot de passe doit contenir au moins 6 caractères")

const connexionSchema = z.object({
  email: emailChamp,
  password: z.string().min(1, "Le mot de passe est requis"),
})

// 4 secteurs exposés dans le select (simplifié vs. le catalogue
// complet TYPES_ETABLISSEMENT — l'utilisateur peut affiner en
// Paramètres après inscription). Le serveur valide que la valeur
// fait bien partie du catalogue ; côté client, le select ne
// propose QUE ces 4 options (l'option vide « » est rejetée par
// min(1)).
const SECTEURS = ["Restaurant", "Aéroport", "Hôtel", "Autre"] as const

const inscriptionSchema = z.object({
  nomEtablissement: z
    .string()
    .trim()
    .min(2, "Indiquez le nom de votre établissement")
    .max(80, "Le nom ne peut pas dépasser 80 caractères"),
  email: emailChamp,
  password: motDePasseChamp,
  secteur: z.string().min(1, "Sélectionnez votre secteur"),
})

type ValeursConnexion = z.infer<typeof connexionSchema>
type ValeursInscription = z.infer<typeof inscriptionSchema>

// ============================================================
// Vue racine — split screen 50/50 sur lg+, colonne unique sur mobile.
// Pas de props : tout est piloté par le store (authMode, setAuthMode).
// ============================================================

export function AuthView() {
  return (
    <div className="relative grid min-h-screen grid-cols-1 bg-[#F5F5F5] lg:grid-cols-2">
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
      <PanneauVisuel />
      <PanneauForm />
    </div>
  )
}

// ============================================================
// Panneau visuel (gauche, desktop uniquement)
// Dégradé indigo → violet, 3 aurora blobs flous, grille subtile,
// logo blanc, tagline, témoignage glass dark, ligne de stats.
// Masqué en mobile (lg:flex) pour laisser toute la place au formulaire.
// ============================================================

function PanneauVisuel() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-gradient-to-br from-[#003399] to-[#FCD116] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
    >
      {/* Aurora blobs (3, flous, loops lents) */}
      <div className="fbp-aurora1 pointer-events-none absolute -top-32 -left-24 h-[40rem] w-[40rem] rounded-full bg-white/15 blur-[120px]" />
      <div className="fbp-aurora2 pointer-events-none absolute top-1/4 -right-32 h-[36rem] w-[36rem] rounded-full bg-[#FCD116]/30 blur-[120px]" />
      <div className="fbp-aurora3 pointer-events-none absolute -bottom-32 left-1/3 h-[32rem] w-[32rem] rounded-full bg-[#06B6D4]/20 blur-[120px]" />

      {/* Grille subtile en arrière-plan */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* ---------- En-tête : logo sur fond blanc arrondi ---------- */}
      <div className="relative flex items-center gap-3">
        <div className="rounded-xl bg-white px-4 py-2 shadow-lg">
          <img
            src="/logo-feedbackpro.png"
            alt="FeedbackPro"
            className="h-10 w-auto"
          />
        </div>
      </div>

      {/* ---------- Centre : tagline + témoignage ---------- */}
      <div className="relative space-y-8">
        <h2 className="max-w-md text-4xl font-bold leading-tight text-white xl:text-5xl">
          L&apos;audit qualité continu pour votre établissement
        </h2>

        {/* Témoignage glass dark */}
        <figure className="max-w-md rounded-2xl border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/20 backdrop-blur-md">
          <div className="mb-3 flex gap-1" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-amber-300 text-amber-300" />
            ))}
          </div>
          <blockquote className="text-lg font-medium leading-relaxed text-white/95">
            « FeedbackPro a transformé notre gestion des incidents. Nous réagissons avant
            même que le client ne parte. »
          </blockquote>
          <figcaption className="mt-4 text-sm font-medium text-white/80">
            — Gérant de restaurant
          </figcaption>
        </figure>
      </div>

      {/* ---------- Bas : ligne de stats sociales ---------- */}
      <div className="relative flex items-center gap-6 text-white">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-amber-300 text-amber-300" aria-hidden />
          <span className="text-sm font-semibold">4.9/5</span>
        </div>
        <div className="h-4 w-px bg-white/25" aria-hidden />
        <span className="text-sm font-semibold">+2M feedbacks</span>
        <div className="h-4 w-px bg-white/25" aria-hidden />
        <span className="text-sm font-semibold">98% satisfaction</span>
      </div>
    </aside>
  )
}

// ============================================================
// Panneau formulaire (droite, toujours visible)
// Fond #F5F5F5, formulaire max-w-md centré verticalement.
// Logo mobile en haut (lg:hidden), toggle pastille coulissante,
// puis AnimatePresence pour le slide-in du formulaire actif.
// ============================================================

function PanneauForm() {
  const authMode = useAppStore((s) => s.authMode)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setView = useAppStore((s) => s.setView)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Logo mobile (panneau visuel caché sur petit écran) */}
        <div className="flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => setView("landing")}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-[#003399]"
            aria-label="Retour à l'accueil"
          >
            <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-9" />
          </button>
          <button
            type="button"
            onClick={() => setView("landing")}
            className="text-xs font-medium text-slate-400 hover:text-[#003399]"
          >
            Accueil
          </button>
        </div>

        {/* ---------- Toggle Connexion / Inscription (pastille coulissante) ---------- */}
        <div className="relative flex rounded-xl bg-slate-100 p-1">
          {(["login", "signup"] as const).map((mode) => {
            const actif = authMode === mode
            const label = mode === "login" ? "Connexion" : "Inscription"
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setAuthMode(mode)}
                className={`relative z-10 flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  actif ? "text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                aria-pressed={actif}
              >
                {actif && (
                  <motion.div
                    layoutId="auth-tab-pill"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#003399] to-[#FCD116] shadow-lg shadow-[#003399]/25"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            )
          })}
        </div>

        {/* ---------- Formulaires : slide-in (opacity + x) au switch ---------- */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={authMode}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            {authMode === "login" ? <ConnexionForm /> : <InscriptionForm />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============================================================
// FORMULAIRE DE CONNEXION
// Email + mot de passe (show/hide) + bouton gradient glow +
// mot de passe oublié + divider « ou » + 2 boutons démo (quick login).
// ============================================================

function ConnexionForm() {
  const prefillLogin = useAppStore((s) => s.prefillLogin)
  const demoLogin = useAppStore((s) => s.demoLogin)
  const refreshSession = useAppStore((s) => s.refreshSession)
  const setView = useAppStore((s) => s.setView)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  // TENANT-3 — Login classique : on ne déclenche PAS l'onboarding tenant.
  // Les utilisateurs existants ont déjà choisi leur tenant (classic par
  // défaut pour les comptes pré-TENANT-3) et vont directement à leur
  // dashboard selon leur tenantType.
  const setJustRegistered = useAppStore((s) => s.setJustRegistered)

  const [showPassword, setShowPassword] = useState(false)
  const [erreurApi, setErreurApi] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState<"pro" | "admin" | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ValeursConnexion>({
    resolver: zodResolver(connexionSchema),
    defaultValues: { email: "", password: "" },
  })

  // Pré-remplissage automatique quand demoLogin(kind) est invoqué
  // ailleurs dans l'app (ex : CTA landing, page /demo). On évite la
  // boucle en ne déclenchant l'effet que sur l'identifiant du payload.
  useEffect(() => {
    if (!prefillLogin) return
    setValue("email", prefillLogin.email)
    setValue("password", prefillLogin.password)
  }, [prefillLogin, setValue])

  /** Soumission classique (email + password saisis) */
  async function aLaSoumission(valeurs: ValeursConnexion) {
    await tenterConnexion(valeurs.email, valeurs.password)
  }

  /** Quick login démo : pré-remplit + envoie directement la requête. */
  async function demoRapide(kind: "pro" | "admin") {
    const creds =
      kind === "pro"
        ? { email: "demo@pizzeria.fr", password: "demo1234" }
        : { email: "admin@feedbackpro.fr", password: "admin123" }
    // Synchronise le store (au cas où d'autres composants suivent prefillLogin)
    demoLogin(kind)
    // Reflète les valeurs dans le formulaire (transparence UX)
    setValue("email", creds.email)
    setValue("password", creds.password)
    setDemoLoading(kind)
    await tenterConnexion(creds.email, creds.password, kind)
    setDemoLoading(null)
  }

  /** Appel réel à /api/auth/login + refreshSession + redirection. */
  async function tenterConnexion(email: string, password: string, kindDemo?: "pro" | "admin") {
    setErreurApi(null)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        const brut = typeof json?.error === "string" ? json.error : ""
        if (brut.toLowerCase().includes("suspendu")) {
          setErreurApi("Votre compte a été suspendu. Contactez le support.")
        } else if (kindDemo) {
          setErreurApi("Compte de démo indisponible pour le moment. Réessayez plus tard.")
        } else {
          setErreurApi(brut || "Email ou mot de passe incorrect.")
        }
        return
      }
      // Succès : refreshSession() appelle deriveView() qui calcule la bonne
      // vue selon le rôle (admin pour SUPERADMIN, dashboard pour les Pro).
      // TENANT-3 — Login classique : justRegistered=false (pas d'étape tenant).
      setJustRegistered(false)
      await refreshSession()
      // Safety net : si deriveView n'a pas changé la vue, on force au moins
      // la sortie de la vue "auth" vers le dashboard Pro classique.
      const st = useAppStore.getState()
      if (st.view === "auth") {
        const role = st.session?.user.role
        setView(role === "SUPERADMIN" ? "admin" : "dashboard")
      }
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  return (
    <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-5" noValidate>
      {/* Titre + sous-titre */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Connexion</h2>
        <p className="text-sm text-slate-500">Accédez à votre dashboard</p>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email-connexion" className="text-sm font-medium text-slate-700">
          Email
        </Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            id="email-connexion"
            type="email"
            inputMode="email"
            placeholder="vous@etablissement.fr"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
            className="h-12 rounded-xl border-2 border-slate-200 bg-white pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#003399] focus-visible:ring-2 focus-visible:ring-[#003399]/20"
          />
        </div>
        <ErreurChamp message={errors.email?.message} />
      </div>

      {/* Mot de passe (show/hide) */}
      <div className="space-y-1.5">
        <Label htmlFor="password-connexion" className="text-sm font-medium text-slate-700">
          Mot de passe
        </Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            id="password-connexion"
            type={showPassword ? "text" : "password"}
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
            className="h-12 rounded-xl border-2 border-slate-200 bg-white pl-11 pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#003399] focus-visible:ring-2 focus-visible:ring-[#003399]/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <ErreurChamp message={errors.password?.message} />
      </div>

      {erreurApi && <ErreurApi message={erreurApi} />}

      {/* Bouton « Se connecter » — gradient indigo + glow shadow */}
      <button
        type="submit"
        disabled={isSubmitting || !!demoLoading}
        className="fbp-shimmer flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#003399] to-[#FCD116] px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#003399]/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#003399]/35 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Connexion en cours…
          </>
        ) : (
          <>
            Se connecter
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </button>

      {/* Mot de passe oublié */}
      <p className="text-center">
        <a
          href="mailto:support@feedbackpro.fr?subject=Mot%20de%20passe%20oubli%C3%A9"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-[#003399] hover:underline"
        >
          Mot de passe oublié ?
        </a>
      </p>

      {/* Divider « ou » */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[#F5F5F5] px-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            ou
          </span>
        </div>
      </div>

      {/* Comptes démo (quick login) */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => demoRapide("pro")}
          disabled={!!demoLoading || isSubmitting}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-[#003399]/40 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {demoLoading === "pro" ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#003399]" aria-hidden />
          ) : (
            <Building2 className="h-4 w-4 text-[#003399]" aria-hidden />
          )}
          Démo Restaurant
        </button>
        <button
          type="button"
          onClick={() => demoRapide("admin")}
          disabled={!!demoLoading || isSubmitting}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-[#FCD116]/40 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {demoLoading === "admin" ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#FCD116]" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4 text-[#FCD116]" aria-hidden />
          )}
          Démo Admin
        </button>
      </div>

      {/* Lien bascule vers l'inscription */}
      <p className="text-center text-sm text-slate-500">
        Pas encore de compte ?{" "}
        <button
          type="button"
          onClick={() => setAuthMode("signup")}
          className="font-semibold text-[#003399] transition-colors hover:underline"
        >
          S&apos;inscrire
        </button>
      </p>
    </form>
  )
}

// ============================================================
// FORMULAIRE D'INSCRIPTION (simplifié)
// 5 champs uniquement : nom établissement, email, mot de passe,
// secteur (select). Les champs adresse/ville/whatsapp/zones/logo
// non collectés ici sont envoyés avec des valeurs-joker valides
// (l'utilisateur les complétera dans son dashboard Paramètres).
// Promesse : « 5 minutes de setup. Pas de carte bancaire. »
// ============================================================

function InscriptionForm() {
  const refreshSession = useAppStore((s) => s.refreshSession)
  const setView = useAppStore((s) => s.setView)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setJustRegistered = useAppStore((s) => s.setJustRegistered)
  const { toast } = useToast()

  const [showPassword, setShowPassword] = useState(false)
  const [erreurApi, setErreurApi] = useState<string | null>(null)
  const [tenantChoice, setTenantChoice] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ValeursInscription>({
    resolver: zodResolver(inscriptionSchema),
    mode: "onTouched",
    defaultValues: {
      nomEtablissement: "",
      email: "",
      password: "",
      secteur: "",
    },
  })

  async function aLaSoumission(valeurs: ValeursInscription) {
    setErreurApi(null)
    if (!tenantChoice) {
      setErreurApi("Veuillez choisir un type d'établissement ci-dessus.")
      return
    }
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: valeurs.email,
          password: valeurs.password,
          nomEtablissement: valeurs.nomEtablissement,
          typeEtablissement: valeurs.secteur,
          tenantType: tenantChoice,
          adresse: "À compléter dans les paramètres",
          ville: "À compléter",
          whatsapp: "",
          logoUrl: "",
          zones: [],
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setErreurApi(json?.error || "Impossible de créer votre compte. Réessayez dans un instant.")
        return
      }
      // Le tenantType est déjà sauvé côté serveur. On refresh la session
      // et deriveView route vers le bon dashboard selon le tenantType.
      setJustRegistered(false)
      try { localStorage.removeItem("fp_just_registered") } catch {}
      await refreshSession()
      toast({
        title: "Bienvenue sur FeedbackPro",
        description: "Votre compte est créé. Votre dashboard est prêt.",
      })
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  // 4 cartes tenant — remplace le select secteur
  const TENANT_CARDS = [
    { value: "airport", emoji: "✈️", titre: "Aéroport", desc: "Infrastructure & ops — wallboard, supervision", color: "hover:border-[#003399]/60 hover:bg-[#003399]/5" },
    { value: "airline", emoji: "🛫", titre: "Compagnie Aérienne", desc: "Escale & passager — check-in, litiges bagages", color: "hover:border-sky-500/60 hover:bg-sky-50" },
    { value: "vip_lounge", emoji: "🥂", titre: "Salon VIP", desc: "Luxe & discrétion — buffet, douches, conciergerie", color: "hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/5" },
    { value: "classic", emoji: "🏪", titre: "Commerce classique", desc: "Restaurant, hôtel, boutique — dashboard standard", color: "hover:border-slate-400 hover:bg-slate-50" },
  ]

  return (
    <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-5" noValidate>
      {/* Titre + sous-titre */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Créer un compte</h2>
        <p className="text-sm text-slate-500">5 minutes de setup. Pas de carte bancaire.</p>
      </div>

      {/* CHOIX DU TENANT — 4 cartes au début du formulaire */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-slate-700">
          Quel type d&apos;établissement gérez-vous ?
        </Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TENANT_CARDS.map((card) => (
            <button
              key={card.value}
              type="button"
              onClick={() => setTenantChoice(card.value)}
              aria-pressed={tenantChoice === card.value}
              className={`group relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all hover:scale-[1.02] ${card.color} ${
                tenantChoice === card.value
                  ? "border-[#003399] ring-2 ring-[#003399]/20 bg-white"
                  : "border-slate-200 bg-white"
              }`}
            >
              <span className="text-2xl" aria-hidden>{card.emoji}</span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900">{card.titre}</h3>
                <p className="text-xs leading-snug text-slate-500">{card.desc}</p>
              </div>
              {tenantChoice === card.value && (
                <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[#003399] text-white text-xs font-bold">✓</span>
              )}
            </button>
          ))}
        </div>
        {erreurApi && !tenantChoice && (
          <p className="text-xs font-medium text-rose-500">{erreurApi}</p>
        )}
      </div>

      {/* Nom de l'établissement */}
      <div className="space-y-1.5">
        <Label htmlFor="nom-etablissement" className="text-sm font-medium text-slate-700">
          Nom de l&apos;établissement
        </Label>
        <div className="relative">
          <Building2
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            id="nom-etablissement"
            placeholder="Ex : Le Petit Bistrot"
            autoComplete="organization"
            aria-invalid={!!errors.nomEtablissement}
            {...register("nomEtablissement")}
            className="h-12 rounded-xl border-2 border-slate-200 bg-white pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#003399] focus-visible:ring-2 focus-visible:ring-[#003399]/20"
          />
        </div>
        <ErreurChamp message={errors.nomEtablissement?.message} />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email-inscription" className="text-sm font-medium text-slate-700">
          Email
        </Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            id="email-inscription"
            type="email"
            inputMode="email"
            placeholder="vous@etablissement.fr"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
            className="h-12 rounded-xl border-2 border-slate-200 bg-white pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#003399] focus-visible:ring-2 focus-visible:ring-[#003399]/20"
          />
        </div>
        <ErreurChamp message={errors.email?.message} />
      </div>

      {/* Mot de passe (show/hide) */}
      <div className="space-y-1.5">
        <Label htmlFor="password-inscription" className="text-sm font-medium text-slate-700">
          Mot de passe
        </Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            id="password-inscription"
            type={showPassword ? "text" : "password"}
            placeholder="6 caractères minimum"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
            className="h-12 rounded-xl border-2 border-slate-200 bg-white pl-11 pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#003399] focus-visible:ring-2 focus-visible:ring-[#003399]/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <ErreurChamp message={errors.password?.message} />
      </div>

      {/* Secteur (select natif stylé) */}
      <div className="space-y-1.5">
        <Label htmlFor="secteur" className="text-sm font-medium text-slate-700">
          Secteur
        </Label>
        <div className="relative">
          <Store
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <select
            id="secteur"
            aria-invalid={!!errors.secteur}
            {...register("secteur")}
            className="flex h-12 w-full appearance-none rounded-xl border-2 border-slate-200 bg-white pl-11 pr-10 text-slate-900 transition-colors focus:border-[#003399] focus:outline-none focus:ring-2 focus:ring-[#003399]/20"
            defaultValue=""
          >
            <option value="" disabled>
              Sélectionnez votre secteur
            </option>
            {SECTEURS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {/* Chevron natif custom (à droite) */}
          <svg
            className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <ErreurChamp message={errors.secteur?.message} />
      </div>

      {erreurApi && <ErreurApi message={erreurApi} />}

      {/* Bouton « Créer mon compte » — gradient indigo + glow shadow */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="fbp-shimmer flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#003399] to-[#FCD116] px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#003399]/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#003399]/35 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Création en cours…
          </>
        ) : (
          <>
            Créer mon compte
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </button>

      {/* Lien bascule vers la connexion */}
      <p className="text-center text-sm text-slate-500">
        Déjà un compte ?{" "}
        <button
          type="button"
          onClick={() => setAuthMode("login")}
          className="font-semibold text-[#003399] transition-colors hover:underline"
        >
          Se connecter
        </button>
      </p>
    </form>
  )
}

// ============================================================
// Blocs d'erreur (API + champ)
// ============================================================

function ErreurApi({ message }: { message: string }) {
  return (
    <p
      className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-snug text-rose-700"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

function ErreurChamp({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-xs text-rose-600" role="alert">
      {message}
    </p>
  )
}

// ============================================================
// TENANT-3 — Étape de sélection du type d'établissement
// ------------------------------------------------------------
// Affichée après inscription réussie (view === "onboarding-tenant").
// L'utilisateur choisit son type d'établissement parmi 4 options :
//   - Aéroport       (infrastructure & ops)
//   - Compagnie      (escale & passager)
//   - Salon VIP      (luxe & discrétion)
//   - Commerce       (restaurant, hôtel, etc.)
//
// Au clic : POST /api/auth/tenant avec le tenantType choisi →
// refreshSession() pour recharger la session avec le nouveau
// tenantType → setJustRegistered(false) pour sortir de l'onboarding
// → deriveView route vers le dashboard correspondant :
//   - airport    → "dashboard" (ProDashboard + onglets aéroport)
//   - airline    → "airline"
//   - vip_lounge → "vip"
//   - classic    → "dashboard"
// ============================================================

type TenantOption = {
  value: "airport" | "airline" | "vip_lounge" | "city" | "classic"
  emoji: string
  titre: string
  description: string
  icon: typeof Plane
  accent: string // classes tailwind pour le hover/border
}

const TENANT_OPTIONS: readonly TenantOption[] = [
  {
    value: "airport",
    emoji: "✈️",
    titre: "Aéroport",
    description: "Infrastructure & ops — wallboard, salle de supervision",
    icon: Plane,
    accent: "hover:border-[#003399]/60 hover:bg-[#003399]/5",
  },
  {
    value: "airline",
    emoji: "🛫",
    titre: "Compagnie Aérienne",
    description: "Escale & passager — check-in, embarquement, litiges bagages",
    icon: Plane,
    accent: "hover:border-sky-500/60 hover:bg-sky-50",
  },
  {
    value: "vip_lounge",
    emoji: "🥂",
    titre: "Salon VIP",
    description: "Luxe & discrétion — buffet, douches, conciergerie",
    icon: Wine,
    accent: "hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/5",
  },
  {
    value: "city",
    emoji: "🏙️",
    titre: "Ville Connectée",
    description: "Établissements publics — plaques QR citoyennes, Aminata",
    icon: Building2,
    accent: "hover:border-[#C9A961]/60 hover:bg-[#C9A961]/5",
  },
  {
    value: "classic",
    emoji: "🏪",
    titre: "Commerce classique",
    description: "Restaurant, hôtel, etc. — dashboard FeedbackPro standard",
    icon: Store,
    accent: "hover:border-slate-400 hover:bg-slate-50",
  },
] as const

export function TenantSelectionStep() {
  const refreshSession = useAppStore((s) => s.refreshSession)
  const setJustRegistered = useAppStore((s) => s.setJustRegistered)
  const setView = useAppStore((s) => s.setView)
  const logout = useAppStore((s) => s.logout)
  const { toast } = useToast()

  const [selection, setSelection] = useState<TenantOption["value"] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [erreurApi, setErreurApi] = useState<string | null>(null)

  async function choisirTenant(value: TenantOption["value"]) {
    setErreurApi(null)
    setSelection(value)
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantType: value }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setErreurApi(json?.error || "Impossible d'enregistrer votre choix. Réessayez.")
        setSubmitting(false)
        return
      }
      // Succès : on recharge la session avec le nouveau tenantType.
      // setJustRegistered(false) avant refreshSession pour que deriveView
      // route vers le dashboard final (pas vers onboarding-tenant).
      setJustRegistered(false)
      try { localStorage.removeItem("fp_just_registered") } catch {}
      await refreshSession()
      // Safety net : si deriveView n'a pas changé la vue, on force le
      // dashboard Pro classique (compatible classic + airport).
      const st = useAppStore.getState()
      if (st.view === "onboarding-tenant") {
        setView("dashboard")
      }
      toast({
        title: "Type d'établissement enregistré",
        description: "Votre dashboard est prêt.",
      })
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Logo + retour */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-[#003399]"
            aria-label="Se déconnecter"
          >
            <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-9" />
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="text-xs font-medium text-slate-400 hover:text-[#003399]"
          >
            Se déconnecter
          </button>
        </div>

        {/* Titre */}
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Quel type d&apos;établissement gérez-vous ?
          </h2>
          <p className="text-sm text-slate-500">
            Votre tableau de bord sera adapté à votre activité. Vous pourrez le modifier
            plus tard dans les Paramètres.
          </p>
        </div>

        {/* Grille 4 cartes (2x2 sur desktop, 1 colonne sur mobile) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TENANT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const actif = selection === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => choisirTenant(opt.value)}
                disabled={submitting}
                aria-pressed={actif}
                className={`group relative flex flex-col items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-6 text-left transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 ${opt.accent} ${
                  actif ? "border-[#003399] ring-2 ring-[#003399]/20" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden>
                    {opt.emoji}
                  </span>
                  <Icon className="h-6 w-6 text-slate-400 transition-colors group-hover:text-slate-700" aria-hidden />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900">{opt.titre}</h3>
                  <p className="text-sm leading-snug text-slate-500">{opt.description}</p>
                </div>
                {actif && submitting && (
                  <Loader2 className="absolute right-4 top-4 h-4 w-4 animate-spin text-[#003399]" aria-hidden />
                )}
              </button>
            )
          })}
        </div>

        {erreurApi && <ErreurApi message={erreurApi} />}

        {/* Lien bas */}
        <p className="text-center text-xs text-slate-400">
          FeedbackPro s&apos;adapte à votre métier — aéroport, compagnie, salon VIP ou commerce.
        </p>
      </div>
    </div>
  )
}
