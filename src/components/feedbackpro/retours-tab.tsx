"use client"

// ============================================================
// FeedbackPro - Onglet "Retours clients" du dashboard Pro (pivot Zones)
// Tableau filtrable (note, zone, employé, statut, tag, dates) + pagination +
// modale de détail : réponse Pro éditable, action managériale éditable,
// timeline de l'historique des statuts
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Download,
  MailOpen,
  MessageSquareReply,
  RefreshCw,
  Loader2,
  Eye,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  X,
  Inbox,
  ArrowLeft,
  Send,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Stars, formatDate } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { exportToCsv } from "@/lib/export-csv"
import { ALL_TAGS, STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"

type StatutRetour = "NEW" | "IN_PROGRESS" | "RESOLVED"

// Retour renvoyé par GET/PATCH /api/pro/retours (pivot Zones)
type Retour = {
  id: string
  note: number
  tags: string[]
  commentaire: string | null
  personnelMentionne: string | null
  emailClient: string | null
  canalChoisi: string | null
  statut: StatutRetour
  historique: { statut: string; at: string }[]
  lu: boolean
  reponsePro: string | null
  actionPrise: string | null
  createdAt: string
  zone: { nom: string } | null
  employe: { nom: string } | null
  // D1 : NPS (0-10), null si non renseigné (note < 4)
  nps?: number | null
  // D2 : photo jointe (URL relative /uploads/…), null si aucune
  photoUrl?: string | null
}

type ZoneFiltre = { id: string; nom: string }

// Employé du filtre (GET /api/pro/employes → { employes: [{ id, nom, poste, actif, … }] })
type EmployeFiltre = { id: string; nom: string; poste?: string | null; actif?: boolean }

const PAGE_SIZE = 50

/** Garde-fou : renvoie toujours un tableau (l'API peut être en cours de migration) */
function enArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

// ---------- Helpers d'affichage ----------

/** Tronque un commentaire à ~60 caractères */
function tronquer(texte: string, max = 60): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte
}

/** Libellé du canal d'envoi */
function canalLabel(canal: string | null): string {
  if (!canal) return "—"
  if (canal === "whatsapp") return "via WhatsApp"
  if (canal === "google") return "via Google"
  return "via formulaire"
}

/** Badge de statut coloré : Nouveau rouge / En cours orange / Résolu vert */
function statutBadgeClass(statut: string): string {
  if (statut === "RESOLVED") return "border-green-300 bg-green-50 text-green-800"
  if (statut === "IN_PROGRESS") return "border-amber-300 bg-amber-50 text-amber-800"
  return "border-rose-300 bg-rose-50 text-rose-800"
}

/** Couleur de la pastille de la timeline de suivi */
function pastilleClass(statut: string): string {
  if (statut === "RESOLVED") return "bg-green-500"
  if (statut === "IN_PROGRESS") return "bg-amber-500"
  return "bg-rose-500"
}

export function RetoursTab() {
  const [items, setItems] = useState<Retour[]>([])
  const [zones, setZones] = useState<ZoneFiltre[]>([])
  const [employes, setEmployes] = useState<EmployeFiltre[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filtres (contrat API : note, zoneId, employeId, statut, tag, dateDebut, dateFin, page)
  const [fNote, setFNote] = useState("all")
  const [fZone, setFZone] = useState("all")
  const [fEmploye, setFEmploye] = useState("") // "" = tous les employés
  const [fStatut, setFStatut] = useState("all")
  const [fTag, setFTag] = useState("all")
  const [fDu, setFDu] = useState("") // dateDebut (AAAA-MM-JJ)
  const [fAu, setFAu] = useState("") // dateFin (AAAA-MM-JJ)

  // Modale de détail
  const [detail, setDetail] = useState<Retour | null>(null)
  const [editionReponse, setEditionReponse] = useState(false)
  const [texteReponse, setTexteReponse] = useState("")
  const [envoiReponse, setEnvoiReponse] = useState(false)
  const [editionAction, setEditionAction] = useState(false)
  const [texteAction, setTexteAction] = useState("")
  const [envoiAction, setEnvoiAction] = useState(false)
  const reponseRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLTextAreaElement>(null)

  const { toast } = useToast()

  // Chargement des listes de filtrage : zones + employés (en parallèle)
  useEffect(() => {
    let annule = false
    fetch("/api/pro/zones", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!annule && j.ok) setZones(enArray(j.data.zones))
      })
      .catch(() => {
        /* silencieux : le filtre zone restera simplement vide */
      })
    fetch("/api/pro/employes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!annule && j.ok) setEmployes(enArray(j.data.employes))
      })
      .catch(() => {
        /* silencieux : le filtre employé restera simplement vide */
      })
    return () => {
      annule = true
    }
  }, [])

  const load = useCallback(
    async (p = page) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p) })
        if (fNote !== "all") params.set("note", fNote)
        if (fZone !== "all") params.set("zoneId", fZone)
        if (fEmploye) params.set("employeId", fEmploye)
        if (fStatut !== "all") params.set("statut", fStatut)
        if (fTag !== "all") params.set("tag", fTag)
        if (fDu) params.set("dateDebut", fDu)
        if (fAu) params.set("dateFin", fAu)
        const res = await fetch(`/api/pro/retours?${params.toString()}`, { cache: "no-store" })
        const json = await res.json()
        if (json.ok) {
          setItems(enArray(json.data.retours))
          setTotal(json.data.total ?? 0)
        } else {
          toast({ title: "Erreur", description: "Impossible de charger les retours", variant: "destructive" })
        }
      } catch {
        toast({ title: "Erreur", description: "Impossible de charger les retours", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    },
    [fNote, fZone, fEmploye, fStatut, fTag, fDu, fAu, page, toast]
  )

  // Rechargement quand un filtre ou la page change
  useEffect(() => {
    load(page)
  }, [fNote, fZone, fEmploye, fStatut, fTag, fDu, fAu, page, load])

  // Focus sur la zone de texte dès que le mode édition s'ouvre
  useEffect(() => {
    if (editionReponse) reponseRef.current?.focus()
  }, [editionReponse, detail?.id])

  useEffect(() => {
    if (editionAction) actionRef.current?.focus()
  }, [editionAction, detail?.id])

  // Mise à jour d'un retour (statut / lu / réponse / action) :
  // synchronise la liste ET l'item affiché dans la modale
  async function majRetour(id: string, data: { statut?: StatutRetour; lu?: boolean; reponsePro?: string; actionPrise?: string }) {
    try {
      const res = await fetch("/api/pro/retours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      })
      const json = await res.json()
      if (json.ok) {
        // La réponse serveur contient le retour à jour ({ retour })
        const maj = json.data.retour ?? json.data
        setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...maj } : r)))
        setDetail((prev) => (prev && prev.id === id ? { ...prev, ...maj } : prev))
      } else {
        toast({ title: "Erreur", description: json.error || "Mise à jour impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur", description: "Mise à jour impossible", variant: "destructive" })
    }
  }

  // Ouverture de la modale
  function ouvrirDetail(r: Retour) {
    setDetail(r)
    setTexteReponse(r.reponsePro || "")
    setTexteAction(r.actionPrise || "")
    setEditionReponse(false)
    setEditionAction(false)
  }

  function ouvrirReponse(r: Retour) {
    setDetail(r)
    setTexteReponse(r.reponsePro || "")
    setTexteAction(r.actionPrise || "")
    setEditionReponse(true)
    setEditionAction(false)
  }

  function fermerDetail() {
    setDetail(null)
    setEditionReponse(false)
    setEditionAction(false)
  }

  // Enregistrement de la réponse du commerçant.
  // Si le retour possède un email client → POST /api/pro/retours action=repondre
  // (enregistre reponsePro + envoie l'email au client via Resend si configuré).
  // Sinon → fallback PATCH (enregistre reponsePro sans envoi d'email).
  async function enregistrerReponse() {
    if (!detail || !texteReponse.trim()) return
    setEnvoiReponse(true)
    const message = texteReponse.trim()
    const statutPasse = detail.statut === "NEW"

    if (detail.emailClient) {
      // Envoi par email au client (et enregistrement de la réponse)
      try {
        const res = await fetch("/api/pro/retours", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "repondre", id: detail.id, message }),
        })
        const json = await res.json()
        if (json.ok) {
          const maj = json.data.retour ?? json.data
          setItems((prev) => prev.map((r) => (r.id === detail.id ? { ...r, ...maj } : r)))
          setDetail((prev) => (prev && prev.id === detail.id ? { ...prev, ...maj } : prev))
          toast({
            title: "Réponse envoyée par email ✓",
            description: `Le client recevra votre réponse à l'adresse ${detail.emailClient}.`,
          })
        } else {
          toast({
            title: "Erreur",
            description: json.error || "Envoi impossible",
            variant: "destructive",
          })
          setEnvoiReponse(false)
          return
        }
      } catch {
        toast({ title: "Erreur", description: "Envoi impossible pour le moment", variant: "destructive" })
        setEnvoiReponse(false)
        return
      }
    } else {
      // Pas d'email client : on enregistre juste la réponse interne (PATCH)
      await majRetour(detail.id, {
        reponsePro: message,
        lu: true,
        ...(statutPasse ? { statut: "IN_PROGRESS" as StatutRetour } : {}),
      })
      toast({
        title: "Réponse enregistrée",
        description: statutPasse
          ? "Le statut du retour est passé à « En cours » (le client n'a pas laissé d'email, réponse conservée en interne)."
          : "Le client n'a pas laissé d'email — réponse conservée en interne.",
      })
    }

    setEnvoiReponse(false)
    setEditionReponse(false)
  }

  // Enregistrement de l'action managériale (passe NEW → IN_PROGRESS)
  async function enregistrerAction() {
    if (!detail || !texteAction.trim()) return
    setEnvoiAction(true)
    const statutPasse = detail.statut === "NEW"
    await majRetour(detail.id, {
      actionPrise: texteAction.trim(),
      lu: true,
      ...(statutPasse ? { statut: "IN_PROGRESS" as StatutRetour } : {}),
    })
    setEnvoiAction(false)
    setEditionAction(false)
    toast({
      title: "Action managériale enregistrée",
      description: statutPasse ? "Le statut du retour est passé à « En cours »" : undefined,
    })
  }

  const nbPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const datesActives = fDu !== "" || fAu !== ""

  // Timeline de suivi : historique trié chronologiquement.
  // Pour les anciens retours (sans entrée "NEW"), on préfixe la création
  // afin que le suivi commence toujours par « Nouveau ».
  const historiqueAffiche: { statut: string; at: string }[] = detail
    ? (() => {
        const hist = enArray(detail.historique).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        if (hist.length === 0) return [{ statut: "NEW", at: detail.createdAt }]
        if (!hist.some((h) => h.statut === "NEW")) {
          return [{ statut: "NEW", at: detail.createdAt }, ...hist]
        }
        return hist
      })()
    : []

  // ---------- Vue détaillée pleine page d'un retour (remplace la modale) ----------
  if (detail) {
    return (
      <div className="space-y-5">
        {/* En-tête : retour + titre */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={fermerDetail} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour à la liste
          </Button>
          <h2 className="text-lg sm:text-xl font-semibold">Détail du retour</h2>
        </div>

        <Card>
          <CardContent className="space-y-5 p-4 sm:p-6">
            {/* En-tête : note, badges, date */}
            <div className="flex flex-wrap items-center gap-2">
              <Stars note={detail.note} size={16} />
              {!detail.lu && <Badge className="h-5 px-1.5 text-[10px]">Nouveau</Badge>}
              <Badge variant="outline" className={statutBadgeClass(detail.statut)}>
                {STATUT_RETOUR_LABEL[detail.statut] ?? detail.statut}
              </Badge>
              {/* D1 : badge NPS si renseigné (note ≥ 4) */}
              {typeof detail.nps === "number" && (
                <Badge
                  variant="outline"
                  className="h-5 gap-1 px-1.5 text-[10px] font-normal"
                  title="Net Promoter Score (0-10)"
                >
                  NPS {detail.nps}/10
                  {(detail.nps ?? 0) >= 9 ? " 🟢" : (detail.nps ?? 0) >= 7 ? " 🟡" : " 🔴"}
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(detail.createdAt)}</span>
            </div>

            {/* Grille d'infos : zone, employé, canal */}
            <div className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Zone concernée</p>
                {detail.zone?.nom ? (
                  <Badge variant="outline" className="h-6 gap-1 px-2 text-xs font-normal">
                    <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
                    {detail.zone.nom}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Employé concerné</p>
                {detail.employe?.nom || detail.personnelMentionne ? (
                  <p className="truncate">
                    {detail.employe?.nom}
                    {detail.employe?.nom && detail.personnelMentionne ? ` (${detail.personnelMentionne})` : detail.personnelMentionne || ""}
                  </p>
                ) : (
                  <span className="text-muted-foreground">Non spécifié</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Canal</p>
                <p>{canalLabel(detail.canalChoisi)}</p>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Reçu le</p>
                <p>{formatDate(detail.createdAt)}</p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tags</p>
              {detail.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="h-6 min-w-0 max-w-full px-2 text-xs font-normal"
                      title={tagLabel(t)}
                    >
                      <span className="truncate">{tagLabel(t)}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Aucun tag</span>
              )}
            </div>

            {/* Commentaire client */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Commentaire client</p>
              {detail.commentaire ? (
                <blockquote className="border-l-4 border-primary/30 bg-muted/50 px-4 py-3 text-sm italic leading-relaxed">
                  &ldquo;{detail.commentaire}&rdquo;
                </blockquote>
              ) : (
                <p className="text-sm italic text-muted-foreground">Aucun commentaire</p>
              )}
            </div>

            {/* D2 : photo jointe par le client (cliquable pour agrandir) */}
            {detail.photoUrl && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Photo jointe</p>
                <a href={detail.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                  <img
                    src={detail.photoUrl}
                    alt="Photo jointe au retour par le client"
                    className="max-h-64 rounded-lg border border-border object-cover transition-opacity hover:opacity-90"
                  />
                </a>
              </div>
            )}

            {/* Réponse du commerçant (éditable → POST repondre ou PATCH reponsePro) */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Réponse du commerçant
                {detail.emailClient ? (
                  <Badge variant="outline" className="ml-2 h-5 gap-1 px-1.5 text-[10px] font-normal text-blue-700">
                    <Send className="h-3 w-3" aria-hidden />
                    Email client : {detail.emailClient}
                  </Badge>
                ) : (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-normal text-amber-700">
                          Pas d&apos;email client
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Le client n&apos;a pas laissé d&apos;email — la réponse sera conservée en interne.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </p>
              {editionReponse ? (
                <div className="space-y-2">
                  <Textarea
                    ref={reponseRef}
                    id="reponse-pro"
                    rows={4}
                    value={texteReponse}
                    onChange={(e) => setTexteReponse(e.target.value)}
                    placeholder={
                      detail.emailClient
                        ? "Votre réponse sera envoyée par email au client."
                        : "Réponse conservée en interne (le client n'a pas laissé d'email)."
                    }
                    aria-label="Votre réponse"
                  />
                  <div className="flex justify-end gap-2">
                    {detail.reponsePro && (
                      <Button
                        variant="ghost"
                        className="h-10"
                        onClick={() => { setTexteReponse(detail.reponsePro || ""); setEditionReponse(false) }}
                      >
                        Annuler
                      </Button>
                    )}
                    <Button
                      className="h-10 px-4"
                      onClick={enregistrerReponse}
                      disabled={envoiReponse || !texteReponse.trim()}
                    >
                      {envoiReponse && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                      {detail.emailClient ? "Envoyer la réponse" : "Enregistrer"}
                    </Button>
                  </div>
                </div>
              ) : detail.reponsePro ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail.reponsePro}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-9"
                    onClick={() => { setTexteReponse(detail.reponsePro || ""); setEditionReponse(true) }}
                  >
                    <MessageSquareReply className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Modifier la réponse
                  </Button>
                </div>
              ) : (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* span pour porter le tooltip quand le bouton est désactivé */}
                      <span tabIndex={0} className="inline-block">
                        <Button
                          variant="outline"
                          className="h-10 pointer-events-auto"
                          onClick={() => { setTexteReponse(""); setEditionReponse(true) }}
                          // Désactivé seulement si pas d'email ET déjà une réponse enregistrée → non, on autorise la réponse interne
                        >
                          <MessageSquareReply className="mr-1.5 h-4 w-4" aria-hidden />
                          {detail.emailClient ? "Rédiger une réponse" : "Consigner une réponse interne"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!detail.emailClient && (
                      <TooltipContent>Le client n&apos;a pas laissé d&apos;email — la réponse sera conservée en interne.</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Action managériale prise (éditable → PATCH actionPrise) */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Action managériale prise</p>
              {editionAction ? (
                <div className="space-y-2">
                  <Textarea
                    ref={actionRef}
                    id="action-prise"
                    rows={4}
                    value={texteAction}
                    onChange={(e) => setTexteAction(e.target.value)}
                    placeholder="Ex : Recadrage verbal, formation produit programmée, réorganisation du créneau du soir…"
                    aria-label="Action managériale prise"
                  />
                  <div className="flex justify-end gap-2">
                    {detail.actionPrise && (
                      <Button
                        variant="ghost"
                        className="h-10"
                        onClick={() => { setTexteAction(detail.actionPrise || ""); setEditionAction(false) }}
                      >
                        Annuler
                      </Button>
                    )}
                    <Button
                      className="h-10 px-4"
                      onClick={enregistrerAction}
                      disabled={envoiAction || !texteAction.trim()}
                    >
                      {envoiAction && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                      Enregistrer
                    </Button>
                  </div>
                </div>
              ) : detail.actionPrise ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail.actionPrise}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-9"
                    onClick={() => { setTexteAction(detail.actionPrise || ""); setEditionAction(true) }}
                  >
                    <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Modifier l&apos;action
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => { setTexteAction(""); setEditionAction(true) }}
                >
                  <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden />
                  Consigner une action managériale
                </Button>
              )}
            </div>

            {/* Suivi du retour : timeline de l'historique des statuts */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Suivi du retour</p>
              <ol>
                {historiqueAffiche.map((h, i) => (
                  <li key={`${h.statut}-${h.at}-${i}`} className="relative flex items-start gap-2.5 pb-4 last:pb-0">
                    {i < historiqueAffiche.length - 1 && (
                      <span className="absolute top-4 bottom-0 left-[6px] w-px bg-border" aria-hidden />
                    )}
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${pastilleClass(h.statut)}`} aria-hidden />
                    <div className="min-w-0 text-xs">
                      <Badge variant="outline" className={`h-5 px-1.5 text-[11px] ${statutBadgeClass(h.statut)}`}>
                        {STATUT_RETOUR_LABEL[h.statut] ?? h.statut}
                      </Badge>
                      <p className="mt-1 text-muted-foreground">{formatDate(h.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Actions bas de page */}
        <div className="flex flex-wrap items-center gap-2">
          {!detail.lu && (
            <Button variant="outline" className="h-10" onClick={() => majRetour(detail.id, { lu: true })}>
              <MailOpen className="mr-1.5 h-4 w-4" aria-hidden />
              Marquer comme lu
            </Button>
          )}
          <Select
            value={detail.statut}
            onValueChange={(v) => majRetour(detail.id, { statut: v as StatutRetour })}
          >
            <SelectTrigger className="h-10 w-40" aria-label="Changer le statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NEW">Nouveau</SelectItem>
              <SelectItem value="IN_PROGRESS">En cours</SelectItem>
              <SelectItem value="RESOLVED">Résolu</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10" onClick={fermerDetail}>
            Retour à la liste
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ---------- Barre de filtres ---------- */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {/* Zone (pivot : chaque retour est rattaché à une zone de contact) */}
            <Select value={fZone} onValueChange={(v) => { setPage(1); setFZone(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par zone">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Employé (Session 4 : filtre par employé mentionné/affecté) */}
            <Select
              value={fEmploye || "all"}
              onValueChange={(v) => { setPage(1); setFEmploye(v === "all" ? "" : v) }}
            >
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par employé">
                <SelectValue placeholder="Employé" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les employés</SelectItem>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom}
                    {e.actif === false ? " (inactif)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Note */}
            <Select value={fNote} onValueChange={(v) => { setPage(1); setFNote(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par note">
                <SelectValue placeholder="Note" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes notes</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {"★".repeat(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Statut */}
            <Select value={fStatut} onValueChange={(v) => { setPage(1); setFStatut(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par statut">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="NEW">Nouveau</SelectItem>
                <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                <SelectItem value="RESOLVED">Résolu</SelectItem>
              </SelectContent>
            </Select>

            {/* Tag */}
            <Select value={fTag} onValueChange={(v) => { setPage(1); setFTag(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par tag">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les tags</SelectItem>
                {ALL_TAGS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {`${t.emoji} ${t.label}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Dates (Du / Au) + réinitialisation */}
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <Input
                type="date"
                value={fDu}
                onChange={(e) => { setPage(1); setFDu(e.target.value) }}
                className="h-10 min-w-0 flex-1 text-muted-foreground"
                aria-label="Date de début"
              />
              <Input
                type="date"
                value={fAu}
                onChange={(e) => { setPage(1); setFAu(e.target.value) }}
                className="h-10 min-w-0 flex-1 text-muted-foreground"
                aria-label="Date de fin"
              />
              {datesActives && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-9 shrink-0"
                  onClick={() => { setPage(1); setFDu(""); setFAu("") }}
                  aria-label="Réinitialiser les dates"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>

            {/* Rafraîchir */}
            <div className="flex items-center">
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => load()} aria-label="Rafraîchir">
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          {/* Ligne info + export */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {total} retour{total > 1 ? "s" : ""}
              {total > PAGE_SIZE ? ` — page ${page}/${nbPages}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-3"
                onClick={() =>
                  exportToCsv(
                    `retours-${new Date().toISOString().slice(0, 10)}`,
                    items.map((r) => ({
                      Date: formatDate(r.createdAt),
                      Note: r.note,
                      Zone: r.zone?.nom ?? "",
                      Tags: r.tags.map(tagLabel).join(", "),
                      Employe: r.employe?.nom ?? r.personnelMentionne ?? "",
                      Commentaire: r.commentaire ?? "",
                      EmailClient: r.emailClient ?? "",
                      Canal: r.canalChoisi ?? "",
                      Statut: STATUT_RETOUR_LABEL[r.statut] ?? r.statut,
                      Lu: r.lu ? "Oui" : "Non",
                      ReponsePro: r.reponsePro ?? "",
                    }))
                  )
                }
                disabled={items.length === 0}
                aria-label="Exporter en CSV (page courante)"
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Exporter CSV
              </Button>
              <a href="/api/pro/retours/export" download className="hidden sm:block">
                <Button variant="ghost" size="sm" className="h-10 px-3 text-xs">
                  Exporter tout (serveur)
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Tableau des retours ---------- */}
      {loading ? (
        <Card className="py-0">
          <CardContent className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        // Empty state soigné
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted" aria-hidden>
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">Aucun retour ne correspond à ces filtres</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Essayez d&apos;élargir la période ou de sélectionner « Toutes les zones ».
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            {/* Tableau scrollable horizontalement sur mobile */}
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="hidden md:table-cell">Tags</TableHead>
                    <TableHead className="hidden lg:table-cell">Commentaire</TableHead>
                    <TableHead className="hidden md:table-cell">Personnel</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => ouvrirDetail(r)}>
                      {/* Date */}
                      <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </TableCell>

                      {/* Note */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Stars note={r.note} size={14} />
                          {!r.lu && <Badge className="h-5 px-1.5 text-[10px]">Nouveau</Badge>}
                        </div>
                      </TableCell>

                      {/* Zone */}
                      <TableCell className="max-w-40">
                        <Badge variant="outline" className="h-6 min-w-0 max-w-full gap-1 px-2 text-xs font-normal">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{r.zone?.nom ?? "—"}</span>
                        </Badge>
                      </TableCell>

                      {/* Tags (masqué < md) */}
                      <TableCell className="hidden md:table-cell">
                        {r.tags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex max-w-56 flex-wrap gap-1">
                            {r.tags.slice(0, 3).map((t) => (
                              <Badge
                                key={t}
                                variant="outline"
                                className="h-5 min-w-0 max-w-full px-1.5 text-xs font-normal"
                                title={tagLabel(t)}
                              >
                                <span className="truncate">{tagLabel(t)}</span>
                              </Badge>
                            ))}
                            {r.tags.length > 3 && (
                              <Badge variant="outline" className="h-5 px-1.5 text-xs font-normal">
                                +{r.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Commentaire (masqué < lg) */}
                      <TableCell className="hidden max-w-72 whitespace-normal lg:table-cell">
                        {r.commentaire ? (
                          <span className="text-sm italic leading-snug">{tronquer(r.commentaire)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Personnel (masqué < md) */}
                      <TableCell className="hidden text-xs md:table-cell">
                        {r.employe?.nom || r.personnelMentionne || <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Statut */}
                      <TableCell>
                        <Badge variant="outline" className={statutBadgeClass(r.statut)}>
                          {STATUT_RETOUR_LABEL[r.statut] ?? r.statut}
                        </Badge>
                      </TableCell>

                      {/* Actions (clics isolés du clic-ligne) */}
                      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Voir le détail"
                            onClick={() => ouvrirDetail(r)}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Répondre"
                            onClick={() => ouvrirReponse(r)}
                          >
                            <MessageSquareReply className="h-4 w-4" aria-hidden />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Plus d'actions">
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {!r.lu && (
                                <DropdownMenuItem onClick={() => majRetour(r.id, { lu: true })}>
                                  <MailOpen aria-hidden />
                                  Marquer comme lu
                                </DropdownMenuItem>
                              )}
                              {r.statut !== "IN_PROGRESS" && (
                                <DropdownMenuItem onClick={() => majRetour(r.id, { statut: "IN_PROGRESS" })}>
                                  <Clock aria-hidden />
                                  Passer en cours
                                </DropdownMenuItem>
                              )}
                              {r.statut !== "RESOLVED" && (
                                <DropdownMenuItem onClick={() => majRetour(r.id, { statut: "RESOLVED" })}>
                                  <CheckCircle2 aria-hidden />
                                  Marquer résolu
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Pagination ---------- */}
      {nbPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} / {nbPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= nbPages} onClick={() => setPage((p) => p + 1)}>
            Suivant
          </Button>
        </div>
      )}

    </div>
  )
}
