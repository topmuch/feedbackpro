# Task ID : feedbackpro-multi-features
# Agent : main (Z.ai Code)
# Date : session 7-tâches FeedbackPro

## Contexte initial

Utilisateur a demandé 7 tâches sur `/home/z/feedbackpro/` (Next.js 16 +
TypeScript + Tailwind 4 + shadcn/ui + Prisma SQLite + Zustand SPA,
dev server sur port 3001) :

1. Fix logo dans superadmin + dashboard client (logo transparent)
2. Référencement SEO dans superadmin Paramètres
3. Messagerie dans superadmin + page contact connectée
4. Page Contact (App Router)
5. Page À propos (App Router)
6. Landing en multipages App Router
7. Logo dans toutes les nouvelles pages

## Travail réalisé — résumé par tâche

### Tâche 1 — Fix logo (FAIT)

- `src/components/feedbackpro/admin-dashboard.tsx` (ligne ~388) : `src="/logo-feedbackpro.png"` → `src="/logo-feedbackpro-transparent.png"` (filtre `brightness-0 invert` conservé).
- `src/components/feedbackpro/pro-dashboard.tsx` (ligne ~451) : même remplacement.
- Vérifié : le logo transparent s'affiche en blanc sur fond bleu #002e85.

### Tâche 2 — Référencement SEO (FAIT)

- `src/app/api/admin/settings/route.ts` :
  - Ajouté `metaTitle`, `metaDescription`, `metaKeywords`, `ogTitle`, `ogDescription` au `patchSchema` (zod, avec limits 60/160/300/80/200).
  - Ajouté `CLES_SETTINGS_SEO` et `DEFAUTS_SEO` (vides par défaut = fallback metadata statiques).
  - Étendu `settingsAvecDefauts()` pour créer les 5 entrées SEO manquantes au premier GET.
- `src/app/layout.tsx` :
  - Converti `export const metadata` statique en `export async function generateMetadata()` qui lit les 5 clés SEO via `getSetting()` (helper `@/lib/settings`).
  - Fallback silencieux sur les valeurs par défaut en cas d'échec BDD.
- `src/components/feedbackpro/admin-dashboard.tsx` → `ParametresTab` :
  - Étendu `SettingsForm` avec les 5 champs SEO.
  - Ajouté une Card "Référencement SEO" avec compteurs de caractères (60/160) et placeholders informatifs.
  - Le PATCH envoie tous les champs SEO en même temps que les autres.

### Tâche 3 — Messagerie superadmin + page contact connectée (FAIT)

**3a. Prisma** — `prisma/schema.prisma` : ajouté `model Message` (id, nom, email, sujet, message, lu, createdAt, @@index[lu, createdAt]). `bunx prisma db push --accept-data-loss && bunx prisma generate` OK. Dev server redémarré.

**3b. API**
- `POST /api/contact` (public) : `src/app/api/contact/route.ts` — zod validation (nom 2-80, email, sujet 3-120, message 10-2000), crée un `Message`, retourne `{id}`.
- `GET /api/admin/messages` (superadmin only) : `src/app/api/admin/messages/route.ts` — liste 200 plus récents + `nonLus` + `total`.
- `POST /api/admin/messages` (superadmin only) : `{action: "marquerLu" | "supprimer", id}`.

**3c. Onglet Messages dans superadmin** — `src/components/feedbackpro/admin-dashboard.tsx` :
- Ajouté `"messages"` à `OngletAdmin` et à `ONGLETS` (icône `Mail`).
- `AdminDashboard` charge `messagesNonLus` au boot + quand on entre dans l'onglet Messages (setTimeout pour éviter setState synchrone en effect, lint react-hooks).
- `ContenuSidebarAdmin` affiche un badge rose avec compteur sur l'entrée "Messages".
- Ajouté `MessagesTab` (en bas du fichier) : KPI cards (total/non lus/lus), liste cliquable, détail du message sélectionné (sujet, expéditeur, date, contenu), boutons "Marquer comme lu", "Répondre par email" (mailto:), "Supprimer".

### Tâche 4 — Page Contact (FAIT)

- `src/app/contact/page.tsx` : Server Component avec metadata dédiée.
  - Hero "Contactez FeedbackPro".
  - 3 cards coordonnées : Sicap Foire Dakar · +221 77 382 18 22 · contact@gofeedbackpro.com (chaque card avec action : Voir l'itinéraire / Appeler / Écrire).
  - Iframe Google Maps (`https://www.google.com/maps?q=Sicap+Foire+Dakar+Sénégal&output=embed`).
  - Lien "Voir l'itinéraire sur Google Maps" (api=1&destination=...).
  - Encart horaires.
  - Formulaire de contact (composant client `ContactForm`) → POST /api/contact → toast "Message envoyé ✓".
- `src/components/feedbackpro/contact-form.tsx` : client component avec validation, états erreurs, indicateur d'envoi, reset après succès.

### Tâche 5 — Page À propos (FAIT)

- `src/app/a-propos/page.tsx` : Server Component avec metadata dédiée.
  - Hero "À propos de FeedbackPro".
  - Section Mission (carte bicolore bleu profond + texte) : "Transformer chaque client en auditeur qualité grâce à l'IA".
  - Section "Comment ça marche" : 4 étapes (QR Code → Scan → IA → Rapport) avec icônes Lucide.
  - Section "Pourquoi FeedbackPro" : 3 avantages (10× moins cher, temps réel, IA actionnable).
  - Section "L'équipe" : 3 cards (Awa Mbaye CEO, Moussa Diallo CTO, Fatou Ndiaye Head of CS) avec bios.
  - Section "Nos valeurs" : Qualité, Innovation, Proximité client.
  - CTA contact + CTA final.

### Tâche 6 — Landing multipages (FAIT)

Création de 7 nouvelles pages App Router :
1. `src/app/fonctionnalites/page.tsx` : Bento grid 6 features + section 7 problèmes résolus.
2. `src/app/cas-usage/page.tsx` : 5 tabs secteurs (Hôtellerie, Restauration, Retail, Santé, Administrations) via composant client `UseCasesTabs`.
3. `src/app/tarifs/page.tsx` : 3 plans (Starter 29 €, Pro 99 €, Enterprise 249 €) + toggle mensuel/annuel (-20 %) via composant client `PricingToggle` + section garanties.
4. `src/app/comparaison/page.tsx` : Tableau Traditionnel vs FeedbackPro (6 critères) + 3 stats clés (10×, 30×, 100×).
5. `src/app/temoignages/page.tsx` : 3 témoignages + 4 stats + encart "Et vous ?".
6. `src/app/faq/page.tsx` : 8 questions en accordion (composant client `FaqAccordion`) + bloc contact support.
7. `src/app/demo/page.tsx` : Mockup vidéo (rapport du jour) + bouton play + 4 étapes + 3 points forts.

**Navigation landing mise à jour** — `src/components/feedbackpro/landing-view.tsx` :
- `NAV_LINKS` : `id` → `href` ("/fonctionnalites", "/cas-usage", "/tarifs", "/faq").
- Header desktop : `<button onClick={allerVers}>` → `<a href>`.
- Sheet mobile : idem.
- Footer Produit : Fonctionnalités, Comment ça marche, Cas d'usage, Tarifs, Comparatif → vraies pages.
- Footer Ressources : FAQ, Témoignages, À propos, Contact → vraies pages.

**Shared marketing shell** — `src/components/feedbackpro/marketing-shell.tsx` :
- `MarketingHeader` : logo + nav desktop (8 liens) + CTA "Se connecter"/"Essayer gratuitement" (liens `/?auth=login` et `/?auth=register` pour déclencher le mode auth Zustand côté SPA racine) + burger mobile `<details>`.
- `MarketingFooter` : 4 colonnes (FeedbackPro / Produit / Ressources / Légal) + logo transparent avec `brightness-0 invert`.
- `MarketingCTA` : bloc CTA final réutilisable (titre, sous-titre, bouton configurables).
- `MarketingLayout` : assemble Header + main + Footer.

**Données partagées** — `src/lib/landing-data.ts` :
- Extrait les constantes (PROBLEM_CARDS, STEPS, FEATURES, USE_CASES, COMPARISON_ROWS, TESTIMONIALS, FAQ_ITEMS, PRICING) en un module unique réutilisable par les nouvelles pages.
- Permet d'éviter la duplication de ~600 lignes de copy marketing.

**Composants client dédiés** (pour préserver les pages serveur et leur metadata) :
- `src/components/feedbackpro/faq-accordion.tsx` : Accordion shadcn.
- `src/components/feedbackpro/use-cases-tabs.tsx` : Tabs shadren + 5 secteurs (import direct des données pour éviter de passer des icônes Lucide en prop depuis un Server Component).
- `src/components/feedbackpro/pricing-toggle.tsx` : Toggle mensuel/annuel + grille de plans.
- `src/components/feedbackpro/contact-form.tsx` : formulaire POST /api/contact.

### Tâche 7 — Logo dans toutes les nouvelles pages (FAIT — automatique)

- Header des nouvelles pages : `src="/logo-feedbackpro.png"` (fond clair, sans filtre) dans `MarketingHeader`.
- Footer des nouvelles pages : `src="/logo-feedbackpro-transparent.png"` avec `brightness-0 invert` (fond sombre) dans `MarketingFooter`.
- Cohérent sur les 9 nouvelles pages (contact, a-propos, fonctionnalites, cas-usage, tarifs, comparaison, temoignages, faq, demo).

## Fichiers modifiés/créés

### Modifiés
- `prisma/schema.prisma` (+21 lignes : model Message)
- `src/app/api/admin/settings/route.ts` (+35 lignes : SEO fields)
- `src/app/layout.tsx` (metadata statique → generateMetadata dynamique)
- `src/components/feedbackpro/admin-dashboard.tsx` (+427 lignes : onglet Messages, badge non-lus, section SEO ParametresTab, MessagesTab)
- `src/components/feedbackpro/landing-view.tsx` (NAV_LINKS href, footer liens)
- `src/components/feedbackpro/pro-dashboard.tsx` (logo transparent)

### Créés
- `src/app/api/contact/route.ts`
- `src/app/api/admin/messages/route.ts`
- `src/app/contact/page.tsx`
- `src/app/a-propos/page.tsx`
- `src/app/fonctionnalites/page.tsx`
- `src/app/cas-usage/page.tsx`
- `src/app/tarifs/page.tsx`
- `src/app/comparaison/page.tsx`
- `src/app/temoignages/page.tsx`
- `src/app/faq/page.tsx`
- `src/app/demo/page.tsx`
- `src/components/feedbackpro/marketing-shell.tsx`
- `src/components/feedbackpro/contact-form.tsx`
- `src/components/feedbackpro/faq-accordion.tsx`
- `src/components/feedbackpro/use-cases-tabs.tsx`
- `src/components/feedbackpro/pricing-toggle.tsx`
- `src/lib/landing-data.ts`

## Vérifications finales

- `bunx tsc --noEmit` → exit 0 (0 erreur TypeScript).
- `bun run lint` → 0 erreur sur les fichiers modifiés/créés. Les 2 erreurs restantes (language-selector.tsx `document.cookie` et db.ts unused eslint-disable) sont préexistantes et n'ont pas été introduites par cette session.
- `curl http://localhost:3001/` → 200.
- `curl http://localhost:3001/contact` → 200.
- `curl http://localhost:3001/a-propos` → 200.
- `curl http://localhost:3001/fonctionnalites` → 200.
- `curl http://localhost:3001/cas-usage` → 200.
- `curl http://localhost:3001/tarifs` → 200.
- `curl http://localhost:3001/comparaison` → 200.
- `curl http://localhost:3001/temoignages` → 200.
- `curl http://localhost:3001/faq` → 200.
- `curl http://localhost:3001/demo` → 200.
- `curl POST /api/auth/login` (demo@pizzeria.fr) → `{"ok":true,...}`.
- `curl POST /api/auth/login` (admin@feedbackpro.fr) → `{"ok":true,...}`.
- `curl POST /api/contact` (payload valide) → `{"ok":true,"data":{"id":"..."}}`.
- `curl GET /api/admin/messages` (cookie admin) → liste + nonLus + total.
- `curl POST /api/admin/messages {action:"marquerLu"}` → `{"ok":true}`.
- `curl POST /api/admin/messages {action:"supprimer"}` → `{"ok":true,"data":{"supprime":true}}`.
- `curl PATCH /api/admin/settings` avec champs SEO → `{"ok":true,...}` (valeurs persistées en base, visibles dans le `<title>` après restart du dev server via generateMetadata).
- Compteurs de messages non-lus affichés en badge sur la sidebar admin (rouge, "9+" si >9).

## Notes techniques

- **Cache settings + dev server** : `chargerSettings()` (in `@/lib/settings`) met en cache les réglages en mémoire pour la durée du process. Après un PATCH, le cache est invalidé dans le process de l'API route, mais le process qui exécute `generateMetadata()` (layout.tsx) peut garder l'ancien cache jusqu'au prochain redémarrage. En production (serverless), chaque instance aurait son propre cache. Pour voir les nouvelles valeurs SEO appliquées en dev : redémarrer le dev server. Testé et confirmé : après restart, le `<title>` reflète la nouvelle valeur `metaTitle`.
- **Server vs Client Components** : Les pages `/contact`, `/a-propos`, `/fonctionnalites`, `/cas-usage`, `/tarifs`, `/comparaison`, `/temoignages`, `/faq`, `/demo` sont des Server Components (pour exporter `metadata`). Les parties interactives (Tabs, Accordion, toggle, formulaire) sont extraites en composants client dédiés. Tentative initiale de passer les `LucideIcon` en prop depuis un Server Component a échoué (erreur "Functions cannot be passed to Client Components") — corrigé en important les données directement dans le composant client (`use-cases-tabs.tsx`).
- **Navigation SPA ↔ multipages** : Les boutons "Se connecter" / "Essayer gratuitement" des nouvelles pages pointent vers `/?auth=login` et `/?auth=register`. La SPA racine (`src/app/page.tsx`) détecte ces paramètres et bascule en mode auth via `setAuthMode()` du store Zustand. Aucune logique métier cassée.
- **Pas de git commit/push** effectué (conformément à la consigne).

## Comptes test (vérifiés)

- Pro : `demo@pizzeria.fr` / `demo1234` → POST /api/auth/login 200 `{"ok":true}`.
- Superadmin : `admin@feedbackpro.fr` / `admin123` → POST /api/auth/login 200 `{"ok":true}`.
