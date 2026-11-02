// ============================================================
// FeedbackPro - Page RGPD générique + sections par secteur (Task M5)
// ------------------------------------------------------------
// Route : GET /rgpd
// Composant serveur : lit directement les fiches SecteurConfig en
// base pour générer des sections RGPD adaptées à chaque secteur
// (photos interdites en hôpital, zones sensibles en aéroport, etc.).
//
// La partie haute est générique (RGPD commun à tous les secteurs) ;
// la partie basse liste chaque secteur avec ses règles spécifiques
// (photosInterdites, zonesSensibles) lues depuis SecteurConfig.
// ============================================================

import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, Camera, MapPin, ShieldCheck } from "lucide-react"
import { LegalLayout, SectionLegale } from "@/components/feedbackpro/legal-layout"
import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "RGPD par secteur — FeedbackPro",
  description:
    "Règles RGPD spécifiques par secteur d'activité : restaurants, hôtels, hôpitaux, aéroports… Chaque secteur a ses propres contraintes de collecte et de traitement des données client.",
}

export const dynamic = "force-dynamic"

/** Parse un champ JSON de SecteurConfig (helper local tolérant). */
function parseJson<T>(valeur: string | null | undefined, defaut: T): T {
  if (!valeur) return defaut
  try {
    return JSON.parse(valeur) as T
  } catch {
    return defaut
  }
}

export default async function RgpdPage() {
  // Chargement des fiches secteurs depuis la BDD pour les règles spécifiques
  let secteurs: Array<{
    nom: string
    emoji: string
    description: string
    reglesSecurite: { photosInterdites: boolean; zonesSensibles: string[] }
    languesSupportees: string[]
  }> = []
  try {
    const rows = await db.secteurConfig.findMany({ orderBy: { nom: "asc" } })
    secteurs = rows.map((s) => ({
      nom: s.nom,
      emoji: s.emoji,
      description: s.description,
      reglesSecurite: parseJson<{
        photosInterdites: boolean
        zonesSensibles: string[]
      }>(s.reglesSecurite, { photosInterdites: false, zonesSensibles: [] }),
      languesSupportees: parseJson<string[]>(s.languesSupportees, ["fr"]),
    }))
  } catch (e) {
    // BDD non initialisée : la page reste consultable (section générique seule)
    console.warn("rgpd page : SecteurConfig indisponibles", e)
  }

  return (
    <LegalLayout
      titre="RGPD & règles par secteur"
      description="FeedbackPro traite des données personnelles dans le respect du RGPD. Cette page regroupe les règles transversales (communes à tous les secteurs) et les règles spécifiques à chaque secteur d'activité."
      dateMiseAJour="1er février 2026"
      pageActive="/rgpd"
    >
      {/* ---------------- RÈGLES GÉNÉRIQUES (communes) ---------------- */}
      <SectionLegale titre="1. Règles transversales (tous secteurs)">
        <p>
          Quelle que soit votre activité, FeedbackPro applique les principes suivants
          (voir aussi notre{" "}
          <Link className="text-primary underline underline-offset-2" href="/confidentialite">
            politique de confidentialité
          </Link>
          ) :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Minimisation</strong> : seules les données strictement nécessaires à l&apos;audit qualité sont collectées.</li>
          <li><strong>Anonymisation par défaut</strong> : le client peut laisser un retour sans email ni nom.</li>
          <li><strong>Durée de conservation</strong> : les retours sont conservés 24 mois, puis anonymisés.</li>
          <li><strong>Droit à l&apos;oubli</strong> : un client peut demander la suppression de ses données via le commerçant ou <code>privacy@feedbackpro.fr</code>.</li>
          <li><strong>Chiffrement au repos</strong> : les commentaires libres et emails clients sont chiffrés en AES-GCM (clé ENCRYPTION_KEY) — voir <code>src/lib/crypto.ts</code>.</li>
          <li><strong>Pas de revente</strong> : les données ne sont jamais cédées à un tiers à des fins commerciales.</li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="2. Photos et zones sensibles par secteur">
        <p>
          Selon votre secteur, certaines zones ne doivent <strong>jamais</strong> être
          photographiées par les clients (blocs opératoires, contrôle de sécurité…).
          FeedbackPro désactive automatiquement l&apos;option photo sur ces secteurs et
          signale les zones sensibles dans l&apos;interface commerçant.
        </p>
        <p>
          La liste ci-dessous est chargée dynamiquement depuis les fiches{" "}
          <code>SecteurConfig</code> en base — chaque secteur a ses propres règles.
        </p>
      </SectionLegale>

      {/* ---------------- SECTIONS PAR SECTEUR ---------------- */}
      {secteurs.length === 0 ? (
        <SectionLegale titre="3. Sections sectorielles">
          <p className="text-muted-foreground italic">
            Les fiches secteur ne sont pas encore chargées en base. Réessayez
            ultérieurement ou contactez l&apos;administrateur.
          </p>
        </SectionLegale>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            3. Règles spécifiques par secteur ({secteurs.length} secteurs)
          </h2>
          <div className="space-y-3">
            {secteurs.map((s) => (
              <article
                key={s.nom}
                className="rounded-lg border border-border/60 bg-muted/30 p-4"
              >
                <header className="flex flex-wrap items-center gap-2">
                  <span className="text-2xl" aria-hidden>{s.emoji}</span>
                  <h3 className="text-base font-semibold">{s.nom}</h3>
                  {s.reglesSecurite.photosInterdites && (
                    <Badge variant="destructive" className="gap-1">
                      <Camera className="h-3 w-3" aria-hidden />
                      Photos interdites
                    </Badge>
                  )}
                  {s.reglesSecurite.zonesSensibles.length > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {s.reglesSecurite.zonesSensibles.length} zone(s) sensible(s)
                    </Badge>
                  )}
                  {s.languesSupportees.length > 1 && (
                    <Badge variant="secondary">
                      Langues : {s.languesSupportees.join(", ")}
                    </Badge>
                  )}
                </header>
                <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>

                {s.reglesSecurite.photosInterdites && (
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-rose-50 p-2.5 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p>
                      <strong>Photos désactivées</strong> sur ce secteur : le bouton
                      « Ajouter une photo » est masqué dans le questionnaire client.
                      Les clients ne peuvent pas non plus envoyer de photos via WhatsApp.
                    </p>
                  </div>
                )}

                {s.reglesSecurite.zonesSensibles.length > 0 && (
                  <div className="mt-2.5 flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div>
                      <span className="font-medium text-foreground">Zones sensibles :</span>{" "}
                      {s.reglesSecurite.zonesSensibles.join(" · ")}
                    </div>
                  </div>
                )}

                {!s.reglesSecurite.photosInterdites && s.reglesSecurite.zonesSensibles.length === 0 && (
                  <p className="mt-2.5 text-xs italic text-muted-foreground">
                    Aucune contrainte spécifique — règles transversales uniquement.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <SectionLegale titre="4. Vos droits">
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation, de portabilité et d&apos;opposition. Pour les exercer,
          contactez le commerçant concerné ou écrivez à{" "}
          <a className="text-primary underline underline-offset-2" href="mailto:privacy@feedbackpro.fr">
            privacy@feedbackpro.fr
          </a>
          .
        </p>
        <p>
          Vous pouvez introduire une réclamation auprès de la CNIL
          (<a className="text-primary underline underline-offset-2" href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">www.cnil.fr/fr/plaintes</a>)
          si vous estimez que le traitement de vos données porte atteinte à vos droits.
        </p>
      </SectionLegale>
    </LegalLayout>
  )
}
