// ============================================================
// FeedbackPro - Seed du questionnaire adaptatif (Task 2)
// ------------------------------------------------------------
// Injecte la QUESTIONNAIRE_CONFIG (5 macro-secteurs × 3 scénarios
// CRISE/MITIGE/SUCCES) dans le champ SecteurConfig.questionnaireConfig
// (JSON) pour les secteurs BDD correspondants.
//
// Mapping macro-secteur → secteurs BDD (cf. secteurs-v2.ts) :
//   - RESTAURATION       → Restaurant, Fast Food, Café / Bar, Boulangerie / Pâtisserie
//   - HOTELLERIE         → Hôtel
//   - TRANSPORT          → Aéroport, Gare / Station
//   - SANTE              → Hôpital / Clinique
//   - ADMINISTRATION     → Mairie / Administration, Entreprise (accueil public)
//
// Les secteurs "génériques" (Boutique, Salon, Institut, Garage, Autre)
// ne sont PAS dans le mapping : ils héritent du fallback hardcoded
// (getQuestionnaireConfigFromDb → QUESTIONNAIRE_CONFIG[0] = RESTAURATION).
//
// Idempotent : ne fait qu'updater le champ questionnaireConfig (sans
// toucher aux autres champs). Ré-exécuter après édition manuelle de la
// BDD réapplique la config hardcoded par défaut.
//
// Exécution : DATABASE_URL=file:/home/z/feedbackpro/db/feedbackpro.db bun prisma/seed-questionnaire.ts
// ============================================================

import { PrismaClient } from "@prisma/client"
import { QUESTIONNAIRE_CONFIG, type Secteur } from "../src/lib/questionnaire-config"
import { MACRO_SECTEUR_VERS_SECTEURS_BDD, type MacroSecteurId } from "../src/lib/secteurs-v2"

const db = new PrismaClient()

/** Map un MacroSecteurId (secteurs-v2.ts) vers un Secteur (questionnaire-config.ts). */
function macroVersSecteurQuestionnaire(macro: MacroSecteurId): Secteur | null {
  switch (macro) {
    case "RESTAURATION":
      return "RESTAURATION"
    case "HOTELLERIE":
      return "HOTELLERIE"
    case "TRANSPORT_AEROPORT_GARE":
      return "TRANSPORT"
    case "SANTE_HOPITAL_CLINIQUE":
      return "SANTE"
    case "ADMINISTRATION_ERP_PUBLIC":
      return "ADMINISTRATION"
    default:
      return null
  }
}

async function main() {
  console.log("🌱 Seed questionnaire adaptatif (Task 2) : démarrage")

  let totalMisesAJour = 0
  let totalSautées = 0

  for (const [macroId, secteursBdd] of Object.entries(MACRO_SECTEUR_VERS_SECTEURS_BDD)) {
    const macro = macroId as MacroSecteurId
    const secteur = macroVersSecteurQuestionnaire(macro)
    if (!secteur) {
      console.warn(`  ⚠️ Macro ${macro} non mappé vers un Secteur questionnaire — ignoré`)
      continue
    }

    // Récupère la config hardcoded pour ce macro-secteur
    const config = QUESTIONNAIRE_CONFIG.find((c) => c.secteur === secteur)
    if (!config) {
      console.warn(`  ⚠️ Config hardcoded non trouvée pour ${secteur} — ignoré`)
      continue
    }

    const jsonConfig = JSON.stringify(config)

    for (const nomSecteurBdd of secteursBdd) {
      const existe = await db.secteurConfig.findUnique({ where: { nom: nomSecteurBdd } })
      if (!existe) {
        console.warn(`  ⚠️ Secteur "${nomSecteurBdd}" introuvable en BDD — ignoré`)
        totalSautées++
        continue
      }
      await db.secteurConfig.update({
        where: { nom: nomSecteurBdd },
        data: { questionnaireConfig: jsonConfig },
      })
      console.log(
        `  ✓ ${nomSecteurBdd.padEnd(35)} ← ${secteur} (${config.scenarios.length} scénarios, ${config.scenarios.reduce(
          (s, sc) => s + sc.questions.length,
          0
        )} questions)`
      )
      totalMisesAJour++
    }
  }

  console.log(
    `→ Seed questionnaire : ${totalMisesAJour} secteurs mis à jour, ${totalSautées} sautés (introuvables).`
  )
  console.log(`→ Les secteurs "génériques" (Boutique, Salon, Institut, Garage, Autre) conservent le fallback hardcoded.`)
}

main()
  .catch((e) => {
    console.error("Erreur seed questionnaire :", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
