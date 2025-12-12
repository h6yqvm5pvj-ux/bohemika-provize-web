// Přehled schopností pojišťoven pro generování doporučení

export type PermanentProgress = "none" | "x4" | "x5" | "x10";
export type PermanentStart = "from0" | "from0001" | "from05" | "from10";
export type DailyStart = "from1" | "from22" | "from29";
export type DailyProgress = "none" | "with";
export type SickStart = "day15" | "day29" | "day57" | "day60";
export type SickVariant = "retroFrom1" | "nonRetro";

export type CapabilityEntry = {
  key:
    | "death"
    | "terminal"
    | "waiverInvalidity"
    | "waiverJobLoss"
    | "invalidity"
    | "criticalIllness"
    | "seriousIllness"
    | "diabetes"
    | "vaccination"
    | "deathAccident"
    | "permanentInjury"
    | "dailyAllowance"
    | "bodilyInjury"
    | "sickLeave"
    | "hospitalization"
    | "healthSocial"
    | "childOperation"
    | "childrenAccident"
    | "assistedReproduction"
    | "careDependence"
    | "fullCare"
    | "specialAid"
    | "travel"
    | "liability"
    | "employeeLiability";
  permanentInjury?: {
    progressions: PermanentProgress[];
    thresholds: PermanentStart[];
  };
  dailyAllowance?: {
    starts: DailyStart[];
    progressions: DailyProgress[];
  };
  sickLeave?: {
    options: {
      start: SickStart;
      allowRetroAccident: boolean;
      allowRetroIllness: boolean;
      allowNonRetroAccident: boolean;
      allowNonRetroIllness: boolean;
    }[];
  };
  hospitalization?: {
    accident: boolean;
    illness: boolean;
    progressive: boolean;
  };
  liabilityLimits?: number[];
};

export const PRODUCT_CAPABILITIES = {
  cppNeon: {
    name: "ČPP NEON Life / Risk",
    entries: <CapabilityEntry[]>[
      { key: "death" },
      { key: "terminal" },
      { key: "waiverInvalidity" },
      { key: "waiverJobLoss" },
      { key: "invalidity" },
      { key: "criticalIllness" },
      { key: "diabetes" },
      { key: "vaccination" },
      { key: "deathAccident" },
      {
        key: "permanentInjury",
        permanentInjury: {
          progressions: ["none", "x5", "x10"],
          thresholds: ["from0001", "from10"],
        },
      },
      {
        key: "dailyAllowance",
        dailyAllowance: {
          starts: ["from1", "from22"],
          progressions: ["none", "with"],
        },
      },
      { key: "bodilyInjury" },
      {
        key: "sickLeave",
        sickLeave: {
          options: [
            {
              start: "day15",
              allowRetroAccident: true,
              allowRetroIllness: true,
              allowNonRetroAccident: true,
              allowNonRetroIllness: true,
            },
            {
              start: "day29",
              allowRetroAccident: true,
              allowRetroIllness: true,
              allowNonRetroAccident: true,
              allowNonRetroIllness: true,
            },
            {
              start: "day60",
              allowRetroAccident: false,
              allowRetroIllness: false,
              allowNonRetroAccident: true,
              allowNonRetroIllness: true,
            },
          ],
        },
      },
      {
        key: "hospitalization",
        hospitalization: {
          accident: true,
          illness: true,
          progressive: true,
        },
      },
      { key: "childOperation" },
      { key: "childrenAccident" },
      { key: "assistedReproduction" },
      { key: "careDependence" },
      { key: "fullCare" },
      { key: "specialAid" },
      { key: "healthSocial" },
      { key: "travel" },
      { key: "liability", liabilityLimits: [5_000_000, 10_000_000, 15_000_000] },
      { key: "employeeLiability" },
    ],
  },

  kooperativaFlexi: {
    name: "KOOPERATIVA FLEXI",
    entries: <CapabilityEntry[]>[
      { key: "death" },
      { key: "invalidity" },
      { key: "seriousIllness" },
      { key: "criticalIllness" },
      { key: "deathAccident" },
      {
        key: "permanentInjury",
        permanentInjury: {
          progressions: ["none", "x4", "x10"],
          thresholds: ["from0", "from10"],
        },
      },
      { key: "bodilyInjury" },
      {
        key: "dailyAllowance",
        dailyAllowance: {
          starts: ["from1", "from29"],
          progressions: ["none"],
        },
      },
      {
        key: "sickLeave",
        sickLeave: {
          options: [
            {
              start: "day15",
              allowRetroAccident: true,
              allowRetroIllness: false,
              allowNonRetroAccident: true,
              allowNonRetroIllness: true,
            },
            {
              start: "day29",
              allowRetroAccident: true,
              allowRetroIllness: true,
              allowNonRetroAccident: true,
              allowNonRetroIllness: true,
            },
            {
              start: "day57",
              allowRetroAccident: true,
              allowRetroIllness: true,
              allowNonRetroAccident: true,
              allowNonRetroIllness: true,
            },
          ],
        },
      },
      {
        key: "hospitalization",
        hospitalization: {
          accident: true,
          illness: true,
          progressive: false,
        },
      },
      { key: "healthSocial" },
      { key: "fullCare" },
      { key: "travel" },
      {
        key: "liability",
        liabilityLimits: [
          2_000_000,
          5_000_000,
          10_000_000,
          15_000_000,
          20_000_000,
          30_000_000,
          40_000_000,
          50_000_000,
        ],
      },
    ],
  },
} as const;

export type ProductKey = keyof typeof PRODUCT_CAPABILITIES;
