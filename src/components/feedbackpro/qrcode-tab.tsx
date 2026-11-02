"use client"

// ============================================================
// FeedbackPro - Onglet « Mes QR Codes » du dashboard Pro (Session 3)
// UNE CARTE PAR ZONE : aperçu du QR, nombre de retours, score moyen
// et 4 actions : PNG 1000×1000 · PDF A4 (sous-titre adapté à la zone)
// · PDF planche de 20 étiquettes 5×5 cm · Commander stickers (50 u.)
// ============================================================

import { useEffect, useRef, useState } from "react"
import {
  QrCode,
  Download,
  FileText,
  Printer,
  Copy,
  Check,
  MapPin,
  MessageSquare,
  ShoppingCart,
  Loader2,
} from "lucide-react"
import { jsPDF } from "jspdf"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { logoVersDataUrl } from "@/lib/qr"
import { sousTitreZone } from "@/lib/pdf"
import { SUPPORTS } from "@/lib/constants"
import { cn } from "@/lib/utils"

// ---------- Types (contrats GET /api/pro/zones + GET /api/pro/qrcode) ----------

type ZoneQr = {
  id: string
  nom: string
  description?: string | null
  qrToken: string
  nbRetours?: number
  noteMoyenne?: number | null
}

type Telechargement = "png" | "a4" | "etiquettes" | null

/** Lit un champ du ProData en tolérant les évolutions de schéma */
function champPro(pro: unknown, cles: string[], defaut = ""): string {
  if (!pro || typeof pro !== "object") return defaut
  for (const cle of cles) {
    const valeur = (pro as Record<string, unknown>)[cle]
    if (typeof valeur === "string" && valeur) return valeur
  }
  return defaut
}

/** Slug de fichier : minuscules sans accents ni caractères spéciaux */
function slugifier(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "zone"
  )
}

/** Télécharge une image PNG (dataURL) sous forme de fichier */
function telechargerPng(dataUrl: string, nomFichier: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Affiche A4 « VOTRE AVIS COMPTE » (spec Session 3) : double cadre bleu,
 * SOUS-TITRE ADAPTÉ AU CONTEXTE DE LA ZONE (ex. toilettes → « L'entretien de
 * cet espace est-il à la hauteur ? »), QR 8×8 cm centré, logo du commerce,
 * mention « Propulsé par FeedbackPro ».
 */
function genererAffichePdf(
  qrDataUrl: string,
  nomEtablissement: string,
  nomZone: string,
  logoDataUrl?: string | null
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) // 210 × 297 mm
  const W = 210
  const H = 297

  // Cadre extérieur double (bleu FeedbackPro)
  doc.setDrawColor(37, 99, 235)
  doc.setLineWidth(2)
  doc.rect(10, 10, W - 20, H - 20)
  doc.setLineWidth(0.5)
  doc.rect(14, 14, W - 28, H - 28)

  // Titre (spec)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(40)
  doc.setTextColor(37, 99, 235)
  doc.text("VOTRE AVIS COMPTE", W / 2, 52, { align: "center" })

  // Sous-titre adapté à la zone (spec Session 3)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(14)
  doc.setTextColor(80, 80, 80)
  doc.text(sousTitreZone(nomZone), W / 2, 66, { align: "center" })

  // Établissement + zone concernée
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.setTextColor(30, 30, 30)
  doc.text(nomEtablissement, W / 2, 88, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(13)
  doc.setTextColor(110, 110, 110)
  doc.text(`Zone : ${nomZone}`, W / 2, 97, { align: "center" })

  // QR encadré — 8 × 8 cm
  const qrSize = 80
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(37, 99, 235)
  doc.setLineWidth(1)
  doc.rect((W - qrSize) / 2 - 6, 104, qrSize + 12, qrSize + 12)
  doc.addImage(qrDataUrl, "PNG", (W - qrSize) / 2, 110, qrSize, qrSize)

  // Pied : incitation + remerciement
  doc.setFont("helvetica", "normal")
  doc.setFontSize(13)
  doc.setTextColor(80, 80, 80)
  doc.text("Votre expérience nous aide à nous améliorer", W / 2, 212, { align: "center" })
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(37, 99, 235)
  doc.text("Merci pour votre confiance !", W / 2, 224, { align: "center" })

  // Logo du commerce (si disponible, proportions conservées)
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl)
      const maxW = 44
      const maxH = 20
      const ratio = Math.min(maxW / props.width, maxH / props.height)
      const l = props.width * ratio
      const h = props.height * ratio
      doc.addImage(logoDataUrl, "PNG", (W - l) / 2, 238, l, h)
    } catch {
      /* logo illisible : l'affiche est générée sans */
    }
  }

  // Marque discrète (spec)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text("Propulsé par FeedbackPro", W / 2, 280, { align: "center" })

  doc.save(`affiche-a4-${slugifier(nomEtablissement)}-${slugifier(nomZone)}.pdf`)
}

/** Planche A4 de 20 étiquettes 5×5 cm (grille 4×5) avec repères de découpe */
function genererPlanchePdf(qrDataUrl: string, nomEtablissement: string, nomZone: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const W = 210
  const H = 297
  const etiq = 50 // 5 cm
  const cols = 4
  const rows = 5
  const marginX = (W - cols * etiq) / 2
  const marginY = 20

  // En-tête
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(60, 60, 60)
  doc.text(`Planche d'étiquettes 5x5 cm — ${nomEtablissement}`, W / 2, 12, { align: "center" })

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = marginX + c * etiq
      const y = marginY + r * (etiq + 6)

      // Contour pointillé de découpe
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.setLineDashPattern([1.5, 1.5], 0)
      doc.rect(x, y, etiq, etiq)
      doc.setLineDashPattern([], 0)

      // QR centré dans l'étiquette
      const qr = 34
      doc.addImage(qrDataUrl, "PNG", x + (etiq - qr) / 2, y + 2.5, qr, qr)

      // Mini légende (même design que l'affiche, en réduit)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6)
      doc.setTextColor(37, 99, 235)
      doc.text("VOTRE AVIS COMPTE", x + etiq / 2, y + etiq - 8.5, { align: "center" })
      doc.setFontSize(5.5)
      doc.setTextColor(60, 60, 60)
      doc.text(nomZone, x + etiq / 2, y + etiq - 5.5, { align: "center" })
      doc.setFont("helvetica", "normal")
      doc.setFontSize(4.5)
      doc.setTextColor(120, 120, 120)
      doc.text("Scannez pour évaluer votre expérience", x + etiq / 2, y + etiq - 2.5, { align: "center" })
    }
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text("Propulsé par FeedbackPro — Découpez le long des pointillés", W / 2, H - 12, { align: "center" })

  doc.save(`planche-etiquettes-${slugifier(nomEtablissement)}-${slugifier(nomZone)}.pdf`)
}

// ---------- Composant principal ----------

export function QrcodeTab({ zoneInitiale }: { zoneInitiale?: string }) {
  const session = useAppStore((s) => s.session)
  const { toast } = useToast()

  const [zones, setZones] = useState<ZoneQr[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)

  const nomEtablissement = champPro(session?.pro, ["nomEtablissement", "nomCommerce"], "Mon établissement")
  const logoUrl = champPro(session?.pro, ["logoUrl"]) || null
  const adressePro = champPro(session?.pro, ["adresse"])
  const villePro = champPro(session?.pro, ["ville"])

  // Logo normalisé (dataURL) pour l'affiche A4 — une seule fois pour toutes les cartes
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  // Dialogue « Commander stickers » (une zone à la fois)
  const [zoneCommande, setZoneCommande] = useState<ZoneQr | null>(null)

  // Mise en évidence de la zone arrivée depuis l'onglet Zones (zoneInitiale)
  const refZoneInitiale = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let annule = false
    logoVersDataUrl(logoUrl).then((l) => {
      if (!annule) setLogoDataUrl(l)
    })
    return () => {
      annule = true
    }
  }, [logoUrl])

  useEffect(() => {
    fetch("/api/pro/zones", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setZones(j.data?.zones ?? [])
      })
      .catch(() =>
        toast({ title: "Erreur", description: "Impossible de charger vos zones", variant: "destructive" })
      )
      .finally(() => setZonesLoading(false))
  }, [toast])

  // Zone présélectionnée (arrivée depuis l'onglet Zones) : défilement doux
  useEffect(() => {
    if (!zoneInitiale || zonesLoading) return
    refZoneInitiale.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [zoneInitiale, zonesLoading])

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">QR Codes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un QR code par zone de contact — téléchargez, imprimez, collectez. Chaque QR ouvre un
          formulaire adapté à <span className="font-medium text-foreground">cette</span> zone.
        </p>
      </div>

      {zonesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[26rem] rounded-xl" />
          ))}
        </div>
      ) : zones.length === 0 ? (
        // Empty state : aucune zone
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-4" aria-hidden>
              <QrCode className="h-8 w-8 text-primary" />
            </div>
            <p className="font-medium">Aucun QR code disponible</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Créez d&apos;abord une zone de contact dans l&apos;onglet « Zones » : sa carte QR avec
              téléchargements et commandes d&apos;autocollants apparaîtra ici.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map((zone) => (
            <CarteZone
              key={zone.id}
              zone={zone}
              nomEtablissement={nomEtablissement}
              logoDataUrl={logoDataUrl}
              adressePro={adressePro}
              villePro={villePro}
              enEvidence={zone.id === zoneInitiale}
              refCarte={zone.id === zoneInitiale ? refZoneInitiale : undefined}
              onCommanderStickers={() => setZoneCommande(zone)}
            />
          ))}
        </div>
      )}

      {/* ---------- Dialogue : Commander des stickers pour une zone ---------- */}
      <DialogStickers
        zone={zoneCommande}
        onClose={() => setZoneCommande(null)}
        adresseInitiale={[adressePro, villePro].filter(Boolean).join(", ")}
      />
    </div>
  )
}

// ---------- Carte d'une zone (QR + stats + 4 actions) ----------

function CarteZone({
  zone,
  nomEtablissement,
  logoDataUrl,
  adressePro,
  villePro,
  enEvidence,
  refCarte,
  onCommanderStickers,
}: {
  zone: ZoneQr
  nomEtablissement: string
  logoDataUrl: string | null
  adressePro: string
  villePro: string
  enEvidence: boolean
  refCarte?: React.RefObject<HTMLDivElement | null>
  onCommanderStickers: () => void
}) {
  const { toast } = useToast()

  // Aperçu 320×320 (vignette légère chargée à l'affichage de la carte)
  const [apercu, setApercu] = useState<string | null>(null)
  const [lienScan, setLienScan] = useState<string>("")
  const [copied, setCopied] = useState(false)
  // Téléchargement en cours sur cette carte (PNG / A4 / étiquettes)
  const [telechargement, setTelechargement] = useState<Telechargement>(null)

  useEffect(() => {
    let annule = false
    fetch(`/api/pro/qrcode?zoneId=${encodeURIComponent(zone.id)}&taille=apercu`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j?.ok) {
          setApercu(j.data.pngDataUrl)
          setLienScan(j.data.urlScan)
        }
      })
      .catch(() => {
        /* silencieux : la carte reste sans aperçu */
      })
    return () => {
      annule = true
    }
  }, [zone.id])

  /** Récupère le QR 1000×1000 (pleine résolution) pour les exports */
  async function chargerQrComplet(): Promise<string | null> {
    try {
      const res = await fetch(`/api/pro/qrcode?zoneId=${encodeURIComponent(zone.id)}`, { cache: "no-store" })
      const json = await res.json()
      if (json?.ok) return json.data.pngDataUrl as string
      toast({ title: "Erreur", description: json?.error || "QR indisponible", variant: "destructive" })
      return null
    } catch {
      toast({ title: "Erreur réseau", description: "QR indisponible", variant: "destructive" })
      return null
    }
  }

  async function telecharger(type: Exclude<Telechargement, null>) {
    if (telechargement) return
    setTelechargement(type)
    try {
      const qr = await chargerQrComplet()
      if (!qr) return
      if (type === "png") {
        telechargerPng(qr, `qr-${slugifier(zone.nom)}-1000x1000.png`)
      } else if (type === "a4") {
        genererAffichePdf(qr, nomEtablissement, zone.nom, logoDataUrl)
      } else {
        genererPlanchePdf(qr, nomEtablissement, zone.nom)
      }
    } finally {
      setTelechargement(null)
    }
  }

  function copierLien() {
    if (!lienScan) return
    if (!navigator.clipboard) {
      toast({ title: "Copie impossible", description: lienScan, variant: "destructive" })
      return
    }
    navigator.clipboard
      .writeText(lienScan)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => toast({ title: "Copie impossible", variant: "destructive" }))
  }

  const nbRetours = zone.nbRetours ?? 0
  const moyenne = zone.noteMoyenne ?? 0

  return (
    <Card
      ref={refCarte}
      className={cn(
        "flex scroll-mt-24 flex-col shadow-sm",
        enEvidence && "border-primary ring-2 ring-primary/40"
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        {/* En-tête : nom + stats de la zone */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="shrink-0 rounded-lg bg-primary/10 p-2" aria-hidden>
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{zone.nom}</p>
              <p className="text-xs text-muted-foreground">{nomEtablissement}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <MessageSquare className="h-3 w-3" aria-hidden />
              {nbRetours} retour{nbRetours > 1 ? "s" : ""}
            </Badge>
            <span
              className="text-[11px] font-medium text-muted-foreground"
              aria-label={`Score moyen de la zone : ${moyenne ? moyenne.toFixed(1) : "aucun"} sur 5`}
            >
              ⭐ {moyenne ? moyenne.toFixed(1) : "—"}/5
            </span>
          </div>
        </div>

        {/* Aperçu du QR code */}
        <div className="flex flex-col items-center">
          <div className="w-36 rounded-xl border-2 border-primary/20 bg-white p-2 shadow-sm">
            {apercu ? (
              <img
                src={apercu}
                alt={`QR code de la zone ${zone.nom}`}
                className="w-full rounded-md"
              />
            ) : (
              <Skeleton className="aspect-square w-full" />
            )}
          </div>
          {/* Token court : clic = copie du lien /r/<token> */}
          <button
            type="button"
            onClick={copierLien}
            title="Copier le lien de scan"
            className="mt-2 flex w-fit items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {copied ? (
              <Check className="h-3 w-3 text-primary" aria-hidden />
            ) : (
              <Copy className="h-3 w-3" aria-hidden />
            )}
            /r/{zone.qrToken}
          </button>
        </div>

        {/* 4 actions (grid 2×2) */}
        <div className="mt-auto grid grid-cols-2 gap-2 border-t pt-3">
          <BoutonAction
            icone={telechargement === "png" ? Loader2 : Download}
            tourne={telechargement === "png"}
            label="PNG"
            sousTitre="1000×1000 + logo"
            onClick={() => telecharger("png")}
            disabled={telechargement !== null || !apercu}
          />
          <BoutonAction
            icone={telechargement === "a4" ? Loader2 : FileText}
            tourne={telechargement === "a4"}
            label="PDF A4"
            sousTitre="Affiche « VOTRE AVIS COMPTE »"
            onClick={() => telecharger("a4")}
            disabled={telechargement !== null || !apercu}
          />
          <BoutonAction
            icone={telechargement === "etiquettes" ? Loader2 : Printer}
            tourne={telechargement === "etiquettes"}
            label="PDF étiquettes"
            sousTitre="20 étiquettes 5×5 cm"
            onClick={() => telecharger("etiquettes")}
            disabled={telechargement !== null || !apercu}
          />
          <BoutonAction
            icone={ShoppingCart}
            label="Commander"
            sousTitre={`Stickers 50 u. · ${SUPPORTS.STICKERS_50.price} €`}
            onClick={onCommanderStickers}
            variante="primaire"
          />
        </div>
      </CardContent>
    </Card>
  )
}

/** Petit bouton d'action de carte (icône + label + sous-titre) */
function BoutonAction({
  icone: Icon,
  label,
  sousTitre,
  onClick,
  disabled,
  tourne,
  variante = "neutre",
}: {
  icone: React.ComponentType<{ className?: string }>
  label: string
  sousTitre: string
  onClick: () => void
  disabled?: boolean
  tourne?: boolean
  variante?: "neutre" | "primaire"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[3.25rem] flex-col items-start justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:opacity-50",
        variante === "primaire"
          ? "border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10"
          : "hover:border-primary/40 hover:bg-primary/5"
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className={cn("h-3.5 w-3.5 text-primary", tourne && "animate-spin")} aria-hidden />
        {label}
      </span>
      <span className="truncate text-[10px] text-muted-foreground">{sousTitre}</span>
    </button>
  )
}

// ---------- Dialogue : commande de stickers (Pack 50 autocollants) ----------

function DialogStickers({
  zone,
  onClose,
  adresseInitiale,
}: {
  zone: ZoneQr | null
  onClose: () => void
  adresseInitiale: string
}) {
  const { toast } = useToast()
  const [adresse, setAdresse] = useState(adresseInitiale)
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)

  // Réinitialisation à chaque ouverture (adresse préremplie depuis le profil)
  useEffect(() => {
    if (zone) {
      setAdresse(adresseInitiale)
      setSucces(false)
    }
  }, [zone, adresseInitiale])

  const support = SUPPORTS.STICKERS_50

  async function commander() {
    if (!zone || envoi) return
    if (adresse.trim().length < 10) {
      toast({
        title: "Adresse incomplète",
        description: "Indiquez une adresse de livraison complète.",
        variant: "destructive",
      })
      return
    }
    setEnvoi(true)
    try {
      const res = await fetch("/api/pro/commandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeSupport: "STICKERS_50", adresseLivraison: adresse.trim(), zoneId: zone.id }),
      })
      const json = await res.json()
      if (res.ok && json?.ok) {
        setSucces(true)
        toast({ title: "Commande créée 🎉", description: "Vos autocollants partent en impression sous 48 h." })
      } else {
        toast({ title: "Erreur", description: json?.error || "Commande impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialog open={!!zone} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        {zone && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" aria-hidden />
                {succes ? "Commande confirmée 🎉" : "Commander des stickers"}
              </DialogTitle>
              <DialogDescription>
                {succes
                  ? `Vos autocollants pour la zone « ${zone.nom} » sont en file d'impression.`
                  : `Autocollants dédiés au QR de la zone « ${zone.nom} ».`}
              </DialogDescription>
            </DialogHeader>

            {succes ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  <p className="font-semibold">Merci pour votre commande !</p>
                  <p className="mt-1">
                    Suivez son avancement (À imprimer → Expédié → Livré) dans l&apos;onglet
                    « Facturation ».
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={onClose}>Fermer</Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="text-2xl" aria-hidden>
                    {support.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{support.label}</p>
                    <p className="text-xs text-muted-foreground">{support.description}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">⏱ {support.delai}</p>
                  </div>
                  <span className="shrink-0 text-lg font-bold">{support.price} €</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cmd-adresse">Adresse de livraison</Label>
                  <Input
                    id="cmd-adresse"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    placeholder="12 rue des Lilas, 75011 Paris"
                    autoComplete="street-address"
                  />
                  <p className="text-xs text-muted-foreground">
                    Préremplie depuis votre profil — modifiez-la si besoin.
                  </p>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={onClose} disabled={envoi}>
                    Annuler
                  </Button>
                  <Button onClick={commander} disabled={envoi}>
                    {envoi ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Commande en cours…
                      </>
                    ) : (
                      <>
                        Confirmer — {support.price} €
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
