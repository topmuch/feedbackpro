'use client'

// ============================================================
// <VipLostFound /> — Module 2 · Comptoir Réception · Lost & Found
// ------------------------------------------------------------
// Vue STAFF (comptoir réception VIP). Permet de :
//   • Consulter la liste des objets trouvés (cards).
//   • Filtrer par statut : Tous / Trouvé / Réclamé / Retourné.
//   • Marquer un objet comme réclamé ou retourné (PATCH).
//   • Déclarer un nouvel objet trouvé (dialog avec formulaire).
//
// Palette « Luxe Lumineux » :
//   - Background   #ffffff    - Cards  #FFFFFF + shadow gold 6%
//   - Gold         #bc7155    - Bronze #8B6F47
//   - Text         #2C2C2C    - VIP    #bc7155
//   - Success      #bc7155    - Alert  #bc7155
//   - Border       #efe7e0
//
// APIs consommées :
//   GET   /api/vip/lost-found                → liste des objets
//   POST  /api/vip/lost-found                → déclare un objet
//         Body : { title, description?, category, tableNumber?, foundBy }
//   PATCH /api/vip/lost-found                → met à jour le statut
//         Body : { id, status: 'claimed' | 'returned', claimedBy? }
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Package,
  Plus,
  Check,
  Search,
  Loader2,
  X,
  RefreshCw,
  RotateCcw,
  HandHeart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ============================================================
// Types
// ============================================================

type ItemCategory =
  | 'electronics'
  | 'clothing'
  | 'accessories'
  | 'documents'
  | 'other'

type ItemStatus = 'found' | 'claimed' | 'returned'

type FilterKey = 'all' | ItemStatus

interface LostFoundItem {
  id: string
  title: string
  description: string | null
  category: ItemCategory
  tableNumber: string | null
  foundBy: string | null
  status: ItemStatus
  claimedBy: string | null
  returnedAt: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// Constantes & helpers
// ============================================================

const TITLE_FONT = {
  fontFamily: 'Georgia, "Playfair Display", serif',
} as const

const CARD_SHADOW = 'shadow-[0_4px_20px_rgba(201,169,97,0.06)]'

const CATEGORY_META: Record<
  ItemCategory,
  { label: string; emoji: string }
> = {
  electronics: { label: 'Électronique', emoji: '📱' },
  clothing: { label: 'Vêtements', emoji: '👕' },
  accessories: { label: 'Accessoires', emoji: '🕶️' },
  documents: { label: 'Documents', emoji: '📄' },
  other: { label: 'Autre', emoji: '📦' },
}

const STATUS_META: Record<
  ItemStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  found: {
    label: 'Trouvé',
    badgeClass:
      'bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]',
    dotClass: 'bg-[#bc7155]',
  },
  claimed: {
    label: 'Réclamé',
    badgeClass: 'bg-[#faf1ec] text-[#8a4f3b] border-[#e7c1ae]',
    dotClass: 'bg-[#bc7155]',
  },
  returned: {
    label: 'Retourné',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-500',
  },
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'found', label: 'Trouvé' },
  { key: 'claimed', label: 'Réclamé' },
  { key: 'returned', label: 'Retourné' },
]

/** Écart en minutes entre maintenant et une date ISO. */
function minutesSince(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 60_000))
}

/** Formate la date relative : "à l'instant" / "il y a X min" / "il y a X h". */
function relativeTime(iso: string): string {
  const mins = minutesSince(iso)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}

/** Formate une date ISO en "12 mars 2026 · 14:32". */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Récupère les métadonnées d'une catégorie (avec fallback "Autre"). */
function getCategoryMeta(cat: string): { label: string; emoji: string } {
  return (
    CATEGORY_META[cat as ItemCategory] ?? {
      label: cat,
      emoji: '📦',
    }
  )
}

// ============================================================
// Sous-composant : ItemCard
// ============================================================

interface ItemCardProps {
  item: LostFoundItem
  onMark: (item: LostFoundItem, status: ItemStatus) => void
  busy?: boolean
}

function ItemCard({ item, onMark, busy }: ItemCardProps) {
  const cat = getCategoryMeta(item.category)
  const status = STATUS_META[item.status]

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border border-[#efe7e0] bg-white p-5',
        'transition-all hover:border-[#bc7155]/30 hover:shadow-[0_8px_28px_rgba(201,169,97,0.10)]',
        CARD_SHADOW,
      )}
    >
      {/* Header : emoji + titre + statut */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            'bg-[#ffffff] ring-1 ring-[#efe7e0]',
          )}
        >
          <span
            aria-hidden
            className="text-2xl"
            style={{
              fontFamily: '"Apple Color Emoji","Segoe UI Emoji",sans-serif',
            }}
          >
            {cat.emoji}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-base font-semibold text-[#2C2C2C]"
            style={TITLE_FONT}
            title={item.title}
          >
            {item.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                'text-[11px] font-medium text-[#8B6F47]',
                'border-[#efe7e0] bg-[#ffffff]',
              )}
            >
              {cat.label}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                'text-[11px] font-semibold',
                status.badgeClass,
              )}
            >
              <span className={cn('size-1.5 rounded-full', status.dotClass)} />
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[#6b6b6b]">
          {item.description}
        </p>
      )}

      {/* Méta : table / trouvé par / date */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6b6b6b]">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
            Table
          </div>
          <div className="mt-0.5 font-medium text-[#2C2C2C]">
            {item.tableNumber ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
            Trouvé par
          </div>
          <div className="mt-0.5 font-medium text-[#2C2C2C]">
            {item.foundBy ?? '—'}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wide text-[#8B6F47]">
            Déclaré le
          </div>
          <div className="mt-0.5 font-medium text-[#2C2C2C]">
            {formatDate(item.createdAt)} · {relativeTime(item.createdAt)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || item.status === 'returned'}
          onClick={() => onMark(item, 'claimed')}
          className={cn(
            'flex-1 rounded-md border-[#e7c1ae] bg-[#faf1ec] text-xs font-semibold',
            'text-[#8a4f3b] hover:bg-[#f3ddd2] hover:text-[#6f3f30]',
            'disabled:opacity-50',
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <HandHeart className="size-3.5" />
          )}
          Marquer réclamé
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || item.status === 'returned'}
          onClick={() => onMark(item, 'returned')}
          className={cn(
            'flex-1 rounded-md border-slate-200 bg-slate-50 text-xs font-semibold',
            'text-slate-700 hover:bg-slate-100 hover:text-slate-800',
            'disabled:opacity-50',
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Marquer retourné
        </Button>
      </div>
    </article>
  )
}

// ============================================================
// Sous-composant : AddItemDialog
// ============================================================

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffName: string
  onCreated: (item: LostFoundItem) => void
}

function AddItemDialog({
  open,
  onOpenChange,
  staffName,
  onCreated,
}: AddItemDialogProps) {
  const { toast } = useToast()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ItemCategory>('other')
  const [tableNumber, setTableNumber] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  // Reset du formulaire à chaque ouverture
  useEffect(() => {
    if (open) {
      setTitle('')
      setCategory('other')
      setTableNumber('')
      setDescription('')
      setTouched(false)
    }
  }, [open])

  const titleValid = title.trim().length > 0
  const canSubmit = titleValid && !submitting

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setTouched(true)
      if (!titleValid) return

      setSubmitting(true)
      try {
        const payload = {
          title: title.trim(),
          category,
          tableNumber: tableNumber.trim() || undefined,
          description: description.trim() || undefined,
          foundBy: staffName,
        }

        const res = await fetch('/api/vip/lost-found', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        const body = await res.json().catch(() => null)
        if (!body || body.ok !== true || !body.data) {
          throw new Error(body?.error || 'Déclaration refusée')
        }
        const created = body.data as LostFoundItem
        toast({
          title: 'Objet déclaré',
          description: `${created.title} — enregistré avec succès.`,
        })
        onCreated(created)
        onOpenChange(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({
          title: 'Déclaration impossible',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        setSubmitting(false)
      }
    },
    [title, category, tableNumber, description, staffName, toast, onCreated, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border-[#efe7e0] bg-white p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-xl text-[#2C2C2C]"
            style={TITLE_FONT}
          >
            Déclarer un objet trouvé
          </DialogTitle>
          <DialogDescription className="text-[#6b6b6b]">
            Renseignez les informations pour tracer l'objet jusqu'à
            restitution.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Titre */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-title" className="text-[#8B6F47]">
              Objet <span className="text-[#bc7155]">*</span>
            </Label>
            <Input
              id="lf-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Téléphone iPhone 13 noir"
              maxLength={120}
              aria-invalid={touched && !titleValid}
              className={cn(
                'border-[#efe7e0] bg-white text-[#2C2C2C]',
                'focus-visible:border-[#bc7155] focus-visible:ring-[#bc7155]/30',
                touched && !titleValid && 'border-[#bc7155]',
              )}
            />
            {touched && !titleValid && (
              <p className="text-xs text-[#bc7155]">
                Le titre est obligatoire.
              </p>
            )}
          </div>

          {/* Catégorie */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-category" className="text-[#8B6F47]">
              Catégorie <span className="text-[#bc7155]">*</span>
            </Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ItemCategory)}
            >
              <SelectTrigger
                id="lf-category"
                className={cn(
                  'w-full border-[#efe7e0] bg-white text-[#2C2C2C]',
                  'focus-visible:border-[#bc7155] focus-visible:ring-[#bc7155]/30',
                )}
              >
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_META) as ItemCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    <span aria-hidden className="mr-1">
                      {CATEGORY_META[key].emoji}
                    </span>
                    {CATEGORY_META[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-table" className="text-[#8B6F47]">
              Table (optionnel)
            </Label>
            <Input
              id="lf-table"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="Ex. T-04"
              maxLength={20}
              className={cn(
                'border-[#efe7e0] bg-white text-[#2C2C2C]',
                'focus-visible:border-[#bc7155] focus-visible:ring-[#bc7155]/30',
              )}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-desc" className="text-[#8B6F47]">
              Description (optionnel)
            </Label>
            <Textarea
              id="lf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Couleur, état distinctif, contenu…"
              maxLength={1000}
              className={cn(
                'min-h-20 border-[#efe7e0] bg-white text-[#2C2C2C]',
                'focus-visible:border-[#bc7155] focus-visible:ring-[#bc7155]/30',
              )}
            />
          </div>

          {/* Found by */}
          <div className="rounded-lg bg-[#ffffff] px-3 py-2 text-xs text-[#8B6F47]">
            Déclaré par :{' '}
            <span className="font-semibold text-[#2C2C2C]">
              {staffName || 'Comptoir'}
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-[#8B6F47] hover:bg-[#ffffff] hover:text-[#2C2C2C]"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'h-10 rounded-md bg-[#bc7155] px-6 text-sm font-bold uppercase tracking-wide',
                'text-white hover:bg-[#B8974A] active:bg-[#A6863C]',
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Déclaration…
                </>
              ) : (
                <>
                  <Check className="size-4" /> Déclarer
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Composant principal
// ============================================================

export function VipLostFound({ staffName }: { staffName: string }) {
  const { toast } = useToast()

  // ----- State -----
  const [items, setItems] = useState<LostFoundItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ----- Fetch -----
  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false
      if (!silent) setRefreshing(true)
      try {
        const res = await fetch('/api/vip/lost-found', {
          credentials: 'include',
        })
        const body = await res.json().catch(() => null)
        if (!body || body.ok !== true || !Array.isArray(body.data)) {
          throw new Error('Liste indisponible')
        }
        setItems(body.data as LostFoundItem[])
      } catch (err) {
        if (silent) return
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({
          title: 'Chargement impossible',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        if (!silent) setRefreshing(false)
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void refresh({ silent: false })
  }, [refresh])

  // ----- Derived data -----
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (filter !== 'all' && it.status !== filter) return false
      if (!q) return true
      return (
        it.title.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q) ||
        (it.tableNumber ?? '').toLowerCase().includes(q) ||
        (it.foundBy ?? '').toLowerCase().includes(q) ||
        getCategoryMeta(it.category).label.toLowerCase().includes(q)
      )
    })
  }, [items, filter, search])

  const counts = useMemo(() => {
    const c = { all: items.length, found: 0, claimed: 0, returned: 0 }
    for (const it of items) c[it.status] += 1
    return c
  }, [items])

  // ----- Actions -----
  const handleCreated = useCallback((item: LostFoundItem) => {
    setItems((prev) => [item, ...prev])
  }, [])

  const handleMark = useCallback(
    async (item: LostFoundItem, nextStatus: ItemStatus) => {
      setBusyId(item.id)
      try {
        const res = await fetch('/api/vip/lost-found', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: item.id,
            status: nextStatus,
            claimedBy: nextStatus === 'claimed' ? staffName : null,
          }),
        })

        // Si le backend ne supporte pas PATCH (405), on bascule en
        // mode optimiste local pour préserver l'UX staff.
        if (res.status === 405) {
          toast({
            title: 'Mise à jour locale',
            description:
              'PATCH non supporté par le backend — appliqué en local uniquement.',
          })
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: nextStatus,
                    claimedBy:
                      nextStatus === 'claimed' ? staffName : it.claimedBy,
                    returnedAt:
                      nextStatus === 'returned'
                        ? new Date().toISOString()
                        : it.returnedAt,
                    updatedAt: new Date().toISOString(),
                  }
                : it,
            ),
          )
          return
        }

        const body = await res.json().catch(() => null)
        if (!body || body.ok !== true) {
          throw new Error(body?.error || 'Mise à jour refusée')
        }
        const updated = (body.data ?? null) as LostFoundItem | null
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? updated ?? {
                  ...it,
                  status: nextStatus,
                  claimedBy:
                    nextStatus === 'claimed' ? staffName : it.claimedBy,
                  returnedAt:
                    nextStatus === 'returned'
                      ? new Date().toISOString()
                      : it.returnedAt,
                  updatedAt: new Date().toISOString(),
                }
              : it,
          ),
        )
        toast({
          title:
            nextStatus === 'claimed'
              ? 'Objet réclamé'
              : 'Objet retourné',
          description: item.title,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau'
        toast({
          title: 'Mise à jour impossible',
          description: msg,
          variant: 'destructive',
        })
      } finally {
        setBusyId(null)
      }
    },
    [staffName, toast],
  )

  // ----- Render -----
  return (
    <div className="min-h-screen bg-[#ffffff] text-[#2C2C2C]">
      {/* ---------- Header ---------- */}
      <header
        className={cn(
          'sticky top-0 z-10 border-b border-[#efe7e0] bg-white/90 backdrop-blur',
          CARD_SHADOW,
        )}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-[#ffffff] ring-1 ring-[#efe7e0]">
            <Package className="size-5 text-[#8B6F47]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-lg leading-tight text-[#2C2C2C]"
              style={TITLE_FONT}
            >
              📦 Objets Trouvés
            </h1>
            <p className="text-xs text-[#8B6F47]">
              Comptoir Réception · {staffName || 'Staff'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh({ silent: false })}
            disabled={refreshing}
            aria-label="Rafraîchir"
            className={cn(
              'flex size-9 items-center justify-center rounded-full',
              'border border-[#efe7e0] bg-white text-[#8B6F47]',
              'transition-colors hover:border-[#bc7155]/50 hover:text-[#2C2C2C]',
              'disabled:opacity-50',
            )}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>

          <Button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(
              'h-9 rounded-md bg-[#bc7155] px-4 text-sm font-semibold text-white',
              'hover:bg-[#B8974A] active:bg-[#A6863C]',
            )}
          >
            <Plus className="size-4" /> Déclarer un objet
          </Button>
        </div>
      </header>

      {/* ---------- Toolbar : filtres + recherche ---------- */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div
          className={cn(
            'flex flex-col gap-3 rounded-xl border border-[#efe7e0] bg-white p-4',
            'sm:flex-row sm:items-center',
            CARD_SHADOW,
          )}
        >
          {/* Filtres */}
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const count = counts[f.key]
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    active
                      ? 'border-[#bc7155] bg-[#bc7155]/10 text-[#2C2C2C]'
                      : 'border-[#efe7e0] bg-[#ffffff] text-[#8B6F47] hover:border-[#bc7155]/40',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] font-semibold',
                      active
                        ? 'bg-[#bc7155] text-white'
                        : 'bg-white text-[#8B6F47]',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Recherche */}
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8B6F47]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (titre, table, catégorie…)"
              className={cn(
                'h-9 rounded-md border-[#efe7e0] bg-white pl-9 pr-9 text-sm text-[#2C2C2C]',
                'focus-visible:border-[#bc7155] focus-visible:ring-[#bc7155]/30',
              )}
            />
            {search && (
              <button
                type="button"
                aria-label="Effacer"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#8B6F47] hover:bg-[#ffffff] hover:text-[#2C2C2C]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Liste ---------- */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        {loading ? (
          <ItemGridSkeleton />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            hasItems={items.length > 0}
            onReset={() => {
              setFilter('all')
              setSearch('')
            }}
            onAdd={() => setAddOpen(true)}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onMark={handleMark}
                busy={busyId === item.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------- Add dialog ---------- */}
      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        staffName={staffName}
        onCreated={handleCreated}
      />
    </div>
  )
}

// ============================================================
// Sous-composants utilitaires
// ============================================================

function ItemGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-56 animate-pulse rounded-xl border border-[#efe7e0] bg-white',
            CARD_SHADOW,
          )}
        >
          <div className="flex h-full flex-col p-5">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-full bg-[#efe7e0]" />
              <div className="flex-1">
                <div className="h-4 w-3/4 rounded bg-[#efe7e0]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[#efe7e0]" />
              </div>
            </div>
            <div className="mt-4 h-3 w-full rounded bg-[#efe7e0]" />
            <div className="mt-2 h-3 w-2/3 rounded bg-[#efe7e0]" />
            <div className="mt-auto flex gap-2">
              <div className="h-8 flex-1 rounded bg-[#efe7e0]" />
              <div className="h-8 flex-1 rounded bg-[#efe7e0]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  hasItems,
  onReset,
  onAdd,
}: {
  hasItems: boolean
  onReset: () => void
  onAdd: () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-[#efe7e0]',
        'bg-white px-6 py-14 text-center',
        CARD_SHADOW,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-[#ffffff]">
        {hasItems ? (
          <Search className="size-7 text-[#8B6F47]" />
        ) : (
          <Package className="size-7 text-[#bc7155]" />
        )}
      </div>
      <h3
        className="mt-4 text-lg text-[#2C2C2C]"
        style={TITLE_FONT}
      >
        {hasItems
          ? 'Aucun objet ne correspond'
          : 'Aucun objet trouvé enregistré'}
      </h3>
      <p className="mt-2 max-w-md text-sm text-[#6b6b6b]">
        {hasItems
          ? 'Essayez de modifier votre recherche ou de réinitialiser les filtres.'
          : "Déclarez le premier objet trouvé au comptoir pour le tracer jusqu'à sa restitution."}
      </p>
      <div className="mt-5 flex gap-2">
        {hasItems ? (
          <Button
            variant="ghost"
            onClick={onReset}
            className="rounded-md border border-[#efe7e0] bg-white text-[#8B6F47] hover:bg-[#ffffff] hover:text-[#2C2C2C]"
          >
            <RotateCcw className="size-4" /> Réinitialiser les filtres
          </Button>
        ) : (
          <Button
            onClick={onAdd}
            className="rounded-md bg-[#bc7155] px-5 text-sm font-semibold text-white hover:bg-[#B8974A]"
          >
            <Plus className="size-4" /> Déclarer un objet
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Default export
// ============================================================

export default VipLostFound
