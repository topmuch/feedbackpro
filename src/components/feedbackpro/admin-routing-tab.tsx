"use client"

// ============================================================
// AdminRoutingTab — MOTEUR DE ROUTAGE INTELLIGENT (SuperAdmin)
// ------------------------------------------------------------
// "Quand un signalement arrive, le système sait instantanément QUI
// doit le traiter, OÙ il est, et POURQUOI c'est lui."
//
// 4 sections :
//   A. 🗺️ Matrice de Routage — vue matricielle Zones × Types ×
//      Employés. Clic sur une cellule → édition de la règle
//      (catégorie cible, fallback, escalade, Nathalie, priorité).
//      Légende 👤 = assigné · 👑 = escalade · — = aucun routage.
//   B. 👥 Employés — création/édition avec assignation intelligente :
//      catégorie, zones, types maîtrisés, capacité max, shift,
//      Nathalie. Stats live (charge, succès, temps moyen).
//   C. ⏰ Tâches proactives — planification (interval, daily…),
//      checklist, routage automatique.
//   D. 📊 Statistiques — 7 jours : % auto, escalades, temps moyen,
//      top routeurs, heatmap. + Historique récent.
//
// + 🧪 Tester un routage : simulation du moteur (dry-run) avec
//   détail du score.
//
// Contrat : GET /api/routing/overview?tenant=vip_lounge
//   POST/DELETE /api/routing/rules · /api/routing/staff ·
//   /api/routing/proactive · POST /api/routing/test
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Network,
  RefreshCw,
  Loader2,
  Users,
  Clock,
  BarChart3,
  FlaskConical,
  Download,
  Pencil,
  Trash2,
  Plus,
  Play,
  AlertTriangle,
  CheckCircle2,
  Wifi,
  WifiOff,
  Timer,
  Zap,
  Crown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { exportToCsv } from "@/lib/export-csv"
import {
  ROUTING_CATEGORIES,
  ROUTING_SIGNAL_TYPES,
  VIP_ROUTING_ZONES,
  PRIORITE_CLASSE,
  CATEGORIE_LABEL,
  CATEGORIE_EMOJI,
  SIGNAL_LABEL,
  SIGNAL_EMOJI,
  ZONE_LABEL,
  ZONE_EMOJI,
  PRIORITE_LABEL,
} from "@/lib/routing-config"

// ---------- Types (mirror API) ----------

type RegleRoutage = {
  id: string
  tenantKey: string
  zoneCode: string | null
  signalType: string | null
  priority: string
  targetCategory: string
  targetStaffIds: string
  fallbackCategory: string | null
  escalationAfterMin: number
  escalationTarget: string
  deniseAnnounce: boolean
  deniseTone: string
  rulePriority: number
  active: boolean
}

type StaffRoutage = {
  id: string
  competencyId: string
  name: string
  phone: string
  role: string
  active: boolean
  category: string
  zones: string[]
  signalTypes: string[]
  isOnDuty: boolean
  shiftStart: string | null
  shiftEnd: string | null
  shiftDays: number[]
  maxActiveTasks: number
  currentZone: string | null
  deniseEnabled: boolean
  deniseTone: string
  activeTasks: number
  todayCount: number
  successRate: number | null
  avgResolutionMin: number | null
  closedTotal: number
}

type LigneHisto = {
  id: string
  incidentKind: string
  incidentId: string | null
  incidentLabel: string | null
  zoneCode: string | null
  signalType: string | null
  priority: string
  staffId: string | null
  staffName: string | null
  score: number
  breakdown: { label: string; points: number }[]
  decisionMs: number
  escalated: boolean
  open: boolean
  outcome: string
  responseTimeSec: number | null
  resolutionTimeSec: number | null
  createdAt: string
}

type TacheProactive = {
  id: string
  title: string
  description: string | null
  targetZone: string | null
  targetCategory: string | null
  targetStaffId: string | null
  recurrence: string
  intervalMinutes: number | null
  scheduledTimes: string[]
  checklistItems: { item: string; required: boolean }[]
  notifyVia: string[]
  deniseMessage: string | null
  lastRunAt: string | null
  nextRunAt: string | null
  active: boolean
}

type StatsRoutage = {
  total: number
  escalades: number
  nonResolus: number
  tauxAutomatique: number
  tauxEscalade: number
  avgDecisionMs: number
  avgAssignSec: number
  topRouteurs: { staffId: string; name: string; total: number; successRate: number; avgResolutionMin: number | null }[]
  heatmap: { zone: string | null; label: string; count: number }[]
}

type Overview = {
  tenantKey: string
  rules: RegleRoutage[]
  staff: StaffRoutage[]
  history: LigneHisto[]
  proactive: TacheProactive[]
  alertes: { type: string; message: string; severity: string }[]
  stats: StatsRoutage
}

const TENANT = "vip_lounge"
const JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

// ---------- Résolution de la matrice (client) ----------

function reglePourCellule(rules: RegleRoutage[], zone: string, type: string): RegleRoutage | null {
  const match = rules
    .filter((r) => r.active && (!r.zoneCode || r.zoneCode === zone) && (!r.signalType || r.signalType === type))
    .sort((a, b) => {
      const specA = (a.zoneCode ? 2 : 0) + (a.signalType ? 1 : 0)
      const specB = (b.zoneCode ? 2 : 0) + (b.signalType ? 1 : 0)
      if (specB !== specA) return specB - specA
      return b.rulePriority - a.rulePriority
    })
  return match[0] ?? null
}

function staffPourRegle(rule: RegleRoutage | null, staff: StaffRoutage[]): StaffRoutage[] {
  if (!rule) return []
  const idsImposes = (() => {
    try {
      const v = JSON.parse(rule.targetStaffIds)
      return Array.isArray(v) ? (v as string[]) : []
    } catch {
      return []
    }
  })()
  const base = idsImposes.length > 0 ? staff.filter((s) => idsImposes.includes(s.id)) : staff.filter((s) => s.category === rule.targetCategory)
  return base.filter((s) => s.active && s.isOnDuty)
}

// ---------- Composant principal ----------

export function AdminRoutingTab() {
  const { toast } = useToast()
  const [data, setData] = useState<Overview | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enregistre, setEnregistre] = useState(false)

  // Dialog règle (matrice)
  const [regleEdition, setRegleEdition] = useState<RegleRoutage | null>(null)
  const [regleNouvelle, setRegleNouvelle] = useState<{ zone: string; type: string } | null>(null)
  const [sauvegardeRegle, setSauvegardeRegle] = useState(false)

  // Dialog employé
  const [employeEdition, setEmployeEdition] = useState<StaffRoutage | null>(null)
  const [employeNouveau, setEmployeNouveau] = useState(false)
  const [sauvegardeEmploye, setSauvegardeEmploye] = useState(false)

  // Dialog tâche proactive
  const [tacheEdition, setTacheEdition] = useState<TacheProactive | null>(null)
  const [tacheNouvelle, setTacheNouvelle] = useState(false)
  const [sauvegardeTache, setSauvegardeTache] = useState(false)

  // Dialog test
  const [testOuvert, setTestOuvert] = useState(false)
  const [testZone, setTestZone] = useState("vip_buffet")
  const [testType, setTestType] = useState("commande")
  const [testPriorite, setTestPriorite] = useState("medium")
  const [testResultat, setTestResultat] = useState<{
    ok: boolean
    staff?: { name: string; category: string } | null
    rule?: { zoneCode: string | null; signalType: string | null; priority: string } | null
    score?: number
    breakdown?: { label: string; points: number }[]
    decisionMs?: number
    message?: string
    denise?: { forStaff: string | null; forManager: string | null } | null
  } | null>(null)
  const [testEnCours, setTestEnCours] = useState(false)

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setChargement(true)
    try {
      const res = await fetch(`/api/routing/overview?tenant=${TENANT}`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setData(json.data)
      else if (!silencieux) toast({ title: "Erreur", description: json.error ?? "Chargement impossible", variant: "destructive" })
    } catch {
      if (!silencieux) toast({ title: "Erreur réseau", description: "Impossible de charger le moteur de routage", variant: "destructive" })
    } finally {
      setChargement(false)
    }
  }, [toast])

  useEffect(() => {
    charger()
    const iv = setInterval(() => charger(true), 30000)
    return () => clearInterval(iv)
  }, [charger])

  // ---------- Actions règles ----------

  async function enregistrerRegle(regle: Partial<RegleRoutage> & { id?: string }) {
    setSauvegardeRegle(true)
    try {
      const res = await fetch("/api/routing/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...regle, tenantKey: TENANT }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Règle enregistrée", description: "La matrice de routage a été mise à jour." })
        setRegleEdition(null)
        setRegleNouvelle(null)
        await charger(true)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Enregistrement impossible", variant: "destructive" })
      }
    } finally {
      setSauvegardeRegle(false)
    }
  }

  async function supprimerRegle(id: string) {
    try {
      const res = await fetch(`/api/routing/rules?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Règle supprimée" })
        setRegleEdition(null)
        await charger(true)
      }
    } catch {
      toast({ title: "Erreur", description: "Suppression impossible", variant: "destructive" })
    }
  }

  // ---------- Actions employés ----------

  async function enregistrerEmploye(payload: Record<string, unknown>) {
    setSauvegardeEmploye(true)
    try {
      const res = await fetch("/api/routing/staff", {
        method: employeEdition ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employeEdition ? { id: employeEdition.id, ...payload } : payload),
      })
      const json = await res.json()
      if (json.ok) {
        toast({ title: employeEdition ? "Employé mis à jour" : "Employé créé et routage activé" })
        setEmployeEdition(null)
        setEmployeNouveau(false)
        await charger(true)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Enregistrement impossible", variant: "destructive" })
      }
    } finally {
      setSauvegardeEmploye(false)
    }
  }

  async function basculerService(s: StaffRoutage) {
    await fetch("/api/routing/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, isOnDuty: !s.isOnDuty }),
    })
    await charger(true)
  }

  async function desactiverEmploye(s: StaffRoutage) {
    await fetch(`/api/routing/staff?id=${s.id}`, { method: "DELETE" })
    toast({ title: "Employé désactivé", description: "Il ne recevra plus de routage (historique conservé)." })
    await charger(true)
  }

  // ---------- Actions tâches proactives ----------

  async function enregistrerTache(payload: Record<string, unknown>) {
    setSauvegardeTache(true)
    try {
      const res = await fetch("/api/routing/proactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, tenantKey: TENANT }),
      })
      const json = await res.json()
      if (json.ok) {
        toast({ title: "Tâche proactive enregistrée", description: "Prochaine exécution dans 2 minutes." })
        setTacheEdition(null)
        setTacheNouvelle(false)
        await charger(true)
      } else {
        toast({ title: "Erreur", description: json.error ?? "Enregistrement impossible", variant: "destructive" })
      }
    } finally {
      setSauvegardeTache(false)
    }
  }

  async function supprimerTache(id: string) {
    await fetch(`/api/routing/proactive?id=${id}`, { method: "DELETE" })
    toast({ title: "Tâche supprimée" })
    setTacheEdition(null)
    await charger(true)
  }

  // ---------- Test de routage ----------

  async function lancerTest() {
    setTestEnCours(true)
    setTestResultat(null)
    try {
      const res = await fetch("/api/routing/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: testZone, signalType: testType, priority: testPriorite, tenantKey: TENANT }),
      })
      const json = await res.json()
      if (json.ok) setTestResultat(json.data)
      else toast({ title: "Erreur", description: json.error ?? "Test impossible", variant: "destructive" })
    } finally {
      setTestEnCours(false)
    }
  }

  // ---------- Export ----------

  function exporterMatrice() {
    if (!data) return
    const lignes: Record<string, unknown>[] = []
    for (const z of VIP_ROUTING_ZONES) {
      for (const t of ROUTING_SIGNAL_TYPES) {
        const r = reglePourCellule(data.rules, z.code, t.code)
        if (r) {
          const equipe = staffPourRegle(r, data.staff)
          lignes.push({
            Zone: ZONE_LABEL(z.code),
            "Type signalement": SIGNAL_LABEL(t.code),
            "Catégorie cible": CATEGORIE_LABEL(r.targetCategory),
            "Employé(s) routé(s)": equipe.map((e) => e.name).join(", ") || "—",
            "Fallback": r.fallbackCategory ? CATEGORIE_LABEL(r.fallbackCategory) : "—",
            "Escalade après (min)": r.escalationAfterMin,
            "Priorité": PRIORITE_LABEL[r.priority] ?? r.priority,
            "Nathalie": r.deniseAnnounce ? `Oui (${r.deniseTone})` : "Non",
            "Poids règle": r.rulePriority,
          })
        }
      }
    }
    exportToCsv("matrice-routage-salon-vip", lignes)
    toast({ title: "Export CSV généré", description: `${lignes.length} règles exportées.` })
  }

  // ---------- Rendu ----------

  if (chargement && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    )
  }
  if (!data) return null

  const s = data.stats

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
            <Network className="h-5 w-5 text-[#a05f45]" />
            Moteur de Routage Intelligent — Salon VIP Terra
          </h2>
          <p className="text-sm text-stone-500">
            Visualisez qui traite quoi, où, et quand — sans intervention humaine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => charger()}>
            <RefreshCw className={cn("mr-1 h-4 w-4", chargement && "animate-spin")} />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={exporterMatrice}>
            <Download className="mr-1 h-4 w-4" />
            Exporter
          </Button>
          <Button size="sm" className="bg-[#a05f45] text-white hover:bg-[#8a4f3b]" onClick={() => setTestOuvert(true)}>
            <FlaskConical className="mr-1 h-4 w-4" />
            Tester un routage
          </Button>
        </div>
      </div>

      <Tabs defaultValue="matrice" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="matrice" className="gap-1"><Network className="h-4 w-4" /> Matrice</TabsTrigger>
          <TabsTrigger value="employes" className="gap-1"><Users className="h-4 w-4" /> Employés</TabsTrigger>
          <TabsTrigger value="proactif" className="gap-1"><Clock className="h-4 w-4" /> Tâches proactives</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1"><BarChart3 className="h-4 w-4" /> Statistiques</TabsTrigger>
        </TabsList>

        {/* ============ A. MATRICE ============ */}
        <TabsContent value="matrice" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vue matricielle : Zones × Types × Employés</CardTitle>
              <CardDescription>
                Chaque cellule montre la règle la plus spécifique et l&apos;employé qui serait routé automatiquement. Cliquez pour éditer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[480px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-white">
                    <TableRow>
                      <TableHead className="min-w-[150px]">Zone</TableHead>
                      {ROUTING_SIGNAL_TYPES.map((t) => (
                        <TableHead key={t.code} className="min-w-[105px] text-center text-xs">
                          {t.emoji} {t.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {VIP_ROUTING_ZONES.map((z) => (
                      <TableRow key={z.code}>
                        <TableCell className="font-medium">
                          {z.emoji} {z.label}
                        </TableCell>
                        {ROUTING_SIGNAL_TYPES.map((t) => {
                          const r = reglePourCellule(data.rules, z.code, t.code)
                          const equipe = staffPourRegle(r, data.staff)
                          const premier = equipe[0]
                          return (
                            <TableCell key={t.code} className="p-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setRegleNouvelle(null)
                                  setRegleEdition(
                                    r ?? {
                                      id: "",
                                      tenantKey: TENANT,
                                      zoneCode: z.code,
                                      signalType: t.code,
                                      priority: "medium",
                                      targetCategory: "serveur",
                                      targetStaffIds: "[]",
                                      fallbackCategory: "manager",
                                      escalationAfterMin: 10,
                                      escalationTarget: "manager",
                                      deniseAnnounce: true,
                                      deniseTone: "normal",
                                      rulePriority: 3,
                                      active: true,
                                    },
                                  )
                                }}
                                className={cn(
                                  "w-full rounded-md border px-2 py-1.5 text-left text-xs transition hover:border-[#c98b72] hover:bg-[#faf1ec]",
                                  r ? "border-stone-200 bg-white" : "border-dashed border-stone-200 bg-stone-50 text-stone-400",
                                )}
                              >
                                {r ? (
                                  <>
                                    <span className="font-semibold">
                                      {premier ? "👤" : "👑"} {premier ? premier.name.split(" ")[0] : CATEGORIE_LABEL(r.targetCategory)}
                                    </span>
                                    <span className="block truncate text-[10px] text-stone-500">
                                      {premier ? "" : "aucun en service · "}{r.escalationAfterMin}min → {CATEGORIE_LABEL(r.fallbackCategory ?? r.escalationTarget)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="block text-center">—</span>
                                )}
                              </button>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-stone-500">
                <span>👤 = assigné automatiquement</span>
                <span>👑 = escalade (personne de disponible)</span>
                <span>— = aucun routage configuré</span>
              </div>
            </CardContent>
          </Card>

          {/* Alertes orchestration */}
          {data.alertes.length > 0 && (
            <Card className="border-[#e7c1ae] bg-[#faf1ec]/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-[#6f3f30]">
                  <AlertTriangle className="h-4 w-4" /> Alertes orchestration ({data.alertes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {data.alertes.map((a, i) => (
                  <p key={i} className={cn("text-sm", a.severity === "danger" ? "text-red-700" : "text-[#8a4f3b]")}>
                    • {a.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Règles brutes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Toutes les règles ({data.rules.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {data.rules.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setRegleNouvelle(null); setRegleEdition(r) }}
                    className="flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition hover:border-[#c98b72] hover:bg-[#faf1ec]"
                  >
                    <Badge variant="outline" className={cn("border", PRIORITE_CLASSE[r.priority] ?? "")}>
                      {PRIORITE_LABEL[r.priority] ?? r.priority}
                    </Badge>
                    <span className="font-medium">{ZONE_EMOJI(r.zoneCode)} {ZONE_LABEL(r.zoneCode)}</span>
                    <span className="text-stone-400">·</span>
                    <span>{SIGNAL_EMOJI(r.signalType)} {SIGNAL_LABEL(r.signalType)}</span>
                    <span className="ml-auto text-stone-600">
                      → {CATEGORIE_EMOJI(r.targetCategory)} {CATEGORIE_LABEL(r.targetCategory)}
                      <span className="ml-2 text-xs text-stone-400">
                        escalade {r.escalationAfterMin}min → {CATEGORIE_LABEL(r.fallbackCategory ?? r.escalationTarget)}
                      </span>
                    </span>
                    {!r.active && <Badge variant="outline" className="text-stone-400">inactive</Badge>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ B. EMPLOYÉS ============ */}
        <TabsContent value="employes" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-500">
              {data.staff.filter((x) => x.isOnDuty).length}/{data.staff.length} en service — capacité anti-surcharge par employé.
            </p>
            <Button size="sm" className="bg-[#a05f45] text-white hover:bg-[#8a4f3b]" onClick={() => setEmployeNouveau(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nouvel employé
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.staff.map((emp) => {
              const charge = emp.activeTasks / Math.max(1, emp.maxActiveTasks)
              return (
                <Card key={emp.id} className={cn(!emp.active && "opacity-50")}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-stone-900">{emp.name}</p>
                        <p className="text-xs text-stone-500">
                          {CATEGORIE_EMOJI(emp.category)} {CATEGORIE_LABEL(emp.category)} · {emp.phone}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={emp.isOnDuty} onCheckedChange={() => basculerService(emp)} aria-label="En service" />
                        <button
                          type="button"
                          onClick={() => setEmployeEdition(emp)}
                          className="rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                          aria-label="Éditer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <Badge
                        variant="outline"
                        className={cn(
                          "border",
                          charge >= 1 ? "border-red-300 bg-red-50 text-red-700" : charge >= 0.66 ? "border-[#dba28a] bg-[#faf1ec] text-[#8a4f3b]" : "border-[#dba28a] bg-[#faf1ec] text-[#8a4f3b]",
                        )}
                      >
                        Charge {emp.activeTasks}/{emp.maxActiveTasks}
                      </Badge>
                      {emp.successRate != null && (
                        <Badge variant="outline" className="border-stone-200 text-stone-600">
                          {emp.successRate}% succès
                        </Badge>
                      )}
                      {emp.avgResolutionMin != null && (
                        <Badge variant="outline" className="border-stone-200 text-stone-600">
                          {emp.avgResolutionMin} min moy
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-stone-200 text-stone-600">
                        {emp.todayCount} aujourd&apos;hui
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {emp.zones.map((z) => (
                        <Badge key={z} variant="outline" className="text-[10px] text-stone-500">
                          {ZONE_EMOJI(z)} {ZONE_LABEL(z)}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {emp.signalTypes.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px] text-stone-500">
                          {SIGNAL_EMOJI(t)} {SIGNAL_LABEL(t)}
                        </Badge>
                      ))}
                    </div>

                    <p className="mt-2 flex items-center gap-1 text-[11px] text-stone-400">
                      {emp.isOnDuty ? <Wifi className="h-3 w-3 text-[#a05f45]" /> : <WifiOff className="h-3 w-3" />}
                      {emp.isOnDuty ? "En service" : "Hors service"}
                      {emp.shiftStart && emp.shiftEnd ? ` · shift ${emp.shiftStart}–${emp.shiftEnd}` : " · 24/7"}
                      {emp.deniseEnabled && " · Nathalie"}
                    </p>

                    {emp.active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 text-xs text-red-500 hover:text-red-700"
                        onClick={() => desactiverEmploye(emp)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Désactiver
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ============ C. TÂCHES PROACTIVES ============ */}
        <TabsContent value="proactif" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-500">
              Au-delà des signalements : rondes et vérifications planifiées, routées automatiquement.
            </p>
            <Button size="sm" className="bg-[#a05f45] text-white hover:bg-[#8a4f3b]" onClick={() => setTacheNouvelle(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nouvelle tâche
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.proactive.map((t) => (
              <Card key={t.id} className={cn(!t.active && "opacity-50")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900">{t.title}</p>
                      <p className="mt-0.5 text-xs text-stone-500">{t.description}</p>
                    </div>
                    <Switch checked={t.active} onCheckedChange={(v) => enregistrerTache({ id: t.id, title: t.title, active: v })} aria-label="Active" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
                    <Badge variant="outline" className="border-stone-200 text-stone-600">
                      {ZONE_EMOJI(t.targetZone)} {ZONE_LABEL(t.targetZone)}
                    </Badge>
                    {t.targetCategory && (
                      <Badge variant="outline" className="border-stone-200 text-stone-600">
                        {CATEGORIE_EMOJI(t.targetCategory)} {CATEGORIE_LABEL(t.targetCategory)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-[#e7c1ae] bg-[#faf1ec] text-[#8a4f3b]">
                      {t.recurrence === "interval" ? `toutes les ${t.intervalMinutes} min` : t.recurrence}
                    </Badge>
                  </div>
                  {t.checklistItems.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
                      {t.checklistItems.map((c, i) => (
                        <li key={i}>☐ {c.item}{c.required ? " *" : ""}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-stone-400">
                    {t.lastRunAt ? `Dernière : ${new Date(t.lastRunAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Jamais exécutée"}
                    {" · "}
                    {t.nextRunAt ? `Prochaine : ${new Date(t.nextRunAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "—"}
                    {t.notifyVia.includes("denise") && " · 🔊 Nathalie"}
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setTacheNouvelle(false); setTacheEdition(t) }}>
                      <Pencil className="mr-1 h-3 w-3" /> Éditer
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => supprimerTache(t.id)}>
                      <Trash2 className="mr-1 h-3 w-3" /> Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ============ D. STATISTIQUES ============ */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-stone-500"><CheckCircle2 className="h-3.5 w-3.5 text-[#a05f45]" /> Routés automatiquement (7j)</p>
                <p className="mt-1 text-2xl font-bold text-[#8a4f3b]">{s.tauxAutomatique}%</p>
                <p className="text-[11px] text-stone-400">{s.total - s.escalades} / {s.total} signalements</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-stone-500"><AlertTriangle className="h-3.5 w-3.5 text-[#a05f45]" /> Escaladés manager</p>
                <p className="mt-1 text-2xl font-bold text-[#8a4f3b]">{s.tauxEscalade}%</p>
                <p className="text-[11px] text-stone-400">{s.escalades} escalades</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-stone-500"><Timer className="h-3.5 w-3.5 text-stone-500" /> Non résolus</p>
                <p className="mt-1 text-2xl font-bold text-stone-800">{s.nonResolus}</p>
                <p className="text-[11px] text-stone-400">tâches ouvertes actuellement</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-stone-500"><Zap className="h-3.5 w-3.5 text-[#a05f45]" /> Temps de décision</p>
                <p className="mt-1 text-2xl font-bold text-[#8a4f3b]">{s.avgDecisionMs} ms</p>
                <p className="text-[11px] text-stone-400">moteur &lt; 500 ms cible</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="flex items-center gap-1.5 text-xs text-stone-500"><Play className="h-3.5 w-3.5 text-stone-500" /> Assignation moyenne</p>
                <p className="mt-1 text-2xl font-bold text-stone-800">{s.avgAssignSec > 0 ? `${Math.round(s.avgAssignSec / 60)} min` : "—"}</p>
                <p className="text-[11px] text-stone-400">création → prise en charge</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top routeurs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Crown className="h-4 w-4 text-[#a05f45]" /> Top routeurs (7 jours)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.topRouteurs.length === 0 && <p className="text-sm text-stone-400">Aucun historique sur la période.</p>}
                {s.topRouteurs.map((r, i) => (
                  <div key={r.staffId} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm font-bold text-[#8a4f3b]">#{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-stone-500">
                        {r.total} tâches · {r.successRate}% succès
                        {r.avgResolutionMin != null && ` · ${r.avgResolutionMin} min moy`}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Heatmap */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Heatmap routage (dernière heure)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.heatmap.length === 0 && <p className="text-sm text-stone-400">Aucun incident routé dans la dernière heure.</p>}
                {s.heatmap.map((h) => {
                  const max = Math.max(...s.heatmap.map((x) => x.count), 1)
                  return (
                    <div key={h.zone ?? "null"} className="flex items-center gap-2 text-sm">
                      <span className="w-40 shrink-0 text-stone-600">{ZONE_EMOJI(h.zone)} {h.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-[#bc7155]" style={{ width: `${(h.count / max) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right font-medium">{h.count}</span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Historique récent */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Historique de routage récent</CardTitle>
              <CardDescription>Journal complet pour l&apos;IA d&apos;optimisation (Phase 6).</CardDescription>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Heure</TableHead>
                    <TableHead>Incident</TableHead>
                    <TableHead>Assigné à</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Décision</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.slice(0, 40).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap text-xs text-stone-500">
                        {new Date(h.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm">
                        {ZONE_EMOJI(h.zoneCode)} {h.incidentLabel ?? SIGNAL_LABEL(h.signalType)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {h.staffName ?? <span className="text-stone-400">non assigné</span>}
                        {h.escalated && <Badge variant="outline" className="ml-1 border-red-200 text-[10px] text-red-600">escaladé</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-stone-500">{h.score} pts · {h.decisionMs} ms</TableCell>
                      <TableCell className="text-xs text-stone-500">{ZONE_LABEL(h.zoneCode)} · {SIGNAL_LABEL(h.signalType)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            h.outcome === "resolved" && "border-[#e7c1ae] text-[#8a4f3b]",
                            h.outcome === "accepted" && "border-[#b9bbc2] text-[#2e3040]",
                            (h.outcome === "failed" || h.outcome === "timeout") && "border-red-200 text-red-700",
                            h.outcome === "escalated" && "border-[#e7c1ae] text-[#8a4f3b]",
                            (h.outcome === "assigned" || h.outcome === "accepted") && h.open && "border-[#e7c1ae] bg-[#faf1ec] text-[#8a4f3b]",
                          )}
                        >
                          {h.open ? "en cours" : h.outcome}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ DIALOG RÈGLE (matrice) ============ */}
      <Dialog open={!!regleEdition} onOpenChange={(v) => !v && setRegleEdition(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {regleEdition?.id ? "Éditer la règle" : "Créer une règle de routage"}
            </DialogTitle>
            <DialogDescription>
              {regleEdition ? `${ZONE_LABEL(regleEdition.zoneCode)} × ${SIGNAL_LABEL(regleEdition.signalType)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {regleEdition && (
            <RegleForm
              initial={regleEdition}
              sauvegarde={sauvegardeRegle}
              onEnregistrer={(payload) => enregistrerRegle({ id: regleEdition.id || undefined, ...payload })}
              onSupprimer={regleEdition.id ? () => supprimerRegle(regleEdition.id) : undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG EMPLOYÉ ============ */}
      <Dialog open={employeNouveau || !!employeEdition} onOpenChange={(v) => { if (!v) { setEmployeNouveau(false); setEmployeEdition(null) } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{employeEdition ? `Éditer — ${employeEdition.name}` : "Nouvel employé — Configuration"}</DialogTitle>
            <DialogDescription>
              Compétences, zones, capacité et disponibilité pilotent le routage automatique.
            </DialogDescription>
          </DialogHeader>
          <EmployeForm
            initial={employeEdition}
            sauvegarde={sauvegardeEmploye}
            onEnregistrer={enregistrerEmploye}
          />
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG TÂCHE PROACTIVE ============ */}
      <Dialog open={tacheNouvelle || !!tacheEdition} onOpenChange={(v) => { if (!v) { setTacheNouvelle(false); setTacheEdition(null) } }}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tacheEdition ? `Éditer — ${tacheEdition.title}` : "Nouvelle tâche proactive"}</DialogTitle>
            <DialogDescription>Ronde planifiée, routée automatiquement vers la bonne catégorie.</DialogDescription>
          </DialogHeader>
          <TacheForm
            initial={tacheEdition}
            sauvegarde={sauvegardeTache}
            onEnregistrer={enregistrerTache}
            staffDisponibles={data.staff}
          />
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG TEST ============ */}
      <Dialog open={testOuvert} onOpenChange={setTestOuvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-[#a05f45]" /> Tester un routage</DialogTitle>
            <DialogDescription>
              Simulation sans effet réel : le moteur calcule QUI serait assigné et POURQUOI (détail du score).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Zone</Label>
                <Select value={testZone} onValueChange={setTestZone}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIP_ROUTING_ZONES.map((z) => (
                      <SelectItem key={z.code} value={z.code}>{z.emoji} {z.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={testType} onValueChange={setTestType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUTING_SIGNAL_TYPES.map((t) => (
                      <SelectItem key={t.code} value={t.code}>{t.emoji} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priorité</Label>
                <Select value={testPriorite} onValueChange={setTestPriorite}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Normale</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="critical">Critique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full bg-[#a05f45] text-white hover:bg-[#8a4f3b]" onClick={lancerTest} disabled={testEnCours}>
              {testEnCours ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
              Lancer la simulation
            </Button>

            {testResultat && (
              <div className="space-y-2 rounded-lg border bg-stone-50 p-3">
                {testResultat.ok && testResultat.staff ? (
                  <>
                    <p className="text-sm">
                      <span className="font-semibold text-[#8a4f3b]">✓ Gagnant : {testResultat.staff.name}</span>
                      <span className="ml-2 text-stone-500">({CATEGORIE_LABEL(testResultat.staff.category)}) — {testResultat.score} pts en {testResultat.decisionMs} ms</span>
                    </p>
                    {testResultat.rule && (
                      <p className="text-xs text-stone-500">
                        Règle appliquée : {ZONE_LABEL(testResultat.rule.zoneCode)} × {SIGNAL_LABEL(testResultat.rule.signalType)} ({PRIORITE_LABEL[testResultat.rule.priority]})
                      </p>
                    )}
                    {testResultat.breakdown && testResultat.breakdown.length > 0 && (
                      <ul className="space-y-0.5">
                        {testResultat.breakdown.map((b, i) => (
                          <li key={i} className="flex justify-between text-xs text-stone-600">
                            <span>{b.label}</span>
                            <span className={cn("font-medium", b.points >= 0 ? "text-[#8a4f3b]" : "text-red-600")}>
                              {b.points >= 0 ? "+" : ""}{b.points}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {testResultat.denise && (
                      <div className="mt-1 space-y-1 border-t pt-2 text-xs text-stone-600">
                        <p>🎙️ Staff : « {testResultat.denise.forStaff} »</p>
                        <p>👑 Manager : « {testResultat.denise.forManager} »</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#8a4f3b]">⚠ {testResultat.message ?? "Aucun candidat disponible pour cette combinaison."}</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* indicateur de rafraîchissement discret */}
      {enregistre && <span className="sr-only">Données rafraîchies</span>}
    </div>
  )
}

// ============================================================
// Formulaire règle
// ============================================================

function RegleForm({
  initial,
  sauvegarde,
  onEnregistrer,
  onSupprimer,
}: {
  initial: RegleRoutage
  sauvegarde: boolean
  onEnregistrer: (payload: Record<string, unknown>) => void
  onSupprimer?: () => void
}) {
  const [categorie, setCategorie] = useState(initial.targetCategory)
  const [fallback, setFallback] = useState(initial.fallbackCategory ?? "")
  const [escaladeMin, setEscaladeMin] = useState(initial.escalationAfterMin)
  const [priorite, setPriorite] = useState(initial.priority)
  const [poids, setPoids] = useState(initial.rulePriority)
  const [deniseAnnonce, setDeniseAnnonce] = useState(initial.deniseAnnounce)
  const [deniseTon, setDeniseTon] = useState(initial.deniseTone)
  const [active, setActive] = useState(initial.active)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-stone-50 px-3 py-2 text-sm">
        <span className="font-medium">{ZONE_EMOJI(initial.zoneCode)} {ZONE_LABEL(initial.zoneCode)}</span>
        <span className="text-stone-400"> × </span>
        <span className="font-medium">{SIGNAL_EMOJI(initial.signalType)} {SIGNAL_LABEL(initial.signalType)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Catégorie cible</Label>
          <Select value={categorie} onValueChange={setCategorie}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROUTING_CATEGORIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.emoji} {c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fallback si personne dispo</Label>
          <Select value={fallback} onValueChange={setFallback}>
            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— aucun</SelectItem>
              {ROUTING_CATEGORIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.emoji} {c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Escalade après (min)</Label>
          <Input type="number" min={0} max={120} value={escaladeMin} onChange={(e) => setEscaladeMin(Number(e.target.value))} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Priorité incident</Label>
          <Select value={priorite} onValueChange={setPriorite}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Basse</SelectItem>
              <SelectItem value="medium">Normale</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
              <SelectItem value="critical">Critique</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Poids de la règle</Label>
          <Input type="number" min={1} max={10} value={poids} onChange={(e) => setPoids(Number(e.target.value))} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ton Nathalie</Label>
          <Select value={deniseTon} onValueChange={setDeniseTon}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="soft">Doux</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 pt-1">
        <div className="flex items-center gap-2">
          <Switch checked={deniseAnnonce} onCheckedChange={setDeniseAnnonce} id="denise-annonce" />
          <Label htmlFor="denise-annonce" className="text-sm">Annonce vocale Nathalie</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} id="regle-active" />
          <Label htmlFor="regle-active" className="text-sm">Règle active</Label>
        </div>
      </div>

      <DialogFooter className="gap-2 pt-2">
        {onSupprimer && (
          <Button variant="ghost" className="text-red-500 hover:text-red-700" onClick={onSupprimer} disabled={sauvegarde}>
            <Trash2 className="mr-1 h-4 w-4" /> Supprimer
          </Button>
        )}
        <Button
          className="bg-[#a05f45] text-white hover:bg-[#8a4f3b]"
          onClick={() =>
            onEnregistrer({
              zoneCode: initial.zoneCode,
              signalType: initial.signalType,
              targetCategory: categorie,
              fallbackCategory: fallback === "none" ? null : fallback,
              escalationAfterMin: escaladeMin,
              priority: priorite,
              rulePriority: poids,
              deniseAnnounce: deniseAnnonce,
              deniseTone: deniseTon,
              active,
            })
          }
          disabled={sauvegarde}
        >
          {sauvegarde && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </div>
  )
}

// ============================================================
// Formulaire employé (création / édition)
// ============================================================

function EmployeForm({
  initial,
  sauvegarde,
  onEnregistrer,
}: {
  initial: StaffRoutage | null
  sauvegarde: boolean
  onEnregistrer: (payload: Record<string, unknown>) => void
}) {
  const [nom, setNom] = useState(initial?.name ?? "")
  const [tel, setTel] = useState(initial?.phone ?? "")
  const [pin, setPin] = useState("")
  const [categorie, setCategorie] = useState(initial?.category ?? "serveur")
  const [zones, setZones] = useState<string[]>(initial?.zones ?? [])
  const [types, setTypes] = useState<string[]>(initial?.signalTypes ?? [])
  const [capacite, setCapacite] = useState(initial?.maxActiveTasks ?? 3)
  const [shiftDebut, setShiftDebut] = useState(initial?.shiftStart ?? "")
  const [shiftFin, setShiftFin] = useState(initial?.shiftEnd ?? "")
  const [jours, setJours] = useState<number[]>(initial?.shiftDays ?? [1, 2, 3, 4, 5])
  const [deniseOk, setDeniseOk] = useState(initial?.deniseEnabled ?? true)
  const [deniseTon, setDeniseTon] = useState(initial?.deniseTone ?? "normal")

  const toggle = (liste: string[], set: (v: string[]) => void, code: string) => {
    set(liste.includes(code) ? liste.filter((x) => x !== code) : [...liste, code])
  }
  const toggleJour = (j: number) => setJours(jours.includes(j) ? jours.filter((x) => x !== j) : [...jours, j])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Nom</Label>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Fatou Ndiaye" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Téléphone</Label>
          <Input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+221 77 123 45 67" className="h-9" disabled={!!initial} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{initial ? "Nouveau PIN (option)" : "PIN QR Maître"}</Label>
          <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" className="h-9" inputMode="numeric" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">🏷️ Catégorie</Label>
        <div className="flex flex-wrap gap-1.5">
          {ROUTING_CATEGORIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCategorie(c.code)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                categorie === c.code ? "border-[#bc7155] bg-[#faf1ec] font-semibold text-[#6f3f30]" : "border-stone-200 text-stone-600 hover:border-stone-300",
              )}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">📍 Zones assignées (multi-sélection)</Label>
        <div className="flex flex-wrap gap-1.5">
          {VIP_ROUTING_ZONES.map((z) => (
            <button
              key={z.code}
              type="button"
              onClick={() => toggle(zones, setZones, z.code)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                zones.includes(z.code) ? "border-[#bc7155] bg-[#faf1ec] font-semibold text-[#6f3f30]" : "border-stone-200 text-stone-600 hover:border-stone-300",
              )}
            >
              {zones.includes(z.code) ? "☑" : "☐"} {z.emoji} {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">🎯 Types de signalements maîtrisés</Label>
        <div className="flex flex-wrap gap-1.5">
          {ROUTING_SIGNAL_TYPES.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => toggle(types, setTypes, t.code)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                types.includes(t.code) ? "border-[#bc7155] bg-[#faf1ec] font-semibold text-[#6f3f30]" : "border-stone-200 text-stone-600 hover:border-stone-300",
              )}
            >
              {types.includes(t.code) ? "☑" : "☐"} {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">⚡ Capacité max simultanée</Label>
          <Input type="number" min={1} max={20} value={capacite} onChange={(e) => setCapacite(Number(e.target.value))} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Shift début</Label>
          <Input type="time" value={shiftDebut} onChange={(e) => setShiftDebut(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Shift fin</Label>
          <Input type="time" value={shiftFin} onChange={(e) => setShiftFin(e.target.value)} className="h-9" />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-stone-400">Laisser les heures vides = disponible 24/7 (mode démo).</p>

      <div className="space-y-1.5">
        <Label className="text-xs">🕐 Jours de service</Label>
        <div className="flex flex-wrap gap-1.5">
          {JOURS.map((label, j) => (
            <button
              key={j}
              type="button"
              onClick={() => toggleJour(j)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                jours.includes(j) ? "border-stone-700 bg-stone-800 font-semibold text-white" : "border-stone-200 text-stone-600 hover:border-stone-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-stone-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Switch checked={deniseOk} onCheckedChange={setDeniseOk} id="emp-denise" />
          <Label htmlFor="emp-denise" className="text-sm">🎙️ Être notifié vocalement par Nathalie</Label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500">Ton préféré :</span>
          <Select value={deniseTon} onValueChange={setDeniseTon}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="soft">Doux</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="pt-1">
        <Button
          className="bg-[#a05f45] text-white hover:bg-[#8a4f3b]"
          disabled={sauvegarde || !nom.trim() || (!initial && !tel.trim())}
          onClick={() =>
            onEnregistrer({
              ...(initial ? {} : { phone: tel, pin: pin || "1234", name: nom }),
              ...(initial && nom.trim() ? { name: nom } : {}),
              ...(initial && pin ? { pin } : {}),
              category: categorie,
              zones,
              signalTypes: types,
              maxActiveTasks: capacite,
              shiftStart: shiftDebut || null,
              shiftEnd: shiftFin || null,
              shiftDays: jours,
              deniseEnabled: deniseOk,
              deniseTone: deniseTon,
              isOnDuty: initial?.isOnDuty ?? true,
            })
          }
        >
          {sauvegarde && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {initial ? "Enregistrer" : "Créer et activer le routage"}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ============================================================
// Formulaire tâche proactive
// ============================================================

function TacheForm({
  initial,
  sauvegarde,
  onEnregistrer,
  staffDisponibles,
}: {
  initial: TacheProactive | null
  sauvegarde: boolean
  onEnregistrer: (payload: Record<string, unknown>) => void
  staffDisponibles: StaffRoutage[]
}) {
  const [titre, setTitre] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [zone, setZone] = useState(initial?.targetZone ?? "vip_buffet")
  const [categorie, setCategorie] = useState(initial?.targetCategory ?? "barman")
  const [staffId, setStaffId] = useState(initial?.targetStaffId ?? "auto")
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? "interval")
  const [intervalle, setIntervalle] = useState(initial?.intervalMinutes ?? 30)
  const [horaires, setHoraires] = useState((initial?.scheduledTimes ?? []).join(", "))
  const [checklist, setChecklist] = useState((initial?.checklistItems ?? []).map((c) => c.item).join("\n"))
  const [deniseMessage, setDeniseMessage] = useState(initial?.deniseMessage ?? "")

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Titre</Label>
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Vérification buffet" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Zone cible</Label>
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VIP_ROUTING_ZONES.map((z) => (
                <SelectItem key={z.code} value={z.code}>{z.emoji} {z.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contrôle visuel : réassort, propreté…" className="h-9" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Catégorie cible</Label>
          <Select value={categorie} onValueChange={setCategorie}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROUTING_CATEGORIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.emoji} {c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Employé spécifique</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatique (scoring)</SelectItem>
              {staffDisponibles.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Récurrence</Label>
          <Select value={recurrence} onValueChange={setRecurrence}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="interval">Intervalle fixe</SelectItem>
              <SelectItem value="daily">Chaque jour</SelectItem>
              <SelectItem value="weekly">Chaque semaine</SelectItem>
              <SelectItem value="once">Une seule fois</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Intervalle (minutes)</Label>
          <Input type="number" min={5} max={720} value={intervalle} onChange={(e) => setIntervalle(Number(e.target.value))} className="h-9" disabled={recurrence !== "interval"} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Horaires fixes (séparés par des virgules)</Label>
          <Input value={horaires} onChange={(e) => setHoraires(e.target.value)} placeholder="08:00, 12:00, 18:00" className="h-9" disabled={recurrence === "interval" || recurrence === "once"} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Checklist (une ligne par item)</Label>
        <textarea
          value={checklist}
          onChange={(e) => setChecklist(e.target.value)}
          rows={3}
          placeholder={"Plats réassortis\nSurfaces propres"}
          className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#bc7155]"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Message Nathalie</Label>
        <Input value={deniseMessage} onChange={(e) => setDeniseMessage(e.target.value)} placeholder="Vérification buffet requise" className="h-9" />
      </div>
      <DialogFooter className="pt-1">
        <Button
          className="bg-[#a05f45] text-white hover:bg-[#8a4f3b]"
          disabled={sauvegarde || !titre.trim()}
          onClick={() =>
            onEnregistrer({
              ...(initial ? { id: initial.id } : {}),
              title: titre,
              description: description || null,
              targetZone: zone,
              targetCategory: categorie,
              targetStaffId: staffId === "auto" ? null : staffId,
              recurrence,
              intervalMinutes: intervalle,
              scheduledTimes: horaires.split(",").map((h) => h.trim()).filter(Boolean),
              checklistItems: checklist.split("\n").map((x) => x.trim()).filter(Boolean).map((item) => ({ item, required: true })),
              notifyVia: deniseMessage ? ["denise"] : [],
              deniseMessage: deniseMessage || null,
              active: initial?.active ?? true,
            })
          }
        >
          {sauvegarde && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {initial ? "Enregistrer" : "Créer la tâche"}
        </Button>
      </DialogFooter>
    </div>
  )
}
