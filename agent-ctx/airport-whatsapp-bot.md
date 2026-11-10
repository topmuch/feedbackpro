# WhatsApp Ops Bot — Aéroport (Task ID 6)

Bot WhatsApp pour les équipes opérationnelles aéroport. Les agents
envoient des commandes (`/aide`, `/priorites`, `/resoudre <id>`, …)
à un numéro WhatsApp Business (Twilio) qui les route vers ce webhook
Next.js. Le bot répond en TwiML avec un message concis (≤ ~500 chars),
formaté avec la syntaxe WhatsApp (`*bold*`, `_italic_`).

## Fichiers livrés

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` (model `AirportOpsContact`) | Whitelist des numéros ops autorisés |
| `prisma/seed-airport-ops.cjs` | Seed de 3 contacts de démo (Marc / Sophie / Pierre) |
| `src/lib/airport-bot.ts` | Parseur de commandes + générateur de réponses |
| `src/app/api/airport/whatsapp-webhook/route.ts` | Webhook Twilio (POST + GET health check) |
| `src/app/api/airport/ops/resolve/route.ts` | Endpoint REST alternatif pour wallboard/dashboard |
| `agent-ctx/airport-whatsapp-bot.md` | Cette doc |

## Configuration Twilio WhatsApp Business

1. **Créer un compte** Twilio + activer le sandbox WhatsApp Business
   (ou un numéro sender officiel pour la prod).
2. **Configurer le webhook** dans la console Twilio :
   - Messaging → "A MESSAGE COMES IN" → Webhook
   - URL : `https://VOTRE_DOMAINE/api/airport/whatsapp-webhook`
   - Méthode : `POST`
3. **Variables d'environnement** (`.env`) :
   ```
   TWILIO_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_PHONE=whatsapp:+33612345678
   AIRPORT_OPS_WHATSAPP=33612345678
   ```
   En l'absence de `TWILIO_TOKEN`, le webhook fonctionne en **mode démo**
   (toutes les requêtes sont acceptées, signature non vérifiée — un
   warning est loggé).
4. **Health check** : `GET /api/airport/whatsapp-webhook` renvoie `200 OK`
   (utile pour uptime monitoring type UptimeRobot).

## Commandes du bot

Toutes les commandes commencent par `/`. Le bot ignore la casse et les
accents (`/priorites` ≡ `/priorités`).

| Commande | Description |
|---|---|
| `/aide` ou `/help` | Liste des commandes |
| `/priorites` | Top 3 zones avec le plus de signalements `EN_ATTENTE` sur 24h |
| `/zone <code>` | État d'une zone (ex: `/zone bagages`) — bilan + 3 derniers signalements |
| `/signalement <id>` | Détail d'un signalement (ID complet ou suffixe de 8 chars) |
| `/resoudre <id>` | Marque un signalement comme `RESOLU`, met `resolvedAt = now` |
| `/stats` | Statistiques 24h : total, en_attente, en_cours, résolus, temps moyen |
| `/liste` | 5 signalements `EN_ATTENTE` les plus récents |

Codes zones valides : `bagages`, `sanitaires`, `files_attente`,
`embarquement`, `restauration`.

Tout message non reconnu renvoie :
> Commande non reconnue. Tapez */aide* pour voir les commandes.

## Sécurité — Whitelist ops

Le bot ne répond **que** aux numéros présents dans `AirportOpsContact`
avec `actif = true`. Un numéro non autorisé reçoit :
> ⛔ Numéro non autorisé. Contactez l'administrateur de l'aéroport pour
> être ajouté à la liste ops.

### Ajouter / désactiver un contact ops

- **Via le seed** : éditer `prisma/seed-airport-ops.cjs` puis
  `node prisma/seed-airport-ops.cjs` (idempotent, upsert par `phone`).
- **Directement en DB** :
  ```js
  await db.airportOpsContact.create({
    data: { phone: '33655554444', name: 'Alice - Sécurité', role: 'securite' }
  })
  ```
- **Désactiver sans supprimer** : `actif = false` (le bot rejettera le numéro).

### Contacts de démo (seed par défaut)

| Phone | Nom | Rôle |
|---|---|---|
| 33612345678 | Marc - Responsable Ops | ops |
| 33698765432 | Sophie - Équipe Nettoyage | nettoyage |
| 33611112222 | Pierre - Maintenance | maintenance |

## Mode démo

En l'absence de `TWILIO_TOKEN`, le webhook accepte toutes les requêtes
sans vérifier la signature Twilio (un warning est loggé à chaque appel).
Cela permet de tester le bot en local via curl sans avoir de compte
Twilio.

**Signature Twilio en production** : si `TWILIO_TOKEN` est présent, le
webhook valide l'en-tête `X-Twilio-Signature` (HMAC-SHA1 du payload avec
l'URL publique comme données). Une signature invalide renvoie un TwiML
d'erreur 403 — Twilio ne fait pas de retry sur les 4xx autres que 401/403.

## Endpoint REST alternatif

Pour le wallboard / dashboard ops (cas où l'équipe n'utilise pas WhatsApp
mais un écran mural) :

```
POST /api/airport/ops/resolve
Content-Type: application/json

{ "reportId": "<cuid>", "phone": "33612345678" }
```

- `phone` est optionnel (audit only)
- Réponse : `{ ok: true, data: { reportId, statut: "RESOLU", resolvedAt: "ISO" } }`
- Si le signalement avait `whatsappOptin = true`, logge le TODO de
  notification voyageur (en production : envoie un WhatsApp au voyageur
  pour l'informer de la résolution).

## Vérification rapide (mode démo)

```bash
# /aide
curl -s -X POST http://localhost:3000/api/airport/whatsapp-webhook \
  -d "From=whatsapp:%2B33612345678" \
  -d "Body=/aide"

# Numéro non autorisé
curl -s -X POST http://localhost:3000/api/airport/whatsapp-webhook \
  -d "From=whatsapp:%2B33699999999" \
  -d "Body=/aide"

# Health check
curl -s http://localhost:3000/api/airport/whatsapp-webhook
```
