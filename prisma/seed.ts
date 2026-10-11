// ============================================================
// FeedbackPro - Seed de démonstration
// Conforme Session 1 : 1 SUPERADMIN + 1 PRO de test avec 3 zones
// (+ 3 commerçants supplémentaires pour crédibiliser le dashboard superadmin)
// Exécution : bun prisma/seed.ts
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

const COMMENTAIRES_POSITIFS = [
  "Service impeccable, je recommande vivement !",
  "Toujours aussi bien reçu, merci à toute l'équipe.",
  "Excellent rapport qualité-prix, on reviendra.",
  "Le personnel est adorable et très efficace.",
  "Une super expérience comme à chaque visite.",
  "Rapide, souriant, professionnel. Parfait !",
  "Ma pizza était parfaite, bravo au pizzaiolo !",
  "On m'a très bien conseillé sur la carte, top !",
]
const COMMENTAIRES_NEGATIFS = [
  "Attente très longue malgré une réservation.",
  "Le serveur s'est trompé deux fois dans la commande.",
  "Pas très aimable quand j'ai posé une question sur la carte.",
  "Nous n'avons pas été salués en entrant, dommage.",
  "Le personnel discutait entre eux au lieu de s'occuper des clients.",
  "On nous a mal renseigné sur les ingrédients du plat.",
  "Les toilettes n'étaient pas propres, à revoir.",
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

function randomTags(zone: { tagsPositifs: string; tagsNegatifs: string }, note: number): string[] {
  const positifs = JSON.parse(zone.tagsPositifs) as string[]
  const negatifs = JSON.parse(zone.tagsNegatifs) as string[]
  if (note >= 4 && positifs.length > 0) {
    const shuffled = [...positifs].sort(() => rand() - 0.5)
    return shuffled.slice(0, randInt(1, Math.min(3, positifs.length)))
  }
  if (negatifs.length > 0) {
    const shuffled = [...negatifs].sort(() => rand() - 0.5)
    return shuffled.slice(0, randInt(1, Math.min(2, negatifs.length)))
  }
  return []
}

async function main() {
  console.log("🌱 Seed FeedbackPro (Session 1 : 1 SUPERADMIN + 1 PRO avec 3 zones)...")

  // Nettoyage complet (ordre respectant les FK)
  await db.alerte.deleteMany()
  await db.rapportIA.deleteMany()
  await db.commande.deleteMany()
  await db.retour.deleteMany()
  await db.employe.deleteMany()
  await db.zone.deleteMany()
  await db.pro.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()
  await db.setting.deleteMany()

  const passwordPro = await bcrypt.hash("demo1234", 10)
  const passwordAdmin = await bcrypt.hash("admin123", 10)

  // ---------- Superadmin (Session 1) ----------
  const admin = await db.user.create({
    data: { email: "admin@feedbackpro.fr", passwordHash: passwordAdmin, role: "SUPERADMIN" },
  })
  console.log("👑 Superadmin créé :", admin.email)

  // ---------- PRO de test avec 3 zones (Session 1) ----------

  const demoUser = await db.user.create({
    data: { email: "demo@pizzeria.fr", passwordHash: passwordPro, role: "PRO" },
  })

  const demoPro = await db.pro.create({
    data: {
      userId: demoUser.id,
      nomEtablissement: "Pizzeria Bella Napoli",
      typeEtablissement: "restaurant",
      adresse: "12 rue de la République",
      ville: "Lyon",
      whatsapp: "33612345678",
      email: "gerant@bellanapoli.fr",
      plan: "PRO",
      frequenceRapport: "quotidien",
      recompense: "☕ Café offert sur votre prochaine visite",
      messageWhatsapp: "Envoyé via FeedbackPro ✨",
      onboardingDone: true,
    },
  })

  // 3 zones avec des tags spécifiques à chaque point de contact
  const zoneAccueil = await db.zone.create({
    data: {
      proId: demoPro.id,
      nom: "Accueil",
      description: "Réception et prise de commande en début de visite",
      tagsPositifs: JSON.stringify(["accueillant", "rapide"]),
      tagsNegatifs: JSON.stringify(["impoli", "attente"]),
    },
  })
  const zoneSalle = await db.zone.create({
    data: {
      proId: demoPro.id,
      nom: "Salle / Restaurant",
      description: "Expérience à table : service, plats, rangement",
      tagsPositifs: JSON.stringify(["rapide", "competent", "pro"]),
      tagsNegatifs: JSON.stringify(["attente", "mal_renseigne", "distrait", "mal_range"]),
    },
  })
  const zoneToilettes = await db.zone.create({
    data: {
      proId: demoPro.id,
      nom: "Toilettes RDC",
      description: "Propreté et état des installations",
      tagsPositifs: JSON.stringify(["pro"]),
      tagsNegatifs: JSON.stringify(["mal_range", "erreur"]),
    },
  })
  const demoZones = [zoneAccueil, zoneSalle, zoneToilettes]
  console.log("🏪 Pizzeria Bella Napoli créée avec 3 zones : Accueil, Salle / Restaurant, Toilettes RDC")

  // ---------- Employés (avec zones de travail) ----------
  const employes: { id: string; nom: string }[] = []
  const employeSeeds = [
    { nom: "Julie Martin", poste: "Serveuse", zoneIds: [zoneAccueil.id, zoneSalle.id] },
    { nom: "Karim Benali", poste: "Pizzaiolo", zoneIds: [zoneSalle.id] },
    { nom: "Sophie Dubois", poste: "Serveuse", zoneIds: [zoneSalle.id] },
    { nom: "Marc Petit", poste: "Manager", zoneIds: [zoneAccueil.id, zoneSalle.id, zoneToilettes.id] },
  ]
  for (const e of employeSeeds) {
    employes.push(
      await db.employe.create({
        data: { proId: demoPro.id, nom: e.nom, poste: e.poste, zoneIds: JSON.stringify(e.zoneIds), actif: true },
      })
    )
  }

  // ---------- Retours sur les 45 derniers jours (répartis par zone) ----------
  let count = 0
  for (let day = 45; day >= 0; day--) {
    const nbDuJour = Math.min(64 - count, randInt(0, 3))
    if (nbDuJour <= 0) continue
    for (let i = 0; i < nbDuJour; i++) {
      count++
      const note = randomNote()
      const zone = count % 7 === 0 ? zoneToilettes : count % 3 === 0 ? zoneAccueil : zoneSalle
      const tags = randomTags(zone, note)
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
          proId: demoPro.id,
          zoneId: zone.id,
          employeId: employe?.id,
          note,
          tags: JSON.stringify(tags),
          commentaire:
            rand() < 0.45 ? (note >= 4 ? pick(COMMENTAIRES_POSITIFS) : pick(COMMENTAIRES_NEGATIFS)) : null,
          personnelMentionne: !avecEmploye && note <= 3 && rand() < 0.4 ? "La fille aux cheveux roux" : null,
          canalChoisi: note >= 4 ? pick(["whatsapp", "whatsapp", "aucun"]) : pick(["whatsapp", "aucun"]),
          statut,
          historique: JSON.stringify([{ statut: "NEW", at: createdAt.toISOString() }]),
          lu,
          actionPrise: statut === "RESOLVED" && note <= 2 && rand() < 0.5 ? "Rappel des standards de service en réunion d'équipe" : null,
          createdAt,
        },
      })

      // Alerte automatique pour les notes ≤ 2
      if (note <= 2) {
        await db.alerte.create({
          data: {
            proId: demoPro.id,
            titre: `🚨 Réclamation ${note}/5 - ${zone.nom}`,
            message: `Un client vient de laisser un retour ${note}/5 sur la zone « ${zone.nom} »${tags.length ? ` (${tags.join(", ")})` : ""}. Intervenez vite !`,
            canal: "SMS",
            lu: day > 3,
            createdAt,
          },
        })
      }
    }
  }
  console.log(`📊 Pizzeria Bella Napoli : ${count} retours sur 3 zones`)

  // ---------- Rapport IA de démonstration (quotidien, hier) ----------
  const periodeFin = new Date()
  periodeFin.setDate(periodeFin.getDate() - 1)
  periodeFin.setHours(23, 59, 0, 0)
  const periodeDebut = new Date(periodeFin)
  periodeDebut.setDate(periodeDebut.getDate() - 1)
  periodeDebut.setHours(0, 0, 0, 0)
  await db.rapportIA.create({
    data: {
      proId: demoPro.id,
      type: "quotidien",
      periodeDebut,
      periodeFin,
      scoreGlobal: 82,
      contenuMarkdown: `# 📋 Rapport d'audit qualité — Pizzeria Bella Napoli\n\n**Score global : 82/100** (période du jour précédent)\n\n## Points forts\n- Accueil jugé « très accueillant » dans 78 % des retours\n- Rapidité de service saluée en salle\n\n## Points de vigilance\n- **Attente trop longue** mentionnée en salle en fin de soirée (19h-21h)\n- Rangement de la zone Toilettes RDC perfectible\n\n## Analyse du Coach IA\nVos clients sont globalement satisfaits, mais la file d'attente du soir dégrade l'expérience des zones Accueil et Salle. Deux retours signalent aussi des discussions entre employés en pleine service.`,
      priorites: JSON.stringify([
        "Réduire l'attente en salle entre 19h et 21h (renfort ou préparation anticipée)",
        "Recadrer bienveillamment les discussions entre employés pendant le service",
        "Mettre en place une checklist de propreté des Toilettes RDC (2 passages/jour)",
      ]),
      recommandations: JSON.stringify([
        "Organiser une session de 15 min sur la carte du jour pour renforcer la connaissance produits",
        "Déplacer Marc Petit en renfort accueil pendant le pic du soir",
      ]),
      predictions: JSON.stringify([
        "Sans action sur l'attente du soir, risque de baisse du score global à ~75/100 sous 2 semaines",
        "La propreté des toilettes impacte directement la note de la zone (moyenne actuelle : 3,2/5)",
      ]),
      envoyeParEmail: true,
    },
  })
  console.log("🤖 Rapport IA de démonstration créé (quotidien, score 82/100)")

  // ---------- Commandes de supports ----------
  const ilYA10j = new Date()
  ilYA10j.setDate(ilYA10j.getDate() - 10)
  await db.commande.create({
    data: {
      proId: demoPro.id,
      zoneId: zoneAccueil.id,
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
  console.log("📦 2 commandes créées pour la démo")

  // ---------- Commerçants supplémentaires (pour le dashboard superadmin) ----------
  const autresPros = [
    {
      email: "contact@salon-elegance.fr",
      nomEtablissement: "Salon Élégance",
      typeEtablissement: "salon",
      adresse: "8 avenue des Champs-Élysées",
      ville: "Paris",
      plan: "STARTER",
      zones: ["Accueil", "Espace coiffure"],
      employes: [
        { nom: "Nadia Lefèvre", poste: "Coiffeuse" },
        { nom: "Emma Rousseau", poste: "Coloriste" },
      ],
      nbRetours: 18,
    },
    {
      email: "bonjour@paindor.fr",
      nomEtablissement: "Boulangerie Pain d'Or",
      typeEtablissement: "boulangerie",
      adresse: "45 cours Julien",
      ville: "Marseille",
      plan: "PRO",
      zones: ["Comptoir", "Salle"],
      employes: [
        { nom: "Pierre Morel", poste: "Boulanger" },
        { nom: "Amina Cherif", poste: "Vendeuse" },
        { nom: "Lucas Girard", poste: "Vendeur" },
      ],
      nbRetours: 31,
    },
    {
      email: "hello@autoplus.fr",
      nomEtablissement: "Garage AutoPlus",
      typeEtablissement: "garage",
      adresse: "3 rue de l'Industrie",
      ville: "Lille",
      plan: "STARTER",
      zones: ["Accueil", "Atelier"],
      employes: [{ nom: "Franck Lambert", poste: "Mécanicien" }],
      nbRetours: 9,
    },
  ]

  for (const ps of autresPros) {
    const user = await db.user.create({
      data: { email: ps.email, passwordHash: passwordPro, role: "PRO" },
    })
    const pro = await db.pro.create({
      data: {
        userId: user.id,
        nomEtablissement: ps.nomEtablissement,
        typeEtablissement: ps.typeEtablissement,
        adresse: ps.adresse,
        ville: ps.ville,
        whatsapp: "33612345678",
        email: ps.email,
        plan: ps.plan,
        frequenceRapport: "hebdomadaire",
        onboardingDone: true,
      },
    })
    const zonesCreees: { id: string; nom: string; tagsPositifs: string; tagsNegatifs: string }[] = []
    for (const nomZone of ps.zones) {
      zonesCreees.push(
        await db.zone.create({
          data: {
            proId: pro.id,
            nom: nomZone,
            tagsPositifs: JSON.stringify(["accueillant", "rapide", "competent", "pro"]),
            tagsNegatifs: JSON.stringify(["impoli", "mal_renseigne", "attente", "distrait", "mal_range", "erreur"]),
          },
        })
      )
    }
    const emps: { id: string }[] = []
    for (const e of ps.employes) {
      emps.push(
        await db.employe.create({
          data: { proId: pro.id, nom: e.nom, poste: e.poste, zoneIds: JSON.stringify([zonesCreees[0].id]), actif: true },
        })
      )
    }
    let c2 = 0
    for (let day = 30; day >= 0; day--) {
      const nbDuJour = Math.min(ps.nbRetours - c2, randInt(0, 2))
      if (nbDuJour <= 0) continue
      for (let i = 0; i < nbDuJour; i++) {
        c2++
        const note = randomNote()
        const zone = pick(zonesCreees)
        const tags = randomTags(zone, note)
        const createdAt = new Date()
        createdAt.setDate(createdAt.getDate() - day)
        createdAt.setHours(randInt(8, 20), randInt(0, 59), 0, 0)
        const avecEmploye = rand() < 0.6
        await db.retour.create({
          data: {
            proId: pro.id,
            zoneId: zone.id,
            employeId: avecEmploye ? pick(emps).id : null,
            note,
            tags: JSON.stringify(tags),
            commentaire: rand() < 0.4 ? (note >= 4 ? pick(COMMENTAIRES_POSITIFS) : pick(COMMENTAIRES_NEGATIFS)) : null,
            canalChoisi: note >= 4 ? pick(["whatsapp", "aucun"]) : pick(["whatsapp", "aucun"]),
            statut: day > 7 && note <= 2 ? "RESOLVED" : "NEW",
            historique: JSON.stringify([{ statut: "NEW", at: createdAt.toISOString() }]),
            lu: day > 7,
            createdAt,
          },
        })
        if (note <= 2) {
          await db.alerte.create({
            data: {
              proId: pro.id,
              titre: `🚨 Réclamation ${note}/5 - ${zone.nom}`,
              message: `Un client vient de laisser un retour ${note}/5 sur la zone « ${zone.nom} ».`,
              canal: "SMS",
              lu: day > 3,
              createdAt,
            },
          })
        }
      }
    }
    console.log(`🏪 ${ps.nomEtablissement} créé (${ps.plan}) - ${c2} retours, ${ps.zones.length} zones`)
  }

  // ---------- Réglages plateforme par défaut ----------
  await db.setting.createMany({
    data: [
      { key: "nomPlateforme", value: "FeedbackPro" },
      { key: "emailSupport", value: "support@feedbackpro.fr" },
      { key: "delaiImpression", value: "72" },
    ],
  })

  const totalRetours = await db.retour.count()
  const totalZones = await db.zone.count()
  console.log(`✅ Seed terminé : ${totalRetours} retours, ${totalZones} zones au total.`)
  console.log("   Superadmin : admin@feedbackpro.fr / admin123")
  console.log("   Démo Pro   : demo@pizzeria.fr / demo1234 (3 zones : Accueil, Salle / Restaurant, Toilettes RDC)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
