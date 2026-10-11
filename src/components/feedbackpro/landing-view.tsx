"use client"

// ============================================================
// FeedbackPro — Landing « Le Coach IA d'Audit Qualité Continu »
// Pivot Session 1 : on ne vend pas un outil d'avis Google, on
// transforme chaque client réel en auditeur qualité et on livre
// chaque matin un rapport d'audit IA.
// Aucun fetch, aucune route : toutes les actions passent par les
// callbacks onLogin / onSignup fournis par le parent (page.tsx).
// Note : la page est rendue à l'intérieur du <main> de page.tsx,
// on n'imbrique donc pas de second <main> ici (header/section/footer).
// ============================================================

import { useState, type ReactNode } from "react"
import { PLANS, PROBLEMES, planPriceLabel, type PlanId } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { motion } from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  MapPin,
  Menu,
  MessageCircleMore,
  MessageCircleWarning,
  Package,
  ScanLine,
  ShieldCheck,
  Star,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react"

// ============================================================
// Données statiques de la page (textes 100 % français)
// ============================================================

const NAV_LIENS = [
  { id: "probleme", label: "Le problème" },
  { id: "solution", label: "La solution" },
  { id: "fonctionnalites", label: "Fonctionnalités" },
  { id: "tarifs", label: "Tarifs" },
  { id: "faq", label: "FAQ" },
] as const

// Les 4 étapes de la section Solution (textes exacts du pivot)
const ETAPES_SOLUTION: { numero: number; icone: LucideIcon; texte: string }[] = [
  { numero: 1, icone: ScanLine, texte: "Le client scanne le QR code de la zone" },
  { numero: 2, icone: Star, texte: "Il note son expérience sur 5 étoiles" },
  { numero: 3, icone: MessageCircleMore, texte: "Il sélectionne des tags en un clic (sourires 😊 / signalements ⚠️)" },
  { numero: 4, icone: Bot, texte: "Votre Coach IA livre chaque matin vos 3 priorités" },
]

// Les 6 fonctionnalités mises en avant
const FONCTIONNALITES: { icone: LucideIcon; titre: string; texte: string }[] = [
  {
    icone: Bot,
    titre: "Coach IA quotidien",
    texte: "Chaque matin, votre Coach IA analyse les retours de la veille et vous livre un rapport d'audit avec des recommandations précises.",
  },
  {
    icone: MapPin,
    titre: "Zones & QR dédiés",
    texte: "Une zone par point de contact (accueil, salle, terrasse…) et son QR code prêt à imprimer, livré chez vous.",
  },
  {
    icone: MessageCircleWarning,
    titre: "Alertes WhatsApp en temps réel",
    texte: "Un client signale un problème ? Vous êtes alerté immédiatement sur WhatsApp pour corriger avant qu'il ne parte.",
  },
  {
    icone: Trophy,
    titre: "Leaderboard & formation équipe",
    texte: "Classez vos employés, valorisez les meilleurs et repérez objectivement les besoins de formation.",
  },
  {
    icone: BarChart3,
    titre: "Statistiques & heatmap",
    texte: "Suivez vos scores par zone, par jour et par heure pour piloter votre service avec des données, pas des impressions.",
  },
  {
    icone: Package,
    titre: "Supports imprimés livrés",
    texte: "Autocollants, chevalets et affiches de qualité, commandés en un clic et livrés prêts à poser sur le terrain.",
  },
]

// Témoignages d'exemple (honnêteté : mention explicite sous chaque carte)
const TEMOIGNAGES = [
  {
    initiales: "AK",
    nom: "Amine K.",
    contexte: "Restaurant · Lyon",
    texte:
      "Le rapport du matin a remplacé nos réunions à vide. On sait exactement quoi corriger avant l'ouverture, zone par zone.",
  },
  {
    initiales: "SL",
    nom: "Sophie L.",
    contexte: "Salon de coiffure · Paris",
    texte:
      "Mes clientes scannent en partant. En trois semaines, j'ai formé toute mon équipe grâce aux priorités du Coach IA.",
  },
  {
    initiales: "MD",
    nom: "Marc D.",
    contexte: "Boutique · Bordeaux",
    texte:
      "Les alertes WhatsApp m'évitent les mauvaises surprises. Mes clients se sentent enfin réellement écoutés.",
  },
]

// FAQ (accordéon shadcn, 4 questions)
const FAQ = [
  {
    question: "Comment fonctionne le Coach IA ?",
    reponse:
      "Chaque retour collecté via vos QR codes est analysé par votre Coach IA. Chaque matin, il vous livre un rapport d'audit : votre score qualité, l'évolution de chaque zone et vos 3 priorités du jour, avec des recommandations concrètes adaptées à votre établissement.",
  },
  {
    question: "Mes clients doivent-ils installer une application ?",
    reponse:
      "Non. Vos clients scannent simplement le QR code de la zone avec l'appareil photo de leur téléphone, puis laissent leur retour en moins de 30 secondes. Aucune application à télécharger, aucun compte à créer.",
  },
  {
    question: "Les retours négatifs sont-ils publics ?",
    reponse:
      "Non, jamais. Les retours de 1 à 3 étoiles restent 100 % confidentiels : ils alimentent uniquement votre rapport d'audit et déclenchent une alerte WhatsApp en temps réel pour que vous puissiez réagir immédiatement.",
  },
  {
    question: "Puis-je résilier à tout moment ?",
    reponse:
      "Oui. Tous les plans sont sans engagement : vous pouvez résilier en quelques clics depuis votre tableau de bord, sans justification ni frais cachés.",
  },
]

// Contenu du rapport IA affiché dans la maquette téléphone
const PRIORITES_MOCKUP = [
  { titre: "Former l'équipe sur les produits", detail: "7 signalements « mal renseigné » cette semaine" },
  { titre: "Réduire l'attente en salle", detail: "6 mentions entre 12 h et 14 h sur la zone Salle" },
  { titre: "Vérifier la propreté de la terrasse", detail: "3 retours négatifs sur la zone Terrasse" },
]

// ============================================================
// Helpers UI
// ============================================================

/** Défilement fluide vers une ancre (en tenant compte du header sticky) */
function allerVers(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** Enveloppe d'animation : fade-up discret à l'apparition au scroll */
function Fondu({ children, className, delai = 0 }: { children: ReactNode; className?: string; delai?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: "easeOut", delay: delai }}
    >
      {children}
    </motion.div>
  )
}

/** Logo FeedbackPro (carré primary + wordmark) */
function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ScanLine className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">FeedbackPro</span>
    </span>
  )
}

// ============================================================
// Maquette téléphone (CSS pur) : le rapport IA du Coach
// ============================================================

function MaquetteTelephone() {
  return (
    <div className="relative mx-auto w-[290px] max-w-full sm:w-[315px]" aria-hidden="true">
      {/* Halo décoratif derrière le téléphone */}
      <div className="absolute inset-4 -z-10 scale-110 rounded-[3rem] bg-primary/15 blur-3xl" />

      {/* Cadre du téléphone */}
      <div className="rounded-[2.75rem] border border-slate-200 bg-slate-900 p-2.5 shadow-2xl shadow-primary/20">
        <div className="overflow-hidden rounded-[2.1rem] bg-white">
          {/* Barre d'état */}
          <div className="relative flex items-center justify-between bg-slate-50 px-5 pb-1 pt-2.5">
            <span className="text-[10px] font-semibold text-slate-700">8:00</span>
            <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-slate-900" />
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-sm bg-slate-400" />
              <span className="h-1.5 w-3 rounded-sm bg-slate-400" />
              <span className="h-2.5 w-5 rounded-[3px] border border-slate-400 bg-slate-300" />
            </div>
          </div>

          {/* En-tête du rapport (Coach IA) */}
          <div className="bg-primary px-4 pb-3 pt-2 text-primary-foreground">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-semibold">Rapport d'audit du jour</p>
            </div>
            <p className="mt-0.5 text-[10px] opacity-85">Généré par votre Coach IA · ce matin à 8 h 00</p>
          </div>

          {/* Score qualité global */}
          <div className="flex flex-col items-center border-b border-slate-100 bg-white py-4">
            <p className="text-4xl font-extrabold tracking-tight text-primary">
              82<span className="text-base font-semibold text-slate-400">/100</span>
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">Score qualité global</p>
            <div className="mt-2.5 h-1.5 w-3/4 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-[82%] rounded-full bg-primary" />
            </div>
          </div>

          {/* Les 3 priorités du jour */}
          <div className="space-y-2 px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vos 3 priorités</p>
            {PRIORITES_MOCKUP.map((p, i) => (
              <div key={p.titre} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug text-slate-800">{p.titre}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pied de la maquette */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <span className="text-[10px] font-bold text-primary">FeedbackPro</span>
            <span className="text-[9px] text-slate-400">Coach IA · Audit qualité continu</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// En-tête sticky (nav ancres + CTA + burger mobile)
// ============================================================

function Entete({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [menuOuvert, setMenuOuvert] = useState(false)

  function naviguer(id: string) {
    setMenuOuvert(false)
    allerVers(id)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={() => {
            setMenuOuvert(false)
            window.scrollTo({ top: 0, behavior: "smooth" })
          }}
          aria-label="FeedbackPro — retour en haut de page"
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Logo />
        </button>

        {/* Navigation desktop */}
        <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
          {NAV_LIENS.map((lien) => (
            <a
              key={lien.id}
              href={`#${lien.id}`}
              onClick={(e) => {
                e.preventDefault()
                naviguer(lien.id)
              }}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {lien.label}
            </a>
          ))}
        </nav>

        {/* CTA desktop */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button variant="ghost" onClick={onLogin} className="h-10 px-4">
            Connexion
          </Button>
          <Button onClick={onSignup} className="h-10 px-4">
            Essayer gratuitement
          </Button>
        </div>

        {/* Burger mobile */}
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent lg:hidden"
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOuvert}
          aria-controls="menu-mobile"
          onClick={() => setMenuOuvert((o) => !o)}
        >
          {menuOuvert ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {/* Panneau mobile */}
      {menuOuvert && (
        <div id="menu-mobile" className="border-t border-border/70 bg-white/95 backdrop-blur-md lg:hidden">
          <nav aria-label="Navigation mobile" className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {NAV_LIENS.map((lien) => (
              <a
                key={lien.id}
                href={`#${lien.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  naviguer(lien.id)
                }}
                className="rounded-md px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {lien.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/70 pt-3">
              <Button variant="outline" className="h-11 w-full" onClick={() => { setMenuOuvert(false); onLogin() }}>
                Connexion
              </Button>
              <Button className="h-11 w-full" onClick={() => { setMenuOuvert(false); onSignup() }}>
                Essayer gratuitement
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

// ============================================================
// Vue Landing complète
// ============================================================

export function LandingView({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <>
      <Entete onLogin={onLogin} onSignup={onSignup} />

      {/* ======================================================== */}
      {/* HERO                                                      */}
      {/* ======================================================== */}
      <section aria-label="Présentation" className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-2 lg:gap-8 lg:pb-24">
          {/* Colonne texte */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary sm:text-sm">
              🤖 Le Coach IA d'Audit Qualité Continu
            </p>

            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              Transformez vos clients en <span className="text-primary">auditeurs qualité</span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
              Notre IA analyse chaque retour et vous livre chaque matin un rapport d'audit avec des recommandations
              précises pour améliorer votre service.
            </p>

            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button onClick={onSignup} size="lg" className="h-12 w-full px-7 text-base sm:w-auto">
                Essayer gratuitement
              </Button>
              <Button variant="outline" size="lg" asChild className="h-12 w-full px-7 text-base sm:w-auto">
                <a
                  href="#solution"
                  onClick={(e) => {
                    e.preventDefault()
                    allerVers("solution")
                  }}
                >
                  Découvrir comment ça marche
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </Button>
            </div>

            {/* Preuve sociale rapide */}
            <div className="mt-7 flex flex-col items-center gap-2 lg:items-start" aria-label="Preuve sociale">
              <div className="flex gap-0.5" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Déjà adopté par des restaurants, salons et boutiques en France
              </p>
            </div>
          </motion.div>

          {/* Colonne maquette téléphone (lg+) */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
            className="hidden lg:block"
          >
            <MaquetteTelephone />
          </motion.div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* PROBLÈME — les 7 vrais problèmes                          */}
      {/* ======================================================== */}
      <section id="probleme" aria-labelledby="titre-probleme" className="scroll-mt-20 bg-[#F3F4F6] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Fondu className="mx-auto max-w-3xl text-center">
            <h2 id="titre-probleme" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Les 7 vrais problèmes que vos clients détectent... et que vous ne voyez jamais
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Vos clients vivent ces problèmes chaque jour, mais ils ne le disent presque jamais au moment où vous
              pouvez encore agir. Chaque scan QR transforme leur silence en signal exploitable.
            </p>
          </Fondu>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEMES.map((probleme, i) => (
              <li key={probleme.id}>
                <Fondu delai={Math.min(i * 0.05, 0.25)} className="h-full">
                  <div className="flex h-full items-center gap-4 rounded-xl border border-border/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl" aria-hidden="true">
                      {probleme.emoji}
                    </span>
                    <span className="text-sm font-medium leading-snug">{probleme.label}</span>
                  </div>
                </Fondu>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ======================================================== */}
      {/* SOLUTION — chaque client devient un Client Mystère        */}
      {/* ======================================================== */}
      <section id="solution" aria-labelledby="titre-solution" className="scroll-mt-20 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Fondu className="mx-auto max-w-3xl text-center">
            <h2 id="titre-solution" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Chaque client réel devient un <span className="text-primary">Client Mystère</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Pas de NDA, pas d'agence, pas d'attente : vos clients existants audite votre service à chaque visite,
              en moins de 30 secondes.
            </p>
          </Fondu>

          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {ETAPES_SOLUTION.map((etape, i) => {
              const Icone = etape.icone
              return (
                <li key={etape.numero} className="relative">
                  <Fondu delai={i * 0.08} className="h-full">
                    <div className="flex h-full flex-col rounded-2xl border border-border/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                      {/* Flèche de liaison (desktop) */}
                      {i < ETAPES_SOLUTION.length - 1 && (
                        <ArrowRight className="absolute -right-6 top-8 z-10 hidden h-5 w-5 text-primary/40 lg:block" aria-hidden="true" />
                      )}
                      <div className="flex items-center justify-between">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                          {etape.numero}
                        </span>
                        <Icone className="h-6 w-6 text-primary/60" aria-hidden="true" />
                      </div>
                      <p className="mt-4 text-sm font-medium leading-relaxed text-foreground">{etape.texte}</p>
                    </div>
                  </Fondu>
                </li>
              )
            })}
          </ol>

          {/* Bandeau confidentialité */}
          <Fondu delai={0.1}>
            <div className="mx-auto mt-10 flex max-w-3xl items-center justify-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-center">
              <ShieldCheck className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm leading-relaxed sm:text-base">
                <span className="font-semibold text-primary">100 % confidentiel :</span> les retours 1-3★ restent
                privés et vous êtes alerté en temps réel sur WhatsApp
              </p>
            </div>
          </Fondu>
        </div>
      </section>

      {/* ======================================================== */}
      {/* FONCTIONNALITÉS                                           */}
      {/* ======================================================== */}
      <section id="fonctionnalites" aria-labelledby="titre-fonctionnalites" className="scroll-mt-20 bg-[#F3F4F6] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Fondu className="mx-auto max-w-3xl text-center">
            <h2 id="titre-fonctionnalites" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Tout l'outillage de votre audit qualité
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Du QR code au rapport du matin, FeedbackPro couvre la chaîne complète : collecte, analyse, alerte et
              action terrain.
            </p>
          </Fondu>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {FONCTIONNALITES.map((f, i) => {
              const Icone = f.icone
              return (
                <Fondu key={f.titre} delai={Math.min(i * 0.06, 0.3)} className="h-full">
                  <div className="h-full rounded-2xl border border-border/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icone className="h-5.5 w-5.5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold">{f.titre}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.texte}</p>
                  </div>
                </Fondu>
              )
            })}
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* TARIFS — depuis PLANS (Starter 29 € · Pro 99 € · Ent. 249 €) */}
      {/* ======================================================== */}
      <section id="tarifs" aria-labelledby="titre-tarifs" className="scroll-mt-20 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Fondu className="mx-auto max-w-3xl text-center">
            <h2 id="titre-tarifs" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Des tarifs simples, sans surprise
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Choisissez le plan adapté à votre établissement. Changez ou arrêtez quand vous voulez.
            </p>
          </Fondu>

          <div className="mx-auto mt-12 grid max-w-5xl items-stretch gap-6 lg:grid-cols-3 lg:gap-6">
            {(Object.keys(PLANS) as PlanId[]).map((idPlan) => {
              const plan = PLANS[idPlan]
              const populaire = idPlan === "PRO"
              return (
                <Fondu key={plan.id} className="h-full">
                  <div
                    className={
                      populaire
                        ? "relative flex h-full flex-col rounded-2xl border-2 border-primary bg-white p-6 shadow-xl shadow-primary/10 sm:p-8 lg:-translate-y-3"
                        : "relative flex h-full flex-col rounded-2xl border border-border/70 bg-white p-6 shadow-sm sm:p-8"
                    }
                  >
                    {populaire && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground shadow">
                        Le plus populaire
                      </span>
                    )}

                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>

                    <p className="mt-4 flex items-baseline gap-1.5">
                      <span className="text-4xl font-extrabold tracking-tight">{planPriceLabel(plan.price)}</span>
                      {plan.price > 0 && <span className="text-sm font-medium text-muted-foreground">/mois</span>}
                    </p>

                    <ul className="mt-6 flex-1 space-y-2.5">
                      {plan.features.map((feature) =>
                        feature.startsWith("Tout ") ? (
                          <li key={feature} className="border-b border-border/60 pb-2.5 text-sm font-semibold text-foreground">
                            {feature}
                          </li>
                        ) : (
                          <li key={feature} className="flex items-start gap-2.5 text-sm leading-snug">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            {feature}
                          </li>
                        ),
                      )}
                    </ul>

                    <Button
                      onClick={onSignup}
                      variant={populaire ? "default" : "outline"}
                      className="mt-7 h-11 w-full text-sm"
                      aria-label={`Commencer avec le plan ${plan.name}`}
                    >
                      Commencer avec {plan.name}
                    </Button>
                  </div>
                </Fondu>
              )
            })}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">Sans engagement. Résiliable à tout moment.</p>
        </div>
      </section>

      {/* ======================================================== */}
      {/* TÉMOIGNAGES (d'exemple — mention d'honnêteté)             */}
      {/* ======================================================== */}
      <section aria-labelledby="titre-temoignages" className="bg-[#F3F4F6] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Fondu className="mx-auto max-w-3xl text-center">
            <h2 id="titre-temoignages" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ils pilotent leur qualité chaque matin
            </h2>
          </Fondu>

          <div className="mt-10 grid gap-5 md:grid-cols-3 lg:gap-6">
            {TEMOIGNAGES.map((t, i) => (
              <Fondu key={t.nom} delai={i * 0.08} className="h-full">
                <figure className="flex h-full flex-col rounded-2xl border border-border/70 bg-white p-6 shadow-sm">
                  <div className="flex gap-0.5" aria-label="Note : 5 étoiles sur 5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground">« {t.texte} »</blockquote>
                  <figcaption className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                      aria-hidden="true"
                    >
                      {t.initiales}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{t.nom}</span>
                      <span className="block text-xs text-muted-foreground">{t.contexte}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] italic text-muted-foreground/80">
                      Témoignage d'exemple
                    </span>
                  </figcaption>
                </figure>
              </Fondu>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* FAQ                                                       */}
      {/* ======================================================== */}
      <section id="faq" aria-labelledby="titre-faq" className="scroll-mt-20 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Fondu className="text-center">
            <h2 id="titre-faq" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Questions fréquentes
            </h2>
          </Fondu>

          <Fondu delai={0.1}>
            <Accordion type="single" collapsible className="mt-8 rounded-2xl border border-border/70 bg-white px-4 shadow-sm sm:px-6">
              {FAQ.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="py-5 text-left text-sm font-semibold sm:text-base">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                    {item.reponse}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Fondu>
        </div>
      </section>

      {/* ======================================================== */}
      {/* CTA FINAL                                                 */}
      {/* ======================================================== */}
      <section aria-labelledby="titre-cta-final" className="bg-primary py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center text-primary-foreground sm:px-6">
          <Fondu>
            <h2 id="titre-cta-final" className="text-2xl font-bold tracking-tight sm:text-4xl">
              Prêt à transformer vos clients en auditeurs qualité ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
              Configuration en quelques minutes, sans engagement.
            </p>
            <Button
              onClick={onSignup}
              size="lg"
              className="mt-8 h-12 bg-white px-8 text-base font-semibold text-primary hover:bg-blue-50"
            >
              Démarrer gratuitement
            </Button>
          </Fondu>
        </div>
      </section>

      {/* ======================================================== */}
      {/* FOOTER                                                    */}
      {/* ======================================================== */}
      <footer className="border-t border-border/70 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Marque */}
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Le Coach IA d'Audit Qualité Continu : vos clients auditeurs, votre service mesuré chaque matin.
              </p>
            </div>

            {/* Produit */}
            <nav aria-label="Produit (pied de page)">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Produit</h3>
              <ul className="mt-3 space-y-2">
                {NAV_LIENS.map((lien) => (
                  <li key={lien.id}>
                    <a
                      href={`#${lien.id}`}
                      onClick={(e) => {
                        e.preventDefault()
                        allerVers(lien.id)
                      }}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {lien.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Légal (vraies routes) */}
            <nav aria-label="Légal (pied de page)">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Légal</h3>
              <ul className="mt-3 space-y-2">
                <li><a href="/mentions-legales" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Mentions légales</a></li>
                <li><a href="/cgu" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Conditions générales</a></li>
                <li><a href="/confidentialite" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Confidentialité</a></li>
                <li><a href="/cookies" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Cookies</a></li>
              </ul>
            </nav>

            {/* Contact */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href="mailto:support@feedbackpro.fr"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    support@feedbackpro.fr
                  </a>
                </li>
                <li className="text-sm text-muted-foreground">Réponse sous 24 h ouvrées</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-border/60 pt-6 text-center">
            <p className="text-xs text-muted-foreground">© FeedbackPro 2026 — Tous droits réservés</p>
          </div>
        </div>
      </footer>
    </>
  )
}
