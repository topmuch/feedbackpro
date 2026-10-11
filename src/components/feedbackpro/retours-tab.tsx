"use client"

// ============================================================
// FeedbackPro - Onglet "Retours clients" du dashboard Pro
// Tableau filtrable (note, statut, tag, dates, employé, lu) +
// modale de détail avec réponse et historique des statuts
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Search,
  Download,
  MailOpen,
  MessageSquareReply,
  RefreshCw,
  Loader2,
  Eye,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { Stars, formatDate } from "@/components/feedbackpro/shared"
import { useToast } from "@/hooks/use-toast"
import { ALL_TAGS, STATUT_RETOUR_LABEL, tagLabel } from "@/lib/constants"

type StatutRetour = "NEW" | "IN_PROGRESS" | "RESOLVED"

type Retour = {
  id: string
  note: number
  tags: string[]
  commentaire: string | null
  personnelMentionne: string | null
  employeNom: string | null
  canalChoisi: string | null
  statut: StatutRetour
  lu: boolean
  reponsePro: string | null
  ipCity: string | null
  historique: { statut: string; at: string }[]
  createdAt: string
}

type Employe = { id: string; nom: string }

const PAGE_SIZE = 50

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

/** Couleurs du badge de statut (tokens sémantiques) */
function statutBadgeClass(statut: string): string {
  if (statut === "RESOLVED") return "text-green-700 border-green-300"
  if (statut === "IN_PROGRESS") return "text-amber-700 border-amber-300"
  return "text-stone-600"
}

/** Couleur de la pastille de la timeline de suivi */
function pastilleClass(statut: string): string {
  if (statut === "RESOLVED") return "bg-green-500"
  if (statut === "IN_PROGRESS") return "bg-amber-500"
  return "bg-stone-400"
}

export function RetoursTab() {
  const [items, setItems] = useState<Retour[]>([])
  const [employes, setEmployes] = useState<Employe[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filtres
  const [fNote, setFNote] = useState("all")
  const [fStatut, setFStatut] = useState("all")
  const [fTag, setFTag] = useState("all")
  const [fEmploye, setFEmploye] = useState("all")
  const [fLu, setFLu] = useState("all")
  const [q, setQ] = useState("")
  const [fDu, setFDu] = useState("") // from (AAAA-MM-JJ)
  const [fAu, setFAu] = useState("") // to (AAAA-MM-JJ)

  // Modale de détail
  const [detail, setDetail] = useState<Retour | null>(null)
  const [editionReponse, setEditionReponse] = useState(false)
  const [texteReponse, setTexteReponse] = useState("")
  const [envoiReponse, setEnvoiReponse] = useState(false)
  const reponseRef = useRef<HTMLTextAreaElement>(null)

  const { toast } = useToast()

  const load = useCallback(
    async (p = page) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p) })
        if (fNote !== "all") params.set("note", fNote)
        if (fStatut !== "all") params.set("statut", fStatut)
        if (fTag !== "all") params.set("tag", fTag)
        if (fEmploye !== "all") params.set("employeId", fEmploye)
        if (fLu !== "all") params.set("lu", fLu)
        if (fDu) params.set("from", fDu)
        if (fAu) params.set("to", fAu)
        if (q.trim()) params.set("q", q.trim())
        const res = await fetch(`/api/pro/retours?${params.toString()}`, { cache: "no-store" })
        const json = await res.json()
        if (json.ok) {
          setItems(json.data.items)
          setTotal(json.data.total)
          setEmployes(json.data.employes)
        } else {
          toast({ title: "Erreur", description: "Impossible de charger les retours", variant: "destructive" })
        }
      } catch {
        toast({ title: "Erreur", description: "Impossible de charger les retours", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    },
    [fNote, fStatut, fTag, fEmploye, fLu, fDu, fAu, q, page]
  )

  // Rechargement quand un filtre ou la page change
  useEffect(() => {
    load(page)

  }, [fNote, fStatut, fTag, fEmploye, fLu, fDu, fAu, page])

  // Recherche texte avec délai (debounce 350 ms)
  const premierRendu = useRef(true)
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false
      return
    }
    const t = setTimeout(() => load(1), 350)
    return () => clearTimeout(t)

  }, [q])

  // Focus sur la zone de réponse dès que le mode édition s'ouvre
  useEffect(() => {
    if (editionReponse) reponseRef.current?.focus()
  }, [editionReponse, detail?.id])

  // Mise à jour d'un retour : synchronise la liste ET l'item affiché dans la modale
  async function majRetour(id: string, data: { statut?: StatutRetour; lu?: boolean; reponsePro?: string }) {
    try {
      const res = await fetch("/api/pro/retours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      })
      const json = await res.json()
      if (json.ok) {
        // Merge de la réponse serveur { id, statut, lu, reponsePro, historique }
        setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...json.data } : r)))
        setDetail((prev) => (prev && prev.id === id ? { ...prev, ...json.data } : prev))
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
    setEditionReponse(false)
  }

  function ouvrirReponse(r: Retour) {
    setDetail(r)
    setTexteReponse(r.reponsePro || "")
    setEditionReponse(true)
  }

  function fermerDetail() {
    setDetail(null)
    setEditionReponse(false)
  }

  // Enregistrement de la réponse du commerçant
  async function enregistrerReponse() {
    if (!detail || !texteReponse.trim()) return
    setEnvoiReponse(true)
    const statutPasse = detail.statut === "NEW"
    await majRetour(detail.id, {
      reponsePro: texteReponse.trim(),
      lu: true,
      ...(statutPasse ? { statut: "IN_PROGRESS" as StatutRetour } : {}),
    })
    setEnvoiReponse(false)
    setEditionReponse(false)
    toast({
      title: "Réponse enregistrée",
      ...(statutPasse ? { description: "Le statut du retour est passé à « En cours »" } : {}),
    })
  }

  const nbPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const datesActives = fDu !== "" || fAu !== ""

  // Timeline de suivi : historique trié chronologiquement.
  // Pour les anciens retours (sans entrée "NEW"), on préfixe la création
  // afin que le suivi commence toujours par « Nouveau ».
  const historiqueAffiche: { statut: string; at: string }[] = detail
    ? (() => {
        const hist = [...detail.historique].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        if (hist.length === 0) return [{ statut: "NEW", at: detail.createdAt }]
        if (!hist.some((h) => h.statut === "NEW")) {
          return [{ statut: "NEW", at: detail.createdAt }, ...hist]
        }
        return hist
      })()
    : []

  return (
    <div className="space-y-4">
      {/* ---------- Barre de filtres ---------- */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Recherche texte (debounce 350 ms) */}
            <div className="relative sm:col-span-2 md:col-span-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Rechercher (commentaire, tags…)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 pl-8"
                aria-label="Rechercher dans les retours"
              />
            </div>

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

            {/* Employé */}
            <Select value={fEmploye} onValueChange={(v) => { setPage(1); setFEmploye(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par employé">
                <SelectValue placeholder="Employé" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous employés</SelectItem>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Lu */}
            <Select value={fLu} onValueChange={(v) => { setPage(1); setFLu(v) }}>
              <SelectTrigger className="h-10 w-full" aria-label="Filtrer par lecture">
                <SelectValue placeholder="Lu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="false">Non lus</SelectItem>
              </SelectContent>
            </Select>

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
            <a href="/api/pro/retours/export" download>
              <Button variant="outline" size="sm" className="h-10 px-3">
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Exporter en CSV
              </Button>
            </a>
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
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            Aucun retour ne correspond à ces filtres.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Note</TableHead>
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
                      {r.employeNom || r.personnelMentionne || <span className="text-muted-foreground">—</span>}
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

      {/* ---------- Modale de détail ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) fermerDetail() }}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto custom-scrollbar sm:max-w-2xl"
          onOpenAutoFocus={(e) => {
            // Focus direct sur la réponse quand la modale est ouverte via « Répondre »
            if (editionReponse) {
              e.preventDefault()
              reponseRef.current?.focus()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Détail du retour</DialogTitle>
            <DialogDescription>Consultez toutes les informations et suivez son traitement.</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-5">
              {/* En-tête : note, badges, date */}
              <div className="flex flex-wrap items-center gap-2">
                <Stars note={detail.note} size={16} />
                {!detail.lu && <Badge className="h-5 px-1.5 text-[10px]">Nouveau</Badge>}
                <Badge variant="outline" className={statutBadgeClass(detail.statut)}>
                  {STATUT_RETOUR_LABEL[detail.statut] ?? detail.statut}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(detail.createdAt)}</span>
              </div>

              {/* Grille d'infos */}
              <div className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Tags</p>
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
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Personnel concerné</p>
                  {detail.employeNom || detail.personnelMentionne ? (
                    <p>
                      {detail.employeNom}
                      {detail.employeNom && detail.personnelMentionne ? ` (${detail.personnelMentionne})` : detail.personnelMentionne || ""}
                    </p>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Canal</p>
                  <p>{canalLabel(detail.canalChoisi)}</p>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Ville</p>
                  {detail.ipCity ? <p>{detail.ipCity}</p> : <span className="text-muted-foreground">—</span>}
                </div>
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

              {/* Réponse du commerçant */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Réponse du commerçant</p>
                {editionReponse ? (
                  <div className="space-y-2">
                    <Textarea
                      ref={reponseRef}
                      id="reponse-pro"
                      rows={4}
                      value={texteReponse}
                      onChange={(e) => setTexteReponse(e.target.value)}
                      placeholder="Ex : Client rappelé, geste commercial offert, employé sensibilisé."
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
                        Enregistrer
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
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => { setTexteReponse(""); setEditionReponse(true) }}
                  >
                    <MessageSquareReply className="mr-1.5 h-4 w-4" aria-hidden />
                    Rédiger une réponse
                  </Button>
                )}
              </div>

              {/* Suivi du retour : historique des statuts */}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Suivi du retour</p>
                <ol>
                  {historiqueAffiche.map((h, i) => (
                    <li key={`${h.statut}-${h.at}-${i}`} className="relative flex items-start gap-2.5 pb-4 last:pb-0">
                      {i < historiqueAffiche.length - 1 && (
                        <span className="absolute top-4 bottom-0 left-[6px] w-px bg-border" aria-hidden />
                      )}
                      <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${pastilleClass(h.statut)}`} aria-hidden />
                      <div className="min-w-0 text-xs">
                        <p className="font-medium">{STATUT_RETOUR_LABEL[h.statut] ?? h.statut}</p>
                        <p className="mt-0.5 text-muted-foreground">{formatDate(h.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:items-center">
            {detail && !detail.lu && (
              <Button variant="outline" className="h-10" onClick={() => majRetour(detail.id, { lu: true })}>
                <MailOpen className="mr-1.5 h-4 w-4" aria-hidden />
                Marquer comme lu
              </Button>
            )}
            {detail && (
              <Select
                value={detail.statut}
                onValueChange={(v) => majRetour(detail.id, { statut: v as StatutRetour })}
              >
                <SelectTrigger className="h-10 w-36" aria-label="Changer le statut">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">Nouveau</SelectItem>
                  <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                  <SelectItem value="RESOLVED">Résolu</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" className="h-10" onClick={fermerDetail}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
