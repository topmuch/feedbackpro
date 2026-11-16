// Seed script for FeedbackPro
// Run with: bun run scripts/seed.ts

import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

async function main() {
  console.log('🌱 Seeding FeedbackPro...')

  // --- Compte Pro démo ---
  const demoUser = await db.user.create({
    data: {
      email: 'demo@pizzeria.fr',
      passwordHash: hashPassword('demo1234'),
      name: 'Mario Rossi',
    },
  })

  const etab = await db.etablissement.create({
    data: {
      nom: 'Pizzeria Bella Napoli',
      type: 'restaurant',
      whatsapp: '+33612345678',
      whatsappActive: true,
      recompenseActive: true,
      recompenseType: 'cafe_gratuit',
      recompenseTexte: 'Café offert sur votre prochaine visite',
      recompenseCodePromo: 'CAFE-OFFERT',
      userId: demoUser.id,
    },
  })

  // --- Personnel ---
  await db.personnel.createMany({
    data: [
      { nom: 'Diop', prenom: 'Ousmane', poste: 'serveur', etablissementId: etab.id, mentionsNegatives: 1 },
      { nom: 'Martin', prenom: 'Sophie', poste: 'serveuse', etablissementId: etab.id },
      { nom: 'Bernard', prenom: 'Pierre', poste: 'cuisinier', etablissementId: etab.id },
      { nom: 'Lefebvre', prenom: 'Julie', poste: 'plonge', etablissementId: etab.id, mentionsNegatives: 2 },
    ],
  })

  // --- Retours ---
  const now = new Date()
  const dayAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)

  await db.retour.createMany({
    data: [
      {
        etablissementId: etab.id,
        nps: 2,
        tags: JSON.stringify(['hygiene', 'proprete', 'service']),
        commentaire: 'Les toilettes du RDC étaient dans un état lamentable. Aucun personnel n\'est intervenu alors que j\'ai signalé le problème. Très déçue.',
        zone: 'Toilettes RDC',
        photoUrl: null,
        clientEmail: 'diopousman@gmail.com',
        clientPhone: '+33698765432',
        statut: 'NOUVEAU',
        isRecidive: true,
        createdAt: hoursAgo(2),
      },
      {
        etablissementId: etab.id,
        nps: 4,
        tags: JSON.stringify(['accueil', 'qualite']),
        commentaire: 'Très bonne pizza, service rapide. Petite remarque sur l\'attente à l\'entrée.',
        zone: 'Salle',
        clientEmail: 'marie.dupont@example.com',
        statut: 'EN_COURS',
        isRecidive: false,
        createdAt: dayAgo(1),
      },
      {
        etablissementId: etab.id,
        nps: 5,
        tags: JSON.stringify(['qualite', 'accueil', 'ambiance']),
        commentaire: 'Excellente soirée, équipe au top !',
        zone: 'Salle',
        clientEmail: 'luc.martin@example.com',
        statut: 'RESOLU',
        isRecidive: false,
        recompenseAttribuee: true,
        recompenseUtilisee: true,
        dateRecompenseUtilisee: hoursAgo(20),
        createdAt: dayAgo(2),
      },
      {
        etablissementId: etab.id,
        nps: 3,
        tags: JSON.stringify(['attente', 'service']),
        commentaire: 'Bon mais on a attendu 30 min pour le dessert.',
        zone: 'Salle',
        statut: 'NOUVEAU',
        isRecidive: false,
        createdAt: dayAgo(3),
      },
      {
        etablissementId: etab.id,
        nps: 1,
        tags: JSON.stringify(['hygiene', 'service', 'temperature']),
        commentaire: 'Plat froid, table sale, serveur désagréable. À fuir.',
        zone: 'Salle',
        clientEmail: 'anne.roux@example.com',
        statut: 'NOUVEAU',
        isRecidive: true,
        createdAt: dayAgo(4),
      },
      {
        etablissementId: etab.id,
        nps: 4,
        tags: JSON.stringify(['qualite', 'prix']),
        commentaire: 'Bon rapport qualité-prix, je recommande.',
        zone: 'Salle',
        statut: 'RESOLU',
        isRecidive: false,
        createdAt: dayAgo(5),
      },
    ],
  })

  console.log('✅ Seed terminé.')
  console.log('   Compte: demo@pizzeria.fr / demo1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
