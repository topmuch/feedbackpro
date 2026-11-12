"use client"

// ============================================================
// FeedbackPro — Landing SaaS Premium (refoundation)
// ------------------------------------------------------------
// 8 sections. Light mode only. Palette premium :
//   • Background  #FAFAFC
//   • Surface     #FFFFFF
//   • Primary     #5257C9 (indigo) + gradient -> #7578E8
//   • Accent      #06B6D4 (cyan)
//   • Text        #1A1A2E · Muted #6B6F82
// Animations : framer-motion (reveals, count-up, scroll timeline) +
// pures keyframes CSS pour le mockup hero (boucle 5s synchronisée).
// Toutes les actions passent par onLogin / onSignup.
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useInView, useScroll, useSpring } from "framer-motion"
import {
  ArrowRight,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Menu,
  MessageSquare,
  Play,
  Plane,
  QrCode,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Trophy,
  Utensils,
  X,
} from "lucide-react"
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
// Keyframes CSS (boucle mockup hero + helpers)
// Cycle 5s, parfaitement synchronisé : les feedbacks apparaissent
// en cascade (0/6/12/18 %), puis les priorités (26/32/38 %),
// maintien, puis fade-out global à 96 -> 100 %.
// ------------------------------------------------------------
const KEYFRAMES = `
@keyframes fbp-card1 { 0%{opacity:0;transform:translateX(-14px)} 4%{opacity:1;transform:translateX(0)} 96%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-14px)} }
@keyframes fbp-card2 { 0%,5%{opacity:0;transform:translateX(-14px)} 9%{opacity:1;transform:translateX(0)} 96%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-14px)} }
@keyframes fbp-card3 { 0%,11%{opacity:0;transform:translateX(-14px)} 15%{opacity:1;transform:translateX(0)} 96%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-14px)} }
@keyframes fbp-card4 { 0%,17%{opacity:0;transform:translateX(-14px)} 21%{opacity:1;transform:translateX(0)} 96%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-14px)} }
@keyframes fbp-prio1 { 0%,25%{opacity:0;transform:translateY(8px)} 29%{opacity:1;transform:translateY(0)} 96%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(8px)} }
@keyframes fbp-prio2 { 0%,31%{opacity:0;transform:translateY(8px)} 35%{opacity:1;transform:translateY(0)} 96%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(8px)} }
@keyframes fbp-prio3 { 0%,37%{opacity:0;transform:translateY(8px)} 41%{opacity:1;transform:translateY(0)} 96%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(8px)} }
@keyframes fbp-marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes fbp-blink { 0%,100%{opacity:1} 50%{opacity:.25} }
@keyframes fbp-bar { 0%,100%{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
@keyframes fbp-pulse { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(2.4);opacity:0} }
@keyframes fbp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
`

const NAV_LINKS = [
  { label: "Fonctionnalités", id: "fonctionnalites" },
  { label: "Comment ça marche", id: "comment-ca-marche" },
  { label: "Tarifs", id: "tarifs" },
  { label: "FAQ", id: "faq" },
] as const

function scrollToId(id: string) {
  if (typeof document === "undefined") return
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

// ------------------------------------------------------------
// Reveal — wrapper framer-motion (apparition au scroll)
// ------------------------------------------------------------
function Reveal({
  children,
  delay = 0,
  y = 20,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ------------------------------------------------------------
// AnimatedNumber — count-up au scroll (hook maison + useInView)
// ------------------------------------------------------------
function AnimatedNumber({
  value,
  suffix = "",
  duration = 1500,
}: {
  value: number
  suffix?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(value * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [inView, value, duration])

  return (
    <span ref={ref}>
      {Math.round(display)}
      {suffix}
    </span>
  )
}

// ============================================================
// SECTION 1 — Header (sticky glass)
// ============================================================
function LogoMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#5257C9] to-[#7578E8] shadow-sm shadow-[#5257C9]/30">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <span className="text-lg font-bold tracking-tight text-[#1A1A2E]">
        Feedback<span className="text-[#5257C9]">Pro</span>
      </span>
    </div>
  )
}

function PrimaryButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5257C9] to-[#7578E8] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#5257C9]/20 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#5257C9]/30 active:scale-100 ${className}`}
    >
      {children}
    </button>
  )
}

function SiteHeader({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [open, setOpen] = useState(false)

  const navButtons = (
    <nav className="flex flex-col gap-1 md:flex-row md:items-center md:gap-1">
      {NAV_LINKS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => {
            setOpen(false)
            scrollToId(l.id)
          }}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[#6B6F82] transition-colors hover:bg-[#5257C9]/5 hover:text-[#5257C9] md:px-3"
        >
          {l.label}
        </button>
      ))}
    </nav>
  )

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-black/5 bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => scrollToId("top")} className="shrink-0">
          <LogoMark />
        </button>

        <div className="hidden md:block">{navButtons}</div>

        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={onLogin}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[#1A1A2E] transition-colors hover:bg-[#5257C9]/5 hover:text-[#5257C9]"
          >
            Se connecter
          </button>
          <PrimaryButton onClick={onSignup}>Essayer gratuitement</PrimaryButton>
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Ouvrir le menu"
                className="grid h-10 w-10 place-items-center rounded-lg border border-black/5 bg-white text-[#1A1A2E] shadow-sm"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] border-black/5 bg-white p-0">
              <SheetHeader className="border-b border-black/5 px-5 py-4">
                <SheetTitle className="text-left">
                  <LogoMark />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-3 py-4">{navButtons}</div>
              <div className="mt-auto flex flex-col gap-2 border-t border-black/5 px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onLogin()
                  }}
                  className="rounded-lg border border-[#5257C9]/20 px-4 py-2.5 text-sm font-semibold text-[#5257C9] transition-colors hover:bg-[#5257C9]/5"
                >
                  Se connecter
                </button>
                <PrimaryButton
                  onClick={() => {
                    setOpen(false)
                    onSignup()
                  }}
                >
                  Essayer gratuitement
                </PrimaryButton>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

// ============================================================
// SECTION 2 — Hero + mockup animé CSS (centerpiece)
// ============================================================
function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string
  value: string
  sub: string
  icon: ReactNode
  tone: string
}) {
  return (
    <div className="rounded-lg border border-black/5 bg-white p-2.5 shadow-sm sm:p-3">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-semibold uppercase tracking-wide text-[#6B6F82] sm:text-[9px]">
          {label}
        </span>
        <span className={`grid h-4 w-4 place-items-center rounded ${tone}`}>{icon}</span>
      </div>
      <div className="mt-1 font-mono text-base font-bold text-[#1A1A2E] sm:text-lg">{value}</div>
      <div className="text-[8px] text-[#6B6F82] sm:text-[9px]">{sub}</div>
    </div>
  )
}

function FeedbackCardMini({
  delay,
  name,
  time,
  text,
  status,
  statusTone,
}: {
  delay: string
  name: string
  time: string
  text: string
  status: string
  statusTone: string
}) {
  return (
    <div
      className="rounded-md border border-black/5 bg-white p-2 shadow-sm"
      style={{ animation: `${delay} 5s ease-in-out infinite` }}
    >
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 shrink-0 rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8]" />
        <span className="text-[8px] font-semibold text-[#1A1A2E] sm:text-[9px]">{name}</span>
        <span className="text-[7px] text-[#6B6F82] sm:text-[8px]">· {time}</span>
        <span
          className={`ml-auto rounded-full px-1.5 py-0.5 text-[6px] font-semibold sm:text-[7px] ${statusTone}`}
        >
          {status}
        </span>
      </div>
      <p className="mt-1 text-[8px] leading-tight text-[#6B6F82] sm:text-[9px]">{text}</p>
    </div>
  )
}

function PriorityItemMini({ delay, n, text }: { delay: string; n: number; text: string }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border border-[#5257C9]/10 bg-[#5257C9]/5 p-1.5"
      style={{ animation: `${delay} 5s ease-in-out infinite` }}
    >
      <div className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] font-mono text-[8px] font-bold text-white">
        {n}
      </div>
      <p className="flex-1 text-[8px] leading-tight text-[#1A1A2E] sm:text-[9px]">{text}</p>
      <span className="rounded bg-[#5257C9] px-1 py-0.5 text-[6px] font-semibold text-white sm:text-[7px]">
        Action
      </span>
    </div>
  )
}

function HeroMockup() {
  return (
    <div className="relative w-full max-w-[560px]">
      {/* Halo derrière la fenêtre */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-[#5257C9]/15 to-[#06B6D4]/10 blur-2xl" />

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl shadow-[#5257C9]/10">
        {/* Top bar navigateur */}
        <div className="flex items-center gap-2 border-b border-black/5 bg-[#F4F5F8] px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div className="ml-2 flex h-5 flex-1 items-center gap-1.5 rounded-md border border-black/5 bg-white px-2">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="text-[#6B6F82]">
              <path
                d="M6 10V8a6 6 0 1112 0v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor" />
            </svg>
            <span className="text-[9px] text-[#6B6F82]">app.feedbackpro.com/dashboard</span>
          </div>
        </div>

        {/* Contenu dashboard */}
        <div className="space-y-3 bg-[#FAFAFC] p-3 sm:p-4">
          {/* Ligne 1 — 3 KPIs */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <KpiCard
              label="NPS"
              value="+47"
              sub="+12 cette semaine"
              tone="bg-[#4CC96B]/15 text-[#2E9E4A]"
              icon={<TrendingUp className="h-2.5 w-2.5" />}
            />
            <KpiCard
              label="Feedbacks"
              value="23"
              sub="aujourd'hui"
              tone="bg-[#5257C9]/15 text-[#5257C9]"
              icon={<MessageSquare className="h-2.5 w-2.5" />}
            />
            <KpiCard
              label="Résolus"
              value="98%"
              sub="sous 24 h"
              tone="bg-[#06B6D4]/15 text-[#0891B2]"
              icon={<CheckCircle2 className="h-2.5 w-2.5" />}
            />
          </div>

          {/* Ligne 2 — Flux + IA Coach */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {/* Flux de feedbacks (60 %) */}
            <div className="col-span-3 rounded-lg border border-black/5 bg-white p-2.5 shadow-sm sm:p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[9px] font-semibold text-[#1A1A2E] sm:text-[10px]">
                  Derniers feedbacks
                </span>
                <span className="flex items-center gap-1 text-[7px] text-[#2E9E4A] sm:text-[8px]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full bg-[#4CC96B]"
                      style={{ animation: "fbp-blink 1.6s ease-in-out infinite" }}
                    />
                  </span>
                  Live
                </span>
              </div>
              <div className="space-y-1.5">
                <FeedbackCardMini
                  delay="fbp-card1"
                  name="Table 12"
                  time="2 min"
                  text="Accueil chaleureux, plat un peu lent à sortir."
                  status="À traiter"
                  statusTone="bg-[#FEBC2E]/20 text-[#B07A12]"
                />
                <FeedbackCardMini
                  delay="fbp-card2"
                  name="Chambre 204"
                  time="6 min"
                  text="Chambre impeccable, literie très confortable."
                  status="Positif"
                  statusTone="bg-[#4CC96B]/20 text-[#2E9E4A]"
                />
                <FeedbackCardMini
                  delay="fbp-card3"
                  name="Vol AF 1247"
                  time="11 min"
                  text="Embarquement confus, signalisation peu claire."
                  status="Urgent"
                  statusTone="bg-[#E0447E]/20 text-[#B83361]"
                />
                <FeedbackCardMini
                  delay="fbp-card4"
                  name="Boutique N°3"
                  time="18 min"
                  text="Conseillère très disponible et aimable."
                  status="Positif"
                  statusTone="bg-[#4CC96B]/20 text-[#2E9E4A]"
                />
              </div>
            </div>

            {/* IA Coach (40 %) */}
            <div className="col-span-2 rounded-lg border border-[#5257C9]/15 bg-white p-2.5 shadow-sm sm:p-3">
              <div className="mb-2 flex items-center gap-1">
                <div className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-[#5257C9] to-[#7578E8]">
                  <Sparkles className="h-2.5 w-2.5 text-white" />
                </div>
                <span className="text-[9px] font-semibold text-[#1A1A2E] sm:text-[10px]">
                  Priorités du jour
                </span>
              </div>
              <div className="space-y-1.5">
                <PriorityItemMini delay="fbp-prio1" n={1} text="Clarifier signalisation embarquement" />
                <PriorityItemMini delay="fbp-prio2" n={2} text="Réduire temps d'attente table 12" />
                <PriorityItemMini delay="fbp-prio3" n={3} text="Remercier équipe chambre 204" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Badge flottant IA */}
      <div
        className="absolute -left-3 top-24 hidden rounded-lg border border-black/5 bg-white px-3 py-2 shadow-lg sm:block"
        style={{ animation: "fbp-float 4s ease-in-out infinite" }}
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#5257C9]" />
          <div>
            <div className="text-[9px] font-semibold text-[#1A1A2E]">IA Coach actif</div>
            <div className="text-[8px] text-[#6B6F82]">3 priorités générées</div>
          </div>
        </div>
      </div>

      {/* Badge flottant satisfaction */}
      <div
        className="absolute -right-3 bottom-16 hidden rounded-lg border border-black/5 bg-white px-3 py-2 shadow-lg sm:block"
        style={{ animation: "fbp-float 4.5s ease-in-out infinite 0.4s" }}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#2E9E4A]" />
          <div>
            <div className="text-[9px] font-semibold text-[#1A1A2E]">NPS en hausse</div>
            <div className="text-[8px] text-[#6B6F82]">+12 pts / 7 jours</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Hero({ onSignup }: { onSignup: () => void }) {
  return (
    <section id="top" className="relative isolate overflow-hidden bg-[#FAFAFC]">
      {/* Mesh gradient ambient */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#5257C9]/20 blur-3xl" />
        <div className="absolute right-0 top-32 h-96 w-96 rounded-full bg-[#06B6D4]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[#7578E8]/15 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:py-28">
        {/* Colonne texte */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-start"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5257C9]/20 bg-[#5257C9]/5 px-3 py-1.5 text-xs font-semibold text-[#5257C9]">
            <Sparkles className="h-3.5 w-3.5" />
            Nouveau : IA Coach qualité continu
          </span>

          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-[#1A1A2E] sm:text-5xl lg:text-6xl xl:text-7xl">
            L&apos;audit qualité continu pour votre établissement
          </h1>

          <p className="mt-5 max-w-xl text-base text-[#6B6F82] sm:text-lg">
            Transformez chaque client en auditeur qualité. Recevez chaque jour 3 priorités concrètes
            issues de l&apos;IA qui analyse tous vos feedbacks.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onSignup}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5257C9] to-[#7578E8] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#5257C9]/20 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#5257C9]/30 active:scale-100"
            >
              Essayer gratuitement
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollToId("comment-ca-marche")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#5257C9]/20 bg-white px-8 py-4 text-base font-semibold text-[#5257C9] transition-all hover:bg-[#5257C9]/5"
            >
              <Play className="h-4 w-4" />
              Voir la démo
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#6B6F82] sm:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-[#2E9E4A]" />
              Pas de carte bancaire
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-[#2E9E4A]" />
              Annulez en 1 clic
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-[#2E9E4A]" />
              Setup en 5 minutes
            </span>
          </div>
        </motion.div>

        {/* Colonne mockup */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
          className="flex justify-center lg:justify-end"
        >
          <HeroMockup />
        </motion.div>
      </div>
    </section>
  )
}

// ============================================================
// SECTION 3 — Problème (stats count-up)
// ============================================================
function ProblemSection() {
  const stats = [
    { value: 73, suffix: "%", text: "des clients mécontents partent sans rien dire" },
    { value: 12, suffix: "x", text: "expériences positives pour effacer 1 mauvaise" },
    { value: 5, suffix: "min", text: "le temps qu&apos;il faut pour perdre un client à jamais" },
  ]

  return (
    <section className="border-y border-black/5 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] sm:text-4xl">
            Le problème du feedback invisible
          </h2>
          <p className="mt-4 text-base text-[#6B6F82] sm:text-lg">
            La majorité de vos clients mécontents ne disent rien. Ils partent, et vous ne le saurez
            jamais.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
          {stats.map((s, i) => (
            <Reveal key={i} delay={i * 0.12} className="text-center">
              <div className="font-mono text-5xl font-bold tracking-tight text-[#5257C9] sm:text-6xl">
                <AnimatedNumber value={s.value} suffix={s.suffix} />
              </div>
              <p className="mx-auto mt-3 max-w-xs text-sm text-[#6B6F82] sm:text-base">
                {s.text}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SECTION 4 — Solution (bento grid)
// ============================================================
function BentoTile({
  title,
  desc,
  icon,
  children,
  className = "",
  contentClassName = "",
}: {
  title: string
  desc: string
  icon: ReactNode
  children?: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <div
      className={`group flex flex-col rounded-2xl border border-black/5 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#5257C9]/10 to-[#7578E8]/10 text-[#5257C9]">
          {icon}
        </div>
        <h3 className="text-lg font-bold tracking-tight text-[#1A1A2E]">{title}</h3>
      </div>
      <p className="text-sm text-[#6B6F82]">{desc}</p>
      {children && <div className={`mt-5 ${contentClassName}`}>{children}</div>}
    </div>
  )
}

function SolutionSection() {
  return (
    <section id="fonctionnalites" className="scroll-mt-20 bg-[#FAFAFC] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] sm:text-4xl lg:text-5xl">
            Une seule plateforme. Tout l&apos;audit qualité.
          </h2>
          <p className="mt-4 text-base text-[#6B6F82] sm:text-lg">
            Collecte, analyse, action. Du feedback brut à la priorité concrète, sans intermédiaire.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Tile 1 — IA Coach (large, col-span-2) */}
          <BentoTile
            title="IA Coach qualité continu"
            desc="Chaque jour, 3 priorités concrètes générées automatiquement à partir de l'ensemble de vos feedbacks. Fini le tri manuel."
            icon={<Bot className="h-5 w-5" />}
            className="md:col-span-2 md:col-start-1 md:row-start-1"
            contentClassName="rounded-xl border border-black/5 bg-[#FAFAFC] p-4"
          >
            <div className="space-y-2">
              {[
                "Clarifier la signalisation d'embarquement (zone B)",
                "Réduire le temps d'attente moyen à 4 min",
                "Remercier l'équipe chambre 204 (top feedback)",
              ].map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-[#5257C9]/10 bg-white p-2.5"
                >
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] font-mono text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  <span className="flex-1 text-sm text-[#1A1A2E]">{t}</span>
                  <span className="rounded-md bg-[#5257C9] px-2 py-1 text-[10px] font-semibold text-white">
                    Action
                  </span>
                </div>
              ))}
            </div>
          </BentoTile>

          {/* Tile 2 — Feedback temps réel */}
          <BentoTile
            title="Feedback temps réel"
            desc="Chaque retour arrive en direct sur votre tableau de bord. Traquez les signaux faibles avant qu'ils ne deviennent des crises."
            icon={<MessageSquare className="h-5 w-5" />}
            className="md:col-start-1 md:row-start-2"
            contentClassName="space-y-2"
          >
            {[
              { n: "Table 7", t: "Service un peu long", tone: "bg-[#FEBC2E]/20 text-[#B07A12]" },
              { n: "Chambre 102", t: "Petit-déjeuner excellent", tone: "bg-[#4CC96B]/20 text-[#2E9E4A]" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-black/5 bg-[#FAFAFC] p-2.5">
                <div className="h-2 w-2 rounded-full bg-[#4CC96B]" />
                <span className="text-xs font-semibold text-[#1A1A2E]">{f.n}</span>
                <span className="flex-1 truncate text-xs text-[#6B6F82]">{f.t}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.tone}`}>
                  Live
                </span>
              </div>
            ))}
          </BentoTile>

          {/* Tile 3 — Multi-secteur */}
          <BentoTile
            title="Multi-secteur"
            desc="Restauration, hôtellerie, transport, commerce. Une solution pensée pour chaque métier."
            icon={<Store className="h-5 w-5" />}
            className="md:col-start-2 md:row-start-2"
            contentClassName="flex items-center gap-4"
          >
            <div className="flex flex-1 items-center justify-around rounded-xl border border-black/5 bg-[#FAFAFC] py-4">
              {[
                { icon: <Utensils className="h-5 w-5" />, label: "Resto" },
                { icon: <Plane className="h-5 w-5" />, label: "Voyage" },
                { icon: <Store className="h-5 w-5" />, label: "Commerce" },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 text-[#5257C9]">
                  {s.icon}
                  <span className="text-[10px] font-medium text-[#6B6F82]">{s.label}</span>
                </div>
              ))}
            </div>
          </BentoTile>

          {/* Tile 4 — Photos + analyse VLM (large) */}
          <BentoTile
            title="Photos + analyse VLM"
            desc="Vos clients envoient des photos. Notre IA vision identifie les problèmes concrets : propreté, présentation, décoration."
            icon={<Camera className="h-5 w-5" />}
            className="md:col-span-2 md:col-start-1 md:row-start-3"
            contentClassName="grid grid-cols-2 gap-3"
          >
            <div className="relative overflow-hidden rounded-xl border border-black/5 bg-gradient-to-br from-[#1A1A2E]/5 to-[#5257C9]/10 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6B6F82]">
                Avant
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md bg-[#E0447E]/20 px-2 py-1 text-[10px] font-semibold text-[#B83361]">
                  Détection IA
                </span>
                <span className="text-xs text-[#6B6F82]">Table non nettoyée</span>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-[#5257C9]/15 bg-gradient-to-br from-[#4CC96B]/10 to-[#5257C9]/10 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2E9E4A]">
                Après
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md bg-[#4CC96B]/20 px-2 py-1 text-[10px] font-semibold text-[#2E9E4A]">
                  Résolu
                </span>
                <span className="text-xs text-[#6B6F82]">Conforme standard</span>
              </div>
            </div>
          </BentoTile>

          {/* Tile 5 — Gamification équipe (tall) */}
          <BentoTile
            title="Gamification équipe"
            desc="Motivez vos équipes. Un classement mensuel valorise les meilleurs retours et fidélise."
            icon={<Trophy className="h-5 w-5" />}
            className="md:col-start-3 md:row-span-3 md:row-start-1"
            contentClassName="space-y-2"
          >
            {[
              { r: 1, n: "Sophie L.", s: "92", c: "from-[#FEBC2E] to-[#E8B54D]" },
              { r: 2, n: "Karim B.", s: "84", c: "from-[#9CA3AF] to-[#6B7280]" },
              { r: 3, n: "Léa M.", s: "79", c: "from-[#D97757] to-[#B45309]" },
              { r: 4, n: "Antoine R.", s: "71", c: "from-[#5257C9] to-[#7578E8]" },
            ].map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-black/5 bg-[#FAFAFC] p-2.5"
              >
                <div
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${p.c} font-mono text-xs font-bold text-white`}
                >
                  {p.r}
                </div>
                <span className="flex-1 truncate text-sm font-medium text-[#1A1A2E]">{p.n}</span>
                <span className="font-mono text-sm font-bold text-[#5257C9]">{p.s}</span>
              </div>
            ))}
          </BentoTile>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SECTION 5 — Comment ça marche (timeline scroll-driven)
// ============================================================
function StepMiniQR() {
  const pattern = [
    1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
  ]
  return (
    <div className="grid grid-cols-5 gap-0.5 rounded-lg border border-black/5 bg-white p-2">
      {pattern.map((v, i) => (
        <div
          key={i}
          className={`aspect-square rounded-[1px] ${v ? "bg-[#1A1A2E]" : "bg-transparent"}`}
        />
      ))}
    </div>
  )
}

function StepMiniNotif() {
  return (
    <div className="relative rounded-lg border border-black/5 bg-white p-3">
      <div className="absolute -right-1 -top-1 flex h-3 w-3">
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-[#E0447E]"
          style={{ animation: "fbp-pulse 1.8s ease-out infinite" }}
        />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-[#E0447E]" />
      </div>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-[#5257C9]" />
        <span className="text-[10px] font-semibold text-[#1A1A2E]">Nouveau feedback</span>
      </div>
      <p className="mt-1 text-[9px] text-[#6B6F82]">Table 7 · il y a quelques secondes</p>
    </div>
  )
}

function StepMiniProcess() {
  return (
    <div className="flex h-16 items-end justify-center gap-1.5 rounded-lg border border-black/5 bg-white p-3">
      {[0, 0.2, 0.4, 0.15, 0.3].map((d, i) => (
        <div
          key={i}
          className="w-2 origin-bottom rounded-full bg-gradient-to-t from-[#5257C9] to-[#7578E8]"
          style={{
            height: "100%",
            animation: `fbp-bar 1.1s ease-in-out infinite ${d}s`,
          }}
        />
      ))}
    </div>
  )
}

function StepMiniPriorities() {
  return (
    <div className="space-y-1.5">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="flex items-center gap-2 rounded-md border border-[#5257C9]/10 bg-white p-1.5"
        >
          <div className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] font-mono text-[8px] font-bold text-white">
            {n}
          </div>
          <div className="h-1.5 flex-1 rounded-full bg-[#5257C9]/15" />
        </div>
      ))}
    </div>
  )
}

function HowItWorksSection() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "end 0.5"],
  })
  const scaleX = useSpring(scrollYProgress, { stiffness: 80, damping: 22 })
  const scaleY = useSpring(scrollYProgress, { stiffness: 80, damping: 22 })

  const steps = [
    {
      n: 1,
      title: "Client scanne le QR",
      desc: "Un QR code affiché sur table, chambre ou comptoir. Aucune app à installer.",
      icon: <QrCode className="h-5 w-5" />,
      visual: <StepMiniQR />,
    },
    {
      n: 2,
      title: "Feedback arrive",
      desc: "Le client laisse un retour en 30 secondes. Notif en temps réel sur votre dashboard.",
      icon: <MessageSquare className="h-5 w-5" />,
      visual: <StepMiniNotif />,
    },
    {
      n: 3,
      title: "IA analyse",
      desc: "Le moteur IA catégorise, détecte l'urgence et croise avec l'historique.",
      icon: <Bot className="h-5 w-5" />,
      visual: <StepMiniProcess />,
    },
    {
      n: 4,
      title: "Vous agissez",
      desc: "3 priorités du jour vous guident. Mesurez l'impact en temps réel.",
      icon: <CheckCircle2 className="h-5 w-5" />,
      visual: <StepMiniPriorities />,
    },
  ]

  return (
    <section id="comment-ca-marche" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" ref={ref}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] sm:text-4xl lg:text-5xl">
            Comment ça marche
          </h2>
          <p className="mt-4 text-base text-[#6B6F82] sm:text-lg">4 étapes, 5 minutes de setup.</p>
        </Reveal>

        {/* Desktop — timeline horizontale */}
        <div className="relative mt-16 hidden md:block">
          <div className="absolute left-0 right-0 top-[2.25rem] h-1 -translate-y-1/2 rounded-full bg-black/5" />
          <motion.div
            style={{ scaleX }}
            className="absolute left-0 top-[2.25rem] h-1 origin-left -translate-y-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7578E8]"
          />
          <div className="grid grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1} className="flex flex-col items-center text-center">
                <div className="relative z-10 grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-[#5257C9] to-[#7578E8] text-white shadow-lg shadow-[#5257C9]/20">
                  {s.icon}
                </div>
                <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#5257C9]">
                  Étape {s.n}
                </div>
                <h3 className="mt-1 text-lg font-bold text-[#1A1A2E]">{s.title}</h3>
                <p className="mt-2 text-sm text-[#6B6F82]">{s.desc}</p>
                <div className="mt-4 w-full max-w-[180px]">{s.visual}</div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Mobile — timeline verticale */}
        <div className="relative mt-12 md:hidden">
          <div className="absolute bottom-0 left-[1.25rem] top-0 w-1 -translate-x-1/2 rounded-full bg-black/5" />
          <motion.div
            style={{ scaleY }}
            className="absolute bottom-0 left-[1.25rem] top-0 w-1 origin-top -translate-x-1/2 rounded-full bg-gradient-to-b from-[#5257C9] to-[#7578E8]"
          />
          <div className="space-y-8">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08} className="relative flex gap-4">
                <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7578E8] text-white shadow-lg shadow-[#5257C9]/20">
                  {s.icon}
                </div>
                <div className="flex-1 pt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5257C9]">
                    Étape {s.n}
                  </div>
                  <h3 className="mt-0.5 text-base font-bold text-[#1A1A2E]">{s.title}</h3>
                  <p className="mt-1 text-sm text-[#6B6F82]">{s.desc}</p>
                  <div className="mt-3 max-w-[200px]">{s.visual}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SECTION 6 — Preuve sociale (metrics + marquee testimonials)
// ============================================================
type Testimonial = {
  initials: string
  name: string
  role: string
  sector: string
  color: string
  quote: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    initials: "AM",
    name: "Anne Mercier",
    role: "Directrice",
    sector: "Restauration",
    color: "#5257C9",
    quote:
      "En 3 semaines, notre NPS a grimpé de 12 points. L'IA Coach nous donne chaque matin une feuille de route claire.",
  },
  {
    initials: "KB",
    name: "Karim Benali",
    role: "Manager opérationnel",
    sector: "Hôtellerie",
    color: "#06B6D4",
    quote:
      "On capte enfin le feedback des clients qui ne se plaignent jamais. C'est une mine d'or pour la qualité.",
  },
  {
    initials: "LR",
    name: "Léa Rousseau",
    role: "Responsable expérience",
    sector: "Transport",
    color: "#5257C9",
    quote:
      "Le scan QR en cabine a transformé nos retours. Les équipes sont engagées grâce au classement mensuel.",
  },
  {
    initials: "TD",
    name: "Thomas Dubois",
    role: "Gérant",
    sector: "Commerce",
    color: "#06B6D4",
    quote:
      "Setup en 5 minutes, aucune compétence technique requise. Le rapport coût/impact est imbattable.",
  },
  {
    initials: "SF",
    name: "Sophie Fontaine",
    role: "Quality Manager",
    sector: "Hôtellerie",
    color: "#5257C9",
    quote:
      "L'analyse photos par IA a révélé des problèmes de présentation qu'on n'aurait jamais détectés autrement.",
  },
  {
    initials: "JV",
    name: "Julien Vidal",
    role: "Directeur",
    sector: "Restauration",
    color: "#06B6D4",
    quote:
      "3 priorités chaque matin, pas un rapport de 50 pages. On agit enfin au bon moment.",
  },
]

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div className="flex w-[320px] shrink-0 flex-col rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:w-[360px]">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-[#FEBC2E] text-[#FEBC2E]" />
        ))}
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-[#1A1A2E]">"{t.quote}"</p>
      <div className="mt-4 flex items-center gap-3 border-t border-black/5 pt-4">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: t.color }}
        >
          {t.initials}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-[#1A1A2E]">{t.name}</div>
          <div className="text-xs text-[#6B6F82]">{t.role}</div>
        </div>
        <span className="rounded-full border border-[#5257C9]/15 bg-[#5257C9]/5 px-2.5 py-1 text-[10px] font-semibold text-[#5257C9]">
          {t.sector}
        </span>
      </div>
    </div>
  )
}

function SocialProofSection() {
  const metrics = [
    { value: "+2M", label: "feedbacks collectés" },
    { value: "98%", label: "satisfaction équipe" },
    { value: "4.9/5", label: "note moyenne" },
  ]

  return (
    <section className="bg-[#FAFAFC] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] sm:text-4xl lg:text-5xl">
            Ils nous font confiance
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {metrics.map((m, i) => (
            <Reveal key={i} delay={i * 0.1} className="text-center">
              <div className="font-mono text-4xl font-bold text-[#5257C9] sm:text-5xl">{m.value}</div>
              <div className="mt-2 text-sm text-[#6B6F82] sm:text-base">{m.label}</div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Marquee testimonials */}
      <div className="group relative mt-14 overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-[#FAFAFC] to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-[#FAFAFC] to-transparent" />
        <div
          className="flex w-max gap-6 px-3 group-hover:[animation-play-state:paused]"
          style={{ animation: "fbp-marquee 40s linear infinite" }}
        >
          {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
            <TestimonialCard key={i} t={t} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SECTION 7 — Tarifs
// ============================================================
type Plan = {
  name: string
  monthly: number | null
  label: string
  blurb: string
  features: string[]
  cta: string
  highlight?: boolean
  badge?: string
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    monthly: 29,
    label: "par mois",
    blurb: "Pour 1 établissement qui démarre l'audit qualité.",
    features: [
      "1 établissement",
      "Feedbacks temps réel illimités",
      "QR codes dynamiques",
      "Dashboard & KPIs de base",
      "Support par email",
    ],
    cta: "Commencer",
  },
  {
    name: "Pro",
    monthly: 79,
    label: "par mois",
    blurb: "Pour jusqu'à 5 établissements avec IA Coach.",
    features: [
      "Jusqu'à 5 établissements",
      "IA Coach qualité continu",
      "Analyse photos VLM",
      "Gamification & classement équipe",
      "Alertes urgence temps réel",
      "Support prioritaire",
    ],
    cta: "Essayer gratuitement",
    highlight: true,
    badge: "Populaire",
  },
  {
    name: "Enterprise",
    monthly: null,
    label: "sur devis",
    blurb: "Pour les groupes multi-sites et besoins avancés.",
    features: [
      "Établissements illimités",
      "Multi-marques & multi-régions",
      "API & intégrations sur-mesure",
      "SLA dédié & SSO",
      "Customer Success Manager",
      "Onboarding personnalisé",
    ],
    cta: "Contacter",
  },
]

function PriceDisplay({ plan, annual }: { plan: Plan; annual: boolean }) {
  if (plan.monthly === null) {
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-[#1A1A2E]">Sur devis</span>
      </div>
    )
  }
  const price = annual ? Math.round(plan.monthly * 0.8) : plan.monthly
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-4xl font-bold text-[#1A1A2E]">{price}€</span>
      <span className="text-sm text-[#6B6F82]">/ {plan.label}</span>
    </div>
  )
}

function PricingSection({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  const [annual, setAnnual] = useState(false)

  return (
    <section id="tarifs" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] sm:text-4xl lg:text-5xl">
            Des tarifs simples et transparents
          </h2>
          <p className="mt-4 text-base text-[#6B6F82] sm:text-lg">
            Sans engagement. Annulez en 1 clic.
          </p>
        </Reveal>

        {/* Toggle mensuel / annuel */}
        <Reveal delay={0.1} className="mt-8 flex items-center justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-black/5 bg-[#FAFAFC] p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                !annual ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#6B6F82]"
              }`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                annual ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#6B6F82]"
              }`}
            >
              Annuel
              <span className="rounded-full bg-[#4CC96B]/15 px-2 py-0.5 text-[10px] font-bold text-[#2E9E4A]">
                -20%
              </span>
            </button>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => {
            const ctaClick = plan.name === "Enterprise" ? onLogin : onSignup
            return (
              <Reveal key={plan.name} delay={i * 0.1}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border bg-white p-8 transition-all ${
                    plan.highlight
                      ? "border-2 border-[#5257C9] shadow-xl shadow-[#5257C9]/10 lg:-mt-4 lg:mb-4"
                      : "border-black/5 shadow-sm hover:shadow-md"
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7578E8] px-3 py-1 text-xs font-semibold text-white shadow-md">
                      {plan.badge}
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-[#1A1A2E]">{plan.name}</h3>
                  <p className="mt-1 text-sm text-[#6B6F82]">{plan.blurb}</p>
                  <div className="mt-5">
                    <PriceDisplay plan={plan} annual={annual} />
                    {annual && plan.monthly !== null && (
                      <p className="mt-1 text-xs text-[#6B6F82]">facturé annuellement</p>
                    )}
                  </div>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-[#1A1A2E]">
                        <CheckCircle2
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            plan.highlight ? "text-[#5257C9]" : "text-[#2E9E4A]"
                          }`}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={ctaClick}
                    className={`mt-8 w-full rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "bg-gradient-to-r from-[#5257C9] to-[#7578E8] text-white shadow-lg shadow-[#5257C9]/20 hover:scale-[1.02] hover:shadow-xl"
                        : "border border-[#5257C9]/20 text-[#5257C9] hover:bg-[#5257C9]/5"
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SECTION 8 — FAQ + CTA final + Footer
// ============================================================
const FAQS = [
  {
    q: "Comment ça marche ?",
    a: "Vous affichez un QR code dans votre établissement. Vos clients le scannent et laissent un feedback en 30 secondes. Notre IA analyse chaque retour et vous envoie 3 priorités concrètes chaque jour sur votre tableau de bord.",
  },
  {
    q: "Ai-je besoin d'une carte bancaire ?",
    a: "Non. L'essai gratuit démarre sans aucune carte bancaire. Vous ne payez que lorsque vous décidez de passer à un plan payant, après votre période d'essai.",
  },
  {
    q: "Puis-je annuler à tout moment ?",
    a: "Oui, sans engagement. Vous pouvez annuler votre abonnement en 1 clic depuis votre tableau de bord. L'accès reste actif jusqu'à la fin de la période déjà payée.",
  },
  {
    q: "Mes données sont-elles protégées ?",
    a: "Vos données sont chiffrées en transit (TLS) et au repos. Nous sommes conformes RGPD et n'utilisons jamais vos données à des fins commerciales. Vous restez seul propriétaire de vos feedbacks.",
  },
  {
    q: "Ça marche pour mon secteur ?",
    a: "FeedbackPro s'adapte à la restauration, l'hôtellerie, le transport, le commerce et les services. Les formulaires, KPIs et priorités IA sont configurés selon votre métier.",
  },
  {
    q: "Combien de temps pour le setup ?",
    a: "5 minutes. Vous créez votre compte, générez vos QR codes, les imprimez ou les affichez, et vous recevez vos premiers feedbacks. Aucune compétence technique requise.",
  },
]

function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 bg-[#FAFAFC] py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1A1A2E] sm:text-4xl lg:text-5xl">
            Questions fréquentes
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="overflow-hidden rounded-xl border border-black/5 bg-white px-5 shadow-sm data-[state=open]:shadow-md mb-3"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-[#1A1A2E] hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-[#6B6F82]">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

function FinalCTA({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <section className="bg-[#FAFAFC] pb-20 sm:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-t-3xl rounded-b-3xl bg-gradient-to-br from-[#5257C9] to-[#7578E8] px-6 py-16 text-center shadow-2xl shadow-[#5257C9]/20 sm:px-12 sm:py-24">
          {/* Halos décoratifs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-[#06B6D4]/20 blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Prêt à transformer vos clients en auditeurs qualité ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
              5 minutes de setup. Pas de carte bancaire.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4">
              <button
                type="button"
                onClick={onSignup}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-[#5257C9] shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-100"
              >
                Essayer gratuitement
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onLogin}
                className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
              >
                Ou se connecter
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SiteFooter({ onLogin }: { onLogin: () => void }) {
  const cols: { title: string; links: { label: string; onClick: () => void }[] }[] = [
    {
      title: "Produit",
      links: [
        { label: "Fonctionnalités", onClick: () => scrollToId("fonctionnalites") },
        { label: "Tarifs", onClick: () => scrollToId("tarifs") },
        { label: "Démo", onClick: () => scrollToId("comment-ca-marche") },
        { label: "Secteurs", onClick: () => scrollToId("fonctionnalites") },
      ],
    },
    {
      title: "Société",
      links: [
        { label: "À propos", onClick: () => undefined },
        { label: "Blog", onClick: () => undefined },
        { label: "Contact", onClick: onLogin },
        { label: "Carrières", onClick: () => undefined },
      ],
    },
    {
      title: "Légal",
      links: [
        { label: "CGU", onClick: () => undefined },
        { label: "Confidentialité", onClick: () => undefined },
        { label: "RGPD", onClick: () => undefined },
        { label: "Cookies", onClick: () => undefined },
      ],
    },
  ]

  return (
    <footer className="bg-[#1A1A2E] text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#5257C9] to-[#7578E8]">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold">
                Feedback<span className="text-[#7578E8]">Pro</span>
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-white/60">
              L&apos;audit qualité continu pour votre établissement.
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-white">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <button
                      type="button"
                      onClick={link.onClick}
                      className="text-sm text-white/60 transition-colors hover:text-white"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-white/50">
            FeedbackPro — L&apos;audit qualité continu. © {new Date().getFullYear()} FeedbackPro.
            Tous droits réservés.
          </p>
          <p className="text-xs text-white/50">Conçu en France · RGPD</p>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// Export principal — signature préservée
// ============================================================
export function LandingView({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <div className="relative min-h-screen bg-[#FAFAFC] text-[#1A1A2E]">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <SiteHeader onLogin={onLogin} onSignup={onSignup} />
      <main className="flex-1">
        <Hero onSignup={onSignup} />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <SocialProofSection />
        <PricingSection onSignup={onSignup} onLogin={onLogin} />
        <FaqSection />
        <FinalCTA onSignup={onSignup} onLogin={onLogin} />
      </main>
      <SiteFooter onLogin={onLogin} />
    </div>
  )
}
