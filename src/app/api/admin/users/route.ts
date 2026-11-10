// ============================================================
// API Superadmin - Gestion des utilisateurs (tous comptes User)
// GET  /api/admin/users?q=&role=&statut=
//      → { users: [{ id, email, role, suspendu, createdAt, derniereConnexion, pro? }] }
// POST /api/admin/users { action, id, role?, password? }
//   actions : suspendre | reactiver | changerRole | supprimer | resetPassword | creer
//   - creer : crée un nouvel User (+ Pro si rôle PRO) sans attaché de session
//     (le superadmin garde sa propre session). Email de bienvenue envoyé si
//     Resend configuré. Champs requis : email, password, role.
//     Si rôle PRO : nomEtablissement, typeEtablissement, ville, adresse requis.
//   - resetPassword : génère un mdp temporaire (12 chars), le hash + envoie
//     par email au compte (mode démo = log serveur). Renvoie le mdp clair
//     au superadmin dans la réponse (toast côté UI).
// ============================================================

import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { firstError } from "@/lib/validation"
import { sendEmail, emailBienvenue } from "@/lib/email"
import { TYPES_ETABLISSEMENT } from "@/lib/constants"
import { notifierSuperadmins } from "@/lib/notifications"

/** Génère un mot de passe temporaire aléatoire (12 chars alphanumériques) */
function genererMotDePasse(longueur = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < longueur; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

// ---------- Schéma POST (actions existantes + creer) ----------
// On gère deux formes selon l'action :
//  - creer : email, password, role (+ nomEtablissement/typeEtablissement/
//    ville/adresse si PRO). Pas d'id.
//  - autres : id obligatoire, role optionnel (requis pour changerRole).
const postSchema = z
  .object({
    action: z.enum(["suspendre", "reactiver", "changerRole", "supprimer", "resetPassword", "creer"], {
      message: "Action invalide",
    }),
    id: z.string().trim().min(1, "ID manquant").optional(),
    // --- champs pour action: "creer" ---
    email: z.string().trim().toLowerCase().pipe(z.email("Adresse email invalide")).optional(),
    password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères").max(72).optional(),
    role: z.enum(["PRO", "SUPERADMIN"], { message: "Rôle invalide" }).optional(),
    nomEtablissement: z.string().trim().min(2, "Indiquez le nom de l'établissement").max(80).optional(),
    typeEtablissement: z
      .string()
      .trim()
      .min(1, "Sélectionnez le type d'établissement")
      .refine((t) => TYPES_ETABLISSEMENT.includes(t), "Type d'établissement invalide")
      .optional(),
    ville: z.string().trim().min(2, "La ville est requise").max(80).optional(),
    adresse: z.string().trim().min(5, "L'adresse est requise").max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "creer") {
      if (!v.email) ctx.addIssue({ code: "custom", message: "Email requis", path: ["email"] })
      if (!v.password) ctx.addIssue({ code: "custom", message: "Mot de passe requis", path: ["password"] })
      if (!v.role) ctx.addIssue({ code: "custom", message: "Rôle requis", path: ["role"] })
      // Champs établissement requis seulement si rôle PRO
      if (v.role === "PRO") {
        if (!v.nomEtablissement) ctx.addIssue({ code: "custom", message: "Nom d'établissement requis", path: ["nomEtablissement"] })
        if (!v.typeEtablissement) ctx.addIssue({ code: "custom", message: "Type d'établissement requis", path: ["typeEtablissement"] })
        if (!v.ville) ctx.addIssue({ code: "custom", message: "Ville requise", path: ["ville"] })
        if (!v.adresse) ctx.addIssue({ code: "custom", message: "Adresse requise", path: ["adresse"] })
      }
    } else {
      if (!v.id) ctx.addIssue({ code: "custom", message: "ID manquant", path: ["id"] })
      if (v.action === "changerRole" && !v.role) {
        ctx.addIssue({ code: "custom", message: "Rôle requis pour changerRole", path: ["role"] })
      }
    }
  })

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const sp = req.nextUrl.searchParams
    const q = sp.get("q")?.trim().toLowerCase() || ""
    const role = sp.get("role") || "" // "PRO" | "SUPERADMIN" | ""
    const statut = sp.get("statut") || "" // "suspendu" | "actif" | ""

    const users = await db.user.findMany({
      include: { pro: { select: { id: true, nomEtablissement: true } } },
      orderBy: { createdAt: "desc" },
    })

    let liste = users
    if (role) liste = liste.filter((u) => u.role === role)
    if (statut === "suspendu") liste = liste.filter((u) => u.suspendu)
    if (statut === "actif") liste = liste.filter((u) => !u.suspendu)
    if (q) {
      liste = liste.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.pro?.nomEtablissement ?? "").toLowerCase().includes(q)
      )
    }

    return ok({
      users: liste.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        suspendu: u.suspendu,
        createdAt: u.createdAt.toISOString(),
        derniereConnexion: u.derniereConnexion ? u.derniereConnexion.toISOString() : null,
        pro: u.pro ? { id: u.pro.id, nomEtablissement: u.pro.nomEtablissement } : null,
      })),
      total: users.length,
    })
  } catch (e) {
    console.error("admin users GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { action, id, role } = parsed.data

    // ---------- action: "creer" (création d'un utilisateur par le superadmin) ----------
    // Crée un User (+ Pro si rôle PRO) sans attacher de session : le superadmin
    // garde sa propre session courante. Email de bienvenue envoyé si Resend configuré.
    if (action === "creer") {
      const { email, password, role: roleCible, nomEtablissement, typeEtablissement, ville, adresse } = parsed.data
      if (!email || !password || !roleCible) {
        return fail("Champs manquants pour la création", 400)
      }
      const existant = await db.user.findUnique({ where: { email } })
      if (existant) return fail("Un compte existe déjà avec cet email", 409)

      const passwordHash = await bcrypt.hash(password, 10)
      const user = await db.user.create({
        data: { email, passwordHash, role: roleCible },
      })

      let proId: string | null = null
      let nomPourNotif = email
      if (roleCible === "PRO") {
        if (!nomEtablissement || !typeEtablissement || !ville || !adresse) {
          // Rollback de l'utilisateur créé (cohérence — ne devrait pas arriver,
          // le schéma zod valide déjà ces champs en amont)
          await db.user.delete({ where: { id: user.id } })
          return fail("Champs établissement manquants", 400)
        }
        const now = new Date()
        const finEssai = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
        const pro = await db.pro.create({
          data: {
            userId: user.id,
            nomEtablissement,
            typeEtablissement,
            adresse,
            ville,
            whatsapp: null,
            email,
            logoUrl: null,
            plan: "STARTER",
            frequenceRapport: "quotidien",
            onboardingDone: true,
            abonnementDebut: now,
            abonnementFin: finEssai,
          },
        })
        proId = pro.id
        nomPourNotif = nomEtablissement
        // Zone « Accueil » par défaut (le Pro est immédiatement opérationnel)
        await db.zone.create({
          data: {
            proId: pro.id,
            nom: "Accueil",
            description: "Réception et prise de contact en début de visite",
            tagsPositifs: "[]",
            tagsNegatifs: "[]",
          },
        })
      }

      // Email de bienvenue (non bloquant — mode démo = log serveur)
      try {
        await sendEmail(email, "Bienvenue sur FeedbackPro 🎉", emailBienvenue(nomPourNotif))
      } catch (e) {
        console.warn("Email de bienvenue non envoyé (non bloquant)", e)
      }

      // Notification superadmin (hors expéditeur) : nouveau compte créé manuellement
      await notifierSuperadmins(
        "nouveau_commercant",
        "👤 Utilisateur créé par le superadmin",
        `Le compte ${email} (${roleCible}) a été créé manuellement par ${admin.email}.`
      )

      return ok({
        id: user.id,
        email: user.email,
        role: user.role,
        suspendu: false,
        createdAt: user.createdAt.toISOString(),
        derniereConnexion: null,
        pro: proId ? { id: proId, nomEtablissement: nomPourNotif } : null,
        cree: true,
      })
    }

    // ---------- Garde-fou : ne pas se suspendre / supprimer soi-même ----------
    if (!id) return fail("ID manquant", 400)
    if ((action === "supprimer" || action === "suspendre") && id === admin.id) {
      return fail("Vous ne pouvez pas suspendre ou supprimer votre propre compte", 403)
    }

    const user = await db.user.findUnique({
      where: { id },
      include: { pro: { select: { id: true, nomEtablissement: true } } },
    })
    if (!user) return fail("Utilisateur introuvable", 404)

    switch (action) {
      case "suspendre": {
        await db.$transaction([
          db.user.update({ where: { id }, data: { suspendu: true } }),
          // Miroir sur le Pro pour les comptes PRO (le guard requirePro lit Pro.suspendu)
          ...(user.pro
            ? [db.pro.update({ where: { id: user.pro.id }, data: { suspendu: true } })]
            : []),
        ])
        return ok({ id, suspendu: true })
      }

      case "reactiver": {
        await db.$transaction([
          db.user.update({ where: { id }, data: { suspendu: false } }),
          ...(user.pro
            ? [db.pro.update({ where: { id: user.pro.id }, data: { suspendu: false } })]
            : []),
        ])
        return ok({ id, suspendu: false })
      }

      case "changerRole": {
        if (!role) return fail("Rôle requis", 400)
        const updated = await db.user.update({ where: { id }, data: { role } })
        return ok({ id: updated.id, role: updated.role })
      }

      case "supprimer": {
        // Cascade Prisma : Pro → Zones → Retours / Employés / RapportsIA /
        // Alertes / Commandes + Sessions + Notifications.
        // Détache d'abord les retours de leurs employés (cohérence SQLite).
        if (user.pro) {
          await db.retour.updateMany({ where: { proId: user.pro.id }, data: { employeId: null } })
        }
        await db.user.delete({ where: { id } })
        return ok({ id, supprime: true })
      }

      case "resetPassword": {
        const password = genererMotDePasse(12)
        const passwordHash = await bcrypt.hash(password, 10)
        await db.user.update({ where: { id }, data: { passwordHash } })

        // Envoi par email (mode démo = log serveur, renvoie true)
        const sujet = "Réinitialisation de votre mot de passe FeedbackPro"
        const html = `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1917;background:#f5f5f4;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<div style="background:#2563EB;padding:24px 32px;color:#fff"><p style="margin:0;font-size:20px;font-weight:700">FeedbackPro</p></div>
<div style="padding:32px">
<h1 style="margin:0 0 12px;font-size:18px">Réinitialisation de votre mot de passe</h1>
<p style="margin:0 0 12px;line-height:1.6;color:#44403c">Bonjour,</p>
<p style="margin:0 0 16px;line-height:1.6;color:#44403c">Votre mot de passe a été réinitialisé par un administrateur FeedbackPro. Voici votre mot de passe temporaire :</p>
<p style="margin:0 0 16px;padding:16px;background:#eff6ff;border-radius:8px;font-family:monospace;font-size:18px;color:#1e3a8a;font-weight:700;text-align:center">${password}</p>
<p style="margin:0 0 12px;line-height:1.6;color:#44403c">Pour des raisons de sécurité, nous vous invitons à le changer dès votre prochaine connexion.</p>
<p style="margin:16px 0 0;line-height:1.6;color:#78716c;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, contactez le support FeedbackPro.</p>
</div></div></body></html>`
        try {
          await sendEmail(user.email, sujet, html)
        } catch (e) {
          console.warn("Email reset password non envoyé (non bloquant)", e)
        }

        return ok({ id, passwordTemporaire: password })
      }
    }
  } catch (e) {
    console.error("admin users POST error", e)
    return fail("Erreur serveur", 500)
  }
}
