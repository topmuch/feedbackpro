'use client'

import { useFpStore } from '@/store/feedbackpro-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'

export function PersonnelTab() {
  const { retours } = useFpStore()

  // Dérive un faux personnel depuis les retours (démo)
  const personnel = [
    { nom: 'Diop', prenom: 'Ousmane', poste: 'serveur', mentionsNegatives: 1, mentionsPositives: 0 },
    { nom: 'Martin', prenom: 'Sophie', poste: 'serveuse', mentionsNegatives: 0, mentionsPositives: 2 },
    { nom: 'Bernard', prenom: 'Pierre', poste: 'cuisinier', mentionsNegatives: 0, mentionsPositives: 1 },
    { nom: 'Lefebvre', prenom: 'Julie', poste: 'plonge', mentionsNegatives: 2, mentionsPositives: 0 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personnel</h1>
        <p className="text-muted-foreground">Mentions par employé (issues des retours clients).</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {personnel.map((p) => (
          <Card key={p.nom + p.prenom}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{p.prenom} {p.nom}</div>
                <div className="text-xs text-muted-foreground capitalize">{p.poste}</div>
              </div>
              <div className="text-right text-xs space-y-1">
                <div className="flex items-center gap-1 justify-end">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  {p.mentionsNegatives} nég.
                </div>
                <div className="flex items-center gap-1 justify-end">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  {p.mentionsPositives} pos.
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        {retours.length} retours analysés.
      </div>
    </div>
  )
}
