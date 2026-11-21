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
//   E. Gestion des Signalements (Feature 2 — FIX-4-FEATURES)
//      Command center Denise : liste les 10 derniers signalements
//      aéroport (polling 15s) avec boutons Annoncer / Résoudre /
//      Escalader. « Annoncer » déclenche parler() côté navigateur
//      (voix grave + débit rapide = « Denise »).
//
// Contrats :
//   GET    /api/admin/voice/rules[?sector=]
//   POST   /api/admin/voice/rules
//   GET    /api/admin/voice/timemodes
//   POST   /api/admin/voice/timemodes
//   GET    /api/admin/voice/logs[?sector=&spoken=&eventType=]
//   GET    /api/airport/reports?limit=10
//   POST   /api/airport/ops/resolve      { reportId }
//   POST   /api/airport/ops/take-charge  { reportId }  (escalade → EN_COURS)
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
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
  Megaphone,
  CheckCheck,
  TrendingUp,
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
import { parler } from "@/lib/staff-tts"

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
  important: { color: "bg-[#bc7155] text-white", label: "Important" },
  info: { color: "bg-[#bc7155] text-white", label: "Info" },
  silent: { color: "bg-zinc-400 text-white", label: "Silent" },
}

const TONE_STYLES: Record<Tone, { color: string; label: string }> = {
  urgent: { color: "bg-red-100 text-red-700 border-red-300", label: "Urgent" },
  firm: { color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]", label: "Ferme" },
  soft: { color: "bg-[#f3ddd2] text-[#8a4f3b] border-[#dba28a]", label: "Doux" },
  calm: { color: "bg-[#dcdee0] text-[#2e3040] border-[#8e8e95]", label: "Calme" },
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
        color: "bg-[#dcdee0] text-[#1c1d2c] border-[#8e8e95]",
        description: "Tous les types d'événements parlent (routine d'ouverture).",
      }
    case "service_lunch":
      return {
        label: "Service déjeuner",
        color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]",
        description: "Seuls critical + important parlent (info filtré).",
      }
    case "quiet":
      return {
        label: "Calme",
        color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]",
        description: "Seuls critical + important parlent (info filtré).",
      }
    case "service_dinner":
      return {
        label: "Service dîner",
        color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]",
        description: "Seuls critical + important parlent (info filtré).",
      }
    case "night":
      return {
        label: "Nuit",
        color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]",
        description: "Uniquement security_sanitary. Le reste est silencieux.",
      }
    default:
      return { label: mode, color: "bg-zinc-100 text-zinc-700 border-zinc-300", description: "" }
  }
}

// ---------- Main component ----------

export function AdminVoiceTab({ defaultTab = "matrix" }: { defaultTab?: "matrix" | "time" | "logs" | "test" | "signalements" }) {
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#bc7155] to-[#a05f45] text-white shadow-lg shadow-[#bc7155]/30">
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

      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 lg:w-fit">
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
          {/* Feature 2 — Gestion des Signalements (Denise command center) */}
          <TabsTrigger value="signalements" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Signalements
          </TabsTrigger>
        </TabsList>

        {/* ---------------- SECTION A : Matrice de Décision ---------------- */}
        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Volume2 className="h-5 w-5 text-[#a05f45]" />
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
                              <Plane className="h-4 w-4 text-[#3c3e4c]" />
                            ) : (
                              <Utensils className="h-4 w-4 text-[#a05f45]" />
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
                    <History className="h-5 w-5 text-[#a05f45]" />
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
                            <CheckCircle2 className="mx-auto h-4 w-4 text-[#a05f45]" />
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

        {/* ---------------- SECTION E : Gestion des Signalements (Feature 2) ---------------- */}
        <TabsContent value="signalements">
          <SignalementsDeniseSection />
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
              <Clock className="h-5 w-5 text-[#a05f45]" />
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
                  <Plane className="h-4 w-4 text-[#3c3e4c]" />
                ) : (
                  <Utensils className="h-4 w-4 text-[#a05f45]" />
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
            <TestTube2 className="h-5 w-5 text-[#a05f45]" />
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
            <ShieldAlert className="mb-1 inline h-4 w-4 text-[#a05f45]" />{" "}
            <strong>Note :</strong> certains navigateurs bloquent l'autoplay audio.
            Clique d'abord n'importe où sur la page si aucun son ne sort.
          </div>
        </CardContent>
      </Card>

      {/* Current time modes card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#a05f45]" />
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
                      <Plane className="h-4 w-4 text-[#3c3e4c]" />
                    ) : (
                      <Utensils className="h-4 w-4 text-[#a05f45]" />
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
              <Plane className="h-5 w-5 text-[#3c3e4c]" />
            ) : (
              <Utensils className="h-5 w-5 text-[#a05f45]" />
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

// ============================================================
// Feature 2 — Sub-section : Gestion des Signalements (Denise)
// ------------------------------------------------------------
// Command center Denise pour piloter les signalements aéroport :
//   - Liste les 10 derniers signalements (tous statuts confondus)
//     via GET /api/airport/reports?limit=10
//   - Polling 15 s pour afficher un feed temps réel
//   - Boutons par ligne :
//       • Annoncer   → parler() (TTS navigateur voix « Denise »)
//       • Résoudre   → POST /api/airport/ops/resolve { reportId }
//       • Escalader  → POST /api/airport/ops/take-charge { reportId }
//   - KPIs en haut : total / en attente / en cours / résolus
// ============================================================

type SignalementLigne = {
  id: string
  problemType: string
  tagScanne: string
  statut: string
  createdAt: string
  resolvedAt: string | null
  source: "airport" | "vip"
  trackingNumber?: string | null
  zone?: {
    code: string
    nom: string
    emoji: string | null
  } | null
}

const STATUT_STYLES: Record<string, { label: string; color: string }> = {
  EN_ATTENTE: { label: "En attente", color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]" },
  EN_COURS: { label: "En cours", color: "bg-[#dcdee0] text-[#1c1d2c] border-[#8e8e95]" },
  RESOLU: { label: "Résolu", color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]" },
  pending: { label: "En attente", color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]" },
  in_progress: { label: "En cours", color: "bg-[#dcdee0] text-[#1c1d2c] border-[#8e8e95]" },
  done: { label: "Résolu", color: "bg-[#f3ddd2] text-[#6f3f30] border-[#dba28a]" },
}

// Libellés pour les types de demandes VIP
const VIP_TYPE_LABELS: Record<string, string> = {
  refreshment: "Commande rafraîchissement",
  menu: "Demande menu",
  shower: "Réservation douche",
  charger: "Demande chargeur",
  concierge: "Appel concierge",
  problem: "Signalement problème",
  rating: "Évaluation client",
  cleanup: "Nettoyage table",
}

function formatTempsRelatifSignalement(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.max(0, (now.getTime() - d.getTime()) / 1000)
    if (diff < 60) return "à l'instant"
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

function SignalementsDeniseSection() {
  const { toast } = useToast()
  const [reports, setReports] = useState<SignalementLigne[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // IDs des signalements en cours d'action (Annoncer/Résoudre/Escalader)
  // pour désactiver le bouton pendant la requête.
  const [busyId, setBusyId] = useState<string | null>(null)
  // Snapshot des IDs déjà vus pour détecter les nouveaux (feed live).
  // Au premier chargement, on peuple le Set sans toast (sinon spam).
  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstPollRef = useRef(true)

  // Chargement + polling 15 s — fetch BOTH airport reports AND VIP table requests
  const load = useCallback(async () => {
    try {
      const [airportRes, vipRes] = await Promise.all([
        fetch("/api/airport/reports?limit=10", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/vip/requests?limit=20", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ])

      const airportListe: SignalementLigne[] = airportRes?.ok
        ? (airportRes.data.reports ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            problemType: r.problemType as string,
            tagScanne: r.tagScanne as string,
            statut: r.statut as string,
            createdAt: r.createdAt as string,
            resolvedAt: (r.resolvedAt as string) ?? null,
            source: "airport" as const,
            trackingNumber: null,
            zone: (r.zone as { code: string; nom: string; emoji: string | null } | null) ?? null,
          }))
        : []

      const vipListe: SignalementLigne[] = vipRes?.ok
        ? (vipRes.data ?? []).map((r: Record<string, unknown>) => {
            const table = r.table as { tableNumber?: string; zone?: string } | undefined
            const zoneMap: Record<string, string> = {
              main: "Espace Principal",
              buffet: "Buffet & Bar",
              relaxation: "Espace Détente",
              meeting: "Salles de Réunion",
            }
            return {
              id: r.id as string,
              problemType: VIP_TYPE_LABELS[r.type as string] ?? (r.type as string),
              tagScanne: `Table ${table?.tableNumber ?? "?"}`,
              statut: r.status as string,
              createdAt: r.createdAt as string,
              resolvedAt: null,
              source: "vip" as const,
              trackingNumber: (r.trackingNumber as string) ?? null,
              zone: {
                code: "vip",
                nom: zoneMap[table?.zone ?? "main"] ?? "Salon VIP",
                emoji: "🥂",
              },
            }
          })
        : []

      // Merge + sort by createdAt desc
      const all = [...airportListe, ...vipListe].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      const liste = all.slice(0, 20) // Keep top 20

      // Détection des nouveaux signalements
      if (firstPollRef.current) {
        for (const r of liste) seenIdsRef.current.add(r.id)
        firstPollRef.current = false
      } else {
        for (const r of liste) {
          if (!seenIdsRef.current.has(r.id)) {
            seenIdsRef.current.add(r.id)
          }
        }
      }
      setReports(liste)
    } catch {
      /* silencieux */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15_000)
    return () => clearInterval(t)
  }, [load])

  /** Annonce vocale via Denise (parler) — voix grave + débit rapide. */
  function annoncer(r: SignalementLigne) {
    const zoneNom = r.zone?.nom ?? r.tagScanne
    const texte = `Nouveau signalement. Zone ${zoneNom}. ${r.problemType}.`
    try {
      parler(texte)
      toast({
        title: "Annonce Denise ✓",
        description: texte,
      })
    } catch (e) {
      toast({
        title: "Erreur TTS",
        description: e instanceof Error ? e.message : "Synthèse vocale indisponible",
        variant: "destructive",
      })
    }
  }

  /** Marque un signalement comme résolu. Airport → POST /api/airport/ops/resolve. VIP → PATCH /api/vip/requests/[id]. */
  async function resoudre(r: SignalementLigne) {
    setBusyId(r.id)
    try {
      let okFlag = false
      if (r.source === "vip") {
        const res = await fetch(`/api/vip/requests/${encodeURIComponent(r.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        })
        const json = await res.json()
        okFlag = !!json.ok
        if (!okFlag) toast({ title: "Erreur", description: json.error ?? "Échec", variant: "destructive" })
      } else {
        const res = await fetch("/api/airport/ops/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: r.id }),
        })
        const json = await res.json()
        okFlag = !!json.ok
        if (!okFlag) toast({ title: "Erreur", description: json.error ?? "Échec", variant: "destructive" })
      }
      if (okFlag) {
        toast({
          title: "Signalement résolu ✓",
          description: `${r.problemType} (${r.zone?.nom ?? r.tagScanne})`,
        })
        try {
          parler(`Signalement résolu. Zone ${r.zone?.nom ?? r.tagScanne}.`)
        } catch {
          /* non bloquant */
        }
        setReports((prev) =>
          prev.map((x) =>
            x.id === r.id ? { ...x, statut: r.source === "vip" ? "done" : "RESOLU", resolvedAt: new Date().toISOString() } : x,
          ),
        )
        void load()
      }
    } catch (e) {
      toast({
        title: "Erreur réseau",
        description: e instanceof Error ? e.message : "Résolution impossible",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  /** Escalade un signalement → EN_COURS. Airport → POST /api/airport/ops/take-charge. VIP → PATCH /api/vip/requests/[id]. */
  async function escalader(r: SignalementLigne) {
    setBusyId(r.id)
    try {
      let okFlag = false
      if (r.source === "vip") {
        const res = await fetch(`/api/vip/requests/${encodeURIComponent(r.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        })
        const json = await res.json()
        okFlag = !!json.ok
        if (!okFlag) toast({ title: "Erreur", description: json.error ?? "Échec", variant: "destructive" })
      } else {
        const res = await fetch("/api/airport/ops/take-charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: r.id }),
        })
        const json = await res.json()
        okFlag = !!json.ok
        if (!okFlag) toast({ title: "Erreur", description: json.error ?? "Échec", variant: "destructive" })
      }
      if (okFlag) {
        toast({
          title: "Signalement escaladé",
          description: `${r.problemType} → EN_COURS`,
        })
        try {
          parler(`Escalade signalée. Zone ${r.zone?.nom ?? r.tagScanne}. Prise en charge ops.`)
        } catch {
          /* non bloquant */
        }
        setReports((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, statut: r.source === "vip" ? "in_progress" : "EN_COURS" } : x)),
        )
        void load()
      }
    } catch (e) {
      toast({
        title: "Erreur réseau",
        description: e instanceof Error ? e.message : "Escalade impossible",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  // KPIs dérivés — compte les statuts normalisés (airport EN_ATTENTE + VIP pending, etc.)
  const isAttente = (s: string) => s === "EN_ATTENTE" || s === "pending"
  const isEnCours = (s: string) => s === "EN_COURS" || s === "in_progress"
  const isResolu = (s: string) => s === "RESOLU" || s === "done"

  const total = reports.length
  const enAttente = reports.filter((r) => isAttente(r.statut)).length
  const enCours = reports.filter((r) => isEnCours(r.statut)).length
  const resolus = reports.filter((r) => isResolu(r.statut)).length

  return (
    <div className="space-y-4">
      {/* Bandeau KPIs + actions globales */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#bc7155]" />
                Gestion des Signalements
              </CardTitle>
              <CardDescription>
                Command center Denise — feed temps réel (polling 15 s). Signalements Aéroport + Salon VIP.
                « Annoncer » déclenche la voix Denise sur ce navigateur.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing || loading}
              onClick={() => {
                setRefreshing(true)
                void load()
              }}
            >
              {refreshing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiPill label="Total" value={total} icon={<Plane className="h-3.5 w-3.5" />} color="bg-zinc-100 text-zinc-700" />
            <KpiPill label="En attente" value={enAttente} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-[#f3ddd2] text-[#6f3f30]" />
            <KpiPill label="En cours" value={enCours} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-[#dcdee0] text-[#1c1d2c]" />
            <KpiPill label="Résolus" value={resolus} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="bg-[#f3ddd2] text-[#6f3f30]" />
          </div>
        </CardContent>
      </Card>

      {/* Table des signalements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">20 derniers signalements (Aéroport + Salon VIP)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Chargement…
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3ddd2]" aria-hidden>
                <CheckCircle2 className="h-5 w-5 text-[#a05f45]" />
              </span>
              <p className="text-sm font-medium">Aucun signalement pour le moment</p>
              <p className="text-xs text-muted-foreground">
                Les incidents aéroport et demandes salon VIP apparaîtront ici en temps réel.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Incident</TableHead>
                    <TableHead className="min-w-[120px]">Zone</TableHead>
                    <TableHead className="text-center">Statut</TableHead>
                    <TableHead className="text-right min-w-[110px]">Signalé</TableHead>
                    <TableHead className="text-right min-w-[260px]">Actions Denise</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => {
                    const st = STATUT_STYLES[r.statut] ?? {
                      label: r.statut,
                      color: "bg-zinc-100 text-zinc-700 border-zinc-300",
                    }
                    const isBusy = busyId === r.id
                    const resolu = isResolu(r.statut)
                    return (
                      <TableRow key={`${r.source}-${r.id}`} className={resolu ? "opacity-60" : ""}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[#f3ddd2] text-sm" aria-hidden>
                              {r.zone?.emoji ?? "⚠"}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-medium leading-snug">{r.problemType}</p>
                                {/* Badge source */}
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 px-1 py-0 text-[9px] ${
                                    r.source === "vip"
                                      ? "border-[#bc7155]/40 bg-[#bc7155]/10 text-[#8B6F47]"
                                      : "border-[#8e8e95] bg-[#f0f1f2] text-[#2e3040]"
                                  }`}
                                >
                                  {r.source === "vip" ? "VIP" : "AÉRO"}
                                </Badge>
                              </div>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={r.id}>
                                {r.trackingNumber ? `#${r.trackingNumber}` : `#${r.id.slice(-8)}`} · {r.tagScanne}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{r.zone?.nom ?? r.tagScanne}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={st.color}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatTempsRelatifSignalement(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 border-[#dba28a] text-[#8a4f3b] hover:bg-[#faf1ec]"
                              disabled={isBusy}
                              onClick={() => annoncer(r)}
                              aria-label={`Annoncer ${r.problemType}`}
                              title="Denise parle (TTS)"
                            >
                              <Megaphone className="h-3.5 w-3.5" aria-hidden />
                              Annoncer
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 border-[#dba28a] text-[#8a4f3b] hover:bg-[#faf1ec]"
                              disabled={isBusy || resolu}
                              onClick={() => void escalader(r)}
                              aria-label={`Escalader ${r.problemType}`}
                              title="Marquer EN_COURS"
                            >
                              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                              Escalader
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 bg-[#a05f45] text-white hover:bg-[#8a4f3b]"
                              disabled={isBusy || resolu}
                              onClick={() => void resoudre(r)}
                              aria-label={`Résoudre ${r.problemType}`}
                              title="Marquer RESOLU"
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                              )}
                              Résoudre
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Petite pastille KPI utilisée dans la section signalements. */
function KpiPill({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg ${color} px-3 py-2`}>
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      </div>
    </div>
  )
}
