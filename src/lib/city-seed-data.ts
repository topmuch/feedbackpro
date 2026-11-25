// =============================================================================
// Dakar Region — Commune & Quartier Seed Data
// =============================================================================
// All 53 communes of the Dakar region (Senegal), organised by department.
//
// GPS coordinates are APPROXIMATE centres for each commune (good enough for
// map zoom / default placement). The mairie (town hall) will refine per-quartier
// coordinates later through the admin dashboard.
//
// Plate type hints:
//   - "ecole"   → quartier name contains "École" / "école" / "Campus"
//   - "gare"    → quartier name contains "Gare"
//   - "mairie"  → quartier name contains "Mairie"
//   - "standard" → default (omitted in data, treated as standard downstream)
// =============================================================================

export type CommuneSeed = {
  /** 2-letter prefix used for plate numbering (e.g. "DD" for Dieuppeul) */
  code: string
  /** Full commune name */
  name: string
  /** Department name the commune belongs to */
  department: string
  /** Approximate centre latitude */
  centerLat: number
  /** Approximate centre longitude */
  centerLng: number
  /** Quartier names with optional plate type */
  quartiers: { name: string; type?: string }[]
}

export type DepartmentSeed = {
  name: string
  communes: CommuneSeed[]
}

// -----------------------------------------------------------------------------
// Local helper — generates "Unités" quartiers for the big social-housing estates
// (Parcelles Assainies, Jaxaay-Parcelles). Not exported; pure data generation.
// -----------------------------------------------------------------------------
function genUnits(count: number): { name: string; type?: string }[] {
  return Array.from({ length: count }, (_, i) => ({ name: `U${i + 1}` }))
}

// =============================================================================
// DAKAR REGION — by department
// =============================================================================

export const DAKAR_REGION: DepartmentSeed[] = [
  // ---------------------------------------------------------------------------
  // Département de Dakar (19 communes)
  // ---------------------------------------------------------------------------
  {
    name: "Dakar",
    communes: [
      {
        code: "PL",
        name: "Dakar-Plateau",
        department: "Dakar",
        centerLat: 14.669,
        centerLng: -17.439,
        quartiers: [
          { name: "Plateau" },
          { name: "Rebeuss" },
          { name: "Sandaga" },
          { name: "Kermel" },
          { name: "Bel-Air" },
          { name: "Cap Manuel" },
          { name: "Pasteur" },
        ],
      },
      {
        code: "MD",
        name: "Médina",
        department: "Dakar",
        centerLat: 14.668,
        centerLng: -17.436,
        quartiers: [
          { name: "Médina" },
          { name: "Centenaire" },
          { name: "Tilène" },
          { name: "Gibraltars" },
          { name: "Soumbédioune" },
        ],
      },
      {
        code: "GT",
        name: "Gueule Tapée-Fass-Colobane",
        department: "Dakar",
        centerLat: 14.665,
        centerLng: -17.435,
        quartiers: [
          { name: "Gueule Tapée" },
          { name: "Fass" },
          { name: "Colobane" },
        ],
      },
      {
        code: "FN",
        name: "Fann-Point E-Amitié",
        department: "Dakar",
        centerLat: 14.678,
        centerLng: -17.438,
        quartiers: [
          { name: "Fann Résidence" },
          { name: "Fann Hock" },
          { name: "Point E" },
          { name: "Amitié" },
          { name: "Zone A" },
          { name: "Zone B" },
          { name: "Campus UCAD", type: "ecole" },
        ],
      },
      {
        code: "GR",
        name: "Gorée",
        department: "Dakar",
        centerLat: 14.666,
        centerLng: -17.325,
        quartiers: [{ name: "Île de Gorée (Castel, Village)" }],
      },
      {
        code: "NG",
        name: "Ngor",
        department: "Dakar",
        centerLat: 14.749,
        centerLng: -17.484,
        quartiers: [
          { name: "Village de Ngor" },
          { name: "Les Almadies" },
          { name: "Ngor Virage" },
          { name: "Île de Ngor" },
        ],
      },
      {
        code: "OK",
        name: "Ouakam",
        department: "Dakar",
        centerLat: 14.717,
        centerLng: -17.483,
        quartiers: [
          { name: "Village de Ouakam" },
          { name: "Les Mamelles" },
          { name: "Cité Avion" },
          { name: "Cité Comico" },
          { name: "Cité Assemblée" },
          { name: "Cité Batrain" },
          { name: "Touba Ouakam" },
        ],
      },
      {
        code: "YF",
        name: "Yoff",
        department: "Dakar",
        centerLat: 14.747,
        centerLng: -17.476,
        quartiers: [
          { name: "Village traditionnel (Tonghor, Ndénatte, Layène, Dagoudane)" },
          { name: "Nord Foire" },
          { name: "Ouest Foire" },
          { name: "Sud Foire" },
          { name: "Cité Biagui" },
          { name: "Cité Djily Mbaye" },
          { name: "Virage" },
          { name: "Diamalaye" },
          { name: "BCEAO" },
        ],
      },
      {
        code: "MS",
        name: "Mermoz-Sacré-Cœur",
        department: "Dakar",
        centerLat: 14.733,
        centerLng: -17.464,
        quartiers: [
          { name: "Mermoz" },
          { name: "Sacré-Cœur (1, 2 et 3)" },
          { name: "Cité Keur Gorgui" },
          { name: "Pyrotechnie" },
          { name: "Karack" },
          { name: "Baobab" },
        ],
      },
      {
        code: "GD",
        name: "Grand Dakar",
        department: "Dakar",
        centerLat: 14.716,
        centerLng: -17.456,
        quartiers: [
          { name: "Grand Dakar" },
          { name: "Niary Tally" },
          { name: "Usine Niary Tally" },
          { name: "Bopp" },
        ],
      },
      {
        code: "BS",
        name: "Biscuiterie",
        department: "Dakar",
        centerLat: 14.71,
        centerLng: -17.463,
        quartiers: [
          { name: "Biscuiterie" },
          { name: "Ouagou Niayes (1 et 2)" },
          { name: "Bopp" },
          { name: "Cité Bissap" },
        ],
      },
      {
        code: "DD",
        name: "Dieuppeul-Derklé",
        department: "Dakar",
        centerLat: 14.7167,
        centerLng: -17.4333,
        quartiers: [
          { name: "Dieuppeul (1, 2, 3 et 4)" },
          { name: "Derklé" },
          { name: "Castors" },
        ],
      },
      {
        code: "SL",
        name: "Sicap-Liberté",
        department: "Dakar",
        centerLat: 14.723,
        centerLng: -17.453,
        quartiers: [
          { name: "Liberté (1, 2, 3, 4, 5 et 6)" },
          { name: "Sicap Rue 10" },
          { name: "Sicap Karack" },
        ],
      },
      {
        code: "HL",
        name: "HLM",
        department: "Dakar",
        centerLat: 14.73,
        centerLng: -17.448,
        quartiers: [
          { name: "HLM (1, 2, 3, 4, 5 et 6)" },
          { name: "HLM Grand Médine" },
          { name: "Nimzatt" },
          { name: "Angle Mousse" },
        ],
      },
      {
        code: "HB",
        name: "Hann-Bel Air",
        department: "Dakar",
        centerLat: 14.701,
        centerLng: -17.438,
        quartiers: [
          { name: "Hann Village (Hann Pêcheurs)" },
          { name: "Hann Marinas" },
          { name: "Hann Montagne" },
          { name: "Bel-Air" },
          { name: "Zone Industrielle" },
          { name: "Parc de Hann" },
          { name: "Dalifort" },
        ],
      },
      {
        code: "PA",
        name: "Parcelles Assainies",
        department: "Dakar",
        centerLat: 14.762,
        centerLng: -17.438,
        quartiers: [
          ...genUnits(26), // U1 ... U26
          { name: "Cité Fadia" },
        ],
      },
      {
        code: "GY",
        name: "Grand Yoff",
        department: "Dakar",
        centerLat: 14.747,
        centerLng: -17.425,
        quartiers: [
          { name: "Grand Yoff" },
          { name: "Arafat" },
          { name: "Khar Yalla" },
          { name: "Scat Urbam" },
          { name: "HLM Grand Yoff" },
          { name: "Zone de Captage" },
          { name: "Liberté 6 Extension" },
        ],
      },
      {
        code: "PO",
        name: "Patte d'Oie",
        department: "Dakar",
        centerLat: 14.733,
        centerLng: -17.427,
        quartiers: [
          { name: "Patte d'Oie" },
          { name: "Patte d'Oie Builders" },
          { name: "Cité Impôts et Domaines" },
          { name: "Cité Soprim" },
          { name: "Grand Médine" },
        ],
      },
      {
        code: "CB",
        name: "Cambérène",
        department: "Dakar",
        centerLat: 14.753,
        centerLng: -17.415,
        quartiers: [
          { name: "Village de Cambérène" },
          { name: "Cité Nations Unies" },
          { name: "Cité Dalal Jam" },
          { name: "Parcelles Assainies (bordure)" },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Département de Pikine (12 communes)
  // ---------------------------------------------------------------------------
  {
    name: "Pikine",
    communes: [
      {
        code: "PW",
        name: "Pikine Ouest",
        department: "Pikine",
        centerLat: 14.754,
        centerLng: -17.39,
        quartiers: [
          { name: "Pikine Ouest" },
          { name: "Cité Lobatt Fall" },
          { name: "Tally Boumack" },
          { name: "Tally Boubess" },
          { name: "Khourounar" },
        ],
      },
      {
        code: "PN",
        name: "Pikine Nord",
        department: "Pikine",
        centerLat: 14.76,
        centerLng: -17.385,
        quartiers: [
          { name: "Pikine Nord" },
          { name: "Cité Sotrac" },
          { name: "Camp Marchand" },
          { name: "Cité Gare", type: "gare" },
          { name: "Marché Syndicat" },
        ],
      },
      {
        code: "PE",
        name: "Pikine Est",
        department: "Pikine",
        centerLat: 14.764,
        centerLng: -17.378,
        quartiers: [
          { name: "Pikine Est" },
          { name: "Icotaf (1 et 2)" },
          { name: "Cité Police" },
          { name: "Darou Khoudoss" },
          { name: "Cité Texaco" },
        ],
      },
      {
        code: "DF",
        name: "Dalifort",
        department: "Pikine",
        centerLat: 14.746,
        centerLng: -17.398,
        quartiers: [
          { name: "Dalifort" },
          { name: "Cité Soleil" },
          { name: "Cité Belvédère" },
          { name: "Foirail" },
        ],
      },
      {
        code: "DK",
        name: "Djidah Thiaroye Kao",
        department: "Pikine",
        centerLat: 14.773,
        centerLng: -17.37,
        quartiers: [
          { name: "Djidah Thiaroye Kao" },
          { name: "Léona" },
          { name: "Darou Salam" },
          { name: "Moussanté" },
          { name: "Lansar" },
        ],
      },
      {
        code: "GN",
        name: "Guinaw Rail Nord",
        department: "Pikine",
        centerLat: 14.768,
        centerLng: -17.383,
        quartiers: [
          { name: "Guinaw Rail Nord" },
          { name: "Tally Diallo" },
          { name: "Nimzatt" },
          { name: "Darou Salam" },
        ],
      },
      {
        code: "GS",
        name: "Guinaw Rail Sud",
        department: "Pikine",
        centerLat: 14.765,
        centerLng: -17.388,
        quartiers: [
          { name: "Guinaw Rail Sud" },
          { name: "Quartier Sénégal" },
          { name: "Maka Colobane" },
          { name: "Thiaroye Azur" },
        ],
      },
      {
        code: "TM",
        name: "Thiaroye-sur-Mer",
        department: "Pikine",
        centerLat: 14.78,
        centerLng: -17.37,
        quartiers: [
          { name: "Thiaroye-sur-Mer" },
          { name: "Mbengue" },
          { name: "Ndeungagne" },
          { name: "Lébougui" },
        ],
      },
      {
        code: "TG",
        name: "Thiaroye Gare",
        department: "Pikine",
        centerLat: 14.778,
        centerLng: -17.365,
        quartiers: [
          { name: "Thiaroye Gare", type: "gare" },
          { name: "Médina Thiaroye" },
          { name: "Cité Enseignants" },
          { name: "Tally Diallo" },
        ],
      },
      {
        code: "TD",
        name: "Tivaouane Diacksao",
        department: "Pikine",
        centerLat: 14.77,
        centerLng: -17.36,
        quartiers: [
          { name: "Tivaouane Diacksao" },
          { name: "Diacksao 1 et 2" },
          { name: "Cité Fadia" },
          { name: "Cité Gadaye" },
        ],
      },
      {
        code: "DM",
        name: "Diamaguène-Sicap Mbao",
        department: "Pikine",
        centerLat: 14.755,
        centerLng: -17.345,
        quartiers: [
          { name: "Diamaguène" },
          { name: "Sicap Mbao" },
          { name: "Fass Mbao" },
          { name: "Lansar" },
          { name: "Cité Sonatel" },
          { name: "Cité Lamine" },
        ],
      },
      {
        code: "MB",
        name: "Mbao",
        department: "Pikine",
        centerLat: 14.745,
        centerLng: -17.335,
        quartiers: [
          { name: "Grand Mbao" },
          { name: "Petit Mbao" },
          { name: "Kamb" },
          { name: "Villeneuve" },
          { name: "Cité Sipres" },
          { name: "Zac Mbao" },
          { name: "Keur Mbaye Fall" },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Département de Guédiawaye (5 communes)
  // ---------------------------------------------------------------------------
  {
    name: "Guédiawaye",
    communes: [
      {
        code: "GO",
        name: "Golf Sud",
        department: "Guédiawaye",
        centerLat: 14.78,
        centerLng: -17.39,
        quartiers: [
          { name: "Golf Sud" },
          { name: "Hamo (1 à 6)" },
          { name: "Cité Aliou Sow" },
          { name: "Cité des Enseignants" },
          { name: "Cité SHS" },
          { name: "Gadaye" },
          { name: "Cité Tobago" },
          { name: "Cité Fadia" },
        ],
      },
      {
        code: "SN",
        name: "Sam Notaire",
        department: "Guédiawaye",
        centerLat: 14.785,
        centerLng: -17.395,
        quartiers: [
          { name: "Sam Notaire" },
          { name: "Cité Gendarmerie" },
          { name: "Cité Marine" },
          { name: "HLM Las Palmas" },
          { name: "Nimzatt" },
          { name: "Sahm" },
        ],
      },
      {
        code: "WN",
        name: "Wakhinane Nimzatt",
        department: "Guédiawaye",
        centerLat: 14.775,
        centerLng: -17.385,
        quartiers: [
          { name: "Wakhinane" },
          { name: "Nimzatt" },
          { name: "Cité des Cadres" },
          { name: "Cité Sonepi" },
          { name: "Angle Mousse" },
          { name: "Corniche" },
        ],
      },
      {
        code: "NL",
        name: "Ndiarème Limamoulaye",
        department: "Guédiawaye",
        centerLat: 14.783,
        centerLng: -17.392,
        quartiers: [
          { name: "Ndiarème Limamoulaye" },
          { name: "Darou Khoudoss" },
          { name: "Cité Électricité" },
          { name: "Baye Laye" },
        ],
      },
      {
        code: "MG",
        name: "Médina Gounass",
        department: "Guédiawaye",
        centerLat: 14.778,
        centerLng: -17.398,
        quartiers: [
          { name: "Médina Gounass" },
          { name: "Djeddah" },
          { name: "Cité Paix" },
          { name: "Darou Salam" },
          { name: "Bagdad" },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Département de Keur Massar (6 communes)
  // ---------------------------------------------------------------------------
  {
    name: "Keur Massar",
    communes: [
      {
        code: "MK",
        name: "Malika",
        department: "Keur Massar",
        centerLat: 14.79,
        centerLng: -17.35,
        quartiers: [
          { name: "Malika Village" },
          { name: "Malika Plage" },
          { name: "Cité Sonatel" },
          { name: "Cité Sipres" },
          { name: "Cité Gadaye" },
          { name: "Cité Aliou Sow" },
        ],
      },
      {
        code: "KN",
        name: "Keur Massar Nord",
        department: "Keur Massar",
        centerLat: 14.795,
        centerLng: -17.355,
        quartiers: [
          { name: "Keur Massar Village" },
          { name: "Aïnoumady" },
          { name: "Cité Pénitentiaire" },
          { name: "Cité Apix" },
          { name: "MTOA" },
          { name: "Almadies 2" },
          { name: "Cité Marine" },
          { name: "Santa Yalla" },
        ],
      },
      {
        code: "YN",
        name: "Yeumbeul Nord",
        department: "Keur Massar",
        centerLat: 14.785,
        centerLng: -17.37,
        quartiers: [
          { name: "Yeumbeul Nord" },
          { name: "Bène Baraque" },
          { name: "Cité Comico" },
          { name: "Darou Salam" },
          { name: "Médina Kell" },
          { name: "Cité Cheikh Amar" },
        ],
      },
      {
        code: "YS",
        name: "Yeumbeul Sud",
        department: "Keur Massar",
        centerLat: 14.782,
        centerLng: -17.365,
        quartiers: [
          { name: "Yeumbeul Sud" },
          { name: "Asecna" },
          { name: "Boune" },
          { name: "Darou Rahmane" },
          { name: "Cité Fadilou Mbacké" },
          { name: "Thiaroye Kao" },
        ],
      },
      {
        code: "JP",
        name: "Jaxaay-Parcelles",
        department: "Keur Massar",
        centerLat: 14.8,
        centerLng: -17.34,
        quartiers: [
          { name: "Jaxaay 1 et 2" },
          ...genUnits(25), // U1 ... U25 (Parcelles Assainies de Keur Massar)
          { name: "Niakoul Rab" },
        ],
      },
      {
        code: "KS",
        name: "Keur Massar Sud",
        department: "Keur Massar",
        centerLat: 14.795,
        centerLng: -17.33,
        quartiers: [
          { name: "Keur Massar Sud" },
          { name: "Darou Mishty" },
          { name: "Cité Gendarmerie" },
          { name: "Forêt Classée" },
          { name: "Kounoune" },
          { name: "Darou Salam" },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Département de Rufisque (11 communes)
  // ---------------------------------------------------------------------------
  {
    name: "Rufisque",
    communes: [
      {
        code: "RO",
        name: "Rufisque Ouest",
        department: "Rufisque",
        centerLat: 14.712,
        centerLng: -17.287,
        quartiers: [
          { name: "Dangou" },
          { name: "Mérina" },
          { name: "Keury Kao" },
          { name: "Keury Souf" },
          { name: "Cité Tacko" },
          { name: "Cité Imprimerie" },
          { name: "Diokoul" },
        ],
      },
      {
        code: "RN",
        name: "Rufisque Nord",
        department: "Rufisque",
        centerLat: 14.715,
        centerLng: -17.283,
        quartiers: [
          { name: "Colobane" },
          { name: "Gouye Mouride" },
          { name: "Arafat" },
          { name: "HLM Rufisque" },
          { name: "Castors" },
          { name: "Cité CSE" },
          { name: "Ndargoundaw" },
        ],
      },
      {
        code: "RE",
        name: "Rufisque Est",
        department: "Rufisque",
        centerLat: 14.718,
        centerLng: -17.278,
        quartiers: [
          { name: "Thiawlène" },
          { name: "Diorga" },
          { name: "Santa Yalla" },
          { name: "Médine" },
          { name: "Santhiaba" },
          { name: "Bata" },
          { name: "Cité Millionnaire" },
        ],
      },
      {
        code: "SG",
        name: "Sangalkam",
        department: "Rufisque",
        centerLat: 14.73,
        centerLng: -17.26,
        quartiers: [
          { name: "Sangalkam Village" },
          { name: "Noflaye" },
          { name: "Keur Daouda Sarr" },
          { name: "Gorom (1, 2 et 3)" },
          { name: "Ndiakhirate" },
        ],
      },
      {
        code: "BB",
        name: "Bambilor",
        department: "Rufisque",
        centerLat: 14.74,
        centerLng: -17.27,
        quartiers: [
          { name: "Bambilor" },
          { name: "Kounoune" },
          { name: "Déni Biram Ndao" },
          { name: "Wayembam" },
          { name: "Mbeuth" },
          { name: "Keur Ndiaye Lô" },
        ],
      },
      {
        code: "TP",
        name: "Tivaouane Peulh-Niaga",
        department: "Rufisque",
        centerLat: 14.75,
        centerLng: -17.24,
        quartiers: [
          { name: "Tivaouane Peulh" },
          { name: "Niaga" },
          { name: "Lac Rose (Retba)" },
          { name: "Mbawane" },
          { name: "Keur Abdou Ndoye" },
          { name: "Cité Apix" },
        ],
      },
      {
        code: "DI",
        name: "Diamniadio",
        department: "Rufisque",
        centerLat: 14.73,
        centerLng: -17.23,
        quartiers: [
          { name: "Diamniadio Village" },
          { name: "Pôle Urbain de Diamniadio" },
          { name: "Déni Malick Guèye" },
          { name: "Dougar" },
          { name: "Yéba" },
        ],
      },
      {
        code: "BN",
        name: "Bargny",
        department: "Rufisque",
        centerLat: 14.7,
        centerLng: -17.23,
        quartiers: [
          { name: "Bargny Guedj" },
          { name: "Bargny Minam" },
          { name: "Missirah" },
          { name: "Ngouye" },
          { name: "Kip-Kip" },
          { name: "Ndolène" },
        ],
      },
      {
        code: "SD",
        name: "Sendou",
        department: "Rufisque",
        centerLat: 14.69,
        centerLng: -17.24,
        quartiers: [
          { name: "Sendou Village" },
          { name: "Cité des Fonctionnaires" },
          { name: "Zone portuaire" },
        ],
      },
      {
        code: "YE",
        name: "Yenne",
        department: "Rufisque",
        centerLat: 14.68,
        centerLng: -17.22,
        quartiers: [
          { name: "Yenne Guedj" },
          { name: "Yenne Kao" },
          { name: "Yenne Todde" },
          { name: "Toubab Dialaw" },
          { name: "Ndayane" },
          { name: "Niangal" },
        ],
      },
      {
        code: "SK",
        name: "Sébikotane",
        department: "Rufisque",
        centerLat: 14.67,
        centerLng: -17.2,
        quartiers: [
          { name: "Sébikotane" },
          { name: "Sébi Ponty" },
          { name: "Sébi Gare", type: "gare" },
          { name: "Kip" },
          { name: "Tangor" },
          { name: "Keur Yaba Diop" },
        ],
      },
    ],
  },
]

// =============================================================================
// Flat list — every commune across all departments (for easy lookup by code)
// =============================================================================
export const ALL_COMMUNES: CommuneSeed[] = DAKAR_REGION.flatMap(
  (department) => department.communes,
)

// =============================================================================
// Lookup helper — returns the commune matching the given 2-letter code
// =============================================================================
export function getCommuneByCode(code: string): CommuneSeed | undefined {
  const target = code.trim().toUpperCase()
  return ALL_COMMUNES.find((commune) => commune.code === target)
}
