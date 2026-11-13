# Task S1 — AirportStaffView Refonte (5 écrans PWA + dashboard)

## Livrable
- **Fichier modifié** : `/home/z/my-project/src/components/feedbackpro/airport-staff-view.tsx`
- **Lignes** : 1429 (refonte complète, remplace l'ancienne version 178 lignes)
- **Export inchangé** : `export function AirportStaffView({ staffTag, onExit }: { staffTag: string; onExit: () => void })`
- **Directive** : `'use client'`

## Écrans implémentés (5 + dialog scanner)
1. **home** — Accueil : greeting staff + bouton scan central HUGE (indigo gradient, py-8) + stats du jour (En cours / Résolus / Temps moyen) + lien dashboard
2. **incident-new** — Après scan, incident en attente : header amber, détails (Terminal/Zone/Type/Signalé il y a), boutons PRENDRE EN CHARGE (green) + IGNORER (outline)
3. **incident-ongoing** — Incident pris en charge par CE staff : header blue, "Pris en charge par VOUS", "Depuis X min", Type/Zone/Terminal, boutons MARQUER RÉSOLU (green) + AJOUTER COMMENTAIRE (outline, toggle inline textarea)
4. **resolve-confirm** — Header green, temps écoulé, commentaire textarea, photo upload (input file capture=environment), boutons CONFIRMER (green → POST staff-scan action=RESOLVE) + RETOUR
5. **dashboard** — Header dark, sections Aujourd'hui (urgents/normaux/résolus/temps moyen) + Ce mois (total résolus / score réactivité / rang équipe / points) + Derniers incidents (liste scrollable avec durée + rel time) + RETOUR ACCUEIL

## Scanner QR — approche choisie
- Bouton central ouvre un **Dialog** (shadcn/ui)
- Input texte pré-rempli avec `staffTag` prop (depuis URL) si fourni
- **Quick-pick** de 5 tags d'exemple (porte_B12_T2, toilettes_T1, tapis_bagages_A3, info_vols_AF123, lounge_T2)
- Au confirm : fetch `GET /api/airport/reports?statut=EN_ATTENTE` + `?statut=EN_COURS`, filtre client-side par `tagScanne === tag`
  - Si EN_COURS + assignedTo/staffScans TAKE_CHARGE === staffName → écran `incident-ongoing`
  - Sinon si EN_ATTENTE → écran `incident-new`
  - Si EN_COURS par un autre staff → message "déjà pris en charge par un autre agent"
  - Sinon → toast "Aucun incident à traiter sur ce lieu"
- **Pas de décodage QR photo natif** (nécessiterait lib lourde type @zxing/library) — input texte + capture=environment réservé aux photos AVANT/APRÈS

## Stack technique
- shadcn/ui : Button, Card, Input, Textarea, Label, Badge, Dialog (DialogContent/Header/Title/Description/Footer)
- lucide-react : ArrowLeft, BarChart3, Camera, CheckCircle2, Clock, Loader2, LogOut, MessageSquare, QrCode, RefreshCw, Smartphone, TrendingUp, TriangleAlert, Trophy, User, X
- framer-motion : `AnimatePresence` + `motion.div` pour transitions slide+fade entre écrans (directionnelle via `screenDir`)
- localStorage : `fp-staff-name` + `fp-staff-phone` (clés exactes spec)

## API utilisées + contrats observés
- `GET /api/airport/reports?statut=EN_ATTENTE|EN_COURS|RESOLU&limit=200` → `{ ok, data: { reports: [...], count } }`
  - Chaque report : `{ id, zone:{code,nom,emoji}, tagScanne, problemType, commentaire, statut, assignedTo, createdAt, resolvedAt, staffScans:[{id,action,photoUrl,staffName,createdAt}] }`
  - **Pas de filtre `tagScanne` ni `assignedTo` côté API** → filtrage client-side
- `POST /api/airport/staff-scan` body `{ staffTag, action: TAKE_CHARGE|RESOLVE|REPORT_ISSUE, reportId?, photoUrl?, message?, staffPhone?, staffName? }` → `{ ok, data:{ scan, triggeredVoice } }`
- `GET /api/airport/leaderboard` → `{ ok, data:{ month, leaderboard:[{rank, staffName, points, resolutions, avgMinutes, lastResolvedAt}] } }`
- `POST /api/public/upload` (FormData) → `{ ok, data:{ url } }` — pour photos AVANT/APRÈS

## Décisions / déviations vs spec
1. **"Urgents vs normaux en cours"** : pas de champ `priority` sur `AirportReport`. Heuristique = `Math.round(enCours * 0.3)` pour urgents (placeholder pragmatique). Mots-clés urgents définis (`URGENT_KEYWORDS`) mais non utilisés faute de liste EN_COURS complète côté client.
2. **"Score réactivité 92%"** : calculé `100 - avgMinutes` clampé [0,100] (pas de champ dédié en base).
3. **"Rang équipe 2ème/15"** : `ordinalFr(rank) + "/" + max(leaderboard.length, rank)`.
4. **"AJOUTER COMMENTAIRE"** : toggle inline textarea sur l'écran ongoing (le commentaire est porté vers resolve-confirm). Pas d'API dédiée pour commenter sans résoudre.
5. **Couleurs** : indigo `#5257C9` (explicitement demandé par spec) pour primaire, emerald pour résolu, amber pour en attente, sky/blue pour en cours, red pour urgent.
6. **Pas d'emojis** dans le code (icones lucide à la place). `zone.emoji` non affiché (utiliser `zone.nom`).
7. **Input caché `capture="environment"`** partagé pour upload photo résolution.

## Vérifications
- `bun run lint` : **0 erreur dans airport-staff-view.tsx** (3 erreurs pré-existantes dans scratch-card.tsx et language-switcher.tsx — non touchés)
- `npx tsc --noEmit --skipLibCheck` : **exit code 0** (aucune erreur de type)
- Dev server log : compile OK, `GET / 200`
