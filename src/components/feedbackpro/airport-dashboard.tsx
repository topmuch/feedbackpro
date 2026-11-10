'use client'

// ============================================================
// <AirportDashboard /> — Shell du dashboard ops aéroport
// ------------------------------------------------------------
// Layout fixe :
//   ┌──────────────────────────────────────────────────────────┐
//   │ HEADER sticky (slate-900) — logo + clock + liens         │
//   ├──────────────────────────────────────────────────────────┤
//   │ TAB BAR (slate-800) — Wallboard | Zones | Signalements   │
//   │                        | Bot WhatsApp                    │
//   ├──────────────────────────────────────────────────────────┤
//   │ TAB CONTENT (slate-950) — render switch on active tab    │
//   └──────────────────────────────────────────────────────────┘
//
// L'onglet actif est piloté par l'URL ?tab=<slug> (lue au mount,
// mise à jour via history.pushState au clic). L'onglet par défaut
// est "wallboard". Les slugs valides : wallboard | zones |
// signalements | bot. Tout slug inconnu → wallboard.
//
// Aucun Provider supplémentaire (le Toaster global est déjà dans
// src/app/layout.tsx).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plane, ExternalLink, Home, Monitor, LogOut, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import AirportZonesTab from '@/components/feedbackpro/airport-zones-tab'
import AirportReportsTab from '@/components/feedbackpro/airport-reports-tab'
import AirportBotTab from '@/components/feedbackpro/airport-bot-tab'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type TabSlug = 'wallboard' | 'zones' | 'signalements' | 'bot'

type TabDef = {
  slug: TabSlug
  label: string
  emoji: string
}

const TABS: readonly TabDef[] = [
  { slug: 'wallboard', label: 'Wallboard', emoji: '📺' },
  { slug: 'zones', label: 'Zones', emoji: '🛠️' },
  { slug: 'signalements', label: 'Signalements', emoji: '📋' },
  { slug: 'bot', label: 'Bot WhatsApp', emoji: '🤖' },
] as const

const VALID_TABS: ReadonlySet<string> = new Set(TABS.map((t) => t.slug))

function parseTab(value: string | null): TabSlug {
  if (value && VALID_TABS.has(value)) return value as TabSlug
  return 'wallboard'
}

// ---------------------------------------------------------------
// Horloge live HH:MM:SS
// ---------------------------------------------------------------

function useClock(): string {
  // On part d'une string vide côté serveur pour éviter l'hydration mismatch
  // (le serveur et le client ne sont pas à la même seconde). L'horloge
  // s'affiche dès le premier useEffect côté client.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    // Différé (setTimeout 0) pour respecter la règle set-state-in-effect
    const initial = setTimeout(() => setNow(new Date()), 0)
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [])
  if (!now) return "--:--:--"
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export default function AirportDashboard() {
  const [tab, setTab] = useState<TabSlug>('wallboard')
  const clock = useClock()
  // Date initialisée côté client uniquement pour éviter l'hydration mismatch
  const [today, setToday] = useState<Date | null>(null)
  // Pattern "mounted" : on ne rend rien côté serveur pour éviter tout
  // hydration mismatch (horloge live, date, etc.). Le dashboard est
  // affiché dès le premier useEffect côté client.
  const [mounted, setMounted] = useState(false)
  // Session : nom de l'aéroport + déconnexion (si le dashboard est
  // accédé depuis un compte Pro connecté, on affiche son nom et un
  // bouton de déconnexion).
  const session = useAppStore((s) => s.session)
  const logout = useAppStore((s) => s.logout)
  const setView = useAppStore((s) => s.setView)
  const airportName = session?.pro?.nomEtablissement ?? null
  useEffect(() => {
    // Différé (setTimeout 0) pour respecter la règle set-state-in-effect
    const t = setTimeout(() => {
      setMounted(true)
      setToday(new Date())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // Lecture initiale du ?tab= dans l'URL (une seule fois au mount)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    // Différé (setTimeout 0) pour ne pas appeler setState directement
    // dans le corps de l'effect (rule react-hooks/set-state-in-effect).
    const initial = setTimeout(() => setTab(parseTab(url.searchParams.get('tab'))), 0)
    return () => clearTimeout(initial)
  }, [])

  // Mise à jour de l'URL via history.pushState (pas de reflow)
  const switchTab = useCallback((next: TabSlug) => {
    setTab(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (next === 'wallboard') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', next)
    }
    window.history.pushState({}, '', url.toString())
  }, [])

  // Écoute popstate (bouton précédent du navigateur)
  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href)
      setTab(parseTab(url.searchParams.get('tab')))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // SSR-safe : on ne rend le dashboard qu'une fois monté côté client
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <span className="text-4xl">✈️</span>
          <p className="mt-3 font-mono text-sm text-slate-500">Chargement du dashboard ops…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100">
      {/* ---------- HEADER ---------- */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            ✈️
          </span>
          <div className="flex flex-col">
            <h1 className="font-mono text-base font-bold leading-tight tracking-tight text-slate-100 sm:text-lg">
              AÉROPORT OPS <span className="text-slate-500">—</span>{' '}
              <span className="text-emerald-400">DASHBOARD</span>
            </h1>
            <p className="hidden text-[11px] text-slate-400 sm:block" suppressHydrationWarning>
              {airportName ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-emerald-400" />
                  {airportName}
                  <span className="text-slate-600">·</span>
                  {today ? formatDateLong(today) : ""}
                </span>
              ) : (
                <>Dashboard opérationnel · {today ? formatDateLong(today) : ""}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Horloge live */}
          <div className="hidden flex-col items-end sm:flex">
            <div className="font-mono text-xl font-bold tabular-nums text-emerald-400" suppressHydrationWarning>
              {clock}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Heure locale
            </div>
          </div>

          {/* Lien wallboard plein écran */}
          <Link
            href="/ops-wallboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:bg-slate-800 hover:text-emerald-300"
            title="Ouvrir le wallboard plein écran"
          >
            <Monitor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Wallboard</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>

          {/* Déconnexion (si session active) */}
          {session && (
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-rose-500/40 hover:bg-slate-800 hover:text-rose-300"
              title="Se déconnecter"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          )}

          {/* Lien retour accueil (si pas de session — mode public) */}
          {!session && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
              title="Retour à l'accueil FeedbackPro"
            >
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Accueil</span>
            </Link>
          )}
        </div>
      </header>

      {/* ---------- TAB BAR ---------- */}
      <nav
        className="sticky top-16 z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-800 px-2 sm:px-4"
        aria-label="Onglets du dashboard ops"
      >
        {TABS.map((t) => {
          const active = tab === t.slug
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => switchTab(t.slug)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition sm:px-4',
                active
                  ? 'bg-slate-950 text-emerald-400'
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white',
              )}
            >
              <span className="text-base leading-none" aria-hidden>
                {t.emoji}
              </span>
              <span>{t.label}</span>
              {active && (
                <span
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-emerald-400"
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* ---------- TAB CONTENT ---------- */}
      <main className="min-h-0 flex-1 bg-slate-950">
        {tab === 'wallboard' && <WallboardTab />}
        {tab === 'zones' && <AirportZonesTab />}
        {tab === 'signalements' && <AirportReportsTab />}
        {tab === 'bot' && <AirportBotTab />}
      </main>

      {/* ---------- FOOTER ---------- */}
      <footer className="mt-auto shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <Plane className="h-3 w-3" aria-hidden />
            <span>
              FeedbackPro · Module Aéroport — Dashboard opérationnel
            </span>
          </div>
          <div className="hidden tabular-nums sm:block">
            Onglet actif : <span className="text-emerald-400">{tab}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------
// Wallboard tab — iframe plein écran
// ---------------------------------------------------------------

function WallboardTab() {
  return (
    <div className="relative h-[calc(100vh-128px)] w-full">
      <iframe
        src="/ops-wallboard"
        title="Wallboard Ops Aéroport"
        className="h-full w-full border-0"
        loading="eager"
      />
    </div>
  )
}
