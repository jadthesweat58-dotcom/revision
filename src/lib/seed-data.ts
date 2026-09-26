// Starting data: subjects, topics from each specification, rough grade
// boundaries and exam dates. Everything here can be edited inside the app.
//
// Topic "weight" = roughly how many exam marks the topic is worth. It only
// matters relative to other topics in the same subject.
//
// Grade boundaries are ESTIMATES based on recent Pearson Edexcel series.
// Replace them with the latest official numbers on each subject's page.

import type { AssessmentKind, SubjectKind } from "./types";

export interface SeedTopic {
  name: string;
  group: string;
  paper: string;
  weight: number;
  setText?: boolean;
}

export interface SeedSubject {
  slug: string;
  name: string;
  board: string;
  specCode: string;
  kind: SubjectKind;
  targetGrade: number;
  stretchGrade?: number;
  boundaryMax: number;
  boundaries: Record<string, number>;
  topics: SeedTopic[];
  assessments: { kind: AssessmentKind; title: string; date: string; tbc: boolean }[];
}

/** Splits `marks` evenly across a list of topic names in the same group. */
function group(groupName: string, paper: string, marks: number, names: string[], setText = false): SeedTopic[] {
  return names.map((name) => ({ name, group: groupName, paper, weight: marks / names.length, setText }));
}

// Year 10: Maths GCSE is a year early (finals summer 2027).
// Everything else has Year 10 mocks in summer 2027 and finals in summer 2028.
const Y10_MOCKS = { kind: "mock" as const, title: "Year 10 mocks", date: "2027-06-01", tbc: true };
const FINALS_2028 = { kind: "final" as const, title: "Final exams start", date: "2028-05-15", tbc: true };

const SCIENCE_BOUNDARIES = { "9": 150, "8": 133, "7": 116, "6": 99, "5": 82, "4": 65, "3": 56 };

export const SEED_SUBJECTS: SeedSubject[] = [
  {
    slug: "maths",
    name: "Maths",
    board: "Edexcel GCSE (Higher)",
    specCode: "1MA1",
    kind: "standard",
    targetGrade: 9,
    boundaryMax: 240,
    boundaries: { "9": 210, "8": 176, "7": 143, "6": 113, "5": 83, "4": 53, "3": 38 },
    assessments: [
      { kind: "mock", title: "Maths mocks", date: "2026-10-12", tbc: true },
      { kind: "final", title: "Maths GCSE Paper 1", date: "2027-05-20", tbc: true },
    ],
    topics: [
      ...group("Number", "All papers", 15, [
        "Calculations, order of operations & negatives",
        "Factors, multiples, primes, HCF & LCM",
        "Powers, roots & index laws",
        "Fractions, decimals & recurring decimals",
        "Standard form",
        "Surds",
        "Rounding, estimation, bounds & error intervals",
        "Counting strategies (product rule)",
      ]),
      ...group("Algebra", "All papers", 30, [
        "Expanding & factorising expressions",
        "Algebraic fractions",
        "Formulae & rearranging",
        "Linear equations & inequalities",
        "Simultaneous equations (incl. non-linear)",
        "Quadratics: factorising, formula & completing the square",
        "Quadratic inequalities",
        "Sequences (arithmetic, geometric, quadratic nth term)",
        "Straight-line graphs",
        "Quadratic, cubic, reciprocal & exponential graphs",
        "Graph transformations & trig graphs",
        "Functions: composite & inverse",
        "Algebraic proof",
        "Iteration",
        "Gradients & areas under graphs",
        "Equation of a circle & tangents",
      ]),
      ...group("Ratio, proportion & rates of change", "All papers", 20, [
        "Ratio & sharing",
        "Percentages, percentage change & reverse percentages",
        "Compound interest, growth & decay",
        "Direct & inverse proportion",
        "Compound measures: speed, density, pressure",
        "Unit conversions, scale & best buys",
      ]),
      ...group("Geometry & measures", "All papers", 20, [
        "Angles, polygons & parallel lines",
        "Area & perimeter (incl. arcs & sectors)",
        "Volume & surface area (prisms, cones, spheres, pyramids)",
        "Pythagoras & SOHCAHTOA",
        "Exact trig values",
        "Sine rule, cosine rule & ½ab sin C",
        "3D Pythagoras & trigonometry",
        "Transformations",
        "Congruence & similarity (incl. area & volume scale factors)",
        "Constructions, loci & bearings",
        "Circle theorems",
        "Vectors (incl. vector proof)",
      ]),
      ...group("Probability & statistics", "All papers", 15, [
        "Probability basics, relative frequency & expected outcomes",
        "Tree diagrams & conditional probability",
        "Venn diagrams & set notation",
        "Averages, range & frequency tables",
        "Cumulative frequency & box plots",
        "Histograms",
        "Sampling, scatter graphs & correlation",
      ]),
    ],
  },
  {
    slug: "biology",
    name: "Biology",
    board: "Edexcel GCSE (Higher)",
    specCode: "1BI0",
    kind: "standard",
    targetGrade: 9,
    boundaryMax: 200,
    boundaries: SCIENCE_BOUNDARIES,
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      ...group("1 Key concepts in biology", "Papers 1 & 2", 20, [
        "Cells: eukaryotic, prokaryotic & specialised cells",
        "Microscopy & magnification",
        "Enzymes (incl. pH core practical)",
        "Diffusion, osmosis & active transport",
        "Food tests & calorimetry",
      ]),
      ...group("2 Cells and control", "Paper 1", 22, [
        "Mitosis, the cell cycle & cancer",
        "Growth, differentiation & stem cells",
        "Nervous system, neurones & reflexes",
        "The brain, the eye & eye defects",
      ]),
      ...group("3 Genetics", "Paper 1", 20, [
        "Meiosis, sexual & asexual reproduction",
        "DNA structure & protein synthesis",
        "Genetic crosses, inheritance & sex determination",
        "Variation, mutation & the Human Genome Project",
      ]),
      ...group("4 Natural selection and genetic modification", "Paper 1", 18, [
        "Evolution, natural selection & evidence",
        "Classification & human evolution",
        "Selective breeding, genetic engineering & tissue culture",
        "GM crops, food security & biological control",
      ]),
      ...group("5 Health, disease and the development of medicines", "Paper 1", 30, [
        "Communicable diseases & pathogens",
        "Plant diseases & plant defences",
        "Immune system, vaccination & monoclonal antibodies",
        "Antibiotics, drug development & aseptic technique",
        "Non-communicable diseases, BMI & heart disease",
      ]),
      ...group("6 Plant structures and their functions", "Paper 2", 22, [
        "Photosynthesis & limiting factors",
        "Transport in plants & transpiration",
        "Plant hormones & plant adaptations",
      ]),
      ...group("7 Animal coordination, control and homeostasis", "Paper 2", 24, [
        "Hormones, adrenaline & thyroxine",
        "Menstrual cycle, contraception & fertility treatment",
        "Homeostasis: temperature, blood glucose & diabetes",
        "Osmoregulation & the kidney",
      ]),
      ...group("8 Exchange and transport in animals", "Paper 2", 22, [
        "Exchange surfaces & the lungs",
        "Blood, blood vessels & the heart",
        "Aerobic & anaerobic respiration",
      ]),
      ...group("9 Ecosystems and material cycles", "Paper 2", 22, [
        "Ecosystems, interdependence & quadrats",
        "Energy transfer & pyramids of biomass",
        "Biodiversity, human impact & conservation",
        "Carbon, water & nitrogen cycles; decomposition",
      ]),
    ],
  },
  {
    slug: "chemistry",
    name: "Chemistry",
    board: "Edexcel GCSE (Higher)",
    specCode: "1CH0",
    kind: "standard",
    targetGrade: 9,
    boundaryMax: 200,
    boundaries: SCIENCE_BOUNDARIES,
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      ...group("1 Key concepts in chemistry", "Papers 1 & 2", 40, [
        "Atomic structure, isotopes & relative atomic mass",
        "The periodic table",
        "Ionic bonding",
        "Covalent, metallic bonding & giant structures",
        "Formulae, equations & balancing",
        "Moles, masses & empirical formulae",
      ]),
      ...group("2 States of matter and mixtures", "Paper 1", 14, [
        "States of matter",
        "Separating & purifying mixtures (incl. chromatography)",
        "Making water safe to drink",
      ]),
      ...group("3 Chemical changes", "Paper 1", 22, [
        "Acids, alkalis, pH & neutralisation",
        "Making soluble & insoluble salts",
        "Electrolysis",
      ]),
      ...group("4 Extracting metals and equilibria", "Paper 1", 18, [
        "Reactivity series & displacement",
        "Extracting metals, life cycle assessment & recycling",
        "Reversible reactions & dynamic equilibrium",
      ]),
      ...group("5 Separate chemistry 1", "Paper 1", 26, [
        "Transition metals, alloys & corrosion",
        "Yield, atom economy, molar gas volume & titrations",
        "Haber process, equilibria & fertilisers",
        "Chemical cells & fuel cells",
      ]),
      ...group("6 Groups in the periodic table", "Paper 2", 16, [
        "Group 1: alkali metals",
        "Group 7: halogens",
        "Group 0: noble gases",
      ]),
      ...group("7 Rates of reaction and energy changes", "Paper 2", 22, [
        "Rates of reaction & collision theory",
        "Catalysts",
        "Energy changes & bond energies",
      ]),
      ...group("8 Fuels and Earth science", "Paper 2", 18, [
        "Crude oil, hydrocarbons & fractional distillation",
        "Combustion, pollutants & cracking",
        "The atmosphere & climate change",
      ]),
      ...group("9 Separate chemistry 2", "Paper 2", 24, [
        "Tests for ions & flame tests",
        "Alkanes & alkenes",
        "Addition & condensation polymers",
        "Alcohols & carboxylic acids",
        "Bulk & surface properties, nanoparticles",
      ]),
    ],
  },
  {
    slug: "physics",
    name: "Physics",
    board: "Edexcel GCSE (Higher)",
    specCode: "1PH0",
    kind: "standard",
    targetGrade: 9,
    boundaryMax: 200,
    boundaries: SCIENCE_BOUNDARIES,
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      ...group("1 Key concepts of physics", "Papers 1 & 2", 8, ["Units, prefixes & scalars vs vectors"]),
      ...group("2 Motion and forces", "Paper 1", 24, [
        "Speed, velocity, acceleration & motion graphs",
        "Newton's laws & resultant forces",
        "Momentum",
        "Stopping distances",
      ]),
      ...group("3 Conservation of energy", "Paper 1", 12, [
        "Energy stores, transfers & efficiency",
        "Energy resources",
      ]),
      ...group("4 Waves", "Paper 1", 14, [
        "Wave properties & the wave equation",
        "Reflection, refraction, sound & seismic waves",
      ]),
      ...group("5 Light and the electromagnetic spectrum", "Paper 1", 16, [
        "The electromagnetic spectrum: uses & dangers",
        "Lenses, ray diagrams & colour",
        "Radiation, absorption & black body radiation",
      ]),
      ...group("6 Radioactivity", "Paper 1", 18, [
        "Atoms, isotopes & types of nuclear radiation",
        "Half-life & radioactive decay",
        "Uses & dangers of radiation",
        "Fission & fusion",
      ]),
      ...group("7 Astronomy", "Paper 1", 12, [
        "The Solar System, orbits & life cycle of stars",
        "Red-shift, the Big Bang & Steady State",
      ]),
      ...group("8 Energy – forces doing work", "Paper 2", 8, ["Work done, power & energy transfers"]),
      ...group("9 Forces and their effects", "Paper 2", 10, ["Vector diagrams, moments, levers & gears"]),
      ...group("10 Electricity and circuits", "Paper 2", 22, [
        "Current, charge, potential difference & resistance",
        "Series & parallel circuits, I–V graphs",
        "Electrical power, mains electricity & safety",
      ]),
      ...group("11 Static electricity", "Paper 2", 8, ["Static charge & electric fields"]),
      ...group("12 Magnetism and the motor effect", "Paper 2", 12, [
        "Magnets, magnetic fields & electromagnets",
        "The motor effect & F = BIL",
      ]),
      ...group("13 Electromagnetic induction", "Paper 2", 12, [
        "Generators, microphones & loudspeakers",
        "Transformers & the National Grid",
      ]),
      ...group("14 Particle model", "Paper 2", 14, [
        "Density & changes of state",
        "Specific heat capacity & specific latent heat",
        "Gas pressure & temperature",
      ]),
      ...group("15 Forces and matter", "Paper 2", 10, [
        "Elasticity, springs & Hooke's law",
        "Pressure in fluids & upthrust",
      ]),
    ],
  },
  {
    slug: "business",
    name: "Business",
    board: "Edexcel GCSE",
    specCode: "1BS0",
    kind: "standard",
    targetGrade: 9,
    boundaryMax: 180,
    boundaries: { "9": 137, "8": 124, "7": 111, "6": 97, "5": 83, "4": 69, "3": 53, "2": 37, "1": 21 },
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      ...group("Theme 1: Investigating small business", "Paper 1", 90, [
        "1.1.1 The dynamic nature of business",
        "1.1.2 Risk and reward",
        "1.1.3 The role of business enterprise",
        "1.2.1 Customer needs",
        "1.2.2 Market research",
        "1.2.3 Market mapping",
        "1.2.4 Competition",
        "1.3.1 Business aims and objectives",
        "1.3.2 Revenue, costs and profits",
        "1.3.3 Cash and cash flow",
        "1.3.4 Sources of business finance",
        "1.4.1 Options for start-up and small businesses",
        "1.4.2 Business location",
        "1.4.3 The marketing mix",
        "1.4.4 Business plans",
        "1.5.1 Business stakeholders",
        "1.5.2 Technology and business",
        "1.5.3 Legislation and business",
        "1.5.4 The economy and business",
        "1.5.5 External influences",
      ]),
      ...group("Theme 2: Building a business", "Paper 2", 90, [
        "2.1.1 Business growth",
        "2.1.2 Changes in business aims and objectives",
        "2.1.3 Business and globalisation",
        "2.1.4 Ethics, the environment and business",
        "2.2.1 Product",
        "2.2.2 Price",
        "2.2.3 Promotion",
        "2.2.4 Place",
        "2.2.5 Using the marketing mix to make decisions",
        "2.3.1 Business operations",
        "2.3.2 Working with suppliers",
        "2.3.3 Managing quality",
        "2.3.4 The sales process",
        "2.4.1 Business calculations",
        "2.4.2 Understanding business performance",
        "2.5.1 Organisational structures",
        "2.5.2 Effective recruitment",
        "2.5.3 Effective training and development",
        "2.5.4 Motivation",
      ]),
    ],
  },
  {
    slug: "economics",
    name: "Economics",
    board: "Edexcel iGCSE",
    specCode: "4EC1",
    kind: "standard",
    targetGrade: 8,
    stretchGrade: 9,
    boundaryMax: 160,
    boundaries: { "9": 118, "8": 106, "7": 94, "6": 82, "5": 70, "4": 58, "3": 44, "2": 31, "1": 18 },
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      ...group("1 The market system", "Paper 1", 44, [
        "The economic problem, opportunity cost & PPCs",
        "Economic systems & allocation of resources",
        "Demand, supply & market equilibrium",
        "Price, income & supply elasticity",
        "Market failure: externalities, public & merit goods",
        "Government intervention in markets",
      ]),
      ...group("2 Business economics", "Paper 1", 36, [
        "Production, productivity & division of labour",
        "Costs, revenue & profit",
        "Economies & diseconomies of scale",
        "Competitive & concentrated markets",
        "The labour market & wages",
      ]),
      ...group("3 Government and the economy", "Paper 2", 50, [
        "Macroeconomic objectives & conflicts between them",
        "Economic growth & GDP",
        "Inflation: causes, measurement & effects",
        "Unemployment: types, causes & effects",
        "Fiscal policy & taxation",
        "Monetary policy & interest rates",
        "Supply-side policies",
      ]),
      ...group("4 The global economy", "Paper 2", 30, [
        "Globalisation & multinational companies",
        "International trade, specialisation & protectionism",
        "Balance of payments",
        "Exchange rates",
      ]),
    ],
  },
  {
    slug: "geography",
    name: "Geography",
    board: "Edexcel iGCSE",
    specCode: "4GE1",
    kind: "standard",
    targetGrade: 9,
    boundaryMax: 175,
    boundaries: { "9": 128, "8": 116, "7": 104, "6": 92, "5": 80, "4": 68, "3": 53, "2": 38, "1": 23 },
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      ...group("Paper 1 – Physical options (you study 2)", "Paper 1", 75, [
        "Rivers: processes & landforms",
        "Rivers: flooding, water supply & management",
        "Coasts: processes & landforms",
        "Coasts: ecosystems, threats & management",
        "Hazards: earthquakes & volcanoes",
        "Hazards: tropical cyclones & hazard management",
      ]),
      ...group("Paper 1 – Fieldwork", "Paper 1", 20, ["Physical fieldwork & enquiry skills"]),
      ...group("Paper 2 – Human options (you study 2)", "Paper 2", 75, [
        "Economic activity: sectors & employment change",
        "Economic activity: energy resources & management",
        "Rural: ecosystems, farming & land use",
        "Rural: change, challenges & management",
        "Urban: urbanisation & urban growth",
        "Urban: challenges & sustainable cities",
      ]),
      ...group("Paper 2 – Fieldwork", "Paper 2", 20, ["Human fieldwork & enquiry skills"]),
      ...group("Paper 2 – Global issue (you study 1)", "Paper 2", 105, [
        "Fragile environments & climate change",
        "Globalisation & migration",
        "Development & human welfare",
      ]),
    ],
  },
  {
    slug: "english-literature",
    name: "English Literature",
    board: "Edexcel iGCSE",
    specCode: "4ET1",
    kind: "english_lit",
    targetGrade: 9,
    boundaryMax: 150,
    boundaries: { "9": 118, "8": 106, "7": 94, "6": 82, "5": 70, "4": 58, "3": 44, "2": 30, "1": 16 },
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      { name: "Unseen poetry", group: "Paper 1: Poetry and Modern Prose", paper: "Paper 1", weight: 20 },
      { name: "Anthology poetry", group: "Paper 1: Poetry and Modern Prose", paper: "Paper 1", weight: 30, setText: true },
      { name: "Modern prose (add your novel)", group: "Paper 1: Poetry and Modern Prose", paper: "Paper 1", weight: 40, setText: true },
      { name: "Modern drama (add your play)", group: "Paper 2: Modern Drama and Literary Heritage", paper: "Paper 2", weight: 30, setText: true },
      { name: "Literary heritage (add your text)", group: "Paper 2: Modern Drama and Literary Heritage", paper: "Paper 2", weight: 30, setText: true },
    ],
  },
  {
    slug: "english-language",
    name: "English Language",
    board: "Edexcel iGCSE (Spec A)",
    specCode: "4EA1",
    kind: "english_lang",
    targetGrade: 9,
    boundaryMax: 150,
    boundaries: { "9": 114, "8": 102, "7": 90, "6": 79, "5": 68, "4": 57, "3": 43, "2": 29, "1": 15 },
    assessments: [Y10_MOCKS, FINALS_2028],
    topics: [
      { name: "Short answers on the unseen text", group: "Paper 1: Non-fiction and Transactional Writing", paper: "Paper 1", weight: 11 },
      { name: "Language & structure analysis", group: "Paper 1: Non-fiction and Transactional Writing", paper: "Paper 1", weight: 12 },
      { name: "Comparing two texts", group: "Paper 1: Non-fiction and Transactional Writing", paper: "Paper 1", weight: 22 },
      { name: "Transactional writing (article, letter, speech…)", group: "Paper 1: Non-fiction and Transactional Writing", paper: "Paper 1", weight: 45 },
      { name: "Anthology poetry & prose analysis", group: "Paper 2: Poetry and Prose Texts and Imaginative Writing", paper: "Paper 2", weight: 30 },
      { name: "Imaginative writing", group: "Paper 2: Poetry and Prose Texts and Imaginative Writing", paper: "Paper 2", weight: 30 },
    ],
  },
];
