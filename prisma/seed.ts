// ============================================================
// FeedbackPro - Seed de démonstration
// Exécution : bun prisma/seed.ts
// Crée : 1 superadmin + 4 commerçants (dont 1 démo complet) + retours réalistes
// ============================================================

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()

// Générateur pseudo-aléatoire seedé (résultats reproductibles)
let seedState = 42
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648
  return seedState / 2147483648
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

const POSITIVE_TAGS = ["accueillant", "rapide", "competent", "pro"]
const NEGATIVE_TAGS = ["impoli", "mal_renseigne", "attente", "erreur"]

const COMMENTAIRES_POSITIFS = [
  "Service impeccable, je recommande vivement !",
  "Toujours aussi bien reçu, merci à toute l'équipe.",
  "Excellent rapport qualité-prix, on reviendra.",
  "Le personnel est adorable et très efficace.",
  "Une super expérience comme à chaque visite.",
  "Rapide, souriant, professionnel. Parfait !",
  "Ma pizza était parfaite, bravo au pizzaiolo !",
]
const COMMENTAIRES_NEGATIFS = [
  "Attente très longue malgré une réservation.",
  "Le serveur s'est trompé deux fois dans la commande.",
  "Pas très aimable quand j'ai posé une question sur la carte.",
  "Nous n'avons pas été salués en entrant, dommage.",
  "La commande était froide à l'arrivée.",
  "On nous a mal renseigné sur les ingrédients.",
  "Trop d'attente pour les boissons, 20 minutes !",
]

// Distribution des notes réaliste : majoritairement satisfait
function randomNote(): number {
  const r = rand()
  if (r < 0.05) return 1
  if (r < 0.13) return 2
  if (r < 0.26) return 3
  if (r < 0.62) return 4
  return 5
}

function randomTags(note: number): string[] {
  if (note >= 4) {
    const shuffled = [...POSITIVE_TAGS].sort(() => rand() - 0.5)
    return shuffled.slice(0, randInt(1, 3))
  }
  const shuffled = [...NEGATIVE_TAGS].sort(() => rand() - 0.5)
  return shuffled.slice(0, randInt(1, 2))
}

async function main() {
  console.log("🌱 Seed FeedbackPro...")

  // Nettoyage complet (ordre respectant les FK)
  await db.alerte.deleteMany()
  await db.commande.deleteMany()
  await db.retour.deleteMany()
  await db.employe.deleteMany()
  await db.boutique.deleteMany()
  await db.pro.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()

  const passwordPro = await bcrypt.hash("demo1234", 10)
  const passwordAdmin = await bcrypt.hash("admin123", 10)

  // ---------- Superadmin ----------
  const admin = await db.user.create({
    data: { email: "admin@feedbackpro.fr", passwordHash: passwordAdmin, role: "SUPERADMIN" },
  })
  console.log("👑 Superadmin créé :", admin.email)

  // ---------- Commerçants ----------

  type ProSeed = {
    email: string
    nomCommerce: string
    categorie: string
    adresse: string
    ville: string
    plan: "STARTER" | "PRO" | "ENTERPRISE"
    employes: { nom: string; poste: string }[]
    nbRetours: number
  }

  const proSeeds: ProSeed[] = [
    {
      email: "demo@pizzeria.fr",
      nomCommerce: "Pizzeria Bella Napoli",
      categorie: "Pizzeria",
      adresse: "12 rue de la République",
      ville: "Lyon",
      plan: "PRO",
      employes: [
        { nom: "Julie Martin", poste: "Serveuse" },
        { nom: "Karim Benali", poste: "Pizzaiolo" },
        { nom: "Sophie Dubois", poste: "Serveuse" },
        { nom: "Marc Petit", poste: "Manager" },
      ],
      nbRetours: 64,
    },
    {
      email: "contact@salon-elegance.fr",
      nomCommerce: "Salon Élégance",
      categorie: "Salon de coiffure",
      adresse: "8 avenue des Champs-Élysées",
      ville: "Paris",
      plan: "STARTER",
      employes: [
        { nom: "Nadia Lefèvre", poste: "Coiffeuse" },
        { nom: "Emma Rousseau", poste: "Coloriste" },
      ],
      nbRetours: 18,
    },
    {
      email: "bonjour@paindor.fr",
      nomCommerce: "Boulangerie Pain d'Or",
      categorie: "Boulangerie",
      adresse: "45 cours Julien",
      ville: "Marseille",
      plan: "PRO",
      employes: [
        { nom: "Pierre Morel", poste: "Boulanger" },
        { nom: "Amina Cherif", poste: "Vendeuse" },
        { nom: "Lucas Girard", poste: "Vendeur" },
      ],
      nbRetours: 31,
    },
    {
      email: "hello@autoplus.fr",
      nomCommerce: "Garage AutoPlus",
      categorie: "Garage automobile",
      adresse: "3 rue de l'Industrie",
      ville: "Lille",
      plan: "STARTER",
      employes: [{ nom: "Franck Lambert", poste: "Mécanicien" }],
      nbRetours: 9,
    },
  ]

  for (const ps of proSeeds) {
    const user = await db.user.create({
      data: { email: ps.email, passwordHash: passwordPro, role: "PRO" },
    })

    const pro = await db.pro.create({
      data: {
        userId: user.id,
        nomCommerce: ps.nomCommerce,
        categorie: ps.categorie,
        adresse: ps.adresse,
        ville: ps.ville,
        whatsapp: "33612345678",
        plan: ps.plan,
        onboardingDone: true,
        googleUrl: `https://g.page/r/${ps.nomCommerce.toLowerCase().replace(/[^a-z]/g, "")}`,
        messageWhatsapp: "Envoyé via FeedbackPro ✨",
      },
    })

    const boutique = await db.boutique.create({
      data: { proId: pro.id, nom: ps.nomCommerce, adresse: ps.adresse },
    })

    const employes: { id: string; nom: string }[] = []
    for (const e of ps.employes) {
      employes.push(
        await db.employe.create({
          data: { boutiqueId: boutique.id, nom: e.nom, poste: e.poste, actif: true },
        })
      )
    }

    // ---------- Retours sur les 45 derniers jours ----------
    let count = 0
    for (let day = 45; day >= 0; day--) {
      const nbDuJour = Math.min(ps.nbRetours - count, randInt(0, 3))
      if (nbDuJour <= 0) continue
      for (let i = 0; i < nbDuJour; i++) {
        count++
        const note = randomNote()
        const tags = randomTags(note)
        const createdAt = new Date()
        createdAt.setDate(createdAt.getDate() - day)
        createdAt.setHours(randInt(8, 22), randInt(0, 59), 0, 0)

        const avecEmploye = rand() < 0.65
        const employe = avecEmploye ? pick(employes) : null

        // Les retours anciens sont plus souvent traités
        const ancien = day > 7
        const statut = note <= 2 ? (ancien ? pick(["IN_PROGRESS", "RESOLVED", "RESOLVED"]) : "NEW") : ancien ? pick(["RESOLVED", "NEW", "IN_PROGRESS"]) : "NEW"
        const lu = ancien || rand() < 0.3

        await db.retour.create({
          data: {
            boutiqueId: boutique.id,
            employeId: employe?.id,
            note,
            tags: JSON.stringify(tags),
            commentaire:
              rand() < 0.45 ? (note >= 4 ? pick(COMMENTAIRES_POSITIFS) : pick(COMMENTAIRES_NEGATIFS)) : null,
            personnelMentionne: !avecEmploye && note <= 3 && rand() < 0.4 ? "La fille aux cheveux roux" : null,
            canalChoisi: note >= 4 ? pick(["whatsapp", "whatsapp", "google", "aucun"]) : pick(["whatsapp", "aucun"]),
            statut,
            lu,
            createdAt,
          },
        })

        // Alerte automatique pour les notes ≤ 2 (SMS simulé)
        if (note <= 2) {
          await db.alerte.create({
            data: {
              proId: pro.id,
              titre: `🚨 Réclamation ${note}/5 - ${ps.nomCommerce}`,
              message: `Un client vient de laisser un retour ${note}/5${tags.length ? ` (${tags.join(", ")})` : ""}. Intervenez vite pour protéger votre réputation !`,
              canal: "SMS",
              lu: day > 3,
              createdAt,
            },
          })
        }
      }
    }

    console.log(`🏪 ${ps.nomCommerce} créé (${ps.plan}) - ${count} retours`)
  }

  // ---------- Commandes de supports ----------
  const demoPro = await db.pro.findFirst({ where: { nomCommerce: "Pizzeria Bella Napoli" } })
  if (demoPro) {
    const ilYA10j = new Date()
    ilYA10j.setDate(ilYA10j.getDate() - 10)
    await db.commande.create({
      data: {
        proId: demoPro.id,
        typeSupport: "STICKERS_50",
        quantite: 50,
        prixEuros: 29,
        adresseLivraison: "12 rue de la République, 69002 Lyon",
        statut: "LIVRE",
        createdAt: ilYA10j,
      },
    })
    await db.commande.create({
      data: {
        proId: demoPro.id,
        typeSupport: "CHEVALET_ACRYLIQUE",
        quantite: 1,
        prixEuros: 49,
        adresseLivraison: "12 rue de la République, 69002 Lyon",
        statut: "A_IMPRIMER",
      },
    })
    console.log("📦 Commandes créées pour la démo")
  }

  const totalRetours = await db.retour.count()
  console.log(`✅ Seed terminé : ${totalRetours} retours au total.`)
  console.log("   Superadmin : admin@feedbackpro.fr / admin123")
  console.log("   Démo Pro   : demo@pizzeria.fr / demo1234")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
