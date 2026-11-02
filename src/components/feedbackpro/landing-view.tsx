"use client"

// ============================================================
// FeedbackPro — Landing SaaS B2B (Refonte complète)
// ------------------------------------------------------------
// 14 sections orientées conversion. Aucun fetch, aucune route :
// toutes les actions passent par onLogin / onSignup fournis par
// page.tsx (routage Zustand préservé).
// Animations : CSS pur (keyframes globals.css) + IntersectionObserver
// via le hook useReveal (pas de framer-motion).
// Rendu à l'intérieur du <main> de page.tsx : on n'imbrique pas de
// second <main>, on expose <header>/<section>/<footer>.
// ============================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import {
  ArrowRight,
  ArrowDown,
  BarChart3,
  BellRing,
  Bot,
  Building2,
  Check,
  ChevronRight,
  HeartPulse,
  Hotel,
  Landmark,
  Menu,
  MapPin,
  Package,
  QrCode,
  Quote,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Users,
  Zap,
  X,
  type LucideIcon,
} from "lucide-react"

// ============================================================
// Hook personnalisé : reveal au scroll (IntersectionObserver)
// ============================================================

function useRevealCallback() {
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            observerRef.current?.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    )
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  return useCallback((node: HTMLElement | null) => {
    if (!node) return
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("is-visible")
      return
    }
    // (ré)observe le noeud : si l'observer n'est pas encore prêt, on
    // retente à la prochaine frame (cas très rare en SSR).
    if (observerRef.current) {
      observerRef.current.observe(node)
    } else {
      requestAnimationFrame(() => observerRef.current?.observe(node))
    }
  }, [])
}

// Composant wrapper : applique .fp-reveal + délai optionnel
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const setRef = useRevealCallback()
  return (
    <div
      ref={setRef}
      className={`fp-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

// ============================================================
// Données statiques (textes 100 % français)
// ============================================================

const NAV_LINKS = [
  { id: "fonctionnalites", label: "Fonctionnalités" },
  { id: "cas-usage", label: "Cas d'usage" },
  { id: "tarifs", label: "Tarifs" },
  { id: "faq", label: "FAQ" },
] as const

const TRUST_LOGOS = ["Bistrot", "HotelRoyal", "MaisonVert", "CaféLyon", "GaragePro", "SpaZen"] as const

const PROBLEM_CARDS: {
  emoji: string
  titre: string
  texte: string
  bg: string
  ring: string
}[] = [
  {
    emoji: "🤐",
    titre: "Vos clients mécontents partent sans rien dire",
    texte: "96 % des clients insatisfaits ne se plaignent jamais. Ils disparaissent et vous ne le savez que sur un avis Google public, des semaines plus tard.",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    ring: "ring-rose-200/60 dark:ring-rose-900/40",
  },
  {
    emoji: "💥",
    titre: "Un seul avis négatif détruit votre réputation",
    texte: "Sur Google, une note de 2 étoiles affichée pendant 3 mois coûte en moyenne 30 % de réservations. Et vous ne pouvez rien corriger a posteriori.",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    ring: "ring-orange-200/60 dark:ring-orange-900/40",
  },
  {
    emoji: "🎲",
    titre: "Vous décidez à l'instinct, pas aux données",
    texte: "Pas de retour client en temps réel = impossible de savoir quel employé former, quel créneau renforcer, quel plat revoir. Vous pilotez à l'aveugle.",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    ring: "ring-amber-200/60 dark:ring-amber-900/40",
  },
]

const STEPS: { emoji: string; icone: LucideIcon; titre: string; texte: string }[] = [
  {
    emoji: "📱",
    icone: QrCode,
    titre: "QR Code par zone",
    texte: "Un QR code dédié à chaque point de contact (accueil, salle, terrasse, toilettes…). Le client le scanne en 2 secondes.",
  },
  {
    emoji: "⭐",
    icone: ScanLine,
    titre: "Scan client en 10 s",
    texte: "Le client note de 1 à 5 étoiles et choisit des tags en un clic. Aucune inscription, aucune app à installer.",
  },
  {
    emoji: "🧠",
    icone: Bot,
    titre: "L'IA analyse tout",
    texte: "Notre Coach IA consolide les retours, détecte les patterns et identifie les priorités du jour automatiquement.",
  },
  {
    emoji: "📊",
    icone: BarChart3,
    titre: "Rapport quotidien",
    texte: "Chaque matin, vous recevez un rapport d'audit avec votre score global et vos 3 priorités actionnables.",
  },
]

const COMPARISON_ROWS: {
  critere: string
  traditionnel: string
  feedbackpro: string
}[] = [
  { critere: "Prix", traditionnel: "500 – 1 500 € par visite", feedbackpro: "29 € / mois" },
  { critere: "Fréquence", traditionnel: "1 visite par mois", feedbackpro: "Audit quotidien automatique" },
  { critere: "Couverture", traditionnel: "1 client mystère fictif", feedbackpro: "Tous vos vrais clients" },
  { critere: "Réactivité", traditionnel: "Rapport sous 15 jours", feedbackpro: "Alerte WhatsApp en temps réel" },
  { critere: "Actionnable", traditionnel: "Synthèse qualitative vague", feedbackpro: "Top 3 priorités générées par IA" },
  { critere: "ROI", traditionnel: "6 à 12 mois", feedbackpro: "Moins de 1 mois" },
]

const PROBLEMES_RESOLUS: { emoji: string; titre: string; texte: string }[] = [
  { emoji: "📦", titre: "Manque de formation produit", texte: "Détectez les vendeurs qui ne maîtrisent pas le catalogue et planifiez les formations ciblées." },
  { emoji: "😠", titre: "Impolitesse du personnel", texte: "Repérez immédiatement les comportements à corriger, sans attendre un avis public négatif." },
  { emoji: "❓", titre: "Manque d'information sur la société", texte: "Identifiez les zones où l'accueil ne transmet pas les bons messages (horaires, services, promos)." },
  { emoji: "🎓", titre: "Manque de formation générale", texte: "Le Coach IA pointe les compétences à renforcer par employé, sans jugement, sur données objectives." },
  { emoji: "💬", titre: "Employés distraits (discussions entre eux)", texte: "Les alertes en temps réel rappellent à l'équipe que le client est prioritaire, dès le 1er signalement." },
  { emoji: "⏳", titre: "Attente trop longue (plats, service)", texte: "La heatmap révèle les créneaux critiques. Renforcez le staff exactement quand il le faut." },
  { emoji: "🧹", titre: "Commerce mal rangé / sale", texte: "QR dédié aux toilettes et zones sensibles : un signalement client = une action immédiate." },
]

const FEATURES: { icone: LucideIcon; titre: string; texte: string; emoji: string }[] = [
  {
    icone: Bot,
    emoji: "🤖",
    titre: "Coach IA quotidien",
    texte: "Chaque matin, l'IA analyse les retours de la veille et vous livre un rapport d'audit avec des recommandations concrètes.",
  },
  {
    icone: MapPin,
    emoji: "📍",
    titre: "QR Zones intelligentes",
    texte: "Une zone par point de contact (accueil, salle, terrasse, toilettes…) avec son QR dédié et des tags contextuels.",
  },
  {
    icone: Trophy,
    emoji: "🏆",
    titre: "Leaderboard équipe",
    texte: "Classez vos employés, valorisez les meilleurs et repérez objectivement les besoins de formation.",
  },
  {
    icone: BellRing,
    emoji: "🔔",
    titre: "Alertes temps réel",
    texte: "Un client signale un problème ? Vous êtes alerté sur WhatsApp en quelques secondes pour corriger avant qu'il parte.",
  },
  {
    icone: BarChart3,
    emoji: "📊",
    titre: "Statistiques avancées",
    texte: "Suivez vos scores par zone, par jour et par heure. Heatmap, tendances, exports CSV / PDF.",
  },
  {
    icone: Package,
    emoji: "📦",
    titre: "Supports physiques livrés",
    texte: "Autocollants, chevalets et affiches haute qualité commandés en 1 clic, livrés prêts à poser sur le terrain.",
  },
]

const USE_CASES: {
  id: string
  emoji: string
  icone: LucideIcon
  label: string
  points: { titre: string; texte: string }[]
}[] = [
  {
    id: "hotellerie",
    emoji: "🏨",
    icone: Hotel,
    label: "Hôtellerie",
    points: [
      { titre: "Accueil réception", texte: "Score instantané sur le check-in et la prise en charge." },
      { titre: "Chambres & étages", texte: "QR dédiés pour signaler propreté ou confort dès la 1re heure." },
      { titre: "Petit-déjeuner", texte: "Repérez les pics d'attente et ajustez le staff en temps réel." },
      { titre: "Conciergerie", texte: "Mesurez la qualité des recommandations et de la disponibilité." },
    ],
  },
  {
    id: "restauration",
    emoji: "🍽️",
    icone: UtensilsCrossed,
    label: "Restauration",
    points: [
      { titre: "Salle & terrasse", texte: "Notez service, rapidité et amabilité serveur en temps réel." },
      { titre: "Cuisine / plats", texte: "Alerte immédiate sur plat froid, erreur ou délai dépassé." },
      { titre: "Bar & comptoir", texte: "Pilotez les pics (apéro, pause déj) et fluidifiez le service." },
      { titre: "Toilettes", texte: "QR dédié propreté — un signalement = une action immédiate." },
    ],
  },
  {
    id: "retail",
    emoji: "🛍️",
    icone: ShoppingBag,
    label: "Retail",
    points: [
      { titre: "Accueil boutique", texte: "Sondage immédiat sur la disponibilité des vendeurs." },
      { titre: "Conseil produit", texte: "Détectez les manques de formation catalogue par rayon." },
      { titre: "Caisse & file d'attente", texte: "Repérez les créneaux saturés pour renforcer les caisses." },
      { titre: "Cabines & espaces", texte: "QR dédié propreté / rangement des cabines d'essayage." },
    ],
  },
  {
    id: "sante",
    emoji: "🏥",
    icone: HeartPulse,
    label: "Santé",
    points: [
      { titre: "Accueil patient", texte: "Mesurez la qualité d'écoute à la réception et au standard." },
      { titre: "Salle d'attente", texte: "QR dédié : temps d'attente ressenti, confort, propreté." },
      { titre: "Prise de rendez-vous", texte: "Identifiez les frictions (téléphone, plateforme, accueil)." },
      { titre: "Confidentialité", texte: "Captez les retours sur le respect de la vie privée." },
    ],
  },
  {
    id: "administrations",
    emoji: "🏛️",
    icone: Landmark,
    label: "Administrations",
    points: [
      { titre: "Guichet d'accueil", texte: "Notez l'amabilité et la clarté des informations données." },
      { titre: "Files d'attente", texte: "Repérez les pics et optimisez l'organisation des guichets." },
      { titre: "Démarches en ligne", texte: "Sondage sur la clarté des formulaires et procédures." },
      { titre: "Salles / espaces", texte: "QR dédié propreté et signalétique des espaces publics." },
    ],
  },
]

const TESTIMONIALS: {
  nom: string
  poste: string
  etablissement: string
  citation: string
  note: number
  initiales: string
  couleur: string
}[] = [
  {
    nom: "Sophie Marchand",
    poste: "Gérante",
    etablissement: "Bistrot Le Marais, Paris",
    citation: "En 3 semaines, on a corrigé un problème d'attente au déjeuner qu'on traînait depuis 2 ans. Le rapport du matin m'a permis de cibler exactement qui former.",
    note: 5,
    initiales: "SM",
    couleur: "bg-blue-600",
  },
  {
    nom: "Karim Benali",
    poste: "Directeur",
    etablissement: "Hôtel Royal Lyon, 4 ★",
    citation: "On a divisé par 4 les avis négatifs Google en 2 mois. Les alertes WhatsApp m'ont sauvé 3 clients qui allaient partir. ROI atteint en 3 semaines.",
    note: 5,
    initiales: "KB",
    couleur: "bg-emerald-600",
  },
  {
    nom: "Émilie Faure",
    poste: "Responsable qualité",
    etablissement: "Maison Vert (8 boutiques)",
    citation: "On pilotait 8 boutiques à l'instinct. Aujourd'hui chaque manager reçoit son rapport matininal. Le leaderboard a complètement changé la dynamique d'équipe.",
    note: 5,
    initiales: "EF",
    couleur: "bg-amber-500",
  },
]

const FAQ_ITEMS: { q: string; r: string }[] = [
  {
    q: "Comment fonctionne FeedbackPro concrètement ?",
    r: "Vous créez une zone (accueil, salle, terrasse…), nous générons un QR code dédié. Le client le scanne, note en 10 secondes, choisit des tags. Notre Coach IA analyse tout et vous livre chaque matin un rapport avec vos 3 priorités du jour.",
  },
  {
    q: "Est-ce que le client doit télécharger une application ?",
    r: "Non. Aucune app, aucune inscription. Le client scanne le QR avec son téléphone, répond sur la page web qui s'ouvre, et c'est tout. C'est ce qui fait notre taux de réponse exceptionnel.",
  },
  {
    q: "Combien de temps pour être opérationnel ?",
    r: "Moins de 10 minutes. Vous créez votre compte, ajoutez vos zones, téléchargez vos QR codes (PDF prêt à imprimer) ou commandez nos supports physiques livrés en 3 jours. Le premier rapport arrive dès le lendemain.",
  },
  {
    q: "Comment sont alertés les problèmes en temps réel ?",
    r: "Dès qu'un client laisse une note basse ou sélectionne un tag critique (propreté, attente, impolitesse…), vous recevez une alerte WhatsApp instantanée sur votre téléphone. Vous pouvez intervenir avant que le client ne quitte votre établissement.",
  },
  {
    q: "Quels secteurs sont compatibles ?",
    r: "Tous les secteurs avec un point de contact physique client : restauration, hôtellerie, retail, santé, administrations, salons, garages, transports, etc. Les tags sont adaptés automatiquement au contexte de chaque zone.",
  },
  {
    q: "Mes données et celles de mes clients sont-elles protégées ?",
    r: "Oui. Hébergement européen (RGPD), chiffrement TLS, données 100 % propriétaires et exportables à tout moment. Le client reste anonyme s'il le souhaite. Vous pouvez tout supprimer en 1 clic (droit à l'oubli).",
  },
  {
    q: "Puis-je changer de plan ou résilier à tout moment ?",
    r: "Oui, sans engagement. Vous changez de plan ou résiliez en 1 clic depuis votre espace. Pas de frais cachés, pas de période minimale. Le prorata est calculé automatiquement.",
  },
  {
    q: "Proposez-vous une période d'essai ?",
    r: "Oui, 14 jours d'essai gratuit sur le plan Pro, sans carte bancaire. Vous avez accès à toutes les fonctionnalités, y compris le rapport quotidien et les alertes WhatsApp.",
  },
]

const PRICING: {
  id: "starter" | "pro" | "enterprise"
  nom: string
  prixMensuel: number
  tagline: string
  features: { texte: string; inclus: boolean }[]
  populaire?: boolean
  cta: string
}[] = [
  {
    id: "starter",
    nom: "Starter",
    prixMensuel: 29,
    tagline: "Pour démarrer et prouver la valeur",
    cta: "Commencer gratuitement",
    features: [
      { texte: "Jusqu'à 3 zones de contact", inclus: true },
      { texte: "50 retours / mois", inclus: true },
      { texte: "QR code dédié par zone", inclus: true },
      { texte: "Rapport IA hebdomadaire", inclus: true },
      { texte: "Alertes WhatsApp temps réel", inclus: true },
      { texte: "Rapport IA quotidien", inclus: false },
      { texte: "Leaderboard & formations", inclus: false },
      { texte: "Statistiques avancées + heatmap", inclus: false },
      { texte: "Multi-établissements", inclus: false },
    ],
  },
  {
    id: "pro",
    nom: "Pro",
    prixMensuel: 99,
    tagline: "Le Coach IA complet pour piloter vos équipes",
    populaire: true,
    cta: "Commencer gratuitement",
    features: [
      { texte: "Zones & retours illimités", inclus: true },
      { texte: "Rapport IA quotidien (Coach)", inclus: true },
      { texte: "Top 3 priorités du jour", inclus: true },
      { texte: "Leaderboard & besoins formation", inclus: true },
      { texte: "Statistiques avancées + heatmap", inclus: true },
      { texte: "Exports CSV & PDF", inclus: true },
      { texte: "Alertes WhatsApp temps réel", inclus: true },
      { texte: "Jusqu'à 15 employés", inclus: true },
      { texte: "Multi-établissements", inclus: false },
    ],
  },
  {
    id: "enterprise",
    nom: "Enterprise",
    prixMensuel: 249,
    tagline: "Pour les franchises et groupes multi-sites",
    cta: "Demander une démo",
    features: [
      { texte: "Tout le plan Pro, plus :", inclus: true },
      { texte: "Multi-établissements illimités", inclus: true },
      { texte: "Employés illimités", inclus: true },
      { texte: "Rapports consolidés par site", inclus: true },
      { texte: "API & intégrations sur-mesure", inclus: true },
      { texte: "Support prioritaire dédié", inclus: true },
      { texte: "Onboarding personnalisé", inclus: true },
      { texte: "SLA garanti", inclus: true },
      { texte: "Account manager dédié", inclus: true },
    ],
  },
]

// ============================================================
// Helpers
// ============================================================

function allerVers(id: string) {
  if (typeof document === "undefined") return
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
}

function Etoiles({ note, className = "" }: { note: number; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${note} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < note ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground"}`}
          aria-hidden
        />
      ))}
    </div>
  )
}

// ============================================================
// 1. Header sticky
// ============================================================

function SiteHeader({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-colors duration-300 ${
        scrolled
          ? "border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: "smooth" })
          }}
          className="flex items-center gap-2 font-bold"
          aria-label="Accueil FeedbackPro"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <QrCode className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg tracking-tight">FeedbackPro</span>
        </a>

        {/* Liens desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
          {NAV_LINKS.map((lien) => (
            <button
              key={lien.id}
              onClick={() => allerVers(lien.id)}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {lien.label}
            </button>
          ))}
        </nav>

        {/* CTA desktop */}
        <div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" onClick={() => allerVers("tarifs")}>
            Voir la démo
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogin}>
            Se connecter
          </Button>
          <Button size="sm" onClick={onSignup} className="shadow-sm">
            Essayer gratuitement
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Burger mobile */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[88%] max-w-sm">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <QrCode className="h-4 w-4" />
                </span>
                FeedbackPro
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4" aria-label="Navigation mobile">
              {NAV_LINKS.map((lien) => (
                <button
                  key={lien.id}
                  onClick={() => {
                    setOpen(false)
                    allerVers(lien.id)
                  }}
                  className="flex items-center justify-between rounded-lg px-3 py-3 text-left text-base font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {lien.label}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 p-4">
              <Button
                className="w-full"
                onClick={() => {
                  setOpen(false)
                  onSignup()
                }}
              >
                Essayer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setOpen(false)
                  onLogin()
                }}
              >
                Se connecter
              </Button>
              <SheetClose asChild>
                <Button variant="ghost" className="w-full" onClick={() => allerVers("tarifs")}>
                  Voir la démo
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}

// ============================================================
// 2. Hero
// ============================================================

function Hero({ onSignup }: { onSignup: () => void }) {
  return (
    <section
      className="relative overflow-hidden"
      aria-labelledby="hero-title"
    >
      {/* Background dégradé subtil + blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-blue-50/80 via-background to-background dark:from-blue-950/30" />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="fp-blob absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-400/25 blur-3xl dark:bg-blue-600/20" />
        <div className="fp-blob absolute -right-24 top-10 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-600/15" style={{ animationDelay: "-6s" }} />
        <div className="fp-blob absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-500/10" style={{ animationDelay: "-12s" }} />
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-5 lg:gap-8 lg:px-8">
        {/* Colonne gauche (60%) */}
        <div className="lg:col-span-3">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Nouveau — Client Mystère 2.0 par IA
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1
              id="hero-title"
              className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            >
              Transformez vos clients en{" "}
              <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
                auditeurs qualité
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              FeedbackPro collecte les retours de vos clients en temps réel via QR code, les analyse par IA et vous livre chaque matin un rapport d'audit avec vos 3 priorités du jour.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={onSignup} className="h-12 px-6 text-base shadow-md">
                Commencer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => allerVers("solution")}
                className="h-12 px-6 text-base"
              >
                Voir la démo
              </Button>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex items-center gap-2">
                <Etoiles note={5} />
                <span className="text-sm font-semibold">4,9/5</span>
              </div>
              <div className="hidden h-5 w-px bg-border sm:block" aria-hidden />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 text-primary" aria-hidden />
                <span><strong className="text-foreground">127+</strong> établissements conquis</span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Colonne droite (40%) — mockup carte flottante */}
        <div className="lg:col-span-2">
          <Reveal delay={200}>
            <div className="relative mx-auto max-w-sm">
              {/* Halo derrière */}
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 to-emerald-400/10 blur-2xl" aria-hidden />

              {/* Carte rapport */}
              <div className="fp-float rounded-3xl border border-border/80 bg-card p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Rapport du jour
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </Badge>
                </div>

                {/* Score global */}
                <div className="mt-5 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-primary-foreground shadow-lg">
                  <p className="text-xs uppercase tracking-wide opacity-80">Score qualité global</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-5xl font-extrabold leading-none">82</span>
                    <span className="mb-1 text-lg opacity-80">/100</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs">
                    <TrendingUp className="h-3.5 w-3.5" />
                    +6 points vs hier
                  </div>
                </div>

                {/* Priorités du jour */}
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Priorités du jour
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    <li className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
                      <span className="text-lg leading-none">⏳</span>
                      <div>
                        <p className="text-sm font-medium">Attente salle &gt; 12 min</p>
                        <p className="text-xs text-muted-foreground">Pic 12h-13h — renforcer 1 serveur</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
                      <span className="text-lg leading-none">💬</span>
                      <div>
                        <p className="text-sm font-medium">Personnel distrait en bar</p>
                        <p className="text-xs text-muted-foreground">3 signalements — brief équipe</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                      <span className="text-lg leading-none">🧹</span>
                      <div>
                        <p className="text-sm font-medium">Toilettes à surveiller</p>
                        <p className="text-xs text-muted-foreground">2 signalements — passage 14h</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Petite badge flottante */}
              <div className="fp-float-slow absolute -right-3 -top-3 rounded-2xl border border-border bg-background px-3 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <BellRing className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alerte</p>
                    <p className="text-xs font-semibold">Nouveau signalement</p>
                  </div>
                </div>
              </div>

              <div className="fp-float-slow absolute -bottom-4 -left-3 rounded-2xl border border-border bg-background px-3 py-2 shadow-lg" style={{ animationDelay: "-3s" }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Trophy className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Top employé</p>
                    <p className="text-xs font-semibold">Léa — 4,9 ★</p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 3. Bandeau confiance
// ============================================================

function TrustBar() {
  return (
    <section className="border-y border-border/60 bg-muted/30" aria-label="Ils nous font confiance">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-center text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Ils nous font confiance
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-6 grid grid-cols-2 items-center gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {TRUST_LOGOS.map((nom) => (
              <div
                key={nom}
                className="flex items-center justify-center gap-2 opacity-70 transition-opacity hover:opacity-100"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {nom.charAt(0)}
                </span>
                <span className="text-sm font-semibold tracking-tight text-muted-foreground">
                  {nom}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 4. Section problème (3 cards)
// ============================================================

function ProblemSection() {
  return (
    <section id="probleme" className="scroll-mt-20" aria-labelledby="probleme-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4 border-rose-200 text-rose-700 dark:border-rose-900/60 dark:text-rose-400">
            Vous reconnaissez-vous ?
          </Badge>
          <h2 id="probleme-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Le client insatisfait ne dit rien. Il part.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Sans retour en temps réel, vous pilotez à l'aveugle. Voici ce que vivent chaque jour les commerces sans FeedbackPro.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PROBLEM_CARDS.map((c, i) => (
            <Reveal key={c.titre} delay={i * 100}>
              <article
                className={`group h-full rounded-3xl border p-6 shadow-sm ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${c.bg} ${c.ring}`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-3xl shadow-sm">
                  {c.emoji}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{c.titre}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.texte}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 5. Section solution (4 étapes horizontales avec flèches)
// ============================================================

function SolutionSection() {
  return (
    <section id="solution" className="scroll-mt-20 bg-muted/30" aria-labelledby="solution-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge className="mb-4 bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            La solution
          </Badge>
          <h2 id="solution-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            FeedbackPro : Le Client Mystère 2.0
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            4 étapes pour transformer chaque client en auditeur qualité — et chaque matin en plan d'action concret.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.titre} delay={i * 120}>
              <div className="relative flex h-full flex-col items-start rounded-3xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                    {s.emoji}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{s.titre}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.texte}</p>

                {/* Flèche entre cartes (desktop) */}
                {i < STEPS.length - 1 && (
                  <div className="absolute -right-4 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-sm md:flex" aria-hidden>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        {/* Flèche explicite entre cartes (mobile) */}
        <div className="mt-6 flex justify-center md:hidden">
          <ArrowDown className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 6. Section comparaison (tableau)
// ============================================================

function ComparisonSection() {
  return (
    <section id="comparaison" className="scroll-mt-20" aria-labelledby="comparaison-title">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Comparatif
          </Badge>
          <h2 id="comparaison-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Client Mystère traditionnel <span className="text-muted-foreground">vs</span> FeedbackPro
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Même objectif (mesurer votre qualité), mais 10× moins cher, 30× plus rapide et 100× plus actionnable.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-12 overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
            {/* En-tête tableau */}
            <div className="grid grid-cols-3 border-b border-border bg-muted/40">
              <div className="px-4 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
                Critère
              </div>
              <div className="px-4 py-4 text-sm font-semibold sm:px-6">
                Client Mystère <span className="hidden sm:inline">traditionnel</span>
              </div>
              <div className="relative px-4 py-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400 sm:px-6">
                <span className="flex items-center gap-2">
                  FeedbackPro
                  <Badge className="bg-emerald-500 text-white">✅ 10× moins cher</Badge>
                </span>
              </div>
            </div>

            {/* Lignes */}
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.critere}
                className={`grid grid-cols-3 items-center ${i % 2 === 1 ? "bg-muted/20" : ""}`}
              >
                <div className="px-4 py-4 text-sm font-medium sm:px-6">{row.critere}</div>
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-6">
                  <X className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                  <span>{row.traditionnel}</span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-4 text-sm font-medium sm:px-6 ${i % 2 === 1 ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "bg-emerald-50/40 dark:bg-emerald-950/10"}`}>
                  <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span className="text-foreground">{row.feedbackpro}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 7. 7 problèmes résolus (grille 2 col)
// ============================================================

function ProblemsResolvedSection() {
  return (
    <section id="problemes-resolus" className="scroll-mt-20 bg-muted/30" aria-labelledby="problemes-resolus-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge className="mb-4 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            Couverture exhaustive
          </Badge>
          <h2 id="problemes-resolus-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            7 problèmes terrain. 7 solutions FeedbackPro.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Chaque problème récurrent identifié sur le terrain a sa solution intégrée, sans configuration supplémentaire.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {PROBLEMES_RESOLUS.map((p, i) => (
            <Reveal key={p.titre} delay={(i % 2) * 80}>
              <article className="group flex h-full items-start gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                  {p.emoji}
                </span>
                <div>
                  <h3 className="text-base font-semibold">{p.titre}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{p.texte}</p>
                </div>
              </article>
            </Reveal>
          ))}

          {/* Carte bonus 8e (CTA) pour équilibrer la grille */}
          <Reveal delay={80}>
            <article className="flex h-full items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-emerald-500/5 p-5 shadow-sm">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Zap className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-base font-semibold">Et bien plus encore</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Tags contextuels par zone, exports, API, supports physiques livrés…
                </p>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 8. Fonctionnalités (grille 3x2)
// ============================================================

function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="scroll-mt-20" aria-labelledby="features-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Fonctionnalités
          </Badge>
          <h2 id="features-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Tout pour piloter votre qualité, sans effort
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            6 modules qui couvrent l'ensemble du cycle : collecte, analyse, alerte, pilotage, formation, déploiement terrain.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.titre} delay={(i % 3) * 100}>
              <article className="group flex h-full flex-col rounded-3xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <f.icone className="h-6 w-6" />
                  </span>
                  <span className="text-2xl opacity-70 transition-transform group-hover:scale-110">{f.emoji}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.texte}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 9. Cas d'usage (tabs)
// ============================================================

function UseCasesSection() {
  return (
    <section id="cas-usage" className="scroll-mt-20 bg-muted/30" aria-labelledby="cas-usage-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge className="mb-4 bg-primary/10 text-primary">Cas d'usage</Badge>
          <h2 id="cas-usage-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Pensé pour votre secteur
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Tags contextuels et zones pré-configurées pour chaque métier. Déployez en quelques minutes.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Tabs defaultValue="hotellerie" className="mt-10">
            <TabsList
              className="flex h-auto w-full flex-nowrap gap-1 overflow-x-auto rounded-2xl bg-background p-1.5 no-scrollbar"
              aria-label="Secteurs d'activité"
            >
              {USE_CASES.map((uc) => (
                <TabsTrigger
                  key={uc.id}
                  value={uc.id}
                  className="flex-1 shrink-0 rounded-xl px-4 py-2 text-sm"
                >
                  <span className="mr-1.5">{uc.emoji}</span>
                  <span className="hidden sm:inline">{uc.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {USE_CASES.map((uc) => (
              <TabsContent key={uc.id} value={uc.id} className="mt-6">
                <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <uc.icone className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold">
                        {uc.emoji} {uc.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">4 points clés couverts par FeedbackPro</p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {uc.points.map((pt) => (
                      <div
                        key={pt.titre}
                        className="flex items-start gap-3 rounded-2xl bg-muted/40 p-4"
                      >
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        <div>
                          <p className="text-sm font-semibold">{pt.titre}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{pt.texte}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 10. Témoignages (3 cards)
// ============================================================

function TestimonialsSection() {
  return (
    <section id="temoignages" className="scroll-mt-20" aria-labelledby="temoignages-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Témoignages
          </Badge>
          <h2 id="temoignages-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ils ont transformé leur qualité
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            127+ établissements utilisent FeedbackPro au quotidien. Voici ce qu'ils en disent.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.nom} delay={i * 100}>
              <article className="flex h-full flex-col rounded-3xl border border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center justify-between">
                  <Etoiles note={t.note} />
                  <Quote className="h-6 w-6 text-primary/30" aria-hidden />
                </div>
                <blockquote className="mt-4 flex-1">
                  <p className="text-sm italic leading-relaxed text-foreground">« {t.citation} »</p>
                </blockquote>
                <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${t.couleur}`}>
                    {t.initiales}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{t.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.poste} — {t.etablissement}
                    </p>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 11. Tarifs (3 plans + toggle mensuel/annuel)
// ============================================================

function PricingSection({ onSignup }: { onSignup: () => void }) {
  const [annuel, setAnnuel] = useState(true)
  const rabais = 0.2

  return (
    <section id="tarifs" className="scroll-mt-20 bg-muted/30" aria-labelledby="tarifs-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge className="mb-4 bg-primary/10 text-primary">Tarifs</Badge>
          <h2 id="tarifs-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Un prix adapté à chaque établissement
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Sans engagement. Annulation en 1 clic. 14 jours d'essai gratuit, sans carte bancaire.
          </p>
        </Reveal>

        {/* Toggle mensuel/annuel */}
        <Reveal delay={80}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annuel ? "text-foreground" : "text-muted-foreground"}`}>
              Mensuel
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={annuel}
              aria-label="Basculer en facturation annuelle"
              onClick={() => setAnnuel((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors ${annuel ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  annuel ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${annuel ? "text-foreground" : "text-muted-foreground"}`}>
              Annuel
            </span>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">-20 %</Badge>
          </div>
        </Reveal>

        {/* Plans */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PRICING.map((plan, i) => {
            const prix = annuel
              ? Math.round(plan.prixMensuel * (1 - rabais))
              : plan.prixMensuel
            return (
              <Reveal key={plan.id} delay={i * 120}>
                <article
                  className={`relative flex h-full flex-col rounded-3xl border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-8 ${
                    plan.populaire
                      ? "border-emerald-500 ring-2 ring-emerald-500/40 lg:scale-105"
                      : "border-border/80"
                  }`}
                >
                  {plan.populaire && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 px-3 py-1 text-white shadow-md">
                      <Trophy className="h-3.5 w-3.5" />
                      Populaire
                    </Badge>
                  )}

                  <h3 className="text-lg font-bold">{plan.nom}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-4xl font-extrabold tracking-tight">{prix} €</span>
                    <span className="mb-1 text-sm text-muted-foreground">/ mois HT</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {annuel ? `Facturé ${prix * 12} € / an` : "Facturé mensuellement"}
                  </p>

                  <Button
                    className="mt-6 w-full"
                    variant={plan.populaire ? "default" : "outline"}
                    onClick={onSignup}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <ul className="mt-6 space-y-3 border-t border-border/60 pt-6">
                    {plan.features.map((f) => (
                      <li key={f.texte} className="flex items-start gap-2.5 text-sm">
                        {f.inclus ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                        )}
                        <span className={f.inclus ? "text-foreground" : "text-muted-foreground/70 line-through"}>
                          {f.texte}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            )
          })}
        </div>

        <Reveal delay={120}>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Besoin d'une solution sur-mesure pour un grand groupe ?{" "}
            <button onClick={onSignup} className="font-medium text-primary underline-offset-4 hover:underline">
              Parlons-en →
            </button>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 12. FAQ (accordion 8 questions)
// ============================================================

function FAQSection() {
  return (
    <section id="faq" className="scroll-mt-20" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="text-center">
          <Badge variant="outline" className="mb-4">FAQ</Badge>
          <h2 id="faq-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Questions fréquentes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Tout ce que vous devez savoir avant de vous lancer.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Accordion type="single" collapsible className="mt-10 w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="rounded-2xl border border-border/80 bg-card px-5 shadow-sm [&:not(:last-child)]:mb-3">
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.r}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 13. CTA final (bandeau bleu dégradé)
// ============================================================

function FinalCTA({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-labelledby="cta-title">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 px-6 py-14 text-center shadow-xl sm:px-12 sm:py-20">
          {/* Décor */}
          <div className="pointer-events-none absolute inset-0">
            <div className="fp-blob absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="fp-blob absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-emerald-300/20 blur-2xl" style={{ animationDelay: "-8s" }} />
          </div>

          <div className="relative">
            <h2 id="cta-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Prêt à transformer votre qualité ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-blue-100 sm:text-lg">
              Rejoignez les 127+ établissements qui pilotent leur qualité en temps réel. Premier rapport dès demain matin.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4">
              <Button
                size="lg"
                onClick={onSignup}
                className="h-12 bg-white px-8 text-base text-blue-700 shadow-lg hover:bg-blue-50"
              >
                Commencer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="flex flex-col items-center gap-2 text-sm text-blue-100 sm:flex-row sm:gap-6">
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> 14 jours d'essai
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Sans CB
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Annulation en 1 clic
                </span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

// ============================================================
// 14. Footer (4 colonnes)
// ============================================================

function SiteFooter({ onLogin }: { onLogin: () => void }) {
  const annee = new Date().getFullYear()
  return (
    <footer className="border-t border-border/60 bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Colonne 1 : FeedbackPro */}
          <div className="col-span-2 md:col-span-1">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
              className="flex items-center gap-2 font-bold"
              aria-label="Accueil FeedbackPro"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <QrCode className="h-4 w-4" />
              </span>
              <span>FeedbackPro</span>
            </a>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Le Client Mystère 2.0 : chaque client devient auditeur qualité, chaque matin devient plan d'action.
            </p>
            <button
              onClick={onLogin}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Se connecter
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Colonne 2 : Produit */}
          <nav aria-label="Produit">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Produit</h3>
            <ul className="mt-4 space-y-2.5">
              <li><button onClick={() => allerVers("fonctionnalites")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Fonctionnalités</button></li>
              <li><button onClick={() => allerVers("solution")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Comment ça marche</button></li>
              <li><button onClick={() => allerVers("cas-usage")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Cas d'usage</button></li>
              <li><button onClick={() => allerVers("tarifs")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Tarifs</button></li>
              <li><button onClick={() => allerVers("comparaison")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Comparatif</button></li>
            </ul>
          </nav>

          {/* Colonne 3 : Ressources */}
          <nav aria-label="Ressources">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ressources</h3>
            <ul className="mt-4 space-y-2.5">
              <li><button onClick={() => allerVers("faq")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">FAQ</button></li>
              <li><button onClick={() => allerVers("temoignages")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Témoignages</button></li>
              <li><a href="mailto:support@feedbackpro.fr" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Support</a></li>
              <li><a href="mailto:contact@feedbackpro.fr" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Contact</a></li>
            </ul>
          </nav>

          {/* Colonne 4 : Légal */}
          <nav aria-label="Légal">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Légal</h3>
            <ul className="mt-4 space-y-2.5">
              <li><a href="/mentions-legales" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Mentions légales</a></li>
              <li><a href="/cgu" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Conditions générales</a></li>
              <li><a href="/confidentialite" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Confidentialité</a></li>
              <li><a href="/cookies" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Cookies</a></li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © FeedbackPro {annee} — Tous droits réservés.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Hébergement européen · Conforme RGPD
          </div>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// Vue Landing complète
// ============================================================

export function LandingView({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader onLogin={onLogin} onSignup={onSignup} />
      <div className="flex-1">
        <Hero onSignup={onSignup} />
        <TrustBar />
        <ProblemSection />
        <SolutionSection />
        <ComparisonSection />
        <ProblemsResolvedSection />
        <FeaturesSection />
        <UseCasesSection />
        <TestimonialsSection />
        <PricingSection onSignup={onSignup} />
        <FAQSection />
        <FinalCTA onSignup={onSignup} />
      </div>
      <SiteFooter onLogin={onLogin} />
    </div>
  )
}
