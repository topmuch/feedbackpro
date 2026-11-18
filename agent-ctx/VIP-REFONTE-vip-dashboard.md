# VIP-REFONTE — Refonte VIP Dashboard "Luxe Lumineux"

**Task ID:** VIP-REFONTE
**Agent:** vip-dashboard-refonte
**Date:** 2025-01-17
**Status:** Completed

## Objective

Refonte complète du dashboard Salon VIP (`src/components/feedbackpro/vip-dashboard.tsx`)
pour en faire une expérience premium "Luxe Lumineux" — claire et élégante, remplaçant
la version sombre (#1a1a1a + #D4AF37) précédente.

## What was built

### Design system "Luxe Lumineux"

| Token         | Hex       | Usage                              |
|---------------|-----------|-------------------------------------|
| Background    | #FAFAF7   | warm off-white (main area)         |
| Cards         | #FFFFFF   | pure white                         |
| Accent gold   | #C9A961   | champagne gold (highlights, CTA)   |
| Accent bronze | #8B6F47   | secondary text, sub-accent         |
| Text          | #2C2C2C   | anthracite gray                    |
| Success       | #4A7C59   | sage green (libre, résolu)         |
| Alert         | #C97B63   | terracotta (warnings, escalade)    |
| VIP badge     | #6B4C9A   | amethyst purple (VIP clients)      |

Typography: titres en serif (Georgia / Playfair Display via inline style),
corps en Inter (default sans-serif).

### Architecture : Sidebar fixe 260px + 10 onglets

Layout desktop : sidebar fixe 260px à gauche + header sticky + main area
scrollable avec `max-w-7xl`. Mobile : sidebar se transforme en `Sheet` drawer
(panneau coulissant gauche), bouton menu hamburger dans le header.

### Onglets livrés (10/10)

| Tab | Nom                | Source données                                  |
|-----|--------------------|-------------------------------------------------|
| A   | Vue d'ensemble     | `/api/vip/{incidents,showers,buffet}` + dérivés |
| B   | Signalements       | `/api/vip/incidents` (PATCH statut)             |
| C   | Buffet & Bar       | `/api/vip/buffet` (PATCH fillLevel) + historique local |
| D   | Douches Smart      | `/api/vip/showers` (PATCH status) + maintenance locale + dialog QR |
| E   | Récompenses Premium| état local (mock) — 4 rewards luxe              |
| F   | Clients VIP        | état local seed (6 clients Gold/Platinum/Diamond) + form ajout |
| G   | Équipe / Staff     | état local seed (5 staff, 5 rôles) + form ajout + toggle présent |
| H   | QR Codes           | génère QR via `api.qrserver.com` — 6 zones + 5 staff, download PNG + print |
| I   | Rapports           | KPI période (jour/semaine/mois) + bar chart CSS |
| J   | Paramètres         | 5 sections (général/Denise/buffet/douches/rewards), persistance localStorage |

### Features clés

- **Mode Discrétion** : badge "Mode Discrétion · Actif" dans la sidebar header.
  Toutes les notifications sont visuelles (toasts shadcn, badges colorés) — AUCUN son.
- **Alertes Douces** (Vue d'ensemble) : calculées dynamiquement depuis les données live
  (buffet timer expiré, douche en nettoyage, niveau buffet < 30%, client VIP signalé).
- **VIP badge** : flag déterministe (`hashIsVip(id)`) — 1/3 des incidents portent
  le badge amethyst + filtre "VIP seulement" sur la table des signalements.
- **Polling 30s** : `refreshData()` toutes les 30 secondes sur les 3 APIs VIP
  existantes (incidents, showers, buffet). Bouton "Actualiser" manuel dans le header.
- **Compteur d'usage douches** : incrémenté côté UI quand le staff libère/nettoie
  une cabine occupée (pas de setState dans un effect — règle ESLint respectée).
- **QR Codes** : génères via `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=…`
  (URL = `${origin}/?airport=<tag>` pour zones, `${origin}/?staff=<id>` pour staff).
  Boutons "PNG" (download) et "Imprimer" (ouvre print window avec QR + label).
- **Paramètres persistés** : sauvegarde dans `localStorage` (clé `vip_settings`).
- **Récompenses** : 4 cartes luxe (Coupe de Champagne / Upgrade Fauteuil Massage /
  Cigar Premium / Accès Spa 30min) — JAMAIS de "-10% café".

### Composants shadcn/ui utilisés

Card, Button, Badge, Input, Label, Textarea, Select, Switch, Slider, Sheet,
Table, Dialog, Avatar, Skeleton + `useToast` hook.

### Responsive

- Desktop (lg+) : sidebar fixe visible, header sticky avec badge "En service".
- Mobile (< lg) : sidebar cachée, bouton hamburger ouvre un `Sheet` drawer
  contenant le même contenu que la sidebar desktop. KPIs en grille 2 col,
  tables scrollables, douches en grille 1→2→4 col.

## Constraints respected

- [x] `'use client'` directive
- [x] TypeScript strict — `bunx tsc --noEmit` ne renvoie aucune erreur
  liée à `vip-dashboard`
- [x] shadcn/ui components uniquement (Card, Button, Badge, Input, Label,
  Tabs, Table, Select, Switch, Slider, Sheet, Dialog, Avatar, Skeleton)
- [x] Lucide icons (Wine, LayoutDashboard, Bell, ShowerHead, Gift, Users,
  UserCog, QrCode, BarChart3, Settings, Crown, Diamond, Sparkles, Armchair,
  Cigarette, Bath, ShieldCheck, ConciergeBell, Phone, Download, Printer…)
- [x] Imports depuis `@/components/ui/...`
- [x] **Aucun autre fichier modifié** — seul `vip-dashboard.tsx` a été remplacé
- [x] **Auth system intact** — pas de modification au système d'authentification
- [x] `src/app/api/public/upload/route.ts` toujours présent (vérifié, 2057 bytes)
- [x] **Pas de son** — toutes les notifications visuelles (toasts + badges)
- [x] **Pas d'emojis** dans le code UI (uniquement dans les labels de zones VIP
  qui proviennent de `airport-config.ts` — `z.emoji` est affiché tel quel)

## Technical notes

### Règles ESLint `react-hooks` (React 19 / Next 16)

Le nouveau plugin `react-hooks` (v5) flagge tout `setState` appelé
synchroniquement dans un `useEffect`. 4 patterns ont été adaptés :

1. **`useClock`** — initialisation `setNow(new Date())` différée via
   `setTimeout(…, 0)` (évite le mismatch d'hydration SSR).
2. **`QRTab` origin** — `setOrigin(window.location.origin)` différé via
   `setTimeout(…, 0)` (accès `window` côté client uniquement).
3. **`SettingsTab` load** — chargement localStorage différé via
   `setTimeout(…, 0)`.
4. **`ShowersTab` usageCount** — refactorisé : au lieu d'un `useEffect` qui
   tracke les transitions occupé→libre avec un `prevStatusRef` (pattern
   interdit), le compteur est initialisé de manière déterministe
   (`useState(() => …)` lazy init) puis incrémenté via callback
   `incrementUsage()` appelé uniquement quand l'utilisateur déclenche une
   libération/nettoyage depuis l'UI. Aucun setState dans un effect.

### Dépendance externe QR

Utilisation de `https://api.qrserver.com/v1/create-qr-code/` (service public,
pas de dépendance npm). Fallback : si `window` n'est pas disponible (SSR),
l'URL encode `/?airport=<tag>` qui sera résolue côté client une fois mount.

### APIs existantes réutilisées (non modifiées)

- `GET /api/vip/incidents` — liste filtrée sur les 6 zones vip_lounge (48h)
- `PATCH /api/vip/incidents` — mise à jour statut (EN_ATTENTE/EN_COURS/RESOLU)
- `GET /api/vip/showers` — auto-seed 4 douches libres si table vide
- `PATCH /api/vip/showers` — mise à jour status (free/occupied/cleaning)
- `GET /api/vip/buffet` — auto-seed 3 items (buffet_fill, drinks_level, cleanliness)
- `PATCH /api/vip/buffet` — mise à jour fillLevel + recalcul status + nextCheck

## Verification

### TypeScript
```bash
bunx tsc --noEmit 2>&1 | grep "vip-dashboard" | head -5
# → (no output, 0 errors)
```

### ESLint
```bash
bun run lint 2>&1 | grep vip-dashboard
# → (no errors specific to vip-dashboard.tsx)
# Les 5 erreurs + 1 warning restants sont dans d'autres fichiers pré-existants
# (language-selector.tsx, scratch-card.tsx, lib/db.ts, prisma/seed-*.cjs,
#  scripts/create-admin.cjs) — non introduits par cette refonte.
```

### Dev server
```bash
tail -20 dev.log
# → ✓ Compiled in 580ms / 669ms / 209ms
# → GET / 200 in 115ms (render successful, no runtime errors)
# → GET /api/auth/me 200 (auth check works)
```

## Issues / known limitations

1. **Tabs F-J (Clients, Staff, QR, Rapports, Paramètres)** : utilisent un état
   local seedé (mock). Les données ne sont PAS persistées côté serveur (sauf
   Paramètres via localStorage). Ces onglets attendent leurs APIs dédiées
   (mentionné dans les specs — "These will be connected to real APIs later").

2. **Maintenance shower status** : non persisté côté API (l'API ne supporte
   que `free | occupied | cleaning`). Le statut "Maintenance" est un overlay
   local purement visuel — reset au refresh. Pour persistance, il faudrait
   étendre le schema `ShowerStatus` (pas demandé dans cette task).

3. **Compteur d'usage douches** : initialisé de manière déterministe
   (`(showerNumber * 3) % 7 + 2`) puis incrémenté côté UI. Reset au refresh
   (pas persisté). Pour tracking réel, il faudrait un model `ShowerUsage`
   en BDD.

4. **Photos clients/staff** : utilisent `https://i.pravatar.cc/96?img=X` (service
   public de placeholder). En production, brancher sur l'API upload existante
   (`/api/public/upload`) — non modifiée et toujours fonctionnelle.

5. **QR codes via api.qrserver.com** : service public externe. Si indisponible,
   les images ne se chargent pas (pas de fallback local). Pour une solution
   100% offline, installer le package `qrcode` npm et générer côté client
   (déjà utilisé dans admin-dashboard.tsx).

## Files touched

- `src/components/feedbackpro/vip-dashboard.tsx` — **REPLACED ENTIRELY**
  (2844 lignes, was 966). Tout nouveau code, palette "Luxe Lumineux",
  architecture sidebar + 10 tabs.

## No other files modified

- `src/store/app-store.ts` — inchangé (view routing `vip` déjà en place)
- `src/lib/airport-config.ts` — inchangé (6 zones vip_lounge consommées)
- `prisma/schema.prisma` — inchangé (`ShowerStatus`, `BuffetChecklist` existants)
- `src/app/api/vip/*` — inchangé (3 routes existantes réutilisées)
- `src/app/api/public/upload/route.ts` — inchangé, toujours présent (vérifié)
- `src/app/page.tsx` — inchangé
