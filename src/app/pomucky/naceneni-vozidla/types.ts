export type Condition = "excellent" | "good" | "average" | "worse";
export type ServiceHistory = "full" | "partial" | "unknown" | "none";
export type Origin = "cz" | "eu" | "import" | "unknown";
export type Equipment = "basic" | "standard" | "high" | "top";
export type Damage = "none" | "cosmetic" | "repaired" | "unresolved";
export type Usage = "private" | "company" | "taxi" | "unknown";

export type SautoMatchTone = "good" | "ok" | "warn" | "bad";

export type SautoMarketListing = {
  id: string;
  title: string;
  priceCzk: number;
  mileageKm: number | null;
  year: number | null;
  fuel: string;
  location: string;
  seller: string;
  url: string;
  imageUrl: string;
  match?: {
    score: number;
    label: string;
    tone: SautoMatchTone;
    reasons: string[];
  };
};

export type SautoMarketStats = {
  count: number;
  min: number | null;
  max: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  average: number | null;
  trimmedAverage: number | null;
  recommended: number | null;
};

export type SautoMarketResponse = {
  ok: true;
  source: "sauto";
  keyword: string;
  limit: number;
  rawCount: number;
  count: number;
  comparableCount: number;
  stats: SautoMarketStats;
  listings: SautoMarketListing[];
};
