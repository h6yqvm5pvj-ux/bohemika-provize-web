export type IntranetSectionKey =
  | "zivot"
  | "majetek"
  | "auto"
  | "odpovednost"
  | "cizinci"
  | "cestovko"
  | "investice"
  | "zlato"
  | "obecne"
  | "pomoc";

export type IntranetSectionOption = {
  key: IntranetSectionKey;
  label: string;
};

export const INTRANET_SECTIONS: readonly IntranetSectionOption[] = [
  { key: "zivot", label: "Život" },
  { key: "majetek", label: "Majetek" },
  { key: "auto", label: "Auto" },
  { key: "odpovednost", label: "Odpovědnost" },
  { key: "cizinci", label: "Cizinci" },
  { key: "cestovko", label: "Cestovko" },
  { key: "investice", label: "Investice" },
  { key: "zlato", label: "Zlato" },
  { key: "obecne", label: "Obecné" },
  { key: "pomoc", label: "Pomoc" },
] as const;

export const INTRANET_SECTION_KEYS = new Set<IntranetSectionKey>(
  INTRANET_SECTIONS.map((item) => item.key)
);

export const INTRANET_SECTION_LABEL_BY_KEY = new Map<IntranetSectionKey, string>(
  INTRANET_SECTIONS.map((item) => [item.key, item.label])
);
