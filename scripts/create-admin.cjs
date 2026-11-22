// ============================================================
// scripts/create-admin.cjs
// ------------------------------------------------------------
// Initialise la base au démarrage du conteneur — DURCI.
//
// HISTORIQUE : la version initiale réinitialisait le mot de passe
// superadmin à « admin123 » À CHAQUE DÉMARRAGE du conteneur (upsert
// avec update du passwordHash). Conséquence : toute rotation du mot
// de passe admin était écrasée au prochain déploiement/redémarrage,
// laissant la prod perpétuellement accessible avec les identifiants
// par défaut connus du public (faille critique fermée 2026-11-22).
//
// POLITIQUE ACTUELLE :
//   1. Bootstrap (DB sans aucun utilisateur) : crée le superadmin
//      avec le mot de passe temporaire admin123 — À CHANGER
//      IMMÉDIATEMENT (ou définir ADMIN_PASSWORD dans Coolify).
//   2. Sinon : le mot de passe EXISTANT n'est JAMAIS touché — on
//      garantit uniquement le rôle SUPERADMIN.
//   3. Variable optionnelle ADMIN_PASSWORD (env Coolify) utilisée
//      uniquement à la création bootstrap.
// ============================================================

const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const db = new PrismaClient()

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

async function main() {
  console.log('🔧 Initialisation de la base de données...')

  // 1. Superadmin — bootstrap-only : plus JAMAIS de reset de mot de passe.
  const nbUsers = await db.user.count()

  if (nbUsers === 0) {
    const motDePasseBootstrap = process.env.ADMIN_PASSWORD || 'admin123'
    const admin = await db.user.upsert({
      where: { email: 'admin@feedbackpro.fr' },
      create: {
        email: 'admin@feedbackpro.fr',
        passwordHash: hashPassword(motDePasseBootstrap),
        role: 'SUPERADMIN',
      },
      update: { role: 'SUPERADMIN' }, // mot de passe existant préservé
    })
    console.log('✓ Superadmin créé (bootstrap):', admin.email)
    if (!process.env.ADMIN_PASSWORD) {
      console.log('⚠️  Mot de passe temporaire admin123 — À CHANGER IMMÉDIATEMENT')
    }
  } else {
    // Base déjà initialisée : garantir le rôle uniquement.
    const admin = await db.user.upsert({
      where: { email: 'admin@feedbackpro.fr' },
      create: {
        email: 'admin@feedbackpro.fr',
        passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123'),
        role: 'SUPERADMIN',
      },
      update: { role: 'SUPERADMIN' }, // NE TOUCHE JAMAIS AU MOT DE PASSE
    })
    console.log('✓ Superadmin:', admin.email, '— mot de passe EXISTANT préservé')
  }

  // 2. Modules (upsert)
  const modules = [
    { key: 'surveys', nom: 'Sondages & Questionnaires', description: 'Créer des questionnaires de satisfaction', actif: true },
    { key: 'voice_ai', nom: 'Coach Vocal IA (Denise)', description: 'Assistante vocale temps réel', actif: true },
    { key: 'trends', nom: 'Tendances & Analytics', description: 'Tableaux de bord et graphiques', actif: true },
    { key: 'nps', nom: 'NPS & Satisfaction', description: 'Net Promoter Score automatisé', actif: true },
    { key: 'abonnement_multi_sites', nom: 'Multi-Sites', description: 'Gérer plusieurs établissements', actif: true },
    { key: 'feedbackpro_plus', nom: 'FeedbackPro Plus', description: 'Fonctionnalités avancées', actif: true },
    { key: 'white_label', nom: 'Marque Blanche', description: 'Personnalisation aux couleurs de votre marque', actif: true },
  ]
  for (const m of modules) {
    await db.module.upsert({ where: { key: m.key }, create: m, update: m })
  }
  console.log(`✓ ${modules.length} modules`)

  // 3. Secteurs (upsert — SecteurConfig a 'nom' @unique, pas 'secteur')
  const secteurs = [
    'restaurant', 'aeroport', 'hotel', 'pharmacie', 'boutique', 'garage',
    'coiffure', 'spa', 'vetement', 'electromenager', 'fastfood', 'boulangerie',
    'salle_sport', 'clinique', 'ecole',
  ]
  for (const nom of secteurs) {
    await db.secteurConfig.upsert({
      where: { nom },
      create: { nom, zonesDefaut: '[]' },
      update: {},
    })
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
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error('❌ Erreur:', e.message)
    db.$disconnect()
    process.exit(0) // Ne pas faire échouer le démarrage du conteneur
  })
