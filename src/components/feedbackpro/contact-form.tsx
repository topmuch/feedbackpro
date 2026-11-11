"use client"

// ============================================================
// FeedbackPro - Formulaire de contact public (page /contact)
// ------------------------------------------------------------
// Client component : POST vers /api/contact, affiche un toast en
// cas de succès, et reset le formulaire. Aucune auth requise.
// ============================================================

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

type Erreurs = Partial<Record<"nom" | "email" | "sujet" | "message", string>>

export function ContactForm() {
  const [valeurs, setValeurs] = useState({ nom: "", email: "", sujet: "", message: "" })
  const [erreurs, setErreurs] = useState<Erreurs>({})
  const [envoi, setEnvoi] = useState(false)
  const { toast } = useToast()

  function maj(champ: keyof typeof valeurs, valeur: string) {
    setValeurs((p) => ({ ...p, [champ]: valeur }))
    if (erreurs[champ]) setErreurs((p) => ({ ...p, [champ]: undefined }))
  }

  function valider(): boolean {
    const e: Erreurs = {}
    if (valeurs.nom.trim().length < 2) e.nom = "Indiquez votre nom (2 caractères min.)"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeurs.email.trim())) e.email = "Adresse email invalide"
    if (valeurs.sujet.trim().length < 3) e.sujet = "Sujet trop court (3 caractères min.)"
    if (valeurs.message.trim().length < 10) e.message = "Message trop court (10 caractères min.)"
    setErreurs(e)
    return Object.keys(e).length === 0
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    if (envoi) return
    if (!valider()) return
    setEnvoi(true)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: valeurs.nom.trim(),
          email: valeurs.email.trim().toLowerCase(),
          sujet: valeurs.sujet.trim(),
          message: valeurs.message.trim(),
        }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Message envoyé ✓", description: "Nous vous répondrons sous 72 h." })
        setValeurs({ nom: "", email: "", sujet: "", message: "" })
        setErreurs({})
      } else {
        toast({ title: "Erreur", description: json.error ?? "Envoi impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Réseau indisponible, réessayez plus tard", variant: "destructive" })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={envoyer} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="ct-nom">Nom complet *</Label>
        <Input
          id="ct-nom"
          autoComplete="name"
          value={valeurs.nom}
          onChange={(e) => maj("nom", e.target.value)}
          maxLength={80}
          required
          aria-invalid={!!erreurs.nom}
        />
        {erreurs.nom && <p className="text-xs text-rose-600">{erreurs.nom}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ct-email">Email *</Label>
        <Input
          id="ct-email"
          type="email"
          autoComplete="email"
          value={valeurs.email}
          onChange={(e) => maj("email", e.target.value)}
          maxLength={120}
          required
          aria-invalid={!!erreurs.email}
        />
        {erreurs.email && <p className="text-xs text-rose-600">{erreurs.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ct-sujet">Sujet *</Label>
        <Input
          id="ct-sujet"
          value={valeurs.sujet}
          onChange={(e) => maj("sujet", e.target.value)}
          maxLength={120}
          required
          aria-invalid={!!erreurs.sujet}
        />
        {erreurs.sujet && <p className="text-xs text-rose-600">{erreurs.sujet}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ct-msg">Message *</Label>
        <Textarea
          id="ct-msg"
          rows={6}
          value={valeurs.message}
          onChange={(e) => maj("message", e.target.value)}
          maxLength={2000}
          required
          aria-invalid={!!erreurs.message}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {erreurs.message ? (
            <p className="text-rose-600">{erreurs.message}</p>
          ) : (
            <span>&nbsp;</span>
          )}
          <span>{valeurs.message.length}/2000</span>
        </div>
      </div>

      <Button
        type="submit"
        disabled={envoi}
        className="w-full bg-gradient-to-br from-[#5257C9] to-[#0047c7] text-white hover:opacity-90"
      >
        {envoi ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            Envoi en cours…
          </>
        ) : (
          <>
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            Envoyer le message
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        En envoyant ce formulaire, vous acceptez d&apos;être recontacté par FeedbackPro. Vos données
        ne sont jamais partagées.
      </p>
    </form>
  )
}
