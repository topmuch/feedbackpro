// ============================================================
// FeedbackPro - Seed des fiches SecteurConfig (Task M1)
// ------------------------------------------------------------
// Alimente la table SecteurConfig avec les 15 secteurs présents
// dans src/lib/secteurs.ts (SECTEUR_CONFIG), en les enrichissant
// des champs nouveaux :
//   - zonesDefaut       : [{ nom, tagsPos, tagsNeg }]
//   - tagsGlobaux       : string[] (tags communs à toutes les zones)
//   - kpisSpeciaux      : [{ id, label, target, unit }] (ex : « temps
//                          d'attente » pour un aéroport, « délai de
//                          prise en charge » pour un hôpital)
//   - languesSupportees : string[] (codes ISO — FR par défaut, EN pour
//                          les secteurs touristiques : hôtel, aéroport…)
//   - reglesSecurite    : { photosInterdites, zonesSensibles[] }
//
// Idempotent : upsert sur le `nom` unique. Ré-exécuter met juste à
// jour les fiches (sans toucher aux Pros qui y sont rattachés).
//
// Exécution : bun prisma/seed-secteurs.ts
// (DATABASE_URL est lu depuis .env automatiquement par Prisma)
// ============================================================

import { PrismaClient } from "@prisma/client"
import { SECTEUR_CONFIG } from "../src/lib/secteurs"

const db = new PrismaClient()

// ---------- KPIs spéciaux par secteur (au-delà du score global) ----------
// Chaque entrée : { id, label (libellé affiché), target (valeur cible), unit }
type KpiSpec = { id: string; label: string; target: number; unit: string }

const KPIS_PAR_SECTEUR: Record<string, KpiSpec[]> = {
  Restaurant: [{ id: "tps_service", label: "Temps de service moyen", target: 15, unit: "min" }],
  "Fast Food": [{ id: "tps_retrait", label: "Temps de retrait", target: 5, unit: "min" }],
  Hôtel: [
    { id: "checkin", label: "Temps de check-in", target: 5, unit: "min" },
    { id: "proprete_chambre", label: "Score propreté chambre", target: 95, unit: "%" },
  ],
  "Café / Bar": [{ id: "tps_commande", label: "Temps d'attente au comptoir", target: 4, unit: "min" }],
  "Boulangerie / Pâtisserie": [{ id: "tps_file", label: "Temps en file", target: 5, unit: "min" }],
  "Boutique / Commerce": [{ id: "dispo_conseiller", label: "Disponibilité conseiller", target: 90, unit: "%" }],
  "Salon de coiffure": [{ id: "tps_attente", label: "Attente vs RDV", target: 5, unit: "min" }],
  "Institut de beauté / Spa": [{ id: "ambiance", label: "Score ambiance", target: 95, unit: "%" }],
  "Garage automobile": [{ id: "estimation", label: "Estimation honnête", target: 90, unit: "%" }],
  "Hôpital / Clinique": [
    { id: "accueil_patient", label: "Accueil patient", target: 90, unit: "%" },
    { id: "delai_prise_en_charge", label: "Délai prise en charge", target: 30, unit: "min" },
  ],
  Aéroport: [
    { id: "checkin_fluidite", label: "Fluidité check-in", target: 95, unit: "%" },
    { id: "tps_securite", label: "Temps file sécurité", target: 10, unit: "min" },
  ],
  "Gare / Station": [
    { id: "info_voyageur", label: "Info voyageur", target: 90, unit: "%" },
    { id: "proprete_quai", label: "Propreté quais", target: 95, unit: "%" },
  ],
  "Entreprise (accueil public)": [{ id: "accueil_visiteur", label: "Accueil visiteur", target: 95, unit: "%" }],
  "Mairie / Administration": [
    { id: "tps_guichet", label: "Temps au guichet", target: 10, unit: "min" },
    { id: "clarte_demarche", label: "Clarté démarche", target: 90, unit: "%" },
  ],
  Autre: [],
}

// ---------- Langues supportées par secteur ----------
const LANGUES_PAR_SECTEUR: Record<string, string[]> = {
  Hôtel: ["fr", "en"],
  Aéroport: ["fr", "en", "es"],
  "Gare / Station": ["fr", "en"],
  "Hôpital / Clinique": ["fr", "en"],
  "Entreprise (accueil public)": ["fr", "en"],
  "Mairie / Administration": ["fr", "en"],
  Restaurant: ["fr"],
  "Fast Food": ["fr"],
  "Café / Bar": ["fr"],
  "Boulangerie / Pâtisserie": ["fr"],
  "Boutique / Commerce": ["fr"],
  "Salon de coiffure": ["fr"],
  "Institut de beauté / Spa": ["fr"],
  "Garage automobile": ["fr"],
  Autre: ["fr"],
}

// ---------- Règles de sécurité / conformité par secteur ----------
type RegleSecurite = { photosInterdites: boolean; zonesSensibles: string[] }

const REGLES_PAR_SECTEUR: Record<string, RegleSecurite> = {
  "Hôpital / Clinique": {
    photosInterdites: true,
    zonesSensibles: ["Bloc opératoire", "Soins intensifs", "Chambres des patients", "Salles d'examen"],
  },
  Aéroport: {
    photosInterdites: true,
    zonesSensibles: ["Contrôle de sécurité", "Zone d'embarquement restreinte", "Bagages", "Douane"],
  },
  "Gare / Station": {
    photosInterdites: false,
    zonesSensibles: ["Voies ferrées", "Salles de contrôle"],
  },
  Hôtel: {
    photosInterdites: false,
    zonesSensibles: ["Chambres occupées", "Espaces privés du personnel"],
  },
  "Mairie / Administration": {
    photosInterdites: false,
    zonesSensibles: ["Bureau des états civils", "Salles de délibération"],
  },
  "Entreprise (accueil public)": {
    photosInterdites: false,
    zonesSensibles: ["Bureaux privés", "Salles de réunion"],
  },
  Restaurant: {
    photosInterdites: false,
    zonesSensibles: ["Cuisine", "Réserve"],
  },
  "Fast Food": {
    photosInterdites: false,
    zonesSensibles: ["Cuisine", "Réserve"],
  },
  "Café / Bar": {
    photosInterdites: false,
    zonesSensibles: ["Cuisine", "Réserve", "Cave"],
  },
  "Boulangerie / Pâtisserie": {
    photosInterdites: false,
    zonesSensibles: ["Laboratoire", "Réserve"],
  },
  "Boutique / Commerce": {
    photosInterdites: false,
    zonesSensibles: ["Réserve", "Caisse"],
  },
  "Salon de coiffure": {
    photosInterdites: false,
    zonesSensibles: ["Réserve", "Espace du personnel"],
  },
  "Institut de beauté / Spa": {
    photosInterdites: true,
    zonesSensibles: ["Cabines de soin", "Vestiaires"],
  },
  "Garage automobile": {
    photosInterdites: false,
    zonesSensibles: ["Atelier", "Zone de levage"],
  },
  Autre: {
    photosInterdites: false,
    zonesSensibles: [],
  },
}

// ---------- Tags globaux par secteur (communs à toutes les zones) ----------
const TAGS_GLOBAUX_PAR_SECTEUR: Record<string, string[]> = {
  Restaurant: ["accueillant", "pro"],
  "Fast Food": ["rapide", "pro"],
  Hôtel: ["accueillant", "competent", "propre"],
  "Café / Bar": ["accueillant", "rapide"],
  "Boulangerie / Pâtisserie": ["rapide", "competent"],
  "Boutique / Commerce": ["accueillant", "competent"],
  "Salon de coiffure": ["competent", "pro"],
  "Institut de beauté / Spa": ["accueillant", "propre", "competent"],
  "Garage automobile": ["competent", "pro", "rapide"],
  "Hôpital / Clinique": ["accueillant", "propre", "competent"],
  Aéroport: ["rapide", "competent", "propre"],
  "Gare / Station": ["propre", "rapide", "competent"],
  "Entreprise (accueil public)": ["accueillant", "competent", "pro"],
  "Mairie / Administration": ["competent", "accueillant", "pro"],
  Autre: ["accueillant", "competent", "pro"],
}

async function main() {
  console.log("→ Seed SecteurConfig : démarrage")
  const secteurs = Object.entries(SECTEUR_CONFIG)

  for (const [nom, config] of secteurs) {
    // Construit le JSON zonesDefaut attendu : [{ nom, tagsPos, tagsNeg }]
    const zonesDefaut = config.zonesParDefaut.map((nomZone) => ({
      nom: nomZone,
      tagsPos: config.tagsPositifs,
      tagsNeg: config.tagsNegatifs,
    }))

    const tagsGlobaux = TAGS_GLOBAUX_PAR_SECTEUR[nom] ?? []
    const kpisSpeciaux = KPIS_PAR_SECTEUR[nom] ?? []
    const languesSupportees = LANGUES_PAR_SECTEUR[nom] ?? ["fr"]
    const reglesSecurite = REGLES_PAR_SECTEUR[nom] ?? { photosInterdites: false, zonesSensibles: [] }

    const enregistrement = await db.secteurConfig.upsert({
      where: { nom },
      create: {
        nom,
        zonesDefaut: JSON.stringify(zonesDefaut),
        tagsGlobaux: JSON.stringify(tagsGlobaux),
        kpisSpeciaux: JSON.stringify(kpisSpeciaux),
        languesSupportees: JSON.stringify(languesSupportees),
        reglesSecurite: JSON.stringify(reglesSecurite),
        emoji: config.emoji,
        description: config.description,
      },
      update: {
        zonesDefaut: JSON.stringify(zonesDefaut),
        tagsGlobaux: JSON.stringify(tagsGlobaux),
        kpisSpeciaux: JSON.stringify(kpisSpeciaux),
        languesSupportees: JSON.stringify(languesSupportees),
        reglesSecurite: JSON.stringify(reglesSecurite),
        emoji: config.emoji,
        description: config.description,
      },
    })

    console.log(`  ✓ ${nom.padEnd(35)} (${enregistrement.id})`)
  }

  console.log(`→ Seed SecteurConfig : ${secteurs.length} secteurs synchronisés`)
}

main()
  .catch((e) => {
    console.error("Erreur lors du seed SecteurConfig", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
