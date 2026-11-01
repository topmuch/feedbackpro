// ============================================================
// API Superadmin - Gestion des établissements (Pros)
// GET  /api/admin/pros?plan=&q=&statut=
//      → liste avec counts (zones / retours / employés) + filtres + dates abonnement
// POST /api/admin/pros { action: "changerPlan"|"suspendre"|"reactiver"|"supprimer"|"resetPassword", id, plan? }
//   - resetPassword : génère un mdp temporaire 12 chars, hash + envoie par email
//     au commerçant (mode démo = log serveur). Renvoie le mdp clair au superadmin.
// ============================================================

import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"
import { adminProActionSchema, firstError } from "@/lib/validation"
import { sendEmail } from "@/lib/email"
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

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const sp = req.nextUrl.searchParams
    const plan = sp.get("plan") || ""
    const q = sp.get("q")?.trim().toLowerCase() || ""
    const statut = sp.get("statut") || "" // "suspendu" | "actif" | ""

    const pros = await db.pro.findMany({
      include: {
        user: { select: { email: true } },
        _count: { select: { zones: true, retours: true, employes: true, commandes: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    let liste = pros
    if (plan) liste = liste.filter((p) => p.plan === plan)
    if (statut === "suspendu") liste = liste.filter((p) => p.suspendu)
    if (statut === "actif") liste = liste.filter((p) => !p.suspendu)
    if (q) {
      liste = liste.filter(
        (p) =>
          p.nomEtablissement.toLowerCase().includes(q) ||
          p.ville.toLowerCase().includes(q) ||
          p.user.email.toLowerCase().includes(q)
      )
    }

    return ok({
      pros: liste.map((p) => ({
        id: p.id,
        nomEtablissement: p.nomEtablissement,
        typeEtablissement: p.typeEtablissement,
        ville: p.ville,
        email: p.user.email,
        plan: p.plan,
        suspendu: p.suspendu,
        onboardingDone: p.onboardingDone,
        frequenceRapport: p.frequenceRapport,
        createdAt: p.createdAt,
        abonnementDebut: p.abonnementDebut ? p.abonnementDebut.toISOString() : null,
        abonnementFin: p.abonnementFin ? p.abonnementFin.toISOString() : null,
        // Compteurs (nbZones/nbRetours/nbEmployés) + alias courts
        // zones/retours/employés consommés par admin-dashboard.tsx
        nbZones: p._count.zones,
        nbRetours: p._count.retours,
        nbEmployes: p._count.employes,
        nbCommandes: p._count.commandes,
        zones: p._count.zones,
        retours: p._count.retours,
        employes: p._count.employes,
        mrr: PLANS[p.plan as keyof typeof PLANS]?.price ?? 0,
      })),
      total: pros.length,
    })
  } catch (e) {
    console.error("admin pros GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parse = adminProActionSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const { action, id, plan } = parse.data

    const pro = await db.pro.findUnique({
      where: { id },
      include: { user: { select: { id: true, role: true, email: true } } },
    })
    if (!pro) return fail("Établissement introuvable", 404)

    // Le superadmin ne peut jamais être suspendu ni supprimé
    if ((action === "supprimer" || action === "suspendre") && pro.user.role === "SUPERADMIN") {
      return fail("Impossible de supprimer ou suspendre un compte superadmin", 403)
    }

    switch (action) {
      case "changerPlan": {
        if (!plan || !PLANS[plan as keyof typeof PLANS]) return fail("Plan invalide", 400)
        const updated = await db.pro.update({ where: { id: pro.id }, data: { plan } })
        return ok({ id: updated.id, plan: updated.plan, suspendu: updated.suspendu })
      }

      case "suspendre": {
        const updated = await db.pro.update({ where: { id: pro.id }, data: { suspendu: true } })
        await notifierSuperadmins(
          "commercant_suspendu",
          "🛑 Commerçant suspendu",
          `« ${pro.nomEtablissement} » a été suspendu par un superadmin.`
        )
        return ok({ id: updated.id, plan: updated.plan, suspendu: updated.suspendu })
      }

      case "reactiver": {
        const updated = await db.pro.update({ where: { id: pro.id }, data: { suspendu: false } })
        return ok({ id: updated.id, plan: updated.plan, suspendu: updated.suspendu })
      }

      case "supprimer": {
        // Détache d'abord les retours de leurs employés (cohérence SQLite),
        // puis suppression du User : cascade Prisma → Pro → Zones →
        // Retours / Employés / RapportsIA / Alertes / Commandes + Sessions.
        await db.retour.updateMany({ where: { proId: pro.id }, data: { employeId: null } })
        await db.user.delete({ where: { id: pro.userId } })
        return ok({ id: pro.id, supprime: true })
      }

      case "resetPassword": {
        // Génère un mdp temporaire (12 chars), le hash et l'enregistre,
        // puis envoie par email au commerçant (mode démo = log serveur).
        const password = genererMotDePasse(12)
        const passwordHash = await bcrypt.hash(password, 10)
        await db.user.update({ where: { id: pro.userId }, data: { passwordHash } })

        const sujet = "Réinitialisation de votre mot de passe FeedbackPro"
        const html = `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1917;background:#f5f5f4;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<div style="background:#2563EB;padding:24px 32px;color:#fff"><p style="margin:0;font-size:20px;font-weight:700">FeedbackPro</p></div>
<div style="padding:32px">
<h1 style="margin:0 0 12px;font-size:18px">Réinitialisation de votre mot de passe</h1>
<p style="margin:0 0 12px;line-height:1.6;color:#44403c">Bonjour ${pro.nomEtablissement},</p>
<p style="margin:0 0 16px;line-height:1.6;color:#44403c">Votre mot de passe a été réinitialisé par un administrateur FeedbackPro. Voici votre mot de passe temporaire :</p>
<p style="margin:0 0 16px;padding:16px;background:#eff6ff;border-radius:8px;font-family:monospace;font-size:18px;color:#1e3a8a;font-weight:700;text-align:center">${password}</p>
<p style="margin:0 0 12px;line-height:1.6;color:#44403c">Nous vous invitons à le changer dès votre prochaine connexion.</p>
<p style="margin:16px 0 0;line-height:1.6;color:#78716c;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, contactez le support FeedbackPro.</p>
</div></div></body></html>`
        try {
          await sendEmail(pro.user.email, sujet, html)
        } catch (e) {
          console.warn("Email reset password (pro) non envoyé (non bloquant)", e)
        }

        return ok({ id: pro.id, passwordTemporaire: password })
      }
    }
  } catch (e) {
    console.error("admin pros POST error", e)
    return fail("Erreur serveur", 500)
  }
}
