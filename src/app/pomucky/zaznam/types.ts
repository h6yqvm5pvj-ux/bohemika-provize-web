// src/app/pomucky/zaznam/types.ts

export type RecordInsuranceType =
  | "life"
  | "car"
  | "property"
  | "liability"
  | "travel";

export interface RecordInsuranceTypeConfig {
  id: RecordInsuranceType;
  shortTitle: string;
  title: string;
  subtitle: string;
}

export const RECORD_INSURANCE_TYPES: RecordInsuranceTypeConfig[] = [
  {
    id: "life",
    shortTitle: "Život",
    title: "Životní pojištění",
    subtitle: "Smrt, invalidita, PN…",
  },
  {
    id: "car",
    shortTitle: "Vozidla",
    title: "Pojištění vozidel",
    subtitle: "Povinné ručení, havarijní.",
  },
  {
    id: "property",
    shortTitle: "Majetek",
    title: "Majetek občanů",
    subtitle: "Byt, dům, domácnost.",
  },
  {
    id: "liability",
    shortTitle: "Odpovědnost",
    title: "Odpovědnost občanů",
    subtitle: "Občanská i zaměstnanecká.",
  },
  {
    id: "travel",
    shortTitle: "Cestovní",
    title: "Cestovní pojištění",
    subtitle: "Cesty do zahraničí, storno.",
  },
];