"use client"

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

  const step =
    (session?.pro as unknown as { onboardingStep?: number } | undefined)?.onboardingStep ?? 0

  const [masquee, setMasquee] = useState(false)
  const [enCours, setEnCours] = useState(false)

  const etapeActive = Math.min(step + 1, 4)
  const progression = Math.round((step / 4) * 100)

  if (step >= 5 || masquee) return null

  async function validerEtape() {
    setEnCours(true)
    try {
      const res = await fetch("/api/pro/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const json = await res.json()
      if (json.ok) {
        updatePro(json.data.pro)
        toast({
          title: `Étape ${step + 1} validée !`,
          description: step + 1 >= 4 ? "Votre Coach IA est prêt à démarrer." : undefined,
        })
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de valider l'étape", variant: "destructive" })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="rounded-3xl border border-[#002e85]/20 bg-gradient-to-br from-[#002e85]/5 to-[#0047c7]/5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#002e85]" aria-hidden />
          <div>
            <p className="text-sm font-bold text-[#002e85]">
              Bienvenue sur FeedbackPro — votre première semaine
            </p>
            <p className="text-xs text-muted-foreground">
              4 étapes pour activer votre Coach IA qualité — progression {progression}%
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMasquee(true)}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Masquer la bannière d'onboarding"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Barre de progression */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[#002e85] transition-all duration-500"
          style={{ width: `${progression}%` }}
        />
      </div>

      {/* Étapes */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ETAPES.map((etape) => {
          const faite = step >= etape.n
          const active = etapeActive === etape.n
          return (
            <a
              key={etape.n}
              href={etape.lien}
              className={cn(
                "flex flex-col gap-1 rounded-2xl border p-3 transition-all",
                faite
                  ? "border-green-300 bg-green-50"
                  : active
                    ? "border-[#002e85] bg-white shadow-sm ring-2 ring-[#002e85]/10"
                    : "border-border bg-muted/30 opacity-60"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    faite ? "bg-green-500 text-white" : active ? "bg-[#002e85] text-white" : "bg-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {faite ? <Check className="h-3 w-3" /> : etape.n}
                </span>
                <span className="text-xs font-semibold text-foreground">{etape.titre}</span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">{etape.description}</p>
              {active && etape.tips && (
                <p className="text-[10px] italic text-[#002e85]">💡 {etape.tips}</p>
              )}
            </a>
          )
        })}
      </div>

      {/* Bouton valider */}
      {step < 4 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            size="sm"
            onClick={validerEtape}
            disabled={enCours}
            className="bg-[#002e85] text-white hover:bg-[#002e85]/90"
          >
            {enCours ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            J'ai compris
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
