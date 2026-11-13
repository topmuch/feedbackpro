# Task P1 — Push Notifications + QR Staff PWA Refonte (6 Scénarios)

**Agent**: main-agent (P1)
**Date**: 2025-11-17

## Scope

Implémentation complète des deux features demandées :

1. **Push Notifications "always-on"** via Service Worker + Push API + web-push (VAPID)
2. **Refonte de la PWA staff aéroport** avec les 6 scénarios du cahier des charges

## Fichiers créés

- `src/lib/push-manager.ts` — utilitaire client (subscribeToPush, requestNotificationPermission, areNotificationsSupported, getExistingSubscription)
- `src/lib/push-notifier.ts` — wrapper serveur fire-and-forget autour de `/api/airport/push/send`
- `src/app/api/airport/push/subscribe/route.ts` — POST : persiste une PushSubscription en BDD (upsert par endpoint)
- `src/app/api/airport/push/send/route.ts` — POST : broadcast Web Push à tous les abonnés via web-push + clés VAPID

## Fichiers modifiés

- `prisma/schema.prisma` — ajout du modèle `AirportPushSubscription { id, endpoint (unique), p256dh, auth, staffName?, createdAt, updatedAt }`
- `src/lib/db.ts` — bump du cache Prisma à v18 pour prendre en charge le nouveau modèle
- `public/sw.js` — ajout des handlers `push` + `notificationclick` (cache v3 → v4, airport-api v3 → v4)
- `src/app/api/airport/report/route.ts` — fire-and-forget `triggerPushNotification()` après création d'un signalement
- `src/components/feedbackpro/airport-staff-view.tsx` — refonte complète : 6 écrans (login PIN + accueil + incident-new + incident-ongoing + resolve-confirm + dashboard)
- `.env` — ajout de NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

## Vérifications

- `bun add web-push @types/web-push` → OK (web-push@4.0.0)
- `bun run db:push` → OK (AirportPushSubscription créé)
- `npx tsc --noEmit --skipLibCheck` → exit 0 (aucune erreur)
- `bun run lint` (scoped aux nouveaux fichiers) → exit 0
- `bun run lint` (global) → 4 erreurs préexistantes (language-selector, scratch-card, seed-airport-ops-config.cjs, db.ts warning) — AUCUNE dans les fichiers P1

## Architecture push

```
[voyageur signale] → POST /api/airport/report
                        ↓ (fire-and-forget)
                  triggerPushNotification()
                        ↓ HTTP interne
                  POST /api/airport/push/send
                        ↓ web-push.sendNotification() (signé VAPID privé)
                  [service push FCM/APNS/Mozilla]
                        ↓ (push event chiffré)
                  [SW /sw.js sur l'appareil staff — même app fermée]
                        ↓ self.registration.showNotification(...)
                  [Notification système : "Voir l'incident" / "Ignorer"]
                        ↓ (clic action 'open')
                  clients.openWindow("/?staff=1&report=<id>")
```

L'abonnement initial se fait côté client :

```
[PWA staff — bouton "Activer les notifications"]
  → subscribeToPush() (src/lib/push-manager.ts)
       ↓ Notification.requestPermission()
       ↓ navigator.serviceWorker.ready
       ↓ pushManager.subscribe({ userVisibleOnly, applicationServerKey: VAPID_public })
  → POST /api/airport/push/subscribe { endpoint, keys: {p256dh, auth}, staffName }
  → db.airportPushSubscription.upsert({ where: { endpoint } })
```

## 6 scénarios — mapping

| Scénario | Implémentation |
|----------|----------------|
| S1 Connexion & Accueil | `LoginScreen` (dropdown employés + InputOTP PIN 4 chiffres, stocké localStorage par nom) → `HomeScreen` (stats + BIG bouton scan + listes Nouveaux/En cours + bouton push + bouton install PWA) |
| S2 Nouvel Incident | Polling 10s `/api/airport/reports?statut=EN_ATTENTE` + push serveur (déclenche le SW qui réveille l'app). Chaîne `vibrer()` → `jouerDing()` → `parler("Nouvel incident <terminal>, <zone>. Type <problemType>.")` → auto-navigate `incident-new`. "Ignorer" = marquage localStorage (reste NEW en base) |
| S3 Prise en Charge | `IncidentNewScreen` → bouton "PRENDRE EN CHARGE" → POST `/api/airport/staff-scan` action=TAKE_CHARGE → statut EN_COURS + assignedTo=staffName → vibrer + Denise "Incident pris en charge par <name>" → redirect `incident-ongoing` |
| S4 Gestion En Cours | `OngoingIncidentCard` (timer live MM:SS) sur home + `IncidentOngoingScreen` (header indigo + timer + bouton "MARQUER COMME RÉSOLU" + "Ajouter une note"). Collision : si `matchOngoingOther.length > 0` après scan → "Cet incident est déjà pris en charge par <name>" |
| S5 Résolution | `ResolveConfirmScreen` (elapsed min + commentaire + photo optionnelle) → POST `/api/airport/staff-scan` action=RESOLVE → Denise "Incident résolu en <N> minutes" + vibrer → redirect home |
| S6 Edge Cases | QR invalide → "Ce QR code n'est plus valide ou n'existe pas." / Offline → banner `WifiOff` (le SW Background Sync gère la queue) / Logout avec incidents en cours → `Dialog` confirmation "Vous avez N incidents non résolus" |

## Déviations par rapport au spec

- **PIN storage** : comme spécifié, stocké en localStorage par nom d'employé (`fp-staff-pin:<nom>`). Premier login = création, suivants = vérif. Non sécurisé (V1) — documenté dans le code.
- **Web-push import** : le spec suggérait `require('web-push')` mais la règle ESLint `@typescript-eslint/no-require-imports` l'interdit. Utilisation de `await import('web-push')` (interop CJS/ESM) — fonctionnellement équivalent.
- **PushSubscription.keys** : pas toujours exposé dans les lib TS DOM. Cast local `PushSubscription & { keys?: { p256dh?, auth? } }` pour accès safe.
- **URL pas de port** : aucun port direct n'est écrit dans les appels HTTP (utilise `fetch('/api/airport/...')` relatif + `NEXT_PUBLIC_APP_URL` pour les appels serveur-à-serveur via `push-notifier.ts`). Respecte la règle du gateway Caddy.
- **TypeScript Uint8Array<ArrayBuffer>** : TS 5+ typage strict sur `applicationServerKey` — fixé avec un cast `BufferSource` et construction ArrayBuffer-backed (pas SharedArrayBuffer).
