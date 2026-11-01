"use client"

// ============================================================
// FeedbackPro - Cloche de notifications in-app (header)
// Polling toutes les 30 s pour rafraîchir le badge de notifications non lues.
// Au clic : dropdown listant les 10 dernières notifications + actions
// « marquer comme lu » et « tout marquer comme lu ».
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react"
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
import { useToast } from "@/hooks/use-toast"

type NotificationItem = {
  id: string
  type: string
  titre: string
  message: string
  lu: boolean
  createdAt: string
}

function formatDateNotif(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000
    if (diff < 60) return "à l'instant"
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
    if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
  } catch {
    return ""
  }
}

export function NotificationsBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [nonLues, setNonLues] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        setItems(json.data.notifications ?? [])
        setNonLues(json.data.nonLues ?? 0)
      }
    } catch {
      /* silencieux */
    } finally {
      setLoading(false)
    }
  }, [])

  // Chargement initial + polling 30 s
  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  async function marquerCommeLu(id: string) {
    setMarking(true)
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (json.ok) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)))
        setNonLues(json.data.nonLues ?? 0)
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de marquer la notification", variant: "destructive" })
    } finally {
      setMarking(false)
    }
  }

  async function toutMarquerCommeLu() {
    setMarking(true)
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
      const json = await res.json()
      if (json.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, lu: true })))
        setNonLues(0)
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de marquer les notifications", variant: "destructive" })
    } finally {
      setMarking(false)
    }
  }

  const isDark = tone === "dark"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${
            isDark
              ? "text-white hover:bg-white/15 hover:text-white"
              : "hover:bg-accent"
          }`}
          aria-label={`Notifications${nonLues > 0 ? ` (${nonLues} non lues)` : ""}`}
        >
          <Bell className="h-4.5 w-4.5" aria-hidden />
          {nonLues > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white"
              aria-hidden
            >
              {nonLues > 9 ? "9+" : nonLues}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            Notifications
          </DropdownMenuLabel>
          {nonLues > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={marking}
              onClick={toutMarquerCommeLu}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
              Tout marquer lu
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted" aria-hidden>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">Aucune notification pour le moment</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {items.map((n) => (
              <div
                key={n.id}
                className={`group flex items-start gap-2 px-3 py-2.5 transition-colors ${
                  n.lu ? "" : "bg-blue-50/60"
                }`}
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    n.lu ? "bg-transparent" : "bg-blue-600"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{n.titre}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-2">
                    {n.message}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatDateNotif(n.createdAt)}
                  </p>
                </div>
                {!n.lu && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                    disabled={marking}
                    aria-label="Marquer comme lu"
                    onClick={() => marquerCommeLu(n.id)}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
