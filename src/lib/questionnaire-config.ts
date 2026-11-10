// Types pour la validation TypeScript
export type Secteur = 'RESTAURATION' | 'HOTELLERIE' | 'TRANSPORT' | 'SANTE' | 'ADMINISTRATION';
export type Scenário = 'CRISE' | 'MITIGE' | 'SUCCES';
export type TypeQuestion = 'unique' | 'multiple' | 'texte' | 'email' | 'photo';

export interface Option {
  id: string;
  label: string;
  emoji?: string;
  sousOptions?: Option[]; // Pour les questions dynamiques (Q2 dépend de Q1)
}

export interface Question {
  id: string;
  numero: number;
  texte: string;
  type: TypeQuestion;
  obligatoire: boolean;
  options?: Option[];
  placeholder?: string;
  maxSelections?: number;
  condition?: {
    questionId: string;
    valeur: string | string[];
  };
}

export interface ScenarioConfig {
  scenario: Scenário;
  noteMin: number;
  noteMax: number;
  questions: Question[];
  tempsEstime: string;
}

export interface SecteurConfig {
  secteur: Secteur;
  scenarios: ScenarioConfig[];
}

// Configuration complète des questions adaptatives
export const QUESTIONNAIRE_CONFIG: SecteurConfig[] = [
  {
    secteur: 'RESTAURATION',
    scenarios: [
      {
        scenario: 'CRISE',
        noteMin: 1,
        noteMax: 2,
        tempsEstime: '60 secondes',
        questions: [
          {
            id: 'q1_probleme_principal',
            numero: 1,
            texte: 'Quel a été le principal problème ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'cuisine', label: 'La Cuisine / Le Plat', emoji: '🍽️' },
              { id: 'attente', label: "L'Attente / Le Service", emoji: '⏱️' },
              { id: 'personnel', label: 'Le Personnel / L\'Accueil', emoji: '👤' },
              { id: 'proprete', label: 'La Propreté / L\'Environnement', emoji: '🧹' }
            ]
          },
          {
            id: 'q2_precision_probleme',
            numero: 2,
            texte: 'Précisez le problème :',
            type: 'unique',
            obligatoire: true,
            condition: { questionId: 'q1_probleme_principal', valeur: ['cuisine', 'attente', 'personnel', 'proprete'] },
            options: [
              {
                id: 'cuisine',
                label: 'Problème cuisine',
                sousOptions: [
                  { id: 'plat_froid', label: 'Plat froid / tiède', emoji: '🥶' },
                  { id: 'portion_petite', label: 'Portion trop petite', emoji: '🍽️' },
                  { id: 'gout_insatisfaisant', label: 'Goût insatisfaisant', emoji: '🤢' },
                  { id: 'erreur_commande', label: 'Erreur de commande', emoji: '❌' }
                ]
              },
              {
                id: 'attente',
                label: "Problème d'attente",
                sousOptions: [
                  { id: 'attente_20min', label: '>20 min pour être servi', emoji: '⏳' },
                  { id: 'attente_entre_plats', label: 'Longue attente entre les plats', emoji: '⏳' },
                  { id: 'addition_interminable', label: 'Addition interminable', emoji: '⏳' },
                  { id: 'personne_pas_venu', label: 'Personne n\'est venu nous voir', emoji: '👻' }
                ]
              },
              {
                id: 'personnel',
                label: 'Problème de personnel',
                sousOptions: [
                  { id: 'impoli', label: 'Impoli / Cassant', emoji: '😠' },
                  { id: 'distrait', label: 'Distrait / Bavardages entre collègues', emoji: '📱' },
                  { id: 'incompetent', label: 'Incompétent / Mal renseigné', emoji: '🤷' },
                  { id: 'invisible', label: 'Invisible / Ignoré', emoji: '👻' }
                ]
              },
              {
                id: 'proprete',
                label: 'Problème de propreté',
                sousOptions: [
                  { id: 'table_sale', label: 'Table / Couverts sales', emoji: '🧹' },
                  { id: 'toilettes_insalubres', label: 'Toilettes insalubres', emoji: '🚻' },
                  { id: 'nuisibles', label: 'Nuisibles / Mouches', emoji: '🪰' },
                  { id: 'temperature', label: 'Température inconfortable', emoji: '🌡️' }
                ]
              }
            ]
          },
          {
            id: 'q3_reaction_personnel',
            numero: 3,
            texte: 'Le personnel a-t-il réagi à votre mécontentement sur le moment ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'oui_resolu', label: 'Oui, le problème a été résolu immédiatement', emoji: '✅' },
              { id: 'oui_insatisfaisant', label: 'Oui, mais la solution était insatisfaisante', emoji: '⚠️' },
              { id: 'non_ignorer', label: 'Non, aucune réaction / ignoré', emoji: '❌' }
            ]
          },
          {
            id: 'q4_compensation',
            numero: 4,
            texte: 'Une compensation vous a-t-elle été proposée ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'oui', label: 'Oui', emoji: '🎁' },
              { id: 'non', label: 'Non', emoji: '❌' }
            ]
          },
          {
            id: 'q5_description_personnel',
            numero: 5,
            texte: 'Pouvez-vous décrire la personne concernée ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "Le serveur grand avec des lunettes au secteur terrasse"'
          },
          {
            id: 'q6_photo',
            numero: 6,
            texte: 'Souhaitez-vous ajouter une photo du problème ?',
            type: 'photo',
            obligatoire: false
          }
        ]
      },
      {
        scenario: 'MITIGE',
        noteMin: 3,
        noteMax: 3,
        tempsEstime: '45 secondes',
        questions: [
          {
            id: 'q1_point_friction',
            numero: 1,
            texte: "Qu'est-ce qui a empêché votre expérience d'être excellente ?",
            type: 'multiple',
            obligatoire: true,
            maxSelections: 2,
            options: [
              { id: 'un_peu_lent', label: 'Un peu lent / Flux perfectible', emoji: '🐌' },
              { id: 'plat_correct', label: 'Plat correct, mais sans plus', emoji: '🍽️' },
              { id: 'service_neutre', label: 'Service neutre / robotique (poli mais froid)', emoji: '🤖' },
              { id: 'proprete_details', label: 'Quelques détails de propreté à revoir', emoji: '🧹' },
              { id: 'rapport_qualite_prix', label: 'Rapport qualité-prix moyen', emoji: '💸' }
            ]
          },
          {
            id: 'q2_conseil',
            numero: 2,
            texte: 'Un conseil rapide pour nous améliorer ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: Baisser un peu la musique, ou former le serveur sur les allergènes...'
          }
        ]
      },
      {
        scenario: 'SUCCES',
        noteMin: 4,
        noteMax: 5,
        tempsEstime: '30 secondes',
        questions: [
          {
            id: 'q1_coup_de_coeur',
            numero: 1,
            texte: "Qu'est-ce qui vous a le plus plu aujourd'hui ?",
            type: 'multiple',
            obligatoire: true,
            options: [
              { id: 'cuisine_delicieuse', label: 'Cuisine délicieuse / Produits frais', emoji: '😋' },
              { id: 'service_rapide', label: 'Service rapide et fluide', emoji: '⚡' },
              { id: 'accueil_chaleureux', label: 'Accueil chaleureux et souriant', emoji: '😊' },
              { id: 'ambiance_parfaite', label: 'Ambiance parfaite / Cadre agréable', emoji: '✨' }
            ]
          },
          {
            id: 'q2_felicitations',
            numero: 2,
            texte: 'Souhaitez-vous féliciter un membre de l\'équipe en particulier ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: Marie, la serveuse du secteur terrasse, était adorable !'
          },
          {
            id: 'q3_recommandation',
            numero: 3,
            texte: 'Recommanderiez-vous notre établissement ?',
            type: 'unique',
            obligatoire: false,
            options: [
              { id: 'oui_absolument', label: 'Oui, absolument !', emoji: '⭐' },
              { id: 'oui_probablement', label: 'Oui, probablement.', emoji: '⭐' }
            ]
          }
        ]
      }
    ]
  },
  {
    secteur: 'HOTELLERIE',
    scenarios: [
      {
        scenario: 'CRISE',
        noteMin: 1,
        noteMax: 2,
        tempsEstime: '60 secondes',
        questions: [
          {
            id: 'q1_zone_probleme',
            numero: 1,
            texte: 'Où le problème s\'est-il produit ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'reception', label: 'Réception / Check-in', emoji: '🛎️' },
              { id: 'chambre', label: 'Chambre', emoji: '🛏️' },
              { id: 'menage', label: 'Ménage', emoji: '🧹' },
              { id: 'petit_dejeuner', label: 'Petit-déjeuner', emoji: '🥐' },
              { id: 'spa_piscine', label: 'SPA / Piscine', emoji: '🏊' }
            ]
          },
          {
            id: 'q2_precision_probleme',
            numero: 2,
            texte: 'Précisez le problème :',
            type: 'unique',
            obligatoire: true,
            condition: { questionId: 'q1_zone_probleme', valeur: ['reception', 'chambre', 'menage', 'petit_dejeuner', 'spa_piscine'] },
            options: [
              {
                id: 'reception',
                label: 'Problème réception',
                sousOptions: [
                  { id: 'checkin_lent', label: 'Check-in lent / robotique', emoji: '🐌' },
                  { id: 'accueil_froid', label: 'Accueil froid / distant', emoji: '🧊' },
                  { id: 'chambre_pas_pret', label: 'Chambre pas prête', emoji: '❌' },
                  { id: 'erreur_reservation', label: 'Erreur de réservation', emoji: '📋' }
                ]
              },
              {
                id: 'chambre',
                label: 'Problème chambre',
                sousOptions: [
                  { id: 'bruit', label: 'Bruit / Insonorisation', emoji: '🔊' },
                  { id: 'temperature', label: 'Clim/Chauffage HS', emoji: '🌡️' },
                  { id: 'douche_probleme', label: 'Problème douche/eau', emoji: '🚿' },
                  { id: 'literie_inconfortable', label: 'Literie inconfortable', emoji: '🛏️' }
                ]
              },
              {
                id: 'menage',
                label: 'Problème ménage',
                sousOptions: [
                  { id: 'menage_incomplet', label: 'Ménage incomplet', emoji: '🧹' },
                  { id: 'draps_sales', label: 'Draps / Serviettes sales', emoji: '🧺' },
                  { id: 'poubelle_pas_vidée', label: 'Poubelle pas vidée', emoji: '🗑️' },
                  { id: 'produits_manquants', label: 'Produits d\'accueil manquants', emoji: '🧴' }
                ]
              },
              {
                id: 'petit_dejeuner',
                label: 'Problème petit-déjeuner',
                sousOptions: [
                  { id: 'buffet_froid', label: 'Buffet froid / vide', emoji: '🥶' },
                  { id: 'produits_pas_frais', label: 'Produits pas frais', emoji: '🍞' },
                  { id: 'service_lent', label: 'Service lent', emoji: '🐌' },
                  { id: 'salle_sale', label: 'Salle sale / mal rangée', emoji: '🧹' }
                ]
              },
              {
                id: 'spa_piscine',
                label: 'Problème SPA/Piscine',
                sousOptions: [
                  { id: 'eau_sale', label: 'Eau sale / trouble', emoji: '🏊' },
                  { id: 'serviettes_manquantes', label: 'Manque de serviettes', emoji: '🧻' },
                  { id: 'temperature_eau', label: 'Eau trop froide/chaude', emoji: '🌡️' },
                  { id: 'vestiaires_sales', label: 'Vestiaires sales', emoji: '🧹' }
                ]
              }
            ]
          },
          {
            id: 'q3_signale_reception',
            numero: 3,
            texte: 'Avez-vous signalé ce problème à la réception sur le moment ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'oui_rien_change', label: 'Oui, mais rien n\'a changé', emoji: '⚠️' },
              { id: 'oui_resolu', label: 'Oui, et c\'est résolu', emoji: '✅' },
              { id: 'non_pas_ose', label: 'Non, je n\'ai pas osé ou pas trouvé le temps', emoji: '❌' }
            ]
          },
          {
            id: 'q4_compensation',
            numero: 4,
            texte: 'Une compensation a-t-elle été proposée ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'surclassement', label: 'Surclassement', emoji: '🆙' },
              { id: 'petit_dej_offert', label: 'Petit-déjeuner offert', emoji: '🥐' },
              { id: 'late_checkout', label: 'Late check-out', emoji: '⏰' },
              { id: 'geste_commercial', label: 'Geste commercial', emoji: '🎁' },
              { id: 'non_rien', label: 'Non, rien', emoji: '❌' }
            ]
          },
          {
            id: 'q5_description_personnel',
            numero: 5,
            texte: 'Pouvez-vous décrire la personne concernée ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "Le réceptionniste de nuit" ou "La gouvernante du 3ème étage"'
          }
        ]
      },
      {
        scenario: 'MITIGE',
        noteMin: 3,
        noteMax: 3,
        tempsEstime: '30 secondes',
        questions: [
          {
            id: 'q1_point_friction',
            numero: 1,
            texte: "Qu'est-ce qui a manqué pour que votre séjour soit parfait ?",
            type: 'multiple',
            obligatoire: true,
            maxSelections: 2,
            options: [
              { id: 'insonorisation', label: 'Insonorisation', emoji: '🔊' },
              { id: 'qualite_petit_dej', label: 'Qualité du petit-déjeuner', emoji: '🥐' },
              { id: 'vitesse_wifi', label: 'Vitesse du WiFi', emoji: '📶' },
              { id: 'confort_literie', label: 'Confort de la literie', emoji: '🛏️' }
            ]
          }
        ]
      },
      {
        scenario: 'SUCCES',
        noteMin: 4,
        noteMax: 5,
        tempsEstime: '20 secondes',
        questions: [
          {
            id: 'q1_coup_de_coeur',
            numero: 1,
            texte: 'Votre coup de cœur ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'la_vue', label: 'La vue', emoji: '🌅' },
              { id: 'la_literie', label: 'La literie', emoji: '🛏️' },
              { id: 'le_petit_dejeuner', label: 'Le petit-déjeuner', emoji: '🥐' },
              { id: 'le_spa', label: 'Le SPA', emoji: '🧖' },
              { id: 'l_accueil', label: 'L\'accueil', emoji: '🤗' }
            ]
          },
          {
            id: 'q2_felicitations',
            numero: 2,
            texte: 'Un membre du personnel à féliciter ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "Le concierge qui nous a réservé un super restaurant"'
          }
        ]
      }
    ]
  },
  {
    secteur: 'TRANSPORT',
    scenarios: [
      {
        scenario: 'CRISE',
        noteMin: 1,
        noteMax: 2,
        tempsEstime: '60 secondes',
        questions: [
          {
            id: 'q1_zone_probleme',
            numero: 1,
            texte: 'Quelle zone a posé problème ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'checkin_comptoir', label: 'Check-in / Comptoir', emoji: '🛎️' },
              { id: 'controle_securite', label: 'Contrôle Sécurité', emoji: '🛡️' },
              { id: 'embarquement_quai', label: 'Embarquement / Quai', emoji: '🚪' },
              { id: 'bagages', label: 'Bagages', emoji: '🧳' },
              { id: 'information_orientation', label: 'Information / Orientation', emoji: '🗺️' },
              { id: 'sanitaires', label: 'Sanitaires', emoji: '🚻' }
            ]
          },
          {
            id: 'q2_precision_situation',
            numero: 2,
            texte: 'Précisez la situation :',
            type: 'unique',
            obligatoire: true,
            condition: { questionId: 'q1_zone_probleme', valeur: ['checkin_comptoir', 'controle_securite', 'embarquement_quai', 'bagages', 'information_orientation', 'sanitaires'] },
            options: [
              {
                id: 'checkin_comptoir',
                label: 'Problème check-in',
                sousOptions: [
                  { id: 'file_interminable', label: 'File interminable', emoji: '🐌' },
                  { id: 'agent_incompetent', label: 'Agent incompétent', emoji: '🤷' },
                  { id: 'attente_excessive', label: 'Attente excessive', emoji: '⏳' }
                ]
              },
              {
                id: 'controle_securite',
                label: 'Problème sécurité',
                sousOptions: [
                  { id: 'file_interminable', label: 'File interminable', emoji: '🐌' },
                  { id: 'stress_brusquerie', label: 'Stress / Brusquerie', emoji: '😰' },
                  { id: 'manque_personnel', label: 'Manque de personnel', emoji: '👥' }
                ]
              },
              {
                id: 'information_orientation',
                label: 'Problème information',
                sousOptions: [
                  { id: 'panneaux_illisibles', label: 'Panneaux illisibles', emoji: '🚫' },
                  { id: 'personnel_incompetent', label: 'Personnel incompétent', emoji: '🤷' },
                  { id: 'info_manquante', label: 'Information manquante', emoji: '❓' }
                ]
              },
              {
                id: 'sanitaires',
                label: 'Problème sanitaires',
                sousOptions: [
                  { id: 'sale', label: 'Sale', emoji: '🧹' },
                  { id: 'manque_papier', label: 'Manque de papier', emoji: '🧻' },
                  { id: 'odeur_desagreable', label: 'Odeur désagréable', emoji: '🤢' }
                ]
              }
            ]
          },
          {
            id: 'q3_impact_voyage',
            numero: 3,
            texte: 'Cela a-t-il impacté votre voyage ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'risque_retard', label: 'Risque de retard', emoji: '⏰' },
              { id: 'stress_intense', label: 'Stress intense', emoji: '😰' },
              { id: 'perte_temps_majeure', label: 'Perte de temps majeure', emoji: '⏳' }
            ]
          },
          {
            id: 'q4_reaction_personnel',
            numero: 4,
            texte: 'Comment le personnel a-t-il réagi à votre demande d\'aide ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'aidant_clair', label: 'Aidant et clair', emoji: '✅' },
              { id: 'indifferent', label: 'Indifférent', emoji: '😐' },
              { id: 'brusque_desagreable', label: 'Brusque et désagréable', emoji: '😠' }
            ]
          },
          {
            id: 'q5_description_agent',
            numero: 5,
            texte: 'Pouvez-vous décrire l\'agent concerné ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "L\'agent à l\'embarquement porte C"'
          }
        ]
      },
      {
        scenario: 'MITIGE',
        noteMin: 3,
        noteMax: 3,
        tempsEstime: '30 secondes',
        questions: [
          {
            id: 'q1_inconfort',
            numero: 1,
            texte: "Qu'est-ce qui a rendu votre attente ou votre transit désagréable ?",
            type: 'multiple',
            obligatoire: true,
            maxSelections: 2,
            options: [
              { id: 'proprete_sanitaires', label: 'Propreté des sanitaires', emoji: '🚻' },
              { id: 'confort_sieges', label: 'Confort des sièges', emoji: '🪑' },
              { id: 'manque_prises', label: 'Manque de prises électriques', emoji: '🔌' },
              { id: 'bruit', label: 'Bruit', emoji: '🔊' }
            ]
          }
        ]
      },
      {
        scenario: 'SUCCES',
        noteMin: 4,
        noteMax: 5,
        tempsEstime: '20 secondes',
        questions: [
          {
            id: 'q1_apprecie',
            numero: 1,
            texte: "Qu'avez-vous particulièrement apprécié ?",
            type: 'multiple',
            obligatoire: true,
            options: [
              { id: 'fluidite_files', label: 'Fluidité des files', emoji: '⚡' },
              { id: 'clarte_infos', label: 'Clarté des infos', emoji: '🗺️' },
              { id: 'proprete', label: 'Propreté', emoji: '✨' },
              { id: 'calme', label: 'Calme', emoji: '🔇' }
            ]
          },
          {
            id: 'q2_felicitations',
            numero: 2,
            texte: 'Quel agent a particulièrement facilité votre voyage ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "L\'agent à l\'embarquement porte C qui a été très rassurant"'
          }
        ]
      }
    ]
  },
  {
    secteur: 'SANTE',
    scenarios: [
      {
        scenario: 'CRISE',
        noteMin: 1,
        noteMax: 2,
        tempsEstime: '60 secondes',
        questions: [
          {
            id: 'q1_service',
            numero: 1,
            texte: 'Quel service était concerné ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'urgences', label: 'Urgences', emoji: '🚨' },
              { id: 'consultation', label: 'Consultation externe', emoji: '🩺' },
              { id: 'hospitalisation', label: 'Hospitalisation', emoji: '🛏️' },
              { id: 'bloc_imagerie', label: 'Bloc / Imagerie', emoji: '📷' },
              { id: 'cafeteria_attente', label: 'Cafétéria / Attente', emoji: '☕' }
            ]
          },
          {
            id: 'q2_probleme_principal',
            numero: 2,
            texte: 'Quel a été le problème principal ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'attente_interminable', label: 'Attente interminable sans info', emoji: '⏳' },
              { id: 'attitude_cassante', label: 'Attitude cassante / déshumanisante', emoji: '🤬' },
              { id: 'hygiene_douteuse', label: 'Hygiène douteuse', emoji: '🧹' },
              { id: 'explications_incomprehensibles', label: 'Explications médicales incompréhensibles', emoji: '🤷' }
            ]
          },
          {
            id: 'q3_ressenti_ecoute',
            numero: 3,
            texte: 'Vous êtes-vous senti écouté et respecté ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'oui_empathique', label: 'Oui, équipe empathique', emoji: '🤗' },
              { id: 'moyennement', label: 'Moyennement', emoji: '😐' },
              { id: 'non_numero', label: 'Non, sentiment d\'être un "numéro"', emoji: '❌' }
            ]
          },
          {
            id: 'q4_environnement',
            numero: 4,
            texte: "L'environnement était-il adapté ?",
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'bruit_excessif', label: 'Bruit excessif', emoji: '🔊' },
              { id: 'chambre_sale', label: 'Chambre sale', emoji: '🧹' },
              { id: 'temperature_inadaptee', label: 'Température inadaptée', emoji: '🌡️' }
            ]
          },
          {
            id: 'q5_description_soignant',
            numero: 5,
            texte: 'Pouvez-vous décrire le soignant / la personne concernée ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "L\'infirmière de nuit, très douce" ou "Le médecin des urgences"'
          }
        ]
      },
      {
        scenario: 'MITIGE',
        noteMin: 3,
        noteMax: 3,
        tempsEstime: '30 secondes',
        questions: [
          {
            id: 'q1_progression',
            numero: 1,
            texte: 'Sur quel point l\'établissement doit-il progresser ?',
            type: 'multiple',
            obligatoire: true,
            maxSelections: 2,
            options: [
              { id: 'plus_empathie', label: "Plus d'empathie", emoji: '🤗' },
              { id: 'plus_clarte', label: 'Plus de clarté sur les démarches', emoji: '📋' },
              { id: 'confort_chambre', label: 'Confort de la chambre', emoji: '🛏️' },
              { id: 'qualite_repas', label: 'Qualité des repas', emoji: '🍽️' }
            ]
          }
        ]
      },
      {
        scenario: 'SUCCES',
        noteMin: 4,
        noteMax: 5,
        tempsEstime: '20 secondes',
        questions: [
          {
            id: 'q1_rassure',
            numero: 1,
            texte: "Qu'est-ce qui vous a rassuré ou apporté du confort ?",
            type: 'multiple',
            obligatoire: true,
            options: [
              { id: 'competence_soins', label: 'Compétence des soins', emoji: '💉' },
              { id: 'douceur_personnel', label: 'Douceur du personnel', emoji: '🤗' },
              { id: 'proprete', label: 'Propreté', emoji: '✨' },
              { id: 'calme', label: 'Calme', emoji: '🔇' }
            ]
          },
          {
            id: 'q2_felicitations',
            numero: 2,
            texte: 'Qui a su vous rassurer ou vous apporter du réconfort ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "L\'infirmière de nuit, très douce et à l\'écoute"'
          }
        ]
      }
    ]
  },
  {
    secteur: 'ADMINISTRATION',
    scenarios: [
      {
        scenario: 'CRISE',
        noteMin: 1,
        noteMax: 2,
        tempsEstime: '60 secondes',
        questions: [
          {
            id: 'q1_objet_visite',
            numero: 1,
            texte: 'Quel était l\'objet de votre visite ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'etat_civil', label: 'État civil', emoji: '📄' },
              { id: 'urbanisme', label: 'Urbanisme', emoji: '🏗️' },
              { id: 'social_aides', label: 'Social / Aides', emoji: '🤝' },
              { id: 'guichet_unique', label: 'Guichet unique', emoji: '🏛️' },
              { id: 'autre', label: 'Autre', emoji: '📋' }
            ]
          },
          {
            id: 'q2_blocage',
            numero: 2,
            texte: 'Quel a été le blocage ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'dossier_incomplet', label: 'Dossier incomplet sans qu\'on me prévienne avant', emoji: '📄' },
              { id: 'attente_1h', label: 'Attente > 1h sans info', emoji: '🐌' },
              { id: 'guichet_ferme', label: 'Guichet fermé / Agent absent', emoji: '🚫' },
              { id: 'agent_cassant', label: 'Agent cassant / impatient', emoji: '😠' }
            ]
          },
          {
            id: 'q3_accessibilite',
            numero: 3,
            texte: "L'accessibilité et le confort étaient-ils respectés ?",
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'salle_insalue', label: 'Salle d\'attente insalubre', emoji: '🧹' },
              { id: 'non_respect_pmr', label: 'Non-respect des normes PMR', emoji: '♿' },
              { id: 'pas_info_claire', label: 'Pas d\'information claire en entrée', emoji: '❓' }
            ]
          },
          {
            id: 'q4_solution',
            numero: 4,
            texte: 'Avez-vous obtenu une solution ou un rendez-vous de suivi ?',
            type: 'unique',
            obligatoire: true,
            options: [
              { id: 'oui_resolu', label: 'Oui, problème résolu', emoji: '✅' },
              { id: 'non_dois_revenir', label: 'Non, je dois revenir', emoji: '❌' },
              { id: 'renvoye_ailleurs', label: 'On m\'a envoyé voir ailleurs', emoji: '🔄' }
            ]
          },
          {
            id: 'q5_description_agent',
            numero: 5,
            texte: 'Pouvez-vous décrire l\'agent concerné ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "Mme Dupont au guichet 3"'
          }
        ]
      },
      {
        scenario: 'MITIGE',
        noteMin: 3,
        noteMax: 3,
        tempsEstime: '30 secondes',
        questions: [
          {
            id: 'q1_penible',
            numero: 1,
            texte: "Qu'est-ce qui a rendu votre démarche pénible ?",
            type: 'multiple',
            obligatoire: true,
            maxSelections: 2,
            options: [
              { id: 'complexite_formulaires', label: 'Complexité des formulaires', emoji: '📋' },
              { id: 'temps_attente', label: "Temps d'attente", emoji: '⏳' },
              { id: 'manque_guidance', label: 'Manque de guidance', emoji: '🤷' },
              { id: 'proprete_lieux', label: 'Propreté des lieux', emoji: '🧹' }
            ]
          }
        ]
      },
      {
        scenario: 'SUCCES',
        noteMin: 4,
        noteMax: 5,
        tempsEstime: '20 secondes',
        questions: [
          {
            id: 'q1_apprecie',
            numero: 1,
            texte: "Qu'avez-vous apprécié dans le service rendu ?",
            type: 'multiple',
            obligatoire: true,
            options: [
              { id: 'pedagogie_agent', label: "Pédagogie de l'agent", emoji: '🎓' },
              { id: 'rapidite_traitement', label: 'Rapidité du traitement', emoji: '⚡' },
              { id: 'proprete', label: 'Propreté', emoji: '✨' },
              { id: 'courtoisie', label: 'Courtoisie', emoji: '😊' }
            ]
          },
          {
            id: 'q2_felicitations',
            numero: 2,
            texte: 'Quel agent a fait preuve de pédagogie et de patience ?',
            type: 'texte',
            obligatoire: false,
            placeholder: 'Ex: "Mme Dupont au guichet 3, très claire sur les pièces à fournir"'
          }
        ]
      }
    ]
  }
];

// Fonction utilitaire pour récupérer la config selon le secteur
export function getQuestionnaireConfig(secteur: Secteur): SecteurConfig {
  const config = QUESTIONNAIRE_CONFIG.find(c => c.secteur === secteur);
  if (!config) {
    throw new Error(`Configuration non trouvée pour le secteur: ${secteur}`);
  }
  return config;
}

// ============================================================
// Task 2 — Récupération du questionnaire depuis la BDD
// ------------------------------------------------------------
// La config du questionnaire adaptatif (3 scénarios CRISE/MITIGE/SUCCES)
// est désormais stockée dans SecteurConfig.questionnaireConfig (JSON).
// Elle reste éditable depuis le superadmin (onglet "Configuration secteurs").
//
// getQuestionnaireConfigFromDb(config) :
//   1. Parse le JSON stocké en BDD (SecteurConfig.questionnaireConfig)
//   2. Si valide (3 scénarios avec questions) → renvoie la config BDD
//   3. Sinon (champ vide, JSON invalide, structure incomplète) → fallback
//      sur le QUESTIONNAIRE_CONFIG hardcoded (fichier statique)
//
// Cette fonction est pure (aucun accès DB) : l'appelant charge la
// SecteurConfig via Prisma, puis passe l'objet { questionnaireConfig } à
// cette fonction. Permet de l'utiliser côté serveur (API routes) et côté
// client ( après fetch /api/secteurs/[id]).
// ============================================================

/** Type local correspondant à un sous-ensemble de SecteurConfig (BDD). */
type SecteurConfigDb = {
  questionnaireConfig?: string | null
}

/**
 * Récupère la config du questionnaire depuis le JSON stocké en BDD.
 * Fallback sur le QUESTIONNAIRE_CONFIG hardcoded si le champ est vide,
 * invalide ou incomplet. Ne lève JAMAIS d'exception.
 *
 * @param config Objet partiel de SecteurConfig (BDD) contenant questionnaireConfig
 * @param macroSecteur Identifiant du macro-secteur (RESTAURATION, HOTELLERIE,
 *                      TRANSPORT, SANTE, ADMINISTRATION) — utilisé pour le fallback
 *                      sur le QUESTIONNAIRE_CONFIG hardcoded. Si absent, fallback
 *                      sur RESTAURATION (config la plus générique).
 */
export function getQuestionnaireConfigFromDb(
  config: SecteurConfigDb | null | undefined,
  macroSecteur?: Secteur | null
): SecteurConfig {
  // 1) Tente de parser le JSON BDD
  if (config?.questionnaireConfig) {
    try {
      const parsed = JSON.parse(config.questionnaireConfig) as unknown
      // Valide la structure : doit être un objet { secteur, scenarios: ScenarioConfig[] }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Partial<SecteurConfig>
        if (Array.isArray(obj.scenarios) && obj.scenarios.length > 0) {
          // Vérifie que chaque scénario a au moins une question
          const tousValides = obj.scenarios.every(
            (s) =>
              s &&
              typeof s.scenario === "string" &&
              Array.isArray(s.questions) &&
              s.questions.length > 0
          )
          if (tousValides) {
            return obj as SecteurConfig
          }
        }
      }
    } catch {
      // JSON invalide → fallback
    }
  }

  // 2) Fallback : QUESTIONNAIRE_CONFIG hardcoded
  const secteurFallback: Secteur = macroSecteur ?? "RESTAURATION"
  return (
    QUESTIONNAIRE_CONFIG.find((c) => c.secteur === secteurFallback) ??
    QUESTIONNAIRE_CONFIG[0]
  )
}

/** Map un type d'établissement (Pro.typeEtablissement) vers un macro-secteur. */
export function macroSecteurPourTypeEtablissement(type: string | null | undefined): Secteur {
  if (!type) return "RESTAURATION"
  const t = type.toLowerCase()
  if (t.includes("hôtel") || t.includes("hotel") || t.includes("hébergement")) return "HOTELLERIE"
  if (t.includes("hôpital") || t.includes("hopital") || t.includes("clinique") || t.includes("santé") || t.includes("sante"))
    return "SANTE"
  if (t.includes("aéroport") || t.includes("aeroport") || t.includes("gare") || t.includes("transport"))
    return "TRANSPORT"
  if (t.includes("mairie") || t.includes("administration") || t.includes("entreprise") || t.includes("public"))
    return "ADMINISTRATION"
  // Restaurant, Fast Food, Café, Boulangerie, Boutique, Salon, Garage, Autre → RESTAURATION (générique)
  return "RESTAURATION"
}

// Fonction utilitaire pour récupérer le scénario selon la note
export function getScenarioByNote(config: SecteurConfig, note: number): ScenarioConfig {
  const scenario = config.scenarios.find(s => note >= s.noteMin && note <= s.noteMax);
  if (!scenario) {
    throw new Error(`Scénario non trouvé pour la note: ${note}`);
  }
  return scenario;
}

// Fonction utilitaire pour filtrer les questions selon les conditions
export function filterQuestionsByConditions(
  questions: Question[],
  reponses: Record<string, string | string[]>
): Question[] {
  return questions.filter(question => {
    if (!question.condition) return true;
    
    const reponseCondition = reponses[question.condition.questionId];
    if (!reponseCondition) return false;
    
    if (Array.isArray(question.condition.valeur)) {
      return question.condition.valeur.includes(reponseCondition as string);
    }
    
    return reponseCondition === question.condition.valeur;
  });
}