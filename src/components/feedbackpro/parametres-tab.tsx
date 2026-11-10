'use client'

import { useFpStore } from '@/store/feedbackpro-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function ParametresTab() {
  const { user, recompense } = useFpStore()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">Configuration de votre établissement.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Établissement</CardTitle>
          <CardDescription>Informations de base.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nom</Label>
              <Input value={user?.etablissements?.[0]?.nom ?? ''} readOnly />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Input value={user?.etablissements?.[0]?.type ?? ''} readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Récompense client</CardTitle>
          <CardDescription>Configurée automatiquement pour la démo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="rec-active">Récompense active</Label>
            <Switch id="rec-active" checked={recompense?.active ?? false} disabled />
          </div>
          {recompense?.active && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Input value={recompense.type ?? ''} readOnly />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Texte affiché</Label>
                <Input value={recompense.texte ?? ''} readOnly />
              </div>
              <div>
                <Label className="text-xs">Code promo</Label>
                <Input value={recompense.codePromo ?? ''} readOnly />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canal WhatsApp équipe</CardTitle>
          <CardDescription>Pour les alertes en temps réel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="wa-active">WhatsApp actif</Label>
            <Switch id="wa-active" checked={recompense?.whatsappActive ?? false} disabled />
          </div>
          {recompense?.whatsapp && (
            <div>
              <Label className="text-xs">Numéro</Label>
              <Input value={recompense.whatsapp} readOnly />
            </div>
          )}
          <Badge variant="secondary">Configuration démo — non modifiable</Badge>
        </CardContent>
      </Card>
    </div>
  )
}
