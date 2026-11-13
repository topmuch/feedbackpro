'use client'

// ============================================================
// <AirportStaffQrTab /> — Générateur + persistance des QR codes
// "Staff Only"
// ------------------------------------------------------------
// Permet au manager ops de générer et télécharger les QR codes
// que les employés scannent pour prendre en charge / résoudre
// un signalement. Les QR générés sont persistés en BDD
// (model AirportStaffQr) et réaffichés à chaque ouverture du tab.
//
// APIs :
//   GET  /api/airport/staff-qrs                → { qrs: [...] }
//   POST /api/airport/staff-qrs                → sauvegarde (upsert tag)
//        body { tag, label, zoneCode? }
//   DELETE /api/airport/staff-qrs/[id]         → supprime un enregistrement
//
//   GET /api/airport/staff-qrcode?tag=<tag>&format=png
//     → JSON { ok, data: { url, pngDataUrl, tag } }
//   GET /api/airport/staff-qrcode?tag=<tag>&format=pdf
//     → PDF A4 binaire (application/pdf)
//
// URL encodée : /?staff=<tag>
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  QrCode,
  Download,
  FileImage,
  FileText,
  Users,
  Loader2,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type PngResponse = {
  ok: true
  data: { url: string; pngDataUrl: string; tag: string }
} | { ok: false; error: string }

type Preset = {
  tag: string
  label: string
  emoji: string
}

type SavedQr = {
  id: string
  tag: string
  label: string
  zoneCode: string | null
  createdAt: string
  updatedAt: string
}

type ZoneLite = {
  code: string
  nom: string
  emoji: string
}

const PRESETS: readonly Preset[] = [
  { tag: 'staff_nettoyage_T1', label: 'Nettoyage T1', emoji: '🧹' },
  { tag: 'staff_nettoyage_T2', label: 'Nettoyage T2', emoji: '🧽' },
  { tag: 'staff_maintenance', label: 'Maintenance', emoji: '🔧' },
  { tag: 'staff_securite_T1', label: 'Sécurité T1', emoji: '🛡️' },
  { tag: 'staff_securite_T2', label: 'Sécurité T2', emoji: '🚨' },
  { tag: 'staff_accueil', label: 'Accueil', emoji: '👋' },
] as const

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Convertit une dataURL (base64 PNG) en Blob pour téléchargement. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Déclenche un téléchargement navigateur à partir d'un Blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Emoji zone deviné depuis le tag (fallback visuel). */
function emojiForTag(tag: string): string {
  const match = PRESETS.find((p) => p.tag === tag)
  if (match) return match.emoji
  if (tag.includes('nettoyage')) return '🧹'
  if (tag.includes('maintenance')) return '🔧'
  if (tag.includes('securite')) return '🛡️'
  if (tag.includes('accueil')) return '👋'
  return '🧑‍✈️'
}

/** Devine un label lisible depuis un tag (fallback). */
function labelForTag(tag: string): string {
  const match = PRESETS.find((p) => p.tag === tag)
  if (match) return match.label
  return tag
    .replace(/^staff_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export function AirportStaffQrTab() {
  const { toast } = useToast()
  const [tag, setTag] = useState('')
  const [label, setLabel] = useState('')
  const [zoneCode, setZoneCode] = useState<string>('')

  // Liste des zones aéroport (pour le select)
  const [zones, setZones] = useState<ZoneLite[]>([])

  // QR preview (généré à la volée)
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null)
  const [scanUrl, setScanUrl] = useState<string | null>(null)
  const [resolvedTag, setResolvedTag] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [downloadingPng, setDownloadingPng] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // QR codes persistés (chargés au mount)
  const [savedQrs, setSavedQrs] = useState<SavedQr[]>([])
  const [savedLoading, setSavedLoading] = useState<boolean>(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // --- Chargement initial : zones + QR persistés ---
  const loadSavedQrs = useCallback(async () => {
    setSavedLoading(true)
    try {
      const res = await fetch('/api/airport/staff-qrs', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as
        | { ok: true; data: { qrs: SavedQr[] } }
        | { ok: false; error: string }
      if (!json.ok) throw new Error(json.error)
      setSavedQrs(json.data.qrs)
    } catch (err) {
      toast({
        title: 'Erreur chargement QR sauvegardés',
        description: err instanceof Error ? err.message : 'Échec.',
        variant: 'destructive',
      })
    } finally {
      setSavedLoading(false)
    }
  }, [toast])

  const loadZones = useCallback(async () => {
    try {
      const res = await fetch('/api/airport/zones', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as
        | { ok: true; data: { zones: ZoneLite[] } }
        | { ok: false; error: string }
      if (!json.ok) return
      setZones(json.data.zones)
    } catch {
      // Silencieux : le select sera juste vide
    }
  }, [])

  useEffect(() => {
    void loadSavedQrs()
    void loadZones()
  }, [loadSavedQrs, loadZones])

  // ---------------------------------------------------------------
  // Générer (PNG via JSON) + sauvegarder en BDD
  // ---------------------------------------------------------------
  const generate = useCallback(async () => {
    const clean = tag.trim()
    if (!clean) {
      toast({
        title: 'Tag manquant',
        description: 'Saisissez un tag staff (ex : staff_nettoyage_T2).',
        variant: 'destructive',
      })
      return
    }
    setGenerating(true)
    setPngDataUrl(null)
    try {
      const res = await fetch(
        `/api/airport/staff-qrcode?tag=${encodeURIComponent(clean)}&format=png`,
        { cache: 'no-store' },
      )
      const json: PngResponse = await res.json()
      if (json.ok) {
        setPngDataUrl(json.data.pngDataUrl)
        setScanUrl(json.data.url)
        setResolvedTag(json.data.tag)
        toast({
          title: 'QR code généré',
          description: `Tag : ${json.data.tag}`,
        })

        // Persiste en BDD (upsert sur le tag)
        const finalLabel = label.trim() || labelForTag(json.data.tag)
        const finalZoneCode = zoneCode || null
        try {
          const saveRes = await fetch('/api/airport/staff-qrs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tag: json.data.tag,
              label: finalLabel,
              zoneCode: finalZoneCode,
            }),
          })
          const saveJson = (await saveRes.json()) as
            | { ok: true; data: { qr: SavedQr } }
            | { ok: false; error: string }
          if (saveJson.ok) {
            // Met à jour la liste locale (upsert par tag)
            setSavedQrs((prev) => {
              const idx = prev.findIndex((q) => q.tag === saveJson.data.qr.tag)
              if (idx === -1) return [saveJson.data.qr, ...prev]
              const next = [...prev]
              next[idx] = saveJson.data.qr
              return next
            })
            toast({
              title: 'QR sauvegardé',
              description: `« ${finalLabel} » ajouté à la liste persistante.`,
            })
          }
        } catch (saveErr) {
          // Échec save non bloquant — le QR reste affiché
          toast({
            title: 'Sauvegarde échouée',
            description:
              saveErr instanceof Error ? saveErr.message : 'Le QR est affiché mais non persisté.',
            variant: 'destructive',
          })
        }
      } else {
        toast({
          title: 'Erreur',
          description: 'error' in json ? json.error : 'Réponse API invalide.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erreur réseau',
        description: err instanceof Error ? err.message : 'Échec du fetch.',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }, [tag, label, zoneCode, toast])

  // ---------------------------------------------------------------
  // Téléchargements (depuis le tag résolu / le tag du champ)
  // ---------------------------------------------------------------
  const downloadPng = useCallback(
    async (overrideTag?: string) => {
      const clean = (overrideTag ?? resolvedTag ?? tag).trim()
      if (!clean) return
      setDownloadingPng(true)
      try {
        const res = await fetch(
          `/api/airport/staff-qrcode?tag=${encodeURIComponent(clean)}&format=png`,
          { cache: 'no-store' },
        )
        const json: PngResponse = await res.json()
        if (json.ok) {
          const blob = dataUrlToBlob(json.data.pngDataUrl)
          downloadBlob(blob, `qr-staff-${clean}.png`)
        }
      } catch (err) {
        toast({
          title: 'Erreur PNG',
          description: err instanceof Error ? err.message : 'Échec.',
          variant: 'destructive',
        })
      } finally {
        setDownloadingPng(false)
      }
    },
    [resolvedTag, tag, toast],
  )

  const downloadPdf = useCallback(
    async (overrideTag?: string) => {
      const clean = (overrideTag ?? resolvedTag ?? tag).trim()
      if (!clean) return
      setDownloadingPdf(true)
      try {
        const res = await fetch(
          `/api/airport/staff-qrcode?tag=${encodeURIComponent(clean)}&format=pdf`,
          { cache: 'no-store' },
        )
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const blob = await res.blob()
        downloadBlob(blob, `qr-staff-${clean}.pdf`)
        toast({ title: 'PDF A4 téléchargé', description: `qr-staff-${clean}.pdf` })
      } catch (err) {
        toast({
          title: 'Erreur PDF',
          description: err instanceof Error ? err.message : 'Échec.',
          variant: 'destructive',
        })
      } finally {
        setDownloadingPdf(false)
      }
    },
    [resolvedTag, tag, toast],
  )

  // --- Suppression d'un QR persisté ---
  const handleDeleteSaved = useCallback(
    async (qr: SavedQr) => {
      if (!window.confirm(`Supprimer le QR « ${qr.label} » (${qr.tag}) de la liste sauvegardée ?`)) {
        return
      }
      setDeletingId(qr.id)
      try {
        const res = await fetch(`/api/airport/staff-qrs/${qr.id}`, {
          method: 'DELETE',
        })
        const json = (await res.json()) as { ok: boolean; error?: string }
        if (!json.ok) throw new Error(json.error ?? 'Erreur suppression')
        setSavedQrs((prev) => prev.filter((q) => q.id !== qr.id))
        toast({
          title: 'QR supprimé',
          description: `« ${qr.label} » retiré de la liste.`,
        })
      } catch (err) {
        toast({
          title: 'Erreur suppression',
          description: err instanceof Error ? err.message : 'Échec.',
          variant: 'destructive',
        })
      } finally {
        setDeletingId(null)
      }
    },
    [toast],
  )

  // URL encodée affichée (calculée côté client pour preview temps réel)
  const encodedPreview = useMemo(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : ''
    const base = origin.replace(/\/$/, '')
    return `${base}/?staff=${encodeURIComponent(tag.trim())}`
  }, [tag])

  // Lookup zone label/emoji pour un zoneCode
  const zoneLookup = useMemo(() => {
    const map: Record<string, ZoneLite> = {}
    for (const z of zones) map[z.code] = z
    return map
  }, [zones])

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15">
            <QrCode className="size-5 text-amber-600 dark:text-amber-400" aria-hidden />
          </div>
          <div>
            <h1 className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              STAFF QR{' '}
              <span className="text-amber-600 dark:text-amber-400">— Générateur</span>
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3" aria-hidden />
              Générez et téléchargez les QR codes que les employés scannent
              pour prendre en charge / résoudre un signalement. Les QR sont
              sauvegardés et retrouvables à la réouverture.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-[10px] font-semibold text-amber-700">
          {savedLoading ? '…' : `${savedQrs.length} sauvegardé(s)`}
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,420px)]">
        {/* ---------- Formulaire + presets ---------- */}
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle className="font-mono text-sm font-semibold text-foreground">
              1. Tag staff + métadonnées
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="staff-tag" className="text-xs text-muted-foreground">
                Tag staff
              </Label>
              <Input
                id="staff-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="staff_nettoyage_T2"
                className="border-border bg-background font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-amber-500/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void generate()
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Préfixe{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                  staff_
                </code>{' '}
                recommandé. Évitez espaces et accents.
              </p>
            </div>

            {/* Label (libellé lisible) */}
            <div className="space-y-1.5">
              <Label htmlFor="staff-label" className="text-xs text-muted-foreground">
                Libellé (affiché dans la liste sauvegardée)
              </Label>
              <Input
                id="staff-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Nettoyage T2"
                className="border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-amber-500/40"
                maxLength={60}
              />
              <p className="text-[11px] text-muted-foreground">
                Laissez vide pour auto-déduire depuis le tag.
              </p>
            </div>

            {/* Zone (optionnel) */}
            <div className="space-y-1.5">
              <Label htmlFor="staff-zone" className="text-xs text-muted-foreground">
                Zone rattachée (optionnel)
              </Label>
              <Select
                value={zoneCode || '__none__'}
                onValueChange={(v) => setZoneCode(v === '__none__' ? '' : v)}
              >
                <SelectTrigger
                  id="staff-zone"
                  className="border-border bg-background text-sm text-foreground focus-visible:border-amber-500/40"
                >
                  <SelectValue placeholder="Aucune (QR générique)" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  <SelectItem value="__none__" className="text-xs">
                    Aucune (QR générique)
                  </SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z.code} value={z.code} className="text-xs">
                      <span className="mr-1">{z.emoji}</span> {z.nom}{' '}
                      <code className="ml-1 font-mono text-[10px] text-muted-foreground">
                        {z.code}
                      </code>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Sert uniquement de badge visuel dans la liste sauvegardée.
              </p>
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Tags fréquents
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const active = tag === p.tag
                  return (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => {
                        setTag(p.tag)
                        setLabel((prev) => prev || p.label)
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        active
                          ? 'border-amber-500/60 bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'border-border bg-background text-muted-foreground hover:border-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <span aria-hidden>{p.emoji}</span>
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* URL encodée */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                URL encodée
              </span>
              <div className="rounded-md border border-border bg-background p-2.5">
                <code className="break-all font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  {tag.trim() ? encodedPreview : '—'}
                </code>
              </div>
            </div>

            {/* Bouton générer */}
            <Button
              type="button"
              onClick={() => void generate()}
              disabled={generating || !tag.trim()}
              className="w-full border-0 bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              <span className="ml-1.5">
                {generating ? 'Génération…' : 'Générer + sauvegarder'}
              </span>
            </Button>
          </CardContent>
        </Card>

        {/* ---------- Aperçu + downloads ---------- */}
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle className="font-mono text-sm font-semibold text-foreground">
              2. Aperçu & téléchargement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {pngDataUrl ? (
              <div className="space-y-3">
                {/* Preview card */}
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {emojiForTag(resolvedTag ?? '')}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900">
                          STAFF ONLY
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {resolvedTag}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                      FeedbackPro
                    </span>
                  </div>
                  <div className="flex items-center justify-center bg-white p-4">
                    <img
                      src={pngDataUrl}
                      alt={`QR code staff ${resolvedTag ?? ''}`}
                      className="size-56 object-contain"
                    />
                  </div>
                </div>

                {/* Download buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void downloadPng()}
                    disabled={downloadingPng}
                    className="border-border bg-background text-foreground hover:border-amber-500/50 hover:bg-muted hover:text-amber-600 dark:hover:text-amber-300"
                  >
                    {downloadingPng ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileImage className="size-4" />
                    )}
                    <span className="ml-1.5">PNG</span>
                    <Download className="ml-1 size-3 opacity-60" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void downloadPdf()}
                    disabled={downloadingPdf}
                    className="border-border bg-background text-foreground hover:border-amber-500/50 hover:bg-muted hover:text-amber-600 dark:hover:text-amber-300"
                  >
                    {downloadingPdf ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    <span className="ml-1.5">PDF A4</span>
                    <Download className="ml-1 size-3 opacity-60" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <QrCode className="size-6 text-muted-foreground" aria-hidden />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Aucun QR généré
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Saisissez un tag staff (ou choisissez un preset), puis
                  cliquez sur « Générer + sauvegarder ».
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- QR codes persistés (Task Z1) ---------- */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-sm font-semibold text-foreground">
              3. QR codes sauvegardés
            </CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadSavedQrs()}
              disabled={savedLoading}
              className="border-border bg-background text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {savedLoading ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : null}
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {savedLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Chargement des QR sauvegardés…
            </div>
          ) : savedQrs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted/40">
                <QrCode className="size-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Aucun QR sauvegardé pour l'instant
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">
                  Génère un QR ci-dessus : il sera automatiquement persisté
                  et retrouvera ici à la prochaine ouverture.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedQrs.map((qr) => (
                <SavedQrCard
                  key={qr.id}
                  qr={qr}
                  zoneLabel={qr.zoneCode ? zoneLookup[qr.zoneCode]?.nom ?? null : null}
                  zoneEmoji={qr.zoneCode ? zoneLookup[qr.zoneCode]?.emoji ?? null : null}
                  deleting={deletingId === qr.id}
                  onDelete={() => void handleDeleteSaved(qr)}
                  onDownloadPng={() => void downloadPng(qr.tag)}
                  onDownloadPdf={() => void downloadPdf(qr.tag)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------
// Sous-composant : carte d'un QR sauvegardé
// ---------------------------------------------------------------

type SavedQrCardProps = {
  qr: SavedQr
  zoneLabel: string | null
  zoneEmoji: string | null
  deleting: boolean
  onDelete: () => void
  onDownloadPng: () => void
  onDownloadPdf: () => void
}

function SavedQrCard({
  qr,
  zoneLabel,
  zoneEmoji,
  deleting,
  onDelete,
  onDownloadPng,
  onDownloadPdf,
}: SavedQrCardProps) {
  // Mini QR preview chargé à la volée depuis l'API
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState<boolean>(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    void (async () => {
      try {
        const res = await fetch(
          `/api/airport/staff-qrcode?tag=${encodeURIComponent(qr.tag)}&format=png`,
          { cache: 'no-store' },
        )
        const json: PngResponse = await res.json()
        if (cancelled) return
        if (json.ok) {
          setPreview(json.data.pngDataUrl)
        } else {
          setPreviewError(json.error)
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : 'Erreur')
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [qr.tag])

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700">
      {/* Bandeau supérieur : label + zone badge */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-slate-50 to-muted/30 px-3 py-2 dark:from-slate-900/40 dark:to-slate-900/10">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-base" aria-hidden>
            {emojiForTag(qr.tag)}
          </span>
          <span className="truncate text-xs font-semibold text-foreground">
            {qr.label}
          </span>
        </div>
        {qr.zoneCode && (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/30 bg-emerald-500/5 text-[9px] font-semibold text-emerald-700"
            title={zoneLabel ? `Zone : ${zoneLabel}` : `Code zone : ${qr.zoneCode}`}
          >
            {zoneEmoji ? `${zoneEmoji} ` : ''}
            {zoneLabel ?? qr.zoneCode}
          </Badge>
        )}
      </div>

      {/* Mini QR preview */}
      <div className="flex flex-col items-center gap-2 px-3 py-4">
        <div className="flex size-24 items-center justify-center rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700">
          {previewLoading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : previewError ? (
            <span className="text-[9px] font-medium text-rose-600">QR indispo.</span>
          ) : preview ? (
            <img
              src={preview}
              alt={`QR code ${qr.tag}`}
              className="h-full w-full object-contain"
            />
          ) : null}
        </div>
        <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {qr.tag}
        </code>
      </div>

      {/* Download + delete */}
      <div className="mt-auto flex gap-2 border-t border-border/60 px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDownloadPng}
          className="flex-1 border-border bg-background text-xs text-foreground hover:bg-muted"
        >
          <FileImage className="mr-1 size-3" />
          PNG
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDownloadPdf}
          className="flex-1 border-border bg-background text-xs text-foreground hover:bg-muted"
        >
          <FileText className="mr-1 size-3" />
          PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Supprimer le QR ${qr.label}`}
          className="shrink-0 text-muted-foreground/70 hover:bg-rose-500/10 hover:text-rose-600"
        >
          {deleting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3" />
          )}
        </Button>
      </div>
    </div>
  )
}
