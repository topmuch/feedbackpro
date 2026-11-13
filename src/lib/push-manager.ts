// ============================================================
// push-manager.ts — Utilitaire d'abonnement Web Push (côté client)
// ------------------------------------------------------------
// Task P1 — notifications "always-on" via Service Worker + Push API.
//
// Flux d'abonnement :
//   1. areNotificationsSupported() — sanity check navigateur
//   2. subscribeToPush() :
//        a. demande la permission Notification (prompt natif)
//        b. navigator.serviceWorker.ready → récupère le SW enregistré
//           (public/sw.js, qui contient le handler 'push')
//        c. pushManager.subscribe({
//             userVisibleOnly: true,                // → afficher une notif à chaque push (norme W3C)
//             applicationServerKey: <VAPID public>   // → clé publique pour authentifier le serveur
//           })
//        d. retourne la PushSubscription (endpoint + keys p256dh/auth)
//        e. l'app POST ça vers /api/airport/push/subscribe qui stocke en BDD
//
// Clé VAPID : la publique est exposée via NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   (définie dans .env). La privée reste serveur-only et est utilisée
//   par la lib `web-push` pour signer les messages sortants.
//
// Sécurité : userVisibleOnly=true est OBLIGATOIRE sur Chrome/Firefox
//   — garantit que chaque push déclenche une notification visible par
//   l'utilisateur (pas de push silencieux). C'est la norme depuis 2015.
//
// Fallback : si la souscription échoue (permission refusée, SW pas
//   prêt, pas de VAPID key…), retourne null — la PWA staff garde le
//   polling 10s comme repli (les incidents sont détectés dans l'app
//   même sans push serveur).
// ============================================================

// Clé publique VAPID — injectée à la compilation (NEXT_PUBLIC_*).
// En dev sans .env configuré, c'est une chaîne vide → la souscription
// échouera silencieusement et le polling restera actif.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

/**
 * Indique si le navigateur supporte les notifications Web Push.
 * Trois conditions :
 *   - `Notification` API (demande de permission)
 *   - `serviceWorker` API (enregistrement du SW qui recevra les push)
 *   - `PushManager` API (pushManager.subscribe)
 * Safari iOS 16.4+ supporte ces trois APIs ; iOS < 16.4 → false.
 */
export function areNotificationsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/**
 * Demande la permission d'afficher des notifications.
 * Retourne true si accordée (granted), false sinon (denied/default).
 * Si déjà accordée, ne re-prompt pas — retourne true directement.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch {
    return false
  }
}

/**
 * Souscrit le navigateur courant aux push notifications.
 *
 * Étapes :
 *   1. Vérifie le support navigateur (sinon → null)
 *   2. Demande la permission Notification (sinon → null)
 *   3. Attend que le Service Worker soit prêt (navigator.serviceWorker.ready)
 *   4. Souscrit via pushManager.subscribe avec la clé VAPID publique
 *
 * @returns PushSubscription si succès, null sinon.
 *          L'app doit ensuite POST la subscription vers
 *          /api/airport/push/subscribe pour la persister en BDD.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!areNotificationsSupported()) return null
  try {
    // 1. Permission
    const granted = await requestNotificationPermission()
    if (!granted) return null

    // 2. SW prêt — important : si le SW n'est pas encore actif (premier
    //    chargement après install), on attend qu'il le devienne. Sinon
    //    pushManager.subscribe() lèverait une erreur.
    const reg = await navigator.serviceWorker.ready

    // 3. Clé VAPID → Uint8Array (format attendu par l'API).
    //    Sans clé valide, on ne peut pas souscrire (l'API refuse).
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[push-manager] NEXT_PUBLIC_VAPID_PUBLIC_KEY non définie — push désactivé')
      return null
    }
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)

    // 4. Souscription. userVisibleOnly=true est obligatoire :
    //    garantit qu'une notification sera affichée à chaque push.
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast BufferSource : pushManager.subscribe accepte ArrayBuffer |
      // ArrayBufferView<ArrayBuffer>. Notre urlBase64ToUint8Array renvoie
      // un Uint8Array<ArrayBuffer> mais TS 5+ l'élargit en Uint8Array<ArrayBufferLike>
      // — on retype explicitement pour satisfaire le type DOM.
      applicationServerKey: appServerKey as BufferSource,
    })
    return sub
  } catch (err) {
    console.warn('[push-manager] Échec de souscription push:', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Indique si l'appareil courant est déjà abonné (sans re-souscrire).
 * Utile pour afficher "Notifications activées" sur l'écran d'accueil
 * sans déclencher un nouveau prompt de permission.
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!areNotificationsSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/**
 * Convertit une clé publique VAPID base64url en Uint8Array.
 * L'API pushManager.subscribe attend applicationServerKey en Uint8Array
 * (pas en string base64). La conversion corrige aussi le padding.
 *
 * Note TS 5+ : on force un ArrayBuffer (pas SharedArrayBuffer) car
 * pushManager.subscribe refuse les vues sur SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  // Buffer.from sous Node renvoie un Uint8Array<ArrayBuffer> — requis par
  // la signature DOM type ArrayBufferView<ArrayBuffer>. En fallback
  // navigateur pur (sans Buffer global), on copie dans un ArrayBuffer neuf.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(rawData, 'binary')
  }
  const buf = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i)
  }
  return view
}
