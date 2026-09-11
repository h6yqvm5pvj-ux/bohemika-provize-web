import type { InsurerTone } from "./comparisonData";

export const AUDIT_DATE = "11. 9. 2026";
// The user reports insurer confirmation; do not attribute that confirmation to
// the public PDF or extend its stated scope from a rental car to a sea charter.
export const CPP_RENTAL_CAR_CONFIRMATION = {
  label: "Auto z půjčovny potvrzeno ČPP",
  detail: "Zahrnutí auta z profesionální půjčovny do krytí zapůjčených věcí potvrdila ČPP podle informace správce srovnání.",
  reportedAt: "11. 9. 2026",
} as const;
export type ComparisonSource = {
  insurer: InsurerTone;
  match: string;
  label: string;
  url: string;
  note?: string;
};

// Each link belongs to the insurer whose cell cites it. Version conflicts are
// explicit; the public Covid PDF must never be presented as the stored 1/23.
export const COMPARISON_SOURCES: readonly ComparisonSource[] = [
  {
    "insurer": "cpp",
    "match": "VPPCP",
    "label": "VPPCP 1/18",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/vppcp_1_18.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPCOV",
    "label": "Veřejné PDF: DPPCOV 1/21",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v7_p14_dppcov-1_23.pdf",
    "note": "Veřejný soubor je verze 1/21, přestože odkaz ČPP uvádí 1/23. Limity na stránce vycházejí z uložené verze 1/23."
  },
  {
    "insurer": "cpp",
    "match": "DPPAP",
    "label": "DPPAP 1/18",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/dppap_1_18.pdf",
    "note": "Veřejná verze je účinná od 1. 9. 2018; uložená od 1. 5. 2018. Zkontrolované znění služeb a limitů je shodné."
  },
  {
    "insurer": "cpp",
    "match": "DPPCP",
    "label": "DPPCP 1/22",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v5_p6_dppcp-1_22.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPGP",
    "label": "DPPGP 1/22",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v5_p10_dppgp-1_22.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPGUP",
    "label": "DPPGUP 1/20",
    "note": "Veřejná verze je účinná od 1. 11. 2020; uložená od 1. 6. 2020. Rozsah a limity se shodují.",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/dppgup-1_20_myriad.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPLETP",
    "label": "DPPLETP 1/18",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/dppletp_1_18.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPLP",
    "label": "DPPLP 1/23",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v7_p8_dpplp-1_23.docx.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPLV",
    "label": "DPPLV 1/23",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v7_p1_dpplv-1_23.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPODC",
    "label": "DPPODC 1/18",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/dppodc_1_18.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPSTP",
    "label": "DPPSTP 1/23",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v7_p5_dppstp-1_23.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPZAV",
    "label": "DPPZAV 1/22",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v5_p4_dppzav-1_22.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPURC",
    "label": "DPPURC 1/23",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v7_p3_dppurc-1_23.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPZP",
    "label": "DPPZP 1/23",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/pp12020utp_nzp_v7_p9_dppzp-1_23.pdf"
  },
  {
    "insurer": "cpp",
    "match": "DPPZVP",
    "label": "DPPZVP 1/18",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/dppzvp_1_18.pdf",
    "note": "Veřejná verze od 1. 9. 2018 se liší od uložené verze od 1. 5. 2018 v krytí závodů zvířat. Uvedené limity, druhy zvířat a spoluúčast se shodují."
  },
  {
    "insurer": "cpp",
    "match": "IPID",
    "label": "IPID",
    "url": "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/ipid/pp12020utp_nzp_v7_p26_idd_nezivot_cp2_1_23.pdf"
  },
  {
    "insurer": "koop",
    "match": "M-750/23",
    "label": "KOLUMBUS M-750/23 · 11/2025",
    "url": "https://www.koop.cz/cestovni-pojisteni/attachments/koop-cestovni-pojisteni-kolumbus-012-11-2025.pdf"
  },
  {
    "insurer": "axa",
    "match": "VPPCP",
    "label": "AXA VPPCP · 15. 6. 2026",
    "url": "https://www.axa-assistance.cz/documents-to-download/Pojistne-podminky/Vseobecne-pojistne-podminky-cp?disposition=inline"
  }
];

export function sourceReferences(insurer: InsurerTone, citation = ""): ComparisonSource[] {
  const references = COMPARISON_SOURCES.filter(source => source.insurer === insurer);
  if (insurer !== "cpp") return references;
  return references.filter(source => citation.includes(source.match));
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");
}
