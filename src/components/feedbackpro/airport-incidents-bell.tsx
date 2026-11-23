"use client"

// ============================================================
// AirportIncidentsBell — Cloche notifications signalements aéroport
// ------------------------------------------------------------
// Affiche un badge avec le nombre de signalements EN_ATTENTE sur
// l'aéroport. Au clic, ouvre un dropdown listant les 5 derniers
// incidents (zone, type, heure) récupérés via :
//   GET /api/airport/reports?statut=EN_ATTENTE&limit=5
//
// Polling toutes les 20 s pour rafraîchir le badge sans surcharger
// l'API (les signalements voyagent via WhatsApp/WebSocket côté ops).
//
// Feature 1 — Notifications dans signalements :
//   - Badge rouge avec compte des incidents EN_ATTENTE
//   - Dropdown listant zone + problemType + il y a X min
//   - Lien d'action « Voir le centre ops » (switch vers l'onglet ops)
//   - Ton « light » par défaut (header admin sur fond clair)
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { Plane, Loader2, AlertTriangle, RefreshCw, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type IncidentLigne = {
  id: string
  problemType: string
  tagScanne: string
  statut: string
  createdAt: string
  zone?: {
    code: string
    nom: string
    emoji: string | null
  } | null
}

function formatTempsRelatif(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.max(0, (now.getTime() - d.getTime()) / 1000)
    if (diff < 60) return "à l'instant"
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

export function AirportIncidentsBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [incidents, setIncidents] = useState<IncidentLigne[]>([])
  const [totalPending, setTotalPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState(false)
  // Référence vers le compte précédent pour détecter les nouveaux
  // incidents et déclencher une petite animation du badge.
  const lastCountRef = useRef<number>(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/airport/reports?statut=EN_ATTENTE&limit=5", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        const list: IncidentLigne[] = json.data.reports ?? []
        const total: number = json.data.count ?? list.length
        setIncidents(list)
        setTotalPending(total)
        lastCountRef.current = total
      }
    } catch {
      /* silencieux : le badge reste à sa dernière valeur */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Chargement initial + polling 20 s
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 20_000)
    return () => clearInterval(t)
  }, [load])

  const isDark = tone === "dark"
  const displayCount = totalPending > 9 ? "9+" : String(totalPending)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${
            isDark
              ? "text-white hover:bg-white/15 hover:text-white"
              : "hover:bg-accent"
          }`}
          aria-label={`Signalements aéroport${totalPending > 0 ? ` (${totalPending} en attente)` : ""}`}
          aria-haspopup="menu"
        >
          <Plane className="h-4.5 w-4.5" aria-hidden />
          {totalPending > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#bc7155] px-1 text-[10px] font-bold text-white shadow"
              aria-hidden
            >
              {displayCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <Plane className="h-4 w-4 text-[#a05f45]" aria-hidden />
              Signalements aéroport
            </span>
          </DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={refreshing || loading}
            onClick={() => {
              setRefreshing(true)
              void load()
            }}
            aria-label="Rafraîchir"
          >
            {refreshing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            Rafraîchir
          </Button>
        </div>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Chargement…
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3ddd2]" aria-hidden>
              <Plane className="h-4 w-4 text-[#a05f45]" />
            </span>
            <p className="text-sm text-muted-foreground">Aucun signalement en attente</p>
            <p className="text-[11px] text-muted-foreground">Les nouveaux incidents apparaîtront ici.</p>
          </div>
        ) : (
          <>
            <div className="px-2 pb-1.5 pt-1">
              <Badge variant="secondary" className="text-[11px]">
                {totalPending} en attente
              </Badge>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {incidents.map((inc) => (
                <DropdownMenuItem
                  key={inc.id}
                  className="flex items-start gap-2.5 px-3 py-2.5 text-left"
                  // On ne ferme pas le menu au clic sur une ligne : on laisse
                  // l'admin consulter la liste sans interruption.
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f3ddd2] text-base" aria-hidden>
                    {inc.zone?.emoji ?? "⚠"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug">
                      {inc.problemType}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {inc.zone?.nom ?? inc.tagScanne}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatTempsRelatif(inc.createdAt)}
                    </p>
                  </div>
                  <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-[#bc7155]" aria-hidden />
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className="cursor-pointer text-[#8a4f3b] focus:text-[#8a4f3b] dark:text-[#dba28a]"
            >
              <a
                href="/superadmin/operations"
                onClick={(e) => {
                  // Navigation SPA : on pousse le slug dans l'historique et
                  // déclenche popstate pour que l'AdminDashboard se réaligne
                  // sur l'onglet operations sans recharger la page.
                  e.preventDefault()
                  try {
                    window.history.pushState({}, "", "/superadmin/operations")
                    window.dispatchEvent(new PopStateEvent("popstate"))
                  } catch {
                    window.location.href = "/superadmin/operations"
                  }
                  setOpen(false)
                }}
              >
                <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Voir le centre opérationnel
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
