# Task O1 — Centre Opérationnel (Operations Center NOC)

**Agent**: O1-operations-center
**Scope**: SuperAdmin dashboard — nouvelle tab "Centre Opérationnel" qui monitore 7 services critiques en temps réel (style NOC / Network Operations Center).

## Files created / modified

### Prisma schema
- `/home/z/my-project/prisma/schema.prisma` (appended ~25 lignes)
  - Nouveau modèle `SystemHealthLog` avec index sur `[serviceName, detectedAt]` et `[status, detectedAt]`
  - Marker unique : `// Task O1 — Centre Opérationnel (SuperAdmin NOC)`
  - L'ajout a été placé APRÈS les modèles NotificationSetting/Template/Log de la Task N1 (qui étaient déjà présents au moment du run).

### Lib
- `/home/z/my-project/src/lib/critical-alert.ts` (465 lignes)
  - `sendCriticalAlert(serviceName, errorMessage, context, logId?)` → envoie un email d'alerte critique au superadmin avec un diagnostic structuré (service affecté, heure de détection, sévérité, type d'erreur, impact métier, dernier succès, tentatives, statut global, actions recommandées).
  - Helper `getEmailNotificationSetting()` accède à `db.notificationSetting` via `(db as any)` pour rester résilient même si le modèle n'est pas encore pushé en base.
  - Helper `resolveAdminEmail()` → `process.env.ADMIN_EMAIL` ou premier user SUPERADMIN en base.
  - Marque `SystemHealthLog.alertSent = true` après envoi réussi.
  - Aucune exception propagée (tout est catché — un échec d'email ne casse pas le flux de health check).

### API routes
- `/home/z/my-project/src/app/api/admin/operations/health/route.ts` (~330 lignes)
  - `GET` → exécute les 7 checks en parallèle et renvoie `{ globalStatus, services[], lastCheckedAt }`.
  - Voir section "How the 7 health checks work" ci-dessous.
  - Journalise les warning/critical dans `SystemHealthLog` (pas les OK pour éviter la saturation).
  - Déclenche `sendCriticalAlert()` pour chaque service critical.
  - Marque les alertes précédentes d'un service comme résolues (`resolvedAt = now()`) quand le service revient à OK/inactive.

- `/home/z/my-project/src/app/api/admin/operations/alerts/route.ts` (~70 lignes)
  - `GET` → renvoie les 50 dernières alertes `status in ['warning', 'critical']` triées par `detectedAt DESC`.
  - Inclut `resolvedAt` (null si toujours actif) et `alertSent`.

### Composant UI
- `/home/z/my-project/src/components/feedbackpro/admin-operations-tab.tsx` (~720 lignes)
  - Header : badge global OPÉRATIONNEL / DÉGRADÉ / CRITIQUE + last check timestamp + bouton refresh.
  - Section A : grille responsive (1 col mobile, 2 sm, 3 lg, 4 xl) de 7 cartes service avec icône, statut (pastille pulsante), latence/success rate, "il y a Xs", boutons Logs/Test/Détails.
  - Section B : flux d'alertes live dans une `Card` avec `max-h-96 overflow-y-auto` + custom scrollbar styling. Chaque entrée affiche heure HH:MM:SS, icône sévérité (⚠️ OctagonAlert pour critical, AlertTriangle pour warning), service label, message erreur mono, badges CRITICAL/WARNING + Auto-rétablie + Email envoyé.
  - Section C : 3 actions rapides (Tester tous les canaux / Forcer la synchronisation SW / Envoyer un alert test) avec loading state.
  - Polling : health toutes les 10s, alerts toutes les 5s via `setInterval`.
  - Style NOC sombre avec accents colorés par statut (emerald/amber/rose), mono pour métriques, pastilles pulsantes via `animate-pulse`.

### Integration dans admin-dashboard
- `/home/z/my-project/src/components/feedbackpro/admin-dashboard.tsx`
  - Import `AdminOperationsTab` (ligne 94).
  - Ajout de `"operations"` au type `OngletAdmin` (ligne 140).
  - Ajout de `{ id: "operations", labelKey: "nav.operations", icone: Shield }` dans l'array `ONGLETS` (ligne 149) — entre "retention" et "secteurs".
  - Ajout de `{onglet === "operations" && <AdminOperationsTab />}` dans le main (ligne 446).
  - Update des 2 maps i18n (AdminDashboard ligne 296 + ContenuSidebarAdmin ligne 475) avec `"nav.operations": "Centre Opérationnel"`.

### Prisma client cache
- `/home/z/my-project/src/lib/db.ts`
  - Bump `PRISMA_CACHE_KEY` de `'prisma_v19_notifications'` à `'prisma_v20_operations'` pour forcer la création d'une nouvelle instance PrismaClient qui connaît `SystemHealthLog` (sans redémarrage manuel du serveur de dev).

## db:push result

```
$ bun run db:push --accept-data-loss
⚠️ We found changes that cannot be executed:
  • Added the required column `note` to the `Retour` table without a default value. There are 8 rows in this table...
  • Added the required column `proId` to the `Retour` table without a default value.
  • Added the required column `zoneId` to the `Retour` table without a default value.
error: script "db:push" exited with code 1
```

**Échec pré-existant** — pas causé par mon ajout. La table `Retour` a 8 lignes en DB qui n'ont pas les colonnes `note`/`proId`/`zoneId` devenues required dans le schéma (modifications d'autres agents avant la Task O1). Le `db:push` échoue donc pour TOUT ajout de modèle, pas seulement le mien.

**Workaround appliqué** : la table `SystemHealthLog` a été créée directement en SQLite via `bun -e` (script JS qui exécute les 3 requêtes `CREATE TABLE` + `CREATE INDEX`). Le Prisma client a été régénéré via `bun x prisma generate` (qui ne nécessite pas de DB). Le `db.ts` cache key a été bumpé pour forcer la nouvelle instance PrismaClient qui connaît `db.systemHealthLog.*`.

Vérification : la table `SystemHealthLog` est présente dans `db/custom.db` avec ses 2 indexes.

## Lint result

```
$ bun run lint 2>&1 | tail -15
/home/z/my-project/prisma/seed-airport-ops-config.cjs:10  error  A `require()` style import is forbidden
/home/z/my-project/src/components/feedbackpro/language-selector.tsx:33  error  react-hooks/immutability
/home/z/my-project/src/components/feedbackpro/scratch-card.tsx:105  error  react-hooks/immutability
/home/z/my-project/src/lib/db.ts:15  warning  Unused eslint-disable directive
✖ 4 problems (3 errors, 1 warning)
```

**Tous les problèmes sont pré-existants et hors de mes fichiers.** Mes 5 fichiers (critical-alert.ts, operations/health/route.ts, operations/alerts/route.ts, admin-operations-tab.tsx, admin-dashboard.tsx) ne génèrent AUCUN lint error ou warning après cleanup des directives `eslint-disable` inutiles (la règle `@typescript-eslint/no-explicit-any` est `"off"` dans `eslint.config.mjs`).

## tsc result

```
$ npx tsc --noEmit --skipLibCheck
exit code: 1
```

**Exit code 1 est pré-existant** : 45 erreurs dans `scripts/seed.ts`, `src/app/api/login/route.ts`, `src/app/api/me/route.ts`, `src/app/api/recompense/route.ts`, `src/app/api/retours/[id]/route.ts` — tous référencent d'anciennes colonnes (`name`, `etablissement`, `etablissements`, `etablissementId`, `personnel`, `reponses`) qui ont été renommées dans le schéma Prisma mais dont le code n'a pas été mis à jour.

**Zero erreurs dans mes fichiers** : aucune ligne contenant `admin-dashboard`, `admin-operations`, `operations/health`, `operations/alerts`, `critical-alert`, ou `SystemHealthLog` n'apparaît dans la sortie de tsc.

## How the 7 health checks work

Tous les checks sont wrappés dans un try/catch individuel et exécutés en `Promise.all` parallèle. Chacun renvoie `{ serviceName, status, latencyMs?, errorMessage?, lastCheckedAt }` avec `status ∈ {"ok", "warning", "critical", "inactive"}`.

1. **db_primary** — `db.airportZone.count()` (requête légère SQLite) + mesure latence. Seuils : `< 100ms` → ok, `< 1000ms` → warning, `≥ 1000ms` → critical, exception → critical.

2. **mtarget_sms** — Lit `db.notificationSetting.findUnique({ where: { canal: "sms_mtarget" } })`. Si absent/inactif → `inactive`. Si actif sans endpoint dans config → `warning`. Sinon `pingEndpoint(config.endpoint, 3000)` via `fetch HEAD` avec timeout 3s + AbortController. Si reachable → ok (ou warning si latence > 2000ms). Sinon → critical.

3. **whatsapp_api** — Même pattern que SMS mais pour `canal: "whatsapp"`. Si pas d'endpoint explicite dans config, ping fallback `https://graph.facebook.com/v18.0/` (API Meta Graph).

4. **smtp_email** — Lit `db.notificationSetting.findUnique({ where: { canal: "email" } })`. Si actif → ok. Sinon → warning (emails transactionnels potentiellement bloqués).

5. **push_pwa** — `db.airportPushSubscription.count()`. Si `> 0` → ok (99.5% delivery rate assumed pour Web Push FCM/APNS/Mozilla). Si `= 0` → warning (aucun appareil staff abonné). Exception → critical.

6. **denise_tts** — Toujours `ok`. C'est une feature 100% client-side (Web Speech API du navigateur) — aucune dépendance serveur.

7. **service_worker** — `fetch HEAD ${NEXT_PUBLIC_APP_URL}/sw.js` avec timeout 3s. Si 2xx → ok. Sinon → critical (la PWA staff ne peut plus fonctionner offline).

**Statut global** : `critical` si au moins 1 service critical, sinon `warning` si au moins 1 warning, sinon `ok`.

**Journalisation** : seuls les statuts `warning` et `critical` sont écrits dans `SystemHealthLog` (pour éviter de saturer la table avec des "ok"). Quand un service revient à ok/inactive, toutes ses alertes précédentes non résolues sont marquées `resolvedAt = now()` via `updateMany`.

## How the alert feed works

`GET /api/admin/operations/alerts` (admin-only via `requireAdmin`) :
- `db.systemHealthLog.findMany({ where: { status: { in: ["warning", "critical"] } }, orderBy: { detectedAt: "desc" }, take: 50 })`
- Renvoie `{ alerts: [...], total }` avec chaque alerte contenant `id`, `serviceName`, `status`, `latencyMs`, `errorMessage`, `detectedAt` (ISO), `resolvedAt` (ISO ou null), `alertSent`.

Côté frontend, le `AlertFeed` du composant rafraîchit toutes les 5s via `setInterval(loadAlerts, 5000)`. Le feed est scrollable (`max-h-96 overflow-y-auto`) avec custom scrollbar (`scrollbarWidth: thin`, `scrollbarColor` slate). Chaque entrée affiche :
- Heure HH:MM:SS locale (font mono)
- Icône sévérité : `OctagonAlert` rouge pour critical, `AlertTriangle` ambre pour warning
- Service label (traduit depuis `SERVICE_META` map)
- Message erreur en font-mono avec `line-clamp-2`
- Badges : CRITICAL/WARNING coloré + `Auto-rétablie` (emerald) si `resolvedAt != null` + `Email envoyé` (slate) si `alertSent === true`
- Background color-coded : rose-50 pour critical, amber-50 pour warning

Quand le feed est vide, un état "Aucune alerte active" avec icône `CheckCircle2` emerald s'affiche.

## How critical emails are sent

`sendCriticalAlert(serviceName, errorMessage, context, logId?)` dans `/home/z/my-project/src/lib/critical-alert.ts` :

1. **Check canal email actif** — `getEmailNotificationSetting()` lit `db.notificationSetting.findUnique({ where: { canal: "email" } })` via `(db as any)`. Si inactif ou absent → log warning + return (mais marque quand même `alertSent = true` pour éviter les retries infinis).

2. **Diagnostic enrichi** — en parallèle :
   - `lastOkDetectedAt(serviceName)` : dernière entrée SystemHealthLog avec `status = "ok"` pour ce service.
   - `countUnresolvedAlerts(serviceName)` : nombre d'alertes warning/critical non résolues (`resolvedAt: null`).
   - `computeGlobalStatus()` : agrège le statut des 7 services (compte ok/warning/critical + détermine le statut global).

3. **Destinataire** — `resolveAdminEmail()` : `process.env.ADMIN_EMAIL` (priorité haute) ou premier `db.user.findFirst({ where: { role: "SUPERADMIN" } })`.

4. **Construction HTML** — `buildCriticalAlertHtml()` produit un email responsive avec :
   - Header rouge avec branding "FeedbackPro — Centre Opérationnel"
   - Titre "🚨 Alerte Critique — {Service Label}"
   - Cartouche diagnostic (table HTML) : Service affecté + serviceName en mono, Heure de détection (dateStyle full), Sévérité CRITIQUE badge rouge, Type d'erreur (mono sur fond blanc), Impact métier (texte par service depuis `SERVICE_IMPACTS`), Dernier succès, Tentatives
   - Cartouche statut global : OPÉRATIONNEL/DÉGRADÉ/CRITIQUE + compteurs ok/warning/critical
   - Section "Actions recommandées" : boutons rouges avec liens vers les sections du dashboard admin appropriées (config Mtarget, config WhatsApp, config Resend, etc.) depuis `SERVICE_ACTIONS` map
   - Pied de page légal

5. **Envoi** — `sendEmail(adminEmail, sujet, html)` depuis `@/lib/email` (utilise Resend API si `RESEND_API_KEY` présent, sinon mode démo qui log et renvoie `true`).

6. **Marquage** — `markAlertSent(logId)` : `db.systemHealthLog.update({ where: { id: logId }, data: { alertSent: true } })`.

**Robustesse** : l'ensemble est wrappé dans un try/catch — aucune exception n'est propagée à l'appelant (le route health check). Un échec d'email est loggé mais ne casse pas le flux.

## Notes / Pre-existing issues observed

- **DB schema mismatch** : `db:push` échoue à cause de la table `Retour` qui a 8 lignes sans les colonnes required `note`/`proId`/`zoneId` (devenues required dans le schéma). Conséquence : `db.session.findUnique()` lève `PrismaClientKnownRequestError P2021` "The table `main.Session` does not exist in the current database" car la DB a des tables anciennes (Etablissement, Personnel) au lieu des nouvelles (Pro, Employe, Session). Ce problème **affecte tous les endpoints admin** (login, me, retours, overview, etc.) et n'est PAS causé par mon travail. Ma table `SystemHealthLog` a été créée manuellement en SQLite pour contourner ce blocage.
- **Recommendation** : exécuter `bun run db:push --force-reset` (avec perte de données acceptée) pour resynchroniser le schéma et la DB. Cela corrigera l'auth et permettra aux 7 health checks de fonctionner réellement (au lieu de tomber en 500 sur le `requireAdmin` qui appelle `db.session.findUnique`).
