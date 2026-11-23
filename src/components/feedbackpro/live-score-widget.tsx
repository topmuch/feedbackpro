"use client"

// ============================================================
// WAHOO-2 — LiveScoreWidget
// ------------------------------------------------------------
// Widget "Live Score" public (hall d'aéroport / bureau direction).
// Affiche en temps réel le score de satisfaction agrégé sur 24h,
// avec un gros chiffre animé qui passe du vert (#bc7155) à
// l'orange (#bc7155) puis au rouge (#E30613) selon le niveau.
//
// Sources :
//   GET /api/airport/live-score  (polling toutes les 10s)
//
// Props :
//   - className?: string  — classes additionnelles (layout parent)
//   - compact?: boolean   — variante compacte (~60px) pour le wallboard
//
// Animations :
//   - Le chiffre compte de l'ancienne vers la nouvelle valeur sur 800ms
//     (requestAnimationFrame + easing easeOutCubic)
//   - La couleur de fond transite en 700ms (CSS transition)
//   - Badge "LIVE" + point pulsant (framer-motion)
//   - Bordure d'alerte pulsante si criticalUnresolved > 0
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Loader2, Radio } from "lucide-react"

// ---------- Types (mirroir API) ----------
type LiveScoreStats = {
  total24h: number
  resolved: number
  pending: number
  ongoing: number
  criticalUnresolved: number
}

type LiveScoreLevel = "green" | "orange" | "red"

type LiveScoreData = {
  score: number
  level: LiveScoreLevel
  color: string
  label: string
  stats: LiveScoreStats
  generatedAt: string
}

// ---------- Easing + animation du compteur ----------
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Hook : anime un nombre de `from` vers `to` sur `duration` ms.
 * Retourne la valeur courante (arrondie). Annule l'animation
 * précédente si la valeur cible change en cours de route.
 */
function useAnimatedNumber(target: number, duration = 800): number {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // Pas d'animation si la valeur ne change pas.
    if (target === display) return
    fromRef.current = display
    startRef.current = null

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = easeOutCubic(t)
      const val = fromRef.current + (target - fromRef.current) * eased
      setDisplay(Math.round(val))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // `display` est intentionnellement absent des dépendances : on ne veut
    // pas relancer l'animation à chaque tick d'affichage (déjà piloté par le
    // rAF), seulement quand la valeur cible change.
  }, [target, duration])

  return display
}

// ============================================================
// Composant
// ============================================================

export function LiveScoreWidget({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const [data, setData] = useState<LiveScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastPulse, setLastPulse] = useState<number>(Date.now())

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airport/live-score", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.ok) {
        setData(json.data as LiveScoreData)
        setError(null)
        setLastPulse(Date.now())
      } else {
        setError(json.error ?? "Réponse invalide")
      }
    } catch {
      setError("Impossible de joindre le serveur")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  // ---------- États spéciaux ----------
  if (loading && !data) {
    return <LiveScoreSkeleton compact={compact} className={className} />
  }
  if (error && !data) {
    return (
      <LiveScoreError compact={compact} className={className} message={error} onRetry={load} />
    )
  }
  if (!data) {
    return <LiveScoreSkeleton compact={compact} className={className} />
  }

  return (
    <LiveScoreCard
      data={data}
      compact={compact}
      className={className}
      lastPulse={lastPulse}
    />
  )
}

// ============================================================
// Carte principale (rendu du score)
// ============================================================

function LiveScoreCard({
  data,
  compact,
  className,
  lastPulse,
}: {
  data: LiveScoreData
  compact: boolean
  className?: string
  lastPulse: number
}) {
  const animatedScore = useAnimatedNumber(data.score, 800)
  const hasCritical = data.stats.criticalUnresolved > 0

  const numberSize = compact ? 60 : 120
  const padY = compact ? "py-4 px-5" : "py-8 px-8"

  return (
    <div
      className={`relative overflow-hidden rounded-none text-white ${padY} ${className ?? ""}`}
      style={{
        backgroundColor: data.color,
        boxShadow: "0 12px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
        transition: "background-color 700ms ease",
      }}
      role="status"
      aria-live="polite"
      aria-label={`Score de satisfaction ${data.score} pour cent, ${data.label}`}
    >
      {/* Décor : halo subtil en fond */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full"
        style={{ background: "rgba(255,255,255,0.10)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-8 size-32 rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />

      {/* Bordure d'alerte pulsante si incident critique non résolu */}
      {hasCritical && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-none"
          style={{ boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.85)" }}
          animate={{ opacity: [0.25, 0.9, 0.25] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative flex items-center justify-between gap-4">
        {/* Bloc gauche : score + label */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Gros chiffre animé */}
          <div className="flex items-baseline">
            <span
              className="font-black tabular-nums leading-none tracking-tight"
              style={{ fontSize: `${numberSize}px`, lineHeight: 1 }}
              suppressHydrationWarning
            >
              {animatedScore}
            </span>
            <span
              className="ml-1 font-black opacity-90"
              style={{ fontSize: compact ? 20 : 40, lineHeight: 1 }}
              aria-hidden
            >
              %
            </span>
          </div>

          <div className="min-w-0">
            <p
              className="font-bold uppercase leading-tight tracking-wide"
              style={{ fontSize: compact ? 13 : 18, letterSpacing: "1.5px" }}
            >
              Score de Satisfaction
            </p>
            <p
              className="mt-0.5 font-semibold uppercase opacity-80"
              style={{ fontSize: compact ? 10 : 13, letterSpacing: "2px" }}
            >
              Terminal 1 · {data.label}
            </p>
            {/* Stats row */}
            <p
              className="mt-2 font-medium opacity-90"
              style={{ fontSize: compact ? 11 : 13 }}
            >
              {data.stats.resolved} résolus · {data.stats.pending} en attente ·{" "}
              {data.stats.ongoing} en cours
            </p>
          </div>
        </div>

        {/* Bloc droit : badge LIVE + indicateur critique */}
        <div className="flex flex-col items-end gap-2">
          <motion.div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-black uppercase"
            style={{
              fontSize: compact ? 9 : 11,
              letterSpacing: "1.5px",
              backgroundColor: "rgba(255,255,255,0.18)",
            }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.span
              className="inline-block size-2 rounded-full bg-white"
              animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />
            LIVE
          </motion.div>

          {hasCritical && (
            <div
              className="flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase"
              style={{
                fontSize: compact ? 9 : 10,
                letterSpacing: "1px",
                backgroundColor: "rgba(255,255,255,0.22)",
              }}
              title={`${data.stats.criticalUnresolved} incident(s) en cours depuis plus de 15 min`}
            >
              <AlertTriangle className={compact ? "size-3" : "size-3.5"} aria-hidden />
              {data.stats.criticalUnresolved} critique
              {data.stats.criticalUnresolved > 1 ? "s" : ""}
            </div>
          )}

          {/* Timestamp discret */}
          <span
            className="font-medium opacity-70"
            style={{ fontSize: compact ? 9 : 10 }}
            suppressHydrationWarning
          >
            <Radio className="mr-1 inline size-2.5" aria-hidden />
            maj {formatTime(lastPulse)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composants : skeleton + erreur
// ============================================================

function LiveScoreSkeleton({
  compact,
  className,
}: {
  compact: boolean
  className?: string
}) {
  const padY = compact ? "py-4 px-5" : "py-8 px-8"
  return (
    <div
      className={`relative overflow-hidden rounded-none bg-slate-200 ${padY} ${className ?? ""}`}
      style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.10)" }}
      aria-busy="true"
      aria-label="Chargement du score de satisfaction"
    >
      <div className="flex items-center gap-4 sm:gap-6">
        <div
          className="animate-pulse rounded-xl bg-slate-300"
          style={{ width: compact ? 64 : 140, height: compact ? 48 : 110 }}
        />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-40 animate-pulse rounded bg-slate-300" />
          <div className="h-2.5 w-28 animate-pulse rounded bg-slate-300" />
          <div className="h-2.5 w-48 animate-pulse rounded bg-slate-300" />
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="size-4 animate-spin" />
        </div>
      </div>
    </div>
  )
}

function LiveScoreError({
  compact,
  className,
  message,
  onRetry,
}: {
  compact: boolean
  className?: string
  message: string
  onRetry: () => void
}) {
  const padY = compact ? "py-4 px-5" : "py-8 px-8"
  return (
    <div
      className={`relative overflow-hidden rounded-none bg-white ${padY} ${className ?? ""}`}
      style={{
        boxShadow: "0 12px 30px rgba(0,0,0,0.10)",
        border: "2px solid #E30613",
      }}
      role="alert"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(227,6,19,0.12)" }}
          >
            <AlertTriangle className="size-6 text-[#E30613]" aria-hidden />
          </div>
          <div>
            <p
              className="font-black uppercase tracking-wide text-[#E30613]"
              style={{ fontSize: compact ? 13 : 16, letterSpacing: "1.5px" }}
            >
              Erreur de chargement
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{message}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-[#E30613] px-3 py-1.5 font-bold uppercase text-white transition-opacity hover:opacity-90"
          style={{ fontSize: 11, letterSpacing: "1px" }}
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}

// ---------- Util ----------
function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return "--:--"
  }
}
