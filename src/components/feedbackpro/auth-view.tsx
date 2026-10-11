"use client"

// ============================================================
// FeedbackPro - Vue Connexion / Inscription commerçant
// ============================================================

import { useState } from "react"
import { QrCode, Loader2, Mail, Lock, Store, AlertCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAppStore } from "@/store/app-store"
import { registerSchema, loginSchema, fieldErrors } from "@/lib/validation"

export function AuthView() {
  const authMode = useAppStore((s) => s.authMode)
  const setAuthMode = useAppStore((s) => s.setAuthMode)
  const setSession = useAppStore((s) => s.setSession)
  const openScan = useAppStore((s) => s.openScan)

  const isLogin = authMode === "login"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [nomCommerce, setNomCommerce] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Erreurs de validation par champ (zod, mêmes messages que le serveur)
  const [champErreurs, setChampErreurs] = useState<Record<string, string>>({})

  function clearChamp(champ: string) {
    setChampErreurs((prev) => {
      if (!prev[champ]) return prev
      const next = { ...prev }
      delete next[champ]
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validation zod côté client (schéma partagé avec l'API)
    const schema = isLogin ? loginSchema : registerSchema
    const candidat = isLogin ? { email, password } : { email, password, nomCommerce }
    const parsed = schema.safeParse(candidat)
    if (!parsed.success) {
      setChampErreurs(fieldErrors(parsed.error))
      return
    }
    setChampErreurs({})

    setLoading(true)
    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || "Une erreur est survenue")
        return
      }
      // Recharge la session complète : le store redirigera (onboarding ou dashboard)
      const meRes = await fetch("/api/auth/me", { cache: "no-store" })
      const meJson = await meRes.json()
      setSession(meJson?.ok ? meJson.data : null)
    } catch {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion.")
    } finally {
      setLoading(false)
    }
  }

  // Connexion rapide avec un compte de démonstration (facilite la prise en main)
  function fillDemo(kind: "pro" | "admin") {
    setAuthMode("login")
    if (kind === "pro") {
      setEmail("demo@pizzeria.fr")
      setPassword("demo1234")
    } else {
      setEmail("admin@feedbackpro.fr")
      setPassword("admin123")
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-3">
            <QrCode className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isLogin ? "Content de vous revoir !" : "Créez votre compte commerçant"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {isLogin
              ? "Connectez-vous pour accéder à votre tableau de bord"
              : "5 minutes suffisent pour recevoir votre premier avis"}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                onClick={() => setAuthMode("login")}
                className={`h-9 rounded-md text-sm font-medium transition-colors ${isLogin ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                onClick={() => setAuthMode("signup")}
                className={`h-9 rounded-md text-sm font-medium transition-colors ${!isLogin ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Inscription
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="nomCommerce">Nom de votre commerce</Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="nomCommerce"
                      placeholder="Ex : Pizzeria Bella Napoli"
                      value={nomCommerce}
                      onChange={(e) => {
                        setNomCommerce(e.target.value)
                        clearChamp("nomCommerce")
                      }}
                      className="pl-9 h-11"
                      aria-invalid={!!champErreurs.nomCommerce}
                    />
                  </div>
                  {champErreurs.nomCommerce && (
                    <p className="text-xs text-rose-600" role="alert">{champErreurs.nomCommerce}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="email"
                    type="email"
                    placeholder="vous@commerce.fr"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      clearChamp("email")
                    }}
                    className="pl-9 h-11"
                    autoComplete="email"
                    aria-invalid={!!champErreurs.email}
                  />
                </div>
                {champErreurs.email && (
                  <p className="text-xs text-rose-600" role="alert">{champErreurs.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="password"
                    type="password"
                    placeholder={isLogin ? "Votre mot de passe" : "6 caractères minimum"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearChamp("password")
                    }}
                    className="pl-9 h-11"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    aria-invalid={!!champErreurs.password}
                  />
                </div>
                {champErreurs.password && (
                  <p className="text-xs text-rose-600" role="alert">{champErreurs.password}</p>
                )}
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                {isLogin ? "Se connecter" : "Créer mon compte gratuit"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Comptes de démonstration */}
        <div className="mt-5 rounded-xl border border-dashed p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium mb-2.5">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Comptes de démonstration
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => fillDemo("pro")} className="h-10">
              🏪 Commerçant (Pizzeria)
            </Button>
            <Button variant="outline" size="sm" onClick={() => fillDemo("admin")} className="h-10">
              🦸 Superadmin
            </Button>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Cliquez pour pré-remplir, puis « Se connecter ». Vous pourrez aussi tester le parcours client via l&apos;onglet
            Mon QR Code.
          </p>
        </div>
      </div>
    </div>
  )
}
