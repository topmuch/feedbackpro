// ============================================================
// API Pro - Multi-établissements (D7)
// GET  /api/pro/etablissements
//      → { parent: ProData, enfants: ProData[], courant: ProData }
// POST /api/pro/etablissements { nomEtablissement, typeEtablissement, ville, adresse }
//      → crée un établissement enfant (nouveau User + Pro lié via proId)
//        et le renvoie. L'enfant partage l'email du parent (avec un suffixe
//        +enfant-<id>) pour rester dans la contrainte userId @unique.
//
// Note : le "switch" complet entre établissements nécessiterait de changer
// la session authentifiée (passer du User parent au User enfant). Cette
// implémentation fournit le modèle + l'API + la liste ; le switch UI est
// volontairement limité à l'affichage (spec D7 : "sans le switch complet").
// ============================================================

import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail, serializePro } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"
import { TYPES_ETABLISSEMENT } from "@/lib/constants"

const createSchema = z.object({
  nomEtablissement: z.string().trim().min(2, "Indiquez le nom de l'établissement").max(80),
  typeEtablissement: z
    .string()
    .trim()
    .min(1, "Sélectionnez le type d'établissement")
    .refine((t) => TYPES_ETABLISSEMENT.includes(t), "Type d'établissement invalide"),
  ville: z.string().trim().min(2, "La ville est requise").max(80),
  adresse: z.string().trim().min(5, "L'adresse est requise").max(200),
})

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // Parent = le Pro racine (celui qui n'a pas de proId), ou le Pro courant
    // si celui-ci n'a pas de parent. On remonte à la racine pour lister tous
    // les établissements du groupe.
    const racineId = ctx.pro.proId ?? ctx.pro.id
    const [racine, enfants] = await Promise.all([
      db.pro.findUnique({ where: { id: racineId } }),
      db.pro.findMany({ where: { proId: racineId }, orderBy: { createdAt: "asc" } }),
    ])
    if (!racine) return fail("Établissement racine introuvable", 404)

    return ok({
      parent: serializePro(racine),
      courant: serializePro(ctx.pro),
      enfants: enfants.map(serializePro),
    })
  } catch (e) {
    console.error("etablissements GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = createSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { nomEtablissement, typeEtablissement, ville, adresse } = parsed.data

    // Le Pro courant est la racine si proId est null ; sinon on attache
    // l'enfant à la racine du groupe (proId = racine).
    const racineId = ctx.pro.proId ?? ctx.pro.id

    // Crée un nouvel User pour l'enfant (userId @unique oblige). Mot de passe
    // aléatoire — l'enfant n'est pas conçu pour être login directement, le
    // switch se fera via la session parent à terme. Email dérivé de l'email
    // du parent avec un suffixe +enfant-<shortid>.
    const parentUser = await db.user.findUnique({ where: { id: ctx.pro.userId } })
    if (!parentUser) return fail("Compte parent introuvable", 404)
    const [localPart, domain] = parentUser.email.split("@")
    const suffix = `+enfant-${Date.now().toString(36)}`
    const emailEnfant = `${localPart}${suffix}@${domain ?? "feedbackpro.fr"}`

    const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now(), 10)
    const userEnfant = await db.user.create({
      data: { email: emailEnfant, passwordHash, role: "PRO" },
    })

    const now = new Date()
    const finEssai = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
    const enfant = await db.pro.create({
      data: {
        userId: userEnfant.id,
        nomEtablissement,
        typeEtablissement,
        adresse,
        ville,
        whatsapp: null,
        email: emailEnfant,
        logoUrl: null,
        plan: "STARTER",
        frequenceRapport: "quotidien",
        onboardingDone: true,
        abonnementDebut: now,
        abonnementFin: finEssai,
        // D7 : lien de parenté — l'enfant pointe vers la racine du groupe
        proId: racineId,
      },
    })

    // Zone « Accueil » par défaut (l'enfant est immédiatement opérationnel)
    await db.zone.create({
      data: {
        proId: enfant.id,
        nom: "Accueil",
        description: "Réception et prise de contact en début de visite",
        tagsPositifs: "[]",
        tagsNegatifs: "[]",
      },
    })

    return ok({ enfant: serializePro(enfant) })
  } catch (e) {
    console.error("etablissements POST error", e)
    return fail("Erreur serveur lors de la création de l'établissement", 500)
  }
}
