'use client'

// ============================================================
// <AirportZonesTab /> — Éditeur des 5 zones aéroport
// ------------------------------------------------------------
// Layout 2 colonnes (desktop) / empilé (mobile) :
//   ┌────────────┬─────────────────────────────────────────────┐
//   │ SIDEBAR    │  EDIT FORM                                  │
//   │ 5 zones    │   - emoji (preview large)                   │
//   │ + counts   │   - nom                                     │
//   │            │   - description                            │
//   │            │   - tags URL (array editor, max 10)         │
//   │            │   - problématiques (array editor, max 6)    │
//   │            │   - preview PWA (grille 2 col, gros boutons)│
//   │            │   - Save (emerald) / Reset                  │
//   └────────────┴─────────────────────────────────────────────┘
//
// APIs :
//   GET  /api/airport/zones                → { zones: [...] }
//   PUT  /api/airport/zones/[code]         body { nom?, emoji?, description?, tags?, problemes? }
//
// Comportement :
//   - Fetch initial au mount (default sélectionné : "sanitaires")
//   - Dirty tracking : Save activé seulement si modification
//   - Confirm dialog (window.confirm) si changement de zone avec
//     modifications non sauvegardées
//   - Toast succès/erreur via useToast
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bell,
  Check,
  Clock,
  Download,
  FileText,
  Loader2,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Search,
  Target,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

// ---------------------------------------------------------------
// Types (contrat API)
// ---------------------------------------------------------------

type Zone = {
  code: string
  nom: string
  emoji: string
  description: string | null
  tags: string[]
  problemes: string[]
  reportsCount: number
  id: string | null
}

type ZonesResponse = {
  ok: true
  data: { zones: Zone[] }
}

type ZoneUpdateResponse = {
  ok: true
  data: {
    zone: {
      code: string
      nom: string
      emoji: string
      description: string | null
      tags: string[]
      problemes: string[]
    }
  }
}

type ErrorResponse = {
  ok: false
  error: string
}

// ---------------------------------------------------------------
// Types QR code (API /api/airport/qrcode)
// ---------------------------------------------------------------

type QrApiResponse = {
  ok: true
  data: {
    url: string
    pngDataUrl: string
    tag: string
    zoneNom: string
    zoneEmoji: string
  }
} | ErrorResponse

type QrCacheEntry = {
  pngDataUrl?: string
  url?: string
  loading?: boolean
  error?: string
}

type QrCache = Record<string, QrCacheEntry>

// ---------------------------------------------------------------
// Validation helpers (client-side mirror of the API rules)
// ---------------------------------------------------------------

const TAG_REGEX = /^[a-zA-Z0-9_-]{2,40}$/

function validateTag(value: string): string | null {
  if (!value) return 'Tag vide'
  if (value.length < 2 || value.length > 40) return '2 à 40 caractères'
  if (!TAG_REGEX.test(value)) return 'Lettres, chiffres, - ou _ uniquement (2-40 caractères)'
  return null
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function validateProbleme(value: string): string | null {
  const t = value.trim()
  if (t.length < 3) return 'Au moins 3 caractères'
  if (t.length > 100) return 'Maximum 100 caractères'
  return null
}

// ---------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------

async function fetchZones(): Promise<Zone[]> {
  const res = await fetch('/api/airport/zones', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as ZonesResponse | ErrorResponse
  if (!json.ok) throw new Error(json.error)
  return json.data.zones
}

async function putZone(
  code: string,
  payload: {
    nom?: string
    emoji?: string
    description?: string | null
    tags?: string[]
    problemes?: string[]
  },
): Promise<ZoneUpdateResponse['data']['zone']> {
  const res = await fetch(`/api/airport/zones/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = (await res.json()) as ZoneUpdateResponse | ErrorResponse
  if (!json.ok) throw new Error(json.error)
  return json.data.zone
}

// ---------------------------------------------------------------
// Form state shape
// ---------------------------------------------------------------

type FormState = {
  emoji: string
  nom: string
  description: string
  tags: string[]
  problemes: string[]
}

function zoneToForm(z: Zone): FormState {
  return {
    emoji: z.emoji,
    nom: z.nom,
    description: z.description ?? '',
    tags: [...z.tags],
    problemes: [...z.problemes],
  }
}

function formsEqual(a: FormState, b: FormState): boolean {
  return (
    a.emoji === b.emoji &&
    a.nom === b.nom &&
    a.description === b.description &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i]) &&
    a.problemes.length === b.problemes.length &&
    a.problemes.every((p, i) => p === b.problemes[i])
  )
}

// ---------------------------------------------------------------
// Suggestions de tags (selon le code zone)
// ---------------------------------------------------------------

const TAG_SUGGESTIONS: Record<string, string[]> = {
  bagages: [
    'tapis_bagages_1',
    'tapis_bagages_4',
    'bagages_tapis_principal',
    'bagages_zone_recup',
    'chariots_central',
  ],
  sanitaires: [
    'toilettes_T2_porteB',
    'wc_hall_arrivee',
    'sanitaires_T1_nord',
    'wc_zone_embarquement',
    'soins_medical',
  ],
  files_attente: [
    'securite_flux_principal',
    'paf_immigration_T1',
    'securite_T2_sud',
    'paf_frontieres_nord',
    'file_prio_famille',
  ],
  embarquement: [
    'porte_A12',
    'lounge_coworking_T2',
    'porte_B07',
    'lounge_business_T1',
    'porte_C03',
  ],
  restauration: [
    'food_court_central',
    'duty_free_zone',
    'food_court_T2',
    'duty_free_T1',
    'cafe_comptoir_A',
  ],
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export default function AirportZonesTab() {
  const { toast } = useToast()

  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Onglet sélectionné — par défaut "sanitaires" (sanitaires et soins)
  const [selectedCode, setSelectedCode] = useState<string>('sanitaires')

  // État du formulaire (local, dirty) et référence "saved"
  const [form, setForm] = useState<FormState | null>(null)
  const [saved, setSaved] = useState<FormState | null>(null)
  const [saving, setSaving] = useState<boolean>(false)

  // --- Fetch initial ---
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const zs = await fetchZones()
      setZones(zs)
      // Si la zone sélectionnée n'existe pas (par ex. base vide), on
      // bascule sur la première disponible.
      if (zs.length > 0 && !zs.some((z) => z.code === selectedCode)) {
        setSelectedCode(zs[0].code)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [selectedCode])

  useEffect(() => {
    void load()
  }, [load])

  // Quand la zone sélectionnée change (ou que les zones arrivent),
  // on (ré)initialise le formulaire depuis la zone en cache.
  useEffect(() => {
    const z = zones.find((x) => x.code === selectedCode) ?? null
    if (z) {
      const f = zoneToForm(z)
      setForm(f)
      setSaved(f)
    } else if (zones.length === 0 && !loading) {
      setForm(null)
      setSaved(null)
    }
  }, [selectedCode, zones, loading])

  const dirty = useMemo<boolean>(() => {
    if (!form || !saved) return false
    return !formsEqual(form, saved)
  }, [form, saved])

  // --- Changement de zone sélectionnée avec confirm si dirty ---
  const selectZone = useCallback(
    (code: string) => {
      if (code === selectedCode) return
      if (dirty && !window.confirm('Des modifications non sauvegardées seront perdues. Continuer ?')) {
        return
      }
      setSelectedCode(code)
    },
    [dirty, selectedCode],
  )

  // --- Save ---
  const handleSave = useCallback(async () => {
    if (!form || !saved) return
    // Validation côté client (miroir des règles API)
    if (!form.nom.trim() || form.nom.trim().length < 2) {
      toast({ title: 'Nom trop court', description: 'Le nom doit faire au moins 2 caractères.', variant: 'destructive' })
      return
    }
    if (form.emoji.length === 0 || form.emoji.length > 8) {
      toast({ title: 'Emoji invalide', description: '1 à 8 caractères.', variant: 'destructive' })
      return
    }
    if (form.description.length > 200) {
      toast({ title: 'Description trop longue', description: 'Maximum 200 caractères.', variant: 'destructive' })
      return
    }
    for (const t of form.tags) {
      const err = validateTag(t)
      if (err) {
        toast({ title: `Tag invalide : ${t}`, description: err, variant: 'destructive' })
        return
      }
    }
    if (form.problemes.length === 0 || form.problemes.length > 6) {
      toast({ title: 'Problématiques', description: 'Entre 1 et 6 problématiques.', variant: 'destructive' })
      return
    }
    for (const p of form.problemes) {
      const err = validateProbleme(p)
      if (err) {
        toast({ title: 'Problématique invalide', description: `${p} — ${err}`, variant: 'destructive' })
        return
      }
    }

    setSaving(true)
    try {
      // On n'envoie que les champs modifiés
      const payload: {
        nom?: string
        emoji?: string
        description?: string | null
        tags?: string[]
        problemes?: string[]
      } = {}
      if (form.nom !== saved.nom) payload.nom = form.nom.trim()
      if (form.emoji !== saved.emoji) payload.emoji = form.emoji
      if ((form.description || null) !== (saved.description || null)) {
        payload.description = form.description.trim() || null
      }
      if (form.tags.join('|') !== saved.tags.join('|')) payload.tags = form.tags
      if (form.problemes.join('|') !== saved.problemes.join('|')) {
        payload.problemes = form.problemes.map((p) => p.trim())
      }

      if (Object.keys(payload).length === 0) {
        toast({ title: 'Rien à sauvegarder', description: 'Aucune modification détectée.' })
        setSaving(false)
        return
      }

      const updated = await putZone(selectedCode, payload)

      // Met à jour le cache zones avec la réponse
      setZones((prev) =>
        prev.map((z) =>
          z.code === selectedCode
            ? {
                ...z,
                nom: updated.nom,
                emoji: updated.emoji,
                description: updated.description,
                tags: updated.tags,
                problemes: updated.problemes,
              }
            : z,
        ),
      )

      const newSaved: FormState = {
        emoji: updated.emoji,
        nom: updated.nom,
        description: updated.description ?? '',
        tags: [...updated.tags],
        problemes: [...updated.problemes],
      }
      setForm(newSaved)
      setSaved(newSaved)

      toast({
        title: 'Zone mise à jour',
        description: `${updated.emoji} ${updated.nom} — configuration sauvegardée.`,
      })
    } catch (e) {
      toast({
        title: 'Erreur lors de la sauvegarde',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [form, saved, selectedCode, toast])

  // --- Reset ---
  const handleReset = useCallback(() => {
    if (!saved) return
    setForm({ ...saved, tags: [...saved.tags], problemes: [...saved.problemes] })
  }, [saved])

  // ---------------------------------------------------------------
  // QR codes — cache persistant (survit aux changements de zone)
  // ---------------------------------------------------------------
  // Pour chaque tag URL d'une zone, on pré-charge l'aperçu PNG
  // (data URL base64) depuis /api/airport/qrcode. Le cache est keyé
  // par tag : changer de zone ne déclenche pas de refetch si le tag
  // est déjà connu. Le manager peut ensuite télécharger le PNG ou
  // générer un poster A4 PDF pour impression.
  // ---------------------------------------------------------------
  const [qrCache, setQrCache] = useState<QrCache>({})
  const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({})
  const fetchedTagsRef = useRef<Set<string>>(new Set())

  const fetchQr = useCallback(async (tag: string) => {
    setQrCache((prev) => ({
      ...prev,
      [tag]: { ...prev[tag], loading: true, error: undefined },
    }))
    try {
      const res = await fetch(`/api/airport/qrcode?tag=${encodeURIComponent(tag)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as QrApiResponse
      if (!json.ok) throw new Error(json.error)
      setQrCache((prev) => ({
        ...prev,
        [tag]: { pngDataUrl: json.data.pngDataUrl, url: json.data.url, loading: false },
      }))
    } catch (e) {
      setQrCache((prev) => ({
        ...prev,
        [tag]: { loading: false, error: e instanceof Error ? e.message : 'Erreur' },
      }))
    }
  }, [])

  // Fetch automatique des QR manquants quand les tags du formulaire
  // changent. Le ref + le cache garantissent qu'on ne refetch pas un
  // tag déjà chargé (même après changement de zone ou édition).
  useEffect(() => {
    if (!form) return
    const validTags = form.tags.filter((t) => validateTag(t) === null)
    for (const t of validTags) {
      if (fetchedTagsRef.current.has(t)) continue
      const entry = qrCache[t]
      if (entry?.pngDataUrl || entry?.loading) continue
      fetchedTagsRef.current.add(t)
      void fetchQr(t)
    }
  }, [form, qrCache, fetchQr])

  const handleDownloadPng = useCallback(
    (tag: string) => {
      const entry = qrCache[tag]
      if (!entry?.pngDataUrl) return
      const a = document.createElement('a')
      a.href = entry.pngDataUrl
      a.download = `${tag}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
    [qrCache],
  )

  const handleDownloadPdf = useCallback(
    async (tag: string) => {
      setPdfLoading((prev) => ({ ...prev, [tag]: true }))
      toast({ title: 'Génération du PDF…', description: `Poster A4 pour « ${tag} »` })
      try {
        const res = await fetch(
          `/api/airport/qrcode?tag=${encodeURIComponent(tag)}&format=pdf`,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const objUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objUrl
        a.download = `${tag}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(objUrl), 2000)
      } catch (e) {
        toast({
          title: 'Erreur PDF',
          description: e instanceof Error ? e.message : 'Erreur inconnue',
          variant: 'destructive',
        })
      } finally {
        setPdfLoading((prev) => {
          const next = { ...prev }
          delete next[tag]
          return next
        })
      }
    },
    [toast],
  )

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-128px)] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Chargement des zones…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-128px)] items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-rose-600" />
          <div>
            <p className="font-semibold text-rose-700">Erreur de chargement</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Réessayer
          </Button>
        </div>
      </div>
    )
  }

  if (zones.length === 0 || !form) {
    return (
      <div className="flex h-[calc(100vh-128px)] items-center justify-center text-muted-foreground">
        Aucune zone aéroport configurée.
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-128px)] flex-col lg:flex-row">
      {/* ---------- SIDEBAR ---------- */}
      <aside className="w-full shrink-0 overflow-x-auto border-b border-border bg-card/40 lg:w-64 lg:border-b-0 lg:border-r lg:overflow-y-auto">
        <div className="flex gap-2 p-3 lg:flex-col lg:gap-1">
          <div className="mb-2 hidden items-center justify-between lg:flex">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Zones aéroport
            </h2>
            <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
              {zones.length}
            </Badge>
          </div>
          {zones.map((z) => {
            const active = z.code === selectedCode
            return (
              <button
                key={z.code}
                type="button"
                onClick={() => selectZone(z.code)}
                className={cn(
                  'flex w-full shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
                  active
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground',
                )}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {z.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{z.nom}</div>
                  <div className="truncate text-[11px] text-muted-foreground/70">
                    <code className="font-mono">{z.code}</code>
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                    z.reportsCount > 0
                      ? 'bg-amber-500/20 text-amber-700'
                      : 'bg-muted/60 text-muted-foreground',
                  )}
                  title={`${z.reportsCount} signalement(s)`}
                >
                  {z.reportsCount}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ---------- EDIT FORM ---------- */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ZoneEditForm
          key={selectedCode}
          code={selectedCode}
          form={form}
          saved={saved}
          dirty={dirty}
          saving={saving}
          onChange={setForm}
          onSave={handleSave}
          onReset={handleReset}
          qrCache={qrCache}
          pdfLoading={pdfLoading}
          onDownloadPng={handleDownloadPng}
          onDownloadPdf={handleDownloadPdf}
          onRefetchQr={fetchQr}
        />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------
// Sous-composant : formulaire d'édition d'une zone
// ---------------------------------------------------------------

type ZoneEditFormProps = {
  code: string
  form: FormState
  saved: FormState | null
  dirty: boolean
  saving: boolean
  onChange: (next: FormState) => void
  onSave: () => void
  onReset: () => void
  qrCache: QrCache
  pdfLoading: Record<string, boolean>
  onDownloadPng: (tag: string) => void
  onDownloadPdf: (tag: string) => void
  onRefetchQr: (tag: string) => void
}

function ZoneEditForm({
  code,
  form,
  saved,
  dirty,
  saving,
  onChange,
  onSave,
  onReset,
  qrCache,
  pdfLoading,
  onDownloadPng,
  onDownloadPdf,
  onRefetchQr,
}: ZoneEditFormProps) {
  const suggestions = TAG_SUGGESTIONS[code] ?? []
  const unusedSuggestions = suggestions.filter((s) => !form.tags.includes(s))

  // --- mutations locales ---
  const patch = (p: Partial<FormState>) => onChange({ ...form, ...p })

  const updateTag = (idx: number, value: string) => {
    const next = [...form.tags]
    next[idx] = normalizeTag(value)
    patch({ tags: next })
  }
  const addTag = (value: string) => {
    const v = normalizeTag(value)
    if (!v || form.tags.includes(v) || form.tags.length >= 10) return
    patch({ tags: [...form.tags, v] })
  }
  const removeTag = (idx: number) => {
    patch({ tags: form.tags.filter((_, i) => i !== idx) })
  }

  const updateProbleme = (idx: number, value: string) => {
    const next = [...form.problemes]
    next[idx] = value
    patch({ problemes: next })
  }
  const addProbleme = () => {
    if (form.problemes.length >= 6) return
    patch({ problemes: [...form.problemes, ''] })
  }
  const removeProbleme = (idx: number) => {
    if (form.problemes.length <= 1) return
    patch({ problemes: form.problemes.filter((_, i) => i !== idx) })
  }

  // --- tags : champ "nouveau tag" local ---
  const [newTag, setNewTag] = useState('')
  const newTagErr = newTag ? validateTag(normalizeTag(newTag)) : null
  const submitNewTag = () => {
    if (newTagErr) return
    if (!newTag.trim()) return
    addTag(newTag)
    setNewTag('')
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Header du formulaire */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-2xl">
            {form.emoji || '📍'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {form.nom || 'Sans nom'}
              </h2>
              {dirty && (
                <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                  non sauvegardé
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70">
              Code zone : <code className="font-mono text-muted-foreground">{code}</code>
              {saved && (
                <span className="ml-2">
                  · {saved.tags.length} tag(s) · {saved.problemes.length} problématique(s)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={!dirty || saving}
            className="border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Réinitialiser
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={!dirty || saving}
            className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Sauvegarde…
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------- Colonne gauche : champs principaux ---------- */}
        <div className="flex flex-col gap-5">
          {/* Emoji + Nom côte à côte */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[100px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="zone-emoji" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Emoji
              </Label>
              <Input
                id="zone-emoji"
                value={form.emoji}
                onChange={(e) => patch({ emoji: e.target.value.slice(0, 8) })}
                maxLength={8}
                className="bg-card text-center text-2xl"
                placeholder="🚻"
              />
              <p className="text-[10px] text-muted-foreground/70">max 8 caractères</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="zone-nom" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nom de la zone
              </Label>
              <Input
                id="zone-nom"
                value={form.nom}
                onChange={(e) => patch({ nom: e.target.value.slice(0, 60) })}
                maxLength={60}
                className="bg-card"
                placeholder="Ex : Sanitaires et Soins"
              />
              <p className="text-[10px] text-muted-foreground/70">{form.nom.length}/60 caractères</p>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zone-desc" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Description (optionnel)
            </Label>
            <Textarea
              id="zone-desc"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value.slice(0, 200) })}
              maxLength={200}
              rows={2}
              className="bg-card resize-none"
              placeholder="Sous-titre affiché en haut de l'écran du voyageur"
            />
            <p className="text-[10px] text-muted-foreground/70">{form.description.length}/200 caractères</p>
          </div>

          {/* Tags URL */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Tags URL (QR codes)
              </Label>
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {form.tags.length}/10
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {form.tags.length === 0 && (
                <p className="rounded-md border border-dashed border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground/70">
                  Aucun tag. Ajoutez-en un ci-dessous.
                </p>
              )}
              {form.tags.map((t, i) => {
                const err = validateTag(t)
                return (
                  <div key={`tag-${i}`} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={t}
                        onChange={(e) => updateTag(i, e.target.value)}
                        className={cn(
                          'bg-card font-mono text-sm',
                          err && 'border-rose-500/50 focus-visible:ring-rose-500/20',
                        )}
                        placeholder="tapis_bagages_1"
                      />
                    </div>
                    {err && (
                      <span className="shrink-0 text-[10px] text-rose-600" title={err}>
                        <AlertCircle className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground/70 hover:bg-rose-500/10 hover:text-rose-600"
                      onClick={() => removeTag(i)}
                      aria-label="Supprimer ce tag"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>

            {/* Ajout d'un nouveau tag */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitNewTag()
                    }
                  }}
                  placeholder="nouveau_tag"
                  className="bg-card pl-8 font-mono text-sm"
                  disabled={form.tags.length >= 10}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={submitNewTag}
                disabled={!!newTagErr || !newTag.trim() || form.tags.length >= 10}
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {newTagErr && (
              <p className="text-[10px] text-rose-600">{newTagErr}</p>
            )}

            {/* Suggestions */}
            {unusedSuggestions.length > 0 && form.tags.length < 10 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Suggestions :
                </span>
                {unusedSuggestions.slice(0, 5).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTag(s)}
                    className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-600"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---------- Colonne droite : problématiques + preview ---------- */}
        <div className="flex flex-col gap-5">
          {/* Problématiques */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Problématiques (boutons rapides PWA)
              </Label>
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {form.problemes.length}/6
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {form.problemes.map((p, i) => {
                const err = validateProbleme(p)
                return (
                  <div key={`pb-${i}`} className="flex items-center gap-2">
                    <Input
                      value={p}
                      onChange={(e) => updateProbleme(i, e.target.value.slice(0, 100))}
                      className={cn(
                        'bg-card text-sm',
                        err && 'border-rose-500/50 focus-visible:ring-rose-500/20',
                      )}
                      placeholder="Ex : Tapis arrêté ou bloqué"
                      maxLength={100}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground/70 hover:bg-rose-500/10 hover:text-rose-600"
                      onClick={() => removeProbleme(i)}
                      disabled={form.problemes.length <= 1}
                      aria-label="Supprimer cette problématique"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>

            {form.problemes.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProbleme}
                className="self-start border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Ajouter une problématique
              </Button>
            )}

            <p className="text-[10px] text-muted-foreground/70">
              3 à 100 caractères par problématique · entre 1 et 6 boutons affichés sur la PWA voyageur.
            </p>
          </div>

          {/* Preview PWA */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Aperçu PWA voyageur
            </Label>
            <div className="rounded-lg border border-border bg-card/60 p-3">
              <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                <span className="text-xl">{form.emoji || '📍'}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {form.nom || 'Sans nom'}
                  </div>
                  {form.description && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {form.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {form.problemes
                  .filter((p) => p.trim().length > 0)
                  .map((p, i) => (
                    <div
                      key={`prev-${i}`}
                      className="flex min-h-[60px] items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-center text-xs font-medium text-amber-700"
                    >
                      {p}
                    </div>
                  ))}
                {form.problemes.filter((p) => p.trim().length > 0).length === 0 && (
                  <div className="col-span-2 rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground/70">
                    Aucune problématique à afficher
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Voici comment les boutons apparaîtront sur l'écran du voyageur après scan du QR code.
            </p>
          </div>

          {/* État sauvegardé */}
          {saved && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-card/40 p-3 text-[11px] text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-muted-foreground">Dernière version sauvegardée</p>
                <p className="mt-0.5">
                  {saved.emoji} {saved.nom} — {saved.tags.length} tag(s),{' '}
                  {saved.problemes.length} problématique(s).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- QR CODES (pleine largeur, sous la grille 2 col) ---------- */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            QR Codes
          </Label>
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
            {form.tags.length} tag(s)
          </span>
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground/70">
          Téléchargez et imprimez les QR codes pour chaque tag URL. Les voyageurs les scanneront
          pour signaler un problème.
        </p>

        {form.tags.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground/70">
            Ajoutez au moins un tag URL ci-dessus pour générer les QR codes.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {form.tags.map((tag) => {
              const entry = qrCache[tag]
              const tagErr = validateTag(tag)
              return (
                <QrCard
                  key={`qr-${tag}`}
                  tag={tag}
                  entry={entry}
                  tagErr={tagErr}
                  pdfLoading={!!pdfLoading[tag]}
                  onDownloadPng={() => onDownloadPng(tag)}
                  onDownloadPdf={() => void onDownloadPdf(tag)}
                  onRetry={() => onRefetchQr(tag)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- ALERTES & SEUILS (pleine largeur, sous les QR codes) ---------- */}
      <AlertThresholdsSection zoneCode={code} />

      {/* ---------- SLA TEMPS DE RÉSOLUTION (après les alertes) ---------- */}
      <SlaConfigSection zoneCode={code} />
    </div>
  )
}

type QrCardProps = {
  tag: string
  entry: QrCacheEntry | undefined
  tagErr: string | null
  pdfLoading: boolean
  onDownloadPng: () => void
  onDownloadPdf: () => void
  onRetry: () => void
}

function QrCard({
  tag,
  entry,
  tagErr,
  pdfLoading,
  onDownloadPng,
  onDownloadPdf,
  onRetry,
}: QrCardProps) {
  // L'URL publique renvoyée par l'API est absolue (ex: https://app…/?airport=tag).
  // On n'affiche que le chemin relatif pour rester lisible dans la carte.
  const rawUrl = entry?.url ?? `/?airport=${tag}`
  let urlDisplay = rawUrl
  try {
    const parsed = new URL(rawUrl)
    urlDisplay = parsed.pathname + parsed.search
  } catch {
    // rawUrl est déjà relative — on l'affiche telle quelle.
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4">
      {/* Aperçu QR (120×120) */}
      <div className="flex size-28 items-center justify-center rounded-lg border border-border bg-white p-1">
        {tagErr ? (
          <div className="flex flex-col items-center gap-1 text-center">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            <span className="text-[9px] text-rose-600">tag invalide</span>
          </div>
        ) : entry?.loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : entry?.error ? (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[10px] font-medium text-rose-600">QR indisponible</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={onRetry}
            >
              Réessayer
            </Button>
          </div>
        ) : entry?.pngDataUrl ? (
          <img
            src={entry.pngDataUrl}
            alt={`QR code ${tag}`}
            className="h-full w-full object-contain"
          />
        ) : null}
      </div>

      {/* Nom du tag (monospace) */}
      <code className="break-all text-center font-mono text-xs text-muted-foreground">
        {tag}
      </code>

      {/* URL publique scannée par le QR */}
      <span
        className="block max-w-full truncate text-[10px] text-muted-foreground/70"
        title={rawUrl}
      >
        {urlDisplay}
      </span>

      {/* Boutons de téléchargement */}
      <div className="mt-1 flex w-full gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDownloadPng}
          disabled={!entry?.pngDataUrl || entry?.loading}
          className="flex-1 border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          PNG
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDownloadPdf}
          disabled={pdfLoading || !!tagErr}
          className="flex-1 border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {pdfLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          PDF
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composant : AlertThresholdsSection
// ------------------------------------------------------------
// Section "ALERTES & SEUILS" affichée dans le formulaire d'édition
// d'une zone. Montre les seuils d'alerte applicables à cette zone
// (zoneCode === currentZone OU zoneCode === "ALL").
//
// APIs :
//   GET    /api/airport/thresholds                → tous les seuils
//   POST   /api/airport/thresholds                → crée un seuil
//   PUT    /api/airport/thresholds/[id]           → met à jour (debounce 500ms)
//   DELETE /api/airport/thresholds/[id]           → supprime
//
// Save est "inline" : chaque modification est envoyée après
// 500ms d'inactivité (ou sur blur du champ threshold).
// ============================================================

type ThresholdType =
  | 'SPIKE_15MIN'
  | 'SPIKE_30MIN'
  | 'SPIKE_1H'
  | 'PENDING_COUNT'
  | 'NO_RESOLUTION_HOURS'

type Threshold = {
  id: string
  zoneCode: string
  type: ThresholdType
  threshold: number
  active: boolean
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt: string
}

type ThresholdsResponse = {
  ok: true
  data: {
    thresholds: Threshold[]
    count: number
    zones: string[]
    types: ThresholdType[]
  }
}

type MutationResponse = {
  ok: true
  data: { threshold: Threshold }
} | { ok: false; error: string }

const THRESHOLD_TYPE_LABELS: Record<ThresholdType, string> = {
  SPIKE_15MIN: 'Pic 15 min',
  SPIKE_30MIN: 'Pic 30 min',
  SPIKE_1H: 'Pic 1 heure',
  PENDING_COUNT: 'File d\'attente (cumul)',
  NO_RESOLUTION_HOURS: 'Sans résolution (heures)',
}

const THRESHOLD_TYPE_HINTS: Record<ThresholdType, string> = {
  SPIKE_15MIN: 'Alerter si ≥ N signalements en 15 min',
  SPIKE_30MIN: 'Alerter si ≥ N signalements en 30 min',
  SPIKE_1H: 'Alerter si ≥ N signalements en 1 heure',
  PENDING_COUNT: 'Alerter si ≥ N signalements en attente (cumul)',
  NO_RESOLUTION_HOURS: 'Alerter si plus vieux signalement en attente > N heures',
}

const ALL_THRESHOLD_TYPES: ThresholdType[] = [
  'SPIKE_15MIN',
  'SPIKE_30MIN',
  'SPIKE_1H',
  'PENDING_COUNT',
  'NO_RESOLUTION_HOURS',
]

type AlertThresholdsSectionProps = {
  zoneCode: string
}

function AlertThresholdsSection({ zoneCode }: AlertThresholdsSectionProps) {
  const { toast } = useToast()
  const [all, setAll] = useState<Threshold[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [creating, setCreating] = useState<boolean>(false)
  const [savingId, setSavingId] = useState<Record<string, boolean>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // --- Chargement initial ---
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/airport/thresholds', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ThresholdsResponse | { ok: false; error: string }
      if (!json.ok) throw new Error((json as { ok: false; error: string }).error)
      setAll(json.data.thresholds)
    } catch (e) {
      toast({
        title: 'Erreur de chargement',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  // --- Seuils visibles : ceux qui s'appliquent à cette zone ---
  const visible = useMemo(() => {
    return all.filter(
      (t) => t.zoneCode === zoneCode || t.zoneCode === 'ALL',
    )
  }, [all, zoneCode])

  // --- Mutation PUT (debounce) ---
  const saveThreshold = useCallback(
    async (id: string, patch: Partial<Threshold>) => {
      setSavingId((prev) => ({ ...prev, [id]: true }))
      try {
        const res = await fetch(`/api/airport/thresholds/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const json = (await res.json()) as MutationResponse
        if (!json.ok) throw new Error(json.error)
        setAll((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...json.data.threshold } : t)),
        )
      } catch (e) {
        toast({
          title: 'Erreur de sauvegarde',
          description: e instanceof Error ? e.message : 'Erreur inconnue',
          variant: 'destructive',
        })
      } finally {
        setSavingId((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    },
    [toast],
  )

  // --- Modification locale d'un champ + debounce 500ms ---
  const updateField = useCallback(
    (id: string, patch: Partial<Threshold>) => {
      // Mise à jour locale immédiate (optimistic) pour la réactivité UI
      setAll((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      // Clear debounce existant pour ce id
      const existing = debounceRef.current[id]
      if (existing) clearTimeout(existing)
      // Nouveau debounce 500ms
      debounceRef.current[id] = setTimeout(() => {
        void saveThreshold(id, patch)
      }, 500)
    },
    [saveThreshold],
  )

  // Flush immédiat sur blur (sans attendre le debounce)
  const flushSave = useCallback(
    (id: string) => {
      const existing = debounceRef.current[id]
      if (existing) {
        clearTimeout(existing)
        delete debounceRef.current[id]
        // Récupère l'état local courant pour envoyer les vraies valeurs
        const current = all.find((t) => t.id === id)
        if (current) {
          void saveThreshold(id, {
            zoneCode: current.zoneCode,
            type: current.type,
            threshold: current.threshold,
            active: current.active,
          })
        }
      }
    },
    [all, saveThreshold],
  )

  // --- Suppression ---
  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Supprimer ce seuil d\'alerte ?')) return
      setDeletingId(id)
      try {
        const res = await fetch(`/api/airport/thresholds/${id}`, {
          method: 'DELETE',
        })
        const json = (await res.json()) as { ok: boolean; error?: string }
        if (!json.ok) throw new Error(json.error ?? 'Erreur suppression')
        setAll((prev) => prev.filter((t) => t.id !== id))
        toast({
          title: 'Seuil supprimé',
          description: 'L\'alerte ne sera plus déclenchée.',
        })
      } catch (e) {
        toast({
          title: 'Erreur de suppression',
          description: e instanceof Error ? e.message : 'Erreur inconnue',
          variant: 'destructive',
        })
      } finally {
        setDeletingId(null)
      }
    },
    [toast],
  )

  // --- Ajout d'un seuil (zoneCode par défaut = zone courante) ---
  const handleAdd = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/airport/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneCode,
          type: 'SPIKE_30MIN',
          threshold: 3,
          active: true,
        }),
      })
      const json = (await res.json()) as MutationResponse
      if (!json.ok) throw new Error(json.error)
      setAll((prev) => [...prev, json.data.threshold])
      toast({
        title: 'Seuil créé',
        description: `Nouvelle alerte sur ${zoneCode === 'ALL' ? 'toutes zones' : zoneCode}.`,
      })
    } catch (e) {
      toast({
        title: 'Erreur de création',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }, [zoneCode, toast])

  // Cleanup des timeouts au démontage
  useEffect(() => {
    const ref = debounceRef.current
    return () => {
      for (const k of Object.keys(ref)) {
        clearTimeout(ref[k])
      }
    }
  }, [])

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Alertes &amp; Seuils
        </Label>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
          {loading ? '…' : `${visible.length} seuil(s) applicable(s)`}
        </span>
      </div>
      <p className="-mt-1 text-[11px] text-muted-foreground/70">
        Détection automatique de pics de signalements et d'alertes de file d'attente.
        Les seuils "ALL" s'appliquent à toutes les zones.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card/40 p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement des seuils…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground/70">
          Aucun seuil configuré pour cette zone. Cliquez sur "Ajouter un seuil" pour
          activer la détection de pics.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Zone</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Seuil</th>
                <th className="px-3 py-2 text-center">Actif</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card/40">
              {visible.map((t) => (
                <ThresholdRow
                  key={t.id}
                  threshold={t}
                  saving={!!savingId[t.id]}
                  deleting={deletingId === t.id}
                  onChange={(patch) => updateField(t.id, patch)}
                  onBlur={() => flushSave(t.id)}
                  onDelete={() => void handleDelete(t.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void handleAdd()}
        disabled={creating}
        className="self-start border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {creating ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1.5 h-3.5 w-3.5" />
        )}
        Ajouter un seuil
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------
// Sous-composant : ligne d'un seuil
// ---------------------------------------------------------------

type ThresholdRowProps = {
  threshold: Threshold
  saving: boolean
  deleting: boolean
  onChange: (patch: Partial<Threshold>) => void
  onBlur: () => void
  onDelete: () => void
}

function ThresholdRow({
  threshold,
  saving,
  deleting,
  onChange,
  onBlur,
  onDelete,
}: ThresholdRowProps) {
  return (
    <tr className="align-middle">
      {/* Zone */}
      <td className="px-3 py-2">
        <Select
          value={threshold.zoneCode}
          onValueChange={(v) => onChange({ zoneCode: v })}
        >
          <SelectTrigger className="h-8 w-32 border-border bg-card text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            <SelectItem value="ALL" className="text-xs">🌐 Toutes zones</SelectItem>
            <SelectItem value="bagages" className="text-xs">🛢️ Bagages</SelectItem>
            <SelectItem value="sanitaires" className="text-xs">🚻 Sanitaires</SelectItem>
            <SelectItem value="files_attente" className="text-xs">⏳ Files d'attente</SelectItem>
            <SelectItem value="embarquement" className="text-xs">🛋️ Embarquement</SelectItem>
            <SelectItem value="restauration" className="text-xs">🍽️ Restauration</SelectItem>
          </SelectContent>
        </Select>
      </td>

      {/* Type */}
      <td className="px-3 py-2">
        <Select
          value={threshold.type}
          onValueChange={(v) => onChange({ type: v as ThresholdType })}
        >
          <SelectTrigger className="h-8 w-44 border-border bg-card text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-card">
            {ALL_THRESHOLD_TYPES.map((ty) => (
              <SelectItem key={ty} value={ty} className="text-xs">
                {THRESHOLD_TYPE_LABELS[ty]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          {THRESHOLD_TYPE_HINTS[threshold.type]}
        </p>
      </td>

      {/* Seuil (number) */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={1000}
            value={threshold.threshold}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (Number.isFinite(n)) onChange({ threshold: n })
            }}
            onBlur={onBlur}
            className="h-8 w-20 border-border bg-card text-xs tabular-nums"
          />
          <span className="text-[10px] text-muted-foreground/70">
            {threshold.type === 'NO_RESOLUTION_HOURS' ? 'h' : 'signalements'}
          </span>
        </div>
      </td>

      {/* Actif */}
      <td className="px-3 py-2 text-center">
        <Switch
          checked={threshold.active}
          onCheckedChange={(checked) => onChange({ active: checked })}
        />
      </td>

      {/* Actions */}
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {saving && (
            <span className="text-[10px] text-muted-foreground/70">
              <Loader2 className="inline h-3 w-3 animate-spin" /> sauvegarde…
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/70 hover:bg-rose-500/10 hover:text-rose-600"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Supprimer ce seuil"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ============================================================
// Sous-composant : SlaConfigSection (Feature 3 — SLA)
// ------------------------------------------------------------
// Section "SLA TEMPS DE RÉSOLUTION" affichée sous les alertes.
// Pour la zone en cours d'édition :
//   - input numérique "Objectif de résolution (minutes)" ;
//   - bouton Save (et save-on-blur) qui PUT /api/airport/sla/[zoneCode] ;
//   - aperçu live "Sur les 24 dernières heures : X résolus, moyenne
//     Y min, Z% dans les délais" rafraîchi toutes les 30 s via le
//     wallboard (qui expose déjà le champ sla[code]).
//
// APIs :
//   GET /api/airport/wallboard  → data.sla[zoneCode]
//   PUT /api/airport/sla/[zoneCode] body { targetMinutes }
// ============================================================

type SlaStats = {
  targetMinutes: number | null
  resolvedCount: number
  avgResolutionMinutes: number | null
  slaCompliancePercent: number
  pendingBreaches: number
}

type WallboardSlaResponse = {
  ok: true
  data: {
    sla?: Record<string, SlaStats>
  }
}

type SlaPutResponse = {
  ok: true
  data: {
    sla: {
      zoneCode: string
      targetMinutes: number
      active: boolean
      updatedAt: string
    }
  }
}

type SlaGetResponse = {
  ok: true
  data: {
    slas: Array<{
      zoneCode: string
      zoneNom: string
      zoneEmoji: string
      targetMinutes: number | null
      active: boolean
      id: string | null
      updatedAt: string | null
    }>
  }
}

function SlaConfigSection({ zoneCode }: { zoneCode: string }) {
  const { toast } = useToast()

  // Target local (dirty tracking)
  const [target, setTarget] = useState<string>('') // string pour gérer le champ vide
  const [savedTarget, setSavedTarget] = useState<number | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [loaded, setLoaded] = useState<boolean>(false)

  // Stats live (depuis le wallboard)
  const [stats, setStats] = useState<SlaStats | null>(null)
  const [statsLoading, setStatsLoading] = useState<boolean>(true)

  // --- Charge la cible SLA initiale (GET /api/airport/sla) ---
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/airport/sla', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as SlaGetResponse | { ok: false; error: string }
        if (!json.ok) return
        const row = json.data.slas.find((s) => s.zoneCode === zoneCode)
        if (cancelled) return
        if (row) {
          setSavedTarget(row.targetMinutes)
          setTarget(row.targetMinutes !== null ? String(row.targetMinutes) : '')
        } else {
          setSavedTarget(null)
          setTarget('')
        }
        setLoaded(true)
      } catch {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [zoneCode])

  // --- Poll stats live toutes les 30s (depuis le wallboard) ---
  useEffect(() => {
    let cancelled = false
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/airport/wallboard', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as WallboardSlaResponse | { ok: false; error: string }
        if (!json.ok || !json.data) return
        const s = json.data.sla?.[zoneCode] ?? null
        if (!cancelled) {
          setStats(s)
          setStatsLoading(false)
        }
      } catch {
        if (!cancelled) setStatsLoading(false)
      }
    }
    void fetchStats()
    const t = setInterval(() => void fetchStats(), 30_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [zoneCode])

  const dirty = useMemo<boolean>(() => {
    if (!loaded) return false
    const cur = target.trim() === '' ? null : parseInt(target, 10)
    if (Number.isNaN(cur)) return false
    return cur !== savedTarget
  }, [target, savedTarget, loaded])

  const handleSave = useCallback(async () => {
    const trimmed = target.trim()
    if (trimmed === '') {
      toast({
        title: 'Objectif manquant',
        description: 'Saisissez un nombre de minutes (1 à 1440).',
        variant: 'destructive',
      })
      return
    }
    const n = parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n < 1 || n > 1440) {
      toast({
        title: 'Valeur invalide',
        description: 'L\'objectif doit être un entier entre 1 et 1440 minutes (24h).',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/airport/sla/${encodeURIComponent(zoneCode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMinutes: n }),
      })
      const json = (await res.json()) as SlaPutResponse | { ok: false; error: string }
      if (!json.ok) throw new Error(json.error)
      setSavedTarget(json.data.sla.targetMinutes)
      setTarget(String(json.data.sla.targetMinutes))
      toast({
        title: 'SLA mis à jour',
        description: `Objectif ${json.data.sla.targetMinutes} min pour la zone « ${zoneCode} ».`,
      })
    } catch (e) {
      toast({
        title: 'Erreur SLA',
        description: e instanceof Error ? e.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [target, zoneCode, toast])

  const complianceColor = (pct: number): string => {
    if (pct >= 80) return 'text-emerald-600'
    if (pct >= 60) return 'text-amber-600'
    return 'text-rose-600'
  }

  const avgColor = (avg: number | null, targetMin: number | null): string => {
    if (avg === null || targetMin === null) return 'text-muted-foreground'
    return avg <= targetMin ? 'text-emerald-600' : 'text-rose-600'
  }

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5 text-emerald-600" />
        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          SLA Temps de résolution
        </Label>
        <Badge
          variant="outline"
          className={cn(
            'ml-auto text-[10px]',
            savedTarget !== null
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
              : 'border-border text-muted-foreground',
          )}
        >
          {savedTarget !== null ? `${savedTarget} min` : 'Non défini'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
        {/* Input objectif */}
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="sla-target"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Objectif de résolution (minutes)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="sla-target"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={() => {
                if (dirty) void handleSave()
              }}
              placeholder="ex : 15"
              className="bg-card tabular-nums"
              disabled={saving || !loaded}
            />
            <span className="shrink-0 text-xs text-muted-foreground/70">min</span>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={!dirty || saving || !loaded}
              className={cn(
                'shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-800',
                !dirty && 'opacity-50',
              )}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground/70">
            Les signalements de cette zone doivent être résolus dans ce délai. Le wallboard affiche
            le respect du SLA en temps réel.
          </p>
        </div>

        {/* Aperçu live */}
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-3">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground/70" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Sur les 24 dernières heures
            </span>
            {statsLoading && (
              <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground/70" />
            )}
          </div>
          {stats ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Résolus
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                  {stats.resolvedCount}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Moyenne
                </span>
                <span
                  className={cn(
                    'font-mono text-lg font-bold tabular-nums',
                    avgColor(stats.avgResolutionMinutes, stats.targetMinutes),
                  )}
                >
                  {stats.avgResolutionMinutes !== null ? `${stats.avgResolutionMinutes} min` : '—'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Dans les délais
                </span>
                <span
                  className={cn(
                    'font-mono text-lg font-bold tabular-nums',
                    complianceColor(stats.slaCompliancePercent),
                  )}
                >
                  {stats.resolvedCount > 0 ? `${stats.slaCompliancePercent}%` : '—'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/70">
              {statsLoading ? 'Chargement…' : 'Aucune donnée disponible.'}
            </div>
          )}
          {stats && stats.pendingBreaches > 0 && (
            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-700">
              <AlertCircle className="h-3 w-3" />
              <span>
                {stats.pendingBreaches} signalement{stats.pendingBreaches > 1 ? 's' : ''} en attente
                dépasse{stats.pendingBreaches > 1 ? 'nt' : ''} le SLA
                {savedTarget !== null ? ` (${savedTarget} min)` : ''}.
              </span>
            </div>
          )}
          {stats && stats.pendingBreaches === 0 && stats.targetMinutes !== null && (
            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-700">
              <Check className="h-3 w-3" />
              <span>Aucun signalement en retard sur le SLA.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
