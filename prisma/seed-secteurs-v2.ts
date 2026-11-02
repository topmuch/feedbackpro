// ============================================================
// FeedbackPro - Seed v2 des fiches SecteurConfig
// ------------------------------------------------------------
// Alimente la table SecteurConfig avec la base de vérité v2 :
// 5 macro-secteurs (RESTAURATION, HOTELLERIE, TRANSPORT_AEROPORT_GARE,
// SANTE_HOPITAL_CLINIQUE, ADMINISTRATION_ERP_PUBLIC) mappés vers les
// 15 fiches existantes.
//
// Pour chaque secteur :
//   - piliers       : JSON string[] (4 axes d'audit du macro-secteur,
//                     ou piliers génériques pour les secteurs non couverts)
//   - tagsEmployes  : JSON { positifs: [...], negatifs: [...] } (filtrés
//                     par contexte du macro-secteur, ou "TOUS" pour
//                     les secteurs non couverts)
//   - zonesDefaut   : [{ nom, tagsPos, tagsNeg }] — on garde les zones
//                     existantes mais on REMPLACE les tagsPos/tagsNeg par
//                     les 4 tags sectoriels (couvrant les 4 piliers) du
//                     macro-secteur. Pour les secteurs non couverts, on
//                     conserve les tags actuels (issus du seed v1).
//   - tagsGlobaux   : inchangé (gardé du seed v1)
//
// Idempotent : upsert sur `nom` unique. Ré-exécuter met juste à jour
// les fiches (sans toucher aux Pros qui y sont rattachés).
//
// Exécution : bun prisma/seed-secteurs-v2.ts
// (DATABASE_URL est lu depuis .env automatiquement par Prisma)
// ============================================================

import { PrismaClient } from "@prisma/client"
import { SECTEUR_CONFIG } from "../src/lib/secteurs"
import {
  MACRO_SECTEURS,
  MACRO_SECTEUR_VERS_SECTEURS_BDD,
  PILIERS_GENERIQUES,
  TAGS_EMPLOYES_TRANSVERSAUX,
  macroSecteurPourSecteur,
  tagsEmployesPourMacro,
  type MacroSecteurId,
  type TagsEmployesTransversaux,
} from "../src/lib/secteurs-v2"

const db = new PrismaClient()

/** Détecte si un secteur BDD est couvert par un macro-secteur v2. */
function macroPourSecteur(nom: string): MacroSecteurId | null {
  return macroSecteurPourSecteur(nom)?.nom ?? null
}

/**
 * Construit le JSON `zonesDefaut` pour un secteur BDD donné :
 *   - Si le secteur est couvert par un macro-secteur v2 : on garde les
 *     noms de zones existants (SECTEUR_CONFIG), mais on remplace les
 *     tagsPos/tagsNeg par les 4 tags sectoriels positifs/négatifs du
 *     macro (couvrant les 4 piliers).
 *   - Sinon (Boutique, Salon, Institut, Garage, Autre) : on conserve
 *     les tagsPos/tagsNeg actuels (issus du seed v1) — ces secteurs
 *     restent sur l'ancien catalogue de tags génériques.
 */
function construireZonesDefaut(nomSecteur: string) {
  const config = SECTEUR_CONFIG[nomSecteur] ?? SECTEUR_CONFIG.Autre
  const macro = macroSecteurPourSecteur(nomSecteur)
  if (!macro) {
    return config.zonesParDefaut.map((nomZone) => ({
      nom: nomZone,
      tagsPos: config.tagsPositifs,
      tagsNeg: config.tagsNegatifs,
    }))
  }
  const tagsPos = macro.tagsPositifs.map((t) => t.id)
  const tagsNeg = macro.tagsNegatifs.map((t) => t.id)
  return config.zonesParDefaut.map((nomZone) => ({
    nom: nomZone,
    tagsPos,
    tagsNeg,
  }))
}

/**
 * Construit le JSON `tagsEmployes` filtré par contexte du macro-secteur.
 * Pour les secteurs non couverts, on ne renvoie QUE les tags "TOUS"
 * (un sous-ensemble strict de TAGS_EMPLOYES_TRANSVERSAUX).
 */
function construireTagsEmployes(nomSecteur: string): TagsEmployesTransversaux {
  const macroId = macroPourSecteur(nomSecteur)
  return tagsEmployesPourMacro(macroId)
}

async function main() {
  console.log("→ Seed SecteurConfig v2 : démarrage")
  console.log(
    "  Macro-secteurs : " +
      MACRO_SECTEURS.map((m) => `${m.nom}(${MACRO_SECTEUR_VERS_SECTEURS_BDD[m.nom].length} secteurs)`).join(", ")
  )

  // Pour CHAQUE secteur BDD existant (15 au total), on upsert avec la
  // nouvelle config (piliers + tagsEmployes). Les secteurs non couverts
  // par la base v2 reçoivent des piliers génériques + tags "TOUS".
  const tousLesSecteurs = Object.keys(SECTEUR_CONFIG)

  for (const nom of tousLesSecteurs) {
    const macro = macroSecteurPourSecteur(nom)
    const piliers = macro?.piliers ?? PILIERS_GENERIQUES
    const tagsEmployes = construireTagsEmployes(nom)
    const zonesDefaut = construireZonesDefaut(nom)
    const config = SECTEUR_CONFIG[nom] ?? SECTEUR_CONFIG.Autre

    const enregistrement = await db.secteurConfig.upsert({
      where: { nom },
      create: {
        nom,
        zonesDefaut: JSON.stringify(zonesDefaut),
        tagsGlobaux: JSON.stringify(
          // Pour les secteurs couverts, les tags "globaux" sont
          // simplement les IDs des 4 tags sectoriels positifs (utiles
          // pour les agrégations/stats). Pour les autres, on garde les
          // tags du seed v1.
          macro ? macro.tagsPositifs.map((t) => t.id) : []
        ),
        kpisSpeciaux: JSON.stringify([]),
        languesSupportees: JSON.stringify(["fr"]),
        reglesSecurite: JSON.stringify({ photosInterdites: false, zonesSensibles: [] }),
        piliers: JSON.stringify(piliers),
        tagsEmployes: JSON.stringify(tagsEmployes),
        emoji: config.emoji,
        description: config.description,
      },
      update: {
        // On NE touche PAS aux champs existants (zonesDefaut, tagsGlobaux,
        // kpisSpeciaux, languesSupportees, reglesSecurite, emoji, description)
        // si la fiche existe déjà — le seed v1 les a déjà déposés avec une
        // richesse sectorielle (KPIs par secteur, langues touristiques,
        // règles de sécurité hôpital/aéroport…) qu'on veut PRÉSERVER.
        //
        // On NE met à jour QUE :
        //   - zonesDefaut (remplacement des tags par les IDs v2)
        //   - piliers (nouveau)
        //   - tagsEmployes (nouveau)
        // Pour les secteurs non couverts par la v2, zonesDefaut reste
        // identique au seed v1 (tags génériques).
        zonesDefaut: JSON.stringify(zonesDefaut),
        piliers: JSON.stringify(piliers),
        tagsEmployes: JSON.stringify(tagsEmployes),
      },
    })

    const macroLabel = macro ? macro.nom : "générique"
    console.log(
      `  ✓ ${nom.padEnd(35)} macro=${macroLabel.padEnd(28)} ` +
        `piliers=${piliers.length} tagsEmployes=+${tagsEmployes.positifs.length}/-${tagsEmployes.negatifs.length} ` +
        `(${enregistrement.id})`
    )
  }

  // Stats finales
  const total = tousLesSecteurs.length
  const couverts = tousLesSecteurs.filter((s) => macroPourSecteur(s) !== null).length
  console.log(
    `→ Seed SecteurConfig v2 : ${total} secteurs synchronisés ` +
      `(${couverts} couverts par un macro-secteur, ${total - couverts} génériques)`
  )
  console.log(
    `→ Tags employés transversaux disponibles : ${TAGS_EMPLOYES_TRANSVERSAUX.positifs.length} positifs, ` +
      `${TAGS_EMPLOYES_TRANSVERSAUX.negatifs.length} négatifs`
  )
}

main()
  .catch((e) => {
    console.error("Erreur lors du seed SecteurConfig v2", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
