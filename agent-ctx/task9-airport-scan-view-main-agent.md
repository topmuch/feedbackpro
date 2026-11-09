# Task 9 — AirportScanView (PWA voyageur aéroport)

## Objectif
Construire le composant React `AirportScanView` pour la PWA de signalement
de problèmes voyageur en aéroport. Next.js 16 client component, TypeScript +
Tailwind v4 + shadcn/ui.

## Fichier livré
`src/components/feedbackpro/airport-scan-view.tsx` (~810 lignes, autonome,
aucun couplage avec `scan-view.tsx`).

## Architecture

### Machine à phases (spec stricte respectée)
```
loading → error | zone_detectee → probleme_choisi → confirmation
```

### Types locaux
- `Phase` — union des 5 phases
- `ZoneData` — match exact de `GET /api/airport/zone/[tag]`
- `ReportResult` — match exact de `POST /api/airport/report`
- `WhatsappOptinResult` — match exact de `POST /api/airport/whatsapp-optin`

### Helpers fetch (enveloppe `{ ok, data } | { ok: false, error }`)
- `apiGet<T>(url)` — GET JSON, lève sur `!ok`
- `apiPost<T>(url, body)` — POST JSON, lève sur `!ok`
- `masquerTelephone(phone)` — masque milieu du numéro pour l'affichage
- `formaterDate(iso)` — date FR lisible (JJ/MM/AAAA HH:mm)

### State (tous les états spec sont présents)
`phase`, `zoneData`, `selectedProblem`, `highlightedProblem`, `commentaire`,
`photoUrl`, `photoUploading`, `photoError`, `submitting`, `submitError`,
`reportResult`, `whatsappPhone`, `whatsappSubmitting`, `whatsappSubmitted`,
`whatsappError`.

### Effet de mount
`useEffect` sur `[tag]` → fetch zone → `loading` → `zone_detectee` | `error`.
Re-fetch automatique quand le tag change (géré par dépendance).

## Détails UX par phase

### loading
- Fond `bg-slate-950` (cohérent avec le bandeau sombre aéroport)
- Carte sombre avec icône Plane + Loader2 en overlay
- Texte "Détection de votre zone…" + sous-titre "Aéroport — Service voyageur"

### error
- AlertTriangle orange sur fond sombre
- Titre "Zone inconnue" + texte explicatif
- Affiche le tag scanné en monospace
- Bouton "Quitter" → `onExit`

### zone_detectee
- **Bandeau sombre** `bg-slate-900 text-white` avec Plane + "AÉROPORT" + bouton X
- **Hero zone** : emoji `text-6xl`, nom `text-3xl font-black`, description,
  pill "Vous êtes ici" avec MapPin + tagScanne en monospace
- **Titre** "Quel est le problème ?"
- **4 boutons problèmes** (1-colonne, spec) :
  - Pleine largeur, white card, border, `py-5`, `min-h-[60px]`
  - `border-l-4` qui devient amber-500 quand sélectionné
  - Au clic : highlight (`border-amber-500 bg-amber-50 ring-2 ring-amber-200`
    + CheckCircle2 à droite) puis auto-advance après 250 ms

### probleme_choisi
- **Header sticky** sombre avec bouton "← Changer" + zone (emoji+nom) + X
- **Carte amber** CheckCircle2 + problème sélectionné
- **Textarea commentaire** (label + placeholder exact spec, maxLength 1000)
- **Photo optionnelle** :
  - Input file caché `sr-only` avec `accept="image/*"` `capture="environment"`
  - Bouton dashed "Ajouter une photo" avec Camera icon
  - Loader2 pendant l'upload (`/api/public/upload`)
  - Preview thumbnail + bouton X pour retirer
  - Message d'erreur si échec
- **Bouton submit** `bg-rose-600 text-white py-5 text-lg font-bold rounded-2xl
  w-full` avec icône Send. État désactivé : Loader2 + "Envoi en cours…"
- Submit → `POST /api/airport/report` → `confirmation`

### confirmation
- Pas de header strip (plein écran centré)
- **Coche verte** `size-24` avec animation `animate-in fade-in zoom-in-50
  duration-500` (tw-animate-css)
- "Merci !" en `text-4xl font-black`
- Message de réassurance
- **Carte récap** : emoji+nom zone, problème, ID+timestamp
- **Section opt-in WhatsApp** (emerald) :
  - Titre + description
  - Input tel avec placeholder `+33 6 12 34 56 78`
  - Bouton "Activer la notification" → POST `/api/airport/whatsapp-optin`
  - Après succès : remplacement par message confirmatif avec numéro masqué
    "✅ Vous serez notifié au +33 ******* 78 dès que le problème sera résolu."
- **Tertiaire `<details>`** : "Voir le message envoyé aux équipes"
  - `<pre>` monospace avec `whatsapp.message` formaté
- **Actions bottom** (sticky via `mt-auto` sur `flex flex-col min-h-screen`) :
  - "Signaler un autre problème" → reset vers `zone_detectee` (garde tag/zone)
  - "Quitter" → `onExit`
  - Pied "✈️ Aéroport — Service voyageur"

## Palette (distincte du reste de l'app)
- Bandeau sombre : `bg-slate-900 text-white` (+ `bg-slate-950` loading/error)
- Accent sélection : `amber-500/600/700/900`, `bg-amber-50`
- Succès / opt-in : `emerald-500/600`, `bg-emerald-50/100`
- Action critique : `bg-rose-600`
- Alertes : `text-orange-400` / `text-rose-600`
- **Aucun `bg-primary` indigo** ni `text-[#002e85]` FeedbackPro — l'aéroport
  se distingue visuellement du reste de l'app.

## Conformité spec
- ✅ Mobile-first, viewport 360px OK (`max-w-md mx-auto` + `px-4`)
- ✅ Touch targets ≥44px (exit X `size-11`, phone input `h-11`, bouton
  submit `py-5`, "Signaler un autre" `h-12`, boutons problèmes `min-h-[60px]`)
- ✅ Animations Tailwind (`transition-all duration-200`) + tw-animate-css
  pour le pop-in de la coche succès
- ✅ Accessibilité : tous les boutons icon-only ont `aria-label`, labels
  associés via `htmlFor`, icônes + texte (la couleur n'est jamais le seul
  signal), `aria-hidden` sur les icônes décoratives
- ✅ PWA-friendly : `min-h-screen`, pas de footer flottant, sticky footer
  via `mt-auto` sur `flex flex-col`
- ✅ Sticky header dans `probleme_choisi` (`sticky top-0 z-10`)
- ✅ TypeScript strict, aucun `any`
- ✅ Commentaires en français (cohérents avec le codebase FeedbackPro)
- ✅ Aucun import depuis `scan-view.tsx` (composant autonome)

## Vérifications
- `bunx tsc --noEmit --skipLibCheck` : ✅ aucun warning sur le fichier
- `bun run lint` : ✅ aucun warning sur le fichier
- `GET /api/airport/zone/tapis_bagages_1` : ✅ 200, payload conforme
- `GET /?airport=tapis_bagages_1` : ✅ 200 (44 KB, la page compile côté
  client avec l'AirportScanView)
- `dev.log` : ✅ plus d'erreur `module-not-found` après création du fichier

## Notes d'implémentation
- L'auto-advance de 250 ms utilise `window.setTimeout` (React 18+ ne warn
  plus sur setState après unmount, donc pas besoin de cleanup du timer).
- Le `useEffect` de fetch utilise un flag `cancelled` pour ignorer les
  réponses qui arrivent après un changement de tag.
- L'input file est `sr-only` avec un `Label htmlFor` associé — cliquer sur
  le label ou sur le bouton visible déclenche tous deux l'ouverture du
  picker (double accessibilité).
- La regex de validation téléphone côté client est permissive
  (`^\+?\d{8,15}$`) — le serveur re-normalise via `replace(/[^\d]/g, '')`.
- Pour "Signaler un autre problème", on reset tout sauf `zoneData` (le tag
  n'a pas changé, pas besoin de re-fetch).
