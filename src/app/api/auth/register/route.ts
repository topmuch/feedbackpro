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
import { createSession, attachSessionCookie, serializePro } from "@/lib/session"
import { registerSchema, firstError } from "@/lib/validation"
import { POSITIVE_TAGS, NEGATIVE_TAGS } from "@/lib/constants"
import { sendEmail, emailBienvenue } from "@/lib/email"

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
    const { email, password, nomEtablissement, typeEtablissement, adresse, ville, whatsapp, logoUrl } =
      parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ ok: false, error: "Un compte existe déjà avec cet email" }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await db.user.create({
      data: { email, passwordHash, role: "PRO" },
    })

    // Création du Pro, prêt à l'emploi (zone « Accueil » incluse)
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
      },
    })

    // Zone « Accueil » par défaut, avec tous les tags positifs/négatifs du catalogue
    await db.zone.create({
      data: {
        proId: pro.id,
        nom: "Accueil",
        description: "Réception et prise de contact en début de visite",
        tagsPositifs: JSON.stringify(POSITIVE_TAGS.map((t) => t.id)),
        tagsNegatifs: JSON.stringify(NEGATIVE_TAGS.map((t) => t.id)),
      },
    })

    // Email de bienvenue : strictement non bloquant — un échec
    // d'envoi ne doit jamais empêcher l'inscription de réussir.
    try {
      await sendEmail(email, "Bienvenue sur FeedbackPro 🎉", emailBienvenue(nomEtablissement))
    } catch (e) {
      console.warn("Email de bienvenue non envoyé (non bloquant)", e)
    }

    const sessionId = await createSession(user.id)
    const res = NextResponse.json({
      ok: true,
      data: {
        user: { id: user.id, email: user.email, role: user.role },
        pro: serializePro(pro),
      },
    })
    return attachSessionCookie(res, sessionId)
  } catch (e) {
    console.error("register error", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur lors de l'inscription" }, { status: 500 })
  }
}
