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

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
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
    </div>
  )
}
