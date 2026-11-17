// ============================================================
// scripts/create-admin.cjs
// ------------------------------------------------------------
// Crée ou met à jour le superadmin au démarrage du conteneur.
// Utilise SHA256 (hashPassword) — compatible avec le système
// de login de FeedbackPro (src/lib/auth.ts).
//
// Utilisé par le Dockerfile CMD :
//   node scripts/create-admin.cjs
//
// Idempotent : peut être appelé à chaque démarrage sans casser la DB.
// ============================================================

const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const db = new PrismaClient()

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

async function main() {
  console.log('🔧 Initialisation de la base de données...')

  // 1. Superadmin (upsert — crée ou met à jour le hash)
  const admin = await db.user.upsert({
    where: { email: 'admin@feedbackpro.fr' },
    create: {
      email: 'admin@feedbackpro.fr',
      passwordHash: hashPassword('admin123'),
      role: 'SUPERADMIN',
    },
    update: {
      passwordHash: hashPassword('admin123'),
      role: 'SUPERADMIN',
    },
  })
  console.log('✓ Superadmin:', admin.email, '/ admin123')

  // 2. Modules (upsert)
  const modules = [
    { key: 'surveys', nom: 'Sondages & Questionnaires', description: 'Créer des questionnaires de satisfaction', prix: 0, actif: true },
    { key: 'voice_ai', nom: 'Coach Vocal IA (Denise)', description: 'Assistante vocale temps réel', prix: 49, actif: true },
    { key: 'trends', nom: 'Tendances & Analytics', description: 'Tableaux de bord et graphiques', prix: 29, actif: true },
    { key: 'nps', nom: 'NPS & Satisfaction', description: 'Net Promoter Score automatisé', prix: 19, actif: true },
    { key: 'abonnement_multi_sites', nom: 'Multi-Sites', description: 'Gérer plusieurs établissements', prix: 99, actif: true },
    { key: 'feedbackpro_plus', nom: 'FeedbackPro Plus', description: 'Fonctionnalités avancées', prix: 149, actif: true },
    { key: 'white_label', nom: 'Marque Blanche', description: 'Personnalisation aux couleurs de votre marque', prix: 199, actif: true },
  ]
  for (const m of modules) {
    await db.module.upsert({ where: { key: m.key }, create: m, update: m })
  }
  console.log(`✓ ${modules.length} modules`)

  // 3. Secteurs (upsert)
  const secteurs = [
    { secteur: 'restaurant', nomSecteur: 'Restaurants', emoji: '🍽️', couleur: '#F59E0B' },
    { secteur: 'aeroport', nomSecteur: 'Aéroports', emoji: '✈️', couleur: '#003399' },
    { secteur: 'hotel', nomSecteur: 'Hôtels', emoji: '🏨', couleur: '#8B5CF6' },
    { secteur: 'pharmacie', nomSecteur: 'Pharmacies', emoji: '💊', couleur: '#10B981' },
    { secteur: 'boutique', nomSecteur: 'Boutiques', emoji: '🛍️', couleur: '#EC4899' },
    { secteur: 'garage', nomSecteur: 'Garages', emoji: '🔧', couleur: '#6B7280' },
    { secteur: 'coiffure', nomSecteur: 'Salons de coiffure', emoji: '💇', couleur: '#F43F5E' },
    { secteur: 'spa', nomSecteur: 'Spas & Bien-être', emoji: '🧖', couleur: '#06B6D4' },
    { secteur: 'vetement', nomSecteur: 'Boutiques de vêtements', emoji: '👔', couleur: '#7C3AED' },
    { secteur: 'electromenager', nomSecteur: 'Électroménager', emoji: '🔌', couleur: '#F97316' },
    { secteur: 'fastfood', nomSecteur: 'Fast-food', emoji: '🍔', couleur: '#EF4444' },
    { secteur: 'boulangerie', nomSecteur: 'Boulangeries', emoji: '🥖', couleur: '#D97706' },
    { secteur: 'salle_sport', nomSecteur: 'Salles de sport', emoji: '🏋️', couleur: '#059669' },
    { secteur: 'clinique', nomSecteur: 'Cliniques', emoji: '🏥', couleur: '#0EA5E9' },
    { secteur: 'ecole', nomSecteur: 'Écoles', emoji: '🎓', couleur: '#6366F1' },
  ]
  for (const s of secteurs) {
    await db.secteurConfig.upsert({ where: { secteur: s.secteur }, create: s, update: s })
  }
  console.log(`✓ ${secteurs.length} secteurs`)

  // 4. Settings
  const settings = [
    { key: 'site_name', value: 'FeedbackPro' },
    { key: 'support_email', value: 'support@feedbackpro.fr' },
    { key: 'default_language', value: 'fr' },
  ]
  for (const s of settings) {
    await db.setting.upsert({ where: { key: s.key }, create: s, update: s })
  }
  console.log(`✓ ${settings.length} paramètres`)

  // 5. Stats finales
  const stats = {
    users: await db.user.count(),
    pros: await db.pro.count(),
    modules: await db.module.count(),
    secteurs: await db.secteurConfig.count(),
  }
  console.log('\n📊 Base de données prête:', JSON.stringify(stats))
  console.log('\n🔑 Login superadmin: admin@feedbackpro.fr / admin123')
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error('❌ Erreur:', e.message)
    db.$disconnect()
    process.exit(0) // Ne pas faire échouer le démarrage du conteneur
  })
