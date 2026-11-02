// ============================================================
// FeedbackPro - Traductions de la page de scan client (D3)
// ------------------------------------------------------------
// Trois langues : français (fr), anglais (en), arabe (ar).
// L'arabe impose dir="rtl" au conteneur racine.
//
// Détection : navigator.language côté client (première visite), puis
// mémorisée dans localStorage (clé "fp_scan_lang"). L'utilisateur peut
// forcer une autre langue via le sélecteur en haut de la page de scan.
//
// Scope : chaînes principales affichées au client (titre, note, tags,
// commentaire, envoi, remerciement, NPS, photo). Les chaînes très
// secondaires (aria-labels annexes, liens légaux) restent en FR pour
// ne pas exploser le scope — la page reste parfaitement utilisable.
// ============================================================

export type LangueScan = "fr" | "en" | "ar"

export const LANGUES_SCAN: { id: LangueScan; label: string; flag: string }[] = [
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "ar", label: "العربية", flag: "🇸🇦" },
]

/** Interface explicite des traductions (évite l'inférence de littéraux
 *  incompatibles entre langues via `as const`). */
export interface TraductionsScan {
  dir: "ltr" | "rtl"
  charger: string
  quitter: string
  sousTitre: string
  ariaProgression: string
  // Étape 0 — Bienvenue (auto-transition 2 s)
  bienvenueChez: string
  bienvenueTap: string
  phraseRestauration: string
  phraseToilettes: string
  phraseBienEtre: string
  phraseAccueil: string
  phraseDefault: string
  // Étape 1 — note. La zone est insérée entre prefix et suffix pour
  // permettre de la styliser (span coloré) sans fonction JSX.
  questionNotePrefix: string
  questionNoteSuffix: string
  libellesNote: Record<number, string>
  ariaEtoiles: string
  donnerEtoiles: (n: number) => string
  retour: string
  // Étape 3 — NPS (affiché si note ≥ 4, dans la même étape que le commentaire)
  questionNps: string
  npsSousTitre: string
  npsIgnorer: string
  continuer: string
  // Étape 2 — tags
  titrePositif: string
  titreNegatif: string
  sousTitreTags: string
  ariaTagsPositifs: string
  ariaTagsNegatifs: string
  personnelLabel: string
  optionnel: string
  // v2 — section « Comportement de l'employé » (étape 2)
  // Affichée si le client saisit un nom d'employé OU si la note est ≤ 2★.
  // Contient les tags employés transversaux filtrés par secteur du Pro.
  employeTitre: string
  employeAide: string
  ariaTagsEmployes: string
  // Étape 3 — commentaire + envoi
  titreCommentaire: string
  commentairePositif: string
  commentaireNegatif: string
  recapTitre: string
  recapNote: string
  recapTags: string
  recapPersonnel: string
  recapAucun: string
  compteurChars: (n: number, max: number) => string
  emailLabel: string
  emailAide: string
  geoConsent: string
  politique: string
  // Photo (D2)
  photoLabel: string
  photoAide: string
  photoChoisir: string
  photoPrendre: string
  photoChanger: string
  photoRetirer: string
  photoEnCours: string
  photoTropGrande: string
  photoFormat: string
  // Boutons d'envoi
  envoyer: string
  envoyerWhatsapp: string
  envoyerTerminer: string
  envoyerSansWhatsapp: string
  envoiEnCours: string
  rassurancePositif: string
  rassuranceNegatif: string
  // Succès
  merci: string
  merciPositifCourt: string
  merciNegatifCourt: string
  merciPositif: (etab: string) => string
  merciNegatif: string
  fermer: string
  recompenseTitre: (r: string) => string
  recompenseBadgePrefix: string
  recompenseMontrez: string
  erreurQr: string
  erreurQrAide: string
  reessayer: string
  retourAccueil: string
  propulsePar: string
  // Google review (D8)
  avisGoogle: string
  avisGoogleAide: string
  // Task M3 — Mode offline : message affiché sur l'écran de succès quand
  // le retour a été stocké hors ligne (sans réseau) plutôt qu'envoyé.
  retourEnregistreHorsLigne: string
  // ---- Refonte QRTags (wizard à étapes plein écran bleu) ----
  // Indicateur d'étape : "ÉTAPE 1 SUR 4 — VOTRE NOTE"
  etapeSur: (n: number, total: number, sujet: string) => string
  sujetNote: string
  sujetDetails: string
  sujetCommentaire: string
  sujetEnvoi: string
  // Titres H1 (police système, font-weight 900, blanc sur fond bleu)
  titreNoteH1: string
  sousTitreNote: string
  titreTagsPositif: string
  titreTagsNegatif: string
  sousTitreTagsH1: string
  titreCommentaireH1: string
  sousTitreCommentaire: string
  titreEnvoiH1: string
  sousTitreEnvoi: string
  // Boutons plein largeur en bas
  suivant: string
  // Récapitulatif visuel (étape 4)
  recapVotreNote: string
  recapVotreCommentaire: string
  recapAucunCommentaire: string
  recapPhotoAjoutee: string
  recapPersonnelAjoute: string
  recapNps: string
  recapModifier: string
  // Étiquettes étoiles courtes (cards emoji étape 1)
  etoileLabel: (n: number) => string
}

export const TRADUCTIONS_SCAN: Record<LangueScan, TraductionsScan> = {
  fr: {
    dir: "ltr",
    charger: "Chargement de votre formulaire…",
    quitter: "Quitter et revenir en arrière",
    sousTitre: "Votre avis compte — 15 secondes chrono ⚡",
    ariaProgression: "Progression du questionnaire",
    // Étape 0 — Bienvenue
    bienvenueChez: "Bienvenue chez",
    bienvenueTap: "Touchez pour commencer 👆",
    phraseRestauration: "Comment s'est passée votre expérience culinaire ?",
    phraseToilettes: "L'entretien de cet espace est-il à la hauteur ?",
    phraseBienEtre: "L'entretien de cet espace est-il à la hauteur ?",
    phraseAccueil: "Comment s'est passé votre accueil ?",
    phraseDefault: "Comment évaluez-vous votre expérience ?",
    questionNotePrefix: "Comment évaluez-vous ",
    questionNoteSuffix: " ?",
    libellesNote: { 1: "Aïe, désolé…", 2: "Bof…", 3: "Moyen", 4: "Très bien !", 5: "Génial !" },
    ariaEtoiles: "Votre note de 1 à 5 étoiles",
    donnerEtoiles: (n) => `Donner ${n} étoile${n > 1 ? "s" : ""}`,
    retour: "Retour",
    questionNps: "Recommanderiez-vous cet établissement ?",
    npsSousTitre: "De 0 (pas du tout) à 10 (absolument)",
    npsIgnorer: "Ignorer",
    continuer: "Continuer",
    titrePositif: "🎉 Super ! Qu'avez-vous particulièrement apprécié ?",
    titreNegatif: "😔 Nous sommes désolés. Qu'est-ce qui n'a pas été ?",
    sousTitreTags: "Sélectionnez au moins un élément",
    ariaTagsPositifs: "Points positifs",
    ariaTagsNegatifs: "Points à améliorer",
    personnelLabel: "Personnel concerné ?",
    optionnel: "(optionnel)",
    employeTitre: "👤 Comportement de l'employé",
    employeAide: "Sélectionnez ce qui décrit le mieux son attitude (optionnel)",
    ariaTagsEmployes: "Comportement de l'employé",
    titreCommentaire: "💬 Un commentaire ? (optionnel)",
    commentairePositif: "Ce qui vous a marqué, ce qui a été bien…",
    commentaireNegatif: "Décrivez ce qui s'est passé — seul le gérant le lira.",
    recapTitre: "Votre retour",
    recapNote: "Note",
    recapTags: "Tags",
    recapPersonnel: "Personnel",
    recapAucun: "—",
    compteurChars: (n, max) => `${n} / ${max}`,
    emailLabel: "Votre email (optionnel, pour une réponse du gérant)",
    emailAide:
      "Laissez votre email si vous souhaitez que le gérant vous réponde. Sinon, votre retour restera anonyme.",
    geoConsent:
      "J'accepte que ma ville approximative (déduite de mon adresse IP, jamais stockée) soit enregistrée pour la lutte anti-fraude.",
    politique: "Politique de confidentialité",
    photoLabel: "Ajouter une photo (optionnel)",
    photoAide: "PNG, JPEG ou WebP — 5 Mo maximum. Redimensionnée automatiquement.",
    photoChoisir: "Choisir une image",
    photoPrendre: "Prendre une photo",
    photoChanger: "Changer la photo",
    photoRetirer: "Retirer la photo",
    photoEnCours: "Traitement…",
    photoTropGrande: "Photo trop volumineuse (5 Mo maximum)",
    photoFormat: "Format non supporté (PNG, JPEG, WebP ou GIF)",
    envoyer: "Envoyer",
    envoyerWhatsapp: "Envoyer via WhatsApp",
    envoyerTerminer: "Terminer",
    envoyerSansWhatsapp: "Terminer sans WhatsApp",
    envoiEnCours: "Envoi en cours…",
    rassurancePositif:
      "Votre compliment est transmis au gérant avec votre note et vos mots 🎉",
    rassuranceNegatif:
      "🔒 Votre retour reste privé : il est transmis uniquement au gérant.",
    merci: "🙏 Merci pour votre retour !",
    merciPositifCourt: "Votre soutien nous touche 💚",
    merciNegatifCourt: "Nous allons étudier votre retour",
    merciPositif: (etab) =>
      `Votre avis fait toute la différence pour toute l'équipe de ${etab}. Merci du fond du cœur ! 💚`,
    merciNegatif:
      "Votre retour a été transmis en privé au gérant, il a été alerté directement.",
    fermer: "Fermer",
    recompenseTitre: (r) => `🎁 Votre récompense : ${r}`,
    recompenseBadgePrefix: "🎁 Recevez",
    recompenseMontrez: "Montrez cet écran au personnel pour en profiter",
    erreurQr: "QR code inconnu ou expiré",
    erreurQrAide: "Vérifiez le QR code affiché chez le commerçant, puis réessayez.",
    reessayer: "Réessayer",
    retourAccueil: "Retour à l'accueil",
    propulsePar: "Propulsé par",
    avisGoogle: "Laissez un avis Google",
    avisGoogleAide: "Ça aide beaucoup l'établissement — merci !",
    retourEnregistreHorsLigne: "✓ Retour enregistré hors ligne — sera envoyé à la reconnexion",
    // ---- Refonte QRTags (wizard plein écran bleu) ----
    etapeSur: (n, total, sujet) => `ÉTAPE ${n} SUR ${total} — ${sujet}`,
    sujetNote: "VOTRE NOTE",
    sujetDetails: "DÉTAILS",
    sujetCommentaire: "COMMENTAIRE",
    sujetEnvoi: "ENVOI",
    titreNoteH1: "Comment évaluez-vous votre expérience ?",
    sousTitreNote: "Votre avis compte, en 15 secondes chrono.",
    titreTagsPositif: "🎉 Qu'avez-vous apprécié ?",
    titreTagsNegatif: "😔 Qu'est-ce qui n'a pas été ?",
    sousTitreTagsH1: "Sélectionnez tout ce qui correspond (au moins un).",
    titreCommentaireH1: "💬 Un commentaire ?",
    sousTitreCommentaire: "Optionnel — mais précieux pour le gérant.",
    titreEnvoiH1: "Prêt à envoyer ?",
    sousTitreEnvoi: "Vérifiez votre retour avant l'envoi.",
    suivant: "Suivant",
    recapVotreNote: "Votre note",
    recapVotreCommentaire: "Votre commentaire",
    recapAucunCommentaire: "Aucun commentaire",
    recapPhotoAjoutee: "Photo ajoutée",
    recapPersonnelAjoute: "Personnel concerné",
    recapNps: "Recommandation",
    recapModifier: "Modifier",
    etoileLabel: (n) => `${n} étoile${n > 1 ? "s" : ""}`,
  },
  en: {
    dir: "ltr",
    charger: "Loading your form…",
    quitter: "Quit and go back",
    sousTitre: "Your feedback matters — 15 seconds ⚡",
    ariaProgression: "Questionnaire progress",
    // Step 0 — Welcome
    bienvenueChez: "Welcome to",
    bienvenueTap: "Tap to start 👆",
    phraseRestauration: "How was your culinary experience?",
    phraseToilettes: "Was this space properly maintained?",
    phraseBienEtre: "Was this space properly maintained?",
    phraseAccueil: "How was your welcome?",
    phraseDefault: "How would you rate your experience?",
    questionNotePrefix: "How would you rate ",
    questionNoteSuffix: "?",
    libellesNote: { 1: "Ouch, sorry…", 2: "Meh…", 3: "Okay", 4: "Very good!", 5: "Awesome!" },
    ariaEtoiles: "Your rating from 1 to 5 stars",
    donnerEtoiles: (n) => `Give ${n} star${n > 1 ? "s" : ""}`,
    retour: "Back",
    questionNps: "Would you recommend this place?",
    npsSousTitre: "From 0 (not at all) to 10 (absolutely)",
    npsIgnorer: "Skip",
    continuer: "Continue",
    titrePositif: "🎉 Great! What did you enjoy most?",
    titreNegatif: "😔 We're sorry. What went wrong?",
    sousTitreTags: "Select at least one",
    ariaTagsPositifs: "Positive points",
    ariaTagsNegatifs: "Points to improve",
    personnelLabel: "Staff member involved?",
    optionnel: "(optional)",
    employeTitre: "👤 Staff behaviour",
    employeAide: "Pick what best describes their attitude (optional)",
    ariaTagsEmployes: "Staff behaviour",
    titreCommentaire: "💬 A comment? (optional)",
    commentairePositif: "What stood out, what was good…",
    commentaireNegatif: "Describe what happened — only the manager will read it.",
    recapTitre: "Your feedback",
    recapNote: "Rating",
    recapTags: "Tags",
    recapPersonnel: "Staff",
    recapAucun: "—",
    compteurChars: (n, max) => `${n} / ${max}`,
    emailLabel: "Your email (optional, for a manager reply)",
    emailAide:
      "Leave your email if you'd like the manager to reply. Otherwise your feedback stays anonymous.",
    geoConsent:
      "I agree that my approximate city (derived from my IP, never stored) be recorded for fraud prevention.",
    politique: "Privacy policy",
    photoLabel: "Add a photo (optional)",
    photoAide: "PNG, JPEG or WebP — 5 MB max. Auto-resized.",
    photoChoisir: "Choose an image",
    photoPrendre: "Take a photo",
    photoChanger: "Change photo",
    photoRetirer: "Remove photo",
    photoEnCours: "Processing…",
    photoTropGrande: "Photo too large (5 MB max)",
    photoFormat: "Unsupported format (PNG, JPEG, WebP or GIF)",
    envoyer: "Send",
    envoyerWhatsapp: "Send via WhatsApp",
    envoyerTerminer: "Done",
    envoyerSansWhatsapp: "Done without WhatsApp",
    envoiEnCours: "Sending…",
    rassurancePositif: "Your compliment was sent to the manager with your rating and words 🎉",
    rassuranceNegatif: "🔒 Your feedback stays private: only the manager sees it.",
    merci: "🙏 Thank you for your feedback!",
    merciPositifCourt: "Your support means a lot 💚",
    merciNegatifCourt: "We will review your feedback",
    merciPositif: (etab) =>
      `Your feedback means a lot to the whole team at ${etab}. Thank you from the bottom of our hearts! 💚`,
    merciNegatif: "Your feedback was sent privately to the manager — they've been alerted.",
    fermer: "Close",
    recompenseTitre: (r) => `🎁 Your reward: ${r}`,
    recompenseBadgePrefix: "🎁 Get",
    recompenseMontrez: "Show this screen to the staff to claim it",
    erreurQr: "Unknown or expired QR code",
    erreurQrAide: "Check the QR code displayed by the merchant, then try again.",
    reessayer: "Try again",
    retourAccueil: "Back to home",
    propulsePar: "Powered by",
    avisGoogle: "Leave a Google review",
    avisGoogleAide: "It really helps the business — thank you!",
    retourEnregistreHorsLigne: "✓ Feedback saved offline — will be sent when reconnected",
    // ---- QRTags redesign (full-screen blue wizard) ----
    etapeSur: (n, total, sujet) => `STEP ${n} OF ${total} — ${sujet}`,
    sujetNote: "YOUR RATING",
    sujetDetails: "DETAILS",
    sujetCommentaire: "COMMENT",
    sujetEnvoi: "SEND",
    titreNoteH1: "How would you rate your experience?",
    sousTitreNote: "Your feedback matters — 15 seconds flat.",
    titreTagsPositif: "🎉 What did you enjoy?",
    titreTagsNegatif: "😔 What didn't go well?",
    sousTitreTagsH1: "Select everything that applies (at least one).",
    titreCommentaireH1: "💬 A comment?",
    sousTitreCommentaire: "Optional — but valuable for the manager.",
    titreEnvoiH1: "Ready to send?",
    sousTitreEnvoi: "Review your feedback before sending.",
    suivant: "Next",
    recapVotreNote: "Your rating",
    recapVotreCommentaire: "Your comment",
    recapAucunCommentaire: "No comment",
    recapPhotoAjoutee: "Photo added",
    recapPersonnelAjoute: "Staff member",
    recapNps: "Recommendation",
    recapModifier: "Edit",
    etoileLabel: (n) => `${n} star${n > 1 ? "s" : ""}`,
  },
  ar: {
    dir: "rtl",
    charger: "جاري تحميل النموذج…",
    quitter: "الخروج والرجوع",
    sousTitre: "رأيك يهمنا — 15 ثانية فقط ⚡",
    ariaProgression: "تقدم الاستبيان",
    // المرحلة 0 — الترحيب
    bienvenueChez: "مرحباً بك في",
    bienvenueTap: "المس للبدء 👆",
    phraseRestauration: "كيف كانت تجربتك الطهي؟",
    phraseToilettes: "هل كان صيانة هذا المكان بمستوى لائق؟",
    phraseBienEtre: "هل كان صيانة هذا المكان بمستوى لائق؟",
    phraseAccueil: "كيف كان استقبالك؟",
    phraseDefault: "كيف تقيّم تجربتك؟",
    questionNotePrefix: "كيف تقيّم ",
    questionNoteSuffix: "؟",
    libellesNote: { 1: "آسف جداً…", 2: "ليس جيداً…", 3: "متوسط", 4: "جيد جداً!", 5: "رائع!" },
    ariaEtoiles: "تقييمك من 1 إلى 5 نجوم",
    donnerEtoiles: (n) => `إعطاء ${n} نج${n > 1 ? "وم" : "مة"}`,
    retour: "رجوع",
    questionNps: "هل تنصح بهذا المكان؟",
    npsSousTitre: "من 0 (إطلاقاً) إلى 10 (بالتأكيد)",
    npsIgnorer: "تخطي",
    continuer: "متابعة",
    titrePositif: "🎉 رائع! ما الذي أعجبك أكثر؟",
    titreNegatif: "😔 نعتذر. ما الذي لم يكن جيداً؟",
    sousTitreTags: "اختر عنصراً واحداً على الأقل",
    ariaTagsPositifs: "النقاط الإيجابية",
    ariaTagsNegatifs: "نقاط للتحسين",
    personnelLabel: "الموظف المعني؟",
    optionnel: "(اختياري)",
    employeTitre: "👤 سلوك الموظف",
    employeAide: "اختر ما يصف موقفه بشكل أفضل (اختياري)",
    ariaTagsEmployes: "سلوك الموظف",
    titreCommentaire: "💬 تعليق؟ (اختياري)",
    commentairePositif: "ما الذي لفت انتباهك، ما كان جيداً…",
    commentaireNegatif: "صف ما حدث — سيقرأه المدير فقط.",
    recapTitre: "رأيك",
    recapNote: "التقييم",
    recapTags: "العلامات",
    recapPersonnel: "الموظف",
    recapAucun: "—",
    compteurChars: (n, max) => `${n} / ${max}`,
    emailLabel: "بريدك الإلكتروني (اختياري، لرد المدير)",
    emailAide:
      "اترك بريدك الإلكتروني إذا كنت تريد أن يرد عليك المدير. وإلا سيبقى رأيك مجهولاً.",
    geoConsent:
      "أوافق على تسجيل مدينتي التقريبية (المستنتجة من عنوان IP الخاص بي، غير مخزنة) لمنع الاحتيال.",
    politique: "سياسة الخصوصية",
    photoLabel: "إضافة صورة (اختياري)",
    photoAide: "PNG أو JPEG أو WebP — 5 ميغا كحد أقصى. يتم تغيير الحجم تلقائياً.",
    photoChoisir: "اختر صورة",
    photoPrendre: "التقاط صورة",
    photoChanger: "تغيير الصورة",
    photoRetirer: "إزالة الصورة",
    photoEnCours: "جاري المعالجة…",
    photoTropGrande: "الصورة كبيرة جداً (5 ميغا كحد أقصى)",
    photoFormat: "صيغة غير مدعومة (PNG أو JPEG أو WebP أو GIF)",
    envoyer: "إرسال",
    envoyerWhatsapp: "إرسال عبر واتساب",
    envoyerTerminer: "إنهاء",
    envoyerSansWhatsapp: "إنهاء بدون واتساب",
    envoiEnCours: "جاري الإرسال…",
    rassurancePositif: "تم إرسال إطرائك إلى المدير مع تقييمك وكلماتك 🎉",
    rassuranceNegatif: "🔒 رأيك يبقى خاصاً: يراه المدير فقط.",
    merci: "🙏 شكراً على رأيك!",
    merciPositifCourt: "دعمك يعني لنا الكثير 💚",
    merciNegatifCourt: "سنقوم بدراسة رأيك",
    merciPositif: (etab) =>
      `رأيك يعني الكثير لفريق ${etab} بأكمله. شكراً من صميم القلب! 💚`,
    merciNegatif: "تم إرسال رأيك بشكل خاص إلى المدير — تم تنبيهه.",
    fermer: "إغلاق",
    recompenseTitre: (r) => `🎁 مكافأتك: ${r}`,
    recompenseBadgePrefix: "🎁 احصل على",
    recompenseMontrez: "اعرض هذه الشاشة على الموظف للحصول عليها",
    erreurQr: "رمز QR غير معروف أو منتهي الصلاحية",
    erreurQrAide: "تحقق من رمز QR المعروض لدى التاجر، ثم أعد المحاولة.",
    reessayer: "إعادة المحاولة",
    retourAccueil: "العودة إلى الرئيسية",
    propulsePar: "مدعوم من",
    avisGoogle: "اترك تقييم Google",
    avisGoogleAide: "هذا يساعد المنشأة كثيراً — شكراً!",
    retourEnregistreHorsLigne: "✓ تم حفظ رأيك دون اتصال — سيُرسل عند إعادة الاتصال",
    // ---- إعادة تصميم QRTags (معالج ملء الشاشة باللون الأزرق) ----
    etapeSur: (n, total, sujet) => `الخطوة ${n} من ${total} — ${sujet}`,
    sujetNote: "تقييمك",
    sujetDetails: "التفاصيل",
    sujetCommentaire: "تعليق",
    sujetEnvoi: "إرسال",
    titreNoteH1: "كيف تقيّم تجربتك؟",
    sousTitreNote: "رأيك يهمنا — 15 ثانية فقط.",
    titreTagsPositif: "🎉 ما الذي أعجبك؟",
    titreTagsNegatif: "😔 ما الذي لم يكن جيداً؟",
    sousTitreTagsH1: "اختر كل ما ينطبق (واحد على الأقل).",
    titreCommentaireH1: "💬 تعليق؟",
    sousTitreCommentaire: "اختياري — لكنه قيّم للمدير.",
    titreEnvoiH1: "جاهز للإرسال؟",
    sousTitreEnvoi: "راجع رأيك قبل الإرسال.",
    suivant: "التالي",
    recapVotreNote: "تقييمك",
    recapVotreCommentaire: "تعليقك",
    recapAucunCommentaire: "لا يوجد تعليق",
    recapPhotoAjoutee: "تمت إضافة صورة",
    recapPersonnelAjoute: "الموظف المعني",
    recapNps: "التوصية",
    recapModifier: "تعديل",
    etoileLabel: (n) => `${n} نج${n > 1 ? "وم" : "مة"}`,
  },
}

/**
 * Détecte la langue préférée du navigateur. Retourne "fr" par défaut si la
 * détection échoue ou si la langue détectée n'est pas supportée.
 */
export function detecterLangueNavigateur(): LangueScan {
  try {
    const lang = (navigator.language || "fr").toLowerCase()
    if (lang.startsWith("ar")) return "ar"
    if (lang.startsWith("en")) return "en"
    return "fr"
  } catch {
    return "fr"
  }
}

/** Clé localStorage de la langue mémorisée pour la page de scan */
export const CLE_LANGUE_SCAN = "fp_scan_lang"

/** Lit la langue mémorisée (localStorage), sinon null */
export function lireLangueMemorisee(): LangueScan | null {
  try {
    const v = localStorage.getItem(CLE_LANGUE_SCAN)
    if (v === "fr" || v === "en" || v === "ar") return v
    return null
  } catch {
    return null
  }
}

/** Mémorise la langue choisie (localStorage — best effort) */
export function memoriserLangue(lang: LangueScan): void {
  try {
    localStorage.setItem(CLE_LANGUE_SCAN, lang)
  } catch {
    /* silencieux : la détection navigateur suffira au prochain scan */
  }
}
