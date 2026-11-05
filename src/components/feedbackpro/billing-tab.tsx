"use client"

// ============================================================
// FeedbackPro - Onglet "Facturation" du dashboard Pro (Coach IA)
// ------------------------------------------------------------
// - Plan actuel (badge) + grille comparative des 3 plans
//   (PLANS 29€ / 99€ / 249€ de src/lib/constants.ts)
//   + plan FRANCHISE (199/399/799 €) si le module
//   "abonnement_multi_sites" est activé par le superadmin.
// - Changement de plan via POST /api/pro/billing/checkout :
//   · Stripe configuré → redirection vers la Checkout Session
//   · Sans clés (mode démo) → paiement simulé via POST /api/pro/plan
//   · Starter étant gratuit, le downgrade appelle /api/pro/plan direct
// - Historique des factures : commandes du Pro (GET /api/pro/commandes)
// ============================================================

import { useEffect, useState } from "react"
import { CreditCard, Check, Loader2, Receipt, ShieldCheck, Lock, Settings2, Activity, Package } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { PLANS, STATUT_COMMANDE_LABEL, SUPPORTS, type PlanId } from "@/lib/constants"
import { cn } from "@/lib/utils"

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

/**
 * Extrait le quota mensuel de retours d'un plan depuis la chaîne
 * `limites.retours` (ex. « 50/mois » → 50, « ∞ » → null = illimité).
 */
function quotaRetoursMensuel(retoursStr: string): number | null {
  if (!retoursStr || retoursStr.trim() === "∞" || retoursStr.toLowerCase().includes("illimit")) return null
  const match = retoursStr.match(/(\d+)/)
  return match ? Number(match[1]) : null
}

/** Reformule la limite de retours en bénéfice lisible : « illimités » si ∞. */
function libelleRetours(retoursStr: string): string {
  return retoursStr === "∞" ? "illimités" : retoursStr
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

  // ---------- Module abonnement_multi_sites : on affiche la card
  // FRANCHISE seulement si le module est activé côté superadmin ----------
  const [moduleMultiSitesActif, setModuleMultiSitesActif] = useState(false)
  const [chargementModules, setChargementModules] = useState(true)

  // ---------- Factures (commandes de supports) ----------
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [chargementFactures, setChargementFactures] = useState(true)

  // ---------- Consommation de retours (audit UX : « ce mois ») ----------
  const [retoursMois, setRetoursMois] = useState<number | null>(null)
  const [chargementConsommation, setChargementConsommation] = useState(true)

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

  // ---------- Chargement des modules actifs (endpoint public, pas d'auth) ----------
  // Utilisé pour décider si on affiche la card FRANCHISE. Best-effort :
  // en cas d'échec, on n'affiche pas le plan Franchise (fallback safe).
  useEffect(() => {
    async function chargerModules() {
      try {
        const res = await fetch("/api/modules-public", { cache: "no-store" })
        const json = await res.json()
        if (json.ok && Array.isArray(json.data.modules)) {
          setModuleMultiSitesActif(
            (json.data.modules as string[]).includes("abonnement_multi_sites")
          )
        }
      } catch {
        /* silencieux : on reste à false */
      } finally {
        setChargementModules(false)
      }
    }
    chargerModules()
  }, [])

  // ---------- Consommation de retours sur 30 jours (audit UX) ----------
  // Le quota mensuel provient de PLANS (constants.ts) ; le compteur de
  // retours est récupéré depuis /api/pro/stats?periode=30j (kpis.total).
  useEffect(() => {
    async function chargerConsommation() {
      try {
        const res = await fetch("/api/pro/stats?periode=30j", { cache: "no-store" })
        const json = await res.json()
        if (json?.ok && typeof json.data?.kpis?.total === "number") {
          setRetoursMois(json.data.kpis.total as number)
        }
      } catch {
        /* silencieux : la carte reste masquée */
      } finally {
        setChargementConsommation(false)
      }
    }
    chargerConsommation()
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

  /**
   * Audit UX : le plan Enterprise (249 €) ne se « commande » pas en
   * self-service — on invite le commerçant à nous contacter pour une démo
   * personnalisée multi-sites. Les autres plans gardent le flux Stripe.
   */
  function contacterEnterprise() {
    toast({
      title: "Parlons de votre projet multi-sites 🏢",
      description: "Écrivez-nous à contact@feedbackpro.fr : nous préparerons une démo personnalisée et un devis adapté à votre groupe.",
    })
  }

  const planActuelDef = PLANS[planActuel] ?? PLANS.STARTER

  // ---------- Quota de consommation (PLANS → limites.retours) ----------
  const quotaMois = quotaRetoursMensuel(planActuelDef.limites.retours)
  const pctConsommation =
    quotaMois && quotaMois > 0 && retoursMois !== null
      ? Math.min(100, Math.round((retoursMois / quotaMois) * 100))
      : null

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

      {/* ---------- Consommation de retours ce mois (audit UX) ---------- */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" aria-hidden />
            Consommation ce mois
          </CardTitle>
          <CardDescription>
            Suivi de votre quota de retours clients sur les 30 derniers jours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chargementConsommation ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : retoursMois === null ? (
            <p className="text-sm text-muted-foreground">
              Aucune donnée de consommation disponible pour le moment.
            </p>
          ) : quotaMois === null ? (
            // Plan illimité (PRO / Enterprise) : pas de barre de progression
            <div className="space-y-1">
              <p className="text-sm">
                Vous avez utilisé{" "}
                <span className="font-semibold text-foreground">{retoursMois}</span>{" "}
                retour{retoursMois > 1 ? "s" : ""} ce mois ·{" "}
                <span className="font-semibold text-primary">retours illimités</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Votre plan {planActuelDef.name} offre des retours illimités : aucun quota à surveiller.
              </p>
            </div>
          ) : (
            // Plan limité (Starter) : barre de progression + pourcentage
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm">
                  Vous avez utilisé{" "}
                  <span className="font-semibold text-foreground">{retoursMois}</span>
                  <span className="text-muted-foreground">/{quotaMois}</span> retours ce mois
                </p>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    (pctConsommation ?? 0) >= 90
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-primary"
                  )}
                  aria-label={`${pctConsommation}% du quota utilisé`}
                >
                  {pctConsommation}%
                </span>
              </div>
              <Progress
                value={pctConsommation ?? 0}
                className={cn(
                  "h-2.5",
                  (pctConsommation ?? 0) >= 90 && "bg-amber-200 dark:bg-amber-950/40"
                )}
                aria-label={`Progression : ${retoursMois} sur ${quotaMois} retours`}
              />
              <p className="text-xs text-muted-foreground">
                {(pctConsommation ?? 0) >= 90
                  ? "Vous approchez de votre quota mensuel. Passez au plan supérieur pour continuer à collecter des retours sans interruption."
                  : `Il vous reste ${Math.max(0, quotaMois - retoursMois)} retour${quotaMois - retoursMois > 1 ? "s" : ""} ce mois.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Grille comparative des plans (29 / 99 / 249 € + Franchise) ---------- */}
      <div
        className={cn(
          "grid gap-4",
          moduleMultiSitesActif ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"
        )}
      >
        {(Object.keys(PLANS) as PlanId[])
          .filter((id) => !PLANS[id].reserveModule || moduleMultiSitesActif)
          .map((id) => {
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
                    : p.id === "FRANCHISE"
                      ? "shadow-sm ring-1 ring-amber-400/50 transition-shadow hover:shadow-md"
                      : "shadow-sm transition-shadow hover:shadow-md"
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    {estActuel ? (
                      <Badge className="bg-primary text-primary-foreground hover:bg-primary">Plan actuel</Badge>
                    ) : p.id === "FRANCHISE" ? (
                      <Badge className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                        Multi-sites
                      </Badge>
                    ) : null}
                  </div>
                  <CardDescription className="pt-1">{p.tagline}</CardDescription>
                  <p className="pt-2 text-2xl font-bold tracking-tight">
                    {/* Audit UX : en annuel, le prix mensuel d'origine est barré */}
                    {periode === "annuel" && p.price > 0 && (
                      <span className="mr-1.5 text-base font-normal text-muted-foreground line-through decoration-muted-foreground/60">
                        {p.price} €
                      </span>
                    )}
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
                  {/* Limites du plan reformulées en bénéfices (audit UX) */}
                  <p className="text-xs text-muted-foreground">
                    Jusqu&apos;à {p.limites.zones} zones et {p.limites.employes} employés, retours {libelleRetours(p.limites.retours)}
                  </p>
                  {estActuel ? (
                    // Audit UX : badge vert « ✓ Plan actif » à la place du bouton grisé désactivé.
                    <div
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-300"
                      role="status"
                      aria-label="Plan actuel actif"
                    >
                      <Check className="h-4 w-4" aria-hidden />
                      Plan actif
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      variant="default"
                      disabled={planEnCours !== null || chargementModules}
                      onClick={() =>
                        id === "ENTERPRISE" || id === "FRANCHISE"
                          ? contacterEnterprise()
                          : changerPlan(id)
                      }
                    >
                      {planEnCours === id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      {id === "ENTERPRISE"
                        ? "Nous contacter"
                        : id === "FRANCHISE"
                          ? "Demander un devis"
                          : estSuperieur
                            ? `Passer au plan ${p.name}`
                            : `Rétrograder vers ${p.name}`}
                    </Button>
                  )}
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
            Factures d&apos;abonnement mensuel et commandes de supports physiques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ---------- 1. Factures d'abonnement mensuel ---------- */}
          <section aria-labelledby="titre-factures-abonnement">
            <h3 id="titre-factures-abonnement" className="mb-2 text-sm font-semibold">
              Abonnement {planActuelDef.name}
            </h3>
            {/* En mode démo (sans Stripe configuré), aucune facture d'abonnement
                n'est encore émise : on affiche le message d'attente. */}
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
              <Lock className="h-7 w-7 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Vos premières factures d&apos;abonnement apparaîtront ici après votre période d&apos;essai.
              </p>
              <p className="text-xs text-muted-foreground/80">
                Une fois vos clés Stripe configurées, chaque prélèvement mensuel du plan {planActuelDef.name} ({planActuelDef.price} €/mois) sera téléchargeable ici en PDF.
              </p>
            </div>
          </section>

          <Separator />

          {/* ---------- 2. Commandes de supports physiques ---------- */}
          <section aria-labelledby="titre-factures-commandes">
            <h3 id="titre-factures-commandes" className="mb-2 text-sm font-semibold">
              Commandes de supports physiques
            </h3>
            {chargementFactures ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : commandes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
                <Package className="h-7 w-7 text-muted-foreground/50" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Aucune commande de supports pour le moment.
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Vos autocollants, chevalets et affiches commandés apparaîtront ici avec leur statut d&apos;expédition.
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
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
