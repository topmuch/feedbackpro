# Task 2-c — Rapports vocaux Nathalie côté serveur (vraie voix TTS)

## Fichiers créés / modifiés

| Fichier | Action | Contenu |
|---|---|---|
| `src/app/api/voice/report/route.ts` | **CRÉÉ** | POST, `runtime = "nodejs"` : auth `requirePro`/`unauthorized`, rate limit `limiteTaux(req, "voice-report", { max: 6, fenetreMs: 60_000 })`, input `{ mois?: "YYYY-MM" }` (zod, défaut mois courant UTC, borné aux 12 derniers mois), agrégation Prisma réelle du modèle `Retour` filtrée `ctx.pro.id`, texte « Nathalie » (LLM + fallback déterministe), TTS mp3, garde-fou 4 Mo. |
| `src/components/feedbackpro/rapports-tab.tsx` | **MODIFIÉ** | Nouvelle carte « Briefing audio Nathalie. » au-dessus de la liste (imports Select/lucide, types BriefingKpis/BriefingAudio, helper `derniersMois(12)`, états + `genererBriefing()`, UI : sélecteur de mois, bouton avec spinner, lecteur `<audio controls>`, ancre Télécharger `.mp3`, badges KPIs, texte repliable, erreur inline + toast). La lecture Web Speech API existante (lignes ~193-273) est **inchangée**. |

Aucun autre fichier touché (prisma/**, guards.ts, rate-limit.ts, page.tsx, dashboard-shell, messages/**, autres routes API : intacts). Pas de commit git, pas de build.

## Signatures SDK utilisées (z-ai-web-dev-sdk 0.0.18, backend uniquement)

- **LLM** — `const ZAI = (await import("z-ai-web-dev-sdk")).default; const zai = await ZAI.create()`
  ```ts
  zai.chat.completions.create({
    messages: [
      { role: "assistant", content: PROMPT_SYSTEM_NATHALIE }, // même convention que src/lib/ia.ts
      { role: "user", content: JSON.stringify({ etablissement, periode, kpis }) },
    ],
    thinking: { type: "disabled" },
  })
  // → completion?.choices?.[0]?.message?.content
  ```
  Race avec timeout 20 s (même pattern `Promise.race` que ia.ts, TIMEOUT_LLM_MS réduit).
- **TTS** —
  ```ts
  const reponse = await zai.audio.tts.create({
    input: segment,        // ≤ 950 caractères (limite SDK 1024)
    voice: "tongtong",     // voix féminine chaleureuse = « Nathalie »
    speed: 1.0,
    response_format: "mp3",
    stream: false,
  })
  const tampon = Buffer.from(new Uint8Array(await reponse.arrayBuffer()))
  ```
  Texte découpé en segments de phrases (≤ 950 car.), buffers mp3 concaténés (frames indépendantes → lisible par `<audio>`). MIME renvoyé : `audio/mpeg`.

## Agrégation Prisma (données réelles, conventions existantes)

`db.retour.findMany({ where: { proId: ctx.pro.id, createdAt: { gte: debut, lt: fin } }, select: { note, tags, recompenseUtilisee } })` — bornes de mois en UTC, identiques à `/api/cron/rapports-mensuels-vip` (`Date.UTC(annee, m, 1)` → `Date.UTC(annee, m+1, 1)`). KPIs : total, note moyenne (2 déc.), répartition 1→5★, top 5 tags sectoriels (`parseJsonArray` de ia.ts, tags `emp_` exclus, labels via `tagLabel()`), alertes = note ≤ 2 (convention `suivi-rattrapage`), récompenses = `recompenseUtilisee: true` (convention `/api/pro/recompenses`). Isolation tenant : toutes les requêtes portent `ctx.pro.id`.

## Exemple de payload de réponse (succès)

```json
{
  "ok": true,
  "data": {
    "audioBase64": "//NExAA...",
    "mimeType": "audio/mpeg",
    "texte": "Bonjour, ici Nathalie, votre coach qualité. Faisons le point sur Février 2026 pour Restaurant Le Bristol (Démo). Vous avez reçu 18 retours clients, avec une note moyenne de 3,89 sur 5. ...",
    "dureeEstimee": 65,
    "source": "ia",
    "kpis": {
      "mois": "2026-02",
      "libelleMois": "Février 2026",
      "totalRetours": 18,
      "noteMoyenne": 3.89,
      "repartitionEtoiles": [{ "note": 1, "count": 1 }, { "note": 2, "count": 2 }, { "note": 3, "count": 3 }, { "note": 4, "count": 4 }, { "note": 5, "count": 8 }],
      "topTags": [{ "tag": "😊 Très accueillant", "count": 6 }],
      "alertes": 3,
      "recompenses": 3
    }
  }
}
```

Erreurs : 401 `{"ok":false,"error":"Non autorisé"}` · 400 mois invalide · 429 rate limit (Retry-After) · 413 audio > 4 Mo · 502 TTS indisponible · 500 générique.

## Qualité — lint / tsc

- `bun run lint` : **exit 0, 0 erreur / 0 warning** sur tout le repo.
- `bunx tsc --noEmit` : **0 erreur dans mes 2 fichiers**. Exit global 1 uniquement à cause de 2 erreurs préexistantes/concurrentes hors périmètre (posées par d'autres agents, toutes deux dans ma liste interdite) : `src/app/api/setup/seed/route.ts(43)` `timingSafeEqual` et `src/components/feedbackpro/retours-tab.tsx(2450)` `canalLabel`.

## Tests effectués (dev server local, compte démo authentifié)

Serveur relancé (`bun run dev`, il s'était arrêté) puis :

| Test | Résultat |
|---|---|
| POST sans cookie | **401** `{"ok":false,"error":"Non autorisé"}` en 915 ms (compile) ✓ |
| POST `{"mois":"2026-13"}` authentifié | **400** `{"ok":false,"error":"Format de mois invalide (attendu YYYY-MM)"}` ✓ |
| POST `{}` authentifié ×6 | **502** chacun (~0,4 s) — chaîne complète exécutée : KPIs Prisma OK (18 retours, note 3,89 vérifiés hors-ligne), LLM échoué (401 sandbox) → **fallback déterministe utilisé** comme prévu, puis TTS échoué (401 sandbox) → erreur 502 claire ✓ |
| 7e appel en < 60 s | **429** rate limit ✓ (max 6/60 s respecté) |
| GET / | **200** — le bundle frontend avec la nouvelle carte compile et se sert sans erreur ✓ |

Taille audio : non mesurable — voir limite ci-dessous. Script de vérification éphémère (SDK hors Next) : KPIs démo `total: 18, noteMoyenne: 3.89` ✓ ; LLM et TTS → tous deux `401 {"error":"missing X-Token header"}` (script supprimé après usage).

## Limites connues

1. **Sandbox actuelle : endpoint SDK indisponible (401 `missing X-Token header`) pour CHAT et TTS.** La config `/etc/.z-ai-config` ne contient que `baseUrl` + `apiKey` (pas de `token`, or le SDK n'envoie le header `X-Token` que si `config.token` existe). Ceci affecte **toutes** les fonctions SDK du projet (Coach IA, ASR, VLM…), pas seulement cette route : même le Coach IA existant échouerait actuellement. Le code gère les deux cas : LLM → fallback déterministe (chiffres réels), TTS → 502 avec message clair affiché inline + toast. Dès que le token est provisionné dans l'environnement, la route produit l'audio complet sans aucune modification de code.
2. Le texte LLM est validé 80-260 mots (cible prompt 120-180) ; hors bornes → fallback déterministe. Le TTS découpe en segments ≤ 950 caractères : un briefing de 180 mots français (~1 250 caractères) peut produire 2 segments mp3 concaténés.
3. La concaténation de segments mp3 est jouable par tous les lecteurs modernes mais reste théoriquement sensible aux players très stricts (non testable sans token). En pratique un briefing tient souvent dans un seul segment.
4. `dureeEstimee` est une estimation (~2,5 mots/s à débit posé), pas la durée réelle du mp3.
5. Bornes de mois en UTC (convention du cron mensuel VIP) : un retour créé le 1er du mois à 00h30 heure locale (UTC+X) peut tomber dans le mois calendaire UTC adjacent — cohérent avec les autres rapports mensuels du projet.
6. Rate limit mémoire sliding-window (comme tout le projet) : repart à zéro au redémarrage du process.
