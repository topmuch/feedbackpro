"use client"

// ============================================================
// FeedbackPro - Onglet « Récompenses » du dashboard Pro (Session 3)
// Configuration de la micro-récompense offerte au Client Mystère :
//   · Toggle activer / désactiver
//   · Type : ☕ café gratuit · 🎁 réduction -X% · ✨ autre
//   · Code promo (communiqué APRÈS l'envoi du retour)
//   · Texte à afficher + aperçu en direct de ce que voit le client
// API : GET/POST /api/pro/recompenses
// ============================================================

import { useEffect, useState } from "react"
import { Gift, Loader2, Save, Eye, Ticket } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAppStore } from "@/store/app-store"
import { cn } from "@/lib/utils"

type TypeRecompense = "cafe" | "reduction" | "autre"

// Libellés par défaut du texte à afficher, selon le type choisi
const TEXTE_PAR_DEFAUT: Record<TypeRecompense, string> = {
  cafe: "☕ Café offert sur votre prochaine visite",
  reduction: "🎁 Réduction sur votre prochaine visite",
  autre: "",
}

export function RecompensesTab() {
  const session = useAppStore((s) => s.session)
  const updatePro = useAppStore((s) => s.updatePro)
  const { toast } = useToast()

  // ---------- État du formulaire ----------
  const [chargement, setChargement] = useState(true)
  const [active, setActive] = useState(false)
  const [type, setType] = useState<TypeRecompense>("cafe")
  const [texte, setTexte] = useState("")
  const [code, setCode] = useState("")
  const [pourcentage, setPourcentage] = useState("10")
  const [saving, setSaving] = useState(false)

  const pro = session?.pro ?? null

  // ---------- Chargement de la configuration existante ----------
  useEffect(() => {
    fetch("/api/pro/recompenses", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          const cfg = j.data.recompense as {
            active: boolean
            type: TypeRecompense
            code: string
            texte: string
          }
          setActive(cfg.active)
          setType(cfg.type)
          setTexte(cfg.texte ?? "")
          setCode(cfg.code ?? "")
          // Pourcentage extrait du texte existant (ex. « -15% » → 15)
          const match = cfg.texte?.match(/-(\d{1,2})\s?%/)
          if (match) setPourcentage(match[1])
        }
      })
      .catch(() => toast({ title: "Erreur", description: "Configuration inaccessible", variant: "destructive" }))
      .finally(() => setChargement(false))
  }, [])

  /** Changement de type : le texte est réinitialisé sur le défaut du type */
  function changerType(nouveau: TypeRecompense) {
    setType(nouveau)
    if (nouveau === "reduction") {
      setTexte(`🎁 -${pourcentage || 10}% sur votre prochaine visite`)
    } else {
      setTexte(TEXTE_PAR_DEFAUT[nouveau])
    }
  }

  /** Saisie du pourcentage (type réduction) : recompose le texte */
  function changerPourcentage(valeur: string) {
    const propre = valeur.replace(/[^0-9]/g, "").slice(0, 2)
    setPourcentage(propre)
    setTexte(`🎁 -${propre || 0}% sur votre prochaine visite`)
  }

  // ---------- Enregistrement ----------
  async function enregistrer() {
    if (saving) return
    if (active && !texte.trim()) {
      toast({
        title: "Texte manquant",
        description: "Indiquez le texte à afficher au client (ex. « ☕ Café offert »).",
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/pro/recompenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recompenseActive: active,
          recompenseType: type,
          recompenseCode: code.trim(),
          recompense: texte.trim(),
        }),
      })
      const json = await res.json()
      if (res.ok && json?.ok) {
        updatePro(json.data.pro)
        toast({
          title: active ? "Récompense activée 🎁" : "Récompense désactivée",
          description: active
            ? "Vos clients la découvriront après avoir envoyé leur retour."
            : "Vos clients ne verront plus de récompense. La configuration est conservée.",
        })
      } else {
        toast({ title: "Erreur", description: json?.error || "Enregistrement impossible", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // ---------- Aperçu client (teaser étape 3 + écran de remerciement) ----------
  const texteApercu = texte.trim() || "☕ Café offert sur votre prochaine visite"
  const codeApercu = code.trim() || "CAFÉ-OFFERT"

  return (
    <div className="space-y-5 max-w-3xl">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Récompenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Offrez une micro-récompense aux clients qui laissent un retour : fidélisation garantie et
          taux de réponse en hausse.
        </p>
      </div>

      {chargement ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* ---------- Toggle principal ---------- */}
          <Card className="shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="shrink-0 rounded-xl bg-amber-100 p-2.5" aria-hidden>
                  <Gift className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="rc-active" className="cursor-pointer text-sm font-semibold">
                    Activer la micro-récompense
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Le client découvre son avantage sur l&apos;écran de remerciement, juste après
                    l&apos;envoi de son retour.
                  </p>
                </div>
              </div>
              <Switch
                id="rc-active"
                checked={active}
                onCheckedChange={setActive}
                aria-label="Activer ou désactiver la récompense client"
              />
            </CardContent>
          </Card>

          {/* ---------- Configuration (visible si activée) ---------- */}
          {active && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Configuration de la récompense</CardTitle>
                <CardDescription>Le code promo n&apos;est révélé qu&apos;après l&apos;envoi du retour.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Type de récompense */}
                <div className="space-y-1.5">
                  <Label>Type de récompense</Label>
                  <Select value={type} onValueChange={(v) => { if (v) changerType(v as TypeRecompense) }}>
                    <SelectTrigger className="h-10" aria-label="Type de récompense">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cafe">☕ Café gratuit</SelectItem>
                      <SelectItem value="reduction">🎁 Réduction -X%</SelectItem>
                      <SelectItem value="autre">✨ Autre (texte libre)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Pourcentage (type réduction uniquement) */}
                {type === "reduction" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="rc-pourcentage">Pourcentage de réduction</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="rc-pourcentage"
                        inputMode="numeric"
                        value={pourcentage}
                        onChange={(e) => changerPourcentage(e.target.value)}
                        className="h-10 w-24 text-center"
                        aria-label="Pourcentage de réduction"
                      />
                      <span className="text-sm text-muted-foreground">% de réduction sur la prochaine visite</span>
                    </div>
                  </div>
                )}

                {/* Texte affiché (café / autre ; réduction = auto) */}
                <div className="space-y-1.5">
                  <Label htmlFor="rc-texte">Texte à afficher au client</Label>
                  <Input
                    id="rc-texte"
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    placeholder="☕ Café offert sur votre prochaine visite"
                    maxLength={120}
                    disabled={type === "reduction"}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    {type === "reduction"
                      ? "Texte composé automatiquement à partir du pourcentage."
                      : "Affiché tel quel au client. Restez court et chaleureux (120 caractères max)."}
                  </p>
                </div>

                {/* Code promo */}
                <div className="space-y-1.5">
                  <Label htmlFor="rc-code">Code promo (optionnel)</Label>
                  <Input
                    id="rc-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="CAFÉ-OFFERT, BIENVENUE10…"
                    maxLength={32}
                    className="h-10 font-mono"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Présenté dans une puce dédiée à l&apos;écran de remerciement. Laissez vide si
                    votre personnel reconnaît l&apos;écran directement.
                  </p>
                </div>

                <Button onClick={enregistrer} disabled={saving} className="h-10">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Enregistrer la récompense
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ---------- Aperçu : ce que verra le client ---------- */}
          <Card className={cn("shadow-sm", !active && "opacity-60")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Eye className="h-4 w-4 text-primary" aria-hidden />
                Aperçu — ce que voit votre client
              </CardTitle>
              <CardDescription>
                {active
                  ? "Rendu réel sur la page de scan mobile."
                  : "Récompense désactivée : vos clients ne verront aucune offre."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {/* Teaser étape 3 (avant envoi, SANS code) */}
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Étape 3 — avant l&apos;envoi
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">🎁 Petite attention</p>
                  <p className="mt-1 text-sm text-amber-800">
                    {active ? texteApercu : "Aucune récompense affichée"}
                  </p>
                  <p className="mt-1.5 text-xs text-amber-700/80">
                    Merci pour votre retour — votre cadeau s&apos;affiche juste après l&apos;envoi&nbsp;!
                  </p>
                </div>
              </div>

              {/* Écran de remerciement (APRÈS envoi, avec code) */}
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Écran de remerciement
                </p>
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 shadow-sm">
                  <p className="text-sm font-bold text-amber-900">
                    🎁 Votre récompense : {active ? texteApercu : "—"}
                  </p>
                  {active && code.trim() && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-white px-2.5 py-1 font-mono text-sm font-bold text-amber-900">
                      <Ticket className="h-3.5 w-3.5" aria-hidden />
                      {codeApercu}
                    </span>
                  )}
                  <p className="mt-2 text-xs text-amber-800/90">
                    Montrez cet écran au personnel pour en profiter
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
