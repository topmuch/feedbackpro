// ============================================================
// FeedVoice — instrumentation Next.js (exécutée 1× au démarrage serveur)
// ------------------------------------------------------------
// Si la variable d'environnement Z_AI_CONFIG est présente (JSON de
// configuration du SDK z-ai-web-dev-sdk fourni par Coolify), elle est
// écrite dans <cwd>/.z-ai-config au démarrage : le SDK ne sait lire QUE
// des fichiers (cwd, $HOME, /etc). Ce fileu de sécurité rend l'activation
// de la voix Nathalie indépendante du comportement du CMD Docker
// (`echo $Z_AI_CONFIG > /etc/.z-ai-config`) et des échappements éventuels
// de l'injection d'env (guillemets d'enrobage retirés par le normalisateur).
// Aucune valeur n'est journalisée (secret).
//
// NOTE — On évite d'importer depuis @/lib/sonde-ai car ce module fait des
// imports statiques de `fs` et `path` qui déclenchent un warning Edge
// Runtime au build. La fonction normaliserValeurConfigEnv est inlinée ici
// (pure manipulation de chaîne, aucun besoin de fs/path).
// ============================================================

/** Retire les guillemets d'enrobage éventuels injectés par Coolify. */
function normaliserValeurConfigEnv(brut: string): string {
  let v = brut.trim()
  if (
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('"') && v.endsWith('"'))
  ) {
    v = v.slice(1, -1)
  }
  if (v.includes('\\"')) v = v.replace(/\\"/g, '"')
  return v.trim()
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    const brut = (process.env.Z_AI_CONFIG ?? "").trim()
    if (!brut) return
    const parse: unknown = JSON.parse(normaliserValeurConfigEnv(brut))
    if (!parse || typeof parse !== "object" || Array.isArray(parse)) return

    const fs = await import("fs")
    const path = await import("path")
    const cible = path.join(process.cwd(), ".z-ai-config")
    try {
      const existant = fs.readFileSync(cible, "utf8").trim()
      if (existant === JSON.stringify(parse)) return // déjà à jour : rien à faire
    } catch {
      /* fichier absent : on l'écrit ci-dessous */
    }
    fs.writeFileSync(cible, JSON.stringify(parse))
    console.log(
      "[instrumentation] .z-ai-config écrit depuis Z_AI_CONFIG (voix Nathalie activée)"
    )
  } catch {
    console.warn(
      "[instrumentation] Z_AI_CONFIG ignorée (JSON invalide) — .z-ai-config non écrit"
    )
  }
}
