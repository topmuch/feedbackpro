"use client"

// ============================================================
// AdminVoiceTab — Voix Denise (SuperAdmin)
// ------------------------------------------------------------
// 4 sections premium pour piloter le cerveau vocal de Denise :
//
//   A. Matrice de Décision
//      Table des VoiceDecisionRule (filtre par secteur). Édition
//      inline (toggle shouldSpeak, badges priorité/ton, template,
//      fenêtre d'agrégation, max annonces, active). Dialog d'édition
//      complète sur clic ligne.
//
//   B. Contexte Horaire
//      Timeline visuelle des 5 modes horaires par secteur (opening,
//      service_lunch, quiet, service_dinner, night) avec édition des
//      bornes via inputs + Save.
//
//   C. Historique des Annonces
//      Table des 100 derniers VoiceAnnouncementLog (filtres secteur +
//      spoken/not-spoken). Affiche le reason humainement lisible.
//
//   D. Test Denise
//      Tester la voix : sélection du ton (urgent/firm/soft/calm) +
//      message custom → TTS navigateur. Affiche aussi le mode
//      horaire courant par secteur.
//
// Contrats :
//   GET    /api/admin/voice/rules[?sector=]
//   POST   /api/admin/voice/rules
//   GET    /api/admin/voice/timemodes
//   POST   /api/admin/voice/timemodes
//   GET    /api/admin/voice/logs[?sector=&spoken=&eventType=]
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  Volume2,
  Clock,
  History,
  TestTube2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Mic,
  Save,
  Filter,
  Play,
  Pencil,
  ShieldAlert,
  Utensils,
  Plane,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ---------- Types (mirror API) ----------

type Priority = "critical" | "important" | "info" | "silent"
type Tone = "urgent" | "firm" | "soft" | "calm"

type VoiceDecisionRule = {
  id: string
  sector: string
  eventType: string
  shouldSpeak: boolean
  priority: Priority
  tone: Tone
  volumeAdjustment: string
  template: string
  aggregationWindowSec: number
  maxAnnouncementsPerWindow: number
  active: boolean
  createdAt: string
  updatedAt: string
}

type VoiceAnnouncementLog = {
  id: string
  eventType: string
  sector: string
  message: string
  priority: string
  zoneRef: string | null
  reportId: string | null
  spoken: boolean
  reason: string | null
  createdAt: string
}

type VoiceTimeMode = {
  id: string
  sector: string
  modes: string
  active: boolean
  updatedAt: string
}

// ---------- Visual helpers ----------

const PRIORITY_STYLES: Record<Priority, { color: string; label: string }> = {
  critical: { color: "bg-red-500 text-white", label: "Critical" },
  important: { color: "bg-amber-500 text-white", label: "Important" },
  info: { color: "bg-emerald-500 text-white", label: "Info" },
  silent: { color: "bg-zinc-400 text-white", label: "Silent" },
}

const TONE_STYLES: Record<Tone, { color: string; label: string }> = {
  urgent: { color: "bg-red-100 text-red-700 border-red-300", label: "Urgent" },
  firm: { color: "bg-amber-100 text-amber-800 border-amber-300", label: "Ferme" },
  soft: { color: "bg-emerald-100 text-emerald-700 border-emerald-300", label: "Doux" },
  calm: { color: "bg-blue-100 text-blue-700 border-blue-300", label: "Calme" },
}

const REASON_LABELS: Record<string, string> = {
  spoken: "Denise a parlé.",
  no_rule: "Aucune règle pour ce couple secteur / eventType.",
  rule_inactive: "Règle désactivée (active=false).",
  rule_silent: "shouldSpeak=false — notification visuelle seule.",
  night_mode_silent: "Mode nuit — seules les alertes sécurité parlent.",
  service_mode_info_filtered: "Mode service — info filtré.",
  quiet_mode_filtered: "Mode calme — info filtré.",
  aggregation_suppressed: "Agrégation : seuil atteint pour cette zone.",
  aggregation_upgraded: "Agrégation : multiples signaux → escalade important.",
  deduplication_suppressed: "Doublon dans les 120 dernières secondes.",
  double_scan_suppressed: "Double scan du même signalement (< 60s).",
  internal_error: "Erreur interne moteur.",
}

function reasonLabel(reason: string | null): string {
  if (!reason) return "—"
  if (REASON_LABELS[reason]) return REASON_LABELS[reason]
  if (reason.startsWith("internal_error:")) return "Erreur interne moteur."
  return reason
}

function modeLabel(mode: string): { label: string; color: string; description: string } {
  switch (mode) {
    case "opening":
      return {
        label: "Ouverture",
        color: "bg-sky-100 text-sky-800 border-sky-300",
        description: "Tous les types d'événements parlent (routine d'ouverture).",
      }
    case "service_lunch":
      return {
        label: "Service déjeuner",
        color: "bg-amber-100 text-amber-800 border-amber-300",
        description: "Seuls critical + important parlent (info filtré).",
      }
    case "quiet":
      return {
        label: "Calme",
        color: "bg-emerald-100 text-emerald-800 border-emerald-300",
        description: "Seuls critical + important parlent (info filtré).",
      }
    case "service_dinner":
      return {
        label: "Service dîner",
        color: "bg-orange-100 text-orange-800 border-orange-300",
        description: "Seuls critical + important parlent (info filtré).",
      }
    case "night":
      return {
        label: "Nuit",
        color: "bg-violet-100 text-violet-800 border-violet-300",
        description: "Uniquement security_sanitary. Le reste est silencieux.",
      }
    default:
      return { label: mode, color: "bg-zinc-100 text-zinc-700 border-zinc-300", description: "" }
  }
}

// ---------- Main component ----------

export function AdminVoiceTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<VoiceDecisionRule[]>([])
  const [logs, setLogs] = useState<VoiceAnnouncementLog[]>([])
  const [timemodes, setTimemodes] = useState<VoiceTimeMode[]>([])
  const [sectorFilter, setSectorFilter] = useState<string>("all")
  const [logFilter, setLogFilter] = useState<{ sector: string; spoken: string }>({
    sector: "all",
    spoken: "all",
  })

  // Edit dialog state
  const [editingRule, setEditingRule] = useState<VoiceDecisionRule | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // ---------- Loaders ----------

  const loadRules = useCallback(async () => {
    try {
      const url = `/api/admin/voice/rules${sectorFilter !== "all" ? `?sector=${sectorFilter}` : ""}`
      const res = await fetch(url)
      const json = await res.json()
      if (json.rules) setRules(json.rules as VoiceDecisionRule[])
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les règles.",
        variant: "destructive",
      })
    }
  }, [sectorFilter, toast])

  const loadLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (logFilter.sector !== "all") params.set("sector", logFilter.sector)
      if (logFilter.spoken !== "all") params.set("spoken", logFilter.spoken)
      const res = await fetch(`/api/admin/voice/logs?${params.toString()}`)
      const json = await res.json()
      if (json.logs) setLogs(json.logs as VoiceAnnouncementLog[])
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger l'historique.",
        variant: "destructive",
      })
    }
  }, [logFilter, toast])

  const loadTimemodes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/voice/timemodes")
      const json = await res.json()
      if (json.timemodes) setTimemodes(json.timemodes as VoiceTimeMode[])
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les contextes horaires.",
        variant: "destructive",
      })
    }
  }, [toast])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadRules(), loadLogs(), loadTimemodes()])
    setLoading(false)
  }, [loadRules, loadLogs, loadTimemodes])

  useEffect(() => {
    const id = setTimeout(() => void reloadAll(), 0)
    return () => clearTimeout(id)
  }, [reloadAll])

  useEffect(() => {
    const id = setTimeout(() => void loadRules(), 0)
    return () => clearTimeout(id)
  }, [loadRules])

  useEffect(() => {
    const id = setTimeout(() => void loadLogs(), 0)
    return () => clearTimeout(id)
  }, [loadLogs])

  // ---------- Handlers ----------

  async function saveRule(rule: VoiceDecisionRule) {
    try {
      const res = await fetch("/api/admin/voice/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      })
      const json = await res.json()
      if (json.rule) {
        toast({
          title: "Règle enregistrée",
          description: `${rule.sector} / ${rule.eventType}`,
        })
        await loadRules()
      } else {
        toast({ title: "Erreur", description: json.error ?? "Échec", variant: "destructive" })
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Échec",
        variant: "destructive",
      })
    }
  }

  async function toggleRuleField(rule: VoiceDecisionRule, field: "shouldSpeak" | "active", value: boolean) {
    const updated = { ...rule, [field]: value }
    await saveRule(updated)
  }

  async function saveTimemodes(updated: VoiceTimeMode[]) {
    try {
      await Promise.all(
        updated.map((tm) =>
          fetch("/api/admin/voice/timemodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sector: tm.sector, modes: tm.modes }),
          }),
        ),
      )
      toast({ title: "Contextes horaires enregistrés" })
      await loadTimemodes()
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Échec",
        variant: "destructive",
      })
    }
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/30">
            <Mic className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Voix Denise</h2>
            <p className="text-sm text-muted-foreground">
              Le cerveau vocal qui décide quand et comment Denise parle.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reloadAll()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Rafraîchir</span>
        </Button>
      </div>

      <Tabs defaultValue="matrix" className="space-y-5">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-fit">
          <TabsTrigger value="matrix" className="gap-2">
            <Volume2 className="h-4 w-4" /> Matrice
          </TabsTrigger>
          <TabsTrigger value="time" className="gap-2">
            <Clock className="h-4 w-4" /> Horaire
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="h-4 w-4" /> Historique
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <TestTube2 className="h-4 w-4" /> Test
          </TabsTrigger>
        </TabsList>

        {/* ---------------- SECTION A : Matrice de Décision ---------------- */}
        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5 text-violet-600" />
                    Matrice de Décision
                  </CardTitle>
                  <CardDescription>
                    Une règle par couple (secteur × eventType). Clique une ligne pour éditer.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={sectorFilter} onValueChange={setSectorFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Tous les secteurs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les secteurs</SelectItem>
                      <SelectItem value="aeroport">Aéroport</SelectItem>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Événement</TableHead>
                      <TableHead className="text-center">Parle</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead>Ton</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead className="min-w-[280px]">Template</TableHead>
                      <TableHead className="text-center">Agrég. (s)</TableHead>
                      <TableHead className="text-center">Max/win</TableHead>
                      <TableHead className="text-center">Actif</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow
                        key={rule.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setEditingRule(rule)
                          setEditOpen(true)
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {rule.sector === "aeroport" ? (
                              <Plane className="h-4 w-4 text-sky-600" />
                            ) : (
                              <Utensils className="h-4 w-4 text-amber-600" />
                            )}
                            <div>
                              <div className="font-mono text-xs font-medium">{rule.eventType}</div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {rule.sector}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={rule.shouldSpeak}
                            onCheckedChange={(v) => void toggleRuleField(rule, "shouldSpeak", v)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("border-0", PRIORITY_STYLES[rule.priority].color)}>
                            {PRIORITY_STYLES[rule.priority].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TONE_STYLES[rule.tone].color}>
                            {TONE_STYLES[rule.tone].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{rule.volumeAdjustment}</TableCell>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={rule.template}>
                          {rule.template}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {rule.aggregationWindowSec > 0 ? rule.aggregationWindowSec : "—"}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {rule.maxAnnouncementsPerWindow}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={rule.active}
                            onCheckedChange={(v) => void toggleRuleField(rule, "active", v)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          Aucune règle trouvée. La table devrait s'auto-seeder au premier GET…
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- SECTION B : Contexte Horaire ---------------- */}
        <TabsContent value="time">
          <TimeModesSection
            timemodes={timemodes}
            loading={loading}
            onSave={saveTimemodes}
          />
        </TabsContent>

        {/* ---------------- SECTION C : Historique des Annonces ---------------- */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-violet-600" />
                    Historique des Annonces
                  </CardTitle>
                  <CardDescription>
                    100 dernières annonces — pourquoi Denise a parlé (ou s'est tue).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={logFilter.sector}
                    onValueChange={(v) => setLogFilter((f) => ({ ...f, sector: v }))}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Secteur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="aeroport">Aéroport</SelectItem>
                      <SelectItem value="restaurant">Restaurant</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={logFilter.spoken}
                    onValueChange={(v) => setLogFilter((f) => ({ ...f, spoken: v }))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Prononcé" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="true">Prononcés</SelectItem>
                      <SelectItem value="false">Silencieux</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Date / Heure</TableHead>
                      <TableHead>Secteur</TableHead>
                      <TableHead>Événement</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="min-w-[260px]">Message</TableHead>
                      <TableHead className="text-center">Prononcé</TableHead>
                      <TableHead className="min-w-[220px]">Raison</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(log.createdAt).toLocaleString("fr-FR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {log.sector}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.eventType}</TableCell>
                        <TableCell className="font-mono text-xs">{log.zoneRef ?? "—"}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={log.message}>
                          {log.message}
                        </TableCell>
                        <TableCell className="text-center">
                          {log.spoken ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="mx-auto h-4 w-4 text-zinc-400" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {reasonLabel(log.reason)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Aucune annonce enregistrée pour ces filtres.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- SECTION D : Test Denise ---------------- */}
        <TabsContent value="test">
          <TestDeniseSection timemodes={timemodes} />
        </TabsContent>
      </Tabs>

      {/* ---------- Edit dialog ---------- */}
      <RuleEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        rule={editingRule}
        onSave={(rule) => {
          void saveRule(rule)
          setEditOpen(false)
        }}
      />
    </div>
  )
}

// ============================================================
// Sub-section : Contexte Horaire
// ============================================================

function TimeModesSection({
  timemodes,
  loading,
  onSave,
}: {
  timemodes: VoiceTimeMode[]
  loading: boolean
  onSave: (updated: VoiceTimeMode[]) => void
}) {
  const [draft, setDraft] = useState<VoiceTimeMode[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(timemodes)
  }, [timemodes])

  function updateMode(sector: string, modesObj: Record<string, string>) {
    setDraft((prev) =>
      prev.map((tm) =>
        tm.sector === sector ? { ...tm, modes: JSON.stringify(modesObj) } : tm,
      ),
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-violet-600" />
              Contexte Horaire
            </CardTitle>
            <CardDescription>
              5 modes par secteur. Denise s'adapte : en service, elle filtre les infos ;
              la nuit, elle ne parle que pour la sécurité.
            </CardDescription>
          </div>
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              await onSave(draft)
              setSaving(false)
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2">Enregistrer</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {draft.map((tm) => {
          let modesObj: Record<string, string> = {}
          try {
            modesObj = JSON.parse(tm.modes) as Record<string, string>
          } catch {
            modesObj = {}
          }
          const orderedKeys = ["06-10", "10-14", "14-18", "18-22", "22-06"]
          return (
            <div key={tm.id} className="rounded-xl border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                {tm.sector === "aeroport" ? (
                  <Plane className="h-4 w-4 text-sky-600" />
                ) : (
                  <Utensils className="h-4 w-4 text-amber-600" />
                )}
                <h3 className="font-semibold capitalize">{tm.sector}</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {orderedKeys.map((key) => {
                  const mode = modesObj[key] ?? "opening"
                  const info = modeLabel(mode)
                  return (
                    <div key={key} className="rounded-lg border bg-card p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-xs font-medium">{key}</span>
                        <Badge variant="outline" className={info.color}>
                          {info.label}
                        </Badge>
                      </div>
                      <Select
                        value={mode}
                        onValueChange={(v) => {
                          const next = { ...modesObj, [key]: v }
                          updateMode(tm.sector, next)
                        }}
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="opening">Ouverture</SelectItem>
                          <SelectItem value="service_lunch">Service déjeuner</SelectItem>
                          <SelectItem value="quiet">Calme</SelectItem>
                          <SelectItem value="service_dinner">Service dîner</SelectItem>
                          <SelectItem value="night">Nuit</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                        {info.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Sub-section : Test Denise
// ============================================================

function TestDeniseSection({ timemodes }: { timemodes: VoiceTimeMode[] }) {
  const [message, setMessage] = useState("Denise à l'écoute. Système opérationnel.")
  const [tone, setTone] = useState<Tone>("firm")
  const [speaking, setSpeaking] = useState(false)

  // Current hour for the time-mode display
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  function modeForSector(sector: string): { mode: string; hour: number } {
    const hour = now.getHours()
    let mode = "night"
    if (hour >= 6 && hour < 10) mode = "opening"
    else if (hour >= 10 && hour < 14) mode = "service_lunch"
    else if (hour >= 14 && hour < 18) mode = "quiet"
    else if (hour >= 18 && hour < 22) mode = "service_dinner"
    void sector
    return { mode, hour }
  }

  function handleSpeak() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return
    }
    setSpeaking(true)
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(message)
      u.lang = "fr-FR"
      // Tone → rate / pitch
      const toneConfig: Record<Tone, { rate: number; pitch: number; volume: number }> = {
        urgent: { rate: 1.25, pitch: 0.85, volume: 1 },
        firm: { rate: 1.1, pitch: 0.9, volume: 0.95 },
        soft: { rate: 0.95, pitch: 1.05, volume: 0.75 },
        calm: { rate: 0.85, pitch: 1.1, volume: 0.65 },
      }
      const cfg = toneConfig[tone]
      u.rate = cfg.rate
      u.pitch = cfg.pitch
      u.volume = cfg.volume
      const voix = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"))
      if (voix) u.voice = voix
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(u)
    } catch {
      setSpeaking(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Test card */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5 text-violet-600" />
            Tester la voix
          </CardTitle>
          <CardDescription>
            Vérifie le rendu sonore de Denise. Sélectionne un ton et tape un message.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="denise-msg">Message</Label>
            <Textarea
              id="denise-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ton</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent (grave + rapide)</SelectItem>
                  <SelectItem value="firm">Ferme (cadencé)</SelectItem>
                  <SelectItem value="soft">Doux (ralenti)</SelectItem>
                  <SelectItem value="calm">Calme (très ralenti)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full gap-2"
                size="lg"
                disabled={speaking || !message}
                onClick={handleSpeak}
              >
                {speaking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {speaking ? "En cours…" : "Parler"}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="mb-1 inline h-4 w-4 text-amber-600" />{" "}
            <strong>Note :</strong> certains navigateurs bloquent l'autoplay audio.
            Clique d'abord n'importe où sur la page si aucun son ne sort.
          </div>
        </CardContent>
      </Card>

      {/* Current time modes card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-violet-600" />
            Mode horaire courant
          </CardTitle>
          <CardDescription>Heure : {now.toLocaleTimeString("fr-FR")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {["aeroport", "restaurant"].map((sector) => {
            const { mode, hour } = modeForSector(sector)
            const info = modeLabel(mode)
            return (
              <div key={sector} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {sector === "aeroport" ? (
                      <Plane className="h-4 w-4 text-sky-600" />
                    ) : (
                      <Utensils className="h-4 w-4 text-amber-600" />
                    )}
                    <span className="text-sm font-medium capitalize">{sector}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{hour}h</span>
                </div>
                <Badge variant="outline" className={info.color}>
                  {info.label}
                </Badge>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  {info.description}
                </p>
              </div>
            )
          })}
          {timemodes.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Contextes horaires non chargés.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Edit dialog for a single rule
// ============================================================

function RuleEditDialog({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: VoiceDecisionRule | null
  onSave: (rule: VoiceDecisionRule) => void
}) {
  const [draft, setDraft] = useState<VoiceDecisionRule | null>(rule)

  useEffect(() => {
    setDraft(rule)
  }, [rule])

  if (!draft) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft.sector === "aeroport" ? (
              <Plane className="h-5 w-5 text-sky-600" />
            ) : (
              <Utensils className="h-5 w-5 text-amber-600" />
            )}
            {draft.sector} · {draft.eventType}
          </DialogTitle>
          <DialogDescription>
            Édite tous les champs de la règle. Variables disponibles :
            <code className="ml-1 rounded bg-muted px-1 text-[10px]">{"{ZONE}"}</code>{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{"{TYPE}"}</code>{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{"{TEMPS}"}</code>{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{"{TABLE}"}</code>{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{"{PRODUIT}"}</code>{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{"{DETAIL}"}</code>{" "}
            <code className="rounded bg-muted px-1 text-[10px]">{"{STAFF_NOM}"}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Denise parle ?</Label>
            <Switch
              checked={draft.shouldSpeak}
              onCheckedChange={(v) => setDraft({ ...draft, shouldSpeak: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Règle active</Label>
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>Priorité</Label>
            <Select
              value={draft.priority}
              onValueChange={(v) => setDraft({ ...draft, priority: v as Priority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="important">Important</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="silent">Silent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ton</Label>
            <Select
              value={draft.tone}
              onValueChange={(v) => setDraft({ ...draft, tone: v as Tone })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="firm">Ferme</SelectItem>
                <SelectItem value="soft">Doux</SelectItem>
                <SelectItem value="calm">Calme</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ajustement de volume</Label>
            <Select
              value={draft.volumeAdjustment}
              onValueChange={(v) => setDraft({ ...draft, volumeAdjustment: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="+20%">+20% (critical)</SelectItem>
                <SelectItem value="0%">0% (important)</SelectItem>
                <SelectItem value="-10%">-10% (info)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Agrégation (secondes)</Label>
            <Input
              type="number"
              min={0}
              value={draft.aggregationWindowSec}
              onChange={(e) =>
                setDraft({ ...draft, aggregationWindowSec: parseInt(e.target.value || "0", 10) })
              }
            />
            <p className="text-[10px] text-muted-foreground">0 = jamais agréger.</p>
          </div>

          <div className="space-y-2">
            <Label>Max annonces / fenêtre</Label>
            <Input
              type="number"
              min={1}
              value={draft.maxAnnouncementsPerWindow}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxAnnouncementsPerWindow: parseInt(e.target.value || "1", 10),
                })
              }
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Template TTS</Label>
            <Textarea
              rows={3}
              value={draft.template}
              onChange={(e) => setDraft({ ...draft, template: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => onSave(draft)} className="gap-2">
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
