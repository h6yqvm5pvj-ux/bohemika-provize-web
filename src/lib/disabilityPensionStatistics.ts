/** ČSSZ: average standalone disability pensions, as of 31 December 2024.
 * Shared by the public life-insurance card and the coverage-planning tool.
 * These historical averages are reference data, not individual entitlements.
 */
export const DISABILITY_PENSION_STATISTICS = {
  asOf: "2024-12-31",
  sourceUrl: "https://www.cssz.cz/documents/20143/2878360/odpoved_106_statistika%2Bduchodu_web.pdf/a9c0a411-ae79-bd96-a31b-e3b3cff4243d?version=1.0",
  degrees: [
    { degree: 1, averageMonthly: 9906 },
    { degree: 2, averageMonthly: 11704 },
    { degree: 3, averageMonthly: 17325 },
  ],
} as const;
