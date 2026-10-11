"use client"

// ============================================================
// FeedbackPro - Onboarding commerçant en 3 étapes
// 1. Infos boutique → 2. WhatsApp & alertes → 3. Premier QR Code
// ============================================================

import { useEffect, useRef, useState } from "react"
import { Loader2, Store, BellRing, QrCode, CheckCircle2, ArrowRight, ArrowLeft, Copy, ImagePlus, Trash2 } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppStore } from "@/store/app-store"
import { CATEGORIES_COMMERCE } from "@/lib/constants"
import { fileToLogoDataUrl } from "@/lib/image"
import { onboardingSchema, fieldErrors } from "@/lib/validation"

export function OnboardingView() {
  const session = useAppStore((s) => s.session)
  const updatePro = useAppStore((s) => s.updatePro)
  const refreshSession = useAppStore((s) => s.refreshSession)

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Champs du formulaire
  const [nomCommerce, setNomCommerce] = useState("")
  const [categorie, setCategorie] = useState("Restaurant")
  const [adresse, setAdresse] = useState("")
  const [ville, setVille] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [googleUrl, setGoogleUrl] = useState("")

  // Logo (étape 3, optionnel) — data URL redimensionnée côté client
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Erreurs de validation par champ (zod, messages partagés client/serveur)
  const [champErreurs, setChampErreurs] = useState<Record<string, string>>({})

  function clearChamp(champ: string) {
    setChampErreurs((prev) => {
      if (!prev[champ]) return prev
      const next = { ...prev }
      delete next[champ]
      return next
    })
  }

  // QR (étape 3)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [scanUrl, setScanUrl] = useState("")
  const [copied, setCopied] = useState(false)

  // Pré-remplissage depuis la session
  useEffect(() => {
    if (session?.pro) {
      setNomCommerce(session.pro.nomCommerce || "")
      setCategorie(session.pro.categorie || "Restaurant")
      setAdresse(session.pro.adresse || "")
      setVille(session.pro.ville || "")
      setWhatsapp(session.pro.whatsapp || "")
      setGoogleUrl(session.pro.googleUrl || "")
    }
  }, [session?.pro])

  // Charge le QR code pour l'étape 3
  useEffect(() => {
    if (step === 3 && !qrDataUrl) {
      fetch("/api/pro/qrcode")
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) {
            setQrDataUrl(j.data.dataUrl)
            setScanUrl(j.data.scanUrl)
          }
        })
        .catch(() => setError("Impossible de générer le QR code"))
    }
  }, [step, qrDataUrl])

  const [finishing, setFinishing] = useState(false)

  /** Étape 1 → 2 puis 2 → 3 : enregistrement des infos (sans finaliser) */
  async function saveInfos(finaliser: boolean) {
    setError(null)
    setSaving(true)
    try {
      // WhatsApp / Google ne sont envoyés que s'ils sont renseignés
      // (étape 1 = infos boutique uniquement)
      const payload: Record<string, unknown> = {
        nomCommerce,
        categorie,
        adresse,
        ville,
        onboardingDone: finaliser,
      }
      if (whatsapp) payload.whatsapp = whatsapp
      // "" explicite = effacer le lien Google côté serveur (sinon conservé)
      payload.googleUrl = googleUrl
      // Logo transmis uniquement à la finalisation (s'il a été choisi)
      if (finaliser && logoDataUrl) payload.logoUrl = logoDataUrl

      const res = await fetch("/api/pro/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || "Erreur lors de l'enregistrement")
        return false
      }
      if (finaliser) {
        // Termine l'onboarding : mise à jour de la session → bascule vers le dashboard
        setFinishing(true)
        await refreshSession()
      } else {
        updatePro(json.data.pro)
      }
      return true
    } catch {
      setError("Impossible de contacter le serveur")
      return false
    } finally {
      setSaving(false)
    }
  }

  // ---------- Validation zod côté client (mêmes messages que le serveur) ----------

  function validerEtape1(): boolean {
    const schema = onboardingSchema.pick({ nomCommerce: true, categorie: true, adresse: true, ville: true })
    const parsed = schema.safeParse({ nomCommerce, categorie, adresse, ville })
    if (!parsed.success) {
      setChampErreurs(fieldErrors(parsed.error))
      return false
    }
    setChampErreurs({})
    return true
  }

  function validerEtape2(): boolean {
    // WhatsApp obligatoire à cette étape (nécessaire pour les alertes et la finalisation)
    const schema = z.object({
      whatsapp: z.string().regex(/^\d{8,15}$/, "Numéro WhatsApp invalide (format international : 33612345678)"),
      googleUrl: z.union([z.url("Lien Google invalide"), z.literal("")]),
    })
    const parsed = schema.safeParse({ whatsapp: whatsapp.replace(/[^0-9]/g, ""), googleUrl })
    if (!parsed.success) {
      setChampErreurs(fieldErrors(parsed.error))
      return false
    }
    setChampErreurs({})
    return true
  }

  async function nextFromStep1(e: React.FormEvent) {
    e.preventDefault()
    if (validerEtape1() && (await saveInfos(false))) setStep(2)
  }

  async function nextFromStep2(e: React.FormEvent) {
    e.preventDefault()
    if (validerEtape2() && (await saveInfos(false))) setStep(3)
  }

  // ---------- Logo (étape 3) ----------

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // permet de re-sélectionner le même fichier
    if (!file) return
    setLogoError(null)
    setLogoLoading(true)
    try {
      setLogoDataUrl(await fileToLogoDataUrl(file))
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Impossible de charger le logo")
    } finally {
      setLogoLoading(false)
    }
  }

  function copyUrl() {
    navigator.clipboard?.writeText(scanUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const etapes = [
    { n: 1, label: "Boutique", icon: Store },
    { n: 2, label: "Alertes WhatsApp", icon: BellRing },
    { n: 3, label: "Votre QR Code", icon: QrCode },
  ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bienvenue sur FeedbackPro 👋</h1>
        <p className="text-muted-foreground mt-1.5">3 étapes rapides pour recevoir votre premier retour client</p>
      </div>

      {/* Indicateur d'étapes */}
      <ol
        className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 sm:gap-4 mb-8"
        aria-label="Progression"
      >
        {etapes.map((e, i) => {
          const actif = step === e.n
          const fait = step > e.n
          const Icon = e.icon
          return (
            <li key={e.n} className="flex items-center gap-1.5 sm:gap-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    fait ? "bg-primary text-primary-foreground" : actif ? "bg-primary/15 text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {fait ? <CheckCircle2 className="h-4.5 w-4.5" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                </span>
                <span className={`text-[11px] sm:text-sm font-medium ${actif ? "text-foreground" : "text-muted-foreground"}`}>
                  {e.label}
                </span>
              </div>
              {i < etapes.length - 1 && <div className={`hidden sm:block h-px w-8 ${step > e.n ? "bg-primary" : "bg-border"}`} aria-hidden />}
            </li>
          )
        })}
      </ol>

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {/* ---------- Étape 1 : infos boutique ---------- */}
      {step === 1 && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <form onSubmit={nextFromStep1} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ob-nom">Nom du commerce</Label>
                <Input
                  id="ob-nom"
                  value={nomCommerce}
                  onChange={(e) => {
                    setNomCommerce(e.target.value)
                    clearChamp("nomCommerce")
                  }}
                  className="h-11"
                  aria-invalid={!!champErreurs.nomCommerce}
                />
                {champErreurs.nomCommerce && (
                  <p className="text-xs text-rose-600" role="alert">{champErreurs.nomCommerce}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-cat">Catégorie</Label>
                {/* Guard : ignore la valeur "" émise par le select natif caché de Radix
                    (Select dans <form> → BubbleSelect → onChange parasite) */}
                <Select value={categorie} onValueChange={(v) => { if (v) setCategorie(v) }}>
                  <SelectTrigger id="ob-cat" className="h-11">
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES_COMMERCE.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-adr">Adresse</Label>
                <Input
                  id="ob-adr"
                  placeholder="12 rue de la République"
                  value={adresse}
                  onChange={(e) => {
                    setAdresse(e.target.value)
                    clearChamp("adresse")
                  }}
                  className="h-11"
                  aria-invalid={!!champErreurs.adresse}
                />
                {champErreurs.adresse && <p className="text-xs text-rose-600" role="alert">{champErreurs.adresse}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-ville">Ville</Label>
                <Input
                  id="ob-ville"
                  placeholder="Lyon"
                  value={ville}
                  onChange={(e) => {
                    setVille(e.target.value)
                    clearChamp("ville")
                  }}
                  className="h-11"
                  aria-invalid={!!champErreurs.ville}
                />
                {champErreurs.ville && <p className="text-xs text-rose-600" role="alert">{champErreurs.ville}</p>}
              </div>
              <Button type="submit" className="w-full h-11 text-base" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="mr-2 h-4 w-4" aria-hidden />}
                Continuer
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---------- Étape 2 : WhatsApp & alertes ---------- */}
      {step === 2 && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <form onSubmit={nextFromStep2} className="space-y-4">
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5 text-sm">
                <p className="font-medium text-blue-800 mb-1">Pourquoi votre numéro WhatsApp ?</p>
                <p className="text-blue-700">
                  Chaque retour client vous est envoyé en message pré-rempli. En cas de réclamation (note ≤ 2), une
                  alerte vous est transmise immédiatement : vous pouvez intervenir avant que l&apos;avis ne parte en ligne.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-wa">Numéro WhatsApp (format international)</Label>
                <Input
                  id="ob-wa"
                  type="tel"
                  placeholder="33612345678"
                  value={whatsapp}
                  onChange={(e) => {
                    setWhatsapp(e.target.value)
                    clearChamp("whatsapp")
                  }}
                  className="h-11"
                  inputMode="numeric"
                  aria-invalid={!!champErreurs.whatsapp}
                />
                <p className="text-xs text-muted-foreground">Sans espaces ni +, ex : 33612345678</p>
                {champErreurs.whatsapp && (
                  <p className="text-xs text-rose-600" role="alert">{champErreurs.whatsapp}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-google">Lien Google (optionnel)</Label>
                <Input
                  id="ob-google"
                  type="url"
                  placeholder="https://g.page/r/..."
                  value={googleUrl}
                  onChange={(e) => {
                    setGoogleUrl(e.target.value)
                    clearChamp("googleUrl")
                  }}
                  className="h-11"
                  aria-invalid={!!champErreurs.googleUrl}
                />
                <p className="text-xs text-muted-foreground">
                  Les clients satisfaits (4-5★) pourront — sur simple clic facultatif — partager leur avis sur Google.
                </p>
                {champErreurs.googleUrl && (
                  <p className="text-xs text-rose-600" role="alert">{champErreurs.googleUrl}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Retour
                </Button>
                <Button type="submit" className="flex-1 h-11 text-base" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="mr-2 h-4 w-4" aria-hidden />}
                  Continuer
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---------- Étape 3 : QR Code ---------- */}
      {step === 3 && (
        <Card>
          <CardContent className="p-5 sm:p-6 text-center">
            <h2 className="text-lg font-semibold">Votre QR Code est prêt ! 🎉</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Il pointe vers votre page de notation personnalisée. Imprimez-le et posez-le en caisse ou en vitrine.
            </p>

            {/* ---------- Logo (optionnel) ---------- */}
            <div className="mt-5 flex flex-col items-center gap-2">
              {logoDataUrl ? (
                <div className="relative">
                  <img
                    src={logoDataUrl}
                    alt="Logo de votre commerce"
                    className="size-20 rounded-2xl border bg-white object-contain p-1"
                  />
                  <button
                    type="button"
                    onClick={() => setLogoDataUrl(null)}
                    aria-label="Supprimer le logo"
                    className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-rose-500 text-white shadow-md transition-colors hover:bg-rose-600"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoLoading}
                  aria-label="Ajouter un logo (optionnel)"
                  className="flex size-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                >
                  {logoLoading ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="size-5" aria-hidden />
                  )}
                  <span className="text-[10px] font-medium">Logo</span>
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                {logoDataUrl
                  ? "Votre logo apparaîtra sur la page de scan de vos clients"
                  : "Ajoutez votre logo (optionnel) — PNG, JPEG ou WebP"}
              </p>
              {logoError && (
                <p className="text-xs text-rose-600" role="alert">{logoError}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onLogoChange}
              />
            </div>

            <div className="mx-auto mt-5 w-full max-w-56 rounded-2xl border-2 border-primary/20 bg-white p-3 shadow-sm">
              {qrDataUrl ? (
                 
                <img src={qrDataUrl} alt={`QR Code de ${nomCommerce}`} className="w-full rounded-lg" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
                </div>
              )}
              <p className="mt-2 text-xs font-semibold text-primary uppercase tracking-wide">Votre avis compte</p>
              <p className="text-xs text-muted-foreground truncate">{nomCommerce}</p>
            </div>

            {scanUrl && (
              <button
                type="button"
                onClick={copyUrl}
                className="mx-auto mt-4 flex max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors"
                aria-label="Copier le lien de scan"
              >
                <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{scanUrl}</span>
                <span className="shrink-0 font-medium text-primary">{copied ? "Copié ✓" : "Copier"}</span>
              </button>
            )}

            <div className="mt-6">
              <Button className="w-full h-12 text-base" onClick={() => saveInfos(true)} disabled={saving || finishing}>
                {saving || finishing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                )}
                Terminer et ouvrir mon dashboard
              </Button>
              <Button variant="ghost" className="mt-2" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Retour
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
