"use client"

// ============================================================
// FeedbackPro — Landing SaaS Premium (refonte palette dashboard)
// ------------------------------------------------------------
// 13 sections. Palette alignée sur les dashboards :
//   • Indigo   #5257C9 (primary, boutons, accents)
//   • Green    #4CC96B (positif, succès)
//   • Yellow   #E8B54D (highlights, étoiles)
//   • Pink     #E0447E (alertes, problèmes)
//   • Page bg  #E9E9EF + cards #FFFFFF rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.06)]
//   • Titres   #1E1E2E · Secondaire #9A9AAE
// Toutes les actions passent par onLogin / onSignup (routage Zustand
// préservé). Animations CSS pur (keyframes globals.css) + hook
// useReveal (IntersectionObserver, pas de framer).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
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
  Check,
  ChevronRight,
  HeartPulse,
  Hotel,
  Landmark,
  Menu,
  MapPin,
  Package,
  Play,
  QrCode,
  Quote,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  TrendingUp,
  UtensilsCrossed,
  Users,
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
    if (observerRef.current) {
      observerRef.current.observe(node)
    } else {
      requestAnimationFrame(() => observerRef.current?.observe(node))
    }
  }, [])
}

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
// Données statiques (textes 100 % français — conservés à l'identique)
// ============================================================

const NAV_LINKS = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/cas-usage", label: "Cas d'usage" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/faq", label: "FAQ" },
] as const

const TRUST_LOGOS = [
  "Bistrot Marais",
  "Hôtel Royal",
  "Maison Verte",
  "Café Lyon",
  "Garage Pro",
  "Spa Zen",
  "Le Comptoir",
  "Boulangerie Paul",
] as const

const PROBLEM_CARDS: {
  emoji: string
  titre: string
  texte: string
  couleur: "pink" | "indigo" | "yellow"
}[] = [
  {
    emoji: "🤐",
    titre: "Vos clients mécontents partent sans rien dire",
    texte:
      "96 % des clients insatisfaits ne se plaignent jamais. Ils disparaissent et vous ne le savez que sur un avis Google public, des semaines plus tard.",
    couleur: "pink",
  },
  {
    emoji: "💥",
    titre: "Un seul avis négatif détruit votre réputation",
    texte:
      "Sur Google, une note de 2 étoiles affichée pendant 3 mois coûte en moyenne 30 % de réservations. Et vous ne pouvez rien corriger a posteriori.",
    couleur: "indigo",
  },
  {
    emoji: "🎲",
    titre: "Vous décidez à l'instinct, pas aux données",
    texte:
      "Pas de retour client en temps réel = impossible de savoir quel employé former, quel créneau renforcer, quel plat revoir. Vous pilotez à l'aveugle.",
    couleur: "yellow",
  },
]

const STEPS: { emoji: string; icone: LucideIcon; image: string; titre: string; texte: string }[] = [
  {
    emoji: "📱",
    icone: QrCode,
    image: "/solution/step1-qr.png",
    titre: "QR Code par zone",
    texte:
      "Un QR code dédié à chaque point de contact (accueil, salle, terrasse, toilettes…). Le client le scanne en 2 secondes.",
  },
  {
    emoji: "⭐",
    icone: ScanLine,
    image: "/solution/step2-scan.png",
    titre: "Scan client en 10 s",
    texte:
      "Le client note de 1 à 5 étoiles et choisit des tags en un clic. Aucune inscription, aucune app à installer.",
  },
  {
    emoji: "🧠",
    icone: Bot,
    image: "/solution/step3-ia.png",
    titre: "L'IA analyse tout",
    texte:
      "Notre Coach IA consolide les retours, détecte les patterns et identifie les priorités du jour automatiquement.",
  },
  {
    emoji: "📊",
    icone: BarChart3,
    image: "/solution/step4-rapport.png",
    titre: "Rapport quotidien",
    texte:
      "Chaque matin, vous recevez un rapport d'audit avec votre score global et vos 3 priorités actionnables.",
  },
]

const COMPARISON_ROWS: { critere: string; traditionnel: string; feedbackpro: string }[] = [
  { critere: "Prix", traditionnel: "500 – 1 500 € par visite", feedbackpro: "29 € / mois" },
  { critere: "Fréquence", traditionnel: "1 visite par mois", feedbackpro: "Audit quotidien automatique" },
  { critere: "Couverture", traditionnel: "1 client mystère fictif", feedbackpro: "Tous vos vrais clients" },
  { critere: "Réactivité", traditionnel: "Rapport sous 15 jours", feedbackpro: "Alerte WhatsApp en temps réel" },
  { critere: "Actionnable", traditionnel: "Synthèse qualitative vague", feedbackpro: "Top 3 priorités générées par IA" },
  { critere: "ROI", traditionnel: "6 à 12 mois", feedbackpro: "Moins de 1 mois" },
]

// Palette cyclée pour les 6 features (indigo / green / yellow / pink / indigo / green)
const FEATURES: {
  icone: LucideIcon
  emoji: string
  titre: string
  texte: string
  couleur: "indigo" | "green" | "yellow" | "pink"
  grand?: boolean
}[] = [
  {
    icone: Bot,
    emoji: "🤖",
    titre: "Coach IA quotidien",
    texte:
      "Chaque matin, l'IA analyse les retours de la veille et vous livre un rapport d'audit complet avec des recommandations concrètes et vos 3 priorités actionnables du jour.",
    couleur: "indigo",
    grand: true,
  },
  {
    icone: MapPin,
    emoji: "📍",
    titre: "QR Zones intelligentes",
    texte:
      "Une zone par point de contact (accueil, salle, terrasse, toilettes…) avec son QR dédié et des tags contextuels.",
    couleur: "green",
  },
  {
    icone: Trophy,
    emoji: "🏆",
    titre: "Leaderboard équipe",
    texte:
      "Classez vos employés, valorisez les meilleurs et repérez objectivement les besoins de formation.",
    couleur: "yellow",
  },
  {
    icone: BellRing,
    emoji: "🔔",
    titre: "Alertes temps réel",
    texte:
      "Un client signale un problème ? Vous êtes alerté sur WhatsApp en quelques secondes pour corriger avant qu'il parte.",
    couleur: "pink",
  },
  {
    icone: BarChart3,
    emoji: "📊",
    titre: "Statistiques avancées",
    texte:
      "Suivez vos scores par zone, par jour et par heure. Heatmap, tendances, exports CSV / PDF.",
    couleur: "indigo",
  },
  {
    icone: Package,
    emoji: "📦",
    titre: "Supports physiques livrés",
    texte:
      "Autocollants, chevalets et affiches haute qualité commandés en 1 clic, livrés prêts à poser sur le terrain.",
    couleur: "green",
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
  couleur: "indigo" | "green" | "pink"
}[] = [
  {
    nom: "Sophie Marchand",
    poste: "Gérante",
    etablissement: "Bistrot Le Marais, Paris",
    citation:
      "En 3 semaines, on a corrigé un problème d'attente au déjeuner qu'on traînait depuis 2 ans. Le rapport du matin m'a permis de cibler exactement qui former.",
    note: 5,
    initiales: "SM",
    couleur: "indigo",
  },
  {
    nom: "Karim Benali",
    poste: "Directeur",
    etablissement: "Hôtel Royal Lyon, 4 ★",
    citation:
      "On a divisé par 4 les avis négatifs Google en 2 mois. Les alertes WhatsApp m'ont sauvé 3 clients qui allaient partir. ROI atteint en 3 semaines.",
    note: 5,
    initiales: "KB",
    couleur: "green",
  },
  {
    nom: "Émilie Faure",
    poste: "Responsable qualité",
    etablissement: "Maison Vert (8 boutiques)",
    citation:
      "On pilotait 8 boutiques à l'instinct. Aujourd'hui chaque manager reçoit son rapport matinal. Le leaderboard a complètement changé la dynamique d'équipe.",
    note: 5,
    initiales: "EF",
    couleur: "pink",
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

// Map couleur → classes Tailwind (icône + halo)
const COULEUR_CLASSES: Record<
  "indigo" | "green" | "yellow" | "pink",
  { bg: string; text: string; halo: string; ring: string }
> = {
  indigo: {
    bg: "bg-[#5257C9]",
    text: "text-[#5257C9]",
    halo: "bg-[#5257C9]/10",
    ring: "ring-[#5257C9]/20",
  },
  green: {
    bg: "bg-[#4CC96B]",
    text: "text-[#4CC96B]",
    halo: "bg-[#4CC96B]/10",
    ring: "ring-[#4CC96B]/20",
  },
  yellow: {
    bg: "bg-[#E8B54D]",
    text: "text-[#E8B54D]",
    halo: "bg-[#E8B54D]/15",
    ring: "ring-[#E8B54D]/25",
  },
  pink: {
    bg: "bg-[#E0447E]",
    text: "text-[#E0447E]",
    halo: "bg-[#E0447E]/10",
    ring: "ring-[#E0447E]/20",
  },
}

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
          className={`h-4 w-4 ${i < note ? "fill-[#E8B54D] text-[#E8B54D]" : "fill-gray-200 text-gray-300"}`}
          aria-hidden
        />
      ))}
    </div>
  )
}

// ============================================================
// Particules flottantes (hero) — générées 1 seule fois (useMemo)
// ============================================================

type Particle = {
  id: number
  left: number
  size: number
  duration: number
  delay: number
  color: string
}

// Particules claires/blanches (visibles sur fond indigo→vert)
const PARTICULES_COULEURS = [
  "rgba(255, 255, 255, 0.5)",
  "rgba(232, 181, 77, 0.45)", // jaune
  "rgba(255, 255, 255, 0.35)",
  "rgba(76, 201, 107, 0.4)", // vert
]

function useParticules(count = 40): Particle[] {
  return useMemo(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return []
    }
    return Array.from({ length: count }, (_, i) => {
      const duree = 20 + Math.random() * 20 // 20s → 40s
      return {
        id: i,
        left: Math.random() * 100,
        size: 2 + Math.random() * 4, // 2px → 6px
        duration: duree,
        delay: -Math.random() * duree,
        color: PARTICULES_COULEURS[i % PARTICULES_COULEURS.length],
      }
    })
  }, [count])
}

// ============================================================
// 1. Nav glassmorphism (fixed)
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
      className={`fixed top-0 z-50 w-full transition-all duration-500 ${
        scrolled
          ? "border-b border-[#E9E9EF] bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
          : "border-b border-transparent bg-transparent"
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
          className="flex items-center gap-2 font-bold transition-opacity hover:opacity-80"
          aria-label="Accueil FeedbackPro"
        >
          <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-12 w-auto" />
        </a>

        {/* Liens desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
          {NAV_LINKS.map((lien) => (
            <a
              key={lien.href}
              href={lien.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[#9A9AAE] transition-all duration-200 hover:bg-[#E9E9EF] hover:text-[#1E1E2E]"
            >
              {lien.label}
            </a>
          ))}
        </nav>

        {/* CTA desktop */}
        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogin}
            className="text-[#9A9AAE] hover:bg-[#E9E9EF] hover:text-[#1E1E2E]"
          >
            Se connecter
          </Button>
          <Button
            size="sm"
            onClick={onSignup}
            className="relative h-9 overflow-hidden border-0 bg-[#5257C9] text-white shadow-lg shadow-[#5257C9]/25 transition-all duration-300 hover:bg-[#4549b8] hover:shadow-xl hover:shadow-[#5257C9]/30 before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:transition-transform before:duration-700 before:content-[''] hover:before:translate-x-full"
          >
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
              className="md:hidden text-[#1E1E2E] hover:bg-[#E9E9EF]"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[88%] max-w-sm border-l border-[#E9E9EF] bg-white/95 text-[#1E1E2E] backdrop-blur-xl"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-[#1E1E2E]">
                <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-10 w-auto" />
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4" aria-label="Navigation mobile">
              {NAV_LINKS.map((lien) => (
                <a
                  key={lien.href}
                  href={lien.href}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-base font-medium text-[#1E1E2E] transition-all duration-200 hover:bg-[#E9E9EF]"
                >
                  {lien.label}
                  <ChevronRight className="h-4 w-4 text-[#9A9AAE]" />
                </a>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2 p-4">
              <Button
                className="w-full border-0 bg-[#5257C9] text-white shadow-lg shadow-[#5257C9]/25 hover:bg-[#4549b8]"
                onClick={() => {
                  setOpen(false)
                  onSignup()
                }}
              >
                Commencer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="w-full border-[#E9E9EF] bg-white text-[#1E1E2E] hover:bg-[#E9E9EF] hover:text-[#1E1E2E]"
                onClick={() => {
                  setOpen(false)
                  onLogin()
                }}
              >
                Se connecter
              </Button>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  className="w-full text-[#9A9AAE] hover:bg-[#E9E9EF] hover:text-[#1E1E2E]"
                  onClick={() => allerVers("solution")}
                >
                  <Play className="h-4 w-4" />
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
// 2. Hero (pleine hauteur, gradient indigo → vert + mockup glass)
// ============================================================

function Hero({ onSignup }: { onSignup: () => void }) {
  const particules = useParticules(40)

  return (
    <section
      className="relative flex min-h-screen items-center overflow-hidden pt-28 pb-20"
      aria-labelledby="hero-title"
    >
      {/* Fond gradient indigo → vert */}
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-br from-[#3A3F9E] via-[#5257C9] to-[#4CC96B]"
        aria-hidden
      />

      {/* Blobs décoratifs animés (pink / yellow / indigo clair) */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="fp-blob absolute -left-20 top-10 h-72 w-72 rounded-full bg-[#E0447E]/30 blur-3xl"
          style={{ animationDelay: "-2s" }}
        />
        <div
          className="fp-blob absolute right-0 top-1/4 h-96 w-96 rounded-full bg-[#E8B54D]/25 blur-3xl"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="fp-blob absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#4CC96B]/30 blur-3xl"
          style={{ animationDelay: "-10s" }}
        />
        <div
          className="fp-blob absolute right-1/4 bottom-10 h-72 w-72 rounded-full bg-white/15 blur-3xl"
          style={{ animationDelay: "-4s" }}
        />
      </div>

      {/* Particules flottantes */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        {particules.map((p) => (
          <span
            key={p.id}
            className="fp-particle absolute bottom-0 rounded-full"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size * 2.5}px ${p.color}`,
              ["--fp-particle-duration" as string]: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Subtle grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
        aria-hidden
      />

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 md:py-24 lg:grid-cols-5 lg:gap-8 lg:px-8">
        {/* Colonne gauche (60%) */}
        <div className="lg:col-span-3">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#4CC96B] shadow-[0_0_8px_rgba(76,201,107,0.9)]" />
              <Sparkles className="h-3.5 w-3.5 text-[#E8B54D]" aria-hidden />
              Nouveau — Client Mystère 2.0 par IA
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1
              id="hero-title"
              className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[4.25rem]"
              style={{ letterSpacing: "-0.035em" }}
            >
              Transformez vos clients en{" "}
              <span className="block bg-gradient-to-r from-[#E8B54D] via-[#FCD78A] to-[#E8B54D] bg-clip-text text-transparent sm:inline">
                auditeurs qualité
              </span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              FeedbackPro collecte les retours de vos clients en temps réel via QR code, les
              analyse par IA et vous livre chaque matin un rapport d'audit avec vos 3 priorités
              du jour.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                size="lg"
                onClick={onSignup}
                className="relative h-14 overflow-hidden border-0 bg-gradient-to-r from-[#5257C9] to-[#4549b8] px-7 text-base text-white shadow-xl shadow-black/30 ring-1 ring-white/30 transition-all duration-300 hover:shadow-2xl hover:shadow-black/40 before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent before:transition-transform before:duration-700 before:content-[''] hover:before:translate-x-full"
              >
                Commencer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                onClick={() => allerVers("solution")}
                className="h-14 border border-white/30 bg-white/10 px-7 text-base text-white shadow-md backdrop-blur-md transition-all duration-300 hover:border-white/50 hover:bg-white/20"
              >
                <Play className="h-4 w-4" />
                Voir la démo
              </Button>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex items-center gap-2">
                <Etoiles note={5} />
                <span className="text-sm font-semibold text-white">4,9/5</span>
              </div>
              <div className="hidden h-5 w-px bg-white/30 sm:block" aria-hidden />
              <div className="flex items-center gap-2 text-sm text-white/85">
                <Users className="h-4 w-4 text-[#E8B54D]" aria-hidden />
                <span>
                  <strong className="text-white">127+</strong> établissements conquis
                </span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Colonne droite (40%) — mockup glassmorphism flottant */}
        <div className="lg:col-span-2">
          <Reveal delay={200}>
            <div className="relative mx-auto max-w-md" style={{ perspective: "1200px" }}>
              {/* Halo derrière */}
              <div
                className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-gradient-to-br from-[#E8B54D]/30 via-white/15 to-[#4CC96B]/25 blur-3xl"
                aria-hidden
              />

              {/* Carte rapport — glassmorphism */}
              <div className="fp-float-mockup relative rounded-3xl border border-white/40 bg-white/15 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <BarChart3 className="h-4 w-4 text-[#E8B54D]" />
                    Rapport du jour
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4CC96B]/20 px-2.5 py-1 text-xs font-medium text-[#4CC96B]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4CC96B] shadow-[0_0_8px_rgba(76,201,107,0.9)]" />
                    Live
                  </span>
                </div>

                {/* Score global */}
                <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#5257C9] to-[#4549b8] p-5 text-white shadow-lg shadow-[#5257C9]/40">
                  <p className="text-xs uppercase tracking-widest opacity-80">Score qualité global</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-5xl font-extrabold leading-none">82</span>
                    <span className="mb-1 text-lg opacity-80">/100</span>
                  </div>
                  {/* Mini graphique */}
                  <div className="mt-4 flex h-12 items-end gap-1.5">
                    {[40, 55, 48, 70, 62, 80, 75, 88, 72, 82].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-white/30"
                        style={{ height: `${h}%` }}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs">
                    <TrendingUp className="h-3.5 w-3.5 text-[#4CC96B]" />
                    +6 points vs hier
                  </div>
                </div>

                {/* Priorités du jour */}
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                    Priorités du jour
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    <li className="flex items-start gap-3 rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/15">
                      <span className="text-lg leading-none">⏳</span>
                      <div>
                        <p className="text-sm font-medium text-white">Attente salle &gt; 12 min</p>
                        <p className="text-xs text-white/70">Pic 12h-13h — renforcer 1 serveur</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/15">
                      <span className="text-lg leading-none">💬</span>
                      <div>
                        <p className="text-sm font-medium text-white">Personnel distrait en bar</p>
                        <p className="text-xs text-white/70">3 signalements — brief équipe</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/15">
                      <span className="text-lg leading-none">🧹</span>
                      <div>
                        <p className="text-sm font-medium text-white">Toilettes à surveiller</p>
                        <p className="text-xs text-white/70">2 signalements — passage 14h</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Badges flottants autour du mockup */}
              <div
                className="absolute -right-3 -top-3 rounded-2xl border border-white/40 bg-white/90 px-3 py-2 shadow-xl backdrop-blur-md"
                style={{ animation: "fp-float-slow 7s ease-in-out infinite" }}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E0447E] text-white shadow-lg shadow-[#E0447E]/30">
                    <BellRing className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#9A9AAE]">Alerte</p>
                    <p className="text-xs font-semibold text-[#1E1E2E]">Nouveau signalement</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute -bottom-4 -left-3 rounded-2xl border border-white/40 bg-white/90 px-3 py-2 shadow-xl backdrop-blur-md"
                style={{ animation: "fp-float-slow 7s ease-in-out infinite", animationDelay: "-3s" }}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#4549b8] text-white shadow-lg shadow-[#5257C9]/30">
                    <Trophy className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#9A9AAE]">Top employé</p>
                    <p className="text-xs font-semibold text-[#1E1E2E]">Léa — 4,9 ★</p>
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
// 3. Bandeau logos (marquee scroll infini)
// ============================================================

function TrustBar() {
  const logos = [...TRUST_LOGOS, ...TRUST_LOGOS] // duplique pour scroll seamless
  return (
    <section className="relative border-b border-[#E9E9EF] bg-white py-12" aria-label="Ils nous font confiance">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-[#9A9AAE]">
            Ils nous font confiance
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="fp-marquee-pause relative mt-8 overflow-hidden">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent" aria-hidden />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent" aria-hidden />
            <div className="fp-marquee flex w-max items-center gap-12">
              {logos.map((nom, i) => (
                <div
                  key={`${nom}-${i}`}
                  className="flex shrink-0 items-center gap-2 opacity-70 transition-all duration-300 hover:opacity-100"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5257C9] text-sm font-bold text-white shadow-md shadow-[#5257C9]/20">
                    {nom.charAt(0)}
                  </span>
                  <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-[#9A9AAE]">
                    {nom}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 4. Section problème (3 cards, icon circles colorés)
// ============================================================

function ProblemSection() {
  return (
    <section id="probleme" className="relative scroll-mt-24 bg-[#E9E9EF]" aria-labelledby="probleme-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#E0447E]/10 px-3 py-1 text-xs font-medium text-[#E0447E]">
            Vous reconnaissez-vous ?
          </span>
          <h2
            id="probleme-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Le client insatisfait ne dit rien.{" "}
            <span className="bg-gradient-to-r from-[#E0447E] to-[#5257C9] bg-clip-text text-transparent">
              Il part.
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            Sans retour en temps réel, vous pilotez à l'aveugle. Voici ce que vivent chaque jour
            les commerces sans FeedbackPro.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PROBLEM_CARDS.map((c, i) => {
            const col = COULEUR_CLASSES[c.couleur]
            return (
              <Reveal key={c.titre} delay={i * 100}>
                <article className="group h-full rounded-2xl bg-white p-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.1)]">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${col.halo} text-3xl ring-1 ${col.ring}`}
                  >
                    {c.emoji}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#1E1E2E]">{c.titre}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9A9AAE]">{c.texte}</p>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 5. Section solution (4 étapes — ligne + numéros + images)
// ============================================================

function SolutionSection() {
  return (
    <section
      id="solution"
      className="relative scroll-mt-24 bg-white"
      aria-labelledby="solution-title"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#5257C9]/10 px-3 py-1 text-xs font-medium text-[#5257C9]">
            <Sparkles className="h-3.5 w-3.5" />
            La solution
          </span>
          <h2
            id="solution-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              Le Client Mystère 2.0
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            4 étapes pour transformer chaque client en auditeur qualité — et chaque matin en plan
            d'action concret.
          </p>
        </Reveal>

        {/* Grille avec ligne de connexion horizontale (desktop) */}
        <div className="relative mt-16 grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-4">
          {/* Ligne de connexion */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-[7.5rem] hidden h-0.5 bg-gradient-to-r from-[#5257C9] via-[#E8B54D] to-[#4CC96B] md:block"
            aria-hidden
          />

          {STEPS.map((s, i) => (
            <Reveal key={s.titre} delay={i * 120}>
              <div className="group relative flex h-full flex-col items-start overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.1)]">
                {/* Image illustrative */}
                <div className="relative w-full overflow-hidden rounded-t-2xl bg-[#E9E9EF]">
                  <img
                    src={s.image}
                    alt={s.titre}
                    className="h-36 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-40"
                    loading="lazy"
                    width={400}
                    height={180}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1E1E2E]/30 via-transparent to-transparent"
                    aria-hidden
                  />
                  {/* Numéro flottant sur l'image */}
                  <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#4549b8] text-sm font-bold text-white shadow-lg shadow-[#5257C9]/40 ring-4 ring-white/90">
                    {i + 1}
                  </span>
                </div>

                <div className="relative w-full p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5257C9]/10 text-[#5257C9]">
                      <s.icone className="h-4 w-4" />
                    </span>
                    <h3 className="text-base font-semibold text-[#1E1E2E]">{s.titre}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[#9A9AAE]">{s.texte}</p>
                </div>

                {/* Flèche entre cartes (desktop) */}
                {i < STEPS.length - 1 && (
                  <div
                    className="absolute -right-4 top-[7.5rem] z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9E9EF] bg-white shadow-lg transition-transform duration-300 group-hover:scale-110 md:flex"
                    aria-hidden
                  >
                    <ArrowRight className="h-4 w-4 text-[#5257C9]" />
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        {/* Flèche explicite entre cartes (mobile) */}
        <div className="mt-6 flex justify-center md:hidden">
          <ArrowDown className="h-5 w-5 text-[#9A9AAE]" aria-hidden />
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 6. Section comparaison (tableau en-tête indigo, lignes alternées)
// ============================================================

function ComparisonSection() {
  return (
    <section id="comparaison" className="relative scroll-mt-24 bg-[#E9E9EF]" aria-labelledby="comparaison-title">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#E8B54D]/15 px-3 py-1 text-xs font-medium text-[#B5841E]">
            Comparatif
          </span>
          <h2
            id="comparaison-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Traditionnel <span className="text-[#9A9AAE]">vs</span>{" "}
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              FeedbackPro
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            Même objectif (mesurer votre qualité), mais 10× moins cher, 30× plus rapide et 100×
            plus actionnable.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-12 overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
            {/* En-tête tableau — indigo */}
            <div className="grid grid-cols-3 bg-gradient-to-r from-[#5257C9] to-[#4549b8]">
              <div className="px-4 py-5 text-xs font-semibold uppercase tracking-widest text-white/80 sm:px-6">
                Critère
              </div>
              <div className="px-4 py-5 text-sm font-semibold text-white/90 sm:px-6">
                Client Mystère <span className="hidden sm:inline">traditionnel</span>
              </div>
              <div className="border-l border-white/20 px-4 py-5 text-sm font-semibold text-white sm:px-6">
                <span className="flex flex-wrap items-center gap-2">
                  FeedbackPro
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#4CC96B]/30 px-2 py-0.5 text-xs font-medium text-[#4CC96B]">
                    10× moins cher
                  </span>
                </span>
              </div>
            </div>

            {/* Lignes alternées */}
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.critere}
                className={`grid grid-cols-3 items-center transition-colors hover:bg-[#E9E9EF]/50 ${
                  i % 2 === 1 ? "bg-[#E9E9EF]/30" : "bg-white"
                }`}
              >
                <div className="px-4 py-4 text-sm font-medium text-[#1E1E2E] sm:px-6">
                  {row.critere}
                </div>
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#9A9AAE] sm:px-6">
                  <X className="h-4 w-4 shrink-0 text-[#E0447E]" aria-hidden />
                  <span>{row.traditionnel}</span>
                </div>
                <div className="flex items-center gap-2 border-l border-[#5257C9]/15 bg-[#5257C9]/[0.03] px-4 py-4 text-sm font-medium sm:px-6">
                  <Check className="h-4 w-4 shrink-0 text-[#4CC96B]" aria-hidden />
                  <span className="text-[#1E1E2E]">{row.feedbackpro}</span>
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
// 7. Fonctionnalités (6 cards, icônes colorées cyclées)
// ============================================================

function FeaturesSection() {
  return (
    <section
      id="fonctionnalites"
      className="relative scroll-mt-24 bg-white"
      aria-labelledby="features-title"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#5257C9]/10 px-3 py-1 text-xs font-medium text-[#5257C9]">
            Fonctionnalités
          </span>
          <h2
            id="features-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Tout pour piloter votre qualité,{" "}
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              sans effort
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            6 modules qui couvrent l'ensemble du cycle : collecte, analyse, alerte, pilotage,
            formation, déploiement terrain.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6 lg:auto-rows-[minmax(0,1fr)]">
          {FEATURES.map((f, i) => {
            const col = COULEUR_CLASSES[f.couleur]
            return (
              <Reveal
                key={f.titre}
                delay={(i % 3) * 100}
                className={f.grand ? "lg:col-span-4 lg:row-span-2" : "lg:col-span-2"}
              >
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.1)] sm:p-7">
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${col.bg} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}
                      style={{ boxShadow: `0 6px 20px rgba(0,0,0,0.12)` }}
                    >
                      <f.icone className="h-6 w-6" />
                    </span>
                    <span className="text-2xl opacity-70 transition-transform duration-300 group-hover:scale-110">
                      {f.emoji}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#1E1E2E]">{f.titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9A9AAE]">{f.texte}</p>

                  {/* Mini-illustration dans la grande card */}
                  {f.grand && (
                    <div className="mt-auto pt-6">
                      <div className="rounded-2xl border border-[#E9E9EF] bg-[#E9E9EF]/50 p-4">
                        <div className="flex items-center justify-between text-xs text-[#9A9AAE]">
                          <span>Évolution du score — 14 jours</span>
                          <span className="flex items-center gap-1 font-medium text-[#4CC96B]">
                            <TrendingUp className="h-3.5 w-3.5" /> +18 %
                          </span>
                        </div>
                        <div className="mt-3 flex h-20 items-end gap-1.5">
                          {[45, 52, 48, 60, 58, 68, 72, 65, 78, 82, 79, 85, 88, 91].map((h, idx) => (
                            <div
                              key={idx}
                              className="flex-1 rounded-t bg-gradient-to-t from-[#5257C9] to-[#4CC96B]"
                              style={{ height: `${h}%`, opacity: 0.45 + (idx / 14) * 0.55 }}
                              aria-hidden
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 8. Cas d'usage (5 tabs)
// ============================================================

function UseCasesSection() {
  return (
    <section id="cas-usage" className="relative scroll-mt-24 bg-[#E9E9EF]" aria-labelledby="cas-usage-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#4CC96B]/15 px-3 py-1 text-xs font-medium text-[#3AA652]">
            Cas d'usage
          </span>
          <h2
            id="cas-usage-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Pensé pour{" "}
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              votre secteur
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            Tags contextuels et zones pré-configurées pour chaque métier. Déployez en quelques
            minutes.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Tabs defaultValue="hotellerie" className="mt-10">
            <TabsList
              className="flex h-auto w-full flex-nowrap gap-1 overflow-x-auto rounded-2xl border border-[#E9E9EF] bg-white p-1.5 shadow-[0_8px_25px_rgba(0,0,0,0.04)] no-scrollbar"
              aria-label="Secteurs d'activité"
            >
              {USE_CASES.map((uc) => (
                <TabsTrigger
                  key={uc.id}
                  value={uc.id}
                  className="flex-1 shrink-0 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium text-[#9A9AAE] transition-all duration-300 hover:bg-[#E9E9EF] hover:text-[#1E1E2E] data-[state=active]:border-transparent data-[state=active]:bg-[#5257C9] data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-[#5257C9]/30"
                >
                  <span className="mr-1.5">{uc.emoji}</span>
                  <span className="hidden sm:inline">{uc.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {USE_CASES.map((uc) => (
              <TabsContent key={uc.id} value={uc.id} className="mt-6">
                <div className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#5257C9] to-[#4549b8] text-white shadow-lg shadow-[#5257C9]/25">
                      <uc.icone className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold text-[#1E1E2E]">
                        {uc.emoji} {uc.label}
                      </h3>
                      <p className="text-sm text-[#9A9AAE]">
                        4 points clés couverts par FeedbackPro
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {uc.points.map((pt) => (
                      <div
                        key={pt.titre}
                        className="flex items-start gap-3 rounded-xl border border-[#E9E9EF] bg-[#E9E9EF]/40 p-4 transition-all duration-300 hover:border-[#5257C9]/20 hover:bg-white hover:shadow-md"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4CC96B]/15">
                          <Check className="h-3.5 w-3.5 text-[#4CC96B]" aria-hidden />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[#1E1E2E]">{pt.titre}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-[#9A9AAE]">{pt.texte}</p>
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
// 9. Témoignages (3 cards, avatar + citation + étoiles)
// ============================================================

function TestimonialsSection() {
  return (
    <section
      id="temoignages"
      className="relative scroll-mt-24 bg-white"
      aria-labelledby="temoignages-title"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#E8B54D]/15 px-3 py-1 text-xs font-medium text-[#B5841E]">
            Témoignages
          </span>
          <h2
            id="temoignages-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Ils ont{" "}
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              transformé leur qualité
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            127+ établissements utilisent FeedbackPro au quotidien. Voici ce qu'ils en disent.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => {
            const col = COULEUR_CLASSES[t.couleur]
            return (
              <Reveal key={t.nom} delay={i * 100}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white p-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.1)]">
                  {/* Blob décoratif coin */}
                  <div
                    className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full ${col.halo} blur-2xl`}
                    aria-hidden
                  />
                  <div className="relative flex items-center justify-between">
                    <Etoiles note={t.note} />
                    <Quote className={`h-7 w-7 ${col.text} opacity-30`} aria-hidden />
                  </div>
                  <blockquote className="relative mt-4 flex-1">
                    <p className="text-sm italic leading-relaxed text-[#1E1E2E]">
                      « {t.citation} »
                    </p>
                  </blockquote>
                  <div className="relative mt-5 flex items-center gap-3 border-t border-[#E9E9EF] pt-5">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${
                        t.couleur === "indigo"
                          ? "from-[#5257C9] to-[#4549b8]"
                          : t.couleur === "green"
                            ? "from-[#4CC96B] to-[#3AA652]"
                            : "from-[#E0447E] to-[#B83264]"
                      } text-sm font-bold text-white shadow-md ring-2 ring-white`}
                    >
                      {t.initiales}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#1E1E2E]">{t.nom}</p>
                      <p className="text-xs text-[#9A9AAE]">
                        {t.poste} — {t.etablissement}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// 10. Tarifs (3 plans + toggle mensuel/annuel, plan milieu mis en avant)
// ============================================================

function PricingSection({ onSignup }: { onSignup: () => void }) {
  const [annuel, setAnnuel] = useState(true)
  const rabais = 0.2

  return (
    <section id="tarifs" className="relative scroll-mt-24 bg-[#E9E9EF]" aria-labelledby="tarifs-title">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#5257C9]/10 px-3 py-1 text-xs font-medium text-[#5257C9]">
            Tarifs
          </span>
          <h2
            id="tarifs-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Un prix adapté à{" "}
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              chaque établissement
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            Sans engagement. Annulation en 1 clic. 14 jours d'essai gratuit, sans carte bancaire.
          </p>
        </Reveal>

        {/* Toggle mensuel/annuel */}
        <Reveal delay={80}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className={`text-sm font-medium ${
                !annuel ? "text-[#1E1E2E]" : "text-[#9A9AAE]"
              }`}
            >
              Mensuel
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={annuel}
              aria-label="Basculer en facturation annuelle"
              onClick={() => setAnnuel((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition-colors duration-300 ${
                annuel ? "bg-[#5257C9] shadow-md shadow-[#5257C9]/30" : "bg-[#9A9AAE]/40"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${
                  annuel ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${
                annuel ? "text-[#1E1E2E]" : "text-[#9A9AAE]"
              }`}
            >
              Annuel
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#4CC96B]/15 px-2 py-0.5 text-xs font-medium text-[#3AA652]">
              -20 %
            </span>
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
                  className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white p-6 sm:p-8 ${
                    plan.populaire
                      ? "border-2 border-[#5257C9] shadow-[0_20px_50px_rgba(82,87,201,0.25)] lg:scale-105 lg:hover:-translate-y-1"
                      : "border border-[#E9E9EF] shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(0,0,0,0.1)]"
                  }`}
                >
                  {plan.populaire && (
                    <>
                      {/* Glow halo pour le plan populaire */}
                      <div
                        className="pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-gradient-to-br from-[#5257C9]/15 via-transparent to-[#4CC96B]/15 blur-xl"
                        aria-hidden
                      />
                      <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-[#5257C9] to-[#4549b8] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[#5257C9]/40">
                        <Trophy className="h-3.5 w-3.5 text-[#E8B54D]" />
                        Recommandé
                      </span>
                    </>
                  )}

                  <h3 className="text-lg font-bold text-[#1E1E2E]">{plan.nom}</h3>
                  <p className="mt-1 text-sm text-[#9A9AAE]">{plan.tagline}</p>

                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-5xl font-extrabold tracking-tight text-[#1E1E2E]">
                      {prix} €
                    </span>
                    <span className="mb-1.5 text-sm text-[#9A9AAE]">/ mois HT</span>
                  </div>
                  <p className="mt-1 text-xs text-[#9A9AAE]">
                    {annuel ? `Facturé ${prix * 12} € / an` : "Facturé mensuellement"}
                  </p>

                  <Button
                    className={`mt-6 w-full border-0 transition-all duration-300 ${
                      plan.populaire
                        ? "bg-[#5257C9] text-white shadow-lg shadow-[#5257C9]/25 hover:bg-[#4549b8] hover:shadow-xl hover:shadow-[#5257C9]/30"
                        : "bg-[#E9E9EF] text-[#1E1E2E] hover:bg-[#DCDCE5]"
                    }`}
                    onClick={onSignup}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <ul className="mt-6 space-y-3 border-t border-[#E9E9EF] pt-6">
                    {plan.features.map((f) => (
                      <li key={f.texte} className="flex items-start gap-2.5 text-sm">
                        {f.inclus ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4CC96B]" aria-hidden />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-[#9A9AAE]/60" aria-hidden />
                        )}
                        <span
                          className={f.inclus ? "text-[#1E1E2E]" : "text-[#9A9AAE]/70 line-through"}
                        >
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
          <p className="mt-8 text-center text-sm text-[#9A9AAE]">
            Besoin d'une solution sur-mesure pour un grand groupe ?{" "}
            <button
              onClick={onSignup}
              className="font-medium text-[#5257C9] underline-offset-4 transition-colors hover:text-[#4549b8] hover:underline"
            >
              Parlons-en →
            </button>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// 11. FAQ (accordion avec transitions douces)
// ============================================================

function FAQSection() {
  return (
    <section
      id="faq"
      className="relative scroll-mt-24 bg-white"
      aria-labelledby="faq-title"
    >
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#E8B54D]/15 px-3 py-1 text-xs font-medium text-[#B5841E]">
            FAQ
          </span>
          <h2
            id="faq-title"
            className="mt-5 text-3xl font-extrabold tracking-tight text-[#1E1E2E] sm:text-4xl lg:text-5xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Questions{" "}
            <span className="bg-gradient-to-r from-[#5257C9] to-[#4CC96B] bg-clip-text text-transparent">
              fréquentes
            </span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#9A9AAE] sm:text-lg">
            Tout ce que vous devez savoir avant de vous lancer.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Accordion type="single" collapsible className="mt-10 w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="mb-3 overflow-hidden rounded-2xl border border-[#E9E9EF] bg-white px-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all duration-300 hover:border-[#5257C9]/20 hover:shadow-md [&[data-state=open]]:border-[#5257C9]/40 [&[data-state=open]]:shadow-[0_10px_30px_rgba(82,87,201,0.08)]"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-[#1E1E2E] transition-colors hover:text-[#5257C9] hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-[#9A9AAE]">
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
// 12. CTA final (section pleine largeur, gradient indigo → vert)
// ============================================================

function FinalCTA({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-8 lg:py-28" aria-labelledby="cta-title">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#5257C9] via-[#4549b8] to-[#4CC96B] px-6 py-20 text-center shadow-2xl shadow-[#5257C9]/30 sm:px-12 sm:py-24">
          {/* Blobs décoratifs */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div
              className="fp-blob absolute -left-20 top-0 h-80 w-80 rounded-full bg-[#E0447E]/25 blur-3xl"
              style={{ animationDelay: "-2s" }}
            />
            <div
              className="fp-blob absolute right-0 top-1/4 h-72 w-72 rounded-full bg-[#E8B54D]/25 blur-3xl"
              style={{ animationDelay: "-6s" }}
            />
            <div
              className="fp-blob absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-white/15 blur-3xl"
              style={{ animationDelay: "-10s" }}
            />
          </div>

          {/* Particules décoratives flottantes */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div
              className="absolute left-[15%] top-[20%] h-2 w-2 rounded-full bg-white/60"
              style={{ animation: "fp-float-slow 6s ease-in-out infinite" }}
            />
            <div
              className="absolute right-[20%] top-[30%] h-2 w-2 rounded-full bg-[#E8B54D]/80"
              style={{ animation: "fp-float-slow 7s ease-in-out infinite", animationDelay: "-2s" }}
            />
            <div
              className="absolute left-[30%] bottom-[15%] h-1.5 w-1.5 rounded-full bg-white/50"
              style={{ animation: "fp-float-slow 5s ease-in-out infinite", animationDelay: "-1s" }}
            />
            <div
              className="absolute right-[35%] bottom-[20%] h-1.5 w-1.5 rounded-full bg-white"
              style={{ animation: "fp-float-slow 8s ease-in-out infinite", animationDelay: "-4s" }}
            />
          </div>

          {/* Subtle grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
            aria-hidden
          />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-[#E8B54D]" />
              Démarrez dès aujourd'hui
            </span>
            <h2
              id="cta-title"
              className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl"
              style={{ letterSpacing: "-0.035em" }}
            >
              Prêt à transformer <span className="text-[#E8B54D]">votre qualité</span> ?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
              Rejoignez les 127+ établissements qui pilotent leur qualité en temps réel. Premier
              rapport dès demain matin.
            </p>

            <div className="mt-10 flex flex-col items-center gap-5">
              <Button
                size="lg"
                onClick={onSignup}
                className="relative h-14 overflow-hidden border-0 bg-white px-8 text-base text-[#5257C9] shadow-2xl transition-all duration-300 hover:bg-[#E9E9EF] hover:shadow-[0_20px_50px_rgba(0,0,0,0.25)] before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-[#5257C9]/15 before:to-transparent before:transition-transform before:duration-700 before:content-[''] hover:before:translate-x-full"
              >
                Commencer gratuitement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="flex flex-col items-center gap-2 text-sm text-white/90 sm:flex-row sm:gap-6">
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#4CC96B]" /> 14 jours d'essai
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#4CC96B]" /> Sans CB
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#4CC96B]" /> Annulation en 1 clic
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
// 13. Footer (4 colonnes, fond sombre #1E1E2E)
// ============================================================

function SiteFooter({ onLogin }: { onLogin: () => void }) {
  const annee = new Date().getFullYear()
  return (
    <footer className="relative bg-[#1E1E2E] text-white">
      {/* Liseré arc-en-ciel en haut (palette dashboard) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5257C9] via-[#E8B54D] to-[#4CC96B]"
        aria-hidden
      />
      {/* Halo indigo */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-[#5257C9]/15 blur-3xl"
        aria-hidden
      />
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Colonne 1 : FeedbackPro */}
          <div className="col-span-2 md:col-span-1">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
              className="flex items-center gap-2 font-bold transition-opacity hover:opacity-80"
              aria-label="Accueil FeedbackPro"
            >
              <img
                src="/logo-feedbackpro.png"
                alt="FeedbackPro"
                className="h-10 w-auto brightness-0 invert"
              />
            </a>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#9A9AAE]">
              Le Client Mystère 2.0 : chaque client devient auditeur qualité, chaque matin devient
              plan d'action.
            </p>
            <button
              onClick={onLogin}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#E8B54D] transition-colors hover:text-[#FCD78A] hover:underline"
            >
              Se connecter
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Colonne 2 : Produit */}
          <nav aria-label="Produit">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9A9AAE]">
              Produit
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a
                  href="/fonctionnalites"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Fonctionnalités
                </a>
              </li>
              <li>
                <a
                  href="/demo"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Comment ça marche
                </a>
              </li>
              <li>
                <a
                  href="/cas-usage"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Cas d'usage
                </a>
              </li>
              <li>
                <a
                  href="/tarifs"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Tarifs
                </a>
              </li>
              <li>
                <a
                  href="/comparaison"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Comparatif
                </a>
              </li>
            </ul>
          </nav>

          {/* Colonne 3 : Ressources */}
          <nav aria-label="Ressources">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9A9AAE]">
              Ressources
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a
                  href="/faq"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  FAQ
                </a>
              </li>
              <li>
                <a
                  href="/temoignages"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Témoignages
                </a>
              </li>
              <li>
                <a
                  href="/a-propos"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  À propos
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Contact
                </a>
              </li>
            </ul>
          </nav>

          {/* Colonne 4 : Légal */}
          <nav aria-label="Légal">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9A9AAE]">
              Légal
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <a
                  href="/mentions-legales"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Mentions légales
                </a>
              </li>
              <li>
                <a
                  href="/cgu"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Conditions générales
                </a>
              </li>
              <li>
                <a
                  href="/confidentialite"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Confidentialité
                </a>
              </li>
              <li>
                <a
                  href="/cookies"
                  className="text-sm text-[#9A9AAE] transition-colors duration-200 hover:text-white"
                >
                  Cookies
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-[#9A9AAE]">
            © {annee} FeedbackPro. Fait avec ❤️ en France.
          </p>
          <div className="flex items-center gap-2 text-xs text-[#9A9AAE]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#4CC96B]" />
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#E9E9EF] text-[#1E1E2E]">
      {/* Halos décoratifs ambiants (indigo / green / yellow / pink) */}
      <div className="pointer-events-none fixed inset-0 -z-30" aria-hidden>
        <div className="absolute -left-40 top-1/4 h-[34rem] w-[34rem] rounded-full bg-[#5257C9]/[0.05] blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[30rem] w-[30rem] rounded-full bg-[#4CC96B]/[0.05] blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 h-[26rem] w-[26rem] rounded-full bg-[#E8B54D]/[0.04] blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[24rem] w-[24rem] rounded-full bg-[#E0447E]/[0.03] blur-[120px]" />
      </div>
      <SiteHeader onLogin={onLogin} onSignup={onSignup} />
      <div className="flex-1">
        <Hero onSignup={onSignup} />
        <TrustBar />
        <ProblemSection />
        <SolutionSection />
        <ComparisonSection />
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
