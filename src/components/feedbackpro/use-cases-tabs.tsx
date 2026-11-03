"use client"

// ============================================================
// FeedbackPro - Tabs Cas d'usage (client)
// ------------------------------------------------------------
// Encapsule les Tabs shadcn pour la page /cas-usage. Importe
// directement les données depuis @/lib/landing-data (les icônes
// Lucide sont des composants React : elles NE peuvent pas être
// passées en prop depuis un Server Component — il faut que le
// tableau soit construit côté client).
// ============================================================

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Check } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { USE_CASES } from "@/lib/landing-data"

type UseCase = {
  id: string
  emoji: string
  icone: LucideIcon
  label: string
  points: { titre: string; texte: string }[]
}

const items: UseCase[] = USE_CASES

export function UseCasesTabs() {
  return (
    <Tabs defaultValue={items[0]?.id} className="mt-10">
      <TabsList
        className="flex h-auto w-full flex-nowrap gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-gray-100 p-1.5 no-scrollbar"
        aria-label="Secteurs d'activité"
      >
        {items.map((uc) => (
          <TabsTrigger
            key={uc.id}
            value={uc.id}
            className="flex-1 shrink-0 rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-200 data-[state=active]:border-transparent data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#002e85] data-[state=active]:to-[#0047c7] data-[state=active]:text-white data-[state=active]:shadow-[0_0_20px_rgba(0,46,133,0.4)]"
          >
            <span className="mr-1.5">{uc.emoji}</span>
            <span className="hidden sm:inline">{uc.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {items.map((uc) => {
        const Icone = uc.icone
        return (
          <TabsContent key={uc.id} value={uc.id} className="mt-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white">
                  <Icone className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {uc.emoji} {uc.label}
                  </h3>
                  <p className="text-sm text-gray-600">
                    4 points clés couverts par FeedbackPro
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {uc.points.map((pt) => (
                  <div
                    key={pt.titre}
                    className="flex items-start gap-3 rounded-2xl bg-gray-50 p-4"
                  >
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{pt.titre}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{pt.texte}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
