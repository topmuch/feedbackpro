"use client"

// ============================================================
// FeedbackPro - Onglet "Commander" du dashboard Pro (Session 6)
// ------------------------------------------------------------
// Module de commande des supports physiques :
//  1. Choix du support (catalogue : 50 autocollants 29€ / chevalet 49€ /
//     affiche A4 19€)
//  2. Sélection de la zone (optionnel, pour un QR dédié)
//  3. Adresse de livraison (préremplie depuis les paramètres du compte)
//  4. Paiement Stripe (Checkout Session ; mode démo sans clés)
//  5. Création de la commande en BDD (directe en démo, via webhook sinon)
// Retour Stripe : /dashboard/commander?succes=1 (ou ?annule=1)
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Package,
  MapPin,
  Loader2,
  Lock,
  CheckCircle2,
  Truck,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { SUPPORTS, STATUT_COMMANDE_LABEL, type TypeSupportId } from "@/lib/constants"

// ---------- Types locaux ----------

type Commande = {
  id: string
  typeSupport: string
  quantite: number
  prixEuros: number
  adresseLivraison: string
  statut: string
  zoneId: string | null
  createdAt: string
}

type ZoneLegere = { id: string; nom: string }

/** Couleur du badge selon le statut de la commande (même code que Facturation) */
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

export function CommanderTab() {
  const { toast } = useToast()
  const session = useAppStore((s) => s.session)
  const refreshSession = useAppStore((s) => s.refreshSession)

  const pro = session?.pro

  // ---------- État ----------
  const [supportChoisi, setSupportChoisi] = useState<TypeSupportId | null>(null)
  const [zoneId, setZoneId] = useState<string>("")
  const [adresse, setAdresse] = useState("")
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [zones, setZones] = useState<ZoneLegere[]>([])
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)

  // Préremplissage de l'adresse depuis les paramètres du compte
  useEffect(() => {
    if (pro) {
      const base = [pro.adresse, pro.ville].filter(Boolean).join(", ")
      setAdresse(base)
    }
  }, [pro])

  /** Charge les commandes existantes + la liste des zones */
  const charger = useCallback(async () => {
    try {
      const [resCmd, resZones] = await Promise.all([
        fetch("/api/pro/commandes", { cache: "no-store" }),
        fetch("/api/pro/zones", { cache: "no-store" }),
      ])
      const jsonCmd = await resCmd.json().catch(() => null)
      const jsonZones = await resZones.json().catch(() => null)
      if (jsonCmd?.ok) setCommandes(jsonCmd.data.commandes ?? [])
      if (jsonZones?.ok) {
        setZones(
          (jsonZones.data.zones ?? []).map((z: { id: string; nom: string }) => ({ id: z.id, nom: z.nom }))
        )
      }
    } catch {
      /* silencieux : listes vides */
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  // Retour de la Checkout Stripe : /dashboard/commander?succes=1 ou ?annule=1
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const succes = params.get("succes")
      const annule = params.get("annule")
      if (succes === "1") {
        toast({
          title: "Paiement confirmé 🎉",
          description: "Votre commande est enregistrée : elle part à l'impression sous 48h.",
        })
        charger()
        void refreshSession()
      } else if (annule === "1") {
        toast({
          title: "Paiement annulé",
          description: "Aucun montant n'a été débité. Vous pouvez relancer la commande à tout moment.",
        })
      }
      if (succes || annule) {
        params.delete("succes")
        params.delete("annule")
        const qs = params.toString()
        window.history.replaceState({}, "", "/dashboard/commander" + (qs ? `?${qs}` : ""))
      }
    } catch {
      /* ignore */
    }
  }, [])

  /** Sélection d'un support dans le catalogue */
  function choisirSupport(id: TypeSupportId) {
    setSupportChoisi((prev) => (prev === id ? null : id))
  }

  /**
   * Validation de la commande :
   * · Stripe actif → redirection vers la page de paiement (la commande
   *   sera créée par le webhook après checkout.session.completed)
   * · Mode démo → commande créée immédiatement (paiement simulé)
   */
  async function commander() {
    if (!supportChoisi || envoi) return
    if (adresse.trim().length < 10) {
      toast({
        title: "Adresse incomplète",
        description: "Indiquez une adresse de livraison complète (rue, code postal, ville).",
        variant: "destructive",
      })
      return
    }
    setEnvoi(true)
    try {
      const res = await fetch("/api/pro/commandes/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeSupport: supportChoisi,
          adresseLivraison: adresse.trim(),
          zoneId: zoneId || null,
        }),
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

      // Mode démo : la commande est déjà en base
      toast({
        title: "Commande confirmée ✓ (mode démo)",
        description:
          "Paiement simulé sans prélèvement. Votre support part à l'impression — suivez son statut ci-dessous.",
      })
      setSupportChoisi(null)
      setZoneId("")
      await charger()
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setEnvoi(false)
    }
  }

  const supportActif = supportChoisi ? SUPPORTS[supportChoisi] : null
  const nomZone = (id: string | null) => (id ? (zones.find((z) => z.id === id)?.nom ?? null) : null)

  return (
    <div className="space-y-6">
      {/* ---------- En-tête ---------- */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commander des supports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Autocollants, chevalets et affiches avec votre QR code imprimé — livrés chez vous, prêts à poser.
        </p>
      </div>

      {/* ---------- Catalogue ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(SUPPORTS) as TypeSupportId[]).map((id) => {
          const s = SUPPORTS[id]
          const actif = supportChoisi === id
          return (
            <Card
              key={id}
              role="button"
              tabIndex={0}
              aria-pressed={actif}
              aria-label={`Choisir ${s.label} — ${s.price} €`}
              onClick={() => choisirSupport(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  choisirSupport(id)
                }
              }}
              className={
                actif
                  ? "cursor-pointer border-primary shadow-sm ring-1 ring-primary transition-shadow hover:shadow-md"
                  : "cursor-pointer shadow-sm transition-shadow hover:shadow-md"
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-3xl" aria-hidden>
                    {s.emoji}
                  </span>
                  {actif && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
                </div>
                <CardTitle className="pt-1 text-base">{s.label}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-bold tracking-tight">
                  {s.price} <span className="text-sm font-normal text-muted-foreground">€</span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {s.delai}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ---------- Formulaire : zone + adresse + paiement ---------- */}
      {supportActif && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" aria-hidden />
              Finaliser la commande — {supportActif.label}
            </CardTitle>
            <CardDescription>
              Étapes : support choisi → zone (optionnel) → adresse de livraison → paiement sécurisé.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Zone optionnelle : pour un support portant le QR d'une zone précise */}
            <div className="space-y-1.5">
              <Label htmlFor="zone-commande">Zone concernée (optionnel)</Label>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger id="zone-commande" className="h-10 sm:max-w-md" aria-label="Zone concernée">
                  <SelectValue placeholder="Aucune zone spécifique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aucune">Aucune zone spécifique</SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Utile si vous commandez un support imprimé avec le QR code d&apos;une zone précise (ex. « Toilettes RDC »).
              </p>
            </div>

            {/* Adresse de livraison */}
            <div className="space-y-1.5">
              <Label htmlFor="adresse-commande">Adresse de livraison</Label>
              <Textarea
                id="adresse-commande"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="12 rue des Lavandières, 69001 Lyon"
                rows={3}
                className="resize-none"
                aria-label="Adresse de livraison"
              />
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden />
                Préremplie depuis vos paramètres — modifiable pour cette commande.
              </p>
            </div>

            {/* Récapitulatif + paiement */}
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {supportActif.label} — {supportActif.price} €
                </p>
                <p className="text-xs text-muted-foreground">
                  {zoneId ? `QR dédié : ${nomZone(zoneId) ?? "zone choisie"}` : "QR code générique FeedbackPro"} ·{" "}
                  {supportActif.delai}
                </p>
              </div>
              <Button onClick={commander} disabled={envoi} className="w-full sm:w-auto" size="lg">
                {envoi ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Lock className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                Payer {supportActif.price} € avec Stripe
              </Button>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              Paiement sécurisé par Stripe (PCI-DSS). Sans clés Stripe configurées sur l&apos;environnement, le
              paiement est simulé en mode démo : la commande est créée sans prélèvement réel.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---------- Mes commandes ---------- */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" aria-hidden />
            Mes commandes
          </CardTitle>
          <CardDescription>Suivi d&apos;impression et d&apos;expédition de vos supports physiques.</CardDescription>
        </CardHeader>
        <CardContent>
          {chargement ? (
            <div className="space-y-2.5">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : commandes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Package className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Aucune commande pour le moment. Choisissez un support ci-dessus pour démarrer.
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {commandes.map((c, idx) => (
                <div key={c.id}>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {SUPPORTS[c.typeSupport as TypeSupportId]?.label ?? c.typeSupport}
                        {c.quantite > 1 && ` · ${c.quantite} unités`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {nomZone(c.zoneId) && ` · Zone : ${nomZone(c.zoneId)}`} · {c.adresseLivraison}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold">{c.prixEuros} €</span>
                      <Badge variant="outline" className={classeStatut(c.statut)}>
                        {STATUT_COMMANDE_LABEL[c.statut] ?? c.statut}
                      </Badge>
                    </div>
                  </div>
                  {idx < commandes.length - 1 && <div className="border-t" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
