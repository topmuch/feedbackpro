"use client"

// ============================================================
// FeedbackPro - Onglet "Paramètres" du dashboard Pro
// Infos boutique, WhatsApp, gestion des employés, plan d'abonnement
// ============================================================

import { useEffect, useRef, useState } from "react"
import { Save, Loader2, Plus, Trash2, UserRound, Check, Image as ImageIcon, Upload, TriangleAlert } from "lucide-react"
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
import { CATEGORIES_COMMERCE, PLANS, PLAN_LIMITS, planPriceLabel, PlanId } from "@/lib/constants"

type Employe = {
  id: string
  nom: string
  poste: string | null
  actif: boolean
  nbRetours: number
  noteMoyenne: number
}

export function SettingsTab() {
  const session = useAppStore((s) => s.session)
  const updatePro = useAppStore((s) => s.updatePro)
  const { toast } = useToast()

  // ---------- Paramètres boutique ----------
  const [nomCommerce, setNomCommerce] = useState("")
  const [categorie, setCategorie] = useState("Restaurant")
  const [adresse, setAdresse] = useState("")
  const [ville, setVille] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [googleUrl, setGoogleUrl] = useState("")
  const [messageWhatsapp, setMessageWhatsapp] = useState("")
  const [saving, setSaving] = useState(false)

  // ---------- Logo ----------
  // logoActuel : dernière valeur enregistrée (session.pro.logoUrl)
  // logoModifie : undefined = inchangé · dataUrl = nouveau logo · null = suppression demandée
  const [logoActuel, setLogoActuel] = useState<string | null>(null)
  const [logoModifie, setLogoModifie] = useState<string | null | undefined>(undefined)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const logoAffiche = logoModifie === undefined ? logoActuel : logoModifie

  // ---------- Zone dangereuse ----------
  const [confirmationSuppression, setConfirmationSuppression] = useState("")

  // ---------- Employés ----------
  const [employes, setEmployes] = useState<Employe[]>([])
  const [nouveauNom, setNouveauNom] = useState("")
  const [nouveauPoste, setNouveauPoste] = useState("")
  const [addingEmploye, setAddingEmploye] = useState(false)

  useEffect(() => {
    if (session?.pro) {
      const p = session.pro
      setNomCommerce(p.nomCommerce || "")
      setCategorie(p.categorie || "Restaurant")
      setAdresse(p.adresse || "")
      setVille(p.ville || "")
      setWhatsapp(p.whatsapp || "")
      setGoogleUrl(p.googleUrl || "")
      setMessageWhatsapp(p.messageWhatsapp || "Envoyé via FeedbackPro ✨")
      setLogoActuel(p.logoUrl || null)
    }
  }, [session?.pro])

  async function loadEmployes() {
    try {
      const res = await fetch("/api/pro/employes", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setEmployes(json.data.employes)
    } catch {
      /* silencieux */
    }
  }

  useEffect(() => {
    loadEmployes()
  }, [])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      // logoUrl : undefined (absent) = ne pas modifier · dataUrl = nouveau logo · null = suppression
      const payload: Record<string, string | null> = { nomCommerce, categorie, adresse, ville, whatsapp, googleUrl, messageWhatsapp }
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

  async function supprimerCompte() {
    try {
      const res = await fetch("/api/pro/account", { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Compte supprimé" })
        await useAppStore.getState().logout()
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    }
  }

  async function ajouterEmploye(e: React.FormEvent) {
    e.preventDefault()
    if (nouveauNom.trim().length < 2) return
    setAddingEmploye(true)
    try {
      const res = await fetch("/api/pro/employes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nouveauNom.trim(), poste: nouveauPoste.trim() || null }),
      })
      const json = await res.json()
      if (json.ok) {
        setEmployes(json.data.employes)
        setNouveauNom("")
        setNouveauPoste("")
        toast({ title: "Employé ajouté ✓" })
      } else {
        toast({ title: "Limite atteinte", description: json.error, variant: "destructive" })
      }
    } finally {
      setAddingEmploye(false)
    }
  }

  async function toggleEmploye(emp: Employe) {
    const res = await fetch("/api/pro/employes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id, actif: !emp.actif }),
    })
    const json = await res.json()
    if (json.ok) setEmployes(json.data.employes)
  }

  async function supprimerEmploye(id: string) {
    const res = await fetch(`/api/pro/employes?id=${id}`, { method: "DELETE" })
    const json = await res.json()
    if (json.ok) {
      setEmployes(json.data.employes)
      toast({ title: "Employé supprimé", description: "Son historique de retours est conservé." })
    }
  }

  const planActuel = (session?.pro?.plan || "STARTER") as PlanId

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ---------- Infos boutique ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Informations de la boutique</CardTitle>
          <CardDescription>Ces informations apparaissent sur la page de scan de vos clients</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="st-nom">Nom du commerce</Label>
                <Input id="st-nom" value={nomCommerce} onChange={(e) => setNomCommerce(e.target.value)} className="h-10" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-cat">Catégorie</Label>
                {/* Guard : ignore la valeur "" émise par le select natif caché de Radix
                    (Select dans <form> → BubbleSelect → onChange parasite) */}
                <Select value={categorie} onValueChange={(v) => { if (v) setCategorie(v) }}>
                  <SelectTrigger id="st-cat" className="h-10">
                    <SelectValue />
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
                <Label htmlFor="st-adr">Adresse</Label>
                <Input id="st-adr" value={adresse} onChange={(e) => setAdresse(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-ville">Ville</Label>
                <Input id="st-ville" value={ville} onChange={(e) => setVille(e.target.value)} className="h-10" />
              </div>
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-gg">Lien Google (avis)</Label>
                <Input id="st-gg" type="url" placeholder="https://g.page/r/..." value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-msg">Message WhatsApp personnalisé (fin de message)</Label>
              <Textarea id="st-msg" value={messageWhatsapp} onChange={(e) => setMessageWhatsapp(e.target.value)} rows={2} />
            </div>
            <Button type="submit" disabled={saving} className="h-10">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ---------- Logo de la boutique ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ImageIcon className="h-5 w-5 text-primary" aria-hidden />
            Logo de la boutique
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
                <UserRound className="h-7 w-7 text-muted-foreground" aria-hidden />
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

      {/* ---------- Employés ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Employés</CardTitle>
          <CardDescription>
            {employes.filter((e) => e.actif).length} actif(s) — limite du plan {PLANS[planActuel].name} :{" "}
            {PLAN_LIMITS[planActuel].employes === 999 ? "illimité" : PLAN_LIMITS[planActuel].employes}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ajout */}
          <form onSubmit={ajouterEmploye} className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nom de l'employé"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              className="h-10 flex-1"
              aria-label="Nom du nouvel employé"
            />
            <Input
              placeholder="Poste (optionnel)"
              value={nouveauPoste}
              onChange={(e) => setNouveauPoste(e.target.value)}
              className="h-10 flex-1"
              aria-label="Poste du nouvel employé"
            />
            <Button type="submit" className="h-10" disabled={addingEmploye || nouveauNom.trim().length < 2}>
              {addingEmploye ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-1.5 h-4 w-4" aria-hidden />}
              Ajouter
            </Button>
          </form>

          {/* Liste */}
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {employes.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun employé — ajoutez votre équipe pour activer le leaderboard (les clients pourront mentionner qui les a servi).
              </p>
            )}
            {employes.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden>
                    <UserRound className="h-4.5 w-4.5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {e.nom} {e.nbRetours > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({e.nbRetours} retours)</span>}
                    </p>
                    {e.poste && <p className="text-xs text-muted-foreground truncate">{e.poste}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={e.actif ? "text-green-700 border-green-300" : "text-stone-500"}>
                    {e.actif ? "Actif" : "Inactif"}
                  </Badge>
                  <Switch checked={e.actif} onCheckedChange={() => toggleEmploye(e)} aria-label={`Activer/désactiver ${e.nom}`} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50" aria-label={`Supprimer ${e.nom}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer {e.nom} ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          L&apos;employé sera retiré de votre équipe. Les retours le concernant seront conservés mais
                          désassociés de son profil.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => supprimerEmploye(e.id)} className="bg-rose-600 hover:bg-rose-700">
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Plan d'abonnement ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Abonnement</CardTitle>
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
                    onClick={async () => {
                      const res = await fetch("/api/pro/plan", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ plan: id }),
                      })
                      const json = await res.json()
                      if (json.ok) {
                        updatePro(json.data.pro)
                        toast({ title: `Plan ${p.name} activé 🎉` })
                      } else {
                        toast({ title: "Erreur", description: json.error, variant: "destructive" })
                      }
                    }}
                  >
                    Choisir {p.name}
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ---------- Zone dangereuse ---------- */}
      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-rose-600">
            <TriangleAlert className="h-5 w-5" aria-hidden />
            Zone dangereuse
          </CardTitle>
          <CardDescription>Actions irréversibles — procédez avec précaution.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 rounded-xl border border-rose-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm">Supprimer définitivement le compte</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cette action supprime irrémédiablement votre boutique, tous vos retours clients, votre équipe et vos QR
                codes. Aucune récupération n&apos;est possible.
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
                    Votre boutique, tous vos retours clients, votre équipe et vos QR codes seront supprimés
                    irrémédiablement. Aucune récupération n&apos;est possible. Pour confirmer, saisissez le nom de votre
                    commerce :
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={confirmationSuppression}
                  onChange={(e) => setConfirmationSuppression(e.target.value)}
                  placeholder={session?.pro?.nomCommerce || "Nom du commerce"}
                  aria-label="Confirmation : nom du commerce"
                  autoComplete="off"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmationSuppression("")}>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={confirmationSuppression !== (session?.pro?.nomCommerce || "")}
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
