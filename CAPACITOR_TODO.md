# FeedbackPro — Application mobile (Capacitor) — Plan d'implémentation

> Statut : **non implémenté** (D10). Ce document décrit le plan pour embarquer
> la webapp Next.js dans une application mobile native (iOS + Android) via
> [Capacitor](https://capacitorjs.com/). La webapp étant une SPA responsive
> et installable en PWA, Capacitor est l'option la plus directe pour bénéficier
> des APIs natives (partage, notifications push, caméra pour scanner un QR).

## 1. Objectifs

- Distribuer FeedbackPro sur l'App Store (iOS) et le Play Store (Android).
- Offrir une expérience native (icône, splash screen, navigation plein écran).
- Accéder aux APIs natives : caméra (scan QR), notifications push, partage.
- Conserver une base de code unique (la webapp Next.js existante).

## 2. Prérequis

- Node 20+, Bun (déjà utilisé).
- iOS : macOS + Xcode 15+ + compte Apple Developer (99 $/an).
- Android : Android Studio + JDK 17 + clé de signature Play Store.
- Le build standalone Next.js (`output: "standalone"`) est déjà configuré
  dans `next.config.ts` — il sert de base au payload mobile.

## 3. Étapes d'implémentation

### 3.1. Initialisation Capacitor

```bash
# À la racine du projet FeedbackPro
bun add @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
bunx cap init "FeedbackPro" "fr.feedbackpro.app" --web-dir=out

# Plates-formes natives
bunx cap add android
bunx cap add ios
```

### 3.2. Build web + synchronisation

Le build Next.js doit produire un dossier statique servi par Capacitor.
Deux options :

- **Option A (recommandée, offline-first)** : `next build` en `output: "export"`
  (export statique). Limitation : pas de routes API server-side dans l'app ;
  il faut héberger les API séparément (Vercel/Render) et pointer l'app mobile
  vers `NEXT_PUBLIC_APP_URL=https://api.feedbackpro.fr`.
- **Option B (SSR, avancée)** : garder `output: "standalone"` et embarquer
  un serveur Node dans l'app via `cordova-plugin-nodejs` (lourd, déconseillé).

Pour la v1, partir sur l'**Option A** :

```bash
# next.config.ts : ajouter temporairement output: "export" pour le build mobile
NEXT_PUBLIC_APP_URL="https://feedbackpro.qrtags.pro" bunx next build
bunx cap sync android ios
```

### 3.3. Configuration native

- **Icons & splash** : `@capacitor/assets` génère les tailles requises depuis
  `public/icon-512.png` et un splash.
  ```bash
  bun add -D @capacitor/assets
  bunx capacitor-assets generate --android --ios
  ```
- **`capacitor.config.ts`** :
  ```ts
  import type { CapacitorConfig } from "@capacitor/cli"
  const config: CapacitorConfig = {
    appId: "fr.feedbackpro.app",
    appName: "FeedbackPro",
    webDir: "out",
    server: {
      // En mode export statique, l'app charge /index.html localement.
      // Les API calls utilisent NEXT_PUBLIC_APP_URL (absolu).
      androidScheme: "https",
    },
    plugins: {
      SplashScreen: { launchShowDuration: 1500, backgroundColor: "#2563EB" },
    },
  }
  export default config
  ```

### 3.4. Plugins natifs à ajouter

| Besoin | Plugin | Notes |
|---|---|---|
| Caméra (scan QR client) | `@capacitor-community/barcode-scanner` | Remplace le scan navigateur (`/r/<token>`) sur mobile |
| Notifications push | `@capacitor/push-notifications` | Alertes temps réel (retours ≤ 2★, alertes Coach IA) |
| Partage | `@capacitor/share` | Partager un rapport IA / un QR code |
| App icon / splash | `@capacitor/app` + `@capacitor/splash-screen` | Cycle de vie natif |
| Haptics | `@capacitor/haptics` | Retour tactile sur validation de retour |
| Clipboard | `@capacitor/clipboard` | Copier le lien d'avis Google |

### 3.5. Adaptations côté webapp

- **Détection mobile** : `Capacitor.isNativePlatform()` (import de
  `@capacitor/core`) pour branchements conditionnels (scan natif vs web).
- **Base URL des API** : centraliser via `NEXT_PUBLIC_APP_URL` — déjà fait
  (les fetchs utilisent des chemins relatifs ; ajouter un wrapper
  `apiFetch()` qui préfixe en natif).
- **Deep linking** : `capacitor.config.ts → server.hostname` +
  `App.addListener('appUrlOpen')` pour ouvrir `/r/<token>` depuis un QR code
  scanné par l'appareil photo natif.
- **Auth** : le cookie de session `fp_session` (httpOnly) fonctionne en
  webview ; pour le natif, envisager `@capacitor/preferences` pour stocker
  un token (refactor auth nécessaire — non trivial).

### 3.6. CI/CD

- **Android** : GitHub Actions → `./gradlew assembleRelease` → upload Play
  Store (fastlane `supply`).
- **iOS** : GitHub Actions (macos-latest) → `xcodebuild archive` → upload
  App Store Connect (fastlane `pilot` / `deliver`).
- Versioning : lire `package.json` version, bump via changesets.

## 4. Limitations & risques

- **Routes API** : l'app mobile (export statique) ne peut PAS servir
  `/api/*` localement. Toutes les API doivent être déployées sur un domaine
  HTTPS public. Prévoir CORS sur les routes publiques (`/api/public/*`).
- **Auth cookie httpOnly** : en webview c'est OK, mais si l'on veut push
  notifications natives, il faut un token d'appareil côté serveur (table
  `DeviceToken` à ajouter au schéma Prisma).
- **Service Worker** : le SW (`public/sw.js`) n'est pas utilisé en Capacitor
  (le webview sert déjà les fichiers localement). Désactiver l'enregistrement
  sur plateforme native via `Capacitor.isNativePlatform()`.
- **Taille de l'app** : export statique Next.js + webview ≈ 15-25 Mo.
- **iOS App Store review** : prévoir justifications pour la caméra
  (`NSCameraUsageDescription`) et les notifications.

## 5. Estimation

| Phase | Effort |
|---|---|
| 3.1-3.3 (init + config + build) | 1 jour |
| 3.4 (plugins natifs) | 2-3 jours |
| 3.5 (adaptations webapp) | 2 jours |
| 3.6 (CI/CD + stores) | 2 jours |
| Tests (iOS + Android, devices réels) | 2 jours |
| **Total** | **~2 semaines** |

## 6. Décision

**Ne pas implémenter maintenant** : la PWA (D6) couvre déjà le cas
d'usage principal (installable, offline, notifications via SW). L'app
native apporte surtout le scan QR natif et les push notifications — à
évaluer après retours utilisateurs.
