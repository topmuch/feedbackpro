"use client"

// ============================================================
// FeedbackPro - Landing "Premium Multi-Secteurs" (SPA 9 pages)
// ------------------------------------------------------------
// 9 pages gérées par état client : accueil | restaurant | aeroport
//   | hotel | gare | hopital | erp | apropos | contact.
// URL sync via ?page=xxx (pushState). Popstate géré pour back/forward.
//
// Pages "secteur" (6) construites via une config SECTORS[]
//   consommée par un composant générique <SectorPage/>. Chaque
//   secteur expose : hero, 3 avantages (split/centered-tags),
//   citation Denise, témoignage, CTA -> setPage('contact').
//
// Sections light #F8FAFC + sections dark dramatiques #0F172A pour
//   les parties Tech/Denise. Palette indigo #5257C9 -> violet
//   #7C3AED, accent cyan #06B6D4. Effets : aurora blobs CSS,
//   sound wave Denise (20 bars animées), mockups dashboard /
//   terminal / QR / phone / housekeeping / info-voyageurs /
//   patient-flow / maintenance (HTML/CSS pur), count-up stats,
//   reveals framer-motion (blur->clear), glows, hover lifts.
//
// Logo FeedbackPro : <img src="/logo-feedbackpro.png"> dans le
//   header, le footer, le CTA final et la page À propos (toujours
//   dans un conteneur blanc arrondi sur fond sombre).
//
// Pas de section tarifs sur l'accueil (supprimée par demande).
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useInView } from "framer-motion"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
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
import {
  ArrowRight,
  Plane,
  Utensils,
  Mic,
  Volume2,
  MapPin,
  Shield,
  ShieldAlert,
  Clock,
  Users,
  Sparkles,
  AlertCircle,
  Timer,
  Check,
  CheckCircle2,
  Menu,
  Star,
  Send,
  Building2,
  Waves,
  Activity,
  Zap,
  Eye,
  ChevronRight,
  ChevronDown,
  Phone,
  Mail,
  Trophy,
  Gauge,
  Fingerprint,
  Headset,
  Quote,
  Hotel,
  Bus,
  Stethoscope,
  Landmark,
  BedDouble,
  KeyRound,
  Wifi,
  AirVent,
  BellRing,
  ConciergeBell,
  Megaphone,
  Info,
  HeartPulse,
  Wrench,
  Luggage,
  Signpost,
  Footprints,
  QrCode,
} from "lucide-react"

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type LandingPage =
  | "accueil"
  | "restaurant"
  | "aeroport"
  | "hotel"
  | "gare"
  | "hopital"
  | "erp"
  | "apropos"
  | "contact"

type Navigate = (p: LandingPage) => void

type SectorKey = "restaurant" | "aeroport" | "hotel" | "gare" | "hopital" | "erp"

type LucideIcon = typeof Utensils

type MockupType =
  | "qr"
  | "phone"
  | "terminal"
  | "dashboard"
  | "housekeeping"
  | "infovoyageurs"
  | "patientflow"
  | "maintenanceboard"
  | "denise"

interface Advantage {
  num: string
  icon: LucideIcon
  title: ReactNode
  description: string
  layout: "split-left" | "split-right" | "centered-tags"
  bullets?: string[]
  steps?: { n: string; t: string; d: string; icon: LucideIcon; color: string }[]
  tags?: { label: string; icon: LucideIcon; color: string }[]
  patterns?: { l: string; v: string; c: string }[]
  mockup?: MockupType
  bg: "white" | "light" | "dark"
}

interface SectorConfig {
  key: SectorKey
  label: string
  badge: string
  cardTitle: string
  tagline: string
  icon: LucideIcon
  accentFrom: string
  accentTo: string
  iconGradient: string
  cardClasses: string
  glowClasses: string
  cardTitleColor: string
  cardBodyColor: string
  cardLinkColor: string
  dark: boolean
  ctaVariant: "primary" | "white" | "tech" | "warm" | "ghost"
  heroTitle: ReactNode
  heroSubtitle: string
  qrBadge: string
  qrTitle: string
  qrUrl: string
  qrCaption: string
  advantages: Advantage[]
  deniseQuote: string
  testimonial: {
    name: string
    initials: string
    role: string
    quote: string
  }
}

// ----------------------------------------------------------------------------
// Keyframes CSS injectees une seule fois
// ----------------------------------------------------------------------------
const FBP_CSS = `
@keyframes fbp-aurora1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,30px) scale(0.95)} }
@keyframes fbp-aurora2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,40px) scale(1.05)} }
@keyframes fbp-aurora3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(0.9)} }
@keyframes fbp-wave { 0%,100%{height:20%} 50%{height:100%} }
@keyframes fbp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes fbp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(1.35)} }
@keyframes fbp-slidein { 0%{opacity:0;transform:translateX(-24px)} 12%{opacity:1;transform:translateX(0)} 88%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(-24px)} }
@keyframes fbp-grid-move { 0%{background-position:0 0} 100%{background-position:48px 48px} }
@keyframes fbp-ring { 0%{transform:scale(.6);opacity:.7} 100%{transform:scale(2.4);opacity:0} }
.fbp-aurora1 { animation: fbp-aurora1 22s ease-in-out infinite; }
.fbp-aurora2 { animation: fbp-aurora2 27s ease-in-out infinite; }
.fbp-aurora3 { animation: fbp-aurora3 32s ease-in-out infinite; }
.fbp-bar { animation: fbp-wave 1.4s ease-in-out infinite; }
.fbp-float { animation: fbp-float 5s ease-in-out infinite; }
.fbp-pulse-dot { animation: fbp-pulse 2.2s ease-in-out infinite; }
.fbp-slidein { animation: fbp-slidein 7s ease-in-out infinite; }
.fbp-grid-mask { -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 35%, black 35%, transparent 75%); mask-image: radial-gradient(ellipse 80% 60% at 50% 35%, black 35%, transparent 75%); }
.fbp-grid-dark { background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px); background-size: 48px 48px; }
.fbp-grid-light { background-image: linear-gradient(rgba(15,23,42,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.04) 1px, transparent 1px); background-size: 48px 48px; animation: fbp-grid-move 40s linear infinite; }
.fbp-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.fbp-scrollbar::-webkit-scrollbar-thumb { background: rgba(82,87,201,.35); border-radius: 3px; }
.fbp-scrollbar::-webkit-scrollbar-track { background: transparent; }
.fbp-ring-pulse { animation: fbp-ring 2.4s ease-out infinite; }
`

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

function CountUp({
  to,
  suffix = "",
  duration = 1.6,
}: {
  to: number
  suffix?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(eased * to))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, duration])
  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  )
}

function SoundWave({
  bars = 20,
  className = "",
  barClassName = "",
}: {
  bars?: number
  className?: string
  barClassName?: string
}) {
  return (
    <div
      className={`flex items-end gap-1 ${className}`}
      aria-hidden
    >
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className={`fbp-bar w-[3px] rounded-full bg-gradient-to-t from-[#5257C9] to-[#7C3AED] ${barClassName}`}
          style={{
            animationDelay: `${(i % 6) * 0.13}s`,
            height: "20%",
          }}
        />
      ))}
    </div>
  )
}

function FakeQR({ size = 21, className = "" }: { size?: number; className?: string }) {
  const cells: boolean[] = []
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    const inCorner =
      (x < 7 && y < 7) ||
      (x >= size - 7 && y < 7) ||
      (x < 7 && y >= size - 7)
    if (inCorner) {
      const lx = x < 7 ? x : x - (size - 7)
      const ly = y < 7 ? y : y - (size - 7)
      const isBorder = lx === 0 || lx === 6 || ly === 0 || ly === 6
      const isCenter = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4
      cells.push(isBorder || isCenter)
    } else {
      cells.push(((x * 31 + y * 17 + x * y) % 3) === 0)
    }
  }
  return (
    <div
      className={`grid ${className}`}
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gap: 0 }}
      aria-hidden
    >
      {cells.map((c, i) => (
        <div
          key={i}
          style={{ aspectRatio: "1 / 1" }}
          className={c ? "bg-[#0F172A]" : "bg-white"}
        />
      ))}
    </div>
  )
}

function Aurora({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className={`fbp-aurora1 absolute -top-32 -left-24 h-[42rem] w-[42rem] rounded-full ${
          dark ? "bg-[#5257C9]/30" : "bg-[#5257C9]/20"
        } blur-[140px]`}
      />
      <div
        className={`fbp-aurora2 absolute top-1/4 -right-32 h-[38rem] w-[38rem] rounded-full ${
          dark ? "bg-[#7C3AED]/25" : "bg-[#7C3AED]/15"
        } blur-[140px]`}
      />
      <div
        className={`fbp-aurora3 absolute -bottom-24 left-1/3 h-[34rem] w-[34rem] rounded-full ${
          dark ? "bg-[#06B6D4]/18" : "bg-[#06B6D4]/10"
        } blur-[140px]`}
      />
    </div>
  )
}

function Logo({
  className = "",
}: {
  className?: string
}) {
  // Logo transparent bleu FeedbackPro. Visible sur fond clair.
  // Sur fond sombre, l'appelant l'enveloppe dans un conteneur blanc arrondi.
  return (
    <img
      src="/logo-feedbackpro.png"
      alt="FeedbackPro"
      className={className}
    />
  )
}

// Boutons CTA standardises
function CtaSignup({
  onSignup,
  children = "Essayer gratuitement",
  variant = "primary",
  className = "",
}: {
  onSignup: () => void
  children?: ReactNode
  variant?: "primary" | "white" | "tech" | "warm" | "ghost"
  className?: string
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-[#5257C9] to-[#7C3AED] text-white shadow-lg shadow-[#5257C9]/25 hover:shadow-xl hover:shadow-[#5257C9]/40",
    white:
      "bg-white text-[#0F172A] shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/20",
    tech:
      "bg-gradient-to-r from-[#06B6D4] via-[#5257C9] to-[#7C3AED] text-white shadow-lg shadow-[#5257C9]/30 hover:shadow-xl hover:shadow-[#5257C9]/50",
    warm:
      "bg-gradient-to-r from-[#F59E0B] via-[#FB923C] to-[#5257C9] text-white shadow-lg shadow-[#F59E0B]/25 hover:shadow-xl hover:shadow-[#F59E0B]/40",
    ghost:
      "border border-black/10 text-[#0F172A] bg-white/60 backdrop-blur hover:bg-white",
  }
  return (
    <Button
      onClick={onSignup}
      className={`group relative h-12 rounded-full px-6 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 ${styles[variant]} ${className}`}
    >
      <span className="flex items-center gap-2">
        {children}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Button>
  )
}

// ----------------------------------------------------------------------------
// HEADER (sticky glass, shared) — avec dropdown "Secteurs"
// ----------------------------------------------------------------------------

const SECTOR_NAV: { key: SectorKey; label: string }[] = [
  { key: "restaurant", label: "Restaurant" },
  { key: "aeroport", label: "Aéroport" },
  { key: "hotel", label: "Hôtel" },
  { key: "gare", label: "Gare" },
  { key: "hopital", label: "Santé" },
  { key: "erp", label: "Établissements Publics" },
]

function Header({
  page,
  navigate,
  onLogin,
  onSignup,
  mobileOpen,
  setMobileOpen,
}: {
  page: LandingPage
  navigate: Navigate
  onLogin: () => void
  onSignup: () => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}) {
  const isSector = SECTOR_NAV.some((s) => s.key === page)
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-black/5 bg-white/60 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <button
          onClick={() => navigate("accueil")}
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          aria-label="FeedbackPro - Accueil"
        >
          <Logo className="h-7 sm:h-8 w-auto" />
        </button>

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center gap-1"
          aria-label="Navigation principale"
        >
          {/* Accueil */}
          <button
            onClick={() => navigate("accueil")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "accueil"
                ? "text-[#5257C9]"
                : "text-[#0F172A]/70 hover:text-[#0F172A]"
            }`}
          >
            Accueil
            {page === "accueil" && (
              <motion.span
                layoutId="nav-underline"
                className="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED]"
              />
            )}
          </button>

          {/* Secteurs dropdown */}
          <div className="group relative">
            <button
              className={`relative flex items-center gap-1 px-4 py-2 text-sm font-medium transition-colors ${
                isSector
                  ? "text-[#5257C9]"
                  : "text-[#0F172A]/70 hover:text-[#0F172A]"
              }`}
              aria-haspopup="true"
              aria-expanded={isSector}
            >
              Secteurs
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180" />
              {isSector && (
                <motion.span
                  layoutId="nav-underline"
                  className="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED]"
                />
              )}
            </button>
            {/* Dropdown panel */}
            <div className="invisible absolute left-1/2 top-full z-50 w-[28rem] -translate-x-1/2 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
              <div className="overflow-hidden rounded-2xl border border-black/5 bg-white p-3 shadow-2xl shadow-[#5257C9]/10">
                <div className="grid grid-cols-2 gap-1.5">
                  {SECTOR_NAV.map((s) => {
                    const active = page === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => navigate(s.key)}
                        className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "bg-[#5257C9]/8"
                            : "hover:bg-[#F8FAFC]"
                        }`}
                      >
                        <span
                          className={`text-sm font-semibold ${
                            active ? "text-[#5257C9]" : "text-[#0F172A]"
                          }`}
                        >
                          {s.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {sectorTaglineShort(s.key)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* À propos */}
          <button
            onClick={() => navigate("apropos")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "apropos"
                ? "text-[#5257C9]"
                : "text-[#0F172A]/70 hover:text-[#0F172A]"
            }`}
          >
            À propos
            {page === "apropos" && (
              <motion.span
                layoutId="nav-underline"
                className="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED]"
              />
            )}
          </button>

          {/* Contact */}
          <button
            onClick={() => navigate("contact")}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              page === "contact"
                ? "text-[#5257C9]"
                : "text-[#0F172A]/70 hover:text-[#0F172A]"
            }`}
          >
            Contact
            {page === "contact" && (
              <motion.span
                layoutId="nav-underline"
                className="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED]"
              />
            )}
          </button>
        </nav>

        {/* Right CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onLogin}
            className="text-sm font-medium text-[#0F172A]/80 transition-colors hover:text-[#0F172A]"
          >
            Se connecter
          </button>
          <CtaSignup onSignup={onSignup} />
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg text-[#0F172A]"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className="w-[85vw] max-w-sm border-l border-black/5 bg-white p-0"
        >
          <SheetTitle className="sr-only">Menu de navigation FeedbackPro</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center border-b border-black/5 px-4">
              <Logo className="h-7 w-auto" />
            </div>
            <nav className="fbp-scrollbar flex flex-col gap-1 overflow-y-auto p-4" aria-label="Navigation mobile">
              <MobileLink active={page === "accueil"} label="Accueil" onClick={() => navigate("accueil")} />
              <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Secteurs
              </div>
              {SECTOR_NAV.map((s) => (
                <MobileLink
                  key={s.key}
                  active={page === s.key}
                  label={s.label}
                  onClick={() => navigate(s.key)}
                />
              ))}
              <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Société
              </div>
              <MobileLink active={page === "apropos"} label="À propos" onClick={() => navigate("apropos")} />
              <MobileLink active={page === "contact"} label="Contact" onClick={() => navigate("contact")} />
            </nav>
            <div className="mt-auto flex flex-col gap-3 border-t border-black/5 p-4">
              <CtaSignup onSignup={onSignup} className="w-full" />
              <button
                onClick={() => {
                  setMobileOpen(false)
                  onLogin()
                }}
                className="h-11 rounded-full border border-black/10 text-sm font-medium text-[#0F172A]"
              >
                Se connecter
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}

function MobileLink({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium transition-colors ${
        active
          ? "bg-[#5257C9]/8 text-[#5257C9]"
          : "text-[#0F172A]/80 hover:bg-[#F8FAFC]"
      }`}
    >
      {label}
      <ChevronRight className="h-4 w-4 opacity-40" />
    </button>
  )
}

// Tagline courte pour le dropdown header
function sectorTaglineShort(key: SectorKey): string {
  switch (key) {
    case "restaurant":
      return "Service fluide, avis maîtrisés"
    case "aeroport":
      return "Sécurité, flux, ops"
    case "hotel":
      return "Expérience guest, housekeeping"
    case "gare":
      return "Embarquement, info voyageur"
    case "hopital":
      return "Hygiène, flux patients"
    case "erp":
      return "Accueil usagers, maintenance"
  }
}

// ----------------------------------------------------------------------------
// Mockups CSS partagés
// ----------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  trend,
  positive = true,
}: {
  label: string
  value: string
  trend: string
  positive?: boolean
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-[#0F172A]">{value}</div>
      <div
        className={`mt-0.5 text-[10px] font-semibold ${
          positive ? "text-emerald-600" : "text-amber-600"
        }`}
      >
        {trend}
      </div>
    </div>
  )
}

// Hero image générée par IA + bulles de notification en CSS overlay
// L'image montre un terminal aéroport avec QR code holographique central.
// Les bulles de notification sont ajoutées en CSS (l'IA ne gère pas le texte).
function HeroImageWithBubbles() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/5 shadow-2xl shadow-[#5257C9]/15">
      {/* Image générée */}
      <img
        src="/hero-feedbackpro.png"
        alt="FeedbackPro — Intelligence terrain avec QR code et notifications Denise"
        className="w-full"
        loading="eager"
      />

      {/* Overlay gradient pour améliorer la lisibilité des bulles */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#5257C9]/5 via-transparent to-[#7C3AED]/5" />

      {/* Bulle 1 — Rouge : Bagage perdu (top-right) */}
      <div
        className="absolute right-4 top-[15%] animate-[fbp-float_4s_ease-in-out_infinite] rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 backdrop-blur-md shadow-lg sm:right-8 sm:top-[12%]"
        style={{ animationDelay: "0s" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-[10px] font-bold text-red-100 sm:text-xs">Bagage perdu</span>
        </div>
        <p className="mt-0.5 text-[8px] text-red-200/80 sm:text-[10px]">Tapis 4 · il y a 2 min</p>
      </div>

      {/* Bulle 2 — Jaune : Toilettes sales (top-left) */}
      <div
        className="absolute left-4 top-[20%] animate-[fbp-float_5s_ease-in-out_infinite] rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 backdrop-blur-md shadow-lg sm:left-8 sm:top-[18%]"
        style={{ animationDelay: "0.5s" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span className="text-[10px] font-bold text-amber-100 sm:text-xs">Toilettes sales</span>
        </div>
        <p className="mt-0.5 text-[8px] text-amber-200/80 sm:text-[10px]">Zone B · il y a 5 min</p>
      </div>

      {/* Bulle 3 — Violet : Denise alerte (bottom-right) */}
      <div
        className="absolute right-6 bottom-[20%] animate-[fbp-float_4.5s_ease-in-out_infinite] rounded-xl border border-violet-400/30 bg-violet-500/20 px-3 py-2 backdrop-blur-md shadow-lg sm:right-12 sm:bottom-[18%]"
        style={{ animationDelay: "1s" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
          <span className="text-[10px] font-bold text-violet-100 sm:text-xs">Denise alerte</span>
        </div>
        <p className="mt-0.5 text-[8px] text-violet-200/80 sm:text-[10px]">Équipe notifiée · 18:32</p>
      </div>

      {/* Bulle 4 — Vert : Incident résolu (bottom-left) */}
      <div
        className="absolute left-6 bottom-[25%] animate-[fbp-float_5.5s_ease-in-out_infinite] rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 backdrop-blur-md shadow-lg sm:left-12 sm:bottom-[22%]"
        style={{ animationDelay: "1.5s" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-100 sm:text-xs">Incident résolu</span>
        </div>
        <p className="mt-0.5 text-[8px] text-emerald-200/80 sm:text-[10px]">Porte B12 · 5 min</p>
      </div>
    </div>
  )
}

function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl shadow-[#5257C9]/10">
      {/* Browser top bar */}
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#F8FAFC] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-400" />
        <div className="h-3 w-3 rounded-full bg-amber-400" />
        <div className="h-3 w-3 rounded-full bg-emerald-400" />
        <div className="ml-3 hidden font-mono text-[11px] text-muted-foreground sm:block">
          app.feedbackpro.io/denise-live
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
        {/* Left - Denise live */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0F172A] to-[#1E2A4A] p-4 text-white sm:p-5">
          <div className="absolute inset-0 fbp-grid-dark opacity-60" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
              <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
              Denise en direct
            </div>
            <div className="mt-4 flex h-16 items-center justify-center gap-1">
              <SoundWave
                bars={26}
                barClassName="from-[#5257C9] to-[#06B6D4] w-[3px]"
              />
            </div>
            <div className="mt-4 rounded-lg bg-white/5 p-3 text-xs text-white/85">
              <span className="font-semibold text-white">Denise :</span> « Retour
              positif table 14. Ambiance excellente. Envoi d&apos;un remerciement. »
            </div>
          </div>
        </div>

        {/* Right - KPIs + feed */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Retours / jour" value="47" trend="+12%" />
            <KpiCard label="Temps résol." value="2m 14s" trend="-38%" />
            <KpiCard label="Satisfaction" value="4.9" trend="+0.3" />
            <KpiCard label="Alertes" value="3" trend="en cours" positive={false} />
          </div>
          <div className="fbp-scrollbar max-h-32 overflow-y-auto rounded-xl border border-black/5 bg-[#F8FAFC] p-2">
            <div className="space-y-1.5">
              {[
                { tag: "Ambiance top", who: "Table 14", t: "Il y a 12s" },
                { tag: "Plat froid", who: "Table 7", t: "Il y a 38s" },
                { tag: "Service lent", who: "Table 3", t: "Il y a 1m" },
                { tag: "Erreur commande", who: "Table 9", t: "Il y a 2m" },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-[10px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5257C9]" />
                    <span className="font-semibold text-[#0F172A]">{f.tag}</span>
                  </div>
                  <span className="text-muted-foreground">{f.who}</span>
                  <span className="text-muted-foreground/70">{f.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhoneMockup({
  notifications = [
    { delay: "0s", tag: "Critique", title: "Erreur plat", sub: "Table 14 · Plat froid servi", color: "bg-red-500" },
    { delay: "1.4s", tag: "Important", title: "Service lent", sub: "Table 7 · 25 min d'attente", color: "bg-amber-500" },
    { delay: "2.8s", tag: "Positif", title: "Ambiance top", sub: "Table 3 · Coup de cœur client", color: "bg-emerald-500" },
    { delay: "4.2s", tag: "Info", title: "Demande addition", sub: "Table 9 · Client pressé", color: "bg-[#5257C9]" },
  ],
  badgeLabel = "Service en salle",
  accent = "#5257C9",
}: {
  notifications?: { delay: string; tag: string; title: string; sub: string; color: string }[]
  badgeLabel?: string
  accent?: string
}) {
  return (
    <div className="fbp-float relative mx-auto w-[260px]">
      <div className="relative rounded-[2.5rem] border-[10px] border-[#0F172A] bg-[#0F172A] shadow-2xl shadow-[#5257C9]/20">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0F172A]" />
        <div className="relative h-[480px] overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-[#F8FAFC] to-[#E2E8F0]">
          {/* status bar */}
          <div className="flex items-center justify-between px-4 pb-2 pt-9 text-[10px] font-semibold text-[#0F172A]/60">
            <span>14:32</span>
            <span>FeedbackPro Staff</span>
          </div>
          {/* header */}
          <div className="px-4 pb-3">
            <div
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: accent }}
            >
              Alerte entrante
            </div>
            <div className="text-base font-bold text-[#0F172A]">{badgeLabel}</div>
          </div>
          {/* notifications */}
          <div className="space-y-2 px-3">
            {notifications.map((n, i) => (
              <NotifCard
                key={i}
                delay={n.delay}
                tag={n.tag}
                title={n.title}
                sub={n.sub}
                color={n.color}
              />
            ))}
          </div>
          {/* mic bar bottom */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#0F172A] px-3 py-1.5">
            <Mic className="h-3 w-3 text-[#06B6D4]" />
            <SoundWave bars={14} barClassName="from-[#5257C9] to-[#06B6D4] h-3 w-[2px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function NotifCard({
  delay,
  tag,
  title,
  sub,
  color,
}: {
  delay: string
  tag: string
  title: string
  sub: string
  color: string
}) {
  return (
    <div
      className="fbp-slidein rounded-xl border border-black/5 bg-white p-2.5 shadow-sm"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {tag}
        </span>
        <span className="ml-auto text-[9px] text-muted-foreground/70">maintenant</span>
      </div>
      <div className="mt-0.5 text-xs font-bold text-[#0F172A]">{title}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function TerminalMapMockup() {
  // Coordonnees (en pourcentage) des incidents
  const incidents = [
    { x: 18, y: 32, type: "Sanitaires", color: "bg-red-500", delay: "0s" },
    { x: 42, y: 58, type: "Porte B12", color: "bg-amber-500", delay: "0.6s" },
    { x: 68, y: 28, type: "Zone Fumeurs", color: "bg-red-500", delay: "1.1s" },
    { x: 80, y: 70, type: "Tapis bagages", color: "bg-[#06B6D4]", delay: "1.6s" },
    { x: 30, y: 75, type: "Sortie T2", color: "bg-emerald-500", delay: "2.1s" },
  ]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0B1224] p-4 shadow-2xl">
      <div className="absolute inset-0 fbp-grid-dark opacity-50" aria-hidden />
      <div className="relative mb-3 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
          Terminal 2 · Live
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/60">
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
          5 incidents actifs
        </div>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#11193A] to-[#0B1224]">
        {/* Terminals shapes */}
        <div className="absolute left-[8%] top-[12%] h-[60%] w-[35%] rounded-md border border-white/10 bg-white/5" />
        <div className="absolute right-[8%] top-[18%] h-[55%] w-[28%] rounded-md border border-white/10 bg-white/5" />
        <div className="absolute left-[40%] top-[55%] h-[30%] w-[20%] rounded-md border border-white/10 bg-white/5" />
        {/* gates labels */}
        <div className="absolute left-[10%] top-[14%] text-[8px] font-semibold text-white/40">A1-A8</div>
        <div className="absolute right-[10%] top-[20%] text-[8px] font-semibold text-white/40">B11-B20</div>
        {/* connecting path */}
        <div className="absolute left-[43%] top-[35%] h-[2px] w-[20%] bg-[#06B6D4]/30" />

        {/* incidents */}
        {incidents.map((inc, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${inc.x}%`, top: `${inc.y}%` }}
          >
            <div className="relative -translate-x-1/2 -translate-y-1/2">
              <span
                className={`fbp-ring-pulse absolute inset-0 rounded-full ${inc.color}`}
                style={{ animationDelay: inc.delay }}
              />
              <span
                className={`relative block h-2.5 w-2.5 rounded-full ${inc.color}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* legend */}
      <div className="relative mt-3 grid grid-cols-2 gap-1.5 text-[9px] sm:grid-cols-3">
        <div className="flex items-center gap-1.5 text-white/60">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Critique
        </div>
        <div className="flex items-center gap-1.5 text-white/60">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Important
        </div>
        <div className="flex items-center gap-1.5 text-white/60">
          <span className="h-2 w-2 rounded-full bg-[#06B6D4]" /> Info
        </div>
      </div>
    </div>
  )
}

function CentralDashboardMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl shadow-[#5257C9]/10">
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#F8FAFC] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-400" />
        <div className="h-3 w-3 rounded-full bg-amber-400" />
        <div className="h-3 w-3 rounded-full bg-emerald-400" />
        <div className="ml-3 hidden font-mono text-[11px] text-muted-foreground sm:block">
          aeroport.feedbackpro.io/central
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[#06B6D4]">
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
          Live
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-3">
        {/* Incidents list */}
        <div className="md:col-span-2 rounded-xl border border-black/5 bg-[#F8FAFC] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5257C9]">
              Incidents actifs
            </div>
            <div className="text-[10px] text-muted-foreground">12 aujourd&apos;hui</div>
          </div>
          <div className="space-y-2">
            {[
              { z: "Porte B12", t: "Sanitaires", p: "Haute", st: "En cours", time: "Il y a 2m", by: "Agent #A204" },
              { z: "Terminal 1 · Hall A", t: "Objet suspect", p: "Critique", st: "Assigné", time: "Il y a 6m", by: "Agent #S118" },
              { z: "Zone Fumeurs T2", t: "Propreté", p: "Haute", st: "En cours", time: "Il y a 8m", by: "Agent #N007" },
              { z: "Tapis bagages 3", t: "Panne", p: "Moyenne", st: "Résolu", time: "Il y a 14m", by: "Agent #T051" },
              { z: "Sortie T2 · Est", t: "Sol glissant", p: "Haute", st: "En cours", time: "Il y a 19m", by: "Agent #N011" },
            ].map((inc, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-black/5 bg-white p-2.5"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    inc.p === "Critique"
                      ? "bg-red-500"
                      : inc.p === "Haute"
                        ? "bg-amber-500"
                        : "bg-[#06B6D4]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-[#0F172A]">
                    {inc.t} · {inc.z}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {inc.by} · {inc.time}
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-[#5257C9]/8 px-2 py-0.5 text-[9px] font-semibold text-[#5257C9]">
                  {inc.st}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right panel - team & SLA */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-black/5 bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Score équipe (jour)
            </div>
            <div className="mt-2 space-y-1.5">
              {[
                { n: "Nettoyage T2", s: 92, c: "bg-emerald-500" },
                { n: "Sécurité", s: 88, c: "bg-[#5257C9]" },
                { n: "Maintenance", s: 76, c: "bg-amber-500" },
              ].map((t, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#0F172A]/70">{t.n}</span>
                    <span className="font-semibold text-[#0F172A]">{t.s}%</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div
                      className={`h-full rounded-full ${t.c}`}
                      style={{ width: `${t.s}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-black/5 bg-gradient-to-br from-[#0F172A] to-[#1E2A4A] p-3 text-white">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
              SLA temps réel
            </div>
            <div className="mt-1 text-2xl font-bold">3m 42s</div>
            <div className="text-[10px] text-white/70">
              Temps moyen de résolution
            </div>
            <div className="mt-2 flex h-10 items-end gap-1">
              <SoundWave
                bars={22}
                barClassName="from-[#5257C9] to-[#06B6D4] w-[2px]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeniseLiveCard({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 ${
        dark
          ? "border-white/10 bg-white/5 backdrop-blur-xl"
          : "border-black/5 bg-white shadow-2xl shadow-[#5257C9]/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest ${
            dark ? "text-[#06B6D4]" : "text-[#5257C9]"
          }`}
        >
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
          Denise · centre de commandement
        </div>
        <Volume2
          className={`h-4 w-4 ${dark ? "text-white/60" : "text-[#0F172A]/50"}`}
        />
      </div>

      {/* wave */}
      <div
        className={`mt-5 flex h-24 items-center justify-center gap-1 rounded-xl ${
          dark ? "bg-white/5" : "bg-[#F8FAFC]"
        }`}
      >
        <SoundWave
          bars={28}
          barClassName="from-[#5257C9] to-[#06B6D4] w-1"
        />
      </div>

      {/* transcript */}
      <div
        className={`mt-5 rounded-xl p-4 ${
          dark ? "bg-white/5 text-white" : "bg-[#0F172A] text-white"
        }`}
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
          <Mic className="h-3 w-3" /> Transcript live
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/90">
          <span className="font-semibold text-white">Denise :</span> « Nouvel
          incident. Sanitaires Zone Fumeurs. Priorité haute. Équipe nettoyage
          alertée. Temps d&apos;intervention estimé : 4 minutes. »
        </p>
      </div>

      {/* indicators */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div
          className={`rounded-lg p-2 text-center ${
            dark ? "bg-white/5" : "bg-[#F8FAFC]"
          }`}
        >
          <div
            className={`text-[9px] font-semibold uppercase tracking-wider ${
              dark ? "text-white/60" : "text-muted-foreground"
            }`}
          >
            Vibration
          </div>
          <div className="mt-1 flex items-center justify-center gap-1">
            <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
            <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#5257C9]" style={{ animationDelay: "0.3s" }} />
          </div>
        </div>
        <div
          className={`rounded-lg p-2 text-center ${
            dark ? "bg-white/5" : "bg-[#F8FAFC]"
          }`}
        >
          <div
            className={`text-[9px] font-semibold uppercase tracking-wider ${
              dark ? "text-white/60" : "text-muted-foreground"
            }`}
          >
            Zone
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-xs font-bold text-[#5257C9]">
            <MapPin className="h-3 w-3" /> T2 · F
          </div>
        </div>
        <div
          className={`rounded-lg p-2 text-center ${
            dark ? "bg-white/5" : "bg-[#F8FAFC]"
          }`}
        >
          <div
            className={`text-[9px] font-semibold uppercase tracking-wider ${
              dark ? "text-white/60" : "text-muted-foreground"
            }`}
          >
            Priorité
          </div>
          <div className="mt-1 text-xs font-bold text-red-500">Haute</div>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Mockups CSS spécifiques aux secteurs
// ----------------------------------------------------------------------------

// Carte QR générique — header / URL / couleur d'accent paramétrables
function SectorQrCard({
  badge,
  title,
  url,
  bgGradient,
  accentColor,
}: {
  badge: string
  title: string
  url: string
  bgGradient: string
  accentColor: string
}) {
  return (
    <div className="fbp-float relative mx-auto w-full max-w-sm">
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${bgGradient} p-8 shadow-2xl`}>
        <div
          className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl"
          style={{ background: accentColor + "33" }}
          aria-hidden
        />
        <div className="relative rounded-2xl bg-white p-6 shadow-lg">
          <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {badge}
          </div>
          <div className="mx-auto w-44 overflow-hidden rounded-lg border border-black/5">
            <FakeQR size={21} />
          </div>
          <div
            className="mt-3 text-center text-[10px] font-semibold"
            style={{ color: accentColor }}
          >
            {title}
          </div>
        </div>
        <div className="relative mt-4 flex items-center justify-center gap-2 text-[10px] text-[#0F172A]/50">
          <Fingerprint className="h-3 w-3" /> {url}
        </div>
      </div>
    </div>
  )
}

// Board housekeeping (hôtel)
function HousekeepingBoard() {
  const rooms = [
    { n: "301", st: "Urgent", sub: "Draps à changer", c: "bg-red-500", t: "12:14" },
    { n: "205", st: "En cours", sub: "Femme de chambre #4", c: "bg-[#06B6D4]", t: "12:08" },
    { n: "118", st: "À faire", sub: "Check-out 11h00", c: "bg-amber-500", t: "11:58" },
    { n: "422", st: "Terminé", sub: "Vérifié par superviseur", c: "bg-emerald-500", t: "11:32" },
    { n: "310", st: "À faire", sub: "Clim HS signalée", c: "bg-amber-500", t: "11:25" },
    { n: "008", st: "Urgent", sub: "Wi-Fi coupé · client mécontent", c: "bg-red-500", t: "11:12" },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl shadow-[#EC4899]/10">
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#FDF2F8] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-400" />
        <div className="h-3 w-3 rounded-full bg-amber-400" />
        <div className="h-3 w-3 rounded-full bg-emerald-400" />
        <div className="ml-3 hidden font-mono text-[11px] text-muted-foreground sm:block">
          hotel.feedbackpro.io/housekeeping
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[#EC4899]">
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#EC4899]" />
          6 chambres actives
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4">
        {rooms.map((r, i) => (
          <div
            key={i}
            className="rounded-xl border border-black/5 bg-[#F8FAFC] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#0F172A]">
                Chambre {r.n}
              </span>
              <span className={`h-2 w-2 rounded-full ${r.c}`} />
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {r.st}
            </div>
            <div className="mt-0.5 text-[10px] text-[#0F172A]/70">{r.sub}</div>
            <div className="mt-1 text-[9px] text-muted-foreground/70">{r.t}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Tableau info voyageurs (gare)
function InfoVoyageursBoard() {
  const deps = [
    { dest: "Dakar", voie: "Voie 3", heure: "14:45", st: "À l'heure", c: "text-emerald-500", bgc: "bg-emerald-500/10" },
    { dest: "Thiès", voie: "Voie 1", heure: "14:52", st: "Retardé 20min", c: "text-amber-500", bgc: "bg-amber-500/10" },
    { dest: "Saint-Louis", voie: "Voie 5", heure: "15:10", st: "Retardé 45min", c: "text-amber-500", bgc: "bg-amber-500/10" },
    { dest: "Touba", voie: "Voie 2", heure: "15:25", st: "Quai saturé", c: "text-red-500", bgc: "bg-red-500/10" },
    { dest: "Kaolack", voie: "Voie 4", heure: "15:40", st: "À l'heure", c: "text-emerald-500", bgc: "bg-emerald-500/10" },
    { dest: "Ziguinchor", voie: "—", heure: "16:00", st: "Info manquante", c: "text-[#06B6D4]", bgc: "bg-[#06B6D4]/10" },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#0F172A] text-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Megaphone className="h-3.5 w-3.5 text-[#06B6D4]" />
        <div className="font-mono text-[11px] uppercase tracking-widest text-white/70">
          Info voyageurs · Quai central
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[#06B6D4]">
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
          Live
        </div>
      </div>
      {/* Header */}
      <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1.2fr] gap-2 border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        <div>Destination</div>
        <div>Voie</div>
        <div>Heure</div>
        <div>Statut</div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-white/5">
        {deps.map((d, i) => (
          <div
            key={i}
            className="grid grid-cols-[1.4fr_1fr_0.8fr_1.2fr] items-center gap-2 px-4 py-3 text-xs"
          >
            <div className="font-semibold text-white">{d.dest}</div>
            <div className="font-mono text-white/70">{d.voie}</div>
            <div className="font-mono text-white/70">{d.heure}</div>
            <div>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.bgc} ${d.c}`}>
                {d.st}
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* Denise announce */}
      <div className="border-t border-white/10 bg-white/5 px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
          <Mic className="h-3 w-3" /> Annonce Denise
        </div>
        <p className="mt-1 text-xs text-white/85">
          « Train Dakar retardé 20 minutes. Affichage mis à jour. Voie 3. »
        </p>
      </div>
    </div>
  )
}

// Board flux patients (hôpital)
function PatientFlowBoard() {
  const zones = [
    { z: "Urgences · Salle d'attente", n: 28, capa: 30, st: "Saturé", c: "bg-red-500", wait: "1h 12min" },
    { z: "Consultations externes", n: 12, capa: 25, st: "Correct", c: "bg-amber-500", wait: "32min" },
    { z: "Radiologie", n: 6, capa: 10, st: "Ok", c: "bg-emerald-500", wait: "18min" },
    { z: "Accueil principal", n: 4, capa: 15, st: "Ok", c: "bg-emerald-500", wait: "5min" },
    { z: "Laboratoire", n: 9, capa: 12, st: "Correct", c: "bg-amber-500", wait: "24min" },
    { z: "Pharmacie", n: 2, capa: 8, st: "Ok", c: "bg-emerald-500", wait: "3min" },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl shadow-[#EF4444]/10">
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#FEF2F2] px-4 py-3">
        <HeartPulse className="h-3.5 w-3.5 text-[#EF4444]" />
        <div className="hidden font-mono text-[11px] text-muted-foreground sm:block">
          hopital.feedbackpro.io/flux-patients
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[#EF4444]">
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#EF4444]" />
          Live
        </div>
      </div>
      <div className="space-y-2 p-3">
        {zones.map((z, i) => {
          const pct = Math.min(100, Math.round((z.n / z.capa) * 100))
          return (
            <div
              key={i}
              className="rounded-xl border border-black/5 bg-[#F8FAFC] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[#0F172A]">
                    {z.z}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {z.n}/{z.capa} patients · attente {z.wait}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                    z.c === "bg-red-500"
                      ? "bg-red-500/10 text-red-600"
                      : z.c === "bg-amber-500"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-emerald-500/10 text-emerald-600"
                  }`}
                >
                  {z.st}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                <div
                  className={`h-full rounded-full ${z.c}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Board maintenance proactive (ERP / établissements publics)
function MaintenanceBoard() {
  const tickets = [
    { eq: "Borne interactive · Hall principal", p: "Critique", st: "HS", time: "Signalé 11:42", by: "Agent #M204", c: "bg-red-500" },
    { eq: "Guichet 3 · Distributeur tickets", p: "Haute", st: "En cours", time: "Signalé 10:55", by: "Techn. #T011", c: "bg-amber-500" },
    { eq: "Ascenseur · Aile B", p: "Haute", st: "Assigné", time: "Signalé 09:18", by: "Techn. #T008", c: "bg-amber-500" },
    { eq: "Écran info · Accueil", p: "Moyenne", st: "Résolu", time: "Signalé 08:30", by: "Techn. #T005", c: "bg-emerald-500" },
    { eq: "Borne paiement · Guichet 1", p: "Moyenne", st: "Planifié", time: "Signalé 08:12", by: "Techn. #T002", c: "bg-[#06B6D4]" },
    { eq: "Porte automatique · Entrée E", p: "Basse", st: "Résolu", time: "Signalé 07:45", by: "Techn. #T001", c: "bg-emerald-500" },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl shadow-[#10B981]/10">
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#ECFDF5] px-4 py-3">
        <Wrench className="h-3.5 w-3.5 text-[#10B981]" />
        <div className="hidden font-mono text-[11px] text-muted-foreground sm:block">
          erp.feedbackpro.io/maintenance
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-[#10B981]">
          <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#10B981]" />
          Live
        </div>
      </div>
      <div className="fbp-scrollbar max-h-[26rem] space-y-1.5 overflow-y-auto p-3">
        {tickets.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-black/5 bg-[#F8FAFC] p-2.5"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${t.c}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-[#0F172A]">
                {t.eq}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {t.by} · {t.time}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.p}
              </div>
              <div
                className={`text-[10px] font-bold ${
                  t.st === "HS"
                    ? "text-red-600"
                    : t.st === "Résolu"
                      ? "text-emerald-600"
                      : t.st === "En cours"
                        ? "text-amber-600"
                        : "text-[#06B6D4]"
                }`}
              >
                {t.st}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// TagsGrid générique
function TagsGrid({
  tags,
  patterns,
  dark = false,
}: {
  tags: { label: string; icon: LucideIcon; color: string }[]
  patterns?: { l: string; v: string; c: string }[]
  dark?: boolean
}) {
  return (
    <>
      <Reveal delay={0.2}>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {tags.map((t, i) => (
            <div
              key={i}
              className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                dark
                  ? "border-white/10 bg-white/5 text-white"
                  : "border-black/5 bg-white text-[#0F172A]"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-white`}
              >
                <t.icon className="h-3 w-3" />
              </span>
              {t.label}
            </div>
          ))}
        </div>
      </Reveal>

      {patterns && patterns.length > 0 && (
        <Reveal delay={0.28}>
          <div
            className={`mt-12 mx-auto max-w-2xl rounded-2xl border p-6 shadow-lg ${
              dark
                ? "border-white/10 bg-white/5 backdrop-blur-xl"
                : "border-[#5257C9]/10 bg-white shadow-[#5257C9]/5"
            }`}
          >
            <div
              className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest ${
                dark ? "text-[#06B6D4]" : "text-[#5257C9]"
              }`}
            >
              <Activity className="h-3 w-3" /> Vue patterns · 30 derniers jours
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {patterns.map((p, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-3 ${
                    dark ? "bg-white/5" : "bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${p.c}`} />
                    <span
                      className={`text-[10px] ${
                        dark ? "text-white/60" : "text-muted-foreground"
                      }`}
                    >
                      {p.l}
                    </span>
                  </div>
                  <div
                    className={`mt-1 text-xl font-bold ${
                      dark ? "text-white" : "text-[#0F172A]"
                    }`}
                  >
                    {p.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}
    </>
  )
}

// ----------------------------------------------------------------------------
// PAGE 1 : ACCUEIL (multi-secteurs)
// ----------------------------------------------------------------------------

function AccueilPage({
  navigate,
  onSignup,
}: {
  navigate: Navigate
  onSignup: () => void
}) {
  return (
    <>
      {/* HERO */}
      <section className="relative min-h-screen overflow-hidden bg-[#F8FAFC]">
        <Aurora />
        <div
          className="fbp-grid-mask fbp-grid-light pointer-events-none absolute inset-0"
          aria-hidden
        />

        <div className="relative mx-auto flex max-w-screen-2xl flex-col items-center px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28 lg:pt-32">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#5257C9]/15 bg-white/70 px-4 py-1.5 text-xs font-medium text-[#5257C9] backdrop-blur">
              <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#7C3AED]" />
              Nouveau · Denise, votre assistante vocale temps réel
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl text-5xl font-bold tracking-tighter leading-[0.95] sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-r from-[#5257C9] via-[#7C3AED] to-[#06B6D4] bg-clip-text text-transparent">
                L&apos;Intelligence Terrain
              </span>
              <br />
              <span className="text-[#0F172A]">pour vos Établissements</span>
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              De la salle de restaurant au tarmac, transformez chaque interaction
              en donnée actionnable. Piloté par Denise, votre assistante vocale
              temps réel.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <CtaSignup
                onSignup={() => navigate("restaurant")}
                variant="warm"
              >
                Découvrir Restaurants
              </CtaSignup>
              <CtaSignup
                onSignup={() => navigate("aeroport")}
                variant="tech"
              >
                Découvrir Aéroports
              </CtaSignup>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" /> 4.9/5
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-[#5257C9]" /> Setup en 5 min
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-[#5257C9]" /> Sans carte bancaire
              </span>
            </div>
          </Reveal>

          {/* Hero image générée + bulles notification CSS overlay */}
          <Reveal delay={0.4} className="mt-14 w-full max-w-screen-xl">
            <HeroImageWithBubbles />
          </Reveal>
        </div>
      </section>

      {/* UN MOTEUR, TOUS VOS TERRAINS — 6 sector cards */}
      <section className="border-y border-black/5 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Un moteur, tous vos terrains
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl lg:text-5xl">
                Une seule plateforme. Tous vos terrains.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Le même moteur d&apos;intelligence terrain s&apos;adapte aux
                spécificités de chaque environnement.
              </p>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SECTORS.map((sector, i) => (
              <Reveal key={sector.key} delay={0.06 * i}>
                <button
                  onClick={() => navigate(sector.key)}
                  className={`group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-7 ${sector.cardClasses}`}
                >
                  <div
                    className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-150 ${sector.glowClasses}`}
                    aria-hidden
                  />
                  <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${sector.iconGradient} text-white shadow-lg`}>
                    <sector.icon className="h-5 w-5" />
                  </div>
                  <h3 className={`relative mt-5 text-lg font-bold sm:text-xl ${sector.cardTitleColor}`}>
                    {sector.cardTitle}
                  </h3>
                  <p className={`relative mt-2 text-sm ${sector.cardBodyColor}`}>
                    {sector.tagline}
                  </p>
                  <div className={`relative mt-5 flex items-center gap-2 text-sm font-semibold ${sector.cardLinkColor}`}>
                    Découvrir
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* DENISE NE DORT JAMAIS - DARK */}
      <section className="relative overflow-hidden bg-[#0F172A] py-24 text-white sm:py-32">
        {/* Radial indigo glow at top */}
        <div
          className="pointer-events-none absolute -top-32 left-1/2 h-[40rem] w-[60rem] -translate-x-1/2 rounded-full bg-[#5257C9]/20 blur-[140px]"
          aria-hidden
        />
        <div className="absolute inset-0 fbp-grid-dark opacity-40" aria-hidden />

        <div className="relative mx-auto grid max-w-screen-2xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          {/* Left */}
          <div className="flex flex-col justify-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#7C3AED]">
                La technologie
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className="bg-gradient-to-r from-white via-white to-[#C7D2FE] bg-clip-text text-transparent">
                  Denise ne dort jamais.
                </span>
                <br />
                <span className="bg-gradient-to-r from-[#5257C9] via-[#7C3AED] to-[#06B6D4] bg-clip-text text-transparent">
                  Elle alerte, elle guide, elle centralise.
                </span>
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 max-w-xl text-base text-white/70 sm:text-lg">
                Pendant que vos équipes travaillent les mains occupées, Denise
                veille. Chaque signalement est analysé, priorisé et annoncé
                vocalement. Pas d&apos;écran à regarder — juste une voix qui
                guide.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8 flex flex-wrap gap-3">
                <CtaSignup onSignup={() => navigate("aeroport")} variant="tech">
                  Voir Denise en action
                </CtaSignup>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 backdrop-blur">
                  <Headset className="h-4 w-4 text-[#06B6D4]" />
                  100% vocal · mains libres
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right - sound wave + transcript */}
          <Reveal delay={0.2}>
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
                    <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
                    Denise écoute
                  </div>
                  <Volume2 className="h-4 w-4 text-white/50" />
                </div>
                <div className="mt-5 flex h-32 items-center justify-center gap-1">
                  <SoundWave bars={20} barClassName="from-[#5257C9] to-[#06B6D4] w-1" />
                </div>
                <div className="mt-4 text-center text-[10px] text-white/40">
                  Fréquence · 16 kHz · temps réel
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#7C3AED]">
                  <Mic className="h-3 w-3" /> Annonce de Denise
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/90">
                  « Nouvel incident. Zone sanitaires. Priorité haute. Équipe
                  nettoyage alertée. »
                </p>
                <div className="mt-3 flex items-center gap-3 text-[10px] text-white/50">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Terminal 2
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 14:32:08
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* SECTION PREUVE - stats génériques */}
      <section className="bg-[#F8FAFC] py-24 sm:py-32">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                La preuve
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl lg:text-5xl">
                Le signal capté au moment où il sert.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                FeedbackPro mesure ce que les autres outils ignorent. Les
                indicateurs qui transforment une opération moyenne en opération
                excellente.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                stat: <CountUp to={15} suffix="%" />,
                label: "d'incidents invisibles sans FeedbackPro",
                icon: Eye,
              },
              {
                stat: <span className="text-[#5257C9]">÷2</span>,
                label: "temps de résolution divisé par 2 avec alertes temps réel",
                icon: Zap,
              },
              {
                stat: <CountUp to={4} suffix="x" />,
                label: "feedbacks collectés vs. enquêtes post-visite",
                icon: Trophy,
              },
            ].map((s, i) => (
              <Reveal key={i} delay={0.1 * i}>
                <div className="group h-full rounded-2xl border border-black/5 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#5257C9]/20 hover:shadow-xl hover:shadow-[#5257C9]/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#5257C9]/10 to-[#7C3AED]/10 text-[#5257C9]">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-5 text-5xl font-bold tracking-tighter text-[#0F172A] sm:text-6xl">
                    {s.stat}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL - NO pricing */}
      <section className="relative overflow-hidden">
        <div className="relative bg-gradient-to-br from-[#5257C9] via-[#7C3AED] to-[#06B6D4] py-24 sm:py-32">
          <Aurora dark />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
            <Reveal>
              <div className="w-fit rounded-xl bg-white px-4 py-2 shadow-lg">
                <Logo className="h-8 w-auto" />
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Prêt à transformer vos interactions en données actionnables ?
              </h2>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8">
                <CtaSignup onSignup={() => navigate("contact")} variant="white">
                  Demander une démo personnalisée
                </CtaSignup>
              </div>
            </Reveal>
            <Reveal delay={0.32}>
              <p className="mt-4 text-sm text-white/80">
                Configuration adaptée à votre secteur en 24h
              </p>
            </Reveal>
            <Reveal delay={0.4}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/70">
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" /> Sans carte bancaire
                </span>
                <span className="text-white/40">·</span>
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" /> Setup en 5 min
                </span>
                <span className="text-white/40">·</span>
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" /> Annulable à tout moment
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Last call to action (onSignup) - discrete */}
      <section className="bg-white py-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <div className="text-base font-semibold text-[#0F172A]">
              Plutôt tester directement ?
            </div>
            <div className="text-sm text-muted-foreground">
              Créez un compte en 5 minutes. Sans carte bancaire.
            </div>
          </div>
          <CtaSignup onSignup={onSignup}>Essayer gratuitement</CtaSignup>
        </div>
      </section>
    </>
  )
}

// ----------------------------------------------------------------------------
// CONFIG SECTEURS (6)
// ----------------------------------------------------------------------------

const SECTORS: SectorConfig[] = [
  // 1. RESTAURANT
  {
    key: "restaurant",
    label: "Restaurant",
    badge: "Restauration",
    cardTitle: "Restauration",
    tagline: "Service fluide, avis maîtrisés",
    icon: Utensils,
    accentFrom: "#F59E0B",
    accentTo: "#FB923C",
    iconGradient: "from-[#F59E0B] to-[#FB923C]",
    cardClasses:
      "border-black/5 bg-gradient-to-br from-[#FFF7ED] via-[#FFEDD5] to-[#FDBA74]/30 hover:shadow-[#F59E0B]/20",
    glowClasses: "bg-[#F59E0B]/30",
    cardTitleColor: "text-[#0F172A]",
    cardBodyColor: "text-[#0F172A]/70",
    cardLinkColor: "text-[#5257C9]",
    dark: false,
    ctaVariant: "warm",
    heroTitle: (
      <>
        Ne laissez plus un mauvais avis{" "}
        <span className="bg-gradient-to-r from-[#F59E0B] to-[#5257C9] bg-clip-text text-transparent">
          gâcher votre service.
        </span>
      </>
    ),
    heroSubtitle:
      "Le QR code invisible. L'IA qui trie. Le staff qui réagit. Avant que le client ne parte.",
    qrBadge: "Votre avis compte",
    qrTitle: "Scannez en 2 secondes",
    qrUrl: "feedbackpro.io/r/abc12",
    qrCaption: "Posez-le sur nappe, menu ou addition",
    advantages: [
      {
        num: "Avantage 1",
        icon: QrCode,
        title: "Un QR design. Pas de tablette encombrante.",
        description:
          "Posé sur la nappe, imprimé sur l'addition ou le menu. Le client scanne en 2 secondes. Pas d'app à télécharger, pas de compte à créer.",
        layout: "split-left",
        bullets: [
          "Posez-le où vous voulez : nappe, menu, addition, table",
          "Aucune app à installer pour le client",
          "Compatible avec votre identité visuelle",
          "Mise à jour des questions en temps réel",
        ],
        mockup: "qr",
        bg: "white",
      },
      {
        num: "Avantage 2",
        icon: Sparkles,
        title: "L'IA trie automatiquement vos feedbacks.",
        description:
          "Chaque retour est catégorisé instantanément. Vous voyez les patterns, pas juste des commentaires.",
        layout: "centered-tags",
        tags: [
          { label: "Service lent", icon: Clock, color: "from-amber-500 to-orange-500" },
          { label: "Plat froid", icon: Timer, color: "from-cyan-500 to-blue-500" },
          { label: "Addition erronée", icon: AlertCircle, color: "from-red-500 to-rose-500" },
          { label: "Personnel distrait", icon: Users, color: "from-rose-500 to-pink-500" },
          { label: "Ambiance top", icon: Sparkles, color: "from-emerald-500 to-teal-500" },
          { label: "Erreur de commande", icon: AlertCircle, color: "from-red-500 to-rose-500" },
          { label: "Qualité produit", icon: Trophy, color: "from-amber-500 to-yellow-500" },
          { label: "Propreté", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
        ],
        patterns: [
          { l: "Service lent", v: "32%", c: "bg-amber-500" },
          { l: "Plat froid", v: "18%", c: "bg-cyan-500" },
          { l: "Ambiance top", v: "47%", c: "bg-emerald-500" },
          { l: "Erreur commande", v: "9%", c: "bg-red-500" },
        ],
        bg: "light",
      },
      {
        num: "Avantage 3",
        icon: BellRing,
        title: "Le client signale. Le serveur agit. Avant qu'il ne parte.",
        description:
          "Le QR Staff envoie une alerte instantanée à la personne la plus proche. Le client n'attend plus. Il devient ambassadeur.",
        layout: "split-right",
        steps: [
          { n: "1", t: "Client signale", d: "« Erreur plat · Table 14 » via QR", icon: AlertCircle, color: "text-red-500" },
          { n: "2", t: "Serveur reçoit l'alerte", d: "Sur sa montre ou son téléphone, en moins de 2s", icon: Phone, color: "text-[#5257C9]" },
          { n: "3", t: "Intervention immédiate", d: "Le serveur intervient pendant que le client est encore à table", icon: Zap, color: "text-amber-500" },
          { n: "4", t: "Client transformé", d: "Un mécontent devient un ambassadeur", icon: Trophy, color: "text-emerald-500" },
        ],
        mockup: "phone",
        bg: "white",
      },
    ],
    deniseQuote: "Alerte cuisine : Table 12, erreur plat, urgent",
    testimonial: {
      name: "Marc Lefèvre",
      initials: "ML",
      role: "Chef de salle · Restaurant gastronomique",
      quote:
        "Le stress en salle a chuté. On sait exactement où intervenir, sans attendre que le client se plaigne à la caisse.",
    },
  },

  // 2. AEROPORT
  {
    key: "aeroport",
    label: "Aéroport",
    badge: "Aéroport",
    cardTitle: "Aéroports",
    tagline: "Sécurité, flux, réactivité ops",
    icon: Plane,
    accentFrom: "#5257C9",
    accentTo: "#06B6D4",
    iconGradient: "from-[#5257C9] to-[#06B6D4]",
    cardClasses:
      "border-white/10 bg-gradient-to-br from-[#0F172A] via-[#1E2A4A] to-[#5257C9]/20 hover:shadow-[#5257C9]/30",
    glowClasses: "bg-[#06B6D4]/30",
    cardTitleColor: "text-white",
    cardBodyColor: "text-white/70",
    cardLinkColor: "text-[#06B6D4]",
    dark: true,
    ctaVariant: "tech",
    heroTitle: (
      <>
        <span className="bg-gradient-to-r from-[#5257C9] via-[#7C3AED] to-[#06B6D4] bg-clip-text text-transparent">
          Maîtrisez chaque mètre carré
        </span>
        <br />
        de votre terminal.
      </>
    ),
    heroSubtitle:
      "Géolocalisation précise. Denise au centre de commandement. Traçabilité totale. Le signalement devient une action, pas un ticket.",
    qrBadge: "QR Staff géolocalisé",
    qrTitle: "Porte B12 · Tapis 4",
    qrUrl: "aeroport.feedbackpro.io/s/B12",
    qrCaption: "Précision au mètre près",
    advantages: [
      {
        num: "Avantage 1 · Géolocalisation",
        icon: MapPin,
        title: (
          <>
            Incident Porte B12, Terminal 2.{" "}
            <span className="text-white/50">Fini les signalements vagues.</span>
          </>
        ),
        description:
          "Chaque QR code est géolocalisé. Vous savez exactement où intervenir. Plus besoin de rappeler le client pour comprendre où se trouve le problème.",
        layout: "split-left",
        bullets: [
          "Précision au mètre près via QR géolocalisés",
          "Cartographie live du terminal",
          "Historique des incidents par zone",
          "Heat-maps de densité d'incidents",
        ],
        mockup: "terminal",
        bg: "dark",
      },
      {
        num: "Avantage 2 · Tags ops",
        icon: Sparkles,
        title: "L'IA catégorise chaque signalement ops.",
        description:
          "Tapis HS, sécurité, propreté, info manquante. Chaque signalement est trié et priorisé automatiquement.",
        layout: "centered-tags",
        tags: [
          { label: "Tapis HS", icon: Wrench, color: "from-red-500 to-rose-500" },
          { label: "Attente >30min", icon: Clock, color: "from-amber-500 to-orange-500" },
          { label: "Sécurité", icon: ShieldAlert, color: "from-red-500 to-rose-500" },
          { label: "Propreté", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
          { label: "Sanitaires", icon: AlertCircle, color: "from-cyan-500 to-blue-500" },
          { label: "Objet suspect", icon: Eye, color: "from-red-500 to-rose-500" },
          { label: "Zone glissante", icon: AlertCircle, color: "from-amber-500 to-orange-500" },
          { label: "Info manquante", icon: Info, color: "from-violet-500 to-purple-500" },
        ],
        patterns: [
          { l: "Tapis HS", v: "8%", c: "bg-red-500" },
          { l: "Sécurité", v: "4%", c: "bg-red-500" },
          { l: "Sanitaires", v: "21%", c: "bg-cyan-500" },
          { l: "Propreté", v: "17%", c: "bg-emerald-500" },
        ],
        bg: "dark",
      },
      {
        num: "Avantage 3 · Centralisation",
        icon: Activity,
        title: "Tableau de bord centralisé. Traçabilité totale.",
        description:
          "Qui a scanné, quand, combien de temps pour résoudre. Tout est tracé. Tout est auditable.",
        layout: "split-right",
        bullets: [
          "Chaque scan, chaque intervention est horodatée et attribuée",
          "Score équipe en temps réel, par zone et par type",
          "SLA suivi avec alertes en cas de dépassement",
          "Rapports exports PDF / CSV pour audits",
        ],
        mockup: "dashboard",
        bg: "light",
      },
    ],
    deniseQuote: "Alerte ops : Tapis 4 bloqué, équipe technique notifiée",
    testimonial: {
      name: "Julien Diaz",
      initials: "JD",
      role: "Head of Ops · Aéroport européen",
      quote:
        "Denise remplace nos talkies-walkies. Les équipes n'ont plus à regarder un écran — elles sont guidées vocalement, en continu.",
    },
  },

  // 3. HOTEL
  {
    key: "hotel",
    label: "Hôtel",
    badge: "Hôtellerie",
    cardTitle: "Hôtellerie",
    tagline: "Expérience guest, housekeeping",
    icon: Hotel,
    accentFrom: "#EC4899",
    accentTo: "#8B5CF6",
    iconGradient: "from-[#EC4899] to-[#8B5CF6]",
    cardClasses:
      "border-black/5 bg-gradient-to-br from-[#FDF2F8] via-[#FCE7F3] to-[#F9A8D4]/30 hover:shadow-[#EC4899]/20",
    glowClasses: "bg-[#EC4899]/30",
    cardTitleColor: "text-[#0F172A]",
    cardBodyColor: "text-[#0F172A]/70",
    cardLinkColor: "text-[#EC4899]",
    dark: false,
    ctaVariant: "primary",
    heroTitle: (
      <>
        L&apos;expérience guest, du{" "}
        <span className="bg-gradient-to-r from-[#EC4899] to-[#8B5CF6] bg-clip-text text-transparent">
          lobby à la chambre.
        </span>
      </>
    ),
    heroSubtitle:
      "Housekeeping piloté. Satisfaction mesurée. Wi-fi maîtrisé. Chaque détail compte, du check-in au check-out.",
    qrBadge: "Chambre 301",
    qrTitle: "Signaler un besoin",
    qrUrl: "hotel.feedbackpro.io/r/301",
    qrCaption: "Un QR par chambre, discret",
    advantages: [
      {
        num: "Avantage 1",
        icon: KeyRound,
        title: "Un QR par chambre. Discrétion absolue.",
        description:
          "Posé sur la table de nuit, le miroir ou le menu room service. Le guest signale sans appeler la réception. Vous centralisez sans interrompre.",
        layout: "split-left",
        bullets: [
          "QR unique par chambre, relié au PMS",
          "Catégories : housekeeping, maintenance, conciergerie",
          "Aucune app pour le guest",
          "Compatible avec la charte de l'établissement",
        ],
        mockup: "qr",
        bg: "white",
      },
      {
        num: "Avantage 2",
        icon: Sparkles,
        title: "L'IA trie les signalements guest.",
        description:
          "Clim HS, Wi-Fi, literie, propreté. Chaque retour est catégorisé et routé vers la bonne équipe instantanément.",
        layout: "centered-tags",
        tags: [
          { label: "Clim HS", icon: AirVent, color: "from-cyan-500 to-blue-500" },
          { label: "Literie", icon: BedDouble, color: "from-amber-500 to-orange-500" },
          { label: "Wi-Fi", icon: Wifi, color: "from-violet-500 to-purple-500" },
          { label: "Propreté", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
          { label: "Bruit", icon: BellRing, color: "from-rose-500 to-pink-500" },
          { label: "Room service lent", icon: Clock, color: "from-amber-500 to-orange-500" },
          { label: "Conciergerie", icon: ConciergeBell, color: "from-[#5257C9] to-[#7C3AED]" },
          { label: "Vue agréable", icon: Sparkles, color: "from-emerald-500 to-teal-500" },
        ],
        patterns: [
          { l: "Wi-Fi", v: "23%", c: "bg-violet-500" },
          { l: "Clim HS", v: "11%", c: "bg-cyan-500" },
          { l: "Propreté", v: "8%", c: "bg-emerald-500" },
          { l: "Literie", v: "5%", c: "bg-amber-500" },
        ],
        bg: "light",
      },
      {
        num: "Avantage 3",
        icon: BedDouble,
        title: "Housekeeping piloté en temps réel.",
        description:
          "Chaque chambre a un statut live : à faire, en cours, terminé, urgent. Les femmes de chambre n'attendent plus la feuille de route paper.",
        layout: "split-right",
        steps: [
          { n: "1", t: "Guest signale", d: "« Chambre 301, draps à changer » via QR", icon: BellRing, color: "text-[#EC4899]" },
          { n: "2", t: "Denise priorise", d: "Urgent vs à-faire, attribution automatique à l'étage", icon: Sparkles, color: "text-[#8B5CF6]" },
          { n: "3", t: "Femme de chambre notifiée", d: "Sur son téléphone, avec le n° de chambre et le besoin", icon: Phone, color: "text-[#5257C9]" },
          { n: "4", t: "Statut synchronisé", d: "Réception et superviseur voient la chambre en temps réel", icon: CheckCircle2, color: "text-emerald-500" },
        ],
        mockup: "housekeeping",
        bg: "white",
      },
    ],
    deniseQuote: "Alerte housekeeping : Chambre 301, draps à changer",
    testimonial: {
      name: "Sophie Renaud",
      initials: "SR",
      role: "Directrice · Hôtel 4 étoiles",
      quote:
        "Le housekeeping n'a jamais été aussi réactif. On gagne 40 minutes par étage sur le check-out. Les avis Booking montent.",
    },
  },

  // 4. GARE
  {
    key: "gare",
    label: "Gare",
    badge: "Gare",
    cardTitle: "Gares",
    tagline: "Embarquement, information voyageur",
    icon: Bus,
    accentFrom: "#06B6D4",
    accentTo: "#10B981",
    iconGradient: "from-[#06B6D4] to-[#10B981]",
    cardClasses:
      "border-white/10 bg-gradient-to-br from-[#042F2E] via-[#064E3B] to-[#06B6D4]/20 hover:shadow-[#06B6D4]/30",
    glowClasses: "bg-[#06B6D4]/30",
    cardTitleColor: "text-white",
    cardBodyColor: "text-white/70",
    cardLinkColor: "text-[#06B6D4]",
    dark: false,
    ctaVariant: "tech",
    heroTitle: (
      <>
        <span className="bg-gradient-to-r from-[#06B6D4] to-[#10B981] bg-clip-text text-transparent">
          Fluidifiez l&apos;embarquement,
        </span>
        <br />
        informez en temps réel.
      </>
    ),
    heroSubtitle:
      "QR aux quais. Info voyageurs connectée. Denise annonce les retards. Le voyageur n'est plus seul face à l'incertitude.",
    qrBadge: "Quai 3 · Départ Dakar",
    qrTitle: "Signaler un problème",
    qrUrl: "gare.feedbackpro.io/q/3",
    qrCaption: "QR aux quais et guichets",
    advantages: [
      {
        num: "Avantage 1",
        icon: Signpost,
        title: "QR aux quais et guichets. Info connectée.",
        description:
          "Chaque quai, chaque guichet a son QR. Le voyageur signale un retard perçu, un quai saturé, une info manquante. Vous répondez sans intermédiaire.",
        layout: "split-left",
        bullets: [
          "QR par quai, par guichet, par borne",
          "Catégories : retard, saturation, info manquante, propreté",
          "Relié au système d'info voyageurs",
          "Multilingue automatique",
        ],
        mockup: "qr",
        bg: "white",
      },
      {
        num: "Avantage 2",
        icon: Sparkles,
        title: "L'IA catégorise les signalements voyageurs.",
        description:
          "Bus retardé, quai saturé, info manquante. Chaque retour est trié, priorisé et affiché sur le tableau info voyageurs.",
        layout: "centered-tags",
        tags: [
          { label: "Bus retardé", icon: Clock, color: "from-amber-500 to-orange-500" },
          { label: "Quai saturé", icon: Users, color: "from-red-500 to-rose-500" },
          { label: "Info manquante", icon: Info, color: "from-[#06B6D4] to-[#10B981]" },
          { label: "Propreté", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
          { label: "Sécurité", icon: ShieldAlert, color: "from-red-500 to-rose-500" },
          { label: "Affichage HS", icon: AlertCircle, color: "from-amber-500 to-orange-500" },
          { label: "Billet contrôlé", icon: CheckCircle2, color: "from-emerald-500 to-teal-500" },
          { label: "Correspondance ratée", icon: AlertCircle, color: "from-red-500 to-rose-500" },
        ],
        patterns: [
          { l: "Bus retardé", v: "29%", c: "bg-amber-500" },
          { l: "Quai saturé", v: "14%", c: "bg-red-500" },
          { l: "Info manquante", v: "19%", c: "bg-[#06B6D4]" },
          { l: "Propreté", v: "7%", c: "bg-emerald-500" },
        ],
        bg: "light",
      },
      {
        num: "Avantage 3",
        icon: Megaphone,
        title: "Info voyageurs temps réel. Denise annonce.",
        description:
          "Le tableau info voyageurs se met à jour automatiquement. Denise annonce les retards par voie vocale sur les quais. Fini le silence anxiogène.",
        layout: "split-right",
        steps: [
          { n: "1", t: "Voyageur signale", d: "« Bus Dakar retardé » via QR quai 3", icon: Signpost, color: "text-[#06B6D4]" },
          { n: "2", t: "IA confirme", d: "Croisement avec données planning et GPS bus", icon: Activity, color: "text-[#10B981]" },
          { n: "3", t: "Affichage MAJ", d: "Tableau info voyageurs mis à jour en <5s", icon: Megaphone, color: "text-[#5257C9]" },
          { n: "4", t: "Denise annonce", d: "Vocale sur le quai : « Retard 20min, voie 3. »", icon: Volume2, color: "text-[#06B6D4]" },
        ],
        mockup: "infovoyageurs",
        bg: "white",
      },
    ],
    deniseQuote: "Alerte quai : Bus Dakar retard 20min, affichage mis à jour",
    testimonial: {
      name: "Karim Benali",
      initials: "KB",
      role: "Responsable gare · Réseau national",
      quote:
        "L'info voyageurs enfin connectée au terrain. Les voyageurs signalent, Denise annonce. Le stress sur les quais a chuté de moitié.",
    },
  },

  // 5. HOPITAL
  {
    key: "hopital",
    label: "Hôpital",
    badge: "Santé",
    cardTitle: "Santé",
    tagline: "Hygiène, flux patients, équipements",
    icon: Stethoscope,
    accentFrom: "#EF4444",
    accentTo: "#F43F5E",
    iconGradient: "from-[#EF4444] to-[#F43F5E]",
    cardClasses:
      "border-black/5 bg-gradient-to-br from-[#FEF2F2] via-[#FEE2E2] to-[#FCA5A5]/30 hover:shadow-[#EF4444]/20",
    glowClasses: "bg-[#EF4444]/30",
    cardTitleColor: "text-[#0F172A]",
    cardBodyColor: "text-[#0F172A]/70",
    cardLinkColor: "text-[#EF4444]",
    dark: false,
    ctaVariant: "primary",
    heroTitle: (
      <>
        <span className="bg-gradient-to-r from-[#EF4444] to-[#F43F5E] bg-clip-text text-transparent">
          Hygiène, flux patients, équipements
        </span>{" "}
        maîtrisés.
      </>
    ),
    heroSubtitle:
      "De l'accueil aux urgences, chaque retour compte. Patients, familles, soignants : tout le monde devient capteur.",
    qrBadge: "Salle d'attente Urgences",
    qrTitle: "Signaler un besoin",
    qrUrl: "hopital.feedbackpro.io/u/urg",
    qrCaption: "QR dans salles d'attente et services",
    advantages: [
      {
        num: "Avantage 1",
        icon: HeartPulse,
        title: "QR dans salles d'attente. Voix des patients.",
        description:
          "Aux urgences, en consultation, en radiologie. Le patient ou sa famille signale sans interrompre le personnel. Vous captez l'invisible.",
        layout: "split-left",
        bullets: [
          "QR dans chaque salle d'attente et service",
          "Catégories : attente, hygiène, équipement, accueil",
          "Anonyme, compatible secret médical",
          "Multilingue pour patients non-francophones",
        ],
        mockup: "qr",
        bg: "white",
      },
      {
        num: "Avantage 2",
        icon: Sparkles,
        title: "L'IA trie les signalements patients.",
        description:
          "Attente excessive, hygiène, équipement HS. Chaque retour est catégorisé, priorisé et routé vers le bon service.",
        layout: "centered-tags",
        tags: [
          { label: "Attente excessive", icon: Clock, color: "from-red-500 to-rose-500" },
          { label: "Hygiène", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
          { label: "Équipement HS", icon: Wrench, color: "from-amber-500 to-orange-500" },
          { label: "Accueil", icon: ConciergeBell, color: "from-[#5257C9] to-[#7C3AED]" },
          { label: "Wi-Fi", icon: Wifi, color: "from-violet-500 to-purple-500" },
          { label: "Clim", icon: AirVent, color: "from-cyan-500 to-blue-500" },
          { label: "Info manquante", icon: Info, color: "from-amber-500 to-orange-500" },
          { label: "Personnel à l'écoute", icon: HeartPulse, color: "from-emerald-500 to-teal-500" },
        ],
        patterns: [
          { l: "Attente excessive", v: "38%", c: "bg-red-500" },
          { l: "Hygiène", v: "12%", c: "bg-emerald-500" },
          { l: "Équipement HS", v: "9%", c: "bg-amber-500" },
          { l: "Accueil", v: "17%", c: "bg-[#5257C9]" },
        ],
        bg: "light",
      },
      {
        num: "Avantage 3",
        icon: Activity,
        title: "Flux patients optimisé. Saturation anticipée.",
        description:
          "Tableau live par zone : urgences, consultations, radio, labo. Quand la salle d'attente se sature, Denise alerte automatiquement pour renfort.",
        layout: "split-right",
        steps: [
          { n: "1", t: "Patient signale", d: "« Attente trop longue » via QR urgences", icon: Clock, color: "text-red-500" },
          { n: "2", t: "IA croise les flux", d: "Comptage patients vs capacité, détection saturation", icon: Activity, color: "text-[#EF4444]" },
          { n: "3", t: "Renfort demandé", d: "Denise alerte le cadre de garde pour ouverture box", icon: BellRing, color: "text-amber-500" },
          { n: "4", t: "Patient informé", d: "Délai estimé communiqué sur afficheur salle d'attente", icon: Info, color: "text-[#06B6D4]" },
        ],
        mockup: "patientflow",
        bg: "white",
      },
    ],
    deniseQuote: "Alerte urgences : Salle d'attente saturée, renfort demandé",
    testimonial: {
      name: "Dr. Aïcha Diop",
      initials: "AD",
      role: "Urgentiste · Centre hospitalier",
      quote:
        "Les flux patients sont devenus lisibles. On anticipe la saturation des urgences au lieu de la subir. Les familles sont mieux informées.",
    },
  },

  // 6. ERP
  {
    key: "erp",
    label: "ERP",
    badge: "Établissements Publics",
    cardTitle: "Établissements Publics",
    tagline: "Accueil usagers, maintenance",
    icon: Landmark,
    accentFrom: "#10B981",
    accentTo: "#F59E0B",
    iconGradient: "from-[#10B981] to-[#F59E0B]",
    cardClasses:
      "border-white/10 bg-gradient-to-br from-[#022C22] via-[#064E3B] to-[#10B981]/20 hover:shadow-[#10B981]/30",
    glowClasses: "bg-[#10B981]/30",
    cardTitleColor: "text-white",
    cardBodyColor: "text-white/70",
    cardLinkColor: "text-[#10B981]",
    dark: false,
    ctaVariant: "primary",
    heroTitle: (
      <>
        <span className="bg-gradient-to-r from-[#10B981] to-[#F59E0B] bg-clip-text text-transparent">
          Accueil usagers fluide,
        </span>
        <br />
        maintenance proactive.
      </>
    ),
    heroSubtitle:
      "Du guichet aux bornes interactives, tout est tracé. L'usager signale, la maintenance intervient, la mairie pilote.",
    qrBadge: "Guichet 3 · Hall principal",
    qrTitle: "Signaler un besoin",
    qrUrl: "erp.feedbackpro.io/g/3",
    qrCaption: "QR aux guichets et bornes",
    advantages: [
      {
        num: "Avantage 1",
        icon: Landmark,
        title: "QR aux guichets et bornes interactives.",
        description:
          "Chaque guichet, chaque borne a son QR. L'usager signale une file longue, une borne HS, un guichet fermé. La maintenance intervient avant la plainte.",
        layout: "split-left",
        bullets: [
          "QR par guichet, borne, ascenseur, écran info",
          "Catégories : file, borne HS, guichet, accessibility",
          "Compatible avec les chartes des collectivités",
          "Multilingue pour usagers non-francophones",
        ],
        mockup: "qr",
        bg: "white",
      },
      {
        num: "Avantage 2",
        icon: Sparkles,
        title: "L'IA trie les signalements usagers.",
        description:
          "File longue, borne HS, guichet fermé. Chaque retour est catégorisé et priorisé. La maintenance et l'accueil voient la même vue live.",
        layout: "centered-tags",
        tags: [
          { label: "File longue", icon: Users, color: "from-amber-500 to-orange-500" },
          { label: "Borne HS", icon: Wrench, color: "from-red-500 to-rose-500" },
          { label: "Guichet fermé", icon: AlertCircle, color: "from-amber-500 to-orange-500" },
          { label: "Écran info HS", icon: AlertCircle, color: "from-red-500 to-rose-500" },
          { label: "Propreté", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
          { label: "Accessibilité", icon: Footprints, color: "from-[#5257C9] to-[#7C3AED]" },
          { label: "Ascenseur HS", icon: Wrench, color: "from-red-500 to-rose-500" },
          { label: "Accueil pro", icon: ConciergeBell, color: "from-emerald-500 to-teal-500" },
        ],
        patterns: [
          { l: "File longue", v: "26%", c: "bg-amber-500" },
          { l: "Borne HS", v: "11%", c: "bg-red-500" },
          { l: "Guichet fermé", v: "9%", c: "bg-amber-500" },
          { l: "Accessibilité", v: "5%", c: "bg-[#5257C9]" },
        ],
        bg: "light",
      },
      {
        num: "Avantage 3",
        icon: Wrench,
        title: "Maintenance proactive. Borne HS ? On sait avant l'usager.",
        description:
          "Tableau live par équipement : bornes, guichets, ascenseurs, écrans. Quand une borne tombe, le technicien est notifié avant même qu'un usager ne signale.",
        layout: "split-right",
        steps: [
          { n: "1", t: "Usager signale", d: "« Borne interactive HS » via QR hall principal", icon: AlertCircle, color: "text-red-500" },
          { n: "2", t: "IA priorise", d: "Critique vs planifié, attribution au technicien de garde", icon: Sparkles, color: "text-[#10B981]" },
          { n: "3", t: "Technicien notifié", d: "Sur son téléphone, avec localisation et contexte", icon: Phone, color: "text-[#5257C9]" },
          { n: "4", t: "Résolution tracée", d: "Statut synchronisé au superviseur et au responsable", icon: CheckCircle2, color: "text-emerald-500" },
        ],
        mockup: "maintenanceboard",
        bg: "white",
      },
    ],
    deniseQuote: "Alerte maintenance : Borne interactive HS, hall principal",
    testimonial: {
      name: "Nadia Faure",
      initials: "NF",
      role: "Directrice · Mairie (Services aux usagers)",
      quote:
        "Le guichet redevient fluide. Les bornes ne restent plus HS pendant des jours. Les usagers sentent que la collectivité répond.",
    },
  },
]

// ----------------------------------------------------------------------------
// PAGE SECTEUR (générique)
// ----------------------------------------------------------------------------

function SectorPage({
  sector,
  navigate,
  onSignup,
}: {
  sector: SectorConfig
  navigate: Navigate
  onSignup: () => void
}) {
  const dark = sector.dark

  return (
    <>
      {/* HERO */}
      <section
        className={`relative flex min-h-[60vh] items-center overflow-hidden ${
          dark ? "bg-[#0F172A] text-white" : "bg-[#F8FAFC]"
        }`}
      >
        <Aurora dark={dark} />
        <div
          className={`fbp-grid-mask pointer-events-none absolute inset-0 ${
            dark ? "fbp-grid-dark" : "fbp-grid-light"
          }`}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-screen-2xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Reveal>
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur ${
                  dark
                    ? "border-white/15 bg-white/5 text-white/90"
                    : "border-black/10 bg-white/70 text-[#0F172A]"
                }`}
              >
                <sector.icon className="h-3 w-3" style={{ color: sector.accentFrom }} />
                {sector.badge}
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1
                className={`mt-5 text-4xl font-bold tracking-tighter leading-[0.95] sm:text-5xl lg:text-6xl ${
                  dark ? "text-white" : "text-[#0F172A]"
                }`}
              >
                {sector.heroTitle}
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p
                className={`mt-5 max-w-2xl text-base sm:text-lg ${
                  dark ? "text-white/70" : "text-muted-foreground"
                }`}
              >
                {sector.heroSubtitle}
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <CtaSignup onSignup={onSignup} variant={sector.ctaVariant}>
                  Essayer gratuitement
                </CtaSignup>
                <button
                  onClick={() => navigate("contact")}
                  className={`flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold backdrop-blur transition-all ${
                    dark
                      ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                      : "border-black/10 bg-white/60 text-[#0F172A] hover:bg-white"
                  }`}
                >
                  Demander une démo
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ADVANTAGES 1-3 */}
      {sector.advantages.map((adv, idx) => (
        <AdvantageSection key={idx} adv={adv} sector={sector} index={idx} />
      ))}

      {/* DENISE QUOTE */}
      <DeniseQuoteSection sector={sector} />

      {/* TESTIMONIAL */}
      <TestimonialSection sector={sector} />

      {/* CTA */}
      <SectorCtaSection sector={sector} navigate={navigate} />
    </>
  )
}

function AdvantageSection({
  adv,
  sector,
  index,
}: {
  adv: Advantage
  sector: SectorConfig
  index: number
}) {
  const dark = adv.bg === "dark"
  const bgClass =
    adv.bg === "dark"
      ? "bg-[#0F172A] text-white"
      : adv.bg === "light"
        ? "bg-[#F8FAFC]"
        : "bg-white"

  if (adv.layout === "centered-tags") {
    return (
      <section className={`relative py-24 sm:py-28 ${bgClass}`}>
        {dark && (
          <div
            className="pointer-events-none absolute top-0 left-1/2 h-[32rem] w-[50rem] -translate-x-1/2 rounded-full bg-[#7C3AED]/15 blur-[140px]"
            aria-hidden
          />
        )}
        <div className="relative mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div
                className={`flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest ${
                  dark ? "text-[#06B6D4]" : "text-[#5257C9]"
                }`}
              >
                <adv.icon className="h-3 w-3" /> {adv.num}
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2
                className={`mt-3 text-3xl font-bold tracking-tight sm:text-4xl ${
                  dark ? "text-white" : "text-[#0F172A]"
                }`}
              >
                {adv.title}
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p
                className={`mt-5 text-base sm:text-lg ${
                  dark ? "text-white/70" : "text-muted-foreground"
                }`}
              >
                {adv.description}
              </p>
            </Reveal>
          </div>

          {adv.tags && (
            <TagsGrid tags={adv.tags} patterns={adv.patterns} dark={dark} />
          )}
        </div>
      </section>
    )
  }

  // split layout
  const isSplitRight = adv.layout === "split-right"
  return (
    <section className={`relative py-24 sm:py-28 ${bgClass}`}>
      {dark && (
        <div
          className="pointer-events-none absolute top-0 left-1/2 h-[32rem] w-[50rem] -translate-x-1/2 rounded-full bg-[#5257C9]/15 blur-[140px]"
          aria-hidden
        />
      )}
      <div className="relative mx-auto grid max-w-screen-2xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        {/* Mockup side */}
        <Reveal
          delay={0.2}
          className={isSplitRight ? "order-2 lg:order-1" : "order-2 lg:order-2"}
        >
          <AdvantageMockup type={adv.mockup} sector={sector} />
        </Reveal>

        {/* Content side */}
        <div className={isSplitRight ? "order-1 lg:order-2" : "order-1 lg:order-1"}>
          <Reveal>
            <div
              className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${
                dark ? "text-[#06B6D4]" : "text-[#5257C9]"
              }`}
            >
              <adv.icon className="h-3 w-3" /> {adv.num}
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className={`mt-3 text-3xl font-bold tracking-tight sm:text-4xl ${
                dark ? "text-white" : "text-[#0F172A]"
              }`}
            >
              {adv.title}
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p
              className={`mt-5 text-base sm:text-lg ${
                dark ? "text-white/70" : "text-muted-foreground"
              }`}
            >
              {adv.description}
            </p>
          </Reveal>

          {adv.bullets && (
            <Reveal delay={0.24}>
              <ul className="mt-6 space-y-3">
                {adv.bullets.map((f, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-3 text-sm ${
                      dark ? "text-white/80" : "text-[#0F172A]/80"
                    }`}
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: sector.accentFrom }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {adv.steps && (
            <Reveal delay={0.24}>
              <div className="mt-6 space-y-3">
                {adv.steps.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-4 rounded-xl border p-4 ${
                      dark
                        ? "border-white/10 bg-white/5"
                        : "border-black/5 bg-[#F8FAFC]"
                    }`}
                  >
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white"
                      style={{
                        backgroundImage: `linear-gradient(to bottom right, ${sector.accentFrom}, ${sector.accentTo})`,
                      }}
                    >
                      {s.n}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                        <div
                          className={`text-sm font-semibold ${
                            dark ? "text-white" : "text-[#0F172A]"
                          }`}
                        >
                          {s.t}
                        </div>
                      </div>
                      <div
                        className={`mt-0.5 text-xs ${
                          dark ? "text-white/60" : "text-muted-foreground"
                        }`}
                      >
                        {s.d}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  )
}

function AdvantageMockup({
  type,
  sector,
}: {
  type?: MockupType
  sector: SectorConfig
}) {
  switch (type) {
    case "qr":
      return (
        <SectorQrCard
          badge={sector.qrBadge}
          title={sector.qrTitle}
          url={sector.qrUrl}
          // Static Tailwind literals — JIT needs literal class names.
          // Sectors without `dark` use a light, near-neutral gradient; the
          // accent is carried by the inline-style glow + accent-colored title.
          bgGradient={
            sector.dark
              ? "from-[#0F172A] via-[#1E2A4A] to-[#5257C9]/20"
              : "from-[#F8FAFC] via-white to-slate-100"
          }
          accentColor={sector.accentFrom}
        />
      )
    case "phone":
      return <PhoneMockup />
    case "terminal":
      return <TerminalMapMockup />
    case "dashboard":
      return <CentralDashboardMockup />
    case "housekeeping":
      return <HousekeepingBoard />
    case "infovoyageurs":
      return <InfoVoyageursBoard />
    case "patientflow":
      return <PatientFlowBoard />
    case "maintenanceboard":
      return <MaintenanceBoard />
    case "denise":
      return <DeniseLiveCard dark={sector.dark} />
    default:
      return null
  }
}

function DeniseQuoteSection({ sector }: { sector: SectorConfig }) {
  return (
    <section className="relative overflow-hidden bg-[#0F172A] py-24 text-white sm:py-32">
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[40rem] w-[60rem] -translate-x-1/2 rounded-full blur-[140px]"
        style={{ background: sector.accentFrom + "20" }}
        aria-hidden
      />
      <div className="absolute inset-0 fbp-grid-dark opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#06B6D4]">
            <Mic className="h-3 w-3" /> Denise · {sector.label}
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-6 flex h-16 items-center justify-center gap-1">
            <SoundWave
              bars={20}
              barClassName="w-1"
              // bar color uses sector accent
            />
          </div>
        </Reveal>
        <Reveal delay={0.16}>
          <blockquote className="mt-6 text-2xl font-medium leading-relaxed text-white/95 sm:text-3xl">
            « {sector.deniseQuote} »
          </blockquote>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#06B6D4]">
            — Denise
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function TestimonialSection({ sector }: { sector: SectorConfig }) {
  return (
    <section className="bg-[#F8FAFC] py-24 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-white p-8 shadow-xl sm:p-12">
            <Quote
              className="absolute -right-4 -top-4 h-24 w-24"
              style={{ color: sector.accentFrom + "10" }}
            />
            <div className="relative">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]"
                  />
                ))}
              </div>
              <blockquote className="mt-5 text-xl font-medium leading-relaxed text-[#0F172A] sm:text-2xl">
                « {sector.testimonial.quote} »
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${sector.accentFrom}, ${sector.accentTo})`,
                  }}
                >
                  {sector.testimonial.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {sector.testimonial.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sector.testimonial.role}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function SectorCtaSection({
  sector,
  navigate,
}: {
  sector: SectorConfig
  navigate: Navigate
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        className="relative py-24 sm:py-32"
        style={{
          backgroundImage: `linear-gradient(to bottom right, ${sector.accentFrom}, ${sector.accentTo})`,
        }}
      >
        <Aurora dark />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
          <Reveal delay={0.08}>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Prêt à passer au temps réel ?
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-2xl text-base text-white/85 sm:text-lg">
              Demandez une démo personnalisée {sector.label.toLowerCase()}.
              Configuration en 24h.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-8">
              <CtaSignup onSignup={() => navigate("contact")} variant="white">
                Demander une démo {sector.label.toLowerCase()}
              </CtaSignup>
            </div>
          </Reveal>
          <Reveal delay={0.32}>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/80">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Sous 24h
              </span>
              <span className="text-white/40">·</span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" /> Sans engagement
              </span>
              <span className="text-white/40">·</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> Adaptée à votre secteur
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------
// PAGE 8 : A PROPOS
// ----------------------------------------------------------------------------

function AproposPage() {
  return (
    <>
      {/* HERO */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <div className="w-fit mx-auto rounded-xl bg-white px-4 py-2 shadow-lg">
              <Logo className="h-10 w-auto" />
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 text-4xl font-bold tracking-tighter text-[#0F172A] sm:text-5xl">
              Redonner du{" "}
              <span className="bg-gradient-to-r from-[#5257C9] to-[#7C3AED] bg-clip-text text-transparent">
                pouvoir d&apos;agir
              </span>{" "}
              au terrain.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 text-base text-muted-foreground sm:text-lg">
              Nous croyons que les meilleures données viennent du terrain. Pas
              d&apos;enquêtes post-visite. Pas de formulaires ignorés. Du
              feedback instantané, actionnable, au moment où il compte.
            </p>
          </Reveal>
        </div>
      </section>

      {/* HISTOIRE DE DENISE */}
      <section className="bg-white py-24 sm:py-28">
        <div className="mx-auto grid max-w-screen-2xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                L&apos;histoire
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Pourquoi une voix ?
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Dans un aéroport, une cuisine, une chambre d&apos;hôtel ou un
                service d&apos;urgences, les mains sont occupées et les yeux
                ailleurs. La voix est le seul canal qui ne dérange pas. Denise
                est née de cette observation simple : il faut alerter sans
                regarder, guider sans interrompre.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                Aujourd&apos;hui, Denise veille sur des restaurants, des
                aéroports, des hôtels, des gares, des hôpitaux et des
                établissements publics. Elle ne remplace pas les équipes. Elle
                les rend plus rapides, plus justes, plus humaines.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-[#0F172A] to-[#1E2A4A] p-8 text-white shadow-2xl">
              <div className="absolute inset-0 fbp-grid-dark opacity-40" aria-hidden />
              {/* Denise avatar */}
              <div className="relative flex items-center justify-center">
                <div className="relative">
                  <span className="fbp-ring-pulse absolute inset-0 rounded-full bg-[#7C3AED]/40" />
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7C3AED] shadow-2xl">
                    <Volume2 className="h-10 w-10 text-white" />
                  </div>
                </div>
              </div>
              <div className="relative mt-6 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#06B6D4]">
                  Denise · Assistante vocale
                </div>
                <div className="mt-4 flex h-16 items-center justify-center gap-1">
                  <SoundWave bars={22} barClassName="from-[#5257C9] to-[#06B6D4] w-1" />
                </div>
                <p className="mt-4 text-sm text-white/80">
                  « Bonjour. Je veille sur votre établissement. Dites-moi ce qui
                  doit être traité, je m&apos;occupe du reste. »
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MULTI-SECTEURS */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Un moteur, six terrains
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Denise parle le langage de chaque secteur.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Le même moteur s&apos;adapte au vocabulaire, aux enjeux et aux
                équipes de chaque environnement. Une cuisine n&apos;est pas un
                quai de gare. Denise le sait.
              </p>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECTORS.map((s, i) => (
              <Reveal key={s.key} delay={0.05 * i}>
                <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${s.iconGradient} text-white shadow-lg`}
                  >
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#0F172A]">
                      {s.cardTitle}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.tagline}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* EQUIPE */}
      <section className="bg-white py-24 sm:py-28">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                L&apos;équipe
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Une équipe obsédée par le terrain.
              </h2>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                initials: "AR",
                name: "Alexandre Roy",
                role: "CEO & Co-fondateur",
                bio: "15 ans dans l'hôtellerie-restauration. A vu trop de mauvaises expériences devenir des avis publics. A décidé d'agir en amont.",
                color: "from-[#5257C9] to-[#7C3AED]",
              },
              {
                initials: "SK",
                name: "Sofia Kone",
                role: "CTO & Co-fondatrice",
                bio: "Ingénieure IA. A conçu Denise pour qu'elle parle comme une collègue, pas comme un robot. Obsédée par la latence et la clarté.",
                color: "from-[#06B6D4] to-[#5257C9]",
              },
              {
                initials: "JD",
                name: "Julien Diaz",
                role: "Head of Ops Multi-Secteurs",
                bio: "Ex-responsable opérations dans un grand aéroport européen. Connaît chaque mètre carré d'un terminal — et chaque douleur associée.",
                color: "from-[#7C3AED] to-[#06B6D4]",
              },
            ].map((m, i) => (
              <Reveal key={i} delay={0.1 * i}>
                <div className="group h-full rounded-2xl border border-black/5 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${m.color} text-lg font-bold text-white shadow-lg`}
                  >
                    {m.initials}
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[#0F172A]">
                    {m.name}
                  </h3>
                  <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                    {m.role}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{m.bio}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* VALEURS */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Nos valeurs
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Ce qui nous guide.
              </h2>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Sparkles,
                t: "Simplicité radicale",
                d: "Un QR. Un scan. Une action. Si une fonction demande plus de 30 secondes à expliquer, on la supprime.",
              },
              {
                icon: Zap,
                t: "Temps réel, toujours",
                d: "Le présent est la seule temporalité qui compte au terrain. Tout le reste est de l'archéologie.",
              },
              {
                icon: Building2,
                t: "Le terrain d'abord",
                d: "Nos décisions se prennent sur place, avec ceux qui vivent l'expérience. Pas dans un bureau.",
              },
            ].map((v, i) => (
              <Reveal key={i} delay={0.1 * i}>
                <div className="h-full rounded-2xl border border-[#5257C9]/10 bg-gradient-to-br from-[#F8FAFC] to-white p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5257C9] to-[#7C3AED] text-white shadow-lg shadow-[#5257C9]/25">
                    <v.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[#0F172A]">
                    {v.t}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{v.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

// ----------------------------------------------------------------------------
// PAGE 9 : CONTACT
// ----------------------------------------------------------------------------

function ContactPage() {
  const [sent, setSent] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <>
      {/* HERO */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#5257C9]/15 bg-white/70 px-4 py-1.5 text-xs font-medium text-[#5257C9] backdrop-blur">
              <Mail className="h-3 w-3" /> Contact
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-5 text-4xl font-bold tracking-tighter text-[#0F172A] sm:text-5xl">
              Parlez-nous de votre{" "}
              <span className="bg-gradient-to-r from-[#5257C9] to-[#7C3AED] bg-clip-text text-transparent">
                établissement.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 text-base text-muted-foreground sm:text-lg">
              Une démo personnalisée sous 24h, adaptée à votre secteur.
            </p>
          </Reveal>
        </div>
      </section>

      {/* FORM */}
      <section className="bg-[#F8FAFC] pb-24">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <Reveal>
            <form
              onSubmit={onSubmit}
              className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl sm:p-8"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom">
                  <Input
                    required
                    placeholder="Marie Dupont"
                    className="h-11 border-black/10 bg-[#F8FAFC] focus:border-[#5257C9]"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    required
                    type="email"
                    placeholder="marie@etablissement.com"
                    className="h-11 border-black/10 bg-[#F8FAFC] focus:border-[#5257C9]"
                  />
                </Field>
                <Field label="Type d'établissement">
                  <Select required>
                    <SelectTrigger className="h-11 border-black/10 bg-[#F8FAFC] focus:border-[#5257C9]">
                      <SelectValue placeholder="Sélectionnez" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                      <SelectItem value="aeroport">Aéroport</SelectItem>
                      <SelectItem value="hotel">Hôtel</SelectItem>
                      <SelectItem value="gare">Gare</SelectItem>
                      <SelectItem value="hopital">Hôpital / Santé</SelectItem>
                      <SelectItem value="erp">Établissement public</SelectItem>
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Volume estimé">
                  <Input
                    placeholder="Couverts / passagers / chambres / jour"
                    className="h-11 border-black/10 bg-[#F8FAFC] focus:border-[#5257C9]"
                  />
                </Field>
                <Field label="Défi principal" className="sm:col-span-2">
                  <Select required>
                    <SelectTrigger className="h-11 border-black/10 bg-[#F8FAFC] focus:border-[#5257C9]">
                      <SelectValue placeholder="Sélectionnez votre défi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incidents">Gestion des incidents</SelectItem>
                      <SelectItem value="satisfaction">Satisfaction client</SelectItem>
                      <SelectItem value="reactivite">Réactivité staff</SelectItem>
                      <SelectItem value="hygiene">Hygiène / propreté</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Message" className="sm:col-span-2">
                  <Textarea
                    required
                    rows={4}
                    placeholder="Parlez-nous de votre établissement"
                    className="border-black/10 bg-[#F8FAFC] focus:border-[#5257C9]"
                  />
                </Field>
              </div>

              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Une démo personnalisée sous 24h, adaptée à votre secteur.
                </p>
                <Button
                  type="submit"
                  className="h-12 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED] px-6 text-sm font-semibold text-white shadow-lg shadow-[#5257C9]/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#5257C9]/40"
                >
                  <span className="flex items-center gap-2">
                    Demander ma démo
                    <Send className="h-4 w-4" />
                  </span>
                </Button>
              </div>

              {sent && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-800">
                      Demande envoyée.
                    </div>
                    <div className="text-xs text-emerald-700">
                      Notre équipe vous recontacte sous 24h pour planifier une
                      démo adaptée à votre secteur.
                    </div>
                  </div>
                </motion.div>
              )}
            </form>
          </Reveal>
        </div>
      </section>

      {/* PROMISE */}
      <section className="px-4 pb-24 sm:px-6">
        <Reveal className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5257C9] to-[#7C3AED] py-16 px-6 text-center text-white shadow-2xl shadow-[#5257C9]/30">
            <Aurora dark />
            <div className="relative">
              <div className="mx-auto w-fit rounded-xl bg-white px-4 py-2 shadow-lg">
                <Logo className="h-7 w-auto" />
              </div>
              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                Une démo personnalisée sous 24h.
              </h2>
              <p className="mt-4 text-base text-white/80 sm:text-lg">
                Pas de call commercial générique. On adapte la démo à votre
                secteur et à vos défis spécifiques.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/70">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Sous 24h
                </span>
                <span className="text-white/40">·</span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Sans engagement
                </span>
                <span className="text-white/40">·</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> Adaptée à votre secteur
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

// ----------------------------------------------------------------------------
// FOOTER (shared) — liens vers toutes les pages secteur
// ----------------------------------------------------------------------------

function Footer({ navigate }: { navigate: Navigate }) {
  return (
    <footer className="bg-[#0F172A] text-white">
      <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="w-fit rounded-xl bg-white px-4 py-2 shadow-lg">
              <Logo className="h-7 w-auto" />
            </div>
            <p className="mt-4 max-w-sm text-sm text-white/60">
              L&apos;intelligence terrain pour vos établissements. Piloté par
              Denise, votre assistante vocale temps réel.
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 backdrop-blur">
              <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
              Denise veille · 24/7
            </div>
          </div>

          {/* Secteurs */}
          <FooterCol
            title="Secteurs"
            links={[
              { label: "Restaurant", onClick: () => navigate("restaurant") },
              { label: "Aéroport", onClick: () => navigate("aeroport") },
              { label: "Hôtel", onClick: () => navigate("hotel") },
              { label: "Gare", onClick: () => navigate("gare") },
              { label: "Santé", onClick: () => navigate("hopital") },
              { label: "Établissements publics", onClick: () => navigate("erp") },
            ]}
          />

          {/* Société */}
          <FooterCol
            title="Société"
            links={[
              { label: "Accueil", onClick: () => navigate("accueil") },
              { label: "À propos", onClick: () => navigate("apropos") },
              { label: "Équipe", onClick: () => navigate("apropos") },
              { label: "Contact", onClick: () => navigate("contact") },
            ]}
          />

          {/* Légal */}
          <FooterCol
            title="Légal"
            links={[
              { label: "CGU", onClick: () => navigate("contact") },
              { label: "Confidentialité", onClick: () => navigate("contact") },
              { label: "RGPD", onClick: () => navigate("contact") },
              { label: "Cookies", onClick: () => navigate("contact") },
            ]}
          />
        </div>

        {/* Newsletter */}
        <div className="mt-12 grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur md:grid-cols-2 md:items-center">
          <div>
            <div className="text-sm font-semibold text-white">
              Restez informé des nouveautés FeedbackPro
            </div>
            <div className="mt-1 text-xs text-white/60">
              Une lettre mensuelle. Pas de spam. Désinscription en un clic.
            </div>
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex gap-2"
          >
            <Input
              type="email"
              placeholder="vous@etablissement.com"
              className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-[#06B6D4]"
            />
            <Button
              type="submit"
              className="h-11 shrink-0 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED] px-5 text-sm font-semibold text-white shadow-lg shadow-[#5257C9]/25"
            >
              S&apos;abonner
            </Button>
          </form>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row">
          <div>© {new Date().getFullYear()} FeedbackPro. Tous droits réservés.</div>
          <div className="flex items-center gap-2">
            <span className="fbp-pulse-dot h-2 w-2 rounded-full bg-[#06B6D4]" />
            Piloté par Denise
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({
  title,
  links,
}: {
  title: string
  links: { label: string; onClick: () => void }[]
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-white/40">
        {title}
      </div>
      <ul className="mt-4 space-y-2.5">
        {links.map((l, i) => (
          <li key={i}>
            <button
              onClick={l.onClick}
              className="text-sm text-white/70 transition-colors hover:text-white"
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ----------------------------------------------------------------------------
// ROOT
// ----------------------------------------------------------------------------

const VALID_PAGES: LandingPage[] = [
  "accueil",
  "restaurant",
  "aeroport",
  "hotel",
  "gare",
  "hopital",
  "erp",
  "apropos",
  "contact",
]

export function LandingView({
  onLogin,
  onSignup,
}: {
  onLogin: () => void
  onSignup: () => void
}) {
  // Initial page read from URL (lazy initializer — client-safe).
  const [page, setPage] = useState<LandingPage>(() => {
    if (typeof window === "undefined") return "accueil"
    const p = new URLSearchParams(window.location.search).get("page")
    if (p && VALID_PAGES.includes(p as LandingPage)) {
      return p as LandingPage
    }
    return "accueil"
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  // Re-sync state when the user hits back/forward (popstate).
  useEffect(() => {
    if (typeof window === "undefined") return
    const onPop = () => {
      const p = new URLSearchParams(window.location.search).get("page")
      setPage(p && VALID_PAGES.includes(p as LandingPage) ? (p as LandingPage) : "accueil")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const navigate: Navigate = (p) => {
    setPage(p)
    setMobileOpen(false)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (p === "accueil") {
        url.searchParams.delete("page")
      } else {
        url.searchParams.set("page", p)
      }
      window.history.pushState({}, "", url.toString())
      window.scrollTo({ top: 0, behavior: "auto" })
    }
  }

  // Resolve active sector for sector pages
  const activeSector = SECTORS.find((s) => s.key === page)

  return (
    <div className="relative min-h-screen bg-white">
      <style dangerouslySetInnerHTML={{ __html: FBP_CSS }} />

      <Header
        page={page}
        navigate={navigate}
        onLogin={onLogin}
        onSignup={onSignup}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <motion.main
        key={page}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {page === "accueil" && <AccueilPage navigate={navigate} onSignup={onSignup} />}
        {page === "restaurant" && (
          <SectorPage sector={SECTORS[0]} navigate={navigate} onSignup={onSignup} />
        )}
        {page === "aeroport" && (
          <SectorPage sector={SECTORS[1]} navigate={navigate} onSignup={onSignup} />
        )}
        {page === "hotel" && (
          <SectorPage sector={SECTORS[2]} navigate={navigate} onSignup={onSignup} />
        )}
        {page === "gare" && (
          <SectorPage sector={SECTORS[3]} navigate={navigate} onSignup={onSignup} />
        )}
        {page === "hopital" && (
          <SectorPage sector={SECTORS[4]} navigate={navigate} onSignup={onSignup} />
        )}
        {page === "erp" && (
          <SectorPage sector={SECTORS[5]} navigate={navigate} onSignup={onSignup} />
        )}
        {page === "apropos" && <AproposPage />}
        {page === "contact" && <ContactPage />}
      </motion.main>

      {/* Reference activeSector to keep the linter happy */}
      {activeSector && <span className="sr-only">Page secteur : {activeSector.label}</span>}

      <Footer navigate={navigate} />
    </div>
  )
}
