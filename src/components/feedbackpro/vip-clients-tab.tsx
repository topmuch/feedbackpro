'use client'

// ============================================================
// VipClientsTab — Base Clients VIP (module fondamental)
// ------------------------------------------------------------
// - CRUD complet : nom, photo, compagnie, niveau, préférences,
//   allergies, consentements RGPD (photo + profil)
// - Import CSV depuis compagnie partenaire (coller un CSV ou
//   déposer un fichier, entête flexible, RGPD respecté)
// - Détection auto au scan (côté serveur) → alerte Maître d'Hôtel
// - Fiche détail : historique de visites + notes concierge
//   ("préfère rosé", "allergie arachides") + purge RGPD sur demande
// Style luxe lumineux : or/blanc, serif Playfair/Georgia.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Crown,
  Diamond,
  Sparkles,
  Users,
  Plus,
  Search,
  Plane,
  Coffee,
  Clock,
  Loader2,
  Upload,
  FileUp,
  Trash2,
  Pencil,
  StickyNote,
  History,
  ShieldAlert,
  ShieldCheck,
  X,
  Download,
  Camera,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const SERIF = { fontFamily: 'Georgia, "Playfair Display", serif' } as const

type VipLevel = 'gold' | 'platinum' | 'diamond'

interface VipClientRow {
  id: string
  name: string
  photo: string | null
  airline: string | null
  vipLevel: string
  boardingPassId: string | null
  preferences: string[]
  allergies: string[]
  consentPhoto: boolean
  consentProfil: boolean
  visitCount: number
  lastVisit: string | null
  notes: string | null
  nbNotes?: number
  createdAt: string
  updatedAt: string
}

interface NoteRow {
  id: string
  auteur: string
  contenu: string
  type: string
  createdAt: string
}

interface VisitRow {
  id: string
  canal: string
  tableNumber: string | null
  detection: string | null
  createdAt: string
}

const LEVEL_STYLES: Record<VipLevel, { label: string; bg: string; text: string; Icon: typeof Crown }> = {
  gold: { label: 'Gold', bg: 'bg-[#bc7155]/15', text: 'text-[#8B6F47]', Icon: Crown },
  platinum: { label: 'Platinum', bg: 'bg-[#bc7155]/12', text: 'text-[#bc7155]', Icon: Sparkles },
  diamond: { label: 'Diamond', bg: 'bg-[#bc7155]/12', text: 'text-[#bc7155]', Icon: Diamond },
}

const NOTE_TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  concierge: { label: 'Concierge', cls: 'bg-[#bc7155]/12 text-[#8B6F47]' },
  allergie: { label: 'Allergie', cls: 'bg-[#bc7155]/15 text-[#bc7155]' },
  preference: { label: 'Préférence', cls: 'bg-[#bc7155]/12 text-[#bc7155]' },
  service: { label: 'Service', cls: 'bg-[#bc7155]/12 text-[#bc7155]' },
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const CSV_TEMPLATE = `nom;compagnie;niveau;preferences;allergies;consent_photo;consent_profil
Awa Sow;Air Sénégal;gold;Jus de bissap|Coin calme;noix;oui;oui
Marc Dupuis;Emirates;platinum;Espresso double;;oui;oui`

export function VipClientsTab() {
  const { toast } = useToast()
  const [clients, setClients] = useState<VipClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('all')

  // Formulaire création / édition
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VipClientRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    photo: '',
    airline: '',
    vipLevel: 'gold' as VipLevel,
    preferences: '',
    allergies: '',
    notes: '',
    boardingPassId: '',
    consentPhoto: false,
    consentProfil: false,
  })

  // Import CSV
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [updateExisting, setUpdateExisting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; erreurs: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fiche détail
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<(VipClientRow & { visits: VisitRow[]; conciergeNotes: NoteRow[] }) | null>(null)
  const [noteContenu, setNoteContenu] = useState('')
  const [noteType, setNoteType] = useState('concierge')
  const [noteSaving, setNoteSaving] = useState(false)

  // Purge RGPD
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purgeConfirm, setPurgeConfirm] = useState('')

  const chargerClients = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/vip/clients', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) setClients(json.data ?? [])
      else throw new Error(json?.error ?? 'Erreur')
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les clients VIP.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    chargerClients()
  }, [chargerClients])

  const chargerDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true)
      const res = await fetch(`/api/vip/clients/${id}`, { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) setDetail(json.data)
      else throw new Error(json?.error ?? 'Erreur')
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger la fiche client.', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (detailId) {
      setDetail(null)
      chargerDetail(detailId)
    }
  }, [detailId, chargerDetail])

  // ---- Filtrage local
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const levelKey = String(c.vipLevel ?? 'gold').toLowerCase()
      if (filterLevel !== 'all' && levelKey !== filterLevel) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${c.name} ${c.airline ?? ''} ${c.boardingPassId ?? ''} ${c.preferences.join(' ')} ${c.allergies.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [clients, search, filterLevel])

  // ---- Création / édition
  const ouvrirCreation = () => {
    setEditing(null)
    setForm({ name: '', photo: '', airline: '', vipLevel: 'gold', preferences: '', allergies: '', notes: '', boardingPassId: '', consentPhoto: false, consentProfil: false })
    setFormOpen(true)
  }

  const ouvrirEdition = (c: VipClientRow) => {
    setEditing(c)
    setForm({
      name: c.name,
      photo: c.photo ?? '',
      airline: c.airline ?? '',
      vipLevel: (c.vipLevel as VipLevel) ?? 'gold',
      preferences: c.preferences.join(', '),
      allergies: c.allergies.join(', '),
      notes: c.notes ?? '',
      boardingPassId: c.boardingPassId ?? '',
      consentPhoto: c.consentPhoto,
      consentProfil: c.consentProfil,
    })
    setFormOpen(true)
  }

  const enregistrer = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Champ requis', description: 'Le nom du client est obligatoire.', variant: 'destructive' })
      return
    }
    if (!form.consentProfil) {
      toast({ title: 'Consentement requis', description: 'Le consentement profil (RGPD) du client est obligatoire.', variant: 'destructive' })
      return
    }
    if (form.photo.trim() && !form.consentPhoto) {
      toast({ title: 'Consentement photo requis', description: 'Impossible d’enregistrer une photo sans consentement photo explicite (RGPD).', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      const payload = {
        name: form.name.trim(),
        photo: form.consentPhoto && form.photo.trim() ? form.photo.trim() : null,
        airline: form.airline.trim(),
        vipLevel: form.vipLevel,
        preferences: form.preferences.split(',').map((t) => t.trim()).filter(Boolean),
        allergies: form.allergies.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim(),
        boardingPassId: form.boardingPassId.trim(),
        consentPhoto: form.consentPhoto,
        consentProfil: form.consentProfil,
      }
      const res = await fetch(editing ? `/api/vip/clients/${editing.id}` : '/api/vip/clients', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        toast({
          title: editing ? 'Client mis à jour' : 'Client ajouté',
          description: `${payload.name} · ${LEVEL_STYLES[form.vipLevel].label}`,
        })
        setFormOpen(false)
        chargerClients()
        if (editing && detailId === editing.id) chargerDetail(editing.id)
      } else {
        toast({ title: 'Erreur', description: json?.error ?? 'Enregistrement impossible.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Vérifiez votre connexion.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ---- Import CSV
  const lancerImport = async () => {
    if (!csvText.trim()) {
      toast({ title: 'CSV vide', description: 'Collez le contenu du CSV ou déposez un fichier.', variant: 'destructive' })
      return
    }
    try {
      setImporting(true)
      setImportResult(null)
      const res = await fetch('/api/vip/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, update: updateExisting }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setImportResult(json.data)
        chargerClients()
      } else {
        toast({ title: 'Import refusé', description: json?.error ?? 'CSV invalide.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Import impossible.', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const surFichier = async (file: File) => {
    const text = await file.text().catch(() => '')
    setCsvText(text)
  }

  // ---- Note concierge
  const ajouterNote = async () => {
    if (!detail || !noteContenu.trim()) return
    try {
      setNoteSaving(true)
      const res = await fetch(`/api/vip/clients/${detail.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: noteContenu.trim(), type: noteType, auteur: 'Concierge' }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        toast({ title: 'Note ajoutée', description: noteContenu.trim().slice(0, 60) })
        setNoteContenu('')
        chargerDetail(detail.id)
      } else {
        toast({ title: 'Erreur', description: json?.error ?? 'Ajout impossible.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Ajout impossible.', variant: 'destructive' })
    } finally {
      setNoteSaving(false)
    }
  }

  // ---- Purge RGPD
  const purgerClient = async () => {
    if (!detail) return
    try {
      const res = await fetch(`/api/vip/clients/${detail.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        toast({ title: 'Purge RGPD effectuée', description: `${detail.name} et son historique ont été supprimés.` })
        setPurgeOpen(false)
        setPurgeConfirm('')
        setDetailId(null)
        chargerClients()
      } else {
        toast({ title: 'Erreur', description: json?.error ?? 'Purge impossible.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Erreur réseau', description: 'Purge impossible.', variant: 'destructive' })
    }
  }

  const telechargerModele = () => {
    const blob = new Blob(['\uFEFF' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele-import-vip.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#2C2C2C]" style={SERIF}>
            Clients VIP
          </h2>
          <p className="mt-1 text-sm text-[#8B6F47]">
            Base clients du salon — détection auto au scan, alerte Maître d’Hôtel instantanée.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 border-[#bc7155]/40 bg-white text-[#8B6F47] hover:bg-[#bc7155]/10"
            onClick={() => { setImportResult(null); setImportOpen(true) }}
          >
            <FileUp className="h-4 w-4" aria-hidden /> Importer CSV
          </Button>
          <Button
            className="gap-2 bg-gradient-to-br from-[#bc7155] to-[#8B6F47] text-white hover:opacity-90"
            onClick={ouvrirCreation}
          >
            <Plus className="h-4 w-4" aria-hidden /> Ajouter client
          </Button>
        </div>
      </div>

      {/* Bandeau détection + RGPD */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg border border-[#bc7155]/25 bg-[#bc7155]/8 px-3 py-2 text-xs text-[#8B6F47]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#bc7155]" aria-hidden />
          <span>Détection automatique au scan QR ou à la saisie réception → alerte visuelle nom + photo au Maître d’Hôtel.</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[#bc7155]/25 bg-[#bc7155]/8 px-3 py-2 text-xs text-[#bc7155]">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>RGPD : consentements photo et profil obligatoires · purge totale sur demande du client.</span>
        </div>
      </div>

      {/* Filtres */}
      <Card className="border border-[#efe7e0] bg-white p-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B6F47]/60" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (nom, compagnie, préférence, allergie…)"
              className="border-[#efe7e0] bg-[#ffffff] pl-9 text-sm"
            />
          </div>
          <Select value={filterLevel} onValueChange={setFilterLevel}>
            <SelectTrigger className="w-[160px] border-[#efe7e0] bg-[#ffffff] text-sm">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous niveaux</SelectItem>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="platinum">Platinum</SelectItem>
              <SelectItem value="diamond">Diamond</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Chargement */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-[#8B6F47]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="ml-2 text-sm">Chargement des clients…</span>
        </div>
      )}

      {/* Cartes clients */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const levelKey = (String(c.vipLevel ?? 'gold').toLowerCase() as VipLevel)
            const ls = LEVEL_STYLES[levelKey] ?? LEVEL_STYLES.gold
            const LevelIcon = ls.Icon
            const lastVisit = c.lastVisit ? new Date(c.lastVisit) : null
            return (
              <Card
                key={c.id}
                className="cursor-pointer border border-[#efe7e0] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)] transition-shadow hover:shadow-[0_6px_24px_rgba(201,169,97,0.18)]"
                onClick={() => setDetailId(c.id)}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 ring-1 ring-[#efe7e0]">
                    {c.photo && c.consentPhoto && <AvatarImage src={c.photo} alt={c.name} />}
                    <AvatarFallback className="bg-[#bc7155]/15 text-sm font-semibold text-[#8B6F47]">
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-[#2C2C2C]" style={SERIF}>
                      {c.name}
                    </h3>
                    {c.airline && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#8B6F47]">
                        <Plane className="h-3 w-3" aria-hidden /> {c.airline}
                      </p>
                    )}
                    <Badge variant="outline" className={cn('mt-1.5 inline-flex items-center gap-1 border font-semibold', ls.bg, ls.text)}>
                      <LevelIcon className="h-3 w-3" aria-hidden /> {ls.label}
                    </Badge>
                  </div>
                </div>

                {c.allergies.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.allergies.map((a, i) => (
                      <span key={`al-${i}`} className="inline-flex items-center gap-1 rounded-full bg-[#bc7155]/12 px-2 py-0.5 text-[11px] font-medium text-[#bc7155]">
                        <ShieldAlert className="h-3 w-3" aria-hidden /> {a}
                      </span>
                    ))}
                  </div>
                )}
                {c.preferences.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.preferences.slice(0, 3).map((p, i) => (
                      <span key={`pr-${i}`} className="rounded-full bg-[#bc7155]/10 px-2 py-0.5 text-[11px] font-medium text-[#8B6F47]">
                        {p}
                      </span>
                    ))}
                    {c.preferences.length > 3 && (
                      <span className="rounded-full bg-[#efe7e0] px-2 py-0.5 text-[11px] text-[#8B6F47]">
                        +{c.preferences.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-[#efe7e0] pt-3 text-xs text-[#8B6F47]">
                  <span className="flex items-center gap-1">
                    <Coffee className="h-3 w-3" aria-hidden /> {c.visitCount} visite{c.visitCount > 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <StickyNote className="h-3 w-3" aria-hidden /> {c.nbNotes ?? 0} note{(c.nbNotes ?? 0) > 1 ? 's' : ''}
                  </span>
                  {lastVisit && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden /> {lastVisit.toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="border border-[#efe7e0] bg-white p-10 text-center shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
          <Users className="mx-auto h-8 w-8 text-[#8B6F47]/40" aria-hidden />
          <p className="mt-3 text-sm text-[#8B6F47]">Aucun client ne correspond à vos critères.</p>
        </Card>
      )}

      {/* ---------- Dialog création / édition ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-[#efe7e0] bg-white p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#2C2C2C]" style={SERIF}>
              {editing ? 'Modifier le client VIP' : 'Nouveau client VIP'}
            </DialogTitle>
            <DialogDescription className="text-[#8B6F47]">
              Consentements RGPD requis pour la photo et le profil du client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="vc-name" className="text-[#8B6F47]">Nom complet *</Label>
                <Input id="vc-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ex. Aminata Diallo" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
              </div>
              <div>
                <Label htmlFor="vc-airline" className="text-[#8B6F47]">Compagnie</Label>
                <Input id="vc-airline" value={form.airline} onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))} placeholder="ex. Air Sénégal" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="vc-level" className="text-[#8B6F47]">Niveau VIP</Label>
                <Select value={form.vipLevel} onValueChange={(v) => setForm((f) => ({ ...f, vipLevel: v as VipLevel }))}>
                  <SelectTrigger id="vc-level" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="diamond">Diamond</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="vc-pass" className="text-[#8B6F47]">Carte d’embarquement</Label>
                <Input id="vc-pass" value={form.boardingPassId} onChange={(e) => setForm((f) => ({ ...f, boardingPassId: e.target.value }))} placeholder="ex. SN205-4821" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
              </div>
            </div>
            <div>
              <Label htmlFor="vc-photo" className="flex items-center gap-1 text-[#8B6F47]">
                <Camera className="h-3.5 w-3.5" aria-hidden /> Photo (URL)
              </Label>
              <Input id="vc-photo" value={form.photo} onChange={(e) => setForm((f) => ({ ...f, photo: e.target.value }))} placeholder="https://…" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
            </div>
            <div>
              <Label htmlFor="vc-prefs" className="text-[#8B6F47]">Préférences (séparées par des virgules)</Label>
              <Input id="vc-prefs" value={form.preferences} onChange={(e) => setForm((f) => ({ ...f, preferences: e.target.value }))} placeholder="ex. Préfère rosé, Coin calme" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
            </div>
            <div>
              <Label htmlFor="vc-allergies" className="flex items-center gap-1 text-[#bc7155]">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Allergies (séparées par des virgules)
              </Label>
              <Input id="vc-allergies" value={form.allergies} onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))} placeholder="ex. Arachides, Fruits de mer" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
            </div>
            <div>
              <Label htmlFor="vc-notes" className="text-[#8B6F47]">Note générale</Label>
              <Input id="vc-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ex. Cliente fidèle depuis 2024" className="mt-1.5 border-[#efe7e0] bg-[#ffffff]" />
            </div>

            {/* RGPD */}
            <div className="space-y-3 rounded-xl border border-[#bc7155]/25 bg-[#bc7155]/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#bc7155]">Consentements RGPD</p>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-[#2C2C2C]">
                <Checkbox checked={form.consentProfil} onCheckedChange={(v) => setForm((f) => ({ ...f, consentProfil: Boolean(v) }))} className="mt-0.5" />
                <span>Le client a consenti explicitement à la création de son profil et au suivi de ses visites.</span>
              </label>
              <label className={cn('flex cursor-pointer items-start gap-3 text-sm text-[#2C2C2C]', !form.consentPhoto && form.photo.trim() && 'text-[#bc7155]')}>
                <Checkbox checked={form.consentPhoto} onCheckedChange={(v) => setForm((f) => ({ ...f, consentPhoto: Boolean(v) }))} className="mt-0.5" />
                <span>Le client a consenti explicitement à l’enregistrement de sa photo (diffusion interne Maître d’Hôtel uniquement).</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-[#efe7e0] text-[#8B6F47]" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button className="gap-2 bg-gradient-to-br from-[#bc7155] to-[#8B6F47] text-white hover:opacity-90" onClick={enregistrer} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog import CSV ---------- */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="border-[#efe7e0] bg-white p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#2C2C2C]" style={SERIF}>
              Import CSV — compagnie partenaire
            </DialogTitle>
            <DialogDescription className="text-[#8B6F47]">
              Entête flexible : nom, compagnie, niveau, préférences, allergies, consent_photo, consent_profil.
              Les clients sans consentement profil ne sont pas importés (RGPD).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 border-[#bc7155]/40 text-[#8B6F47]" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" aria-hidden /> Choisir un fichier
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-[#8B6F47]" onClick={telechargerModele}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Modèle
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) surFichier(f)
                  e.target.value = ''
                }}
              />
            </div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={CSV_TEMPLATE}
              rows={7}
              className="w-full rounded-lg border border-[#efe7e0] bg-[#ffffff] p-3 font-mono text-xs text-[#2C2C2C]"
            />
            <label className="flex cursor-pointer items-center gap-3 text-sm text-[#2C2C2C]">
              <Checkbox checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(Boolean(v))} />
              <span>Mettre à jour les clients déjà présents (sinon ils sont ignorés)</span>
            </label>
            {importResult && (
              <div className={cn('rounded-lg border p-3 text-xs', importResult.created > 0 ? 'border-[#bc7155]/30 bg-[#bc7155]/8 text-[#bc7155]' : 'border-[#bc7155]/30 bg-[#bc7155]/8 text-[#bc7155]')}>
                <p className="font-semibold">
                  {importResult.created} créé(s) · {importResult.updated} mis à jour · {importResult.skipped} ignoré(s)
                </p>
                {importResult.erreurs.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    {importResult.erreurs.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-[#efe7e0] text-[#8B6F47]" onClick={() => setImportOpen(false)}>
              Fermer
            </Button>
            <Button className="gap-2 bg-gradient-to-br from-[#bc7155] to-[#8B6F47] text-white hover:opacity-90" onClick={lancerImport} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {importing ? 'Import…' : 'Importer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Sheet fiche détail ---------- */}
      <Sheet open={Boolean(detailId)} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto border-[#efe7e0] bg-[#ffffff] p-0 sm:max-w-md">
          <SheetHeader className="border-b border-[#efe7e0] bg-white px-5 py-4">
            <SheetTitle className="text-left text-xl text-[#2C2C2C]" style={SERIF}>
              {detail?.name ?? 'Fiche client VIP'}
            </SheetTitle>
            <SheetDescription className="text-left text-[#8B6F47]">
              Historique de visites, préférences et notes concierge.
            </SheetDescription>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 text-[#8B6F47]"
              onClick={() => setDetailId(null)}
              aria-label="Fermer la fiche"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </SheetHeader>

          {detailLoading && (
            <div className="flex items-center justify-center py-16 text-[#8B6F47]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          )}

          {detail && (
            <div className="space-y-5 px-5 py-5">
              {/* Profil */}
              <Card className="border border-[#efe7e0] bg-white p-4 shadow-[0_4px_20px_rgba(201,169,97,0.06)]">
                <div className="flex items-start gap-3">
                  <Avatar className="h-14 w-14 ring-2 ring-[#bc7155]/40">
                    {detail.photo && detail.consentPhoto && <AvatarImage src={detail.photo} alt={detail.name} />}
                    <AvatarFallback className="bg-[#bc7155]/15 font-semibold text-[#8B6F47]">
                      {initials(detail.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-[#2C2C2C]" style={SERIF}>{detail.name}</p>
                    {detail.airline && (
                      <p className="flex items-center gap-1 text-xs text-[#8B6F47]">
                        <Plane className="h-3 w-3" aria-hidden /> {detail.airline}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {(() => {
                        const ls = LEVEL_STYLES[(detail.vipLevel as VipLevel)] ?? LEVEL_STYLES.gold
                        const Icon = ls.Icon
                        return (
                          <Badge variant="outline" className={cn('inline-flex items-center gap-1 border font-semibold', ls.bg, ls.text)}>
                            <Icon className="h-3 w-3" aria-hidden /> {ls.label}
                          </Badge>
                        )
                      })()}
                      <Badge variant="outline" className="border-[#efe7e0] text-[#8B6F47]">
                        <Coffee className="h-3 w-3" aria-hidden /> {detail.visitCount} visites
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-[#8B6F47] hover:bg-[#bc7155]/10" onClick={() => ouvrirEdition(detail)} aria-label="Modifier le client">
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                {/* Consentements RGPD */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#efe7e0] pt-3">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', detail.consentProfil ? 'bg-[#bc7155]/12 text-[#bc7155]' : 'bg-[#bc7155]/12 text-[#bc7155]')}>
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Profil : {detail.consentProfil ? 'consenti' : 'non consenti'}
                  </span>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', detail.consentPhoto ? 'bg-[#bc7155]/12 text-[#bc7155]' : 'bg-[#bc7155]/12 text-[#bc7155]')}>
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Photo : {detail.consentPhoto ? 'consenti' : 'non consenti'}
                  </span>
                </div>

                {/* Allergies — affichage proéminent (règle killer #2) */}
                {detail.allergies.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[#bc7155]/35 bg-[#bc7155]/8 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#bc7155]">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Allergies — à respecter en service
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {detail.allergies.map((a, i) => (
                        <span key={i} className="rounded-full bg-[#bc7155]/15 px-2 py-0.5 text-xs font-medium text-[#bc7155]">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Préférences */}
                {detail.preferences.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8B6F47]">Préférences</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {detail.preferences.map((p, i) => (
                        <span key={i} className="rounded-full bg-[#bc7155]/10 px-2 py-0.5 text-xs font-medium text-[#8B6F47]">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Notes concierge */}
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#2C2C2C]" style={SERIF}>
                  <StickyNote className="h-4 w-4 text-[#bc7155]" aria-hidden /> Notes concierge
                </h4>
                <div className="mt-2.5 space-y-2">
                  {detail.conciergeNotes.length === 0 && (
                    <p className="rounded-lg border border-dashed border-[#efe7e0] bg-white px-3 py-3 text-xs text-[#8B6F47]">
                      Aucune note pour ce client. Ajoutez « préfère rosé », « allergie arachides »…
                    </p>
                  )}
                  {detail.conciergeNotes.map((n) => {
                    const ts = NOTE_TYPE_STYLES[n.type] ?? NOTE_TYPE_STYLES.concierge
                    return (
                      <div key={n.id} className="rounded-lg border border-[#efe7e0] bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', ts.cls)}>
                            {ts.label}
                          </span>
                          <span className="text-[10px] text-[#8B6F47]">
                            {new Date(n.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {n.auteur}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-[#2C2C2C]">{n.contenu}</p>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 space-y-2 rounded-lg border border-[#efe7e0] bg-white p-3">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="h-8 w-full border-[#efe7e0] bg-[#ffffff] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concierge">Concierge</SelectItem>
                      <SelectItem value="preference">Préférence</SelectItem>
                      <SelectItem value="allergie">Allergie</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={noteContenu}
                    onChange={(e) => setNoteContenu(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') ajouterNote() }}
                    placeholder="ex. Préfère rosé bien frais"
                    className="border-[#efe7e0] bg-[#ffffff] text-sm"
                  />
                  <Button
                    size="sm"
                    className="w-full gap-1.5 bg-gradient-to-br from-[#bc7155] to-[#8B6F47] text-white hover:opacity-90"
                    onClick={ajouterNote}
                    disabled={noteSaving || !noteContenu.trim()}
                  >
                    {noteSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                    Ajouter la note
                  </Button>
                </div>
              </div>

              {/* Historique de visites */}
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#2C2C2C]" style={SERIF}>
                  <History className="h-4 w-4 text-[#bc7155]" aria-hidden /> Historique de visites
                </h4>
                <div className="mt-2.5 space-y-1.5">
                  {detail.visits.length === 0 && (
                    <p className="rounded-lg border border-dashed border-[#efe7e0] bg-white px-3 py-3 text-xs text-[#8B6F47]">
                      Aucune visite enregistrée pour l’instant.
                    </p>
                  )}
                  {detail.visits.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-[#efe7e0] bg-white px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-[#2C2C2C]">
                        <Clock className="h-3 w-3 text-[#bc7155]" aria-hidden />
                        {new Date(v.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[#8B6F47]">
                        {v.tableNumber ? `Table ${v.tableNumber} · ` : ''}
                        {v.canal === 'scan' ? 'Scan QR' : v.canal === 'reception' ? 'Réception' : 'Appareil reconnu'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Purge RGPD */}
              <div className="rounded-lg border border-[#bc7155]/35 bg-[#bc7155]/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#bc7155]">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Purge RGPD sur demande
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#8B6F47]">
                  Supprime définitivement le profil, les visites, les notes et les alertes. Action irréversible, tracée dans l’audit.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5 gap-1.5 border-[#bc7155]/40 text-[#bc7155] hover:bg-[#bc7155]/10"
                  onClick={() => setPurgeOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Purger ce client
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ---------- Dialog confirmation purge ---------- */}
      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent className="border-[#bc7155]/30 bg-white p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#bc7155]" style={SERIF}>Confirmer la purge RGPD</DialogTitle>
            <DialogDescription className="text-[#8B6F47]">
              Toutes les données de <strong>{detail?.name}</strong> seront supprimées définitivement
              (profil, {detail?.visitCount ?? 0} visite(s), notes, alertes). Tapez le nom du client pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={purgeConfirm}
            onChange={(e) => setPurgeConfirm(e.target.value)}
            placeholder={detail?.name ?? ''}
            className="border-[#bc7155]/40 bg-[#ffffff]"
          />
          <DialogFooter>
            <Button variant="outline" className="border-[#efe7e0] text-[#8B6F47]" onClick={() => { setPurgeOpen(false); setPurgeConfirm('') }}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={purgeConfirm !== detail?.name}
              onClick={purgerClient}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Purger définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
