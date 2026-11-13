"use client"

// ============================================================
// FeedbackPro — Landing "Aurora Glass" (ultra-premium redesign)
// ------------------------------------------------------------
// 9 sections. Alternating light / dramatic-dark for contrast.
// Palette:
//   Light bg   #FAFBFF · Surface #FFFFFF · Text #0F0F1A · Muted #5B5F7A
//   Dark bg    #0A0B1A · Surface-dark #14162B · Text-on-dark #F0F2FF
//   Primary    #5257C9 -> #7578E8 (indigo->violet) · Accent #06B6D4 (cyan)
// Animations: framer-motion reveals (blur->clear) + count-up stats
//   + pure CSS keyframes (aurora blobs, floating mockup, hero dashboard
//   card sequence, marquee, pulse). Real logo <img> in header / hero /
//   CTA / footer. All CTAs route through onLogin / onSignup.
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useInView } from "framer-motion"
import {
  ArrowRight,
  ArrowUp,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Menu,
  MessageSquare,
  Plane,
  QrCode,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Trophy,
  Utensils,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

// ------------------------------------------------------------
// CSS keyframes (global, scoped with fbp- prefix)
// ------------------------------------------------------------
const FBP_STYLES = `
  html { scroll-behavior: smooth; }
  @keyframes fbp-aurora1 {
    0%,100% { transform: translate(0,0) scale(1); }
    33% { transform: translate(60px,-40px) scale(1.08); }
    66% { transform: translate(-30px,30px) scale(0.96); }
  }
  @keyframes fbp-aurora2 {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(-50px,40px) scale(1.1); }
  }
  @keyframes fbp-aurora3 {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(40px,-30px) scale(0.94); }
  }
  @keyframes fbp-float {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  @keyframes fbp-card1 {
    0% { opacity: 0; transform: translateX(-14px); }
    2%  { opacity: 1; transform: translateX(0); }
    90% { opacity: 1; transform: translateX(0); }
    100%{ opacity: 0; transform: translateX(-14px); }
  }
  @keyframes fbp-card2 {
    0%  { opacity: 0; transform: translateX(-14px); }
    5%  { opacity: 1; transform: translateX(0); }
    90% { opacity: 1; transform: translateX(0); }
    100%{ opacity: 0; transform: translateX(-14px); }
  }
  @keyframes fbp-card3 {
    0%  { opacity: 0; transform: translateX(-14px); }
    10% { opacity: 1; transform: translateX(0); }
    90% { opacity: 1; transform: translateX(0); }
    100%{ opacity: 0; transform: translateX(-14px); }
  }
  @keyframes fbp-card4 {
    0%  { opacity: 0; transform: translateX(-14px); }
    15% { opacity: 1; transform: translateX(0); }
    90% { opacity: 1; transform: translateX(0); }
    100%{ opacity: 0; transform: translateX(-14px); }
  }
  @keyframes fbp-prio1 {
    0%  { opacity: 0; transform: translateY(8px); }
    20% { opacity: 1; transform: translateY(0); }
    90% { opacity: 1; transform: translateY(0); }
    100%{ opacity: 0; transform: translateY(8px); }
  }
  @keyframes fbp-prio2 {
    0%  { opacity: 0; transform: translateY(8px); }
    25% { opacity: 1; transform: translateY(0); }
    90% { opacity: 1; transform: translateY(0); }
    100%{ opacity: 0; transform: translateY(8px); }
  }
  @keyframes fbp-prio3 {
    0%  { opacity: 0; transform: translateY(8px); }
    30% { opacity: 1; transform: translateY(0); }
    90% { opacity: 1; transform: translateY(0); }
    100%{ opacity: 0; transform: translateY(8px); }
  }
  @keyframes fbp-marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes fbp-pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(1.6); }
  }
  .fbp-aurora1 { animation: fbp-aurora1 20s ease-in-out infinite; }
  .fbp-aurora2 { animation: fbp-aurora2 25s ease-in-out infinite; }
  .fbp-aurora3 { animation: fbp-aurora3 30s ease-in-out infinite; }
  .fbp-float   { animation: fbp-float 6s ease-in-out infinite; }
  .fbp-card1   { animation: fbp-card1 6s ease-in-out infinite; }
  .fbp-card2   { animation: fbp-card2 6s ease-in-out infinite; }
  .fbp-card3   { animation: fbp-card3 6s ease-in-out infinite; }
  .fbp-card4   { animation: fbp-card4 6s ease-in-out infinite; }
  .fbp-prio1   { animation: fbp-prio1 6s ease-in-out infinite; }
  .fbp-prio2   { animation: fbp-prio2 6s ease-in-out infinite; }
  .fbp-prio3   { animation: fbp-prio3 6s ease-in-out infinite; }
  .fbp-marquee { animation: fbp-marquee 40s linear infinite; }
  .fbp-marquee-wrap:hover .fbp-marquee { animation-play-state: paused; }
  .fbp-pulse   { animation: fbp-pulse 2s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .fbp-aurora1,.fbp-aurora2,.fbp-aurora3,.fbp-float,
    .fbp-card1,.fbp-card2,.fbp-card3,.fbp-card4,
    .fbp-prio1,.fbp-prio2,.fbp-prio3,.fbp-marquee,.fbp-pulse {
      animation: none !important;
    }
    html { scroll-behavior: auto; }
  }
`

// ------------------------------------------------------------
// Count-up hook (easeOutCubic, triggers on inView)
// ------------------------------------------------------------
function useCountUp(target: number, active: boolean, duration = 1500) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, duration])
  return val
}

// ------------------------------------------------------------
// Reveal wrapper — blur->clear on scroll
// ------------------------------------------------------------
function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: "div" | "section"
}) {
  const MotionTag = motion[as]
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </MotionTag>
  )
}

function SectionLabel({
  children,
  dark = false,
}: {
  children: ReactNode
  dark?: boolean
}) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-widest",
        dark ? "text-[#7578E8]" : "text-[#5257C9]"
      )}
    >
      {children}
    </span>
  )
}

// ------------------------------------------------------------
// Count-up stat (dark problem section)
// ------------------------------------------------------------
function ProblemStat({
  target,
  suffix,
  label,
}: {
  target: number
  suffix: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const val = useCountUp(target, inView)
  return (
    <div ref={ref} className="text-center">
      <div className="text-6xl sm:text-7xl lg:text-8xl font-bold font-mono bg-gradient-to-b from-[#5257C9] to-[#7578E8] bg-clip-text text-transparent leading-none">
        {Math.round(val)}
        {suffix}
      </div>
      <p className="text-base text-[#8888AA] mt-4 max-w-xs mx-auto">{label}</p>
    </div>
  )
}

// ------------------------------------------------------------
// Count-up metric (light social proof)
// ------------------------------------------------------------
function SocialMetric({
  target,
  decimals = 0,
  prefix = "",
  suffix = "",
  label,
}: {
  target: number
  decimals?: number
  prefix?: string
  suffix?: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const val = useCountUp(target, inView)
  const display =
    decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString()
  return (
    <div ref={ref} className="text-center">
      <div className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-[#5257C9] to-[#7578E8] bg-clip-text text-transparent leading-none">
        {prefix}
        {display}
        {suffix}
      </div>
      <p className="text-base text-[#5B5F7A] mt-3">{label}</p>
    </div>
  )
}

// ------------------------------------------------------------
// Data
// ------------------------------------------------------------
const NAV_LINKS = [
  { label: "Fonctionnalités", href: "#features" },
  { label: "Comment ça marche", href: "#how" },
  { label: "Tarifs", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

const HERO_KPIS = [
  { label: "NPS", value: "+47", sub: "+12", kind: "up" as const },
  { label: "Feedbacks", value: "23", sub: "aujourd'hui", kind: "text" as const },
  { label: "Résolus", value: "98%", sub: "résolu", kind: "check" as const },
]

const HERO_FEEDBACKS = [
  { color: "#5257C9", zone: "Salle", time: "2 min", text: "Service rapide et souriant", badge: "Résolu", badgeTone: "green" as const },
  { color: "#06B6D4", zone: "Accueil", time: "8 min", text: "Attente un peu longue à l'entrée", badge: "Ouvert", badgeTone: "amber" as const },
  { color: "#7578E8", zone: "Encaissement", time: "21 min", text: "Addition claire, top", badge: "Résolu", badgeTone: "green" as const },
  { color: "#06B6D4", zone: "Table 12", time: "34 min", text: "Plat tiède, IA a prévenu cuisine", badge: "Action", badgeTone: "indigo" as const },
]

const HERO_PRIORITIES = [
  { n: 1, text: "Réformer l'accueil en salle (pic 12h-13h)" },
  { n: 2, text: "Réajuster la température plat table 12" },
  { n: 3, text: "Former l'équipe à l'encaissement rapide" },
]

type BentoDef = {
  id: string
  span: string
  icon: typeof Bot
  title: string
  desc: string
}

const BENTO: BentoDef[] = [
  {
    id: "ia",
    span: "md:col-span-2",
    icon: Bot,
    title: "IA Coach qualité continu",
    desc: "Chaque matin, 3 priorités concrètes issues de l'analyse de tous vos feedbacks textuels et photos.",
  },
  {
    id: "rt",
    span: "md:col-span-1",
    icon: MessageSquare,
    title: "Feedback temps réel",
    desc: "Recevez chaque retour au moment exact où le client le laisse.",
  },
  {
    id: "multi",
    span: "md:col-span-2",
    icon: Store,
    title: "Multi-secteur",
    desc: "Restaurant, hôtel, salon, salle de sport. FeedbackPro s'adapte à votre métier.",
  },
  {
    id: "game",
    span: "md:col-span-1 md:row-span-2",
    icon: Trophy,
    title: "Gamification équipe",
    desc: "Classement qualité hebdomadaire et badges pour transformer chaque collaborateur en acteur de la qualité.",
  },
  {
    id: "vlm",
    span: "md:col-span-2",
    icon: Camera,
    title: "Photos + analyse VLM",
    desc: "Les clients photographient. L'IA visionne, détecte et priorise automatiquement les anomalies visuelles.",
  },
]

const SECTORS = [
  { icon: Utensils, label: "Restaurant" },
  { icon: Plane, label: "Hôtellerie" },
  { icon: Store, label: "Retail" },
  { icon: Sparkles, label: "Beauté" },
]

const TESTIMONIALS = [
  { quote: "En 3 semaines, notre NPS est passé de 12 à 47. L'IA sort chaque matin les 3 actions qui comptent vraiment.", name: "Marie Laurent", role: "Directrice", company: "Le Bistrot Parisien", sector: "Restaurant", initials: "ML", grad: "from-[#5257C9] to-[#7578E8]" },
  { quote: "On a enfin une vision claire de la qualité réelle, pas celle qu'on croyait. Game changer pour l'hôtellerie.", name: "Karim Benali", role: "Manager", company: "Hotel Atlas", sector: "Hôtellerie", initials: "KB", grad: "from-[#06B6D4] to-[#5257C9]" },
  { quote: "Les feedbacks photos analysés par l'IA ont révélé des soucis qu'aucun client n'avait jamais signalés.", name: "Sophie Marchand", role: "Franchisée", company: "FastFit", sector: "Services", initials: "SM", grad: "from-[#7578E8] to-[#06B6D4]" },
  { quote: "La gamification a transformé mon équipe. Chacun veut grimper sur le podium qualité de la semaine.", name: "Thomas Ruiz", role: "Gérant", company: "Café du Coin", sector: "Café", initials: "TR", grad: "from-[#5257C9] to-[#06B6D4]" },
  { quote: "Setup en 5 minutes, premiers feedbacks le soir même. Le ROI était évident dès la première semaine.", name: "Elena Popa", role: "Manager", company: "Salon Élégance", sector: "Beauté", initials: "EP", grad: "from-[#7578E8] to-[#5257C9]" },
  { quote: "On gérait 6 salles avec des audits papier. Aujourd'hui tout est centralisé, temps réel, sans effort.", name: "Yanis Dubois", role: "Directeur", company: "Gym Power", sector: "Fitness", initials: "YD", grad: "from-[#06B6D4] to-[#7578E8]" },
]

const FAQS = [
  { q: "Combien de temps pour mettre en place FeedbackPro ?", a: "Cinq minutes. Vous créez votre établissement, vous générez vos QR codes, et vous collectez dès la première interaction client." },
  { q: "Ai-je besoin d'une carte bancaire pour essayer ?", a: "Non. L'essai est totalement gratuit pendant 14 jours, sans carte bancaire. Vous accédez à toutes les fonctionnalités Pro." },
  { q: "Comment l'IA analyse-t-elle les feedbacks ?", a: "Notre IA Coach qualité lit chaque feedback textuel et photo, détecte les thèmes récurrents, mesure le sentiment, et extrait chaque matin 3 priorités d'action concrètes pour votre établissement." },
  { q: "Puis-je utiliser FeedbackPro dans plusieurs établissements ?", a: "Oui. Les plans Pro et Enterprise gèrent plusieurs établissements avec un tableau de bord consolidé et des comparatifs entre sites." },
  { q: "Que se passe-t-il avec mes données ?", a: "Vos données sont hébergées en Europe, chiffrées au repos et en transit, et ne sont jamais partagées. Vous pouvez exporter ou supprimer toutes vos données à tout moment." },
  { q: "Puis-je annuler à tout moment ?", a: "Oui, en un clic. Aucun engagement, aucun frais caché. Vous gardez l'accès jusqu'à la fin de la période payée." },
]

type Plan = {
  name: string
  monthly: number | null
  annual: number | null
  description: string
  features: string[]
  cta: string
  highlighted: boolean
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    monthly: 29,
    annual: 23,
    description: "Pour démarrer l'audit qualité dans votre établissement.",
    features: [
      "1 établissement",
      "Jusqu'à 200 feedbacks / mois",
      "Dashboard temps réel",
      "Rapports hebdomadaires",
      "Support email",
    ],
    cta: "Commencer",
    highlighted: false,
  },
  {
    name: "Pro",
    monthly: 79,
    annual: 63,
    description: "Tout FeedbackPro, avec l'IA Coach qualité continu.",
    features: [
      "3 établissements",
      "Feedbacks illimités",
      "IA Coach qualité continu",
      "Analyse photos VLM",
      "Priorités quotidiennes IA",
      "Gamification équipe",
      "Support prioritaire",
    ],
    cta: "Essayer gratuitement",
    highlighted: true,
  },
  {
    name: "Enterprise",
    monthly: null,
    annual: null,
    description: "Pour les groupes et réseaux multi-établissements.",
    features: [
      "Établissements illimités",
      "Tout le plan Pro",
      "API & intégrations",
      "SSO / SAML",
      "Gestionnaire dédié",
      "SLA 99,9 %",
    ],
    cta: "Contacter",
    highlighted: false,
  },
]

// ------------------------------------------------------------
// Aurora blobs (reused in hero + CTA)
// ------------------------------------------------------------
function AuroraBlobs({ variant = "light" }: { variant?: "light" | "onGradient" }) {
  if (variant === "onGradient") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="fbp-aurora1 absolute -top-24 left-1/4 h-[28rem] w-[28rem] rounded-full bg-white/20 blur-[100px]" />
        <div className="fbp-aurora2 absolute top-1/3 right-1/4 h-[26rem] w-[26rem] rounded-full bg-white/10 blur-[100px]" />
        <div className="fbp-aurora3 absolute -bottom-24 left-1/3 h-[24rem] w-[24rem] rounded-full bg-cyan-100/10 blur-[100px]" />
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="fbp-aurora1 absolute -top-32 -left-24 h-[34rem] w-[34rem] rounded-full bg-[#5257C9]/20 blur-[100px]" />
      <div className="fbp-aurora2 absolute -top-24 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-[#7578E8]/15 blur-[100px]" />
      <div className="fbp-aurora3 absolute bottom-[-8rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-[#06B6D4]/10 blur-[100px]" />
    </div>
  )
}

// ------------------------------------------------------------
// Hero dashboard mockup (pure CSS, looping 6s sequence)
// ------------------------------------------------------------
function HeroMockup() {
  return (
    <div className="relative">
      {/* Floating badge — top right */}
      <div
        className="fbp-float absolute -top-5 right-0 sm:-right-4 z-20 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/70 px-4 py-2.5 shadow-xl shadow-[#5257C9]/10"
        style={{ animationDelay: "0.4s" }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100">
            <ArrowUp className="h-4 w-4 text-emerald-600" />
          </span>
          <div>
            <div className="text-[10px] font-medium text-[#5B5F7A]">NPS 7 jours</div>
            <div className="text-sm font-bold text-emerald-600">+12 pts</div>
          </div>
        </div>
      </div>

      {/* Floating badge — bottom left */}
      <div
        className="fbp-float absolute -bottom-5 left-0 sm:-left-4 z-20 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/70 px-4 py-2.5 shadow-xl shadow-[#5257C9]/10"
        style={{ animationDelay: "1.8s" }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center">
            <span className="fbp-pulse absolute inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            <Bot className="relative h-4 w-4 text-[#5257C9]" />
          </span>
          <div>
            <div className="text-[10px] font-medium text-[#5B5F7A]">IA Coach</div>
            <div className="text-sm font-bold text-[#5257C9]">Active</div>
          </div>
        </div>
      </div>

      {/* Browser window */}
      <div className="fbp-float relative rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl shadow-[#5257C9]/10 rotate-1 hover:rotate-0 transition-transform duration-700">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          <div className="ml-3 flex-1 rounded-full bg-white/80 px-3 py-1 text-[10px] text-[#5B5F7A] text-center font-medium">
            app.feedbackpro.com/dashboard
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {HERO_KPIS.map((k) => (
              <div
                key={k.label}
                className="rounded-xl bg-white p-3 border border-black/5 shadow-sm"
              >
                <div className="text-[10px] text-[#5B5F7A]">{k.label}</div>
                <div className="text-2xl font-bold bg-gradient-to-r from-[#5257C9] to-[#7578E8] bg-clip-text text-transparent leading-tight">
                  {k.value}
                </div>
                <div className="text-[9px] flex items-center gap-1 mt-0.5">
                  {k.kind === "up" && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                      <ArrowUp className="h-2.5 w-2.5" />
                      {k.sub}
                    </span>
                  )}
                  {k.kind === "text" && <span className="text-[#5B5F7A]">{k.sub}</span>}
                  {k.kind === "check" && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                      <Check className="h-2.5 w-2.5" />
                      {k.sub}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Feedback list + priorities */}
          <div className="grid grid-cols-5 gap-2">
            {/* Feedback list (60%) */}
            <div className="col-span-3 rounded-xl bg-white p-3 border border-black/5 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="fbp-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[11px] font-semibold text-[#0F0F1A]">
                  Derniers feedbacks
                </span>
                <span className="ml-auto text-[9px] text-[#5B5F7A]">live</span>
              </div>
              <div className="space-y-1.5">
                {HERO_FEEDBACKS.map((f, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg bg-white p-2 border border-black/5 flex items-start gap-2",
                      `fbp-card${i + 1}`
                    )}
                  >
                    <span
                      className="mt-1 h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-semibold text-[#0F0F1A] truncate">
                          {f.zone}
                        </span>
                        <span className="text-[9px] text-[#5B5F7A] shrink-0">{f.time}</span>
                      </div>
                      <p className="text-[10px] text-[#5B5F7A] truncate">{f.text}</p>
                      <span
                        className={cn(
                          "inline-block mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold",
                          f.badgeTone === "green" && "bg-emerald-100 text-emerald-700",
                          f.badgeTone === "amber" && "bg-amber-100 text-amber-700",
                          f.badgeTone === "indigo" && "bg-[#5257C9]/10 text-[#5257C9]"
                        )}
                      >
                        {f.badge}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Priorities IA (40%) */}
            <div className="col-span-2 rounded-xl bg-gradient-to-br from-[#5257C9]/5 to-[#7578E8]/5 p-3 border border-[#5257C9]/10">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3 w-3 text-[#5257C9]" />
                <span className="text-[11px] font-semibold text-[#0F0F1A]">Priorités IA</span>
              </div>
              <div className="space-y-1.5">
                {HERO_PRIORITIES.map((p, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg bg-white/80 p-2 flex items-start gap-2",
                      `fbp-prio${i + 1}`
                    )}
                  >
                    <span className="h-5 w-5 shrink-0 rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] text-white text-[10px] font-bold flex items-center justify-center">
                      {p.n}
                    </span>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#0F0F1A] leading-snug">{p.text}</p>
                      <button className="mt-1 rounded-md bg-[#5257C9] text-white text-[8px] font-semibold px-2 py-0.5">
                        Action
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Bento tile mini-visuals
// ------------------------------------------------------------
function BentoVisual({ id }: { id: string }) {
  if (id === "ia") {
    return (
      <div className="mt-auto pt-4 space-y-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="flex items-center gap-2 rounded-lg bg-[#FAFBFF] border border-black/5 px-2.5 py-1.5"
          >
            <span className="h-5 w-5 rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] text-white text-[10px] font-bold flex items-center justify-center">
              {n}
            </span>
            <span className="text-[11px] text-[#5B5F7A]">
              {n === 1 && "Réformer l'accueil (pic 12h)"}
              {n === 2 && "Réajuster température plats"}
              {n === 3 && "Former équipe encaissement"}
            </span>
            <Check className="ml-auto h-3.5 w-3.5 text-emerald-500" />
          </div>
        ))}
      </div>
    )
  }
  if (id === "rt") {
    return (
      <div className="mt-auto pt-4">
        <div className="rounded-lg bg-[#FAFBFF] border border-black/5 p-2.5 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="fbp-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[#0F0F1A]">Nouveau feedback</div>
            <div className="text-[10px] text-[#5B5F7A] truncate">Table 7 · il y a 3 sec</div>
          </div>
        </div>
      </div>
    )
  }
  if (id === "multi") {
    return (
      <div className="mt-auto pt-4 grid grid-cols-4 gap-2">
        {SECTORS.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="flex flex-col items-center gap-1 rounded-lg bg-[#FAFBFF] border border-black/5 py-2"
            >
              <Icon className="h-4 w-4 text-[#5257C9]" />
              <span className="text-[9px] text-[#5B5F7A] font-medium">{s.label}</span>
            </div>
          )
        })}
      </div>
    )
  }
  if (id === "vlm") {
    return (
      <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200/50 p-2">
          <div className="text-[9px] font-semibold text-amber-700 mb-1">Avant</div>
          <div className="h-10 rounded bg-amber-200/60" />
        </div>
        <div className="rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 border border-emerald-200/50 p-2">
          <div className="text-[9px] font-semibold text-emerald-700 mb-1">Après</div>
          <div className="h-10 rounded bg-emerald-200/60" />
        </div>
      </div>
    )
  }
  if (id === "game") {
    const rows = [
      { rank: 1, initials: "ML", name: "Marie", score: 98, grad: "from-[#5257C9] to-[#7578E8]" },
      { rank: 2, initials: "TR", name: "Thomas", score: 94, grad: "from-[#7578E8] to-[#06B6D4]" },
      { rank: 3, initials: "KB", name: "Karim", score: 91, grad: "from-[#06B6D4] to-[#5257C9]" },
      { rank: 4, initials: "EP", name: "Elena", score: 88, grad: "from-[#5B5F7A] to-[#8888AA]" },
    ]
    return (
      <div className="mt-auto pt-4 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.rank}
            className="flex items-center gap-2 rounded-lg bg-[#FAFBFF] border border-black/5 px-2 py-1.5"
          >
            <span className="text-[10px] font-bold text-[#5B5F7A] w-3">{r.rank}</span>
            <span
              className={cn(
                "h-6 w-6 rounded-full bg-gradient-to-br text-white text-[9px] font-bold flex items-center justify-center",
                r.grad
              )}
            >
              {r.initials}
            </span>
            <span className="text-[11px] font-medium text-[#0F0F1A] flex-1 truncate">
              {r.name}
            </span>
            <span className="text-[11px] font-bold text-[#5257C9]">{r.score}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

function BentoTile({ tile }: { tile: BentoDef }) {
  const Icon = tile.icon
  return (
    <Reveal className={cn("min-h-[200px]", tile.span)}>
      <div className="group h-full rounded-2xl bg-white border border-black/5 p-6 shadow-sm hover:shadow-xl hover:shadow-[#5257C9]/5 hover:-translate-y-1 transition-all duration-300 flex flex-col">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#5257C9] to-[#7578E8] flex items-center justify-center shadow-lg shadow-[#5257C9]/20">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <h3 className="text-base font-bold text-[#0F0F1A]">{tile.title}</h3>
        </div>
        <p className="text-sm text-[#5B5F7A] mt-3">{tile.desc}</p>
        <BentoVisual id={tile.id} />
      </div>
    </Reveal>
  )
}

// ------------------------------------------------------------
// Timeline step
// ------------------------------------------------------------
const TIMELINE = [
  { n: 1, icon: QrCode, title: "Client scanne le QR", desc: "Un QR code sur la table ou la sortie. Le client ouvre le formulaire en 2 secondes." },
  { n: 2, icon: MessageSquare, title: "Feedback arrive", desc: "Texte, note, photo. Tout arrive en temps réel sur votre dashboard." },
  { n: 3, icon: Bot, title: "L'IA analyse", desc: "L'IA Coach qualité lit, classe, détecte les tendances et mesure le sentiment." },
  { n: 4, icon: CheckCircle2, title: "Vous agissez", desc: "Chaque matin, 3 priorités concrètes. Vous agissez. Le client revient." },
]

// ------------------------------------------------------------
// Testimonial card
// ------------------------------------------------------------
function TestimonialCard({ t }: { t: (typeof TESTIMONIALS)[number] }) {
  return (
    <div className="w-[20rem] sm:w-[24rem] shrink-0 rounded-2xl bg-white border border-black/5 p-6 shadow-sm">
      <div className="flex gap-0.5 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-sm text-[#0F0F1A] leading-relaxed">"{t.quote}"</p>
      <div className="flex items-center gap-3 mt-4">
        <span
          className={cn(
            "h-9 w-9 rounded-full bg-gradient-to-br text-white text-xs font-bold flex items-center justify-center",
            t.grad
          )}
        >
          {t.initials}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#0F0F1A] truncate">{t.name}</div>
          <div className="text-xs text-[#5B5F7A] truncate">
            {t.role} · {t.company}
          </div>
        </div>
        <span className="ml-auto rounded-full bg-[#5257C9]/8 px-2 py-0.5 text-[10px] font-semibold text-[#5257C9] shrink-0">
          {t.sector}
        </span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Pricing card
// ------------------------------------------------------------
function PriceTag({ plan, annual }: { plan: Plan; annual: boolean }) {
  if (plan.monthly === null) {
    return <div className="text-4xl font-bold text-[#0F0F1A]">Sur devis</div>
  }
  const price = annual ? plan.annual : plan.monthly
  return (
    <div className="flex items-end gap-1">
      <span className="text-5xl font-bold text-[#0F0F1A]">{price}€</span>
      <span className="text-sm text-[#5B5F7A] mb-2">/mois</span>
    </div>
  )
}

// ============================================================
// MAIN — LandingView
// ============================================================
export function LandingView({
  onLogin,
  onSignup,
}: {
  onLogin: () => void
  onSignup: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [annual, setAnnual] = useState(true)

  const handleNav = (href: string) => setMobileOpen(false)

  return (
    <div className="min-h-screen bg-[#FAFBFF] text-[#0F0F1A] antialiased">
      <style>{FBP_STYLES}</style>

      {/* ============ SECTION 1 : HEADER ============ */}
      <header className="sticky top-0 z-50 h-16 bg-white/60 backdrop-blur-xl border-b border-black/5">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
          <a href="#" className="flex items-center" aria-label="FeedbackPro accueil">
            <img
              src="/logo-feedbackpro.png"
              alt="FeedbackPro"
              className="h-8 sm:h-9 w-auto"
            />
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-[#5B5F7A] hover:text-[#0F0F1A] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={onLogin}
              className="text-sm font-semibold text-[#0F0F1A] hover:text-[#5257C9] transition-colors px-3 py-2"
            >
              Se connecter
            </button>
            <button
              onClick={onSignup}
              className="text-sm font-semibold text-white bg-gradient-to-r from-[#5257C9] to-[#7578E8] px-4 py-2.5 rounded-full shadow-lg shadow-[#5257C9]/25 hover:shadow-xl hover:shadow-[#5257C9]/40 hover:-translate-y-0.5 transition-all"
            >
              Essayer gratuitement
            </button>
          </div>

          {/* Mobile */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-[#0F0F1A] hover:bg-black/5 transition-colors"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85%] sm:w-[24rem] bg-white p-0">
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-black/5">
                <SheetTitle className="flex items-center">
                  <img
                    src="/logo-feedbackpro.png"
                    alt="FeedbackPro"
                    className="h-8 w-auto"
                  />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-6 py-4">
                {NAV_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => handleNav(l.href)}
                    className="text-base font-medium text-[#0F0F1A] hover:text-[#5257C9] py-2.5 transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
                <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-black/5">
                  <button
                    onClick={() => {
                      setMobileOpen(false)
                      onLogin()
                    }}
                    className="text-sm font-semibold text-[#0F0F1A] border border-black/10 rounded-xl py-3 hover:bg-black/[0.03] transition-colors"
                  >
                    Se connecter
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false)
                      onSignup()
                    }}
                    className="text-sm font-semibold text-white bg-gradient-to-r from-[#5257C9] to-[#7578E8] rounded-xl py-3 shadow-lg shadow-[#5257C9]/25"
                  >
                    Essayer gratuitement
                  </button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* ============ SECTION 2 : HERO — AURORA GLASS ============ */}
      <section className="relative overflow-hidden bg-[#FAFBFF]">
        <AuroraBlobs />
        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(82,87,201,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(82,87,201,0.05) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-24 sm:pt-20 lg:pt-24 lg:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 lg:gap-8 items-center">
            {/* Left column — text */}
            <div className="text-center lg:text-left">
              <Reveal delay={0.05}>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#5257C9]/8 px-4 py-1.5 text-xs font-semibold text-[#5257C9]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Nouveau · IA Coach qualité continu
                </span>
              </Reveal>

              <Reveal delay={0.1}>
                <h1 className="mt-5 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95] bg-gradient-to-r from-[#5257C9] via-[#7578E8] to-[#06B6D4] bg-clip-text text-transparent">
                  L'audit qualité continu pour votre établissement
                </h1>
              </Reveal>

              <Reveal delay={0.15}>
                <p className="text-lg sm:text-xl text-[#5B5F7A] max-w-xl mt-6 mx-auto lg:mx-0">
                  Transformez chaque client en auditeur qualité. Recevez chaque jour
                  3 priorités concrètes issues de l'IA qui analyse tous vos feedbacks.
                </p>
              </Reveal>

              <Reveal delay={0.2}>
                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <button
                    onClick={onSignup}
                    className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#5257C9] to-[#7578E8] text-white px-7 py-3.5 rounded-xl font-semibold shadow-xl shadow-[#5257C9]/30 hover:shadow-2xl hover:shadow-[#5257C9]/40 hover:-translate-y-0.5 transition-all"
                  >
                    Essayer gratuitement
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <a
                    href="#how"
                    className="inline-flex items-center justify-center gap-2 border border-[#5257C9]/15 bg-white/50 backdrop-blur text-[#5257C9] px-7 py-3.5 rounded-xl font-semibold hover:bg-white hover:border-[#5257C9]/30 transition-all"
                  >
                    Voir la démo
                  </a>
                </div>
              </Reveal>

              <Reveal delay={0.25}>
                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 justify-center lg:justify-start text-sm text-[#5B5F7A]">
                  <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-[#5257C9]" />
                    Pas de carte bancaire
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-[#5257C9]" />
                    Annulez en 1 clic
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-[#5257C9]" />
                    Setup en 5 minutes
                  </span>
                </div>
              </Reveal>

              <Reveal delay={0.3}>
                <div className="mt-4 flex items-center gap-2 justify-center lg:justify-start">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-sm text-[#5B5F7A]">
                    <span className="font-semibold text-[#0F0F1A]">4,9/5</span> · +2M feedbacks collectés
                  </span>
                </div>
              </Reveal>
            </div>

            {/* Right column — mockup */}
            <Reveal delay={0.2} className="relative">
              <HeroMockup />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ SECTION 3 : PROBLEM — DARK IMPACT ============ */}
      <section className="relative overflow-hidden bg-[#0A0B1A] py-28 sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(82,87,201,0.15),_transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl px-4 text-center">
          <Reveal>
            <SectionLabel dark>Le problème</SectionLabel>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight bg-gradient-to-r from-white via-[#F0F2FF] to-[#8888AA] bg-clip-text text-transparent">
              Vos clients voient tout. Vous ne voyez rien.
            </h2>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-6">
            <Reveal delay={0.1}>
              <ProblemStat target={73} suffix="%" label="des clients mécontents partent sans rien dire" />
            </Reveal>
            <Reveal delay={0.2}>
              <ProblemStat target={12} suffix="x" label="expériences positives pour effacer 1 mauvaise" />
            </Reveal>
            <Reveal delay={0.3}>
              <ProblemStat target={5} suffix="min" label="le temps qu'il faut pour perdre un client à jamais" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ SECTION 4 : SOLUTION — GLASS BENTO ============ */}
      <section id="features" className="bg-[#FAFBFF] py-28 sm:py-32 scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center max-w-3xl mx-auto">
            <Reveal>
              <SectionLabel>La solution</SectionLabel>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-[#0F0F1A]">
                Une seule plateforme. Tout l'audit qualité.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="text-lg text-[#5B5F7A] mt-4">
                FeedbackPro centralise la collecte, l'analyse et l'action. De la voix du
                client à la priorité du jour, sans aucun effort.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[200px]">
            {BENTO.map((tile) => (
              <BentoTile key={tile.id} tile={tile} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 5 : HOW IT WORKS — CINEMATIC TIMELINE ============ */}
      <section id="how" className="relative overflow-hidden bg-[#0A0B1A] py-28 sm:py-32 scroll-mt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(82,87,201,0.15),_transparent_60%)]" />
        <div className="relative mx-auto max-w-7xl px-4">
          <div className="text-center max-w-3xl mx-auto">
            <Reveal>
              <SectionLabel dark>Comment ça marche</SectionLabel>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-[#F0F2FF] to-[#8888AA] bg-clip-text text-transparent">
                4 étapes. 5 minutes.
              </h2>
            </Reveal>
          </div>

          <div className="mt-16 relative">
            {/* Desktop horizontal connecting line */}
            <div className="hidden md:block absolute left-[12.5%] right-[12.5%] top-5 h-0.5 bg-white/10">
              <motion.div
                className="h-full bg-gradient-to-r from-[#5257C9] via-[#7578E8] to-[#06B6D4] origin-left"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-4">
              {TIMELINE.map((step, i) => {
                const Icon = step.icon
                return (
                  <Reveal
                    key={step.n}
                    delay={i * 0.12}
                    className="relative flex md:flex-col items-start md:items-center gap-4 md:gap-0 md:text-center"
                  >
                    <div className="relative z-10 h-10 w-10 rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] text-white font-bold flex items-center justify-center shadow-lg shadow-[#5257C9]/30 shrink-0">
                      {step.n}
                    </div>
                    <div className="md:mt-4">
                      <Icon className="h-6 w-6 text-[#7578E8] md:mx-auto" />
                      <h3 className="text-lg font-bold text-white mt-3">{step.title}</h3>
                      <p className="text-sm text-[#8888AA] mt-1">{step.desc}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ============ SECTION 6 : SOCIAL PROOF — METRICS + MARQUEE ============ */}
      <section className="bg-[#FAFBFF] py-28 sm:py-32">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center max-w-3xl mx-auto">
            <Reveal>
              <SectionLabel>Ils nous font confiance</SectionLabel>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-[#0F0F1A]">
                Des résultats, pas des promesses.
              </h2>
            </Reveal>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <Reveal delay={0.1}>
              <SocialMetric target={2} prefix="+" suffix="M" label="feedbacks collectés" />
            </Reveal>
            <Reveal delay={0.2}>
              <SocialMetric target={98} suffix="%" label="satisfaction équipe" />
            </Reveal>
            <Reveal delay={0.3}>
              <SocialMetric target={4.9} decimals={1} suffix="/5" label="note moyenne" />
            </Reveal>
          </div>

          {/* Marquee */}
          <Reveal delay={0.1} className="mt-16">
            <div className="fbp-marquee-wrap relative overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-[#FAFBFF] to-transparent z-10" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-[#FAFBFF] to-transparent z-10" />
              <div className="fbp-marquee flex w-max gap-4">
                {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
                  <TestimonialCard key={i} t={t} />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ SECTION 7 : PRICING — GLASS PREMIUM ============ */}
      <section id="pricing" className="bg-white py-28 sm:py-32 scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center max-w-3xl mx-auto">
            <Reveal>
              <SectionLabel>Tarifs</SectionLabel>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-[#0F0F1A]">
                Des tarifs simples et transparents
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="text-lg text-[#5B5F7A] mt-4">
                Commencez gratuitement. Sans carte bancaire. Annulez en 1 clic.
              </p>
            </Reveal>

            {/* Toggle */}
            <Reveal delay={0.15}>
              <div className="mt-8 inline-flex items-center gap-1 rounded-full bg-[#FAFBFF] border border-black/5 p-1">
                <button
                  onClick={() => setAnnual(false)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
                    !annual ? "bg-white text-[#0F0F1A] shadow-sm" : "text-[#5B5F7A]"
                  )}
                >
                  Mensuel
                </button>
                <button
                  onClick={() => setAnnual(true)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-semibold transition-all flex items-center gap-1.5",
                    annual ? "bg-white text-[#0F0F1A] shadow-sm" : "text-[#5B5F7A]"
                  )}
                >
                  Annuel
                  <span className="rounded-full bg-[#5257C9]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#5257C9]">
                    -20%
                  </span>
                </button>
              </div>
            </Reveal>
          </div>

          {/* Plans */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.1} className={cn(plan.highlighted && "lg:scale-105")}>
                <div
                  className={cn(
                    "relative h-full rounded-3xl p-8 flex flex-col",
                    plan.highlighted
                      ? "bg-gradient-to-br from-[#5257C9]/5 to-[#7578E8]/5 border-2 border-[#5257C9] shadow-2xl shadow-[#5257C9]/15"
                      : "bg-white border border-black/5 shadow-sm"
                  )}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#5257C9] to-[#7578E8] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-[#5257C9]/30">
                      Populaire
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-[#0F0F1A]">{plan.name}</h3>
                  <p className="text-sm text-[#5B5F7A] mt-2 min-h-[2.5rem]">{plan.description}</p>
                  <div className="mt-6">
                    <PriceTag plan={plan} annual={annual} />
                    {plan.monthly !== null && annual && (
                      <p className="text-xs text-[#5B5F7A] mt-1">facturé annuellement</p>
                    )}
                    {plan.monthly !== null && !annual && (
                      <p className="text-xs text-[#5B5F7A] mt-1">facturé mensuellement</p>
                    )}
                  </div>
                  <ul className="mt-6 space-y-3 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[#0F0F1A]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5257C9]/10">
                          <Check className="h-3 w-3 text-[#5257C9]" />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    {plan.highlighted ? (
                      <button
                        onClick={onSignup}
                        className="w-full bg-gradient-to-r from-[#5257C9] to-[#7578E8] text-white px-6 py-3.5 rounded-xl font-semibold shadow-lg shadow-[#5257C9]/25 hover:shadow-xl hover:shadow-[#5257C9]/40 hover:-translate-y-0.5 transition-all"
                      >
                        {plan.cta}
                      </button>
                    ) : (
                      <button
                        onClick={plan.name === "Enterprise" ? onLogin : onSignup}
                        className="w-full border border-[#5257C9]/20 text-[#5257C9] px-6 py-3.5 rounded-xl font-semibold hover:bg-[#5257C9]/5 hover:border-[#5257C9]/40 transition-all"
                      >
                        {plan.cta}
                      </button>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 8 : FAQ — MINIMAL ============ */}
      <section id="faq" className="bg-[#FAFBFF] py-28 sm:py-32 scroll-mt-20">
        <div className="mx-auto max-w-3xl px-4">
          <div className="text-center">
            <Reveal>
              <SectionLabel>FAQ</SectionLabel>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-[#0F0F1A]">
                Questions fréquentes
              </h2>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="mt-12">
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border-b border-black/5"
                >
                  <AccordionTrigger className="text-left text-lg font-medium text-[#0F0F1A] py-5 hover:no-underline hover:text-[#5257C9] transition-colors">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base text-[#5B5F7A] leading-relaxed pb-5">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ============ SECTION 9 : FINAL CTA + FOOTER ============ */}
      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#5257C9] via-[#7578E8] to-[#06B6D4] py-28 sm:py-32">
        <AuroraBlobs variant="onGradient" />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <Reveal>
            <img
              src="/logo-feedbackpro.png"
              alt="FeedbackPro"
              className="h-12 w-auto mx-auto brightness-0 invert mb-6"
            />
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
              Prêt à transformer vos clients en auditeurs qualité ?
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-lg text-white/80 mt-4">
              5 minutes de setup. Pas de carte bancaire.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <button
              onClick={onSignup}
              className="mt-8 inline-flex items-center gap-2 bg-white text-[#5257C9] px-8 py-4 rounded-xl font-bold shadow-2xl hover:scale-105 transition-transform"
            >
              Essayer gratuitement
              <ArrowRight className="h-4 w-4" />
            </button>
          </Reveal>
          <Reveal delay={0.2}>
            <button
              onClick={onLogin}
              className="mt-4 block mx-auto text-sm font-medium text-white/80 hover:text-white transition-colors"
            >
              Ou se connecter
            </button>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0A0B1A] text-[#8888AA]">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="md:col-span-1">
              <img
                src="/logo-feedbackpro.png"
                alt="FeedbackPro"
                className="h-10 w-auto brightness-0 invert opacity-60 mb-4"
              />
              <p className="text-sm leading-relaxed max-w-xs">
                L'audit qualité continu pour votre établissement. Transformez chaque
                client en auditeur.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#F0F2FF] mb-4">Produit</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#features" className="hover:text-[#F0F2FF] transition-colors">Fonctionnalités</a></li>
                <li><a href="#how" className="hover:text-[#F0F2FF] transition-colors">Comment ça marche</a></li>
                <li><a href="#pricing" className="hover:text-[#F0F2FF] transition-colors">Tarifs</a></li>
                <li><a href="#faq" className="hover:text-[#F0F2FF] transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#F0F2FF] mb-4">Société</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">À propos</a></li>
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">Carrières</a></li>
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#F0F2FF] mb-4">Légal</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">CGU</a></li>
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">Confidentialité</a></li>
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">RGPD</a></li>
                <li><a href="#" className="hover:text-[#F0F2FF] transition-colors">Mentions légales</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#8888AA]">
              © {new Date().getFullYear()} FeedbackPro. Tous droits réservés.
            </p>
            <p className="text-xs text-[#8888AA] flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              Conforme RGPD · Données hébergées en Europe
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
