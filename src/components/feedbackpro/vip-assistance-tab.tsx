'use client'

// ============================================================
// Onglet « Assistance » — Dashboard Salon VIP
// ------------------------------------------------------------
// Permet au salon VIP de contacter le superadmin FeedVoice en
// cas de problème (technique, compte, Wi-Fi/QR, fonctionnalité).
//
// CONNEXION SUPERADMIN : chaque message est enregistré comme
// ContactMessage (marqueur 'salon_vip_assistance') et arrive dans
// l'onglet « Messages » du superadmin avec le badge de non-lus.
// L'historique ci-dessous montre le suivi : NOUVEAU → LU → TRAITE.
//
// Palette « Luxe Lumineux » identique au dashboard VIP :
//   fond #ffffff · cartes blanches · or #bc7155 · bronze #8B6F47
//   texte #2C2C2C · succès #bc7155 · alerte #bc7155 · bord #efe7e0
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  LifeBuoy,
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  MailOpen,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type AssistanceMsg = {
  id: string
  categorie: string
  priorite: string
  message: string
  statut: string
  createdAt: string
}

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'technique', label: 'Problème technique' },
  { id: 'compte', label: 'Compte & facturation' },
  { id: 'wifi_qr', label: 'Wi-Fi / QR Codes' },
  { id: 'fonctionnalite', label: 'Demande de fonctionnalité' },
  { id: 'autre', label: 'Autre' },
]

const CATEGORIE_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
)

const STATUT_META: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
  NOUVEAU: {
    label: 'En attente de lecture',
    className: 'border-[#bc7155]/40 bg-[#bc7155]/10 text-[#8B6F47]',
    Icon: Clock,
  },
  LU: {
    label: 'Lu par l\u2019équipe',
    className: 'border-[#bc7155]/40 bg-[#bc7155]/10 text-[#bc7155]',
    Icon: MailOpen,
  },
  TRAITE: {
    label: 'Traité',
    className: 'border-[#bc7155]/40 bg-[#bc7155]/15 text-[#bc7155]',
    Icon: CheckCircle2,
  },
}

const MAX_MESSAGE = 2000

export function AssistanceTab() {
  const { toast } = useToast()
  const [categorie, setCategorie] = useState('technique')
  const [priorite, setPriorite] = useState('normale')
  const [message, setMessage] = useState('')
  const [envoiBusy, setEnvoiBusy] = useState(false)
  const [historique, setHistorique] = useState<AssistanceMsg[]>([])
  const [histoLoading, setHistoLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const chargerHistorique = useCallback(async () => {
    try {
      const res = await fetch('/api/vip/assistance', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) setHistorique(json.data ?? [])
    } catch {
      /* silencieux — on garde l'historique précédent */
    } finally {
      setHistoLoading(false)
    }
  }, [])

  useEffect(() => {
    chargerHistorique()
    // Polling doux : le statut passe NOUVEAU → LU quand le superadmin
    // ouvre le message dans son onglet « Messages ».
    const interval = setInterval(chargerHistorique, 45000)
    return () => clearInterval(interval)
  }, [chargerHistorique])

  const envoyer = async () => {
    const contenu = message.trim()
    if (!contenu) {
      toast({ title: 'Message vide', description: 'Décrivez votre problème avant d\u2019envoyer.', variant: 'destructive' })
      return
    }
    setEnvoiBusy(true)
    try {
      const res = await fetch('/api/vip/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorie, priorite, message: contenu }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'erreur')
      toast({
        title: priorite === 'urgente' ? 'Demande URGENTE envoyée' : 'Demande envoyée',
        description: 'Votre message est arrivé dans la boîte Messages de l\u2019équipe FeedVoice.',
      })
      setMessage('')
      setPriorite('normale')
      await chargerHistorique()
    } catch {
      toast({ title: 'Erreur', description: 'Impossible d\u2019envoyer la demande — réessayez.', variant: 'destructive' })
    } finally {
      setEnvoiBusy(false)
    }
  }

  const restants = MAX_MESSAGE - message.length

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* ---------- En-tête ---------- */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#bc7155] to-[#8B6F47] text-white shadow-[0_4px_14px_rgba(201,169,97,0.25)]">
          <LifeBuoy className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold text-[#2C2C2C]"
            style={{ fontFamily: 'Georgia, "Playfair Display", serif' }}
          >
            Assistance
          </h2>
          <p className="text-sm text-[#8B6F47]">
            Un problème ? Contactez directement l&apos;équipe FeedVoice — réponse sous 24 h ouvrées.
          </p>
        </div>
      </div>

      {/* ---------- Bandeau connexion superadmin ---------- */}
      <div className="flex items-center gap-2.5 rounded-xl border border-[#bc7155]/30 bg-[#bc7155]/8 px-4 py-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#bc7155]" aria-hidden />
        <p className="text-xs leading-relaxed text-[#bc7155]">
          <span className="font-semibold">Connexion directe</span> — vos messages arrivent dans
          l&apos;onglet <span className="font-semibold">« Messages » du superadmin</span> et y sont suivis
          (En attente → Lu → Traité). Les demandes urgentes sont marquées <span className="font-semibold">URGENT</span>.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ---------- Formulaire ---------- */}
        <Card className="border border-[#efe7e0] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)] lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8B6F47]">
            Nouvelle demande
          </h3>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="assistance-categorie" className="text-xs font-medium text-[#2C2C2C]">
                Catégorie
              </label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger
                  id="assistance-categorie"
                  className="mt-1.5 border-[#efe7e0] bg-white text-[#2C2C2C]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="assistance-priorite" className="text-xs font-medium text-[#2C2C2C]">
                Priorité
              </label>
              <Select value={priorite} onValueChange={setPriorite}>
                <SelectTrigger
                  id="assistance-priorite"
                  className="mt-1.5 border-[#efe7e0] bg-white text-[#2C2C2C]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normale">Normale — réponse sous 24 h ouvrées</SelectItem>
                  <SelectItem value="urgente">Urgente — service bloqué</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="assistance-message" className="text-xs font-medium text-[#2C2C2C]">
                Décrivez votre problème
              </label>
              <Textarea
                id="assistance-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                placeholder="Ex : le QR de la Table 4 n'ouvre plus la page Nathalie depuis ce matin…"
                rows={6}
                className="mt-1.5 resize-none border-[#efe7e0] bg-white text-sm text-[#2C2C2C] placeholder:text-[#8B6F47]/50"
              />
              <p
                className={cn(
                  'mt-1 text-right text-[11px] tabular-nums',
                  restants < 100 ? 'text-[#bc7155]' : 'text-[#8B6F47]/70',
                )}
              >
                {restants} caractères restants
              </p>
            </div>

            <Button
              onClick={() => void envoyer()}
              disabled={envoiBusy || !message.trim()}
              className={cn(
                'h-11 w-full gap-2 text-sm font-semibold',
                priorite === 'urgente'
                  ? 'bg-[#bc7155] text-white hover:bg-[#B86A52]'
                  : 'bg-[#bc7155] text-white hover:bg-[#B8975A]',
              )}
            >
              {envoiBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : priorite === 'urgente' ? (
                <AlertTriangle className="h-4 w-4" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {priorite === 'urgente' ? 'Envoyer en URGENT' : 'Envoyer au superadmin'}
            </Button>
          </div>
        </Card>

        {/* ---------- Historique / suivi ---------- */}
        <Card className="border border-[#efe7e0] bg-white p-5 shadow-[0_4px_20px_rgba(201,169,97,0.06)] lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8B6F47]">
              Mes demandes ({historique.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void chargerHistorique()}
              className="gap-1.5 text-xs text-[#8B6F47] hover:bg-[#bc7155]/10"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden /> Actualiser
            </Button>
          </div>

          {histoLoading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-[#8B6F47]" aria-hidden />
            </div>
          ) : historique.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <LifeBuoy className="h-10 w-10 text-[#8B6F47]/30" aria-hidden />
              <p className="text-sm font-medium text-[#2C2C2C]">Aucune demande pour le moment</p>
              <p className="max-w-sm text-xs leading-relaxed text-[#8B6F47]">
                Vos demandes d&apos;assistance apparaîtront ici avec leur statut de traitement par
                l&apos;équipe FeedVoice.
              </p>
            </div>
          ) : (
            <ul className="mt-3 max-h-[560px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
              {historique.map((m) => {
                const meta = STATUT_META[m.statut] ?? STATUT_META.NOUVEAU
                const StatutIcon = meta.Icon
                const estUrgent = m.priorite === 'urgente'
                const ouvert = expandedId === m.id
                const contenu = estUrgent && m.message.startsWith('[URGENT] ')
                  ? m.message.slice('[URGENT] '.length)
                  : m.message
                return (
                  <li
                    key={m.id}
                    className={cn(
                      'rounded-xl border bg-[#ffffff] transition-colors',
                      estUrgent ? 'border-[#bc7155]/40' : 'border-[#efe7e0]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(ouvert ? null : m.id)}
                      aria-expanded={ouvert}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#2C2C2C]">
                            {CATEGORIE_LABELS[m.categorie] ?? 'Autre'}
                          </span>
                          {estUrgent && (
                            <Badge className="border-0 bg-[#bc7155] text-[10px] font-bold uppercase tracking-wide text-white">
                              Urgent
                            </Badge>
                          )}
                          <Badge variant="outline" className={cn('h-5 gap-1 px-1.5 text-[10px] font-medium', meta.className)}>
                            <StatutIcon className="h-3 w-3" aria-hidden />
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#8B6F47]">
                          {new Date(m.createdAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        {!ouvert && (
                          <p className="mt-1.5 truncate text-xs text-[#8B6F47]/80">{contenu}</p>
                        )}
                      </div>
                      {ouvert ? (
                        <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-[#8B6F47]" aria-hidden />
                      ) : (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[#8B6F47]" aria-hidden />
                      )}
                    </button>
                    {ouvert && (
                      <div className="border-t border-[#efe7e0] px-4 pb-4 pt-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#2C2C2C]">
                          {contenu}
                        </p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
