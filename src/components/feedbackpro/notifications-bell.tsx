"use client"

// ============================================================
// FeedbackPro - Cloche de notifications in-app (header)
// Polling toutes les 30 s pour rafraîchir le badge de notifications non lues.
// Au clic : dropdown listant les 10 dernières notifications + actions
// « marquer comme lu » et « tout marquer comme lu ».
//
// Feature 1 — Rattrapage client : quand une notification de type
// `retour_negatif` est détectée (nouvelle depuis le dernier polling),
// on déclenche un TOAST PERSISTANT (ne disparaît pas tant que le
// manager n'interagit pas) avec deux boutons d'action :
//   - « Je m'en occupe » : POST /api/pro/retours { action: "rattrapagePrisEnCharge" }
//     → horodate la prise en charge sur le retour (champ rattrapagePrisEnChargeAt).
//   - « Voir le détail » : navigation vers l'onglet Retours du dashboard.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, Check, CheckCheck, Loader2, AlertTriangle } from "lucide-react"
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

/**
 * Feature 1 — Extrait le retourId depuis le message d'une notification
 * `retour_negatif`. Le message est suffixé par `|retourId=<cuid>` côté
 * serveur (POST /api/retour). Renvoie null si le suffixe est absent.
 */
function extraireRetourId(message: string): string | null {
  const m = message.match(/\|retourId=([A-Za-z0-9_-]+)/)
  return m?.[1] ?? null
}

/**
 * Feature 1 — Extrait les METADATA du message d'une notification
 * `retour_negatif`. Le message est formaté comme :
 *   `<note>/5 — <tags> — <commentaire> — Client : <nom> — En attente de rattrapage|retourId=<id>`
 *
 * On renvoie une version « propre » (sans le suffixe retourId) et un
 * booléen indiquant si un nom de client a été saisi.
 */
function formaterMessageRattrapage(message: string): {
  texte: string
  aNomClient: boolean
  retourId: string | null
} {
  const retourId = extraireRetourId(message)
  const texte = message.replace(/\|retourId=[A-Za-z0-9_-]+$/, "").trim()
  const aNomClient = /— Client :/.test(texte)
  return { texte, aNomClient, retourId }
}

export function NotificationsBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [nonLues, setNonLues] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  // Feature 1 — `toast` sert à empiler les toasts d'action (rattrapage),
  // `toastFeedback` sert aux retours visuels (succès/erreur) après clic.
  // Les deux proviennent du même hook useToast (API stable).
  const { toast, dismiss } = useToast()
  const { toast: toastFeedback } = useToast()
  // Feature 1 — Référence vers les IDs déjà vus (pour détecter les NOUVELLES
  // notifications `retour_negatif` et déclencher un toast persistant).
  const idsVusRef = useRef<Set<string>>(new Set())
  const premiereBoucleRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        const notifs: NotificationItem[] = json.data.notifications ?? []
        const nouveauCompte = json.data.nonLues ?? 0

        // ---------- Feature 1 — Détection des NOUVELLES notifications ----------
        // On compare la liste fraîche avec les IDs déjà vus. À la première
        // boucle (chargement initial), on peuple le Set sans déclencher de
        // toast (sinon on inonderait le manager de toasts pour toutes les
        // notifications déjà présentes à l'ouverture du dashboard).
        const idsVus = idsVusRef.current
        if (!premiereBoucleRef.current) {
          for (const n of notifs) {
            if (idsVus.has(n.id)) continue
            idsVus.add(n.id)
            // On ne déclenche le toast persistant QUE pour les notifications
            // de type `retour_negatif` NON lues (les lues ont déjà été traitées).
            if (n.type === "retour_negatif" && !n.lu) {
              declencherToastRattrapage(n)
            }
          }
        } else {
          for (const n of notifs) idsVus.add(n.id)
          premiereBoucleRef.current = false
        }

        setItems(notifs)
        setNonLues(nouveauCompte)
      }
    } catch {
      /* silencieux */
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Feature 1 — Déclenche un TOAST PERSISTANT pour une notification
   * `retour_negatif`. Le toast ne disparaît pas tant que le manager n'a
   * pas cliqué sur « Je m'en occupe » ou « Voir le détail » (la fermeture
   * manuelle via la croix est aussi possible — non bloquante).
   *
   * Boutons :
   *   - « Je m'en occupe » : POST /api/pro/retours { action: "rattrapagePrisEnCharge", id }
   *     → horodate la prise en charge. Ferme le toast.
   *   - « Voir le détail » : navigation SPA vers /dashboard/retours. Ferme le toast.
   */
  function declencherToastRattrapage(n: NotificationItem) {
    const { texte, aNomClient, retourId } = formaterMessageRattrapage(n.message)
    const titre = n.titre || "🚨 Retour négatif"
    // Empile le toast persistant et capture l'ID pour pouvoir le fermer
    // depuis les boutons d'action (sans ça, le manager devrait cliquer sur
    // la croix manuellement).
    const { id: toastId } = toast({
      title: titre,
      description: (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs leading-snug opacity-90">{texte}</p>
          {aNomClient && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              ⏳ Client en attente de rattrapage sur place
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              type="button"
              className="h-8 bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
              onClick={async () => {
                if (!retourId) {
                  toastFeedback({
                    title: "Retour introuvable",
                    description: "Impossible de marquer l'alerte comme prise en charge.",
                    variant: "destructive",
                  })
                  return
                }
                try {
                  const res = await fetch("/api/pro/retours", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "rattrapagePrisEnCharge",
                      id: retourId,
                    }),
                  })
                  const json = await res.json()
                  if (json.ok) {
                    toastFeedback({
                      title: "✓ Pris en charge",
                      description: "Le client a été informé que vous arrivez.",
                    })
                    // Ferme le toast persistant — l'action est traitée.
                    dismiss(toastId)
                    // Rafraîchit les notifications (la notif reste non lue
                    // mais on ne veut pas la re-déclencher — elle est déjà
                    // dans idsVusRef).
                    void load()
                  } else {
                    throw new Error(json.error || "Échec")
                  }
                } catch {
                  toastFeedback({
                    title: "Erreur",
                    description: "Impossible de marquer l'alerte comme prise en charge.",
                    variant: "destructive",
                  })
                }
              }}
            >
              Je m&apos;en occupe
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="h-8 border-amber-400 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300"
              onClick={() => {
                // Ferme le toast persistant avant de naviguer.
                dismiss(toastId)
                // Navigation SPA vers l'onglet Retours (URL rewrite côté
                // pro-dashboard via window.history.pushState — on se contente
                // de pousser le slug et de déclencher popstate pour que le
                // routeur interne du dashboard se réaligne).
                try {
                  window.history.pushState({}, "", "/dashboard/retours")
                  window.dispatchEvent(new PopStateEvent("popstate"))
                } catch {
                  window.location.href = "/dashboard/retours"
                }
              }}
            >
              Voir le détail
            </Button>
          </div>
        </div>
      ),
      // Pas de variante destructive : on garde le ton neutre pour ne pas
      // paniquer le manager (le toast reste voyant grâce au titre 🚨).
      variant: "default",
      // duration non-spécifié → utilise le TOAST_REMOVE_DELAY par défaut
      // (1 000 000 ms ≈ 16 min — quasi-persistant).
    })
  }

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
