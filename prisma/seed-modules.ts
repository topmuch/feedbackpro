// ============================================================
// FeedbackPro - Seed des 7 modules activables
// ------------------------------------------------------------
// Exécution : bun prisma/seed-modules.ts
//
// Crée les 7 modules (ou met à jour leur nom/description si
// déjà présents en base — `actif` est préservé pour ne pas
// écraser un toggle du superadmin).
//
// État par défaut :
//   - alertes_temps_reel     ACTIF
//   - double_shield          ACTIF
//   - webhooks_sortants      ACTIF
//   - les 4 autres           INACTIFS
// ============================================================

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

type ModuleSeed = {
  key: string
  nom: string
  description: string
  actifParDefaut: boolean
  config: Record<string, unknown>
}

const MODULES: ModuleSeed[] = [
  {
    key: "alertes_temps_reel",
    nom: "Alertes temps réel",
    description:
      "Quand un client laisse une note ≤ 2★, le manager reçoit une notification immédiate (cloche + alerte dashboard + webhook + SMS Twilio si configuré).",
    actifParDefaut: true,
    config: {
      // Numéro de téléphone Twilio (E.164) qui recevra les SMS d'alerte
      // négative. Optionnel — si vide, le SMS va au whatsapp du Pro.
      phone: "",
    },
  },
  {
    key: "voice_to_text",
    nom: "Avis par note vocale (Voice-to-Text)",
    description:
      "Ajoute un bouton « 🎤 Parler » sur la page de scan : le client dicte son commentaire, transcrit en temps réel via l'API Web Speech native du navigateur.",
    actifParDefaut: false,
    config: {},
  },
  {
    key: "abonnement_multi_sites",
    nom: "Abonnement Multi-Sites / Franchises",
    description:
      "Débloque le plan Franchise (199 €/mois pour 5 établissements, 399 € pour 10, 799 € pour 25+) avec comparaison cross-sites, API et account manager dédié.",
    actifParDefaut: false,
    config: {
      paliers: [
        { etablissements: 5, prix: 199 },
        { etablissements: 10, prix: 399 },
        { etablissements: 25, prix: 799 },
      ],
    },
  },
  {
    key: "loterie",
    nom: "Loterie instantanée (Scratch & Win)",
    description:
      "Après validation de l'avis, un ticket à gratter digital apparaît. Le client découvre s'il a gagné une récompense (café, réduction, bon d'achat). Taux de gain configurable.",
    actifParDefaut: false,
    config: {
      // Probabilité de gain (0-100). 30 % par défaut.
      tauxGain: 30,
      // Liste des gains possibles (tirés au sort si le client gagne)
      gains: [
        "☕ Café offert",
        " dessert offert",
        "10 % de réduction",
        "Bon d'achat 5 €",
      ],
    },
  },
  {
    key: "smart_qr",
    nom: "Smart QR Code contextuel",
    description:
      "Le QR code est le même mais les questions et la phrase d'accroche s'adaptent selon l'heure du scan (matin, déjeuner, après-midi, soir, nuit).",
    actifParDefaut: false,
    config: {},
  },
  {
    key: "double_shield",
    nom: "Double Shield (redirection d'avis)",
    description:
      "Note 4-5★ → bouton proéminent « Laissez un avis Google en 1 clic » avec texte pré-rempli. Note 1-3★ → message rassurant « Votre retour est privé et confidentiel ».",
    actifParDefaut: true,
    config: {},
  },
  {
    key: "webhooks_sortants",
    nom: "Webhooks sortants (Slack / Discord)",
    description:
      "Envoie un webhook Slack/Discord à chaque nouveau retour (négatif ≤ 2★ ou tous) et quand un rapport IA est disponible. Désactivé → notifierWebhooksPro devient no-op.",
    actifParDefaut: true,
    config: {},
  },
]

async function main() {
  console.log("🧩 Seed des modules activables...")
  for (const m of MODULES) {
    const existing = await db.module.findUnique({ where: { key: m.key } })
    if (existing) {
      // On met à jour le nom + description + config (par défaut) sans
      // toucher à `actif` (le superadmin a pu le toggler).
      await db.module.update({
        where: { key: m.key },
        data: {
          nom: m.nom,
          description: m.description,
          // On ne réécrit la config que si elle est vide (première fois).
          config: existing.config && existing.config !== "{}" ? existing.config : JSON.stringify(m.config),
        },
      })
      console.log(`  ↳ ${m.key} : mis à jour (actif=${existing.actif})`)
    } else {
      await db.module.create({
        data: {
          key: m.key,
          nom: m.nom,
          description: m.description,
          actif: m.actifParDefaut,
          config: JSON.stringify(m.config),
        },
      })
      console.log(`  ↳ ${m.key} : créé (actif=${m.actifParDefaut})`)
    }
  }
  console.log("✅ Seed des modules terminé.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
