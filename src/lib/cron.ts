// ============================================================
// FeedbackPro - Planification des rapports IA (Session 5 §3)
// ------------------------------------------------------------
// Deux fonctions de cron, appelées par les routes /api/cron/* :
//
// - cronRapportQuotidien()   : TOUS LES JOURS à 7h du matin
//   → boucle sur tous les Pros avec plan PRO+ (PRO ou ENTERPRISE),
//     frequenceRapport = "quotidien", non suspendus, ayant reçu au
//     moins un retour sur les 24 dernières heures → rapport quotidien
//
// - cronRapportHebdomadaire() : TOUS LES LUNDIS à 7h du matin
//   → boucle sur tous les Pros avec plan PRO+ (PRO ou ENTERPRISE),
//     non suspendus, ayant reçu au moins un retour sur les 7 derniers
//     jours → rapport hebdomadaire
//
// La génération passe par genererRapportIA() (src/lib/ia.ts) :
// LLM + fallback déterministe garanti + email automatique (Resend,
// mode démo simulé sans clé). Un échec pour un Pro n'interrompt
// JAMAIS la série.
// ============================================================

import { db } from "@/lib/db"
import { genererRapportIA } from "@/lib/ia"

/** Résultat d'un rapport généré par le cron (pour la réponse API / logs) */
export type ResultatCronRapport = {
  proId: string
  nomEtablissement: string
  rapportId: string
  scoreGlobal: number
  /** "ia" = généré par le LLM · "fallback" = analyse locale déterministe */
  source: string
  /** Email du rapport envoyé (mode démo : simulé) */
  emailEnvoye: boolean
}

/** Résultat complet d'un cron de rapports */
export type ResultatCron = {
  cibles: number
  rapports: ResultatCronRapport[]
  erreurs: { proId: string; nomEtablissement: string }[]
}

/** Plans éligibles aux rapports IA automatiques : PRO et Enterprise (PRO+) */
const PLANS_PRO_PLUS = ["PRO", "ENTERPRISE"]

/**
 * CRON QUOTIDIEN (7h du matin) — génère le rapport quotidien de chaque
 * Pro plan PRO+ en fréquence quotidienne.
 */
export async function cronRapportQuotidien(): Promise<ResultatCron> {
  const ilYA24h = new Date(Date.now() - 24 * 3600 * 1000)

  // Cibles : Pros plan PRO+, fréquence quotidienne, actifs, avec retours sur 24 h
  const pros = await db.pro.findMany({
    where: {
      plan: { in: PLANS_PRO_PLUS },
      frequenceRapport: "quotidien",
      suspendu: false,
      retours: { some: { createdAt: { gte: ilYA24h } } },
    },
    orderBy: { createdAt: "asc" },
  })

  console.log(`[CRON quotidien 7h] ${pros.length} établissement(s) plan PRO+ à auditer`)

  const rapports: ResultatCronRapport[] = []
  const erreurs: { proId: string; nomEtablissement: string }[] = []

  // Génération séquentielle (politesse envers le LLM)
  for (const pro of pros) {
    try {
      const { rapport, source } = await genererRapportIA(pro.id, "quotidien", { envoyerEmail: true })
      rapports.push({
        proId: pro.id,
        nomEtablissement: pro.nomEtablissement,
        rapportId: rapport.id,
        scoreGlobal: rapport.scoreGlobal,
        source,
        emailEnvoye: rapport.envoyeParEmail,
      })
    } catch (e) {
      console.error(`[CRON quotidien] Rapport impossible pour ${pro.nomEtablissement}`, e)
      erreurs.push({ proId: pro.id, nomEtablissement: pro.nomEtablissement })
    }
  }

  console.log(`[CRON quotidien 7h] Terminé : ${rapports.length}/${pros.length} rapport(s) généré(s)`)
  return { cibles: pros.length, rapports, erreurs }
}

/**
 * CRON HEBDOMADAIRE (lundi 7h du matin) — génère le rapport hebdomadaire
 * de chaque Pro plan PRO+ (quelle que soit leur fréquence : les Pro en
 * fréquence quotidienne reçoivent en plus cet audit hebdo consolidé).
 */
export async function cronRapportHebdomadaire(): Promise<ResultatCron> {
  const ilYA7j = new Date(Date.now() - 7 * 24 * 3600 * 1000)

  // Cibles : TOUS les Pros plan PRO+ non suspendus, avec retours sur 7 jours
  const pros = await db.pro.findMany({
    where: {
      plan: { in: PLANS_PRO_PLUS },
      suspendu: false,
      retours: { some: { createdAt: { gte: ilYA7j } } },
    },
    orderBy: { createdAt: "asc" },
  })

  console.log(`[CRON hebdomadaire lundi 7h] ${pros.length} établissement(s) plan PRO+ à auditer`)

  const rapports: ResultatCronRapport[] = []
  const erreurs: { proId: string; nomEtablissement: string }[] = []

  for (const pro of pros) {
    try {
      const { rapport, source } = await genererRapportIA(pro.id, "hebdomadaire", { envoyerEmail: true })
      rapports.push({
        proId: pro.id,
        nomEtablissement: pro.nomEtablissement,
        rapportId: rapport.id,
        scoreGlobal: rapport.scoreGlobal,
        source,
        emailEnvoye: rapport.envoyeParEmail,
      })
    } catch (e) {
      console.error(`[CRON hebdomadaire] Rapport impossible pour ${pro.nomEtablissement}`, e)
      erreurs.push({ proId: pro.id, nomEtablissement: pro.nomEtablissement })
    }
  }

  console.log(`[CRON hebdomadaire lundi 7h] Terminé : ${rapports.length}/${pros.length} rapport(s) généré(s)`)
  return { cibles: pros.length, rapports, erreurs }
}
