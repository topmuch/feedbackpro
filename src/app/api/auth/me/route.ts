// ============================================================
// API - Utilisateur courant
// GET /api/auth/me → { user: { id, email, role }, pro: ProData | null }
// ------------------------------------------------------------
// AUTO-SEED : si la DB est vide (0 users), on seed automatiquement
// au premier appel. Idempotent. Permet d'initialiser la production
// sans endpoint dédié ni SSH.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, ok, fail, serializePro, type ProData } from "@/lib/session"
import { hashPassword } from "@/lib/auth"

// Auto-seed idempotent — ne crée que si la DB est vide
async function autoSeedIfEmpty() {
  try {
    const count = await db.user.count()
    if (count > 0) return

    // Superadmin
    await db.user.create({
      data: { email: "admin@feedbackpro.fr", passwordHash: hashPassword("admin123"), role: "SUPERADMIN" },
    })

    // Pro démo
    await db.pro.create({
      data: {
        nomEtablissement: "Aéroport de Diass", typeEtablissement: "aeroport", ville: "Diass",
        email: "demo@feedbackpro.fr", plan: "STARTER", suspendu: false, onboardingDone: true,
        users: { create: { email: "demo@feedbackpro.fr", passwordHash: hashPassword("demo1234"), role: "PRO" } },
      },
    })

    // Modules
    for (const m of [
      { key: "surveys", nom: "Sondages", description: "Questionnaires", prix: 0, actif: true },
      { key: "voice_ai", nom: "Coach Vocal IA", description: "Denise", prix: 49, actif: true },
      { key: "trends", nom: "Analytics", description: "Dashboards", prix: 29, actif: true },
      { key: "nps", nom: "NPS", description: "Satisfaction", prix: 19, actif: true },
      { key: "abonnement_multi_sites", nom: "Multi-Sites", description: "Multi-étab", prix: 99, actif: true },
      { key: "feedbackpro_plus", nom: "Plus", description: "Avancé", prix: 149, actif: true },
      { key: "white_label", nom: "Marque Blanche", description: "Custom", prix: 199, actif: true },
    ]) await db.module.upsert({ where: { key: m.key }, create: m, update: m })

    // Secteurs
    for (const s of [
      { secteur: "restaurant", nomSecteur: "Restaurants", emoji: "🍽️", couleur: "#F59E0B" },
      { secteur: "aeroport", nomSecteur: "Aéroports", emoji: "✈️", couleur: "#003399" },
      { secteur: "hotel", nomSecteur: "Hôtels", emoji: "🏨", couleur: "#8B5CF6" },
      { secteur: "pharmacie", nomSecteur: "Pharmacies", emoji: "💊", couleur: "#10B981" },
      { secteur: "boutique", nomSecteur: "Boutiques", emoji: "🛍️", couleur: "#EC4899" },
      { secteur: "garage", nomSecteur: "Garages", emoji: "🔧", couleur: "#6B7280" },
      { secteur: "coiffure", nomSecteur: "Coiffure", emoji: "💇", couleur: "#F43F5E" },
      { secteur: "spa", nomSecteur: "Spas", emoji: "🧖", couleur: "#06B6D4" },
      { secteur: "vetement", nomSecteur: "Vêtements", emoji: "👔", couleur: "#7C3AED" },
      { secteur: "electromenager", nomSecteur: "Électroménager", emoji: "🔌", couleur: "#F97316" },
      { secteur: "fastfood", nomSecteur: "Fast-food", emoji: "🍔", couleur: "#EF4444" },
      { secteur: "boulangerie", nomSecteur: "Boulangeries", emoji: "🥖", couleur: "#D97706" },
      { secteur: "salle_sport", nomSecteur: "Sport", emoji: "🏋️", couleur: "#059669" },
      { secteur: "clinique", nomSecteur: "Cliniques", emoji: "🏥", couleur: "#0EA5E9" },
      { secteur: "ecole", nomSecteur: "Écoles", emoji: "🎓", couleur: "#6366F1" },
    ]) await db.secteurConfig.upsert({ where: { secteur: s.secteur }, create: s, update: s })

    // Settings
    for (const s of [
      { key: "site_name", value: "FeedbackPro" },
      { key: "support_email", value: "support@feedbackpro.fr" },
      { key: "default_language", value: "fr" },
    ]) await db.setting.upsert({ where: { key: s.key }, create: s, update: s })

    console.log("[auto-seed] DB initialisée: admin@feedbackpro.fr/admin123, 7 modules, 15 secteurs")
  } catch (e) {
    // Ne crash pas — juste log
    console.error("[auto-seed] erreur:", e)
  }
}

export async function GET(req: NextRequest) {
  try {
    // Auto-seed au premier appel si DB vide
    await autoSeedIfEmpty()

    const user = await getSessionUser(req)
    if (!user) return ok(null)

    let pro: ProData | null = null
    if (user.proId) {
      const p = await db.pro.findUnique({ where: { id: user.proId } })
      if (p) pro = serializePro(p)
    }

    return ok({ user: { id: user.id, email: user.email, role: user.role }, pro })
  } catch (e) {
    console.error("me error", e)
    return fail("Erreur serveur", 500)
  }
}
