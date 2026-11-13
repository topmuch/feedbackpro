'use client'

// ============================================================
// <AirportModeEmploiTab /> — Guide d'utilisation du système aéroport
// ------------------------------------------------------------
// Visible uniquement dans la section Aéroport du dashboard Pro
// (ne s'affiche pas sur la version classique restaurant).
//
// Couvre : QR codes voyageur, PWA staff, wallboard ops, Denise,
// gestion des zones, QR staff, notifications push, résolution d'incidents.
// ============================================================

import { useState } from 'react'
import {
  Plane,
  QrCode,
  Smartphone,
  Monitor,
  Mic,
  Bell,
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  BookOpen,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

type GuideSection = {
  id: string
  title: string
  icon: typeof Plane
  color: string
  steps: { title: string; description: string; duration?: string }[]
}

const SECTIONS: GuideSection[] = [
  {
    id: 'voyageur',
    title: 'Côté Voyageur',
    icon: Plane,
    color: 'text-indigo-600',
    steps: [
      {
        title: 'Le voyageur scanne le QR code',
        description:
          'Des QR codes sont affichés dans chaque zone de l\'aéroport (tapis bagages, sanitaires, portes d\'embarquement, files d\'attente, restauration). Le voyageur scanne avec son téléphone — pas d\'app à télécharger.',
        duration: '2 sec',
      },
      {
        title: 'Il sélectionne le problème',
        description:
          'L\'interface PWA s\'ouvre directement sur la zone scannée. 4 à 6 boutons prédéfinis proposent les problématiques les plus courantes (ex: "Tapis arrêté", "Bagage perdu", "Manque de papier"). Un clic suffit.',
        duration: '5 sec',
      },
      {
        title: 'Optionnel : photo + commentaire + voix',
        description:
          'Le voyageur peut ajouter une photo (analyse VLM automatique), un commentaire texte, ou parler en Wolof/Français/Anglais (transcription auto + traduction). Le numéro de vol peut aussi être saisi.',
        duration: '30 sec',
      },
      {
        title: 'Le signalement est envoyé',
        description:
          'Le signalement arrive en temps réel sur le wallboard ops + déclenche les alertes (Denise + push + vibration) vers les équipes concernées. Le voyageur reçoit un écran de confirmation.',
        duration: 'Instantané',
      },
    ],
  },
  {
    id: 'staff',
    title: 'Côté Staff (PWA Employé)',
    icon: Smartphone,
    color: 'text-emerald-600',
    steps: [
      {
        title: 'Connexion staff',
        description:
          'L\'employé ouvre la PWA staff (via QR code ou URL). Il sélectionne son nom dans la liste des employés (depuis l\'onglet Équipe) + entre son PIN 4 chiffres. Session persistante 7 jours.',
        duration: '10 sec',
      },
      {
        title: 'Réception automatique des incidents',
        description:
          'Quand un nouveau signalement arrive, la PWA staff affiche AUTOMATIQUEMENT l\'incident à l\'écran + vibration + son ding dong + voix Denise qui annonce la zone et le type. Pas besoin de scanner manuellement.',
        duration: 'Auto',
      },
      {
        title: 'Prise en charge',
        description:
          'Le staff clique "PRENDRE EN CHARGE". L\'incident passe en statut EN_COURS, assigné à l\'employé. Denise confirme : "Incident pris en charge par [nom]".',
        duration: '1 clic',
      },
      {
        title: 'Résolution',
        description:
          'Sur place, le staff règle le problème. Il clique "MARQUER RÉSOLU" → confirmation avec temps écoulé + commentaire optionnel + photo. Denise : "Incident résolu en X minutes".',
        duration: '30 sec',
      },
      {
        title: 'Notifications push (app fermée)',
        description:
          'Même si la PWA est fermée ou le téléphone verrouillé, les push notifications arrivent. Activer les notifications via le bouton "Activer les notifications" sur l\'écran d\'accueil.',
        duration: 'Setup 1x',
      },
    ],
  },
  {
    id: 'wallboard',
    title: 'Côté Wallboard Ops',
    icon: Monitor,
    color: 'text-amber-600',
    steps: [
      {
        title: 'Affichage TV salle ops',
        description:
          'Le wallboard s\'affiche sur la TV de la salle de supervision. URL: /ops-wallboard. Il montre les signalements en temps réel, les stats 24h, les SLA par zone, et le radar prédiction.',
        duration: 'Permanent',
      },
      {
        title: 'Alerte sonore + voix Denise',
        description:
          'À chaque nouvel incident, le wallboard émet un son ding dong + Denise annonce vocalement l\'incident. Le son s\'active via le bouton "Activer le son" en haut à droite.',
        duration: 'Auto',
      },
      {
        title: 'Rappel 15 min (escalade)',
        description:
          'Si un incident n\'est pas résolu dans les 15 minutes, un badge "EN RETARD" rouge apparaît + son d\'escalade. À 20, 25, 30 min : répétition du son.',
        duration: 'Auto',
      },
      {
        title: 'Radar Prédiction',
        description:
          'Le radar analyse les patterns temporels et prédit les pics d\'incidents dans les 20 prochaines minutes. Si risque critique : alerte préventive "Ça va péter dans 20 min".',
        duration: 'Polling 30s',
      },
    ],
  },
  {
    id: 'denise',
    title: 'Denise — Assistante Vocale',
    icon: Mic,
    color: 'text-violet-600',
    steps: [
      {
        title: 'Matrice de décision vocale',
        description:
          'Denise ne parle pas au hasard. Chaque événement traverse un pipeline : règle → contexte horaire → agrégation → déduplication → décision. Elle parle seulement quand c\'est pertinent.',
        duration: 'Server-side',
      },
      {
        title: 'Priorités vocales',
        description:
          'CRITIQUE (sécurité/sanitaire) : ton urgent +20% volume. IMPORTANT (service lent) : ton ferme. INFO (nouveau scan) : ton doux -10%. SILENCE (résolu, positif) : notification visuelle seule.',
        duration: 'Auto',
      },
      {
        title: 'Modes horaires',
        description:
          'Nuit (22h-06h) : uniquement sécurité. Service midi/soir : critiques + importants uniquement. Creux : tous niveaux. Denise s\'adapte au rythme de l\'aéroport.',
        duration: 'Auto',
      },
      {
        title: 'Configuration SuperAdmin',
        description:
          'L\'onglet "Voix Denise" dans le SuperAdmin permet d\'ajuster les règles, templates, plages horaires, et seuils d\'agrégation sans redeployer le code.',
        duration: 'Config',
      },
    ],
  },
  {
    id: 'zones',
    title: 'Gestion des Zones & QR Codes',
    icon: MapPin,
    color: 'text-sky-600',
    steps: [
      {
        title: 'Onglet Zones',
        description:
          'Le manager gère les zones aéroport (bagages, sanitaires, files d\'attente, embarquement, restauration + zones custom). Chaque zone a son emoji, ses tags URL, et ses problématiques prédéfinies.',
        duration: 'Dashboard',
      },
      {
        title: 'Ajouter/Modifier/Supprimer une zone',
        description:
          'Bouton "Ajouter une zone" pour créer de nouvelles zones (parking, douane, etc.). Modifier/supprimer via les icônes sur chaque zone existante.',
        duration: '2 min',
      },
      {
        title: 'QR codes voyageur',
        description:
          'Chaque tag URL (ex: tapis_bagages_1) a son QR code imprimable (PNG + PDF A4). Affichés sur les lieux physiques pour que les voyageurs scannent.',
        duration: 'Onglet QR Codes',
      },
      {
        title: 'QR codes staff',
        description:
          'L\'onglet "QR Staff" génère des QR codes pour les employés (Nettoyage T1, Maintenance, Sécurité T2...). Sauvegardés en base, téléchargeables PNG/PDF.',
        duration: 'Onglet QR Staff',
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications & Alertes',
    icon: Bell,
    color: 'text-rose-600',
    steps: [
      {
        title: 'Push PWA (always-on)',
        description:
          'Les notifications push fonctionnent même si l\'app est fermée. Service Worker + Push API + VAPID. Le staff doit cliquer "Activer les notifications" une fois.',
        duration: 'Setup 1x',
      },
      {
        title: 'Multi-canal',
        description:
          'Le SuperAdmin configure les canaux : Push PWA, SMS (Mtarget SN), WhatsApp, Email. Chaque template définit quels canaux utiliser selon le type d\'incident.',
        duration: 'SuperAdmin',
      },
      {
        title: 'Escalade automatique',
        description:
          'Si un incident n\'est pas traité après 15 min → SMS au supervisor. Après 30 min → WhatsApp + Email critique au manager.',
        duration: 'Auto',
      },
      {
        title: 'Centre Opérationnel',
        description:
          'Le SuperAdmin a un onglet "Centre Opérationnel" qui monitor la santé de tous les services (DB, Mtarget, WhatsApp, Push, Denise) en temps réel + alert feed + emails critiques.',
        duration: 'SuperAdmin',
      },
    ],
  },
  {
    id: 'resolution',
    title: 'Résolution d\'Incidents',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    steps: [
      {
        title: 'Workflow complet',
        description:
          'NEW (signalé par voyageur) → ASSIGNED (pris en charge par staff) → RESOLVED (clôturé). Chaque transition est tracée dans la Black Box (audit trail immuable).',
        duration: 'Workflow',
      },
      {
        title: 'Photos avant/après',
        description:
          'Le staff prend une photo à la prise en charge (AVANT) et à la résolution (APRÈS). Les deux photos sont affichées côte à côte dans les signalements.',
        duration: 'Optionnel',
      },
      {
        title: 'Gamification',
        description:
          'Score agent : +20 pts si résolution <5min, +10 pts si <10min, +5 pts si <20min. Classement mensuel dans l\'onglet Leaderboard.',
        duration: 'Auto',
      },
      {
        title: 'SLA temps de résolution',
        description:
          'Objectif de résolution par zone (ex: sanitaires 15min, bagages 20min). Le wallboard affiche le SLA respecté vs dépassé + rappel automatique à 15min.',
        duration: 'Config',
      },
    ],
  },
]

const QUICK_START = [
  { role: 'Voyageur', icon: Plane, steps: 'Scanne QR → Sélectionne problème → Envoi', time: '< 10 sec' },
  { role: 'Staff', icon: Smartphone, steps: 'Connexion → Auto-réception incident → Prendre en charge → Résoudre', time: '< 5 min' },
  { role: 'Manager', icon: Monitor, steps: 'Wallboard → Suivi temps réel → SLA + Leaderboard', time: 'Permanent' },
  { role: 'SuperAdmin', icon: ShieldCheck, steps: 'Config Denise + Notifications + Centre Ops', time: 'Setup' },
]

export function AirportModeEmploiTab() {
  const [activeSection, setActiveSection] = useState<string>('voyageur')

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5257C9] to-[#7C3AED] text-white shadow-lg">
            <BookOpen className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mode d&apos;Emploi — Système Aéroport</h1>
            <p className="text-sm text-muted-foreground">
              Guide complet pour voyageurs, staff, managers et SuperAdmin
            </p>
          </div>
        </div>

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="size-5 text-amber-500" />
              Démarrage Rapide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_START.map((qs) => {
                const Icon = qs.icon
                return (
                  <div
                    key={qs.role}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-5 text-primary" />
                      <span className="font-semibold text-foreground">{qs.role}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{qs.steps}</p>
                    <Badge variant="secondary" className="mt-2 text-[10px]">
                      <Clock className="mr-1 size-3" />
                      {qs.time}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Navigation par section */}
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = activeSection === s.id
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border',
                )}
              >
                <Icon className={cn('size-4', active ? 'text-primary-foreground' : s.color)} />
                {s.title}
              </button>
            )
          })}
        </div>

        {/* Sections détaillées (accordion) */}
        <Accordion type="single" collapsible defaultValue="voyageur" className="space-y-3">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <AccordionItem
                key={section.id}
                value={section.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <AccordionTrigger className="px-5 py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex size-9 items-center justify-center rounded-lg bg-muted', section.color)}>
                      <Icon className="size-5" />
                    </div>
                    <span className="font-semibold text-foreground">{section.title}</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {section.steps.length} étapes
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-4">
                  <div className="space-y-3">
                    {section.steps.map((step, i) => (
                      <div
                        key={i}
                        className="flex gap-3 rounded-lg border border-border/50 bg-muted/30 p-3"
                      >
                        {/* Numéro étape */}
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {i + 1}
                        </div>
                        {/* Contenu */}
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-foreground">{step.title}</h4>
                            {step.duration && (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                <Clock className="mr-1 size-3" />
                                {step.duration}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {/* Footer info */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-foreground">Besoin d&apos;aide supplémentaire ?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contactez le support à support@feedbackpro.sn ou consultez le Centre Opérationnel
                dans le dashboard SuperAdmin pour le monitoring temps réel du système.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
