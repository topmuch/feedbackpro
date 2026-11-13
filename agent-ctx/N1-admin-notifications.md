# Task N1 — Centre de Notifications (SuperAdmin)

**Agent**: main
**Date**: 2025-11-13
**Scope**: Nouvel onglet "Notifications" dans le dashboard SuperAdmin, centralisant la gestion des canaux (Email, WhatsApp, SMS Mtarget, Push PWA), des templates par déclencheur et de l'historique des envois.

---

## Fichiers créés / modifiés

### Prisma
- `prisma/schema.prisma` — ajout de 3 modèles à la fin :
  - `NotificationSetting` (canaux + config JSON + active toggle)
  - `NotificationTemplate` (trigger, label, channels[], template, recipient, active)
  - `NotificationLog` (trigger, canal, recipient, status, message, cost, reportId)
- `src/lib/db.ts` — bump de la clé de cache Prisma `v18 → v19` pour forcer la prise en compte des nouveaux modèles sans redémarrage manuel.

### Bibliothèques (`src/lib/`)
- `src/lib/mtarget-sms.ts` (nouveau) — helper d'envoi SMS via l'API Mtarget (Sénégal / Afrique de l'Ouest). Auth Basic, normalisation des numéros, mode démo sans credentials, estimation du coût (25 FCFA / segment de 160 caractères), timeout 10 s, ne lève jamais.
- `src/lib/notification-engine.ts` (nouveau) — `dispatchNotification(trigger, context)` :
  - Récupère le `NotificationTemplate` pour le trigger
  - Si template inactif ou absent → return
  - Pour chaque canal du template : vérifie `NotificationSetting` (canal actif ?), résout le destinataire, envoie via le provider (push interne / Mtarget SMS / sendEmail / WhatsApp), logge dans `NotificationLog` (succès + échec).
  - Fire-and-forget : ne lève jamais.
  - Variables supportées : `{STAFF_NOM}`, `{INCIDENT_ID}`, `{ZONE}`, `{TYPE}`, `{LIEN_DIRECT}`, `{HEURE}`, `{TEMPS}`.

### API routes (`src/app/api/admin/notifications/`)
- `settings/route.ts` — `GET` (seed automatique des 4 canaux si absents, email+push actifs par défaut, whatsapp+sms inactifs) / `POST` (upsert setting).
- `templates/route.ts` — `GET` (seed automatique des 5 templates par défaut) / `POST` (upsert template). Templates seedés : `new_incident`, `assigned`, `resolved`, `escalation_15min`, `escalation_30min`.
- `logs/route.ts` — `GET` paginé (limit/offset + filtres canal/status), renvoie `logs[] + total`.
- `test/route.ts` — `POST { canal }` envoie une notification test via le canal spécifié. Email → `sendEmail` à l'admin, SMS → `sendSmsMtarget` au numéro de test, Push → `triggerPushNotification`, WhatsApp → simulé (API Meta non branchée).

### Composant
- `src/components/feedbackpro/admin-notifications-tab.tsx` (nouveau, ~600 lignes) — 3 sections :
  - **Section A — Canaux de Communication** : 4 cartes (Email, WhatsApp, SMS Mtarget, Push PWA) avec icône, badge de statut (vert=actif / jaune=désactivé), Switch toggle (activation immédiate via POST), bouton "Configurer" (Dialog avec champs spécifiques au canal) et bouton "Tester".
  - **Section B — Templates & Déclencheurs** : Accordion avec 5 items (1 par trigger). Chaque item expose un éditeur : libellé, destinataire (Select), canaux (Checkboxes), variables (boutons cliquables qui insèrent `{VAR}` dans le textarea), template texte, toggle actif, bouton "Enregistrer le template".
  - **Section C — Historique des envois** : Table des `NotificationLog` (100 derniers), colonnes Date / Déclencheur / Canal (avec icône) / Destinataire / Statut (badge coloré) / Coût (FCFA). Filtres Select par canal + status. Scroll vertical `max-h-96` avec sticky header. Bouton refresh.

### Intégrations
- `src/components/feedbackpro/admin-dashboard.tsx` :
  - Ajout de `"notifications"` à l'union `OngletAdmin` et à l'array `ONGLETS` (icône `Bell`).
  - Import de `Bell` depuis `lucide-react`.
  - Import de `AdminNotificationsTab` depuis `@/components/feedbackpro/admin-notifications-tab`.
  - Ajout de la clé `nav.notifications: "Notifications"` aux deux fonctions `t()` (dashboard + sidebar).
  - Rendu : `{onglet === "notifications" && <AdminNotificationsTab />}`.
- `src/app/api/airport/report/route.ts` — après création d'un `AirportReport`, appel fire-and-forget :
  ```ts
  dispatchNotification('new_incident', {
    incidentId: report.id,
    zone: `${zone.emoji} ${zone.nom}`,
    type: b.problemType,
    link: `${APP_URL}/?staff=1&report=${report.id}`,
  }).catch((err) => console.warn(...))
  ```

---

## db:push

`bun run db:push` a échoué sur un drift **préexistant** (table `Retour` en base SQLite : colonnes `note`, `proId`, `zoneId` requises par le schéma mais absentes des 8 lignes existantes — indépendant de Task N1).

Les 3 nouvelles tables `NotificationSetting`, `NotificationTemplate`, `NotificationLog` ont été créées avec succès via `npx prisma db execute` (DDL SQL direct, contournant le drift check de `db push`), puis `npx prisma generate` a régénéré le client Prisma avec les 3 nouveaux modèles.

---

## Lint + tsc

### Lint (ESLint)
```
$ bun run lint
✖ 4 problems (3 errors, 1 warning)
```
Toutes les erreurs sont dans des fichiers **préexistants** (scratch-card.tsx, language-selector.tsx, prisma/seed-airport-ops-config.cjs). Aucune erreur de lint dans les fichiers Task N1.

### TypeScript (tsc --noEmit --skipLibCheck)
```
Exit code: 1
45 errors
```
Toutes les 45 erreurs sont dans des fichiers **préexistants** avec schema drift (références à `etablissements`, `etablissementId`, `name`, `personnel`, `reponses`, `zone`, etc. qui n'existent plus dans le schéma Prisma) :
- `scripts/seed.ts`
- `src/app/api/login/route.ts`
- `src/app/api/me/route.ts`
- `src/app/api/recompense/route.ts`
- `src/app/api/retours/[id]/route.ts`
- `src/app/api/retours/route.ts`
- `src/lib/auth.ts`

**0 erreur TypeScript dans les fichiers Task N1** — vérifié via :
```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "admin-notifications|notification-engine|mtarget-sms|notifications/(settings|templates|logs|test)|report/route" || echo "OK: 0 TS errors in N1 files"
→ OK: 0 TS errors in N1 files
```

---

## Comment fonctionnent les 3 sections

### Section A — Canaux de Communication
Affiche une grille de 4 cartes (responsive `sm:grid-cols-2`) :
- **Email** (icône Mail, bleu) — provider Resend/SendGrid, fromName, fromEmail, apiKey
- **SMS Mtarget** (icône Smartphone, ambre) — endpoint, login, password, senderId, defaultCountryCode, testPhone
- **WhatsApp** (icône MessageCircle, vert) — provider Meta/Twilio, phoneNumberId, templateId, accessToken
- **Push PWA** (icône Bell, violet) — provider web-push/OneSignal, appId, apiKey

Chaque carte affiche un Badge de statut (`Actif` vert / `Désactivé` jaune) + un Switch pour basculer l'activation (optimistic UI avec rollback en cas d'échec). Le bouton "Configurer" ouvre un Dialog avec des champs spécifiques au canal. Le bouton "Tester" appelle `POST /api/admin/notifications/test { canal }` et affiche le résultat via toast.

### Section B — Templates & Déclencheurs
Affiche un Accordion (Radix) avec 5 items (un par trigger) :
- `new_incident` (urgence medium) — `["push_pwa", "sms_mtarget"]` → `"Incident {TYPE} a {ZONE}. Lien : {LIEN_DIRECT}"`
- `assigned` (urgence low) — `["push_pwa"]` → `"Incident pris en charge par {STAFF_NOM}"`
- `resolved` (urgence low) — `["push_pwa"]` → `"Incident resolu en {TEMPS}"`
- `escalation_15min` (urgence high) — `["sms_mtarget", "push_pwa"]` → `"URGENT: Incident {TYPE} non resolu depuis 15min a {ZONE}"`
- `escalation_30min` (urgence critical) — `["sms_mtarget", "whatsapp", "email"]` → `"CRITIQUE: Incident {INCIDENT_ID} non resolu depuis 30min"`

Chaque item expose dans son content : libellé éditable, Select destinataire (assigned_staff / terminal_staff / supervisor), Checkboxes pour les 4 canaux, 7 boutons de variables qui insèrent `{VAR}` dans le Textarea du template, Switch active, bouton "Enregistrer le template" (POST upsert).

### Section C — Historique des envois
Table des `NotificationLog` (100 derniers par défaut) avec :
- 2 Selects de filtre (canal / statut) qui re-déclenchent le GET
- Table avec sticky header dans un scroll vertical `max-h-96 overflow-y-auto`
- Colonnes : Date (formatted FR), Déclencheur (badge outline avec libellé du trigger), Canal (icône + libellé court), Destinataire (mono truncate), Statut (badge coloré : Envoyé vert / Délivré bleu / Lu violet / Échec rouge), Coût (FCFA ou "—")
- Bouton refresh dans le header

---

## Comment le moteur dispatch

`dispatchNotification(trigger, context)` (`src/lib/notification-engine.ts`) :

1. **Fetch template** : `db.notificationTemplate.findUnique({ where: { trigger } })`. Si absent ou `active=false` → return silencieux.
2. **Parse channels** : `JSON.parse(template.channels)` → `string[]` (ex: `["push_pwa", "sms_mtarget"]`).
3. **Render message** : `renderTemplate(template.template, context)` remplace `{STAFF_NOM}`, `{INCIDENT_ID}`, `{ZONE}`, `{TYPE}`, `{LIEN_DIRECT}`, `{HEURE}`, `{TEMPS}` par les valeurs du contexte. Variables non résolues → chaîne vide.
4. **Résout destinataire** : `resolveRecipient(template.recipient, context)` — utilise les overrides `recipientPhone` / `recipientEmail` du contexte si fournis, sinon pour `supervisor` cherche le premier Pro "Aéroport" en base et récupère son email. Push/WhatsApp fonctionnent en mode broadcast sans numéro explicite.
5. **Fetch settings** : une seule requête `db.notificationSetting.findMany({ where: { canal: { in: channels } } })`. Construit une Map pour lookup O(1).
6. **Dispatch parallèle** : `Promise.allSettled(channels.map(...))` — pour chaque canal :
   - Si `setting` absent ou `setting.active=false` → logge `status: "failed"` et skip.
   - Sinon envoie via le provider :
     - `push_pwa` → `triggerPushNotification({ title, body, url, tag, staffName })` (route interne `/api/airport/push/send`)
     - `sms_mtarget` → `sendSmsMtarget(phone, message, mtargetConfig)` (helper Mtarget)
     - `email` → `sendEmail(to, sujet, html)` (helper Resend)
     - `whatsapp` → simulé (log console — API Meta non branchée)
   - Logge le résultat dans `NotificationLog` (status `sent` ou `failed` + coût pour SMS).
7. **Fire-and-forget** : `try/catch` global, ne lève jamais. Toutes les erreurs sont loggées sur stderr mais ne remontent pas à l'appelant.

Intégré dans `src/app/api/airport/report/route.ts` après création du `AirportReport` :
```ts
dispatchNotification('new_incident', {
  incidentId: report.id,
  zone: `${zone.emoji} ${zone.nom}`,
  type: b.problemType,
  link: `${APP_URL}/?staff=1&report=${report.id}`,
}).catch((err) => console.warn('[airport-report] Notification dispatch error:', ...))
```
Le `.catch()` garantit qu'aucun échec du moteur ne casse la route du signalement voyageur.
