"use client"

// ============================================================
// FeedbackPro - Landing "Premium Aeroport/Luxe" (SPA multi-page)
// ------------------------------------------------------------
// 5 pages gérées par état client : accueil | restaurant | aeroport
//   | apropos | contact. URL sync via ?page=xxx (pushState).
// Sections light #F8FAFC + sections dark dramatiques #0F172A pour
//   les parties Tech/Denise. Palette indigo #5257C9 -> violet
//   #7C3AED, accent cyan #06B6D4. Effets : aurora blobs CSS,
//   sound wave Denise (20 bars animées), mockups dashboard /
//   terminal / QR / phone (HTML/CSS pur), count-up stats,
//   reveals framer-motion (blur->clear), glows, hover lifts.
// Logo FeedbackPro : <img src="/logo-feedbackpro.png"> dans le
//   header, le footer, le CTA final et la page À propos.
// Tous les CTAs principaux routent vers onSignup (Essayer
//   gratuitement) ou onLogin (Se connecter) ; les CTAs internes
//   naviguent entre pages via navigate().
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
  Phone,
  Mail,
  Trophy,
  Gauge,
  Fingerprint,
  Headset,
  Quote,
} from "lucide-react"

type LandingPage = "accueil" | "restaurant" | "aeroport" | "apropos" | "contact"
type Navigate = (p: LandingPage) => void

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
  inverted = false,
}: {
  className?: string
  inverted?: boolean
}) {
  // On utilise le logo transparent normal (bleu) sur tous les fonds.
  // Le filtre brightness(0) invert(1) causait des problèmes d'affichage
  // (logo blanc invisible sur certains fonds, rendu masqué par zone blanche).
  // Le bleu FeedbackPro #5257C9 est visible sur fond clair ET sombre.
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
// HEADER (sticky glass, shared)
// ----------------------------------------------------------------------------
const NAV_ITEMS: { key: LandingPage; label: string }[] = [
  { key: "accueil", label: "Accueil" },
  { key: "restaurant", label: "Restaurant" },
  { key: "aeroport", label: "Aéroport" },
  { key: "apropos", label: "À propos" },
  { key: "contact", label: "Contact" },
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
          {NAV_ITEMS.map((item) => {
            const active = page === item.key
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-[#5257C9]"
                    : "text-[#0F172A]/70 hover:text-[#0F172A]"
                }`}
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5257C9] to-[#7C3AED]"
                  />
                )}
              </button>
            )
          })}
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
          className="w-[80vw] max-w-sm border-l border-black/5 bg-white p-0"
        >
          <SheetTitle className="sr-only">Menu de navigation FeedbackPro</SheetTitle>
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center border-b border-black/5 px-4">
              <Logo className="h-7 w-auto" />
            </div>
            <nav className="flex flex-col gap-1 p-4" aria-label="Navigation mobile">
              {NAV_ITEMS.map((item) => {
                const active = page === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => navigate(item.key)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                      active
                        ? "bg-[#5257C9]/8 text-[#5257C9]"
                        : "text-[#0F172A]/80 hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {item.label}
                    <ChevronRight className="h-4 w-4 opacity-40" />
                  </button>
                )
              })}
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

// ----------------------------------------------------------------------------
// Mockups CSS
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

function PhoneMockup() {
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
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#5257C9]">
              Alerte entrante
            </div>
            <div className="text-base font-bold text-[#0F172A]">Service en salle</div>
          </div>
          {/* notifications */}
          <div className="space-y-2 px-3">
            <NotifCard
              delay="0s"
              tag="Critique"
              title="Erreur plat"
              sub="Table 14 · Plat froid servi"
              color="bg-red-500"
            />
            <NotifCard
              delay="1.4s"
              tag="Important"
              title="Service lent"
              sub="Table 7 · 25 min d'attente"
              color="bg-amber-500"
            />
            <NotifCard
              delay="2.8s"
              tag="Positif"
              title="Ambiance top"
              sub="Table 3 · Coup de cœur client"
              color="bg-emerald-500"
            />
            <NotifCard
              delay="4.2s"
              tag="Info"
              title="Demande addition"
              sub="Table 9 · Client pressé"
              color="bg-[#5257C9]"
            />
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
// PAGE 1 : ACCUEIL
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
      {/* 1B. HERO */}
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
                <Check className="h-3 w-3 text-[#5257C9]" /> Pas de carte bancaire
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-[#5257C9]" /> Setup en 5 minutes
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" /> 4.9/5
              </span>
            </div>
          </Reveal>

          {/* Dashboard mockup */}
          <Reveal delay={0.4} className="mt-14 w-full max-w-screen-xl">
            <DashboardMockup />
          </Reveal>
        </div>
      </section>

      {/* 1C. LE PROBLEME INVISIBLE */}
      <section className="border-y border-black/5 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Le problème
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl lg:text-5xl">
                Vos clients vivent une expérience. Vous, vous devinez.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Tant que le feedback arrive après le départ du client, il est
                trop tard. Les enquêtes post-visite sont ignorées. Les avis en
                ligne sont publics et destructeurs. FeedbackPro capte le signal
                au moment exact où il peut encore servir.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                stat: <CountUp to={40} suffix="%" />,
                label: "d'incidents non traités restent invisibles",
                icon: Eye,
              },
              {
                stat: <span className="text-[#5257C9]">÷2</span>,
                label: "temps de résolution divisé par 2 avec alertes temps réel",
                icon: Zap,
              },
              {
                stat: <CountUp to={12} suffix="x" />,
                label: "expériences positives pour effacer 1 mauvaise",
                icon: Trophy,
              },
            ].map((s, i) => (
              <Reveal key={i} delay={0.1 * i}>
                <div className="group h-full rounded-2xl border border-black/5 bg-[#F8FAFC] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#5257C9]/20 hover:shadow-xl hover:shadow-[#5257C9]/10">
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

      {/* 1D. LA TECHNOLOGIE DENISE - DARK */}
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

      {/* 1E. SECTOR SELECTOR */}
      <section className="bg-[#F8FAFC] py-24 sm:py-32">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Deux mondes
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl lg:text-5xl">
                Deux mondes. Une seule plateforme.
              </h2>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {/* Restaurant card */}
            <Reveal delay={0.1}>
              <button
                onClick={() => navigate("restaurant")}
                className="group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-[#FFF7ED] via-[#FFEDD5] to-[#FDBA74]/30 p-8 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#F59E0B]/20"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#F59E0B]/30 blur-3xl transition-transform duration-700 group-hover:scale-150"
                  aria-hidden
                />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#FB923C] text-white shadow-lg shadow-[#F59E0B]/30">
                  <Utensils className="h-6 w-6" />
                </div>
                <h3 className="relative mt-6 text-2xl font-bold text-[#0F172A]">
                  Hôtellerie &amp; Restauration
                </h3>
                <p className="relative mt-3 text-sm text-[#0F172A]/70">
                  Salle, cuisine, accueil. Chaque retour client devient une
                  action immédiate, avant même qu&apos;il ait quitté la table.
                </p>
                <div className="relative mt-6 flex items-center gap-2 text-sm font-semibold text-[#5257C9]">
                  Découvrir
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            </Reveal>

            {/* Aeroport card */}
            <Reveal delay={0.18}>
              <button
                onClick={() => navigate("aeroport")}
                className="group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0F172A] via-[#1E2A4A] to-[#5257C9]/20 p-8 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#5257C9]/30"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#06B6D4]/30 blur-3xl transition-transform duration-700 group-hover:scale-150"
                  aria-hidden
                />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5257C9] to-[#06B6D4] text-white shadow-lg shadow-[#5257C9]/30">
                  <Plane className="h-6 w-6" />
                </div>
                <h3 className="relative mt-6 text-2xl font-bold text-white">
                  Transport &amp; Aéroports
                </h3>
                <p className="relative mt-3 text-sm text-white/70">
                  Terminal, portes, tarmac. Maîtrisez chaque mètre carré avec
                  Denise, votre centre de commandement vocal.
                </p>
                <div className="relative mt-6 flex items-center gap-2 text-sm font-semibold text-[#06B6D4]">
                  Découvrir
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden">
        <div className="relative bg-gradient-to-br from-[#5257C9] via-[#7C3AED] to-[#06B6D4] py-24 sm:py-32">
          <Aurora dark />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6">
            <Reveal>
              <div className="rounded-xl bg-white px-4 py-2 shadow-lg">
                <Logo className="h-8 w-auto" />
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Prêt à transformer vos interactions en données actionnables ?
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 max-w-2xl text-base text-white/80 sm:text-lg">
                Rejoignez les établissements qui ont fait du temps réel leur
                standard. Sans carte bancaire, sans installation complexe.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8">
                <CtaSignup onSignup={onSignup} variant="white">
                  Essayer gratuitement
                </CtaSignup>
              </div>
            </Reveal>
            <Reveal delay={0.32}>
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
    </>
  )
}

// ----------------------------------------------------------------------------
// PAGE 2 : RESTAURANT
// ----------------------------------------------------------------------------

function RestaurantPage({ onSignup }: { onSignup: () => void }) {
  return (
    <>
      {/* HERO */}
      <section className="relative flex min-h-[60vh] items-center overflow-hidden bg-[#F8FAFC]">
        <Aurora />
        <div className="fbp-grid-mask fbp-grid-light pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto w-full max-w-screen-2xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#F59E0B]/20 bg-white/70 px-4 py-1.5 text-xs font-medium text-[#F59E0B] backdrop-blur">
                <Utensils className="h-3 w-3" /> Restauration
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-5 text-4xl font-bold tracking-tighter leading-[0.95] text-[#0F172A] sm:text-5xl lg:text-6xl">
                Ne laissez plus un mauvais avis{" "}
                <span className="bg-gradient-to-r from-[#F59E0B] to-[#5257C9] bg-clip-text text-transparent">
                  gâcher votre service.
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                Le QR code invisible. L&apos;IA qui trie. Le staff qui réagit.
                Avant que le client ne parte.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <CtaSignup onSignup={onSignup}>Essayer gratuitement</CtaSignup>
                <button className="flex h-12 items-center justify-center gap-2 rounded-full border border-black/10 bg-white/60 px-6 text-sm font-semibold text-[#0F172A] backdrop-blur transition-all hover:bg-white">
                  Voir la démo
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* AVANTAGE 1 - QR INVISIBLE */}
      <section className="bg-white py-24 sm:py-28">
        <div className="mx-auto grid max-w-screen-2xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Avantage 1
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Un QR design. Pas de tablette encombrante.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Posé sur la nappe, imprimé sur l&apos;addition ou le menu. Le
                client scanne en 2 secondes. Pas d&apos;app à télécharger, pas
                de compte à créer.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <ul className="mt-6 space-y-3">
                {[
                  "Posez-le où vous voulez : nappe, menu, addition, table",
                  "Aucune app à installer pour le client",
                  "Compatible avec votre identité visuelle",
                  "Mise à jour des questions en temps réel",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#0F172A]/80">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#5257C9]" />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* QR mockup */}
          <Reveal delay={0.2}>
            <div className="fbp-float relative mx-auto w-full max-w-sm">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FFF7ED] via-[#FFEDD5] to-[#FED7AA] p-8 shadow-2xl shadow-[#F59E0B]/15">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#F59E0B]/20 blur-2xl" />
                <div className="relative rounded-2xl bg-white p-6 shadow-lg">
                  <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Votre avis compte
                  </div>
                  <div className="mx-auto w-44 overflow-hidden rounded-lg border border-black/5">
                    <FakeQR size={21} />
                  </div>
                  <div className="mt-3 text-center text-[10px] font-semibold text-[#5257C9]">
                    Scannez en 2 secondes
                  </div>
                </div>
                <div className="relative mt-4 flex items-center justify-center gap-2 text-[10px] text-[#0F172A]/50">
                  <Fingerprint className="h-3 w-3" /> feedbackpro.io/r/abc12
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* AVANTAGE 2 - TAGS */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Avantage 2
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                L&apos;IA trie automatiquement vos feedbacks.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Chaque retour est catégorisé instantanément. Vous voyez les
                patterns, pas juste des commentaires.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              {[
                { label: "Service lent", icon: Clock, color: "from-amber-500 to-orange-500" },
                { label: "Plat froid", icon: Timer, color: "from-cyan-500 to-blue-500" },
                { label: "Personnel distrait", icon: Users, color: "from-rose-500 to-pink-500" },
                { label: "Ambiance top", icon: Sparkles, color: "from-emerald-500 to-teal-500" },
                { label: "Erreur de commande", icon: AlertCircle, color: "from-red-500 to-rose-500" },
                { label: "Temps d'attente", icon: HourglassIcon, color: "from-violet-500 to-purple-500" },
                { label: "Qualité produit", icon: Trophy, color: "from-amber-500 to-yellow-500" },
                { label: "Propreté", icon: CheckCircle2, color: "from-teal-500 to-emerald-500" },
              ].map((t, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-2 text-sm font-medium text-[#0F172A] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
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

          <Reveal delay={0.28}>
            <div className="mt-12 mx-auto max-w-2xl rounded-2xl border border-[#5257C9]/10 bg-white p-6 shadow-lg shadow-[#5257C9]/5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#5257C9]">
                <Activity className="h-3 w-3" /> Vue patterns · 30 derniers jours
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: "Service lent", v: "32%", c: "bg-amber-500" },
                  { l: "Plat froid", v: "18%", c: "bg-cyan-500" },
                  { l: "Ambiance top", v: "47%", c: "bg-emerald-500" },
                  { l: "Erreur commande", v: "9%", c: "bg-red-500" },
                ].map((p, i) => (
                  <div key={i} className="rounded-xl bg-[#F8FAFC] p-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${p.c}`} />
                      <span className="text-[10px] text-muted-foreground">{p.l}</span>
                    </div>
                    <div className="mt-1 text-xl font-bold text-[#0F172A]">{p.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* AVANTAGE 3 - REACTION IMMEDIATE */}
      <section className="bg-white py-24 sm:py-28">
        <div className="mx-auto grid max-w-screen-2xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          {/* Mockup phone */}
          <Reveal delay={0.2} className="order-2 lg:order-1">
            <PhoneMockup />
          </Reveal>

          <div className="order-1 lg:order-2">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Avantage 3
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Le client signale. Le serveur agit. Avant qu&apos;il ne parte.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Le QR Staff envoie une alerte instantanée à la personne la plus
                proche. Le client n&apos;attend plus. Il devient ambassadeur.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-6 space-y-3">
                {[
                  { n: "1", t: "Client signale", d: "« Erreur plat · Table 14 » via QR", icon: AlertCircle, color: "bg-red-500" },
                  { n: "2", t: "Serveur reçoit l'alerte", d: "Sur sa montre ou son téléphone, en moins de 2s", icon: Phone, color: "bg-[#5257C9]" },
                  { n: "3", t: "Intervention immédiate", d: "Le serveur intervient pendant que le client est encore à table", icon: Zap, color: "bg-amber-500" },
                  { n: "4", t: "Client transformé", d: "Un mécontent devient un ambassadeur", icon: Trophy, color: "bg-emerald-500" },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 rounded-xl border border-black/5 bg-[#F8FAFC] p-4"
                  >
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7C3AED] text-xs font-bold text-white">
                      {s.n}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <s.icon className={`h-3.5 w-3.5 ${s.color === "bg-red-500" ? "text-red-500" : s.color === "bg-[#5257C9]" ? "text-[#5257C9]" : s.color === "bg-amber-500" ? "text-amber-500" : "text-emerald-500"}`} />
                        <div className="text-sm font-semibold text-[#0F172A]">{s.t}</div>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* TEMOIGNAGE */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-white p-8 shadow-xl sm:p-12">
              <Quote className="absolute -right-4 -top-4 h-24 w-24 text-[#5257C9]/5" />
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
                  « Le stress en salle a chuté. On sait exactement où intervenir,
                  sans attendre que le client se plaigne à la caisse. »
                </blockquote>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#5257C9] to-[#7C3AED] text-sm font-bold text-white">
                    ML
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#0F172A]">
                      Marc Lefèvre
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Chef de salle · Restaurant gastronomique
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

// Lucide n'expose pas Hourglass -> alias local
function HourglassIcon(props: { className?: string }) {
  return <Timer {...props} />
}

// ----------------------------------------------------------------------------
// PAGE 3 : AEROPORT
// ----------------------------------------------------------------------------

function AeroportPage({ onSignup }: { onSignup: () => void }) {
  return (
    <>
      {/* HERO - DARK */}
      <section className="relative flex min-h-[60vh] items-center overflow-hidden bg-[#0F172A] text-white">
        <Aurora dark />
        <div className="fbp-grid-mask fbp-grid-dark pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto w-full max-w-screen-2xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#06B6D4]/30 bg-white/5 px-4 py-1.5 text-xs font-medium text-[#06B6D4] backdrop-blur">
                <Plane className="h-3 w-3" /> Aéroport
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-5 text-4xl font-bold tracking-tighter leading-[0.95] sm:text-5xl lg:text-6xl">
                <span className="bg-gradient-to-r from-[#5257C9] via-[#7C3AED] to-[#06B6D4] bg-clip-text text-transparent">
                  Maîtrisez chaque mètre carré
                </span>
                <br />
                de votre terminal.
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 max-w-2xl text-base text-white/70 sm:text-lg">
                Géolocalisation précise. Denise au centre de commandement.
                Traçabilité totale. Le signalement devient une action, pas un
                ticket.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <CtaSignup onSignup={onSignup} variant="tech">
                  Essayer gratuitement
                </CtaSignup>
                <button className="flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/10">
                  Voir la démo
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* AVANTAGE 1 - GEOLOCALISATION */}
      <section className="bg-[#0F172A] py-24 text-white sm:py-28">
        <div className="mx-auto grid max-w-screen-2xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#06B6D4]">
                Avantage 1 · Géolocalisation
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Incident Porte B12, Terminal 2.{" "}
                <span className="text-white/50">Fini les signalements vagues.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-white/70 sm:text-lg">
                Chaque QR code est géolocalisé. Vous savez exactement où
                intervenir. Plus besoin de rappeler le client pour comprendre
                où se trouve le problème.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <ul className="mt-6 space-y-3">
                {[
                  "Précision au mètre près via QR géolocalisés",
                  "Cartographie live du terminal",
                  "Historique des incidents par zone",
                  "Heat-maps de densité d'incidents",
                ].map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-white/80"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#06B6D4]" />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <TerminalMapMockup />
          </Reveal>
        </div>
      </section>

      {/* AVANTAGE 2 - DENISE CENTRE DE COMMANDEMENT */}
      <section className="relative overflow-hidden border-y border-white/10 bg-[#0F172A] py-24 text-white sm:py-32">
        <div
          className="pointer-events-none absolute top-0 left-1/2 h-[40rem] w-[60rem] -translate-x-1/2 rounded-full bg-[#7C3AED]/15 blur-[140px]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-screen-2xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div className="flex flex-col justify-center">
            <Reveal>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#06B6D4]">
                <Mic className="h-3 w-3" /> Avantage 2 · Denise
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className="bg-gradient-to-r from-[#5257C9] via-[#7C3AED] to-[#06B6D4] bg-clip-text text-transparent">
                  Denise annonce les incidents.
                </span>
                <br />
                Vos mains restent libres.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 max-w-xl text-base text-white/70 sm:text-lg">
                Dans un aéroport, les équipes de nettoyage et de sécurité ont les
                mains occupées. Denise annonce vocalement chaque incident
                critique, avec la zone, le type et la priorité.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 backdrop-blur">
                  <Volume2 className="h-4 w-4 text-[#06B6D4]" /> Annonce vocale
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 backdrop-blur">
                  <Activity className="h-4 w-4 text-[#7C3AED]" /> Vibration couplée
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 backdrop-blur">
                  <Gauge className="h-4 w-4 text-[#06B6D4]" /> Priorité auto
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.32}>
              <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-5 backdrop-blur-xl">
                <Quote className="h-5 w-5 text-[#06B6D4]/40" />
                <p className="mt-2 text-lg font-medium italic text-white/90">
                  « Nouvel incident sanitaire Zone Fumeurs. Priorité Haute. »
                </p>
                <div className="mt-3 text-xs font-semibold uppercase tracking-widest text-[#06B6D4]">
                  — Denise
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <DeniseLiveCard dark />
          </Reveal>
        </div>
      </section>

      {/* AVANTAGE 3 - CENTRALISATION (light) */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#5257C9]">
                Avantage 3 · Centralisation
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Tableau de bord centralisé. Traçabilité totale.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Qui a scanné, quand, combien de temps pour résoudre. Tout est
                tracé. Tout est auditable.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <div className="mt-12">
              <CentralDashboardMockup />
            </div>
          </Reveal>

          <Reveal delay={0.28}>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Fingerprint, t: "Traçabilité complète", d: "Chaque scan, chaque intervention, chaque résolution est horodatée et attribuée." },
                { icon: Trophy, t: "Score équipe", d: "Mesurez la performance de chaque équipe en temps réel, par zone et par type." },
                { icon: Gauge, t: "SLA temps réel", d: "Suivez vos temps de résolution et recevez des alertes quand le SLA est dépassé." },
              ].map((p, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-black/5 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5257C9]/10 to-[#7C3AED]/10 text-[#5257C9]">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-[#0F172A]">
                    {p.t}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{p.d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CAS D'USAGE SECURITE */}
      <section className="bg-white py-24 sm:py-28">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-500">
                <ShieldAlert className="h-3 w-3" /> Cas d&apos;usage · Sécurité
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl">
                Signalement rapide. Objet suspect, zone glissante, intrusion.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base text-muted-foreground sm:text-lg">
                Les agents de sécurité signalent en 3 secondes via QR Staff.
                Denise alerte immédiatement l&apos;équipe concernée.
              </p>
            </Reveal>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ShieldAlert,
                t: "Objet suspect",
                d: "Bagage abandonné détecté. Signalement en 3s. Zone sécurisée. Équipe d'intervention alertée vocalement par Denise.",
                color: "from-red-500 to-rose-500",
                tag: "Critique",
              },
              {
                icon: AlertCircle,
                t: "Zone glissante",
                d: "Sol mouillé signalé par un agent. Denise annonce la zone, priorité et équipe nettoyage. Barrière physique déployée automatiquement.",
                color: "from-amber-500 to-orange-500",
                tag: "Important",
              },
              {
                icon: Eye,
                t: "Intrusion",
                d: "Personne en zone restreinte détectée. Denise alerte la sécurité, indique la position et déclenche le protocole d'intervention.",
                color: "from-[#5257C9] to-[#7C3AED]",
                tag: "Critique",
              },
            ].map((s, i) => (
              <Reveal key={i} delay={0.1 * i}>
                <div className="group h-full rounded-2xl border border-black/5 bg-[#F8FAFC] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${s.color} text-white shadow-lg`}
                    >
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-500">
                      {s.tag}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[#0F172A]">
                    {s.t}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#5257C9]">
                    <Clock className="h-3 w-3" /> Signalé en 3 secondes
                  </div>
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
// PAGE 4 : A PROPOS
// ----------------------------------------------------------------------------

function AproposPage() {
  return (
    <>
      {/* HERO */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <Logo className="mx-auto h-10 w-auto" />
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
                Dans un aéroport ou une cuisine, les mains sont occupées et les
                yeux ailleurs. La voix est le seul canal qui ne dérange pas.
                Denise est née de cette observation simple : il faut alerter
                sans regarder, guider sans interrompre.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                Aujourd&apos;hui, Denise veille sur des restaurants et des
                aéroports. Elle ne remplace pas les équipes. Elle les rend plus
                rapides, plus justes, plus humaines.
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

      {/* EQUIPE */}
      <section className="bg-[#F8FAFC] py-24 sm:py-28">
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
                role: "Head of Ops Aéroports",
                bio: "Ex-responsable opérations dans un grand aéroport européen. Connaît chaque mètre carré d'un terminal. Et chaque douleur qui va avec.",
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
      <section className="bg-white py-24 sm:py-28">
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
// PAGE 5 : CONTACT
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
                      <SelectItem value="autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Volume estimé">
                  <Input
                    placeholder="Nombre de couverts / passagers par jour"
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
// FOOTER (shared)
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

          {/* Produit */}
          <FooterCol
            title="Produit"
            links={[
              { label: "Restaurant", onClick: () => navigate("restaurant") },
              { label: "Aéroport", onClick: () => navigate("aeroport") },
              { label: "Denise", onClick: () => navigate("aeroport") },
              { label: "Tarifs", onClick: () => navigate("contact") },
            ]}
          />

          {/* Société */}
          <FooterCol
            title="Société"
            links={[
              { label: "À propos", onClick: () => navigate("apropos") },
              { label: "Équipe", onClick: () => navigate("apropos") },
              { label: "Contact", onClick: () => navigate("contact") },
              { label: "Blog", onClick: () => navigate("apropos") },
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

const VALID_PAGES: LandingPage[] = ["accueil", "restaurant", "aeroport", "apropos", "contact"]

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
        {page === "restaurant" && <RestaurantPage onSignup={onSignup} />}
        {page === "aeroport" && <AeroportPage onSignup={onSignup} />}
        {page === "apropos" && <AproposPage />}
        {page === "contact" && <ContactPage />}
      </motion.main>

      <Footer navigate={navigate} />
    </div>
  )
}
