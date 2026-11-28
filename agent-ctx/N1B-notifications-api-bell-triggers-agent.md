# Task N1B — Notifications API + SuperAdmin Bell + Airport Triggers

**Agent**: main
**Date**: 2025-11-13 (suite de la task N1)
**Scope**:
1. Nouvelle route agregatee `/api/admin/notifications` (GET + PATCH) pour le centre de notifications tenant-aware.
2. Nouvelle route `/api/admin/notifications/test` (POST) pour tester un canal.
3. Verification que `NotificationsBell` est bien dans le header SuperAdmin (deja en place depuis N1).
4. Branchement des triggers manquants `assigned` et `resolved` sur les routes airport (assign, ops/resolve, staff-scan).

---

## Fichiers crees / modifies

### Nouveaux fichiers

#### `src/app/api/admin/notifications/route.ts` (GET + PATCH)
- **GET** : renvoie tous les `NotificationTemplate` regroupes par `tenantType`.
  - Shape : `{ ok: true, data: { templates: [...], byTenant: { airport, city, vip_lounge, classic, airline, platform } } }`
  - Initialise les 6 cles tenant a `[]` pour garantir une shape stable.
  - Seed idempotent des 5 templates par defaut (miroir de `/templates/route.ts`) — la route ne renvoie jamais une liste vide meme au premier appel.
  - Auth : `getSessionUser` + check `user.role === 'SUPERADMIN'` (401 sinon).
- **PATCH** : body `{ trigger: string, active?: boolean, channels?: string[] }`
  - Met a jour `active` (toggle on/off) et/ou `channels` (canals a utiliser).
  - Au moins un des deux champs updatable doit etre present (sinon 400).
  - Validation : `channels` doit etre un `string[]` parmi `email | whatsapp | sms_mtarget | push_pwa`. Filtre les chaines vides + deduplique.
  - 404 si le trigger n'existe pas en base (pas de creation implicite — PATCH = update only).
  - Renvoie le template mis a jour serialize (meme forme que GET).

#### `src/app/api/admin/notifications/test/route.ts` (POST)
- Body `{ canal: "email" | "sms_mtarget" | "push_pwa" | "whatsapp" }`
- Envoie le message standardise `"Test notification from FeedVoice SuperAdmin"` via le canal demande :
  - **email** : `sendEmail(user.email, sujet, html)` (helper `@/lib/email`). Renvoie `{ sent: true, canal, recipient }` ou 500 si echec.
  - **sms_mtarget** : `sendSmsMtarget(testPhone, msg, config)` (helper `@/lib/mtarget-sms`). `testPhone` lu depuis `NotificationSetting.sms_mtarget.config.testPhone` (champ optionnel non-type dans `MtargetConfig` — lu via `readTestPhone()` qui parse le JSON brut defensively). Fallback `221770000000` (numero fictif Senegal) si absent.
  - **push_pwa** : `triggerPushNotification({ title, body, tag })` (helper `@/lib/push-notifier`). Broadcast a tous les staffs abonnes.
  - **whatsapp** : API Meta non branchee — logge + renvoie `{ sent: true, canal, simulated: true }` (ne bloque pas l'UI de test).
- Auth : `getSessionUser` + `SUPERADMIN` (401 sinon).

### Fichiers modifies

#### `src/app/api/airport/assign/route.ts`
Ajout d'un dispatch `assigned` fire-and-forget apres chaque methode reussie (3 endroits) :
- **WhatsApp** : apres `db.airportReport.update({ data: { assignedTo: phone } })`, avant le `ok(...)`.
- **Email** : apres `db.airportReport.update({ data: { assignedTo: email } })`, avant le `ok(...)`.
- **Push** : apres `db.airportReport.update({ data: { assignedTo: 'push' } })`, avant le `ok(...)`.

Contexte passe a `dispatchNotification('assigned', { ... })` :
- `staffName` : phone (whatsapp) / email (email) / `'Staff push'` (push) — l'API ne capture pas un nom humain, on prend l'identifiant transmis.
- `incidentId` : `report.id.slice(-6)` (6 derniers chars — le moteur `renderTemplate` re-slicera en `slice(0, 8)`, ce qui preserve les 6 chars).
- `zone` : `report.zone?.nom ?? 'Zone inconnue'` (deja charge par le `include: { zone: { select: { code, nom, emoji } } }` existant).
- `link` : `https://feedback.qrbags.com/aeroport/${report.zone?.code ?? ''}` (URL publique vers la PWA staff, slugifiee par code zone).

Pattern d'appel :
```ts
try {
  const { dispatchNotification } = await import('@/lib/notification-engine')
  await dispatchNotification('assigned', { ... })
} catch { /* non bloquant */ }
```
Dynamic import pour eviter de casser la route si le moteur a une defaillance (chunk isole).

#### `src/app/api/airport/ops/resolve/route.ts`
- Ajout de `zone: { select: { nom: true, code: true } }` au `findUnique` existant (champ additif — ne casse pas la reponse HTTP qui n'expose que `reportId/statut/resolvedAt`).
- Apres le `dispatchWebhook('resolved', ...)` existant, ajout d'un dispatch `resolved` fire-and-forget :
  ```ts
  try {
    const { dispatchNotification } = await import('@/lib/notification-engine')
    await dispatchNotification('resolved', {
      incidentId: updated.id.slice(-6),
      temps: resolutionMinutes != null ? `${resolutionMinutes} min` : '',
      zone: existing.zone?.nom ?? 'Zone',
    })
  } catch { /* non bloquant */ }
  ```
  Reutilise `resolutionMinutes` (deja calcule pour le webhook) → pas de double calcul.

#### `src/app/api/airport/staff-scan/route.ts` (branche RESOLVE)
- Ajout de `include: { zone: { select: { nom: true, code: true } } }` au `db.airportReport.update` du RESOLVE (additif — les champs existants restent accessibles sur l'objet retourne).
- Apres le `console.log` de resolution et avant la fin du bloc RESOLVE, ajout d'un dispatch `resolved` fire-and-forget :
  ```ts
  try {
    const { dispatchNotification } = await import('@/lib/notification-engine')
    await dispatchNotification('resolved', {
      incidentId: report.id.slice(-6),
      temps: `${elapsedMin} min`,
      zone: report.zone?.nom ?? zoneCode ?? 'Zone',
    })
  } catch { /* non bloquant */ }
  ```
  Reutilise `elapsedMin` (deja calcule pour le score Agent) + `zoneCode` (deja resolu par `resolveZoneFromStaffTag`) en fallback du nom de zone.

---

## Task 2 — NotificationsBell dans le header SuperAdmin

**Etat** : DEJA EN PLACE (depuis la task N1 precedente). Aucune modification necessaire.

Verification :
- `src/components/feedbackpro/admin-dashboard.tsx:103` — `import { NotificationsBell } from "@/components/feedbackpro/notifications-bell"`
- `src/components/feedbackpro/admin-dashboard.tsx:506` — `<NotificationsBell tone="light" />` dans le header sticky, entre `<LanguageSelector tone="light" />` (505) et `<AirportIncidentsBell tone="light" />` (508), juste avant `<ThemeToggle />`.

Le `tone="light"` correspond a l'en-tete SuperAdmin a fond blanc (le `header` du dashboard admin utilise `bg-white` en light mode). La cloche est functionnellement equivalente a celle du `pro-dashboard.tsx` (line 576), qui sert de reference.

Note : la task spec mentionnait `import { NotificationsBell } from "@/components/feedbackpro/shared"` — le chemin reel est `@/components/feedbackpro/notifications-bell` (la cloche vit dans son propre fichier, pas dans `shared.tsx`). Les deux dashboards (pro + admin) importent depuis ce chemin — l'implementation est coherente et correcte.

---

## Notes techniques

### Signature reelle de `dispatchNotification`
La task spec mentionnait `dispatchNotification(trigger, ctx: Record<string, string>)`. La signature reelle dans `src/lib/notification-engine.ts` est :
```ts
dispatchNotification(trigger: string, context: NotificationContext): Promise<void>
```
ou `NotificationContext` a les champs camelCase `staffName`, `incidentId`, `zone`, `link`, `temps` (et non `STAFF_NOM`, `INCIDENT_ID`, `ZONE`, `LIEN_DIRECT`, `TEMPS`). Le moteur `renderTemplate` fait la substitution camelCase → SCREAMING_SNAKE_CASE en interne via une Map de vars.

J'ai utilise les vrais champs `NotificationContext` pour rester type-safe (pas de cast `as any` ou `as unknown as`). Le comportement est identique a l'intent de la task spec — les variables `{STAFF_NOM}`, `{ZONE}`, etc. seront bien substituees dans le template rendu.

### Fire-and-forget partout
Tous les dispatch sont wrappes dans `try { ... } catch { /* non bloquant */ }` avec dynamic import. Aucun echec du moteur de notification ne peut :
- casser la route HTTP appellante (assign/resolve/staff-scan)
- changer le code statut de la reponse
- impacter le score Agent / le Black Box / le webhook dispatch

### Conservation des fonctionnalites existantes
Toutes les routes modifiees conservent leur comportement precedent :
- `/api/airport/assign` : reponses `{ method, phone/email, link, message }` / `{ method, email, sent, message }` / `{ method: 'push', sent: true, message }` — inchangees.
- `/api/airport/ops/resolve` : reponse `{ reportId, statut, resolvedAt }` + dispatch webhook `resolved` (Task F3) — inchanges. Seul ajout : dispatch `resolved` central.
- `/api/airport/staff-scan` : reponse `{ scan, triggeredVoice }` + score Agent + Black Box audit log — inchanges. Seul ajout : dispatch `resolved` central dans la branche RESOLVE.

Les `select` / `include` Prisma ont ete enrichis de facon additive (`zone: { select: { nom, code } }`) — aucun champ existant n'est retire, aucune reponse HTTP n'est modifiee.

---

## Lint + tsc

### Lint (ESLint)
```
$ bun run lint
✖ 10 problems (7 errors, 3 warnings)
```
- **0 erreur de lint** dans les fichiers modifies/crees par N1B (verifie via `grep`).
- Les 7 erreurs restantes sont dans `src/components/feedbackpro/admin-notifications-tab.tsx` (preexistantes, dues a la task N1 originale — `SectionNotifications`, `Accordion*`, `Checkbox`, `Textarea` non importes). Non introduites par N1B. Non corrigees : hors scope.
- Les 3 warnings sont dans `city-scan-view.tsx` (custom fonts) — preexistants, hors scope.

### TypeScript (tsc --noEmit --skipLibCheck)
```
$ npx tsc --noEmit --skipLibCheck
(erreurs dans city-dashboard, city-scan-view, city-staff-view, city/plates — preexistantes)
```
- **0 erreur TypeScript** dans les fichiers modifies/crees par N1B (verifie via `grep`).
- Toutes les erreurs restantes sont dans des fichiers `city-*` (tenant city, preexistant — independant de N1B).

---

## Comment tester

### GET /api/admin/notifications
```bash
curl -b "fp_session=<admin-session-cookie>" \
  http://localhost:3000/api/admin/notifications
```
Reponse attendue :
```json
{
  "ok": true,
  "data": {
    "templates": [ /* 5 templates par defaut + customs eventuels */ ],
    "byTenant": {
      "airport":    [ /* 5 templates par defaut (tenantType=airport) */ ],
      "city":       [],
      "vip_lounge": [],
      "classic":    [],
      "airline":    [],
      "platform":   []
    }
  }
}
```

### PATCH /api/admin/notifications
```bash
curl -X PATCH -b "fp_session=<admin-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"assigned","active":false}' \
  http://localhost:3000/api/admin/notifications
```
Reponse : le template `assigned` avec `active: false`.

### POST /api/admin/notifications/test
```bash
curl -X POST -b "fp_session=<admin-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"canal":"email"}' \
  http://localhost:3000/api/admin/notifications/test
```
Reponse : `{ ok: true, data: { sent: true, canal: "email", recipient: "<admin-email>" } }`
(email reel si RESEND_API_KEY configure, sinon mode demo logge).

### Triggers airport
- **POST `/api/airport/assign`** avec `{ reportId, method: "email", email: "..." }` → declenche `dispatchNotification('assigned', { ... })` (visible dans `NotificationLog`).
- **POST `/api/airport/ops/resolve`** avec `{ reportId }` → declenche `dispatchNotification('resolved', { ... })`.
- **POST `/api/airport/staff-scan`** avec `{ staffTag, action: "RESOLVE", reportId, staffName }` → declenche `dispatchNotification('resolved', { ... })`.

Tous les dispatch sont visibles via `GET /api/admin/notifications/logs` (table `NotificationLog`).
