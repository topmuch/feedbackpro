'use client'

import { useState } from 'react'
import { useFpStore } from '@/store/feedbackpro-store'
import { BrandMark } from '@/components/feedbackpro/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export function LoginScreen() {
  const { login, authLoading, authError } = useFpStore()
  const [email, setEmail] = useState('demo@pizzeria.fr')
  const [password, setPassword] = useState('demo1234')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await login(email, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <BrandMark className="mx-auto h-8" />
          <CardDescription>Connectez-vous à votre espace Pro</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo@pizzeria.fr"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            {authError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {authError}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={authLoading}>
              {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Se connecter
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Compte démo : <span className="font-mono">demo@pizzeria.fr</span> / <span className="font-mono">demo1234</span>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
