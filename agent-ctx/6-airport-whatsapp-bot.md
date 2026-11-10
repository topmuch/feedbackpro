# Task 6 — WhatsApp Ops Bot Aéroport (work record)

## Agent
Task ID 6 — WhatsApp Ops Bot builder

## Contexte
Suite de la feature aéroport (PWA de signalement voyageurs). Les
modèles `AirportZone` et `AirportReport` existent déjà ainsi que les
API `/api/airport/reports`, `/api/airport/report`, `/api/airport/whatsapp-optin`.
Le besoin : un bot WhatsApp que les équipes ops peuvent interroger
depuis le terrain pour connaître l'état des signalements, les
résoudre, et consulter les priorités.

## Livrables

| Fichier | Lignes | Rôle |
|---|---|---|
| `prisma/schema.prisma` (model `AirportOpsContact`) | 20 (ajout) | Whitelist des numéros ops autorisés |
| `prisma/seed-airport-ops.cjs` | 54 | Seed idempotent de 3 contacts démo (Marc / Sophie / Pierre) |
| `src/lib/airport-bot.ts` | 423 | Parseur de commandes + générateur de réponses |
| `src/app/api/airport/whatsapp-webhook/route.ts` | 186 | Webhook Twilio (POST TwiML + GET health check) |
| `src/app/api/airport/ops/resolve/route.ts` | 90 | Endpoint REST alternatif pour wallboard |
| `agent-ctx/airport-whatsapp-bot.md` | 134 | Doc utilisateur (config Twilio, commandes, mode démo) |

## Décisions techniques

- **Cache PrismaClient** : le cache global du singleton Prisma était
  stale après `prisma db:push`. Bump de la clé
  `prisma_v12_secteur_config` → `prisma_v13_airport_ops_contact` dans
  `src/lib/db.ts` pour forcer la création d'une nouvelle instance avec
  le modèle `AirportOpsContact`. Dev server redémarré pour appliquer.
- **Webhook Twilio** : validation HMAC-SHA1 de l'en-tête
  `X-Twilio-Signature` (avec `TWILIO_TOKEN`), mode démo sinon (warning
  loggé). Pas de 500 — toujours un TwiML d'erreur convivial.
- **Bot** : 7 commandes + aide. Réponses ≤ ~500 chars, format WhatsApp
  (`*bold*`, `_italic_`). Whitelist ops (`actif=true`) sinon message
  "non autorisé". ID court (suffixe 8 chars) supporté pour
  `/signalement` et `/resoudre`.
- **REST /ops/resolve** : logge `[airport] TODO: notify voyageur …`
  quand le signalement a `whatsappOptin=true`. Statut `RESOLU` +
  `resolvedAt = now()`.

## Vérifications (curl, mode démo — TWILIO_TOKEN absent)

| Test | Commande | Résultat |
|---|---|---|
| 1 | `POST /aide` (numéro autorisé) | ✅ TwiML avec liste des 7 commandes |
| 2 | `POST /priorites` | ✅ Top 3 zones (bagages 2, sanitaires 1, restauration 1) |
| 3 | `POST /liste` | ✅ 4 signalements EN_ATTENTE avec short IDs |
| 4 | `POST /zone bagages` | ✅ Bilan + 3 derniers signalements |
| 5 | `POST /stats` | ✅ Total/attente/cours/résolus + temps moyen |
| 6 | `POST /signalement <short id>` | ✅ Détail complet (zone, statut, problème, commentaire) |
| 7 | `POST /resoudre <short id>` | ✅ Marqué RESOLU + notif voyageur affichée |
| 8 | `POST /signalement` (résolu) | ✅ Statut 🟢 Résolu + date de résolution |
| 9 | `POST /aide` (numéro 33699999999 non whitelisté) | ✅ "Numéro non autorisé" |
| 10 | `POST bonjour` (commande inconnue) | ✅ "Commande non reconnue" |
| 11 | `GET` (health check) | ✅ 200 "OK" |
| 12 | `POST /zone foo` (code invalide) | ✅ Liste des codes valides |
| 13 | `POST /api/airport/ops/resolve` (report existant) | ✅ `{ok:true, data:{reportId,statut:"RESOLU",resolvedAt}}` |
| 14 | `POST /api/airport/ops/resolve` (id inexistant) | ✅ 404 `{ok:false,error:"Signalement introuvable"}` |
| 15 | `POST /api/airport/ops/resolve` (sans reportId) | ✅ 400 `{ok:false,error:"reportId manquant"}` |
| 16 | `POST /api/airport/ops/resolve` (report avec optin) | ✅ Log serveur `[airport] TODO: notify voyageur 33677778888 …` |

## TS / Lint

- `bunx tsc --noEmit --skipLibCheck` → 0 erreur sur les nouveaux
  fichiers (`airport-bot.ts`, `whatsapp-webhook/route.ts`,
  `ops/resolve/route.ts`). Les erreurs préexistantes dans
  `scripts/seed.ts` et `src/app/api/retours/[id]/route.ts` sont
  antérieures à cette tâche.
- `bun run lint` → 0 erreur/warning sur les nouveaux fichiers
  (après ajout de `/* eslint-disable @typescript-eslint/no-require-imports */`
  dans `seed-airport-ops.cjs`). Les erreurs résiduelles concernent
  `scratch-card.tsx` et `language-selector.tsx` (préexistantes).

## Étapes post-déploiement (production)

1. Configurer `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_PHONE`,
   `AIRPORT_OPS_WHATSAPP` dans `.env`.
2. Pointer le webhook Twilio WhatsApp Business vers
   `/api/airport/whatsapp-webhook`.
3. Brancher `src/lib/twilio.ts` (ou l'API WhatsApp Business) sur le
   TODO `[airport] TODO: notify voyageur …` du route
   `/api/airport/ops/resolve` pour réellement envoyer la notification
   WhatsApp au voyageur.
4. Ajouter les contacts ops réels (édition du seed ou upsert direct).
