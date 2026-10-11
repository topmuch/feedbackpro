"use client"

// ============================================================
// FeedbackPro - Vue Connexion / Inscription commerçant
// Session 2 : validation zod + react-hook-form (zodResolver)
// Les schémas sont partagés avec les API (src/lib/validation.ts)
// ============================================================

import { useEffect } from "react"
import { QrCode, Loader2, Mail, Lock, Store, AlertCircle, Sparkles } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useAppStore } from "@/store/app-store"
import { registerSchema, loginSchema } from "@/lib/validation"

type LoginValues = z.infer<typeof loginSchema>
type RegisterValues = z.infer<typeof registerSchema>

export function AuthView() {
  const authMode = useAppStore((s) => s.authMode)
  const setAuthMode = useAppStore((s) => s.setAuthMode)

  const isLogin = authMode === "login"

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
            {/* key={authMode} : réinitialise le formulaire au changement d'onglet */}
            {isLogin ? <AuthForm key="login" mode="login" /> : <AuthForm key="signup" mode="signup" />}
          </CardContent>
        </Card>

        <ComptesDemo />
      </div>
    </div>
  )
}

// ---------- Formulaire (connexion ou inscription) ----------

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const setSession = useAppStore((s) => s.setSession)
  const isLogin = mode === "login"

  const {
    register,
    handleSubmit,
    reset,
    setError: setErreurRacine,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues | RegisterValues>({
    // Schéma zod partagé avec l'API — mêmes messages côté client et serveur
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
    defaultValues: { email: "", password: "", ...(isLogin ? {} : { nomCommerce: "" }) },
  })

  // Pré-remplissage depuis les boutons « Comptes de démonstration » (via le store)
  const prefill = useAppStore((s) => s.prefillLogin)
  useEffect(() => {
    if (isLogin && prefill) {
      reset({ email: prefill.email, password: prefill.password })
      useAppStore.setState({ prefillLogin: null })
    }
  }, [isLogin, prefill, reset])

  async function onSubmit(values: LoginValues | RegisterValues) {
    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!json.ok) {
        setErreurRacine("root", { message: json.error || "Une erreur est survenue" })
        return
      }
      // Recharge la session complète : le store redirigera (onboarding ou dashboard)
      const meRes = await fetch("/api/auth/me", { cache: "no-store" })
      const meJson = await meRes.json()
      setSession(meJson?.ok ? meJson.data : null)
    } catch {
      setErreurRacine("root", {
        message: "Impossible de contacter le serveur. Vérifiez votre connexion.",
      })
    }
  }

  const erreurChamp = (champ: string): string | undefined => {
    const e = (errors as Record<string, { message?: string }>)[champ]
    return e?.message
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {!isLogin && (
        <div className="space-y-1.5">
          <Label htmlFor="nomCommerce">Nom de votre commerce</Label>
          <div className="relative">
            <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="nomCommerce"
              placeholder="Ex : Pizzeria Bella Napoli"
              className="pl-9 h-11"
              autoComplete="organization"
              aria-invalid={!!erreurChamp("nomCommerce")}
              {...register("nomCommerce")}
            />
          </div>
          {erreurChamp("nomCommerce") && (
            <p className="text-xs text-rose-600" role="alert">{erreurChamp("nomCommerce")}</p>
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
            className="pl-9 h-11"
            autoComplete="email"
            aria-invalid={!!erreurChamp("email")}
            {...register("email")}
          />
        </div>
        {erreurChamp("email") && (
          <p className="text-xs text-rose-600" role="alert">{erreurChamp("email")}</p>
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
            className="pl-9 h-11"
            autoComplete={isLogin ? "current-password" : "new-password"}
            aria-invalid={!!erreurChamp("password")}
            {...register("password")}
          />
        </div>
        {erreurChamp("password") && (
          <p className="text-xs text-rose-600" role="alert">{erreurChamp("password")}</p>
        )}
      </div>

      {errors.root?.message && (
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errors.root.message}
        </p>
      )}

      <Button type="submit" className="w-full h-11 text-base" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        {isLogin ? "Se connecter" : "Créer mon compte gratuit"}
      </Button>
    </form>
  )
}

// ---------- Comptes de démonstration ----------

function ComptesDemo() {
  return (
    <div className="mt-5 rounded-xl border border-dashed p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium mb-2.5">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        Comptes de démonstration
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          onClick={() => useAppStore.getState().demoLogin("pro")}
        >
          🏪 Commerçant (Pizzeria)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          onClick={() => useAppStore.getState().demoLogin("admin")}
        >
          🦸 Superadmin
        </Button>
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        Cliquez pour pré-remplir, puis « Se connecter ». Vous pourrez aussi tester le parcours client via l&apos;onglet
        Mon QR Code.
      </p>
    </div>
  )
}
