// Lists used by forms (kept separate from the seed data so pages load faster).

/** Assessment objectives, for tracking English scores by AO. */
export const ASSESSMENT_OBJECTIVES: Record<"english_lit" | "english_lang", { code: string; label: string }[]> = {
  english_lit: [
    { code: "AO1", label: "Knowledge of the text & personal response" },
    { code: "AO2", label: "Language, form & structure" },
    { code: "AO3", label: "Links & comparisons between texts" },
    { code: "AO4", label: "Context" },
  ],
  english_lang: [
    { code: "AO1", label: "Read & understand, select & interpret" },
    { code: "AO2", label: "Analyse language & structure" },
    { code: "AO3", label: "Compare ideas & perspectives" },
    { code: "AO4", label: "Write for purpose, audience & form" },
    { code: "AO5", label: "Vocabulary, sentences & SPaG" },
  ],
};

export const ERROR_TYPES = [
  "Didn't answer the question asked",
  "Wrong rule or method chosen",
  "Arithmetic slip",
  "Misread the question or data",
  "Forgot a key fact or formula",
  "Units or rounding",
  "Not enough explanation or detail",
  "Didn't show working",
  "Misunderstood the command word",
  "Missing key terms",
  "Weak structure",
  "Not enough evidence or quotes",
  "Spelling, punctuation & grammar",
  "Ran out of time",
];
