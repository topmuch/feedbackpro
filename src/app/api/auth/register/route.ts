// ============================================================
// API - Inscription d'un établissement (Pro)
// POST /api/auth/register
// Body : { email, password, nomEtablissement, typeEtablissement,
//          adresse, ville, whatsapp? }
// → { user, pro }
// Pivot Session 1 : le Pro est immédiatement opérationnel :
//   - onboardingDone = true (pas de wizard)
//   - zone « Accueil » créée avec les tags par défaut
//   - frequenceRapport = "quotidien" (Coach IA)
//   - email de réception des rapports = email du compte
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { createSession, attachSessionCookie, serializePro, getSessionUser } from "@/lib/session"
import { registerSchema, firstError } from "@/lib/validation"
import { POSITIVE_TAGS, NEGATIVE_TAGS } from "@/lib/constants"
import { configSecteur } from "@/lib/secteurs"
import { sendEmail, emailBienvenue } from "@/lib/email"
import { emailOnboardingJour0 } from "@/lib/onboarding-emails"
import { setSetting } from "@/lib/settings"
import { notifierSuperadmins } from "@/lib/notifications"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 })
    }

    // Validation zod (schéma partagé avec le formulaire client)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: firstError(parsed.error) }, { status: 400 })
    }
    const { email, password, nomEtablissement, typeEtablissement, adresse, ville, whatsapp, logoUrl, zones } =
      parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ ok: false, error: "Un compte existe déjà avec cet email" }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await db.user.create({
      data: { email, passwordHash, role: "PRO" },
    })

    // Task M4 — Rattache le Pro à sa fiche SecteurConfig (si elle existe en
    // base) pour que le Coach IA, l'onboarding et la page RGPD s'adaptent
    // dynamiquement au secteur. Best-effort : si la fiche n'existe pas
    // (BDD non seedée), le Pro reste sans secteur (fallback sur le fichier
    // statique SECTEUR_CONFIG côté lecture).
    const secteurBdd = await db.secteurConfig.findUnique({
      where: { nom: typeEtablissement },
      select: { id: true },
    })

    // Création du Pro, prêt à l'emploi (zone « Accueil » incluse)
    const now = new Date()
    const finEssai = new Date(now.getTime() + 30 * 24 * 3600 * 1000) // essai 30 jours
    const pro = await db.pro.create({
      data: {
        userId: user.id,
        nomEtablissement,
        typeEtablissement,
        adresse,
        ville,
        whatsapp: whatsapp || null,
        // Email de réception des rapports IA = email du compte (modifiable en Paramètres)
        email,
        // Logo choisi à l'étape 3 de l'inscription (data URL), sinon vide
        logoUrl: logoUrl || null,
        plan: "STARTER",
        frequenceRapport: "quotidien",
        onboardingDone: true,
        // Période d'essai 30 jours à la création du commerçant
        abonnementDebut: now,
        abonnementFin: finEssai,
        // Task M4 : lien vers la fiche secteur (SecteurConfig) si elle existe
        ...(secteurBdd ? { secteurId: secteurBdd.id } : {}),
      },
    })

    // Zones créées à l'inscription (wizard 4 étapes — audit) : noms fournis
    // par le commerçant, dédupliqués (casse insensible). Aucune zone valide
    // → fallback sur les zones par défaut du secteur (Task 2), puis « Accueil ».
    const secteur = configSecteur(typeEtablissement)
    const nomsZones = Array.from(
      new Map(
        (zones || [])
          .map((nom) => nom.trim())
          .filter((nom) => nom.length > 0 && nom.length <= 60)
          .map((nom) => [nom.toLowerCase(), nom])
      ).values()
    )
    if (nomsZones.length === 0) nomsZones.push(...secteur.zonesParDefaut)
    if (nomsZones.length === 0) nomsZones.push("Accueil")

    // Tags par défaut adaptés au secteur (Task 2) — fallback sur le catalogue
    // générique si le secteur n'en fournit pas.
    const tagsPositifsDefaut =
      secteur.tagsPositifs.length > 0
        ? secteur.tagsPositifs
        : POSITIVE_TAGS.map((t) => t.id)
    const tagsNegatifsDefaut =
      secteur.tagsNegatifs.length > 0
        ? secteur.tagsNegatifs
        : NEGATIVE_TAGS.map((t) => t.id)

    await db.zone.createMany({
      data: nomsZones.map((nom) => ({
        proId: pro.id,
        nom,
        description:
          nom === "Accueil"
            ? "Réception et prise de contact en début de visite"
            : null,
        tagsPositifs: JSON.stringify(tagsPositifsDefaut),
        tagsNegatifs: JSON.stringify(tagsNegatifsDefaut),
      })),
    })

    // Email de bienvenue : strictement non bloquant — un échec
    // d'envoi ne doit jamais empêcher l'inscription de réussir.
    // Task 1 — On envoie le template "First Week" (J0) qui contient les
    // 4 étapes pour démarrer, en complément du legacy emailBienvenue.
    try {
      const { sujet: sujetJ0, html: htmlJ0 } = emailOnboardingJour0(nomEtablissement)
      await sendEmail(email, sujetJ0, htmlJ0)
      // Marque J0 comme déjà envoyé pour éviter que le cron ne le renvoie.
      await setSetting(`onb:${pro.id}:J0`, "1")
    } catch (e) {
      console.warn("Email de bienvenue (J0) non envoyé (non bloquant)", e)
    }
    // Conserve l'ancien template pour compat (peut être retiré plus tard).
    try {
      await sendEmail(email, "Bienvenue sur FeedbackPro 🎉", emailBienvenue(nomEtablissement))
    } catch (e) {
      console.warn("Email de bienvenue legacy non envoyé (non bloquant)", e)
    }

    // Notification superadmin : nouveau commerçant inscrit (cloche superadmin)
    await notifierSuperadmins(
      "nouveau_commercant",
      "🏪 Nouveau commerçant inscrit",
      `« ${nomEtablissement} » (${ville}) vient de créer un compte FeedbackPro.`
    )

    const sessionId = await createSession(user.id)
    const res = NextResponse.json({
      ok: true,
      data: {
        user: { id: user.id, email: user.email, role: user.role },
        pro: serializePro(pro),
      },
    })

    // Garde-fou superadmin : si la requête est faite par un superadmin
    // déjà authentifié (cas « Ajouter un commerçant » depuis /superadmin),
    // on ne remplace PAS son cookie de session — il garde sa session admin.
    const courant = await getSessionUser(req)
    if (courant && courant.role === "SUPERADMIN") {
      return res
    }
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("register error", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur lors de l'inscription" }, { status: 500 })
  }
}
