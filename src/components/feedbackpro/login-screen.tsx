'use client'

import { useState } from 'react'
import { useFpStore } from '@/store/feedbackpro-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MessageSquare, Loader2 } from 'lucide-react'

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
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
            <MessageSquare className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl">FeedbackPro</CardTitle>
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
