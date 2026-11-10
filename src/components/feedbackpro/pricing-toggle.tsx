"use client"

// ============================================================
// FeedbackPro - Toggle Tarifs (client)
// Encapsule le toggle mensuel/annuel + la grille de plans pour
// la page /tarifs. Client pour le state du toggle.
// ============================================================

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Trophy, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type Plan = {
  id: "starter" | "pro" | "enterprise"
  nom: string
  prixMensuel: number
  tagline: string
  features: { texte: string; inclus: boolean }[]
  populaire?: boolean
  cta: string
}

export function PricingToggle({ plans }: { plans: Plan[] }) {
  const [annuel, setAnnuel] = useState(true)
  const rabais = 0.2

  return (
    <>
      {/* Toggle mensuel/annuel */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <span
          className={`text-sm font-medium ${!annuel ? "text-gray-900" : "text-gray-500"}`}
        >
          Mensuel
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annuel}
          aria-label="Basculer en facturation annuelle"
          onClick={() => setAnnuel((v) => !v)}
          className={`relative h-7 w-12 rounded-full transition-colors ${
            annuel ? "bg-gradient-to-br from-[#002e85] to-[#0047c7]" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              annuel ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium ${annuel ? "text-gray-900" : "text-gray-500"}`}
        >
          Annuel
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
          -20 %
        </span>
      </div>

      {/* Plans */}
      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const prix = annuel
            ? Math.round(plan.prixMensuel * (1 - rabais))
            : plan.prixMensuel
          return (
            <article
              key={plan.id}
              className={`relative flex h-full flex-col rounded-3xl p-6 sm:p-8 ${
                plan.populaire
                  ? "border-2 border-[#002e85] bg-white shadow-lg shadow-[#002e85]/20 lg:scale-105"
                  : "border border-gray-200 bg-white shadow-sm"
              }`}
            >
              {plan.populaire && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-br from-[#002e85] to-[#0047c7] px-3 py-1 text-xs font-semibold text-white shadow-lg">
                  <Trophy className="h-3.5 w-3.5" />
                  Recommandé
                </span>
              )}

              <h3 className="text-lg font-bold text-gray-900">{plan.nom}</h3>
              <p className="mt-1 text-sm text-gray-600">{plan.tagline}</p>

              <div className="mt-5 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-gray-900">
                  {prix} €
                </span>
                <span className="mb-1.5 text-sm text-gray-600">/ mois HT</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {annuel ? `Facturé ${prix * 12} € / an` : "Facturé mensuellement"}
              </p>

              <Button
                asChild
                className={`mt-6 w-full border-0 ${
                  plan.populaire
                    ? "bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white hover:opacity-90"
                    : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                }`}
              >
                <Link href={plan.id === "enterprise" ? "/contact" : "/?auth=register"}>
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <ul className="mt-6 space-y-3 border-t border-gray-200 pt-6">
                {plan.features.map((f) => (
                  <li key={f.texte} className="flex items-start gap-2.5 text-sm">
                    {f.inclus ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                    )}
                    <span
                      className={f.inclus ? "text-gray-700" : "text-gray-400 line-through"}
                    >
                      {f.texte}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </>
  )
}
