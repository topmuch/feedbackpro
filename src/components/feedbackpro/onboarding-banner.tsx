"use client"

// ============================================================
// FeedbackPro - Bannière d'onboarding "First Week" (Task 1)
// ------------------------------------------------------------
// S'affiche en haut du dashboard Pro tant que onboardingStep < 5.
// Montre une barre de progression à 4 étapes + un bouton "J'ai compris"
// qui déclenche POST /api/pro/onboarding { step } pour avancer.
// ============================================================

import { useState } from "react"
import { Check, ChevronRight, Loader2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import { useToast } from "@/hooks/use-toast"

type Etape = {
  n: number
  titre: string
  description: string
  lien: string
  tips?: string
}

const ETAPES: Etape[] = [
  {
    n: 1,
    titre: "Créez vos zones de contact",
    description:
      "Identifiez les points de contact où vos clients laissent une impression (Accueil, Salle, Toilettes…).",
    lien: "/dashboard/zones",
    tips: "Visez 3 à 5 zones couvertes pour un premier audit représentatif.",
  },
  {
    n: 2,
    titre: "Téléchargez vos QR codes",
    description:
      "Exportez chaque QR code en PDF prêt à imprimer pour vos affichettes et chevalets.",
    lien: "/dashboard/qr-codes",
    tips: "Plus vos QR codes sont visibles, plus vous recevez de retours.",
  },
  {
    n: 3,
    titre: "Présentez le concept à votre équipe",
    description:
      "Vos collaborateurs sont les premiers acteurs de la qualité — expliquez le dispositif.",
    lien: "/dashboard/equipe",
    tips: "Les mentions clients valorisent leur travail au quotidien.",
  },
  {
    n: 4,
    titre: "Attendez vos premiers retours",
    description:
      "Les premiers retours arrivent en 24-72 h. Dès 5 retours, votre Coach IA génère un premier audit.",
    lien: "/dashboard",
    tips: "Patience : la qualité se construit sur la régularité des retours.",
  },
]

export function OnboardingBanner() {
  const session = useAppStore((s) => s.session)
  const updatePro = useAppStore((s) => s.updatePro)
  const { toast } = useToast()

  // onboardingStep : 0 = pas commencé, 1-4 = étapes, 5 = terminé
  const step =
    (session?.pro as unknown as { onboardingStep?: number } | undefined)?.onboardingStep ?? 0

  // Dismissible localement pour la session (persistant côté serveur dès
  // qu'une étape est validée). L'utilisateur peut masquer la bannière sans
  // valider d'étape pour ne pas perdre la progression.
  const [masquee, setMasquee] = useState(false)
  const [enCours, setEnCours] = useState(false)

  // Étape active = la première non validée (step + 1, plafonnée à 4)
  // Si step = 0 → étape active = 1
  // Si step = 4 → étape active = 4 (dernière étape, encore à valider)
  // Si step >= 5 → bannière masquée (onboarding terminé)
  if (step >= 5 || masquee) return null

  const etapeActive = Math.min(4, Math.max(1, step + 1))
  const etapeCourante = ETAPES[etapeActive - 1]
  const progression = Math.round((Math.min(step, 4) / 4) * 100)

  async function validerEtape(n: number) {
    if (enCours) return
    setEnCours(true)
    try {
      const res = await fetch("/api/pro/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: n }),
      })
      const json = await res.json()
      if (json.ok) {
        updatePro(json.data.pro)
        if (n >= 5) {
          toast({
            title: "Onboarding terminé 🎉",
            description: "Votre Coach IA est maintenant pleinement opérationnel.",
          })
        } else {
          toast({
            title: `Étape ${n} validée ✓`,
            description: ETAPES[n] ? `Prochaine étape : ${ETAPES[n].titre}` : undefined,
          })
        }
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm lg:mx-0 dark:border-blue-900/40 dark:from-blue-950/40 dark:to-indigo-950/40">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Sparkles className="size-5" aria-hidden />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* En-tête + progression */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground sm:text-lg">
                Bienvenue sur FeedbackPro — votre première semaine
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                4 étapes pour activer votre Coach IA qualité — progression {progression}%
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMasquee(true)}
              aria-label="Masquer la bannière d'onboarding"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* Barre de progression */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950/60">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${progression}%` }}
              role="progressbar"
              aria-valuenow={progression}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          {/* Étapes en chips cliquables */}
          <ol className="flex flex-wrap gap-1.5">
            {ETAPES.map((e) => {
              const faite = step > e.n
              const active = e.n === etapeActive
              return (
                <li key={e.n}>
                  <a
                    href={e.lien}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      faite
                        ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
                        : active
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-blue-300 hover:text-foreground"
                    )}
                  >
                    {faite ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full text-[10px] font-bold",
                          active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                        )}
                        aria-hidden
                      >
                        {e.n}
                      </span>
                    )}
                    <span className="truncate max-w-[140px] sm:max-w-none">{e.titre}</span>
                  </a>
                </li>
              )
            })}
          </ol>

          {/* Carte étape active : description + tips + bouton valider */}
          <div className="rounded-xl border border-blue-200 bg-white/80 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span
                    className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white"
                    aria-hidden
                  >
                    {etapeCourante.n}
                  </span>
                  {etapeCourante.titre}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {etapeCourante.description}
                </p>
                {etapeCourante.tips && (
                  <p className="text-[11px] italic text-blue-700 dark:text-blue-300">
                    💡 {etapeCourante.tips}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={etapeCourante.lien}>
                    {etapeCourante.n === 4 ? "Voir mon tableau de bord" : "Ouvrir"}
                    <ChevronRight className="ml-1 size-3.5" aria-hidden />
                  </a>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-blue-600 hover:bg-blue-700"
                  disabled={enCours}
                  onClick={() => validerEtape(etapeCourante.n)}
                >
                  {enCours ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="mr-1.5 size-3.5" aria-hidden />
                  )}
                  J&apos;ai compris
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
