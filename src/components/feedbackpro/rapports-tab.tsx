"use client"

// ============================================================
// FeedbackPro - Page « Rapports IA » (Session 4, §3)
// Liste complète des rapports du Coach IA (quotidiens + hebdo) :
// ouverture détaillée (markdown), régénération, envoi par email.
// Contrats :
//   GET  /api/pro/coach/rapports → { rapports: RapportIA[] } (chaque rapport
//        porte source: "ia" | "fallback" depuis la Session 5)
//   POST /api/pro/coach { type? } → { rapport } (5-15 s, LLM, avec source)
//   POST /api/pro/coach/email { rapportId } → { envoye, email }
// ============================================================

import { useCallback, useEffect, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import {
  Bot,
  Sparkles,
  RefreshCw,
  Mail,
  Loader2,
  Target,
  Lightbulb,
  TrendingUp,
  ArrowLeft,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ---------- Types (contrat GET /api/pro/coach/rapports) ----------

type RapportIA = {
  id: string
  type: string
  periodeDebut: string
  periodeFin: string
  scoreGlobal: number
  contenuMarkdown: string
  priorites: string[]
  recommandations: string[]
  predictions: string[]
  /** Session 5 : « ia » = généré par le LLM (Coach IA), « fallback » = analyse locale
   *  déterministe. Optionnel : les rapports antérieurs à la Session 5 n'ont pas ce
   *  champ et sont traités comme « ia » par défaut. */
  source?: string
  envoyeParEmail: boolean
  envoyeParSMS: boolean
  createdAt: string
}

// ---------- Petits utilitaires d'affichage ----------

/** Date de création : « 12 janv. 2026 · 07:00 » */
function formatDateCreation(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return `${jour} · ${heure}`
}

/** Date courte sans heure, pour la période auditée */
function formatDateSimple(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

/** Badge de type : « Quotidien » (secondary) / « Hebdomadaire » (outline) */
function badgeType(type: string): { label: string; variant: "secondary" | "outline" } {
  const t = (type || "").toLowerCase()
  if (t.includes("hebdo")) return { label: "Hebdomadaire", variant: "outline" }
  return { label: "Quotidien", variant: "secondary" }
}

/** Badge de source du rapport (Session 5) : « fallback » → analyse locale (secondary),
 *  sinon (source « ia » ou absente sur les anciens rapports) → généré par IA (default) */
function badgeSource(source?: string): { label: string; variant: "default" | "secondary" } {
  if (source === "fallback") return { label: "📋 Analyse locale", variant: "secondary" }
  return { label: "🤖 Généré par IA", variant: "default" }
}

/** Couleur du badge de score (identique à coach-ia-tab scoreTone) */
function scoreTone(score: number): string {
  if (score >= 80) return "border-green-300 text-green-700"
  if (score >= 60) return "border-amber-300 text-amber-700"
  return "border-rose-300 text-rose-700"
}

/** Styles propres pour le rendu markdown du rapport (copie de coach-ia-tab) */
const mdComposants: Components = {
  h1: ({ node, ...props }) => <h3 className="mb-2 mt-4 text-base font-bold text-foreground first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h3 className="mb-2 mt-4 text-base font-bold text-foreground first:mt-0" {...props} />,
  h3: ({ node, ...props }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0" {...props} />,
  p: ({ node, ...props }) => (
    <p className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0" {...props} />
  ),
  ul: ({ node, ...props }) => <ul className="mb-3 space-y-1.5" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5" {...props} />,
  li: ({ node, children, ...props }) => (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground" {...props}>
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  ),
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  hr: () => <hr className="my-4 border-border" />,
}

// ---------- Composant principal ----------

export function RapportsTab() {
  const { toast } = useToast()

  const [rapports, setRapports] = useState<RapportIA[]>([])
  const [loading, setLoading] = useState(true)

  // Génération d'un nouveau rapport (bouton d'en-tête, 5-15 s)
  const [generation, setGeneration] = useState(false)
  // Régénération d'un rapport existant (id du rapport en cours)
  const [regenId, setRegenId] = useState<string | null>(null)
  // Envoi email en cours (id du rapport concerné)
  const [emailId, setEmailId] = useState<string | null>(null)
  // Rapport ouvert dans le modal de lecture
  const [rapportOuvert, setRapportOuvert] = useState<RapportIA | null>(null)

  // Badge de source du rapport ouvert (valeur par défaut si modal fermé, sans effet)
  const sourceOuvert = badgeSource(rapportOuvert?.source)

  // ---------- Chargement de la liste ----------
  const charger = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pro/coach/rapports", { cache: "no-store" })
      const json = await res.json()
      if (res.ok && json?.ok) setRapports(json.data?.rapports ?? [])
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger vos rapports", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
  }, [charger])

  // ---------- Génération d'un nouveau rapport (type par défaut du Pro) ----------
  async function generer() {
    setGeneration(true)
    try {
      const res = await fetch("/api/pro/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (res.ok && json?.ok && json.data?.rapport) {
        toast({
          title: "Rapport prêt ✨",
          description: "Votre Coach IA a terminé l'analyse de vos retours.",
        })
        await charger() // le nouveau rapport apparaît en tête de liste
      } else {
        toast({
          title: "Génération impossible",
          description: json?.error || "Réessayez dans quelques instants.",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le Coach IA.", variant: "destructive" })
    } finally {
      setGeneration(false)
    }
  }

  // ---------- Régénération d'un rapport existant (même type) ----------
  async function regenerer(rapport: RapportIA) {
    setRegenId(rapport.id)
    try {
      const res = await fetch("/api/pro/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: rapport.type === "hebdomadaire" ? "hebdomadaire" : "quotidien" }),
      })
      const json = await res.json()
      if (res.ok && json?.ok && json.data?.rapport) {
        toast({ title: "Rapport régénéré ✨", description: "Une nouvelle analyse vient d'être produite." })
        await charger() // le nouveau rapport apparaît en tête
      } else {
        toast({
          title: "Régénération impossible",
          description: json?.error || "Réessayez dans quelques instants.",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le Coach IA.", variant: "destructive" })
    } finally {
      setRegenId(null)
    }
  }

  // ---------- Mise à jour locale après envoi email (sans recharger toute la liste) ----------
  function marquerEnvoye(rapportId: string) {
    setRapports((prev) => prev.map((r) => (r.id === rapportId ? { ...r, envoyeParEmail: true } : r)))
    setRapportOuvert((prev) => (prev && prev.id === rapportId ? { ...prev, envoyeParEmail: true } : prev))
  }

  /** Envoi du rapport par email — depuis une carte ou le pied du modal */
  async function envoyerParEmail(rapport: RapportIA) {
    setEmailId(rapport.id)
    try {
      const res = await fetch("/api/pro/coach/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapportId: rapport.id }),
      })
      const json = await res.json()
      if (res.ok && json?.ok && json.data?.envoye) {
        toast({ title: "Rapport envoyé 📧", description: `Rapport envoyé à ${json.data.email}` })
        marquerEnvoye(rapport.id)
      } else {
        toast({
          title: "Envoi impossible",
          description: json?.error || "Vérifiez votre email dans les Paramètres.",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Envoi impossible pour le moment.", variant: "destructive" })
    } finally {
      setEmailId(null)
    }
  }

  // ---------- Rendu ----------

  // ---------- Vue détaillée pleine page d'un rapport (remplace la modale) ----------
  if (rapportOuvert) {
    return (
      <div className="space-y-5">
        {/* En-tête : retour + titre + badges */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setRapportOuvert(null)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Retour aux rapports
          </Button>
          <h2 className="flex items-center gap-2 text-lg sm:text-xl font-semibold">
            <Bot className="h-5 w-5 text-primary" aria-hidden />
            {badgeType(rapportOuvert.type).label}
          </h2>
          <Badge variant={sourceOuvert.variant}>{sourceOuvert.label}</Badge>
          <Badge variant="outline" className={scoreTone(rapportOuvert.scoreGlobal)}>
            Score {Math.round(rapportOuvert.scoreGlobal)}/100
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Période auditée : {formatDateSimple(rapportOuvert.periodeDebut)} →{" "}
          {formatDateSimple(rapportOuvert.periodeFin)} · généré le{" "}
          {formatDateCreation(rapportOuvert.createdAt)}
        </p>

        {/* Contenu : markdown + 3 blocs structurés */}
        <Card className="shadow-sm">
          <CardContent className="space-y-5 p-4 sm:p-6">
            {rapportOuvert.contenuMarkdown ? (
              <ReactMarkdown components={mdComposants}>{rapportOuvert.contenuMarkdown}</ReactMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Le contenu détaillé de ce rapport n&apos;est pas disponible.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <ListeRapport
                icone={Target}
                titre="Priorités"
                items={rapportOuvert.priorites ?? []}
                tone="text-primary"
              />
              <ListeRapport
                icone={Lightbulb}
                titre="Recommandations"
                items={rapportOuvert.recommandations ?? []}
                tone="text-amber-600"
              />
              <ListeRapport
                icone={TrendingUp}
                titre="Prédictions"
                items={rapportOuvert.predictions ?? []}
                tone="text-green-600"
              />
            </div>
          </CardContent>
        </Card>

        {/* Pied : statut envoi email + actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rapportOuvert.envoyeParEmail ? (
            <Badge variant="outline" className="border-green-300 text-green-700">
              📧 Envoyé par email
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Pas encore envoyé par email</span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => envoyerParEmail(rapportOuvert)}
              disabled={emailId === rapportOuvert.id || regenId === rapportOuvert.id}
            >
              {emailId === rapportOuvert.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="mr-2 h-4 w-4" aria-hidden />
              )}
              Envoyer par email
            </Button>
            <Button variant="outline" onClick={() => setRapportOuvert(null)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Retour aux rapports
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ---------- En-tête : titre + génération ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Rapports IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historique de vos audits — analyses générées à partir de vos retours
          </p>
        </div>
        <Button onClick={generer} disabled={generation} className="shrink-0">
          {generation ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          )}
          {generation ? "Analyse en cours…" : "Générer un nouveau rapport"}
        </Button>
      </div>

      {/* ---------- Squelettes / empty state / liste ---------- */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : rapports.length === 0 ? (
        // Empty state élégant
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-4" aria-hidden>
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <p className="font-medium">Aucun rapport pour l&apos;instant</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Dès que vos zones auront collecté quelques retours, générez un rapport : votre Coach IA
              rédigera une analyse complète avec priorités, recommandations et prédictions.
            </p>
            <Button onClick={generer} disabled={generation} className="mt-1">
              {generation ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              )}
              {generation ? "Analyse en cours…" : "Générer mon premier rapport"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rapports.map((rapport) => {
            const type = badgeType(rapport.type)
            const source = badgeSource(rapport.source)
            const regenEnCours = regenId === rapport.id
            const emailEnCours = emailId === rapport.id
            const occupe = regenEnCours || emailEnCours || generation
            return (
              <Card key={rapport.id} className="flex flex-col shadow-sm">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  {/* Badges type + source + score */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={type.variant}>{type.label}</Badge>
                      <Badge variant={source.variant}>{source.label}</Badge>
                    </div>
                    <Badge variant="outline" className={scoreTone(rapport.scoreGlobal)}>
                      Score {Math.round(rapport.scoreGlobal)}/100
                    </Badge>
                  </div>

                  {/* Dates */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>Créé le {formatDateCreation(rapport.createdAt)}</p>
                    <p>
                      Période auditée : {formatDateSimple(rapport.periodeDebut)} →{" "}
                      {formatDateSimple(rapport.periodeFin)}
                    </p>
                  </div>

                  {/* Marqueur d'envoi email */}
                  {rapport.envoyeParEmail && (
                    <Badge variant="outline" className="w-fit border-green-300 text-green-700">
                      📧 Envoyé par email
                    </Badge>
                  )}

                  {/* Actions */}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => setRapportOuvert(rapport)}
                      disabled={regenEnCours}
                    >
                      <span className="mr-1.5" aria-hidden>
                        📖
                      </span>
                      Ouvrir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => regenerer(rapport)}
                      disabled={occupe}
                    >
                      {regenEnCours ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      )}
                      {regenEnCours ? "Régénération en cours…" : "Régénérer"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2.5"
                      onClick={() => envoyerParEmail(rapport)}
                      disabled={occupe}
                      title="Envoyer ce rapport par email"
                    >
                      {emailEnCours ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      )}
                      <span className="hidden sm:inline">Envoyer par email</span>
                      <span className="sm:hidden">Email</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

    </div>
  )
}

// ---------- Sous-bloc du rapport : liste avec icône (priorités / recommandations / prédictions) ----------

function ListeRapport({
  icone: Icon,
  titre,
  items,
  tone,
}: {
  icone: React.ComponentType<{ className?: string }>
  titre: string
  items: string[]
  tone: string
}) {
  if (!items || items.length === 0) return null
  return (
    <div className="rounded-xl border p-3.5">
      <p className={cn("mb-2 flex items-center gap-1.5 text-sm font-semibold", tone)}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {titre}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
