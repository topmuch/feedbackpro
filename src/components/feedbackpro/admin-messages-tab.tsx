'use client'

import { useEffect, useState } from 'react'
import { Mail, Phone, Building2, Trash2, CheckCircle2, Clock, Loader2, RefreshCw, Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ContactMsg = {
  id: string
  nom: string
  email: string
  typeEtablissement: string | null
  volume: string | null
  defi: string | null
  message: string
  statut: string
  createdAt: string
}

const DEFI_LABELS: Record<string, string> = {
  incidents: 'Gestion des incidents',
  satisfaction: 'Satisfaction client',
  reactivite: 'Réactivité staff',
  hygiene: 'Hygiène / propreté',
  maintenance: 'Maintenance',
  autre: 'Autre',
}

const SECTOR_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  aeroport: 'Aéroport',
  hotel: 'Hôtel',
  gare: 'Gare',
  hopital: 'Hôpital / Santé',
  erp: 'Établissement public',
  autre: 'Autre',
}

export function AdminMessagesTab() {
  const [messages, setMessages] = useState<ContactMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/messages', { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) setMessages(json.data.messages ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? messages : messages.filter(m => m.statut === filter)
  const nouveaux = messages.filter(m => m.statut === 'NOUVEAU').length

  const markAs = async (id: string, statut: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, statut } : m))
    try {
      await fetch(`/api/admin/messages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }) })
    } catch { /* ignore */ }
  }

  const deleteMsg = async (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
    try { await fetch(`/api/admin/messages/${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5257C9] to-[#7C3AED] text-white shadow-lg">
              <Inbox className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Messages</h1>
              <p className="text-sm text-muted-foreground">
                {nouveaux > 0 ? `${nouveaux} nouveau(x) message(s)` : 'Tous les messages sont traités'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </Button>
        </div>

        {/* Filtre */}
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous ({messages.length})</SelectItem>
              <SelectItem value="NOUVEAU">Nouveaux ({nouveaux})</SelectItem>
              <SelectItem value="LU">Lus ({messages.filter(m => m.statut === 'LU').length})</SelectItem>
              <SelectItem value="TRAITE">Traités ({messages.filter(m => m.statut === 'TRAITE').length})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
              <Inbox className="size-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucun message</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((msg) => (
              <Card key={msg.id} className={msg.statut === 'NOUVEAU' ? 'border-[#5257C9]/30 ring-1 ring-[#5257C9]/10' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5257C9] to-[#7C3AED] text-sm font-bold text-white">
                        {msg.nom.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-base">{msg.nom}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={msg.statut === 'NOUVEAU' ? 'default' : msg.statut === 'TRAITE' ? 'secondary' : 'outline'}>
                      {msg.statut === 'NOUVEAU' ? 'Nouveau' : msg.statut === 'LU' ? 'Lu' : 'Traité'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                      <Mail className="size-3" /> {msg.email}
                    </span>
                    {msg.typeEtablissement && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                        <Building2 className="size-3" /> {SECTOR_LABELS[msg.typeEtablissement] ?? msg.typeEtablissement}
                      </span>
                    )}
                    {msg.volume && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                        Volume: {msg.volume}
                      </span>
                    )}
                    {msg.defi && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                        Défi: {DEFI_LABELS[msg.defi] ?? msg.defi}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground">{msg.message}</p>
                  <div className="flex gap-2 pt-2">
                    {msg.statut === 'NOUVEAU' && (
                      <Button size="sm" variant="outline" onClick={() => markAs(msg.id, 'LU')}>
                        <CheckCircle2 className="mr-1 size-3" /> Marquer lu
                      </Button>
                    )}
                    {msg.statut !== 'TRAITE' && (
                      <Button size="sm" variant="outline" onClick={() => markAs(msg.id, 'TRAITE')}>
                        <CheckCircle2 className="mr-1 size-3" /> Marquer traité
                      </Button>
                    )}
                    <a href={`mailto:${msg.email}`}>
                      <Button size="sm" variant="outline">
                        <Mail className="mr-1 size-3" /> Répondre
                      </Button>
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => deleteMsg(msg.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
