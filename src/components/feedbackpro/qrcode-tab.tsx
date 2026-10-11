"use client"

// ============================================================
// FeedbackPro - Onglet "Mon QR Code" du dashboard Pro
// Aperçu QR + téléchargements (PNG / PDF A4 / planche étiquettes)
// + commande de supports physiques (paiement simulé)
// ============================================================

import { useEffect, useState } from "react"
import { Download, FileText, Printer, Copy, Loader2, Check, Truck, Package } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { downloadPng, generatePosterPdf, generateLabelsPdf } from "@/lib/pdf"
import { composeQrAvecLogo, logoVersDataUrl } from "@/lib/qr"
import { SUPPORTS, STATUT_COMMANDE_LABEL, TypeSupportId } from "@/lib/constants"
import { formatRelative } from "@/components/feedbackpro/shared"

type Commande = {
  id: string
  typeSupport: string
  quantite: number
  prixEuros: number
  adresseLivraison: string
  statut: string
  createdAt: string
}

export function QrcodeTab() {
  const session = useAppStore((s) => s.session)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [scanUrl, setScanUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [loadingCmd, setLoadingCmd] = useState(true)

  // Commande en cours
  const [supportChoisi, setSupportChoisi] = useState<TypeSupportId | null>(null)
  const [adresse, setAdresse] = useState("")
  const [commandeEnCours, setCommandeEnCours] = useState(false)

  const { toast } = useToast()

  useEffect(() => {
    // QR code : généré par l'API (1000 px) puis composé avec le logo du commerce au centre
    let annule = false
    fetch("/api/pro/qrcode", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (j) => {
        if (!j.ok || annule) return
        setScanUrl(j.data.scanUrl)
        const compose = await composeQrAvecLogo(j.data.dataUrl, session?.pro?.logoUrl)
        if (!annule) setQrDataUrl(compose)
        // Version normalisée du logo pour l'affiche A4 (jsPDF)
        if (session?.pro?.logoUrl) {
          const logo = await logoVersDataUrl(session.pro.logoUrl)
          if (!annule) setLogoDataUrl(logo)
        }
      })
      .catch(() => toast({ title: "Erreur", description: "Impossible de générer le QR code", variant: "destructive" }))
    // Commandes existantes
    fetch("/api/pro/commandes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setCommandes(j.data.commandes)
      })
      .finally(() => setLoadingCmd(false))
    return () => {
      annule = true
    }
  }, [session?.pro?.logoUrl])

  function copierLien() {
    navigator.clipboard?.writeText(scanUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function confirmerCommande() {
    if (!supportChoisi || adresse.trim().length < 10) {
      toast({ title: "Adresse incomplète", description: "Indiquez une adresse de livraison complète.", variant: "destructive" })
      return
    }
    setCommandeEnCours(true)
    try {
      const res = await fetch("/api/pro/commandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeSupport: supportChoisi, adresseLivraison: adresse.trim() }),
      })
      const json = await res.json()
      if (json.ok) {
        setCommandes((prev) => [json.data.commande, ...prev])
        setSupportChoisi(null)
        setAdresse("")
        toast({
          title: "Commande confirmée 🎉",
          description: "Paiement accepté (démo). Votre support part à l'impression — suivez son statut ci-dessous.",
        })
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setCommandeEnCours(false)
    }
  }

  const nomCommerce = session?.pro?.nomCommerce || "Mon commerce"

  return (
    <div className="space-y-6">
      {/* ---------- Aperçu QR + téléchargements ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Votre QR Code</CardTitle>
            <CardDescription>Pointe vers votre page de notation : {scanUrl || "…"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="w-full max-w-52 rounded-2xl border-2 border-primary/20 bg-white p-3 shadow-sm">
              {qrDataUrl ? (
                 
                <img src={qrDataUrl} alt={`QR Code de ${nomCommerce}`} className="w-full rounded-lg" />
              ) : (
                <Skeleton className="aspect-square w-full" />
              )}
              <p className="mt-2 text-center text-xs font-semibold text-primary uppercase tracking-wide">Votre avis compte</p>
              <p className="text-center text-xs text-muted-foreground truncate">{nomCommerce}</p>
            </div>
            <Button variant="outline" size="sm" className="mt-4" onClick={copierLien} disabled={!scanUrl}>
              {copied ? <Check className="mr-1.5 h-4 w-4 text-primary" aria-hidden /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden />}
              {copied ? "Lien copié !" : "Copier le lien de scan"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Téléchargements gratuits</CardTitle>
            <CardDescription>Prêts à imprimer, haute résolution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
              disabled={!qrDataUrl}
              onClick={() => downloadPng(qrDataUrl!, `qr-code-${nomCommerce.toLowerCase()}.png`)}
            >
              <div className="rounded-lg bg-primary/10 p-2.5" aria-hidden>
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">PNG haute résolution</p>
                <p className="text-xs text-muted-foreground">1000×1000 px, avec votre logo au centre — idéal pour vos mises en page</p>
              </div>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
              disabled={!qrDataUrl}
              onClick={() => generatePosterPdf(qrDataUrl!, nomCommerce, logoDataUrl)}
            >
              <div className="rounded-lg bg-primary/10 p-2.5" aria-hidden>
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Affiche A4 « VOTRE AVIS COMPTE »</p>
                <p className="text-xs text-muted-foreground">PDF prêt à imprimer : QR 8×8 cm, logo et sous-titre inclus</p>
              </div>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
              disabled={!qrDataUrl}
              onClick={() => generateLabelsPdf(qrDataUrl!, nomCommerce)}
            >
              <div className="rounded-lg bg-primary/10 p-2.5" aria-hidden>
                <Printer className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Planche d&apos;étiquettes 5×5 cm</p>
                <p className="text-xs text-muted-foreground">20 étiquettes A4 avec repères de découpe</p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Supports physiques ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Commander des supports physiques</CardTitle>
          <CardDescription>Premium, imprimés pour vous — livraison à votre boutique</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.values(SUPPORTS).map((s) => (
            <div key={s.id} className="flex flex-col rounded-xl border p-4">
              <span className="text-2xl" aria-hidden>
                {s.emoji}
              </span>
              <p className="mt-2 text-sm font-medium leading-snug">{s.label}</p>
              <p className="mt-1 text-xs text-muted-foreground flex-1">{s.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                <Truck className="h-3 w-3" aria-hidden /> {s.delai}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-bold">{s.price} €</span>
                <Button size="sm" className="h-9" onClick={() => setSupportChoisi(s.id)}>
                  Commander
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- Historique des commandes ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Package className="h-4.5 w-4.5" aria-hidden />
            Mes commandes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCmd ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : commandes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune commande pour l&apos;instant.</p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar">
              {commandes.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {SUPPORTS[c.typeSupport as TypeSupportId]?.emoji} {SUPPORTS[c.typeSupport as TypeSupportId]?.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.prixEuros} € · {formatRelative(c.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      c.statut === "LIVRE"
                        ? "text-green-700 border-green-300"
                        : c.statut === "EXPEDIE"
                          ? "text-amber-700 border-amber-300"
                          : c.statut === "IMPRIME"
                            ? "text-cyan-700 border-cyan-300"
                            : "text-stone-600"
                    }
                  >
                    {STATUT_COMMANDE_LABEL[c.statut]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Dialogue de commande ---------- */}
      <Dialog open={!!supportChoisi} onOpenChange={(o) => !o && setSupportChoisi(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {supportChoisi ? `${SUPPORTS[supportChoisi].emoji} ${SUPPORTS[supportChoisi].label}` : ""}
            </DialogTitle>
            <DialogDescription>
              {supportChoisi ? `${SUPPORTS[supportChoisi].price} € — paiement sécurisé (démo). Livraison : ${SUPPORTS[supportChoisi].delai}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="livraison">Adresse de livraison</Label>
            <Input
              id="livraison"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="12 rue de la République, 69002 Lyon"
              className="h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupportChoisi(null)}>
              Annuler
            </Button>
            <Button onClick={confirmerCommande} disabled={commandeEnCours}>
              {commandeEnCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Payer {supportChoisi ? SUPPORTS[supportChoisi].price : ""} €
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
