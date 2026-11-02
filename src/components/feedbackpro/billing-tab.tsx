"use client"

// ============================================================
// FeedbackPro - Onglet "Facturation" du dashboard Pro (Coach IA)
// ------------------------------------------------------------
// - Plan actuel (badge) + grille comparative des 3 plans
//   (PLANS 29€ / 99€ / 249€ de src/lib/constants.ts)
// - Changement de plan via POST /api/pro/billing/checkout :
//   · Stripe configuré → redirection vers la Checkout Session
//   · Sans clés (mode démo) → paiement simulé via POST /api/pro/plan
//   · Starter étant gratuit, le downgrade appelle /api/pro/plan direct
// - Historique des factures : commandes du Pro (GET /api/pro/commandes)
// ============================================================

import { useEffect, useState } from "react"
import { CreditCard, Check, Loader2, Receipt, ShieldCheck, Lock, Settings2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { PLANS, STATUT_COMMANDE_LABEL, SUPPORTS, type PlanId } from "@/lib/constants"

// ---------- Toggle Mensuel / Annuel ----------

type PeriodeFacturation = "mensuel" | "annuel"

/** Rabais annuel de 20 % appliqué sur le prix mensuel (arrondi à l'entier le plus proche). */
function prixAnnuel(prixMensuel: number): number {
  return Math.round(prixMensuel * 0.8)
}

/** Prix affiché pour un plan selon la période choisie (annuel = -20 %). */
function prixAffiche(prixMensuel: number, periode: PeriodeFacturation): number {
  return periode === "annuel" ? prixAnnuel(prixMensuel) : prixMensuel
}

// ---------- Types locaux ----------

type Commande = {
  id: string
  typeSupport: string
  quantite: number
  prixEuros: number
  statut: string
  createdAt: string
}

/** Couleur du badge selon le statut de la commande */
function classeStatut(statut: string): string {
  switch (statut) {
    case "A_IMPRIMER":
      return "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300"
    case "IMPRIME":
      return "border-primary/30 bg-primary/5 text-primary hover:bg-primary/5"
    case "EXPEDIE":
      return "border-border bg-muted text-muted-foreground hover:bg-muted"
    case "LIVRE":
      return "border-green-300 bg-green-50 text-green-800 hover:bg-green-50 dark:bg-green-950/40 dark:text-green-300"
    default:
      return ""
  }
}

export function BillingTab() {
  const session = useAppStore((s) => s.session)
  const updatePro = useAppStore((s) => s.updatePro)
  const refreshSession = useAppStore((s) => s.refreshSession)
  const { toast } = useToast()

  const planActuel = ((session?.pro?.plan as PlanId) || "STARTER") as PlanId

  // ---------- Période de facturation (toggle Mensuel / Annuel -20 %) ----------
  const [periode, setPeriode] = useState<PeriodeFacturation>("mensuel")

  // ---------- Factures (commandes de supports) ----------
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [chargementFactures, setChargementFactures] = useState(true)

  // ---------- Changement de plan ----------
  const [planEnCours, setPlanEnCours] = useState<PlanId | null>(null)

  // ---------- Portail client Stripe (Customer Portal) ----------
  const [portailEnCours, setPortailEnCours] = useState(false)

  /**
   * Ouvre le portail de facturation Stripe (moyens de paiement, factures,
   * résiliation). Sans clés Stripe : message explicite, aucune redirection.
   */
  async function ouvrirPortail() {
    if (portailEnCours) return
    setPortailEnCours(true)
    try {
      const res = await fetch("/api/pro/billing/portal", { method: "POST" })
      const json = await res.json()
      if (!json.ok) {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
        return
      }
      if (json.data?.url) {
        window.location.href = json.data.url as string
        return
      }
      toast({
        title: "Mode démo : Stripe sera activé avec vos clés",
        description:
          "Le portail client (moyens de paiement, factures, résiliation) s'ouvrira ici dès que vos clés Stripe seront configurées.",
      })
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setPortailEnCours(false)
    }
  }

  useEffect(() => {
    async function charger() {
      try {
        const res = await fetch("/api/pro/commandes", { cache: "no-store" })
        const json = await res.json()
        if (json.ok) setCommandes(json.data.commandes)
      } catch {
        /* silencieux : liste simplement vide */
      } finally {
        setChargementFactures(false)
      }
    }
    charger()
  }, [])

  // Retour de la Checkout Stripe : /dashboard/billing?paiement=succes
  // (rewrité en /?tab=billing&paiement=succes par next.config)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get("paiement") === "succes") {
        toast({
          title: "Paiement confirmé 🎉",
          description: "Votre abonnement a été mis à jour. Bienvenue à bord !",
        })
        // Nettoie l'URL et resynchronise la session (le webhook a déjà mis à jour le plan)
        params.delete("paiement")
        const qs = params.toString()
        window.history.replaceState({}, "", "/dashboard/billing" + (qs ? `?${qs}` : ""))
        void refreshSession()
      }
    } catch {
      /* ignore */
    }
  }, [])

  /** Applique le plan en base (paiement simulé / downgrade gratuit) */
  async function appliquerPlan(plan: PlanId) {
    const res = await fetch("/api/pro/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    })
    const json = await res.json()
    if (json.ok) {
      updatePro(json.data.pro)
      toast({ title: `Plan ${PLANS[plan as PlanId].name} activé ✓` })
    } else {
      toast({ title: "Erreur", description: json.error, variant: "destructive" })
    }
  }

  /**
   * Flux de changement de plan :
   * 1. Starter (gratuit) → changement direct, sans paiement
   * 2. Plans payants → POST /api/pro/billing/checkout :
   *    · data.url (Stripe actif) → redirection Checkout Session
   *    · data.mode "DEMO" (sans clés) → paiement simulé + toast explicite
   */
  async function changerPlan(plan: PlanId) {
    if (plan === planActuel || planEnCours) return
    setPlanEnCours(plan)
    try {
      if (plan === "STARTER") {
        await appliquerPlan(plan)
        return
      }

      const res = await fetch("/api/pro/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json()

      if (!json.ok) {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
        return
      }

      if (json.data?.url) {
        // Stripe actif : redirection vers la page de paiement hébergée
        window.location.href = json.data.url as string
        return
      }

      // Mode démo : Stripe sera activé avec les clés du commerçant
      toast({
        title: "Mode démo : Stripe sera activé avec vos clés",
        description: `Le plan ${PLANS[plan].name} est appliqué localement, sans prélèvement réel.`,
      })
      await appliquerPlan(plan)
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setPlanEnCours(null)
    }
  }

  const planActuelDef = PLANS[planActuel] ?? PLANS.STARTER

  return (
    <div className="space-y-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez votre abonnement au Coach IA et consultez vos factures.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
            <CreditCard className="h-3.5 w-3.5" aria-hidden />
            Plan actuel : {planActuelDef.name}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={ouvrirPortail}
            disabled={portailEnCours}
            aria-label="Gérer mon abonnement via le portail Stripe"
          >
            {portailEnCours ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Settings2 className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            Gérer mon abonnement
          </Button>
        </div>
      </div>

      {/* ---------- Toggle Mensuel / Annuel (-20 %) ---------- */}
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        <div
          className="inline-flex items-center rounded-lg border bg-muted/40 p-1"
          role="tablist"
          aria-label="Période de facturation"
        >
          <button
            type="button"
            role="tab"
            aria-selected={periode === "mensuel"}
            onClick={() => setPeriode("mensuel")}
            className={
              "h-9 rounded-md px-4 text-sm font-medium transition-colors " +
              (periode === "mensuel"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            Mensuel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={periode === "annuel"}
            onClick={() => setPeriode("annuel")}
            className={
              "h-9 rounded-md px-4 text-sm font-medium transition-colors " +
              (periode === "annuel"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            Annuel
            <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
              -20 %
            </span>
          </button>
        </div>
        {periode === "annuel" && (
          <p className="text-xs text-muted-foreground">
            Facturé annuellement — économisez jusqu&apos;à{" "}
            <span className="font-semibold text-foreground">60 €/an</span> sur le plan Enterprise.
          </p>
        )}
      </div>

      {/* ---------- Grille comparative des plans (29 / 99 / 249 €) ---------- */}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id]
          const estActuel = id === planActuel
          const estSuperieur = p.price > planActuelDef.price
          const prix = prixAffiche(p.price, periode)
          return (
            <Card
              key={id}
              className={
                estActuel
                  ? "border-primary shadow-sm ring-1 ring-primary"
                  : "shadow-sm transition-shadow hover:shadow-md"
              }
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {estActuel && <Badge className="bg-primary text-primary-foreground hover:bg-primary">Plan actuel</Badge>}
                </div>
                <CardDescription className="pt-1">{p.tagline}</CardDescription>
                <p className="pt-2 text-2xl font-bold tracking-tight">
                  {prix} €
                  {p.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      /mois{periode === "annuel" ? " · facturé annuellement" : ""}
                    </span>
                  )}
                </p>
                {periode === "annuel" && p.price > 0 && (
                  <p className="text-[11px] font-medium text-green-700">
                    {prix * 12} €/an au lieu de {p.price * 12} € · économie de {(p.price - prix) * 12} €
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {/* Limites du plan : zones de contact, employés et volume de retours */}
                <p className="text-xs text-muted-foreground">
                  Zones : {p.limites.zones} · Employés : {p.limites.employes} · Retours : {p.limites.retours}
                </p>
                <Button
                  className="w-full"
                  variant={estActuel ? "outline" : "default"}
                  disabled={estActuel || planEnCours !== null}
                  onClick={() => changerPlan(id)}
                >
                  {planEnCours === id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {estActuel ? "Votre plan actuel" : estSuperieur ? `Passer au plan ${p.name}` : `Rétrograder vers ${p.name}`}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ---------- Bandeau sécurité paiement ---------- */}
      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>
          Paiements sécurisés par <strong>Stripe</strong> (PCI-DSS). Sans clés Stripe configurées,
          l&apos;environnement reste en mode démonstration : aucun prélèvement réel n&apos;est effectué.
          Les changements de plan sont immédiats, sans engagement.
        </p>
      </div>

      {/* ---------- Historique des factures ---------- */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" aria-hidden />
            Historique des factures
          </CardTitle>
          <CardDescription>
            Commandes de supports physiques et paiements d&apos;abonnement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chargementFactures ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : commandes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Lock className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Factures Stripe : disponibles après connexion de vos clés Stripe.
              </p>
              <p className="text-xs text-muted-foreground/80">
                En attendant, vos commandes de supports imprimés apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {commandes.map((c, idx) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {SUPPORTS[c.typeSupport as keyof typeof SUPPORTS]?.label ?? c.typeSupport}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {c.quantite > 1 && ` · ${c.quantite} unités`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold">{c.prixEuros} €</span>
                      <Badge variant="outline" className={classeStatut(c.statut)}>
                        {STATUT_COMMANDE_LABEL[c.statut] ?? c.statut}
                      </Badge>
                    </div>
                  </div>
                  {idx < commandes.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
