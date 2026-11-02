// ============================================================
// FeedbackPro - Helper de chiffrement (Task M5)
// ------------------------------------------------------------
// Chiffrement/déchiffrement des champs sensibles (commentaires libres,
// emails clients) en AES-GCM via crypto.subtle (Web Crypto API —
// disponible nativement dans Node 19+ et tous les navigateurs).
//
// CLÉ : lue depuis process.env.ENCRYPTION_KEY (32 bytes en base64).
// Si la clé est absente ou invalide, on bascule en MODE PLAIN (les
// données sont stockées en clair) — mode démo, signalé dans les logs.
// En production, positionner ENCRYPTION_KEY avec une clé stable (la
// modifier rend les données existantes indéchiffrables).
//
// USAGE FUTUR :
//   - chiffrer(commentaire) avant db.retour.create({ commentaire })
//   - dechiffrer(commentaire) après db.retour.findMany()
//   - recherche par contenu : impossible sur du chiffré → prévoir un
//     hash de recherche (SHA-256 du texte lower-cased) pour la recherche
//     full-text sans révéler le contenu.
//
// FORMAT : on stocke un JSON { iv: b64, ct: b64 } — l'IV (Initialization
// Vector) doit être unique par chiffrement (aléatoire), la clé reste
// constante. AES-GCM garantit confidentialité + intégrité (tag d'auth).
// ============================================================

const ENC_ALGO = "AES-GCM"
const KEY_LEN_BYTES = 32 // AES-256
const IV_LEN_BYTES = 12 // 96 bits — recommandé pour GCM

/** Préfixe des données chiffrées : permet de distinguer un texte chiffré
 *  d'un texte en clair (mode démo rétro-compatible). */
const PREFIX_CHIFFRE = "enc:v1:"

/** Cache de la CryptoKey (l'import est coûteux : on ne le fait qu'une fois). */
let cachedKey: CryptoKey | null = null
let cachedKeyModePlain = false

/**
 * Charge et importe la clé AES-GCM depuis process.env.ENCRYPTION_KEY.
 * Retourne null si la clé est absente/invalide → mode plain (démo).
 * L'import est mis en cache : appel unique au premier usage.
 */
async function getCleChiffrement(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey
  if (cachedKeyModePlain) return null

  const b64 = process.env.ENCRYPTION_KEY
  if (!b64) {
    // Mode démo : pas de clé configurée — on reste en plain text.
    // En production, ce serait un warning critique à logger (Sentry…).
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[crypto] ENCRYPTION_KEY absent : les champs sensibles sont stockés en clair (mode démo). " +
          "Positionner ENCRYPTION_KEY (32 bytes base64) pour activer le chiffrement."
      )
    }
    cachedKeyModePlain = true
    return null
  }

  try {
    // La clé doit être 32 bytes (base64 = 44 caractères avec padding).
    const raw = Buffer.from(b64, "base64")
    if (raw.length !== KEY_LEN_BYTES) {
      console.warn(
        `[crypto] ENCRYPTION_KEY invalide : ${raw.length} bytes (attendu ${KEY_LEN_BYTES}). Mode plain activé.`
      )
      cachedKeyModePlain = true
      return null
    }
    cachedKey = await crypto.subtle.importKey("raw", raw, { name: ENC_ALGO }, false, [
      "encrypt",
      "decrypt",
    ])
    return cachedKey
  } catch (e) {
    console.warn("[crypto] Import de ENCRYPTION_KEY impossible — mode plain activé.", e)
    cachedKeyModePlain = true
    return null
  }
}

/** Encode bytes → base64 (URL-safe par défaut, mais base64 classique ici). */
function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}

/** Décode base64 → bytes. */
function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"))
}

/**
 * Chiffre une chaîne avec AES-GCM.
 * Retourne PREFIX_CHIFFRE + JSON { iv, ct } en base64.
 * Si la clé n'est pas configurée → retourne la chaîne inchangée (mode plain).
 */
export async function chiffrer(texte: string | null | undefined): Promise<string | null> {
  if (texte === null || texte === undefined || texte === "") return texte ?? null
  // Déjà chiffré : ne pas re-chiffrer (idempotence)
  if (typeof texte === "string" && texte.startsWith(PREFIX_CHIFFRE)) return texte

  const cle = await getCleChiffrement()
  if (!cle) return texte // mode plain

  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN_BYTES))
    const enc = new TextEncoder()
    const ct = await crypto.subtle.encrypt(
      { name: ENC_ALGO, iv: iv as BufferSource },
      cle,
      enc.encode(texte)
    )
    const payload = JSON.stringify({ iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) })
    return PREFIX_CHIFFRE + payload
  } catch (e) {
    console.warn("[crypto] Échec du chiffrement — texte retourné en clair.", e)
    return texte
  }
}

/**
 * Déchiffre une chaîne AES-GCM (préfixée par PREFIX_CHIFFRE).
 * Si la chaîne n'est pas chiffrée (pas de préfixe), elle est retournée
 * telle quelle (rétro-compatible avec les données existantes en clair).
 */
export async function dechiffrer(texte: string | null | undefined): Promise<string | null> {
  if (!texte || typeof texte !== "string") return texte ?? null
  if (!texte.startsWith(PREFIX_CHIFFRE)) return texte // pas chiffré

  const cle = await getCleChiffrement()
  if (!cle) {
    // Clé perdue : on ne peut pas déchiffrer. On retourne un placeholder
    // plutôt que de révéler le payload chiffré (qui ressemblerait à du bruit).
    return "[donnée chiffrée — clé non configurée]"
  }

  try {
    const json = texte.slice(PREFIX_CHIFFRE.length)
    const parsed = JSON.parse(json) as { iv: string; ct: string }
    const iv = b64ToBytes(parsed.iv)
    const ct = b64ToBytes(parsed.ct)
    // Cast BufferSource : Uint8Array est compatible mais TS strict exige un ArrayBuffer
    const plainBuffer = await crypto.subtle.decrypt(
      { name: ENC_ALGO, iv: iv as unknown as BufferSource },
      cle,
      ct as unknown as BufferSource
    )
    return new TextDecoder().decode(plainBuffer)
  } catch (e) {
    console.warn("[crypto] Échec du déchiffrement — clé incorrecte ou donnée corrompue.", e)
    return "[donnée indéchiffrable]"
  }
}

/**
 * Indique si le chiffrement est actif (clé valide configurée).
 * Sert à afficher un badge "chiffré" dans le UI admin / RGPD.
 */
export async function chiffrementActif(): Promise<boolean> {
  const cle = await getCleChiffrement()
  return cle !== null
}

/**
 * Génère une nouvelle clé AES-256 au format base64 (32 bytes).
 * Usage : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 * ou via cet helper dans un script d'initialisation.
 */
export function genererNouvelleCle(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(KEY_LEN_BYTES))).toString("base64")
}
