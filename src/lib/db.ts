// Cache global : évite d'instancier un nouveau PrismaClient à chaque HMR
// en dev. La clé est versionnée : quand le schéma Prisma évolue (nouvelle
// colonne, nouveau modèle), on incrémente la version pour forcer la
// création d'une nouvelle instance à jour.
//
// NOTE : en dev, le PrismaClient peut rester en cache Node même après une
// régénération du client. Pour les champs ajoutés après le démarrage du
// serveur de dev, il faut utiliser db.$executeRaw* (SQL brut) qui contourne
// la validation du schéma Prisma. Au prochain redémarrage du serveur, le
// client rechargé prend en charge les nouveaux champs nativement.
//
// On charge @prisma/client via un require dynamique pour éviter que
// Turbopack ne bundle l'import statique — cela permet de rebondir en dev
// même si le chunk Turbopack d'@prisma/client a été invalidé.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRequire(): NodeRequire | undefined {
  // Plusieurs stratégies pour récupérer require() en contexte ESM/Turbopack
  try {
    if (typeof require === 'function') return require as NodeRequire
  } catch {
    /* ignore */
  }
  try {
    const g = globalThis as any
    if (typeof g.require === 'function') return g.require as NodeRequire
  } catch {
    /* ignore */
  }
  return undefined
}

const dynamicRequire = getRequire()
if (!dynamicRequire) {
  throw new Error("Impossible de charger @prisma/client : require() indisponible")
}

// Bust du cache require pour @prisma/client et .prisma/client : quand le
// schéma Prisma est régénéré (nouvelle colonne, nouveau modèle), Node garde
// l'ancienne évaluation en cache et la validation runtime
// (PrismaClientValidationError) échoue sur les nouveaux champs. On invalide
// manuellement ce cache avant chaque chargement en dev.
if (process.env.NODE_ENV !== 'production' && dynamicRequire.cache) {
  for (const k of Object.keys(dynamicRequire.cache)) {
    if (k.includes('@prisma/client') || k.includes('.prisma/client')) {
      delete dynamicRequire.cache[k]
    }
  }
}

const PrismaClientCtor: typeof import('@prisma/client').PrismaClient =
  dynamicRequire('@prisma/client').PrismaClient

const PRISMA_CACHE_KEY = 'prisma_v10_bust_cache'

const globalForPrisma = globalThis as unknown as {
  [key: string]: import('@prisma/client').PrismaClient | undefined
}

const existing = globalForPrisma[PRISMA_CACHE_KEY] as import('@prisma/client').PrismaClient | undefined
export const db: import('@prisma/client').PrismaClient =
  existing ??
  new PrismaClientCtor({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma[PRISMA_CACHE_KEY] = db
}