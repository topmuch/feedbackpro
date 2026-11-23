"use client"

// ============================================================
// FeedVoice — LOGIN-2 : DEUX pages de connexion distinctes
// ------------------------------------------------------------
// 1. <AuthView />          — ÉTABLISSEMENTS (/login)
//    Design premium crème #ffffff + or #C9A961 + anthracite,
//    Playfair Display (titres) + Inter (corps) — aligné sur la
//    landing premium. Split-screen desktop (panneau noir/or à
//    gauche), formulaire + toggle Connexion/Inscription à droite.
//    Comptes démo Restaurant + lien discret vers l'espace admin.
//
// 2. <AuthViewAdmin />     — SUPERADMIN (/admin-login)
//    Design exclusif noir #1A1A1A + or, carte centrée, AUCUNE
//    inscription ni bouton démo restaurant. Si des identifiants
//    non-SUPERADMIN sont saisis ici : session refusée + nettoyée.
//
// 3. <TenantSelectionStep /> — onboarding post-inscription (TENANT-3),
//    logique inchangée, surface restylée crème/or.
//
// Le store reste la source de vérité : authMode / setAuthMode /
// demoLogin / prefillLogin / refreshSession / setView. Après un
// succès : refreshSession() puis setView selon le rôle.
//
// BUG « identifiants saisis 2 fois » — corrigé côté SW (network-first
// sur /api/*) et ceinture de sécurité côté formulaire : après login,
// on navigue selon le rôle RENVOYÉ PAR L'API (pas seulement la
// session re-fetchée), et un filet de sécurité force la sortie de
// la vue auth si refreshSession échoue.
// ============================================================

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Star,
  Store,
  Plane,
  Wine,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { BrandMark } from "@/components/feedbackpro/brand-mark"

// ============================================================
// Design tokens — alignés sur la landing premium
//   crème #ffffff · or #C9A961 / #C9A961 · anthracite #1A1A1A
//   noir #1A1A1A · Playfair Display (titres) · Inter (corps)
// ============================================================

const AUTH_CSS = `
@keyframes fbp-aurora1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,30px) scale(0.95)} }
@keyframes fbp-aurora2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,40px) scale(1.05)} }
@keyframes fbp-aurora3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(0.9)} }
.fbp-aurora1 { animation: fbp-aurora1 22s ease-in-out infinite; }
.fbp-aurora2 { animation: fbp-aurora2 27s ease-in-out infinite; }
.fbp-aurora3 { animation: fbp-aurora3 32s ease-in-out infinite; }
@keyframes fbp-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.fbp-shimmer { background-size:200% auto; animation: fbp-shimmer 3.2s linear infinite; }
@keyframes fbp-glow { 0%,100%{opacity:.55} 50%{opacity:.95} }
.fbp-glow { animation: fbp-glow 5s ease-in-out infinite; }
.fbp-serif { font-family:'Playfair Display', Georgia, serif; }
@media (prefers-reduced-motion: reduce) {
  .fbp-aurora1, .fbp-aurora2, .fbp-aurora3, .fbp-shimmer, .fbp-glow { animation: none; }
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
// Retour landing avec nettoyage de l'URL (/login → /)
// ============================================================

function retourLanding(setView: (v: "landing") => void) {
  try {
    if (typeof window !== "undefined" && window.location.pathname === "/login") {
      window.history.replaceState({}, "", "/")
    }
  } catch {
    /* ignore */
  }
  setView("landing")
}

// ============================================================
// VUE 1 — ÉTABLISSEMENTS (crème/or premium, split screen)
// Page /login — restaurants, hôtels, aéroports, salons VIP…
// ============================================================

export function AuthView() {
  return (
    <div className="relative grid grid-cols-1 bg-[#ffffff] lg:grid-cols-2">
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
      <PanneauVisuelEtab />
      <PanneauForm />
    </div>
  )
}

// ============================================================
// Panneau visuel (gauche, desktop) — noir & or, aurora dorées,
// grille subtile, logo, tagline Playfair, témoignage glass,
// rangée de secteurs desservis, stats sociales.
// ============================================================

function PanneauVisuelEtab() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-gradient-to-br from-[#1A1A1A] via-[#1A1A1A] to-[#1A1A1A] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
    >
      {/* Aurora dorées (3, floues, loops lents) */}
      <div className="fbp-aurora1 pointer-events-none absolute -top-32 -left-24 h-[40rem] w-[40rem] rounded-full bg-[#C9A961]/15 blur-[120px]" />
      <div className="fbp-aurora2 pointer-events-none absolute top-1/4 -right-32 h-[36rem] w-[36rem] rounded-full bg-[#C9A961]/10 blur-[120px]" />
      <div className="fbp-aurora3 pointer-events-none absolute -bottom-32 left-1/3 h-[32rem] w-[32rem] rounded-full bg-[#8a4f3b]/10 blur-[120px]" />

      {/* Grille subtile en arrière-plan */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,169,97,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,97,0.7) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Liseré doré vertical */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-[#C9A961]/40 to-transparent" />

      {/* ---------- En-tête : logo sur carte claire ---------- */}
      <div className="relative flex items-center gap-3">
        <BrandMark tone="white" className="h-7" />
      </div>

      {/* ---------- Centre : tagline + témoignage + secteurs ---------- */}
      <div className="relative space-y-8">
        <h2 className="max-w-lg text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white xl:text-5xl">
          L&apos;excellence opérationnelle,{" "}
          <em className="italic text-[#C9A961]">mesurée en temps réel</em>.
        </h2>

        {/* Témoignage glass dark */}
        <figure className="max-w-md rounded-none border border-white/15 bg-white/5 p-6 backdrop-blur-md">
          <div className="mb-3 flex gap-1" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-[#C9A961] text-[#C9A961]" />
            ))}
          </div>
          <blockquote className="text-lg font-medium leading-relaxed text-white/95">
            « FeedVoice a transformé notre gestion des incidents. Nous réagissons avant
            même que le client ne parte. »
          </blockquote>
          <figcaption className="mt-4 text-sm font-medium text-[#C9A961]">
            — Gérant de restaurant
          </figcaption>
        </figure>

        {/* Secteurs desservis */}
        <div className="flex flex-wrap gap-2">
          {[
            { emoji: "✈️", label: "Aéroports" },
            { emoji: "🥂", label: "Salons VIP" },
            { emoji: "🏪", label: "Commerces" },
            { emoji: "🍽️", label: "Restaurants" },
          ].map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-2 rounded-full border border-[#C9A961]/30 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm"
            >
              <span aria-hidden>{s.emoji}</span>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Bas : ligne de stats sociales ---------- */}
      <div className="relative flex items-center gap-6 text-white">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-[#C9A961] text-[#C9A961]" aria-hidden />
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
// Panneau formulaire (droite, toujours visible) — fond crème.
// Logo mobile en haut (lg:hidden), toggle pastille dorée
// coulissante, puis AnimatePresence pour le slide-in du
// formulaire actif.
// ============================================================

function PanneauForm() {
  const authMode = useAppStore((s) => s.authMode)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setView = useAppStore((s) => s.setView)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#ffffff] px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Logo mobile (panneau visuel caché sur petit écran) */}
        <div className="flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => retourLanding(setView)}
            className="flex items-center gap-2"
            aria-label="Retour à l'accueil"
          >
            <BrandMark className="h-6" />
          </button>
          <button
            type="button"
            onClick={() => retourLanding(setView)}
            className="text-xs font-medium text-stone-400 transition-colors hover:text-[#1A1A1A]"
          >
            Accueil
          </button>
        </div>

        {/* ---------- Toggle Connexion / Inscription (pastille dorée coulissante) ---------- */}
        <div className="relative flex rounded-full border border-[#000d10]/15 bg-[#f2f1ef] p-1">
          {(["login", "signup"] as const).map((mode) => {
            const actif = authMode === mode
            const label = mode === "login" ? "Connexion" : "Inscription"
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setAuthMode(mode)}
                className={`relative z-10 flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                  actif ? "text-white" : "text-[#8e8e95] hover:text-[#1A1A1A]"
                }`}
                aria-pressed={actif}
              >
                {actif && (
                  <motion.div
                    layoutId="auth-tab-pill"
                    className="absolute inset-0 rounded-full bg-[#000d10]"
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
// FORMULAIRE DE CONNEXION ÉTABLISSEMENTS
// Email + mot de passe (show/hide) + bouton anthracite/or +
// mot de passe oublié + divider « ou » + compte démo Restaurant
// + lien discret vers l'espace SuperAdmin (/admin-login).
// ============================================================

// Classe utilitaire des champs (crème premium)
const CHAMP_ETAB =
  "h-12 rounded-none border border-[#d5d3d4] bg-white pl-11 pr-11 text-[#1A1A1A] placeholder:text-stone-400 focus-visible:border-[#000d10] focus-visible:ring-2 focus-visible:ring-[#000d10]/15"

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
  const [demoLoading, setDemoLoading] = useState<"pro" | null>(null)

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
  async function demoRapide(kind: "pro") {
    const creds = { email: "demo@pizzeria.fr", password: "demo1234" }
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
  async function tenterConnexion(email: string, password: string, kindDemo?: "pro") {
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
      // Succès : rôle renvoyé par l'API (source de vérité immédiate).
      // refreshSession() recharge la session complète puis deriveView
      // route vers la bonne vue (admin pour SUPERADMIN, dashboard sinon).
      // LOGIN-2 — Ceinture de sécurité anti « double saisie » : si
      // refreshSession échouait (réponse périmée), on force quand même
      // la sortie de la vue auth vers le bon dashboard.
      const roleApi: string = json?.data?.user?.role ?? ""
      setJustRegistered(false)
      await refreshSession()
      const st = useAppStore.getState()
      const roleFinal = roleApi || st.session?.user.role || ""
      if (st.view === "auth" || st.view === "auth-admin") {
        setView(roleFinal === "SUPERADMIN" ? "admin" : "dashboard")
      }
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  return (
    <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-5" noValidate>
      {/* Titre + sous-titre */}
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-[-0.02em] text-[#1A1A1A]">
          Bon retour <em className="italic text-[#C9A961]">!</em>
        </h2>
        <p className="text-sm text-stone-500">Accédez à votre espace établissement</p>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email-connexion" className="text-sm font-medium text-[#1A1A1A]">
          Email
        </Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
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
            className={CHAMP_ETAB}
          />
        </div>
        <ErreurChamp message={errors.email?.message} />
      </div>

      {/* Mot de passe (show/hide) */}
      <div className="space-y-1.5">
        <Label htmlFor="password-connexion" className="text-sm font-medium text-[#1A1A1A]">
          Mot de passe
        </Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            id="password-connexion"
            type={showPassword ? "text" : "password"}
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
            className={CHAMP_ETAB}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#1A1A1A]"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <ErreurChamp message={errors.password?.message} />
      </div>

      {erreurApi && <ErreurApi message={erreurApi} />}

      {/* Bouton « Se connecter » — anthracite avec reflet doré animé */}
      <button
        type="submit"
        disabled={isSubmitting || !!demoLoading}
        className="group relative flex w-full items-center justify-center overflow-hidden rounded-full bg-[#000d10] px-4 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
      >
        <span
          className="fbp-shimmer pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[#C9A961]/30 to-transparent"
          aria-hidden
        />
        <span className="relative z-10 flex items-center gap-2">
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
        </span>
      </button>

      {/* Mot de passe oublié */}
      <p className="text-center">
        <a
          href="mailto:support@feedvoice.fr?subject=Mot%20de%20passe%20oubli%C3%A9"
          className="text-sm font-medium text-stone-500 transition-colors hover:text-[#C9A961] hover:underline"
        >
          Mot de passe oublié ?
        </a>
      </p>

      {/* Divider « ou » */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#d5d3d4]" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[#ffffff] px-3 text-xs font-medium uppercase tracking-wide text-stone-400">
            ou
          </span>
        </div>
      </div>

      {/* Compte démo (quick login Restaurant) */}
      <button
        type="button"
        onClick={() => demoRapide("pro")}
        disabled={!!demoLoading || isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#d5d3d4] bg-white px-3 py-2.5 text-sm font-semibold text-[#1A1A1A] transition-all hover:border-[#C9A961]/50 hover:bg-[#faf1ec] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {demoLoading === "pro" ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#C9A961]" aria-hidden />
        ) : (
          <Building2 className="h-4 w-4 text-[#C9A961]" aria-hidden />
        )}
        Essayer la démo Restaurant
      </button>

      {/* ---------- Accès SuperAdmin (page dédiée) ---------- */}
      <a
        href="/admin-login"
        className="group flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#C9A961]/40 bg-[#f7efe9] px-3 py-2.5 text-sm font-medium text-[#6f3f30] transition-all hover:border-[#C9A961] hover:bg-[#E5D4A8]"
      >
        <ShieldCheck className="h-4 w-4 text-[#C9A961]" aria-hidden />
        Vous êtes SuperAdmin ? Espace dédié
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </a>

      {/* Lien bascule vers l'inscription */}
      <p className="text-center text-sm text-stone-500">
        Pas encore de compte ?{" "}
        <button
          type="button"
          onClick={() => setAuthMode("signup")}
          className="font-semibold text-[#a05f45] transition-colors hover:text-[#C9A961] hover:underline"
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
        title: "Bienvenue sur FeedVoice",
        description: "Votre compte est créé. Votre dashboard est prêt.",
      })
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  // 4 cartes tenant — remplace le select secteur
  const TENANT_CARDS = [
    { value: "airport", emoji: "✈️", titre: "Aéroport", desc: "Infrastructure & ops — wallboard, supervision", color: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]" },
    { value: "airline", emoji: "🛫", titre: "Compagnie Aérienne", desc: "Escale & passager — check-in, litiges bagages", color: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]" },
    { value: "vip_lounge", emoji: "🥂", titre: "Salon VIP", desc: "Luxe & discrétion — buffet, douches, conciergerie", color: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]" },
    { value: "city", emoji: "🏙️", titre: "Ville Connectée", desc: "Établissements publics — plaques QR citoyennes, Aminata", color: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]" },
    { value: "classic", emoji: "🏪", titre: "Commerce classique", desc: "Restaurant, hôtel, boutique — dashboard standard", color: "hover:border-stone-400 hover:bg-[#f7efe9]" },
  ]

  return (
    <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-5" noValidate>
      {/* Titre + sous-titre */}
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-[-0.02em] text-[#1A1A1A]">
          Créer votre <em className="italic text-[#C9A961]">compte</em>
        </h2>
        <p className="text-sm text-stone-500">5 minutes de setup. Pas de carte bancaire.</p>
      </div>

      {/* CHOIX DU TENANT — 4 cartes au début du formulaire */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-[#1A1A1A]">
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
                  ? "border-[#C9A961] bg-white ring-2 ring-[#C9A961]/20"
                  : "border-[#d5d3d4] bg-white"
              }`}
            >
              <span className="text-2xl" aria-hidden>{card.emoji}</span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-[#1A1A1A]">{card.titre}</h3>
                <p className="text-xs leading-snug text-stone-500">{card.desc}</p>
              </div>
              {tenantChoice === card.value && (
                <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[#C9A961] text-white text-xs font-bold">✓</span>
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
        <Label htmlFor="nom-etablissement" className="text-sm font-medium text-[#1A1A1A]">
          Nom de l&apos;établissement
        </Label>
        <div className="relative">
          <Building2
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            id="nom-etablissement"
            placeholder="Ex : Le Petit Bistrot"
            autoComplete="organization"
            aria-invalid={!!errors.nomEtablissement}
            {...register("nomEtablissement")}
            className={`${CHAMP_ETAB} pr-4`}
          />
        </div>
        <ErreurChamp message={errors.nomEtablissement?.message} />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email-inscription" className="text-sm font-medium text-[#1A1A1A]">
          Email
        </Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
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
            className={`${CHAMP_ETAB} pr-4`}
          />
        </div>
        <ErreurChamp message={errors.email?.message} />
      </div>

      {/* Mot de passe (show/hide) */}
      <div className="space-y-1.5">
        <Label htmlFor="password-inscription" className="text-sm font-medium text-[#1A1A1A]">
          Mot de passe
        </Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            id="password-inscription"
            type={showPassword ? "text" : "password"}
            placeholder="6 caractères minimum"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
            className={CHAMP_ETAB}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#1A1A1A]"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <ErreurChamp message={errors.password?.message} />
      </div>

      {/* Secteur (select natif stylé) */}
      <div className="space-y-1.5">
        <Label htmlFor="secteur" className="text-sm font-medium text-[#1A1A1A]">
          Secteur
        </Label>
        <div className="relative">
          <Store
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <select
            id="secteur"
            aria-invalid={!!errors.secteur}
            {...register("secteur")}
            className="flex h-12 w-full appearance-none rounded-xl border-2 border-[#d5d3d4] bg-white pl-11 pr-10 text-[#1A1A1A] transition-colors focus:border-[#C9A961] focus:outline-none focus:ring-2 focus:ring-[#C9A961]/25"
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
            className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
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

      {/* Bouton « Créer mon compte » — gradient doré + glow */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="fbp-shimmer flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A961] px-4 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#a05f45] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
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
      <p className="text-center text-sm text-stone-500">
        Déjà un compte ?{" "}
        <button
          type="button"
          onClick={() => setAuthMode("login")}
          className="font-semibold text-[#a05f45] transition-colors hover:text-[#C9A961] hover:underline"
        >
          Se connecter
        </button>
      </p>
    </form>
  )
}

// ============================================================
// VUE 2 — SUPERADMIN (/admin-login)
// Design exclusif noir #1A1A1A + or : carte centrée, badge
// « Espace SuperAdmin », AUCUNE inscription, aucun bouton démo
// restaurant. Les identifiants non-SUPERADMIN sont refusés et
// la session créée est immédiatement nettoyée côté serveur.
// ============================================================

export function AuthViewAdmin() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1A1A1A] px-4 py-10 sm:px-6">
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />

      {/* Halo doré central + aurora */}
      <div className="fbp-glow pointer-events-none absolute left-1/2 top-1/3 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9A961]/10 blur-[130px]" />
      <div className="fbp-aurora2 pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-[#8a4f3b]/10 blur-[120px]" />
      <div className="fbp-aurora3 pointer-events-none absolute -top-40 right-0 h-[26rem] w-[26rem] rounded-full bg-[#C9A961]/8 blur-[120px]" />

      {/* Grille subtile */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,169,97,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(201,169,97,0.8) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Lien retour (haut gauche) */}
      <a
        href="/login"
        className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition-colors hover:text-[#C9A961] sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Espace établissement
      </a>

      <CarteAdmin />
    </div>
  )
}

function CarteAdmin() {
  const refreshSession = useAppStore((s) => s.refreshSession)
  const setView = useAppStore((s) => s.setView)
  const setJustRegistered = useAppStore((s) => s.setJustRegistered)

  const [showPassword, setShowPassword] = useState(false)
  const [erreurApi, setErreurApi] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ValeursConnexion>({
    resolver: zodResolver(connexionSchema),
    defaultValues: { email: "", password: "" },
  })

  async function aLaSoumission(valeurs: ValeursConnexion) {
    await tenterConnexionAdmin(valeurs.email, valeurs.password)
  }

  /** Pré-remplit + soumet le compte démo SuperAdmin. */
  async function demoAdmin() {
    const creds = { email: "admin@feedbackpro.fr", password: "admin123" }
    setValue("email", creds.email)
    setValue("password", creds.password)
    setDemoLoading(true)
    await tenterConnexionAdmin(creds.email, creds.password)
    setDemoLoading(false)
  }

  /**
   * Connexion SuperAdmin :
   *  - identifiants invalides → erreur classique
   *  - identifiants valides MAIS rôle ≠ SUPERADMIN → session refusée,
   *    nettoyée côté serveur (logout) et erreur dédiée : un Pro ne doit
   *    PAS se retrouver connecté en revenant sur la landing.
   *  - SUPERADMIN → refreshSession (network-first) → deriveView route
   *    vers "admin" ; filet de sécurité si la vue n'a pas changé.
   */
  async function tenterConnexionAdmin(email: string, password: string) {
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
        } else {
          setErreurApi(brut || "Identifiants incorrects.")
        }
        return
      }

      const role: string = json?.data?.user?.role ?? ""
      if (role !== "SUPERADMIN") {
        // Refus : ces identifiants ne sont pas ceux du back-office.
        // On supprime la session qui vient d'être créée pour ce compte Pro
        // (sinon il resterait connecté en arrière-plan côté navigateur).
        try {
          await fetch("/api/auth/logout", { method: "POST" })
        } catch {
          /* ignore */
        }
        setErreurApi("Ces identifiants ne donnent pas accès à l'espace SuperAdmin.")
        return
      }

      // Succès SUPERADMIN
      setJustRegistered(false)
      await refreshSession()
      const st = useAppStore.getState()
      if (st.view === "auth-admin" || st.view === "auth" || st.view === "landing") {
        setView("admin")
      }
    } catch {
      setErreurApi("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      {/* Carte noir/or */}
      <div className="rounded-none border border-[#C9A961]/35 bg-[#1A1A1A]/90 p-8 shadow-2xl shadow-black/60 backdrop-blur-md sm:p-10">
        {/* Badge espace superadmin */}
        <div className="mb-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A961]/40 bg-[#C9A961]/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#a05f45]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Espace SuperAdmin
          </span>
          <BrandMark tone="white" className="h-6 opacity-90" />
        </div>

        <form onSubmit={handleSubmit(aLaSoumission)} className="space-y-5" noValidate>
          {/* Titre */}
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold tracking-[-0.02em] text-white">
              Accès <em className="italic text-[#C9A961]">Direction</em>
            </h1>
            <p className="text-sm text-white/50">
              Back-office FeedVoice — accès restreint.
            </p>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-email" className="text-sm font-medium text-[#E5D4A8]">
              Email administrateur
            </Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
                aria-hidden
              />
              <Input
                id="admin-email"
                type="email"
                inputMode="email"
                placeholder="admin@feedbackpro.fr"
                autoComplete="email"
                autoFocus
                aria-invalid={!!errors.email}
                {...register("email")}
                className="h-12 rounded-xl border border-[#C9A961]/25 bg-[#1A1A1A] pl-11 pr-4 text-[#f7efe9] placeholder:text-white/30 focus-visible:border-[#C9A961] focus-visible:ring-2 focus-visible:ring-[#C9A961]/30"
              />
            </div>
            <ErreurChamp message={errors.email?.message} />
          </div>

          {/* Mot de passe */}
          <div className="space-y-1.5">
            <Label htmlFor="admin-password" className="text-sm font-medium text-[#E5D4A8]">
              Mot de passe
            </Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
                aria-hidden
              />
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
                className="h-12 rounded-xl border border-[#C9A961]/25 bg-[#1A1A1A] pl-11 pr-11 text-[#f7efe9] placeholder:text-white/30 focus-visible:border-[#C9A961] focus-visible:ring-2 focus-visible:ring-[#C9A961]/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/5 hover:text-[#C9A961]"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <ErreurChamp message={errors.password?.message} />
          </div>

          {erreurApi && <ErreurApi message={erreurApi} sombre />}

          {/* Bouton « Accéder » — gradient doré */}
          <button
            type="submit"
            disabled={isSubmitting || demoLoading}
            className="fbp-shimmer flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A961] px-4 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#a05f45] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Vérification…
              </>
            ) : (
              <>
                Accéder au back-office
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </form>

        {/* Accès démo (discret) */}
        <div className="mt-6 border-t border-[#C9A961]/15 pt-4">
          <button
            type="button"
            onClick={demoAdmin}
            disabled={demoLoading || isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white/40 transition-colors hover:text-[#C9A961] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {demoLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            )}
            Pré-remplir l&apos;accès démo SuperAdmin
          </button>
        </div>
      </div>

      {/* Mention bas de carte */}
      <p className="mt-6 text-center text-xs text-white/30">
        Connexion surveillée — FeedVoice Direction
      </p>
    </div>
  )
}

// ============================================================
// Blocs d'erreur (API + champ) — variante sombre pour /admin-login
// ============================================================

function ErreurApi({ message, sombre = false }: { message: string; sombre?: boolean }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm leading-snug ${
        sombre
          ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
          : "bg-rose-50 text-rose-700"
      }`}
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
    accent: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]",
  },
  {
    value: "airline",
    emoji: "🛫",
    titre: "Compagnie Aérienne",
    description: "Escale & passager — check-in, embarquement, litiges bagages",
    icon: Plane,
    accent: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]",
  },
  {
    value: "vip_lounge",
    emoji: "🥂",
    titre: "Salon VIP",
    description: "Luxe & discrétion — buffet, douches, conciergerie",
    icon: Wine,
    accent: "hover:border-[#C9A961]/70 hover:bg-[#f7efe9]",
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
    description: "Restaurant, hôtel, etc. — dashboard FeedVoice standard",
    icon: Store,
    accent: "hover:border-stone-400 hover:bg-[#f7efe9]",
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
    <div className="flex min-h-screen items-center justify-center bg-[#ffffff] px-4 py-8 sm:px-6 lg:px-8">
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
      <div className="w-full max-w-2xl space-y-6">
        {/* Logo + retour */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-2"
            aria-label="Se déconnecter"
          >
            <BrandMark className="h-6" />
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="text-xs font-medium text-stone-400 hover:text-[#1A1A1A]"
          >
            Se déconnecter
          </button>
        </div>

        {/* Titre */}
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-[#1A1A1A]">
            Quel type d&apos;établissement <em className="italic text-[#C9A961]">gérez-vous</em> ?
          </h2>
          <p className="text-sm text-stone-500">
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
                className={`group relative flex flex-col items-start gap-3 rounded-2xl border-2 border-[#d5d3d4] bg-white p-6 text-left transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 ${opt.accent} ${
                  actif ? "border-[#C9A961] ring-2 ring-[#C9A961]/20" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden>
                    {opt.emoji}
                  </span>
                  <Icon className="h-6 w-6 text-stone-400 transition-colors group-hover:text-[#C9A961]" aria-hidden />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[#1A1A1A]">{opt.titre}</h3>
                  <p className="text-sm leading-snug text-stone-500">{opt.description}</p>
                </div>
                {actif && submitting && (
                  <Loader2 className="absolute right-4 top-4 h-4 w-4 animate-spin text-[#C9A961]" aria-hidden />
                )}
              </button>
            )
          })}
        </div>

        {erreurApi && <ErreurApi message={erreurApi} />}

        {/* Lien bas */}
        <p className="text-center text-xs text-stone-400">
          FeedVoice s&apos;adapte à votre métier — aéroport, compagnie, salon VIP ou commerce.
        </p>
      </div>
    </div>
  )
}
