"use client"

// ============================================================
// FeedbackPro - Onglet "Paramètres" du dashboard Pro (pivot Zones)
// Sections :
//   (a) Informations de l'établissement  (b) Contact & alertes
//   (c) Coach IA (fréquence des rapports) (d) Expérience client (récompense)
//   (e) Logo  → PUT /api/pro/settings + updatePro
//   (f) Changement de plan (POST /api/pro/plan)
//   (g) Zone de danger (DELETE /api/pro/account, confirmation par saisie)
// ============================================================

import { useEffect, useRef, useState } from "react"
import { Save, Loader2, Check, Image as ImageIcon, Upload, TriangleAlert, Sparkles, Trash2, Gift } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { fileToLogoDataUrl } from "@/lib/image"
import { PLANS, TYPES_ETABLISSEMENT, planPriceLabel, PlanId } from "@/lib/constants"

// ProData finale (pivot Zones) — cast local pendant la migration du store
type ProFinal = {
  id: string
  nomEtablissement: string
  typeEtablissement: string
  adresse: string
  ville: string
  whatsapp: string | null
  email: string
  logoUrl: string | null
  plan: string
  frequenceRapport: string
  recompense: string | null
  messageWhatsapp: string | null
  onboardingDone: boolean
  suspendu: boolean
  smsAlertes: boolean
}

export function SettingsTab() {
  const session = useAppStore((s) => s.session)
  const setView = useAppStore((s) => s.setView)
  const updatePro = useAppStore((s) => s.updatePro)
  const logout = useAppStore((s) => s.logout)
  const { toast } = useToast()

  // Le Pro à jour vient de la session (le store est migré en parallèle par l'agent backend)
  const pro = (session?.pro ?? null) as unknown as ProFinal | null

  // ---------- (a) Informations de l'établissement ----------
  const [nomEtablissement, setNomEtablissement] = useState("")
  const [typeEtablissement, setTypeEtablissement] = useState("Restaurant")
  const [adresse, setAdresse] = useState("")
  const [ville, setVille] = useState("")

  // ---------- (b) Contact & alertes ----------
  const [whatsapp, setWhatsapp] = useState("")
  const [email, setEmail] = useState("")
  const [smsAlertes, setSmsAlertes] = useState(true)

  // ---------- (c) Coach IA ----------
  const [frequenceRapport, setFrequenceRapport] = useState("quotidien")

  // ---------- (d) Expérience client ----------
  // La micro-récompense est désormais configurée dans l'onglet dédié
  // « Récompenses » (/dashboard/recompenses — Session 3) : elle n'est plus
  // éditable ici pour éviter deux sources de vérité.
  const [messageWhatsapp, setMessageWhatsapp] = useState("")

  const [saving, setSaving] = useState(false)

  // ---------- (e) Logo ----------
  // logoActuel : dernière valeur enregistrée (pro.logoUrl)
  // logoModifie : undefined = inchangé · dataUrl = nouveau logo · null = suppression demandée
  const [logoActuel, setLogoActuel] = useState<string | null>(null)
  const [logoModifie, setLogoModifie] = useState<string | null | undefined>(undefined)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const logoAffiche = logoModifie === undefined ? logoActuel : logoModifie

  // ---------- (g) Zone de danger ----------
  const [confirmationSuppression, setConfirmationSuppression] = useState("")

  // Pré-remplissage depuis la session
  useEffect(() => {
    if (!pro) return
    setNomEtablissement(pro.nomEtablissement || "")
    // Correspondance insensible à la casse (données anciennes possiblement en minuscules)
    const typeActuel = pro.typeEtablissement || "Restaurant"
    const typeConnu = TYPES_ETABLISSEMENT.find((t) => t.toLowerCase() === typeActuel.toLowerCase())
    setTypeEtablissement(typeConnu ?? "Restaurant")
    setAdresse(pro.adresse || "")
    setVille(pro.ville || "")
    setWhatsapp(pro.whatsapp || "")
    setEmail(pro.email || "")
    setSmsAlertes(pro.smsAlertes !== false)
    setFrequenceRapport(pro.frequenceRapport === "hebdomadaire" ? "hebdomadaire" : "quotidien")
    setMessageWhatsapp(pro.messageWhatsapp || "Envoyé via FeedbackPro ✨")
    setLogoActuel(pro.logoUrl || null)
  }, [pro])

  // ---------- Enregistrement : PUT /api/pro/settings ----------
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      // logoUrl : absent = ne pas modifier · dataUrl = nouveau logo · null = suppression
      const payload: Record<string, string | null | boolean> = {
        nomEtablissement,
        typeEtablissement,
        adresse,
        ville,
        whatsapp,
        email,
        messageWhatsapp,
        frequenceRapport,
        smsAlertes,
      }
      if (logoModifie !== undefined) payload.logoUrl = logoModifie
      const res = await fetch("/api/pro/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.ok) {
        // session.pro (logoUrl inclus) devient la nouvelle source de vérité
        updatePro(json.data.pro)
        setLogoModifie(undefined)
        toast({ title: "Paramètres enregistrés ✓" })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // ---------- Logo : upload dataURL + preview ----------
  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Réinitialise l'input pour permettre de re-sélectionner le même fichier
    e.target.value = ""
    if (!file) return
    try {
      const dataUrl = await fileToLogoDataUrl(file)
      setLogoModifie(dataUrl)
      toast({ title: "Logo prêt — cliquez sur Enregistrer pour l'appliquer" })
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Impossible de charger le logo", variant: "destructive" })
    }
  }

  function retirerLogo() {
    setLogoModifie(null)
    toast({ title: "Logo retiré — cliquez sur Enregistrer pour l'appliquer" })
  }

  // ---------- (f) Changement de plan ----------
  const planActuel = ((pro?.plan as PlanId) || "STARTER") as PlanId
  const [planEnCours, setPlanEnCours] = useState<PlanId | null>(null)

  async function changerPlan(plan: PlanId) {
    if (plan === planActuel || planEnCours) return
    setPlanEnCours(plan)
    try {
      const res = await fetch("/api/pro/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json()
      if (json.ok) {
        updatePro(json.data.pro)
        toast({ title: `Plan ${PLANS[plan].name} activé 🎉`, description: "Paiement simulé (démo)." })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setPlanEnCours(null)
    }
  }

  // ---------- (g) Suppression du compte ----------
  async function supprimerCompte() {
    try {
      const res = await fetch("/api/pro/account", { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Compte supprimé", description: "Toutes vos données ont été effacées." })
        // Purge de la session du store (logout fait déjà POST /api/auth/logout +
        // remise à zéro ; si la session a été détruite côté serveur par la
        // suppression du compte, l'échec silencieux du POST est acceptable),
        // puis retour à la landing — sinon la session peuplée risquerait de
        // re-dériver vers le dashboard.
        await logout()
        setView("landing")
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ================= (a) Informations de l'établissement ================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Informations de l&apos;établissement</CardTitle>
          <CardDescription>Ces informations apparaissent sur la page de scan de vos clients</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="st-nom">Nom de l&apos;établissement</Label>
                <Input id="st-nom" value={nomEtablissement} onChange={(e) => setNomEtablissement(e.target.value)} className="h-10" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-type">Type d&apos;établissement</Label>
                {/* Guard : ignore la valeur "" émise par le select natif caché de Radix
                    (Select dans <form> → BubbleSelect → onChange parasite) */}
                <Select value={typeEtablissement} onValueChange={(v) => { if (v) setTypeEtablissement(v) }}>
                  <SelectTrigger id="st-type" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_ETABLISSEMENT.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-adr">Adresse</Label>
                <Input id="st-adr" value={adresse} onChange={(e) => setAdresse(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-ville">Ville</Label>
                <Input id="st-ville" value={ville} onChange={(e) => setVille(e.target.value)} className="h-10" />
              </div>
            </div>

            {/* ================= (b) Contact & alertes ================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="st-wa">WhatsApp (alertes + retours)</Label>
                <Input
                  id="st-wa"
                  type="tel"
                  inputMode="numeric"
                  placeholder="33612345678"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">Format international, sans « + » ni espaces (ex : 33612345678).</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-email">Email</Label>
                <Input id="st-email" type="email" placeholder="vous@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
                <p className="text-xs text-muted-foreground">Pour recevoir vos rapports IA.</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
              <div className="min-w-0">
                <Label htmlFor="st-sms" className="cursor-pointer">Alertes SMS pour les réclamations (≤ 2★)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Envoie un SMS urgent pour chaque retour ≤ 2★. Si désactivé, une alerte email est envoyée à la place.
                </p>
              </div>
              <Switch
                id="st-sms"
                checked={smsAlertes}
                onCheckedChange={setSmsAlertes}
                aria-label="Activer ou désactiver les alertes SMS"
              />
            </div>

            {/* ================= (c) Coach IA ================= */}
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="st-freq" className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Fréquence des rapports IA (Coach)
              </Label>
              <Select value={frequenceRapport} onValueChange={(v) => { if (v) setFrequenceRapport(v) }}>
                <SelectTrigger id="st-freq" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quotidien">Quotidien — vos 3 priorités du jour chaque matin</SelectItem>
                  <SelectItem value="hebdomadaire">Hebdomadaire — synthèse complète chaque lundi</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Le Coach IA analyse vos retours et vous envoie un audit qualité par email, avec les actions recommandées.
              </p>
            </div>

            {/* ================= (d) Expérience client ================= */}
            <div className="grid grid-cols-1 gap-4 pt-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Micro-récompense client</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Café offert, réduction, code promo… se configure désormais dans l&apos;onglet
                    dédié « Récompenses ».
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    window.location.href = "/dashboard/recompenses"
                  }}
                >
                  <Gift className="mr-1.5 h-4 w-4" aria-hidden />
                  Configurer
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-msg">Message WhatsApp personnalisé (fin de message)</Label>
                <Textarea id="st-msg" value={messageWhatsapp} onChange={(e) => setMessageWhatsapp(e.target.value)} rows={2} />
              </div>
            </div>

            <Button type="submit" disabled={saving} className="h-10">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
              Enregistrer les modifications
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ================= (e) Logo de l'établissement ================= */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ImageIcon className="h-5 w-5 text-primary" aria-hidden />
            Logo de l&apos;établissement
          </CardTitle>
          <CardDescription>Affiché sur la page de scan et vos supports imprimés.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {logoAffiche ? (
              <img
                src={logoAffiche}
                alt={logoModifie === undefined ? "Logo actuel" : "Nouveau logo (en attente d'enregistrement)"}
                className="h-16 w-16 shrink-0 rounded-xl border object-cover"
              />
            ) : (
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted"
                role="img"
                aria-label="Aucun logo"
              >
                <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden />
              </span>
            )}
            <div className="min-w-0 space-y-2">
              {!logoAffiche && <p className="text-sm text-muted-foreground">Aucun logo</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" aria-hidden />
                  Choisir un logo
                </Button>
                {logoAffiche && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={retirerLogo}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                    Retirer le logo
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP — redimensionné automatiquement en 256px.</p>
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onLogoChange}
            aria-label="Choisir un logo"
          />
        </CardContent>
      </Card>

      {/* ================= (f) Changement de plan ================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Changement de plan</CardTitle>
          <CardDescription>Changement immédiat — paiement sécurisé (démo)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id]
            const actuel = planActuel === id
            return (
              <div key={id} className={`relative flex flex-col rounded-xl border p-4 ${actuel ? "border-primary ring-1 ring-primary" : ""}`}>
                {actuel && (
                  <Badge className="absolute -top-2.5 left-3 h-5 px-1.5 text-[10px]">
                    <Check className="mr-0.5 h-3 w-3" aria-hidden /> Plan actuel
                  </Badge>
                )}
                <p className="font-semibold">{p.name}</p>
                <p className="mt-0.5 text-2xl font-bold">
                  {planPriceLabel(p.price)}
                  {p.price > 0 && <span className="text-sm font-normal text-muted-foreground">/mois</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground flex-1">{p.tagline}</p>
                <ul className="mt-2.5 space-y-1.5 text-xs">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                {!actuel && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={planEnCours !== null}
                    onClick={() => changerPlan(id)}
                  >
                    {planEnCours === id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    Choisir {p.name}
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ================= (g) Zone de danger ================= */}
      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-rose-600">
            <TriangleAlert className="h-5 w-5" aria-hidden />
            Zone de danger
          </CardTitle>
          <CardDescription>Actions irréversibles — procédez avec précaution.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 rounded-xl border border-rose-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm">Supprimer définitivement le compte</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cette action supprime irrémédiablement votre établissement, toutes vos zones, vos retours clients, votre
                équipe et vos QR codes. Aucune récupération n&apos;est possible.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  Supprimer mon compte
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer définitivement votre compte ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Votre établissement, toutes vos zones, vos retours clients, votre équipe et vos QR codes seront
                    supprimés irrémédiablement. Pour confirmer, saisissez le nom de votre établissement :
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={confirmationSuppression}
                  onChange={(e) => setConfirmationSuppression(e.target.value)}
                  placeholder={pro?.nomEtablissement || "Nom de l'établissement"}
                  aria-label="Confirmation : nom de l'établissement"
                  autoComplete="off"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmationSuppression("")}>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!pro || confirmationSuppression !== pro.nomEtablissement}
                    className="bg-rose-600 hover:bg-rose-700"
                    onClick={supprimerCompte}
                  >
                    Supprimer définitivement
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
