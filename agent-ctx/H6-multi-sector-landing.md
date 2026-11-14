# H6 - Multi-Secteurs Landing (FeedbackPro)

**Agent** : main (Z.ai Code)
**Date** : 14 Nov 2025
**Task ID** : H6
**Scope** : Refonte de la landing FeedbackPro en version multi-secteurs (6 secteurs, 9 pages SPA). Plus de section tarifs.

---

## 1. Fichier livré

**Chemin** : `/home/z/my-project/src/components/feedbackpro/landing-view.tsx`
**Lignes** : 3674 (vs 2460 avant)
**Directive** : `"use client"`
**Export inchangé** : `export function LandingView({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void })`

---

## 2. Pages construites (9 pages SPA)

État client `page: LandingPage` + URL sync `?page=xxx` (pushState + popstate).

| # | Page        | Statut        | Notes |
|---|-------------|---------------|-------|
| 1 | `accueil`   | Reconstruit   | 6 sector cards, no pricing, Section Preuve (15% / ÷2 / 4x), CTA → contact |
| 2 | `restaurant`| Générique     | `<SectorPage sector={SECTORS[0]} />` — 3 avantages (QR / Tags / Phone notif) |
| 3 | `aeroport`  | Générique     | `<SectorPage sector={SECTORS[1]} />` — dark hero, 3 avantages (Terminal map / Tags / CentralDashboard) |
| 4 | `hotel`     | Nouveau       | `<SectorPage sector={SECTORS[2]} />` — QR chambre / Tags / HousekeepingBoard |
| 5 | `gare`      | Nouveau       | `<SectorPage sector={SECTORS[3]} />` — QR quais / Tags / InfoVoyageursBoard |
| 6 | `hopital`   | Nouveau       | `<SectorPage sector={SECTORS[4]} />` — QR salles d'attente / Tags / PatientFlowBoard |
| 7 | `erp`       | Nouveau       | `<SectorPage sector={SECTORS[5]} />` — QR guichets / Tags / MaintenanceBoard |
| 8 | `apropos`   | Mis à jour    | Ajout section "Un moteur, six terrains" (récap des 6 secteurs) |
| 9 | `contact`   | Mis à jour    | Select "Type d'établissement" étendu à 6 secteurs + "Hôpital / Santé" |

---

## 3. Sections de la page Accueil

1. **Hero** : Aurora + badge "Denise, votre assistante vocale temps réel" + H1 gradient + CTAs `Découvrir Restaurants` (warm) / `Découvrir Aéroports` (tech) + trust line `4.9/5 · Setup en 5 min · Sans carte bancaire` + `DashboardMockup` (Denise sound wave + KPIs + feed).
2. **"Un Moteur, Tous Vos Terrains"** : section REPLAÇANT l'ancienne "Deux Mondes". Grille responsive `md:grid-cols-2 lg:grid-cols-3` de 6 cartes secteur (alternance light/dark pour rythme visuel). Chaque carte = gradient bg + glow blob + icon gradient + titre + tagline + lien "Découvrir" + hover lift + shadow.
3. **"Denise ne dort jamais"** (dark, conservé) : sound wave + transcript live + indicators (vibration / zone / priorité).
4. **Section Preuve** (générique) : 3 stats `15%` / `÷2` / `4x` (remplaçant les anciens `40%` / `÷2` / `12x`).
5. **CTA Final** : gradient `#5257C9 → #7C3AED → #06B6D4` + Aurora. Titre `"Prêt à transformer vos interactions en données actionnables ?"` + bouton `"Demander une démo personnalisée"` → `navigate('contact')` + subtext `"Configuration adaptée à votre secteur en 24h"`. **Aucune section tarifs**.
6. **Discrete bottom strip** : `"Plutôt tester directement ?"` + CTA `Essayer gratuitement` (onSignup).

---

## 4. Architecture des 6 sector pages

Toutes les pages secteur utilisent un **composant générique `<SectorPage sector={...} />`** piloté par une config `SECTORS: SectorConfig[]` (tableau de 6 entrées).

### Template sector page (commun à tous)
1. **Hero** : dark si `sector.dark=true` (aeroport), sinon light. Badge sector + H1 (gradient sector) + subtitle + 2 CTAs (`Essayer gratuitement` + `Demander une démo` → navigate('contact')).
2. **3 avantages** via `<AdvantageSection>` avec 3 layouts possibles :
   - `split-left` : texte à gauche, mockup à droite (lg).
   - `split-right` : mockup à gauche (order-1 lg:order-2), texte à droite.
   - `centered-tags` : titre centré + grille de tags + patterns bars.
3. **Denise quote** (section dark dédiée) : `"« {sector.deniseQuote} »"` + sound wave + `— Denise`.
4. **Testimonial** (light) : 5 étoiles + citation + avatar gradient (initials) + nom + rôle sector-spécifique.
5. **CTA** : background gradient sector (inline style) + Aurora + `"Prêt à passer au temps réel ?"` + bouton `"Demander une démo {sector.label.toLowerCase()}"` → navigate('contact') + subtext "Configuration en 24h" + 3 trust badges.

### Config `SECTORS` (résumé)

| Key       | Icon        | Accent From→To                | Card bg                     | Dark | Mockups avantage 1 / 3                |
|-----------|-------------|--------------------------------|-----------------------------|------|----------------------------------------|
| restaurant| `Utensils`  | `#F59E0B → #FB923C`           | Light warm (FFF7ED...)       | no   | `qr` / `phone`                         |
| aeroport  | `Plane`     | `#5257C9 → #06B6D4`           | Dark indigo (0F172A...)      | yes  | `terminal` / `dashboard`               |
| hotel     | `Hotel`     | `#EC4899 → #8B5CF6`           | Light rose (FDF2F8...)       | no   | `qr` / `housekeeping`                  |
| gare      | `Bus`       | `#06B6D4 → #10B981`           | Dark teal (042F2E...)        | no   | `qr` / `infovoyageurs`                 |
| hopital   | `Stethoscope` | `#EF4444 → #F43F5E`         | Light red (FEF2F2...)        | no   | `qr` / `patientflow`                   |
| erp       | `Landmark`  | `#10B981 → #F59E0B`           | Dark emerald (022C22...)     | no   | `qr` / `maintenanceboard`              |

Chaque entrée `SECTORS[i]` définit en plus : `heroTitle` (ReactNode avec `<span className="bg-gradient-to-r ... bg-clip-text text-transparent">`), `heroSubtitle`, `qrBadge`/`qrTitle`/`qrUrl`, 3 avantages complets (titre, description, bullets/steps, tags, patterns, mockup type, bg), `deniseQuote`, `testimonial`.

### Mockups CSS purs (no external images)

| Mockup            | Utilisé par        | Description |
|-------------------|--------------------|-------------|
| `DashboardMockup` | Accueil hero       | Browser top bar + Denise live card (left) + 4 KPIs + feed scrollable (right) |
| `SectorQrCard`    | Restaurant/Hotel/Gare/Hopital/ERP avt1 | Carte gradient avec FakeQR + header badge + accent URL |
| `PhoneMockup`     | Restaurant avt3    | iPhone-style mockup avec 4 NotifCard animées (fbp-slidein) |
| `TerminalMapMockup` | Aeroport avt1    | Carte dark Terminal 2 + 5 incidents animés (fbp-ring-pulse) |
| `CentralDashboardMockup` | Aeroport avt3 | Incidents list + score équipe progress bars + SLA card |
| `DeniseLiveCard`  | (référencé, non utilisé directement) | Carte Denise générique |
| `HousekeepingBoard` | Hotel avt3       | 6 chambres en grille 2 cols avec statuts (Urgent/En cours/À faire/Terminé) |
| `InfoVoyageursBoard` | Gare avt3       | Tableau dark départ trains/bus (Destination/Voie/Heure/Statut) + bandeau annonce Denise |
| `PatientFlowBoard` | Hopital avt3     | 6 zones (Urgences/Consultations/Radio/Accueil/Labo/Pharmacie) avec progress bars de saturation |
| `MaintenanceBoard` | ERP avt3         | Liste scrollable de tickets maintenance (Borne HS/Guichet/Ascenseur/Écran) |

Tous les mockups sont en HTML/CSS pur, aucune image externe. `<img src="/logo-feedbackpro.png">` est utilisé dans le header, le footer, le CTA final de l'accueil, la section promise du contact, et la page À propos — toujours enveloppé dans un conteneur `bg-white rounded-xl` quand il est sur fond sombre.

---

## 5. Header avec dropdown Secteurs

Le header desktop contient maintenant :
- **Accueil** (button simple)
- **Secteurs** (button + `ChevronDown`) avec dropdown hover qui révèle une grille 2 cols de 6 liens sector + tagline courte
- **À propos** (button simple)
- **Contact** (button simple)

Mobile : `Sheet` (right side) avec sections groupées ("Secteurs" + "Société") via `MobileLink`.

`NAV_ITEMS` a été remplacé par `SECTOR_NAV` (6 entrées) + 4 buttons hardcodés (Accueil/Secteurs/À propos/Contact). L'underline animé `motion.span layoutId="nav-underline"` reste présent et se déplace entre les boutons actifs.

---

## 6. Footer multi-secteurs

4 colonnes :
- Brand (logo + description + badge "Denise veille · 24/7")
- Secteurs (6 liens : Restaurant, Aéroport, Hôtel, Gare, Santé, Établissements publics)
- Société (Accueil, À propos, Équipe, Contact)
- Légal (CGU, Confidentialité, RGPD, Cookies)

Newsletter en bas (Input + Button gradient). Bottom bar : `© {year} FeedbackPro. Tous droits réservés.` + `Piloté par Denise`.

---

## 7. Validation

```
$ cd /home/z/my-project && npx eslint src/components/feedbackpro/landing-view.tsx
(no output — 0 errors, 0 warnings)

$ cd /home/z/my-project && npx tsc --noEmit --skipLibCheck
(no output — 0 errors)
```

`bun run lint` global signale 3 erreurs pré-existantes dans d'autres fichiers (`language-selector.tsx`, `scratch-card.tsx`, `lib/db.ts`) — aucune dans `landing-view.tsx`.

Dev log : `✓ Compiled in 321ms` puis `GET / 200`. Aucun runtime error visible.

---

## 8. Comment fonctionnent les 6 sector cards (accueil)

Dans `AccueilPage`, section "Un Moteur, Tous Vos Terrains" :

```tsx
<div className="mt-12 grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
  {SECTORS.map((sector, i) => (
    <Reveal key={sector.key} delay={0.06 * i}>
      <button
        onClick={() => navigate(sector.key)}
        className={`group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-7 ${sector.cardClasses}`}
      >
        <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-150 ${sector.glowClasses}`} aria-hidden />
        <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${sector.iconGradient} text-white shadow-lg`}>
          <sector.icon className="h-5 w-5" />
        </div>
        <h3 className={`relative mt-5 text-lg font-bold sm:text-xl ${sector.cardTitleColor}`}>{sector.cardTitle}</h3>
        <p className={`relative mt-2 text-sm ${sector.cardBodyColor}`}>{sector.tagline}</p>
        <div className={`relative mt-5 flex items-center gap-2 text-sm font-semibold ${sector.cardLinkColor}`}>
          Découvrir
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </button>
    </Reveal>
  ))}
</div>
```

**Comportement** :
- 2 cols mobile (`md:grid-cols-2`) → 3 cols desktop (`lg:grid-cols-3`)
- Chaque carte = `<button>` cliquable qui appelle `navigate(sector.key)` → SPA routing vers la page secteur dédiée
- Classes par carte (`sector.cardClasses` / `glowClasses` / `iconGradient` / `cardTitleColor` / `cardBodyColor` / `cardLinkColor`) sont **statiques** dans la config SECTORS (pas d'interpolation dynamique pour rester compatibles avec le JIT Tailwind)
- Alternance light/dark : restaurant (light warm), aeroport (dark), hotel (light rose), gare (dark teal), hopital (light red), erp (dark emerald) → checkerboard visuel
- Hover : `hover:-translate-y-1` (lift) + `hover:shadow-2xl` + glow blob scale 150%
- Animation d'apparition : `Reveal delay={0.06 * i}` → stagger doux
- Accessibilité : `aria-hidden` sur la glow décorative, `<button>` natif pour le keyboard focus

---

## 9. Décisions de design notables

- **Pas de Pricing** : comme demandé, la section tarifs de l'accueil a été retirée. Le CTA final route vers `contact` ("Demander une démo personnalisée") au lieu de `onSignup` direct.
- **Couleurs secteur** : 6 accents différents (orange/indigo-cyan/pink-violet/cyan-emerald/red-rose/emerald-amber) pour différencier visuellement. Les couleurs de marque FeedbackPro (`#5257C9` indigo, `#7C3AED` violet, `#06B6D4` cyan) restent utilisées pour aurora, boutons primaires, et le sound wave de Denise (qui reste la signature vocale).
- **Denise quote section** : créée en section dédiée dark pour chaque sector page, avec glow coloré via `style={{ background: sector.accentFrom + "20" }}` (inline style — Tailwind ne gère pas les couleurs dynamiques).
- **CTA section finale sector** : background gradient inline style `linear-gradient(to bottom right, accentFrom, accentTo)` — toujours statique-literal-safe car passé via `style` non via class Tailwind.
- **Mockups dynamiques** : `<AdvantageMockup type={adv.mockup} sector={sector} />` — switch sur 9 types. Le `qr` utilise `sector.dark` pour choisir entre gradient dark et gradient light statique.
- **Navigation header** : "Secteurs" est un dropdown hover (`group-hover:visible group-hover:opacity-100`) — aucun état React supplémentaire, navigation keyboard OK via `<button>` focusable.
- **Footer "Secteurs" column** : 6 liens vers toutes les pages sector.
- **Logo** : `<img src="/logo-feedbackpro.png">` utilisé dans header (sans wrapper white car header est blanc/60 backdrop-blur), dans footer + CTA accueil + Apropos hero + Contact promise (dans conteneur `bg-white rounded-xl px-4 py-2 shadow-lg`).
- **Accessibility** : `aria-hidden` sur tous les blobs décoratifs (Aurora, glow), `aria-label` sur boutons logo, `<SheetTitle className="sr-only">` dans la sheet mobile, alt text sur les `<img>` logo.

---

## 10. Fichiers impactés

- **MODIFIÉ** : `src/components/feedbackpro/landing-view.tsx` (3674 lignes, full rewrite)
- **NON MODIFIÉ** : tout le reste du projet (aucun autre fichier touché)

L'export `LandingView({ onLogin, onSignup })` est strictement identique — aucun appelant à mettre à jour.
