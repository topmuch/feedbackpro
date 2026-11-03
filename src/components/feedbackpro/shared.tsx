"use client"

// ============================================================
// FeedbackPro - Composants partagés du dashboard
// Étoiles, carte KPI, en-tête applicatif, pied de page
// ============================================================

import { Star, LogOut, QrCode, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useAppStore } from "@/store/app-store"
import { PLANS, PlanId } from "@/lib/constants"

// ---------- Affichage des étoiles (lecture seule) ----------

export function Stars({ note, size = 16, className = "" }: { note: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Note ${note} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(note) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}
          aria-hidden
        />
      ))}
    </span>
  )
}

// ---------- Carte KPI ----------

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  hintTone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  hintTone?: "up" | "down" | "neutral"
}) {
  const HintIcon = hintTone === "up" ? TrendingUp : hintTone === "down" ? TrendingDown : Minus
  const toneClass =
    hintTone === "up" ? "text-green-600" : hintTone === "down" ? "text-rose-600" : "text-muted-foreground"
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{label}</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{value}</p>
            {hint && (
              <p className={`flex items-center gap-1 text-xs mt-1.5 ${toneClass}`}>
                <HintIcon size={13} aria-hidden /> {hint}
              </p>
            )}
          </div>
          <div className="shrink-0 rounded-xl bg-primary/10 p-2.5" aria-hidden>
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- En-tête applicatif (dashboard Pro / Superadmin) ----------

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)

  const plan = session?.pro?.plan as PlanId | undefined
  const planName = plan && PLANS[plan] ? PLANS[plan].name : null

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-11 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">FeedbackPro</p>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {planName && (
            <Badge variant="secondary" className="hidden sm:inline-flex shrink-0">
              {planName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:block text-sm text-muted-foreground truncate max-w-48">
            {session?.user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={() => logout()} aria-label="Se déconnecter">
            <LogOut className="h-4 w-4 sm:mr-1.5" aria-hidden />
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

// ---------- Pied de page global (collé en bas via mt-auto dans le shell) ----------

export function AppFooter() {
  // Liens légaux : vraies routes App Router (S6 §4) — accessibles sans session
  const liens = [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "CGU", href: "/cgu" },
    { label: "Confidentialité", href: "/confidentialite" },
    { label: "Cookies", href: "/cookies" },
  ]
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <p className="flex items-center gap-1.5">
          <img src="/logo-feedbackpro.png" alt="FeedbackPro" className="h-6 w-auto" />
          © 2026 — Tous droits réservés.
        </p>
        <nav aria-label="Liens légaux" className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {liens.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-primary"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}

// ---------- Petits utilitaires ----------

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function formatRelative(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days} j`
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}
