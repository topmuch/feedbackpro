// ============================================================
// Seed de démonstration local — Pro "Aéroport / Salon VIP"
// + zones rubriques (Salon VIP, Buffet/Bar, Détente, Douches,
//   Réception, Réunions) + signalements de test pour le wallboard.
// Usage : bun run scripts/seed-demo-v3.ts
// ============================================================
import crypto from "crypto"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

const RUBRIQUES: Array<{ nom: string; emoji: string }> = [
  { nom: "Salon VIP / Lounge", emoji: "🥂" },
  { nom: "Buffet / Bar", emoji: "🍸" },
  { nom: "Espace Détente", emoji: "🧘" },
  { nom: "Douches / Toilettes privées", emoji: "🚿" },
  { nom: "Réception / Conciergerie", emoji: "🛎️" },
  { nom: "Salles de Réunion privées", emoji: "💼" },
]

const ZONES_AIRPORT = [
  { code: "com_lounge", nom: "Salon VIP / Lounge", emoji: "🥂", tags: ["com_lounge_1", "com_lounge_t1"], problemes: ["Accès refusé (bug système)", "Surpeuplé", "Nourriture froide", "Wi-Fi inaccessible"] },
  { code: "vip_buffet", nom: "Buffet / Bar", emoji: "🍸", tags: ["vip_buffet_1", "vip_bar_1"], problemes: ["Nourriture épuisée", "Boissons chaudes indisponibles", "Propreté insuffisante du buffet", "Service lent"] },
  { code: "term_bagages", nom: "Livraison des Bagages", emoji: "🧳", tags: ["term_bagages_1", "term_bagages_tapis_a"], problemes: ["Tapis arrêté", "Valise abîmée", "Attente > 30 min", "Chariot HS"] },
  { code: "term_sanitaires", nom: "Sanitaires Publics", emoji: "🚻", tags: ["term_sanitaires_1", "term_wc_hall_1"], problemes: ["Papier manquant", "Sol mouillé ou sale", "Chasse d'eau HS", "Odeur"] },
  { code: "vip_reception", nom: "Réception / Conciergerie", emoji: "🛎️", tags: ["vip_reception_1"], problemes: ["Attente à l'accueil", "Personnel indisponible", "Réservation non trouvée", "Demande spécifique non honorée"] },
  { code: "vip_showers", nom: "Douches / Toilettes privées", emoji: "🚿", tags: ["vip_showers_1"], problemes: ["Toutes les cabines occupées", "Serviettes indisponibles", "Propreté insuffisante", "Eau chaude HS"] },
]

async function main() {
  // --- 1. Utilisateur Pro de démo ---
  const user = await db.user.upsert({
    where: { email: "demo@pizzeria.fr" },
    create: { email: "demo@pizzeria.fr", passwordHash: hashPassword("demo1234"), role: "PRO" },
    update: { passwordHash: hashPassword("demo1234"), role: "PRO" },
  })

  const pro = await db.pro.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      nomEtablissement: "Salon VIP DIASS — Lounge Premium",
      typeEtablissement: "Aéroport",
      plan: "PRO",
      onboardingDone: true,
    },
    update: { nomEtablissement: "Salon VIP DIASS — Lounge Premium", typeEtablissement: "Aéroport" },
  })

  // --- 2. Zones Pro (onglet QR Codes) — les rubriques VIP ---
  for (const r of RUBRIQUES) {
    const existing = await db.zone.findFirst({ where: { proId: pro.id, nom: r.nom } })
    if (!existing) {
      await db.zone.create({
        data: {
          proId: pro.id,
          nom: r.nom,
          description: `Rubrique ${r.nom} du salon`,
          qrToken: `tok_${r.nom.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 18)}_${Math.random().toString(36).slice(2, 8)}`,
          tagsPositifs: JSON.stringify([]),
          tagsNegatifs: JSON.stringify([]),
        },
      })
    }
  }
  console.log(`✓ Pro + ${RUBRIQUES.length} zones rubriques`)

  // --- 1b. Second compte démo type RESTAURANT (montre l'onglet « QR Codes »
  //         classique) avec les MÊMES rubriques → test des plaques Nathalie.
  const userQr = await db.user.upsert({
    where: { email: "qr@pizzeria.fr" },
    create: { email: "qr@pizzeria.fr", passwordHash: hashPassword("demo1234"), role: "PRO" },
    update: { passwordHash: hashPassword("demo1234"), role: "PRO" },
  })
  const proQr = await db.pro.upsert({
    where: { userId: userQr.id },
    create: {
      userId: userQr.id,
      nomEtablissement: "Salon VIP DIASS — Lounge Premium",
      typeEtablissement: "restaurant",
      plan: "PRO",
      onboardingDone: true,
    },
    update: { nomEtablissement: "Salon VIP DIASS — Lounge Premium", typeEtablissement: "restaurant" },
  })
  for (const r of RUBRIQUES) {
    const existing = await db.zone.findFirst({ where: { proId: proQr.id, nom: r.nom } })
    if (!existing) {
      await db.zone.create({
        data: {
          proId: proQr.id,
          nom: r.nom,
          description: `Rubrique ${r.nom} du salon`,
          qrToken: `tokqr_${r.nom.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 18)}_${Math.random().toString(36).slice(2, 8)}`,
          tagsPositifs: JSON.stringify([]),
          tagsNegatifs: JSON.stringify([]),
        },
      })
    }
  }
  console.log(`✓ Pro restaurant (qr@) + ${RUBRIQUES.length} zones`)

  // --- 3. Zones aéroport (DB) pour signalements/wallboard ---
  for (const z of ZONES_AIRPORT) {
    await db.airportZone.upsert({
      where: { code: z.code },
      create: {
        code: z.code,
        nom: z.nom,
        emoji: z.emoji,
        tags: JSON.stringify(z.tags),
        problemes: JSON.stringify(z.problemes),
      },
      update: { nom: z.nom, emoji: z.emoji, tags: JSON.stringify(z.tags), problemes: JSON.stringify(z.problemes) },
    })
  }
  console.log(`✓ ${ZONES_AIRPORT.length} zones aéroport`)

  // --- 4. Signalements de test ---
  const now = Date.now()
  const lounge = await db.airportZone.findUnique({ where: { code: "com_lounge" } })
  const bag = await db.airportZone.findUnique({ where: { code: "term_bagages" } })
  const san = await db.airportZone.findUnique({ where: { code: "term_sanitaires" } })
  const buffet = await db.airportZone.findUnique({ where: { code: "vip_buffet" } })
  if (!lounge || !bag || !san || !buffet) throw new Error("zones manquantes")

  // Purge des anciens signalements de démo
  await db.airportReport.deleteMany({ where: { tagScanne: { startsWith: "demo_v3" } } })

  await db.airportReport.create({
    data: {
      zoneId: lounge.id,
      tagScanne: "demo_v3_lounge_1",
      problemType: "Wi-Fi inaccessible",
      statut: "EN_ATTENTE",
      commentaire: "Le Wi-Fi VIP ne fonctionne pas depuis 30 minutes.",
      createdAt: new Date(now - 6 * 60_000),
    },
  })
  await db.airportReport.create({
    data: {
      zoneId: bag.id,
      tagScanne: "demo_v3_bagages_1",
      problemType: "Tapis arrêté",
      statut: "EN_ATTENTE",
      routedTeam: "maintenance",
      commentaire: "Tapis 3 bloqué, valises accumulées.",
      createdAt: new Date(now - 22 * 60_000), // > 15 min → rappel EN RETARD
    },
  })
  await db.airportReport.create({
    data: {
      zoneId: san.id,
      tagScanne: "demo_v3_sanitaires_1",
      problemType: "Sol mouillé ou sale",
      statut: "EN_COURS",
      routedTeam: "nettoyage",
      createdAt: new Date(now - 40 * 60_000),
    },
  })
  await db.airportReport.create({
    data: {
      zoneId: buffet.id,
      tagScanne: "demo_v3_buffet_1",
      problemType: "Service lent",
      statut: "RESOLU",
      createdAt: new Date(now - 90 * 60_000),
      resolvedAt: new Date(now - 80 * 60_000),
    },
  })
  console.log("✓ 4 signalements (1 récent EN_ATTENTE, 1 en retard >15min, 1 EN_COURS, 1 RESOLU)")

  // --- 5. SOS voyageur ---
  await db.airportHelpRequest.deleteMany({ where: { tagScanne: "demo_v3_sos_1" } })
  await db.airportHelpRequest.create({
    data: {
      zoneCode: "com_lounge",
      tagScanne: "demo_v3_sos_1",
      message: "Bagage oublié sur le banc du lounge",
      travelerPhone: "+221770000000",
      statut: "EN_ATTENTE",
      createdAt: new Date(now - 3 * 60_000),
    },
  })
  console.log("✓ 1 SOS voyageur EN_ATTENTE")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
