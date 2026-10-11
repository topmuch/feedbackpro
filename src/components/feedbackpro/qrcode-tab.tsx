"use client"

// ============================================================
// FeedbackPro - Onglet « QR Codes » du dashboard Pro (multi-zones)
// Un QR par zone : aperçu, lien de scan, PNG 1000×1000,
// affiche A4 et planche de 20 étiquettes 5×5 cm (jsPDF local)
// ============================================================

import { useEffect, useState } from "react"
import { QrCode, Download, FileText, Printer, Copy, Check, MapPin } from "lucide-react"
import { jsPDF } from "jspdf"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { logoVersDataUrl } from "@/lib/qr"

// ---------- Types (contrats GET /api/pro/zones + GET /api/pro/qrcode?zoneId=) ----------

type ZoneLegere = { id: string; nom: string; qrToken?: string }

type QrInfo = {
  zone?: { id: string; nom: string; qrToken: string } | null
  urlScan: string
  pngDataUrl: string
}

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
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "zone"
}

// ---------- Exports PDF (logique éprouvée de l'ancien onglet, adaptée multi-zones) ----------

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
 * Affiche A4 « VOTRE AVIS COMPTE » : double cadre bleu, sous-titre 15 secondes,
 * établissement + zone, QR 8×8 cm centré, logo du Pro (si présent), marque FeedbackPro.
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

  // Titre
  doc.setFont("helvetica", "bold")
  doc.setFontSize(40)
  doc.setTextColor(37, 99, 235)
  doc.text("VOTRE AVIS COMPTE", W / 2, 52, { align: "center" })

  // Sous-titre
  doc.setFont("helvetica", "normal")
  doc.setFontSize(14)
  doc.setTextColor(80, 80, 80)
  doc.text("Scannez pour évaluer votre expérience en 15 secondes", W / 2, 66, { align: "center" })

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

  // Logo du Pro en bas (si disponible, proportions conservées)
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

  // Marque discrète
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

  const [zones, setZones] = useState<ZoneLegere[]>([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [zoneId, setZoneId] = useState<string | undefined>(zoneInitiale)
  const [qr, setQr] = useState<QrInfo | null>(null)
  const [qrLoading, setQrLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  const nomEtablissement = champPro(session?.pro, ["nomEtablissement", "nomCommerce"], "Mon établissement")
  const logoUrl = champPro(session?.pro, ["logoUrl"]) || null

  // Zone effective : sélection courante, sinon première zone disponible
  // (état dérivé — évite une resynchronisation par effet)
  const zoneEffective = zoneId && zones.some((z) => z.id === zoneId) ? zoneId : zones[0]?.id
  const nomZone =
    qr?.zone?.nom ?? zones.find((z) => z.id === zoneEffective)?.nom ?? (zoneInitiale ? "zone" : "—")

  // Zones disponibles (pour le sélecteur)
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

  // Logo normalisé (dataURL) pour l'affiche A4
  useEffect(() => {
    let annule = false
    logoVersDataUrl(logoUrl).then((l) => {
      if (!annule) setLogoDataUrl(l)
    })
    return () => {
      annule = true
    }
  }, [logoUrl])

  // QR de la zone sélectionnée (le squelette s'affiche via qrLoading initial + reset au changement)
  useEffect(() => {
    if (!zoneEffective) return
    let annule = false
    fetch(`/api/pro/qrcode?zoneId=${encodeURIComponent(zoneEffective)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (annule) return
        if (j?.ok) setQr(j.data as QrInfo)
        else toast({ title: "Erreur", description: j?.error || "Impossible de générer ce QR code", variant: "destructive" })
      })
      .catch(() => {
        if (!annule)
          toast({ title: "Erreur", description: "Impossible de générer le QR code", variant: "destructive" })
      })
      .finally(() => {
        if (!annule) setQrLoading(false)
      })
    return () => {
      annule = true
    }
  }, [zoneEffective, toast])

  /** Changement de zone depuis le sélecteur (handler : setState autorisé ici) */
  function changerZone(v: string) {
    setQrLoading(true)
    setQr(null)
    setZoneId(v)
  }

  function copierLien() {
    if (!qr?.urlScan) return
    if (!navigator.clipboard) {
      toast({ title: "Copie impossible", description: qr.urlScan, variant: "destructive" })
      return
    }
    navigator.clipboard
      .writeText(qr.urlScan)
      .then(() => {
        setCopied(true)
        toast({ title: "Lien copié 🔗", description: qr.urlScan })
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => toast({ title: "Copie impossible", variant: "destructive" }))
  }

  const qrPret = !!qr?.pngDataUrl

  return (
    <div className="space-y-5">
      {/* En-tête + sélecteur de zone */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">QR Codes de vos zones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un QR code par zone de contact — imprimez, affichez, collectez.
          </p>
        </div>
        {zonesLoading ? (
          <Skeleton className="h-9 w-full sm:w-72" />
        ) : zones.length > 0 ? (
          <Select value={zoneEffective} onValueChange={changerZone}>
            <SelectTrigger className="w-full sm:w-72" aria-label="Choisir une zone">
              <MapPin className="h-4 w-4 text-primary" aria-hidden />
              <SelectValue placeholder="Choisir une zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {!zonesLoading && zones.length === 0 ? (
        // Empty state : aucune zone
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-4" aria-hidden>
              <QrCode className="h-8 w-8 text-primary" />
            </div>
            <p className="font-medium">Aucun QR code disponible</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Créez d&apos;abord une zone de contact dans l&apos;onglet « Zones » : son QR code dédié
              apparaîtra ici, prêt à imprimer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ---------- Aperçu du QR de la zone ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <QrCode className="h-5 w-5 text-primary" aria-hidden />
                {nomZone}
              </CardTitle>
              <CardDescription className="break-all">
                Pointe vers votre page de notation : {qr?.urlScan || "…"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="w-full max-w-56 rounded-2xl border-2 border-primary/20 bg-white p-3 shadow-sm">
                {qrLoading || !qr ? (
                  <Skeleton className="aspect-square w-full" />
                ) : (
                  <img
                    src={qr.pngDataUrl}
                    alt={`QR code de la zone ${nomZone}`}
                    className="w-full rounded-lg"
                  />
                )}
                <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-primary">
                  Votre avis compte
                </p>
                <p className="truncate text-center text-xs text-muted-foreground">{nomEtablissement}</p>
              </div>
              <Button variant="outline" size="sm" className="mt-4" onClick={copierLien} disabled={!qr?.urlScan}>
                {copied ? (
                  <Check className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
                ) : (
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                {copied ? "Lien copié !" : "Copier le lien de scan"}
              </Button>
            </CardContent>
          </Card>

          {/* ---------- Exports & impressions ---------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Téléchargements gratuits</CardTitle>
              <CardDescription>Prêts à imprimer, haute résolution — pour la zone sélectionnée</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <BoutonExport
                icone={Download}
                titre="PNG haute résolution"
                description="1000×1000 px, avec votre logo au centre — idéal pour vos mises en page"
                disabled={!qrPret || qrLoading}
                onClick={() => qr && telechargerPng(qr.pngDataUrl, `qr-${slugifier(nomZone)}.png`)}
              />
              <BoutonExport
                icone={FileText}
                titre="Affiche A4 « VOTRE AVIS COMPTE »"
                description={`QR 8×8 cm centré, zone « ${nomZone} », logo et sous-titre inclus`}
                disabled={!qrPret || qrLoading}
                onClick={() => qr && genererAffichePdf(qr.pngDataUrl, nomEtablissement, nomZone, logoDataUrl)}
              />
              <BoutonExport
                icone={Printer}
                titre="Planche de 20 étiquettes (5×5 cm)"
                description="PDF A4, grille 4×5 avec repères de découpe"
                disabled={!qrPret || qrLoading}
                onClick={() => qr && genererPlanchePdf(qr.pngDataUrl, nomEtablissement, nomZone)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ---------- Ligne de bouton d'export (empilée pleine largeur en mobile) ----------

function BoutonExport({
  icone: Icon,
  titre,
  description,
  disabled,
  onClick,
}: {
  icone: React.ComponentType<{ className?: string }>
  titre: string
  description: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
    >
      <div className="shrink-0 rounded-lg bg-primary/10 p-2.5" aria-hidden>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{titre}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}
