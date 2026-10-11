"use client"

// ============================================================
// FeedbackPro — LandingView (SPA monopage)
// Aucun fetch, aucune route : toutes les actions passent par
// les callbacks onLogin / onSignup fournis par le parent.
// ============================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { PLANS, planPriceLabel } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  EyeOff,
  Menu,
  MessageCircle,
  Package,
  QrCode,
  ShieldCheck,
  Star,
  StarOff,
  Tags,
  TrendingUp,
  Trophy,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react"
import { motion, useInView } from "framer-motion"

// ---------- Données statiques de la page ----------

// Bande de chiffres (compteurs animés)
const STATS = [
  { prefix: "+", valeur: 25000, decimales: 0, suffixe: "", label: "retours collectés" },
  { prefix: "", valeur: 87, decimales: 0, suffixe: "%", label: "de réclamations interceptées" },
  { prefix: "", valeur: 4.6, decimales: 1, suffixe: "★", label: "note moyenne gagnée" },
  { prefix: "", valeur: 500, decimales: 0, suffixe: "+", label: "commerces équipés" },
]

// Section problème : 3 constats douloureux
const PROBLEMES: { icone: LucideIcon; texte: string }[] = [
  { icone: UserX, texte: "Vos clients mécontents partent sans rien dire" },
  { icone: StarOff, texte: "Ou détruisent votre note Google en 1 clic" },
  { icone: EyeOff, texte: "Vous n'avez aucune donnée sur la qualité de votre service" },
]

// Section solution : parcours client en 4 étapes
const ETAPES_SOLUTION: {
  numero: number
  titre: string
  description: string
  icone: LucideIcon
  vert?: boolean
}[] = [
  { numero: 1, titre: "Scan", description: "Le client flashe en 2 secondes", icone: QrCode },
  { numero: 2, titre: "Note", description: "Il note son expérience de 1 à 5 ★", icone: Star },
  { numero: 3, titre: "Tags", description: "Il coche ce qui a plu ou déplu", icone: Tags },
  {
    numero: 4,
    titre: "WhatsApp privé",
    description: "Le retour arrive directement chez vous",
    icone: MessageCircle,
    vert: true,
  },
]

// Section fonctionnalités : 6 cartes
const FONCTIONNALITES: { icone: LucideIcon; titre: string; description: string }[] = [
  {
    icone: BellRing,
    titre: "Alerte WhatsApp instantanée",
    description:
      "Une note ≤ 2★ ? Vous êtes alerté à l'instant, avant que l'avis ne parte en ligne.",
  },
  {
    icone: Tags,
    titre: "Tags dynamiques",
    description: "Le client coche en un tap ce qui a plu ou déplu. Zéro friction, zéro clavier.",
  },
  {
    icone: BarChart3,
    titre: "Dashboard avec KPIs",
    description:
      "Note moyenne, taux d'interception, évolution mensuelle : vos chiffres en direct.",
  },
  {
    icone: Trophy,
    titre: "Leaderboard employés",
    description: "Classement des mentions positives pour motiver et récompenser vos équipes.",
  },
  {
    icone: QrCode,
    titre: "QR code personnalisé",
    description:
      "Votre nom, vos couleurs : PNG haute résolution, affiche A4 et planche d'étiquettes.",
  },
  {
    icone: Package,
    titre: "Supports physiques",
    description: "Stickers vinyle, chevalet acrylique, affiche A4 : imprimés et livrés chez vous.",
  },
]

// Tags affichés dans la miniature du formulaire de scan (téléphone)
const PILLS_TELEPHONE = ["😊 Accueillant", "⚡ Rapide"]

const TEMOIGNAGES = [
  {
    initiale: "S",
    nom: "Sophie Martin",
    commerce: "Boulangerie Le Fournil · Lyon",
    citation:
      "Une cliente mécontente a été interceptée un mardi matin. On l'a rappelée dans la minute, elle est repartie ravie — et l'avis négatif n'a jamais vu le jour sur Google.",
  },
  {
    initiale: "K",
    nom: "Karim Benali",
    commerce: "Pizzeria Napoli · Marseille",
    citation:
      "Le leaderboard a changé l'ambiance en salle : mes serveurs se battent pour la première place. Le service s'est amélioré tout seul, sans que j'aie à répéter quoi que ce soit.",
  },
  {
    initiale: "C",
    nom: "Claire Dubois",
    commerce: "Institut Élégance · Bordeaux",
    citation:
      "La heatmap m'a montré que le créneau de 14h à 16h était notre point faible. Une réorganisation plus tard : notre note Google est passée de 4,1 à 4,7 en trois mois.",
  },
]

const FAQ = [
  {
    q: "Le client a-t-il besoin d'une app ?",
    r: "Non. Le client flashe le QR code avec la caméra de son téléphone et la page de notation s'ouvre directement dans son navigateur. Aucun téléchargement, aucune inscription, rien à saisir : tout se fait en 30 secondes.",
  },
  {
    q: "Que se passe-t-il pour un client mécontent ?",
    r: "Pour une note de 1 ou 2 étoiles, le formulaire devient privé : le commentaire n'est jamais publié en ligne. Vous recevez immédiatement une alerte WhatsApp pour réagir sur place ou rappeler le client, avant que son mécontentement n'endommage votre réputation.",
  },
  {
    q: "Est-ce légal de rediriger vers Google ?",
    r: "Oui. Inviter vos clients satisfaits à laisser un avis Google est parfaitement légal : c'est une simple invitation, sans contrepartie ni compensation. FeedbackPro ne publie rien automatiquement — il intercepte d'abord les problèmes en interne, puis suggère Google aux clients heureux.",
  },
  {
    q: "Puis-je changer de plan ?",
    r: "Oui, à tout moment depuis vos réglages. Le changement est immédiat et la facturation est ajustée au prorata. Vous pouvez aussi résilier en deux clics : il n'y a aucun engagement de durée.",
  },
  {
    q: "Comment reçoit-on le QR code ?",
    r: "Dès votre inscription, votre QR code personnalisé est téléchargeable depuis votre tableau de bord (affiche A4, planche d'autocollants). Vous pouvez également commander des supports physiques premium, livrés chez vous en quelques jours.",
  },
]

const LIENS_FOOTER = ["À propos", "Contact", "CGU", "Confidentialité"]

// ---------- Helpers internes ----------

// Apparition douce au scroll (framer-motion), utilisée sur les blocs clés
function Apparition({
  children,
  delai = 0,
  className,
}: {
  children: ReactNode
  delai?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: delai, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

// En-tête de section réutilisable (kicker + titre + description)
function EnTeteSection({
  kicker,
  titre,
  description,
}: {
  kicker: string
  titre: string
  description?: string
}) {
  return (
    <Apparition className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{kicker}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl lg:text-4xl">
        {titre}
      </h2>
      {description ? (
        <p className="mt-3 text-base text-stone-600 sm:text-lg">{description}</p>
      ) : null}
    </Apparition>
  )
}

// Compteur animé déclenché quand la stat entre dans le viewport
function Compteur({ fin, decimales = 0 }: { fin: number; decimales?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const visible = useInView(ref, { once: true, amount: 0.6 })
  const [valeur, setValeur] = useState(0)

  useEffect(() => {
    if (!visible) return
    const duree = 1400
    const debut = performance.now()
    let id = 0
    const boucle = (t: number) => {
      const p = Math.min((t - debut) / duree, 1)
      setValeur(fin * (1 - Math.pow(1 - p, 3))) // easing easeOutCubic
      if (p < 1) id = requestAnimationFrame(boucle)
    }
    id = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(id)
  }, [visible, fin])

  return (
    <span ref={ref}>
      {Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }).format(valeur)}
    </span>
  )
}

// Génère une grille 21x21 pseudo-aléatoire DÉTERMINISTE (même rendu serveur/client)
function genererGrilleQr(taille: number, graine: number): boolean[][] {
  let etat = graine
  const alea = () => {
    etat = (etat * 1103515245 + 12345) % 2147483648
    return etat / 2147483648
  }
  const grille: boolean[][] = Array.from({ length: taille }, () =>
    Array<boolean>(taille).fill(false)
  )
  // Les 3 motifs de repérage (coins) sont dessinés à part
  const estFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= taille - 7) || (r >= taille - 7 && c < 7)

  for (let r = 0; r < taille; r++) {
    for (let c = 0; c < taille; c++) {
      if (estFinder(r, c)) continue
      if (r === 6 || c === 6) {
        grille[r][c] = (r + c) % 2 === 0 // motif de synchronisation
      } else {
        grille[r][c] = alea() > 0.52
      }
    }
  }
  return grille
}

// QR code stylisé dessiné en SVG (purement décoratif)
function MotifQr({ className }: { className?: string }) {
  const taille = 21
  const grille = useMemo(() => genererGrilleQr(taille, 42), [])

  return (
    <svg
      viewBox={`0 0 ${taille} ${taille}`}
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {/* Modules aléatoires déterministes + motif de synchronisation */}
      <g fill="currentColor">
        {grille.map((ligne, r) =>
          ligne.map((plein, c) =>
            plein ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} /> : null
          )
        )}
      </g>
      {/* Motifs de repérage : carré plein, liseré blanc, carré central */}
      {[
        [0, 0],
        [0, taille - 7],
        [taille - 7, 0],
      ].map(([r, c]) => (
        <g key={`finder-${r}-${c}`}>
          <rect x={c} y={r} width={7} height={7} rx={1.5} fill="currentColor" />
          <rect x={c + 1} y={r + 1} width={5} height={5} rx={1} fill="#ffffff" />
          <rect x={c + 2} y={r + 2} width={3} height={3} rx={0.5} fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

// 5 étoiles dorées (décoratif)
function CinqEtoiles({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-0.5 ${className ?? ""}`}
      role="img"
      aria-label="Note : 5 étoiles sur 5"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
      ))}
    </div>
  )
}

// ============================================================
// Composant principal
// ============================================================

export function LandingView({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  // Menu mobile (burger)
  const [menuOuvert, setMenuOuvert] = useState(false)

  const liensNav = [
    { href: "#fonctionnalites", label: "Fonctionnalités" },
    { href: "#pricing", label: "Tarifs" },
    { href: "#faq", label: "FAQ" },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* ============ 1. NAVBAR STICKY ============ */}
      <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/80 backdrop-blur-md">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8"
        >
          {/* Logo */}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: "smooth" })
            }}
            className="flex items-center gap-2.5"
            aria-label="FeedbackPro — retour en haut de page"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <QrCode className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-stone-900">FeedbackPro</span>
          </a>

          {/* Liens d'ancrage (desktop) */}
          <div className="hidden items-center gap-8 md:flex">
            {liensNav.map((lien) => (
              <a
                key={lien.href}
                href={lien.href}
                className="text-sm font-medium text-stone-600 transition-colors hover:text-primary"
              >
                {lien.label}
              </a>
            ))}
          </div>

          {/* Actions (desktop) */}
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" onClick={onLogin}>
              Se connecter
            </Button>
            <Button onClick={onSignup}>Essai gratuit</Button>
          </div>

          {/* Burger (mobile) */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={menuOuvert}
            aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMenuOuvert((ouvert) => !ouvert)}
          >
            {menuOuvert ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </nav>

        {/* Panneau mobile */}
        {menuOuvert && (
          <div className="border-t border-stone-200 bg-white md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              {liensNav.map((lien) => (
                <a
                  key={lien.href}
                  href={lien.href}
                  onClick={() => setMenuOuvert(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-stone-700 hover:bg-primary/10 hover:text-primary"
                >
                  {lien.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-stone-100 pt-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMenuOuvert(false)
                    onLogin()
                  }}
                >
                  Se connecter
                </Button>
                <Button
                  onClick={() => {
                    setMenuOuvert(false)
                    onSignup()
                  }}
                >
                  Essai gratuit
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ============ 2. HERO ============ */}
        <section aria-label="Présentation de FeedbackPro" className="relative overflow-hidden">
          {/* Halos décoratifs bleus */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-24 right-0 size-96 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute left-0 top-48 size-72 rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pb-28 lg:pt-20">
            {/* Colonne texte */}
            <Apparition>
              <Badge className="border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Alerte WhatsApp en temps réel
              </Badge>

              <h1 className="mt-5 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
                Protégez votre <span className="text-primary">réputation</span>. Motivez vos{" "}
                <span className="text-primary">équipes</span>.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
                Le QR code intelligent qui transforme chaque retour client en levier de croissance.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="h-12 px-6 text-base" onClick={onSignup}>
                  Essayer gratuitement
                  <ArrowRight aria-hidden="true" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base"
                  onClick={onLogin}
                >
                  Voir la démo
                </Button>
              </div>

              {/* Barre de confiance */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-500">
                {["Sans carte bancaire", "Installé en 5 minutes", "Annulable à tout moment"].map(
                  (argument) => (
                    <span key={argument} className="flex items-center gap-1.5">
                      <Check className="size-4 text-primary" aria-hidden="true" />
                      {argument}
                    </span>
                  )
                )}
              </div>
            </Apparition>

            {/* Colonne visuelle : mockup de téléphone en CSS pur */}
            <Apparition delai={0.15} className="relative flex justify-center">
              <div className="relative w-64 sm:w-72">
                {/* Cadre du téléphone */}
                <div
                  role="img"
                  aria-label="Aperçu du formulaire de scan FeedbackPro sur mobile : Pizzeria Napoli, note 4,5 sur 5, tags Accueillant et Rapide, envoi via WhatsApp"
                  className="relative overflow-hidden rounded-[2.5rem] border-8 border-stone-900 bg-white shadow-xl"
                >
                  {/* Encoche (notch) */}
                  <div
                    aria-hidden="true"
                    className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-stone-900"
                  />

                  {/* Écran : miniature fidèle du formulaire de scan */}
                  <div className="flex min-h-[480px] flex-col bg-white px-4 pb-3 pt-9 sm:min-h-[520px]">
                    {/* En-tête commerce */}
                    <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                      >
                        P
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-900">
                          Pizzeria Napoli
                        </p>
                        <p className="text-[11px] text-stone-400">Votre avis compte !</p>
                      </div>
                    </div>

                    {/* Étoiles (4,5 / 5) */}
                    <div className="mt-5 flex flex-col items-center">
                      <div className="flex items-center gap-1" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => (
                          <Star key={i} className="size-6 fill-amber-400 text-amber-400" />
                        ))}
                        <span className="relative inline-flex">
                          <Star className="size-6 fill-stone-200 text-stone-200" />
                          <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                            <Star className="size-6 fill-amber-400 text-amber-400" />
                          </span>
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] font-medium text-stone-400">
                        Votre note : 4,5 / 5
                      </p>
                    </div>

                    {/* Pills de tags */}
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {PILLS_TELEPHONE.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Commentaire optionnel */}
                    <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[11px] leading-snug text-stone-400">
                      Un commentaire pour l&apos;équipe ? (optionnel)
                    </div>

                    {/* Bouton WhatsApp */}
                    <div className="mt-auto pt-5">
                      <div className="flex h-11 items-center justify-center gap-2 rounded-xl bg-green-500 text-sm font-semibold text-white shadow-sm">
                        <MessageCircle className="size-4" aria-hidden="true" />
                        Envoyer via WhatsApp
                      </div>
                      <p className="mt-2 text-center text-[10px] text-stone-400">
                        30 secondes, sans app à installer
                      </p>
                    </div>

                    {/* Barre d'accueil */}
                    <div aria-hidden="true" className="mt-3 flex justify-center">
                      <div className="h-1 w-16 rounded-full bg-stone-200" />
                    </div>
                  </div>
                </div>

                {/* Carte flottante : interception en action */}
                <div className="absolute -left-2 top-16 z-10 -rotate-2 rounded-xl border border-rose-200 bg-white px-3 py-2 shadow-xl sm:-left-10">
                  <div className="flex items-center gap-2.5">
                    <BellRing className="size-4 shrink-0 text-rose-500" aria-hidden="true" />
                    <div className="text-xs">
                      <p className="font-semibold text-rose-600">Note ★☆☆☆☆ interceptée</p>
                      <p className="text-stone-500">Alerte WhatsApp envoyée</p>
                    </div>
                  </div>
                </div>

                {/* Badge flottant : croissance */}
                <div className="absolute -right-2 top-4 z-10 rotate-3 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-xl sm:-right-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 shrink-0 text-green-600" aria-hidden="true" />
                    <p className="text-xs font-bold text-stone-900">+38 % de retours</p>
                  </div>
                </div>
              </div>
            </Apparition>
          </div>
        </section>

        {/* ============ 3. BANDE DE CHIFFRES ============ */}
        <section aria-label="Chiffres clés" className="border-y border-stone-200 bg-stone-50">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-12 text-center sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
            {STATS.map((stat, i) => (
              <Apparition key={stat.label} delai={i * 0.08}>
                <p className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                  {stat.prefix}
                  <Compteur fin={stat.valeur} decimales={stat.decimales} />
                  {stat.suffixe}
                </p>
                <p className="mt-1.5 text-sm text-stone-600">{stat.label}</p>
              </Apparition>
            ))}
          </div>
        </section>

        {/* ============ 4. PROBLÈME ============ */}
        <section id="probleme" aria-label="Le problème" className="scroll-mt-20 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <EnTeteSection
              kicker="Le problème"
              titre="Le constat qui coûte cher"
              description="96 % des clients insatisfaits ne se plaignent jamais auprès de vous. Ils partent."
            />

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {PROBLEMES.map((probleme, i) => (
                <Apparition key={probleme.texte} delai={i * 0.1} className="h-full">
                  <Card className="h-full gap-0 border-stone-200 transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col items-center gap-4 text-center">
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                        <probleme.icone className="size-6" aria-hidden="true" />
                      </span>
                      <h3 className="text-base font-semibold leading-snug text-stone-900">
                        {probleme.texte}
                      </h3>
                    </CardContent>
                  </Card>
                </Apparition>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 5. SOLUTION ============ */}
        <section
          id="solution"
          aria-label="La solution"
          className="scroll-mt-20 border-y border-stone-200 bg-stone-50 py-16 sm:py-20 lg:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <EnTeteSection
              kicker="Comment ça marche"
              titre="La solution : un QR code intelligent"
              description="Posé en caisse ou en vitrine, il transforme chaque visite en donnée actionnable"
            />

            {/* Flow visuel en 4 étapes connectées */}
            <div className="relative mt-16">
              {/* Ligne pointillée verticale (mobile) */}
              <div
                aria-hidden="true"
                className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l-2 border-dashed border-primary/30 md:hidden"
              />
              {/* Ligne pointillée horizontale (md+) */}
              <div
                aria-hidden="true"
                className="absolute left-[12.5%] right-[12.5%] top-0 hidden -translate-y-1/2 border-t-2 border-dashed border-primary/30 md:block"
              />

              <div className="grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-6">
                {ETAPES_SOLUTION.map((etape, i) => (
                  <Apparition key={etape.numero} delai={i * 0.1}>
                    <div className="relative">
                      {/* Numéro de l'étape, à cheval sur la ligne */}
                      <span className="absolute -top-5 left-1/2 z-10 flex size-10 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-md ring-4 ring-white">
                        {etape.numero}
                      </span>
                      <Card className="gap-0 pt-10 text-center">
                        <CardContent className="flex flex-col items-center gap-3">
                          <span
                            className={`flex size-12 items-center justify-center rounded-xl ${
                              etape.vert ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"
                            }`}
                          >
                            <etape.icone className="size-6" aria-hidden="true" />
                          </span>
                          <h3 className="text-lg font-semibold text-stone-900">{etape.titre}</h3>
                          <p className="text-sm leading-relaxed text-stone-600">
                            {etape.description}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </Apparition>
                ))}
              </div>
            </div>

            {/* Bandeau conformité Google */}
            <Apparition className="mt-12">
              <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 sm:flex-row sm:items-center">
                <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-stone-700">
                  100 % conforme aux règles Google : le partage d&apos;avis reste optionnel et
                  n&apos;est jamais automatique
                </p>
              </div>
            </Apparition>
          </div>
        </section>

        {/* ============ 6. FONCTIONNALITÉS ============ */}
        <section
          id="fonctionnalites"
          aria-label="Fonctionnalités"
          className="scroll-mt-20 py-16 sm:py-20 lg:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <EnTeteSection titre="Tout ce qu'il faut pour écouter vos clients" kicker="Fonctionnalités" />

            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FONCTIONNALITES.map((fonctionnalite, i) => (
                <Apparition key={fonctionnalite.titre} delai={i * 0.08} className="h-full">
                  <Card className="h-full gap-0 transition-shadow hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <fonctionnalite.icone className="size-5" aria-hidden="true" />
                      </span>
                      <h3 className="text-lg font-semibold text-stone-900">
                        {fonctionnalite.titre}
                      </h3>
                      <p className="text-sm leading-relaxed text-stone-600">
                        {fonctionnalite.description}
                      </p>
                    </CardContent>
                  </Card>
                </Apparition>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 7. PRICING ============ */}
        <section
          id="pricing"
          aria-label="Tarifs"
          className="scroll-mt-20 border-y border-stone-200 bg-stone-50 py-16 sm:py-20 lg:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <EnTeteSection
              kicker="Tarifs"
              titre="Un plan pour chaque commerce"
              description="Commencez petit, grandissez quand vous voulez. Sans engagement, résiliation en deux clics."
            />

            <div className="mt-12 grid grid-cols-1 items-stretch gap-6 pt-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.values(PLANS).map((plan, i) => {
                const populaire = plan.id === "PRO" // mise en avant du plan Pro
                const badge = populaire
                  ? "Le plus populaire"
                  : plan.id === "STARTER"
                    ? "Pour commencer"
                    : null
                return (
                  <Apparition key={plan.id} delai={i * 0.1} className="h-full">
                    <Card
                      className={`relative h-full gap-0 ${
                        populaire ? "border-primary shadow-xl ring-2 ring-primary" : ""
                      }`}
                    >
                      {badge && (
                        <Badge
                          variant={populaire ? "default" : "outline"}
                          className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap shadow-md ${
                            populaire ? "" : "border-stone-300 bg-white text-stone-600"
                          }`}
                        >
                          {badge}
                        </Badge>
                      )}
                      <CardContent className="flex h-full flex-col gap-5">
                        <div>
                          <h3 className="text-lg font-semibold text-stone-900">{plan.name}</h3>
                          <p className="mt-1 text-sm text-stone-500">{plan.tagline}</p>
                        </div>
                        <p className="flex items-baseline gap-1.5">
                          <span className="text-4xl font-bold tracking-tight text-stone-900">
                            {planPriceLabel(plan.price)}
                          </span>
                          {plan.price > 0 && (
                            <span className="text-sm text-stone-500">/mois</span>
                          )}
                        </p>
                        <ul className="flex flex-col gap-2.5 text-sm">
                          {plan.features.map((feature) => {
                            // "Tout X, plus :" sert d'intitulé de groupe, sans coche
                            const intituleGroupe = feature.endsWith("plus :")
                            return (
                              <li
                                key={feature}
                                className={
                                  intituleGroupe
                                    ? "pt-1 font-semibold text-stone-900"
                                    : "flex items-start gap-2 text-stone-600"
                                }
                              >
                                {!intituleGroupe && (
                                  <Check
                                    className="mt-0.5 size-4 shrink-0 text-primary"
                                    aria-hidden="true"
                                  />
                                )}
                                {feature}
                              </li>
                            )
                          })}
                        </ul>
                        <Button
                          className="mt-auto w-full"
                          size="lg"
                          variant={populaire ? "default" : "outline"}
                          onClick={onSignup}
                        >
                          {plan.id === "STARTER"
                            ? "Commencer gratuitement"
                            : plan.id === "PRO"
                              ? "Choisir Pro"
                              : "Nous contacter"}
                        </Button>
                      </CardContent>
                    </Card>
                  </Apparition>
                )
              })}
            </div>

            <p className="mt-8 text-center text-sm text-stone-500">
              Sans engagement. Passez au plan supérieur quand vous voulez.
            </p>
          </div>
        </section>

        {/* ============ 8. TÉMOIGNAGES ============ */}
        <section aria-label="Témoignages clients" className="py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <EnTeteSection
              kicker="Témoignages"
              titre="Ils ont transformé leurs avis"
              description="Des centaines de commerces interceptent leurs réclamations et font grimper leur note chaque semaine."
            />
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {TEMOIGNAGES.map((temoignage, i) => (
                <Apparition key={temoignage.nom} delai={i * 0.1} className="h-full">
                  <Card className="h-full gap-0">
                    <CardContent className="flex h-full flex-col gap-4">
                      <CinqEtoiles />
                      <blockquote className="text-sm leading-relaxed text-stone-700">
                        « {temoignage.citation} »
                      </blockquote>
                      <div className="mt-auto flex items-center gap-3 border-t border-stone-100 pt-4">
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                          aria-hidden="true"
                        >
                          {temoignage.initiale}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{temoignage.nom}</p>
                          <p className="text-xs text-stone-500">{temoignage.commerce}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Apparition>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 9. FAQ ============ */}
        <section
          id="faq"
          aria-label="Questions fréquentes"
          className="scroll-mt-20 border-y border-stone-200 bg-stone-50 py-16 sm:py-20 lg:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <EnTeteSection
              kicker="FAQ"
              titre="Questions fréquentes"
              description="Tout ce que vous devez savoir avant de vous lancer."
            />
            <Apparition className="mt-10">
              <Accordion
                type="single"
                collapsible
                className="mx-auto max-w-3xl rounded-xl border border-stone-200 bg-white px-4 shadow-sm sm:px-6"
              >
                {FAQ.map((item, i) => (
                  <AccordionItem key={item.q} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left text-base font-medium text-stone-900 hover:text-primary hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-stone-600">
                      {item.r}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Apparition>
          </div>
        </section>

        {/* ============ 10. CTA FINAL ============ */}
        <section aria-label="Créer un compte" className="py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Apparition>
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800 px-6 py-14 text-center shadow-2xl sm:px-12 lg:py-20">
                {/* Filigrane QR décoratif */}
                <MotifQr className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-blue-300/20" />
                <MotifQr className="pointer-events-none absolute -bottom-14 -left-14 h-56 w-56 text-blue-300/10" />

                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Prêt à transformer vos avis en croissance ?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-blue-50 sm:text-lg">
                  Créez votre compte en 2 minutes, imprimez votre QR code et recevez votre premier
                  retour dès aujourd'hui.
                </p>
                <div className="mt-8">
                  <Button
                    size="lg"
                    className="h-12 bg-white px-8 text-base font-semibold text-blue-700 shadow-lg hover:bg-blue-50"
                    onClick={onSignup}
                  >
                    Créer mon compte gratuit
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
                <p className="mt-4 text-xs text-blue-100">
                  Aucune carte requise · Installation en 5 minutes · Annulable à tout moment
                </p>
              </div>
            </Apparition>
          </div>
        </section>
      </main>

      {/* ============ 11. FOOTER ============ */}
      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Rangée haut : logo + liens */}
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <QrCode className="size-5" aria-hidden="true" />
              </span>
              <span className="text-lg font-bold tracking-tight text-stone-900">FeedbackPro</span>
            </div>
            <nav
              aria-label="Liens de pied de page"
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1"
            >
              {LIENS_FOOTER.map((label) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  onClick={(e) => e.preventDefault()}
                  className="px-1 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-primary"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>

          {/* Rangée bas : copyright */}
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-stone-200 pt-6 text-sm text-stone-500 sm:flex-row">
            <p>© 2026 FeedbackPro — Tous droits réservés.</p>
            <p>Fait avec ❤️ en France</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
