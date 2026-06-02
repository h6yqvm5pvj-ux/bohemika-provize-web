// src/app/pomucky/vypoved-smlouvy/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HeartPulse,
  Loader2,
  Printer,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";

type InsuranceType = "life" | "nonLife";
type TerminationReason = "anniversary" | "twoMonths" | "agreement";
type StepId = "type" | "reason" | "insurer";
type PdfFieldDef = {
  key: string;
  label: string;
  page: number;
  left: number;
  top: number;
  width: number;
};
type PdfCheckboxDef = {
  key: string;
  label: string;
  page: number;
  left: number;
  top: number;
  group: string | null;
};
type PdfPreviewConfig = {
  id: string;
  pdfUrl: string;
  pageCount: number;
  eyebrow: string;
  title: string;
  description: string;
  fields: readonly PdfFieldDef[];
  checkboxes: readonly PdfCheckboxDef[];
  fieldHeights: Partial<Record<string, number>>;
  fieldMinHeight?: string;
  fieldTranslateY?: string;
  printRules?: readonly string[];
  printInstructionTitle?: string;
  printInstructionDescription?: string;
};
type FillablePdfPreviewConfig = {
  id: string;
  pdfUrl: string;
  uploadUrl?: string;
  eyebrow: string;
  title: string;
  description: string;
};
type GeneratedPdfPage = {
  width: number;
  height: number;
};
type GeneratedPdfField = {
  key: string;
  label: string;
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
};
type GeneratedPdfCheckbox = GeneratedPdfField;

const INSURANCE_TYPES: Array<{
  id: InsuranceType;
  label: string;
  description: string;
  icon: typeof HeartPulse;
}> = [
  {
    id: "life",
    label: "Životní pojištění",
    description: "Výpověď životního nebo rizikového pojištění.",
    icon: HeartPulse,
  },
  {
    id: "nonLife",
    label: "Neživotní pojištění",
    description: "Majetek, auto, odpovědnost a další neživotní smlouvy.",
    icon: ShieldCheck,
  },
];

const LIFE_TERMINATION_REASONS: Array<{
  id: TerminationReason;
  label: string;
}> = [
  {
    id: "anniversary",
    label: "K výročnímu dni s 6 týdenní výpovědní lhůtou",
  },
  {
    id: "twoMonths",
    label: "Do 2 měsíců od uzavření s 8 denní výpovědní lhůtou",
  },
  {
    id: "agreement",
    label: "Dohodou (Pouze ČPP)",
  },
];

const INSURERS = [
  { label: "ČPP", logoPath: "/icons/cpp.png", logoClass: "p-2" },
  { label: "Kooperativa", logoPath: "/icons/koop-v2.png", logoClass: "p-2" },
  { label: "Allianz", logoPath: "/icons/allianz.png", logoClass: "p-2" },
  { label: "UNIQA", logoPath: "/icons/uniqa.png", logoClass: "p-2" },
  { label: "ČSOB", logoPath: "/icons/csob.png", logoClass: "p-2" },
  { label: "Generali", logoPath: "/icons/generali.png", logoClass: "p-2" },
  { label: "MetLife", logoPath: "/icons/metlife.png", logoClass: "p-2" },
  { label: "NN", logoPath: "/icons/nn.png", logoClass: "p-2" },
  { label: "Maxima", logoPath: "/icons/maxima.png", logoClass: "p-2" },
  { label: "Simplea", logoPath: "/icons/simplea.png", logoClass: "p-2" },
] as const;

type InsurerLabel = (typeof INSURERS)[number]["label"];

const CPP_AGREEMENT_PDF_URL = "/dokumenty/zpneonstornodohodou.pdf";
const CPP_STANDARD_TERMINATION_PDF_URL = "/dokumenty/Výpověď_PS_ŽP_062023.pdf";
const GENERALI_NON_LIFE_PDF_URL = "/dokumenty/generalinezivot.pdf";
const KOOPERATIVA_TERMINATION_PDF_URL = "/dokumenty/koopvypoved.pdf";
const GENERALI_UPLOAD_URL = "https://www.generaliceska.cz/napiste-nam";
const AGREEMENT_PAGE_COUNT = 3;
const STANDARD_TERMINATION_PAGE_COUNT = 2;

const CPP_AGREEMENT_PRINT_RULES = [
  "Storno dohodou může být akceptováno s datem účinnosti až 1 měsíc zpětně, doporučuji ponechat pravidlo vždy k výročnímu dni počátku pojištění.",
  "Storno dohodu lze již zasílat i na smlouvy životního pojištění.",
  "Žádost může být bez uvedení důvodu.",
  "Žádost musí být na formuláři ŽP DOKUMENTY Žádanky Výpověď_dohodou_062023.",
  "Neřeší se pojistné události (počet pojistných událostí na dané pojistné smlouvě nemá vliv na povolení storna dohodou).",
  "Pokud bylo storno dohodou k určitému datu již jednou zamítnuto, pak jej už k tomuto datu provést nelze. Řešením je dodat nové storno dohodu k jinému datu (např. o 1 den dříve nebo později).",
  "Storno dohodou zasílejte vždy nejdříve na můj mail jindrich.hajek@bohemika.eu a až týden po zaslání dokument nahrajte k pojistné smlouvě do SUSu.",
  "Pokud storno dohodou nahrajete nejdříve do SUSu k pojistné smlouvě a na můj mail ho zašlete až poté, nebo ho vůbec na můj mail nepošlete, bude zpracováno jako standardní žádost, nikoliv jako storno dohodou.",
] as const;

const AGREEMENT_FIELD_DEFS = [
  { key: "contractNumber", label: "Číslo smlouvy", page: 0, left: 29.8, top: 18.1, width: 21.8 },
  { key: "terminationDate", label: "Datum zrušení", page: 0, left: 75.2, top: 18.1, width: 18.8 },
  { key: "policyholderName", label: "Jméno a příjmení", page: 0, left: 33.4, top: 21.2, width: 34.5 },
  { key: "personalId", label: "RČ / IČO", page: 0, left: 80.4, top: 21.2, width: 13.4 },
  { key: "address", label: "Adresa", page: 0, left: 50.4, top: 24.3, width: 43.8 },
  { key: "bankAccount", label: "Číslo účtu", page: 0, left: 16.5, top: 31.8, width: 52.8 },
  { key: "payoutPolicy", label: "Pojistná smlouva pro vypořádání", page: 0, left: 24.8, top: 34.2, width: 44.8 },
  { key: "payoutAddress", label: "Adresa pro vypořádání", page: 0, left: 14.8, top: 36.6, width: 55.2 },
  { key: "place", label: "Místo podpisu", page: 0, left: 7.0, top: 81.0, width: 20.8 },
  { key: "signedDate", label: "Datum podpisu", page: 0, left: 33.2, top: 81.0, width: 15.4 },
  { key: "identifiedName", label: "Jméno identifikované osoby", page: 1, left: 26.5, top: 10.55, width: 36.6 },
  { key: "identifiedBirthNumber", label: "Rodné číslo", page: 1, left: 75.05, top: 10.55, width: 18.3 },
  { key: "identifiedBirthDate", label: "Datum narození", page: 1, left: 48.0, top: 13.05, width: 15.35 },
  { key: "identifiedResidence", label: "Trvalý pobyt", page: 1, left: 20.7, top: 15.8, width: 72.6 },
  { key: "foreignResidenceZip", label: "Stát trvalého pobytu / ZIP", page: 1, left: 36.5, top: 18.55, width: 18.9 },
  { key: "taxResidenceState", label: "Stát daňového rezidenta", page: 1, left: 31.9, top: 21.25, width: 24.55 },
  { key: "taxId", label: "DIČ", page: 1, left: 63.7, top: 21.25, width: 24.2 },
  { key: "documentType", label: "Druh dokladu", page: 1, left: 6.95, top: 27.2, width: 20.55 },
  { key: "documentNumber", label: "Číslo dokladu", page: 1, left: 28.45, top: 27.2, width: 17.8 },
  { key: "documentValidTo", label: "Platnost do", page: 1, left: 47.25, top: 27.2, width: 12.45 },
  { key: "documentIssuer", label: "Vydal", page: 1, left: 60.75, top: 27.2, width: 33.7 },
  { key: "birthPlace", label: "Místo narození", page: 1, left: 6.95, top: 31.15, width: 31.35 },
  { key: "birthState", label: "Stát narození", page: 1, left: 41.55, top: 31.15, width: 18.2 },
  { key: "citizenship", label: "Státní občanství", page: 1, left: 60.75, top: 31.15, width: 33.7 },
  { key: "sourceEmploymentOccupation", label: "Zdroj prostředků - povolání", page: 1, left: 43.15, top: 61.8, width: 47.1 },
  { key: "sourceBusinessType", label: "Zdroj prostředků - druh podnikání", page: 1, left: 42.85, top: 64.67, width: 47.55 },
  { key: "sourceOtherDescription", label: "Zdroj prostředků - jiný zdroj", page: 1, left: 26.65, top: 67.55, width: 63.85 },
  { key: "tradePurpose", label: "Účel obchodu", page: 1, left: 5.7, top: 76.62, width: 88.5 },
  { key: "fatcaTin", label: "Daňové americké číslo (TIN)", page: 1, left: 30.55, top: 82.02, width: 17.0 },
  { key: "fatcaPassportNumber", label: "Cestovní pas USA číslo", page: 1, left: 28.25, top: 83.31, width: 19.45 },
  { key: "fatcaGreenCardNumber", label: "Zelená karta číslo", page: 1, left: 26.15, top: 84.6, width: 21.6 },
  { key: "fatcaOtherDocument", label: "Jiný identifikační doklad", page: 1, left: 31.05, top: 85.89, width: 16.8 },
  { key: "fatcaPassportValidTo", label: "Platnost cestovního pasu", page: 1, left: 76.7, top: 83.31, width: 8.5 },
  { key: "fatcaGreenCardValidTo", label: "Platnost zelené karty", page: 1, left: 76.7, top: 84.6, width: 8.5 },
  { key: "fatcaDocumentNumber", label: "Číslo identifikačního dokladu", page: 1, left: 71.35, top: 85.89, width: 14.2 },
  { key: "agentName", label: "Zprostředkovatel", page: 2, left: 21.0, top: 19.2, width: 38.0 },
  { key: "agentPhone", label: "Telefon zprostředkovatele", page: 2, left: 71.3, top: 19.2, width: 20.2 },
  { key: "agentNumber", label: "Číslo zprostředkovatele", page: 2, left: 32.0, top: 22.3, width: 16.8 },
  { key: "agentCompany", label: "Zastupuje společnost", page: 2, left: 63.5, top: 22.3, width: 27.8 },
  { key: "agentPlace", label: "Místo ověření", page: 2, left: 47.0, top: 25.7, width: 19.0 },
  { key: "agentDate", label: "Datum ověření", page: 2, left: 73.4, top: 25.7, width: 18.0 },
] as const;

const AGREEMENT_CHECKBOX_DEFS = [
  { key: "genderMale", label: "Muž", page: 1, left: 72.25, top: 13.0, group: "gender" },
  { key: "genderFemale", label: "Žena", page: 1, left: 80.15, top: 13.0, group: "gender" },
  { key: "taxResidentOther", label: "Daňový rezident jiného státu než ČR", page: 1, left: 90.0, top: 18.8, group: null },
  { key: "pepYes", label: "Politicky exponovaná osoba - ANO", page: 1, left: 34.12, top: 39.77, group: null },
  { key: "pepPublicFunction", label: "PEP - veřejná funkce", page: 1, left: 7.16, top: 42.91, group: null },
  { key: "pepClosePerson", label: "PEP - osoba blízká", page: 1, left: 7.16, top: 44.41, group: null },
  { key: "pepBusinessRelation", label: "PEP - společník nebo majitel", page: 1, left: 7.16, top: 45.64, group: null },
  { key: "sourceEmployment", label: "Zdroj prostředků - závislá činnost", page: 1, left: 8.04, top: 61.38, group: null },
  { key: "sourceBusiness", label: "Zdroj prostředků - podnikatelská činnost", page: 1, left: 8.04, top: 64.25, group: null },
  { key: "sourceOther", label: "Zdroj prostředků - jiný zdroj", page: 1, left: 8.04, top: 67.12, group: null },
  { key: "fatcaUsPerson", label: "Americká osoba", page: 1, left: 6.41, top: 80.52, group: null },
  { key: "fatcaTinProvided", label: "Daňové americké číslo (TIN)", page: 1, left: 7.9, top: 82.02, group: null },
  { key: "fatcaPassportProvided", label: "Cestovní pas USA číslo", page: 1, left: 7.9, top: 83.31, group: null },
  { key: "fatcaGreenCardProvided", label: "Zelená karta číslo", page: 1, left: 7.9, top: 84.6, group: null },
  { key: "fatcaOtherDocumentProvided", label: "Jiný identifikační doklad", page: 1, left: 7.9, top: 85.89, group: null },
  { key: "fatcaPassportCopy", label: "Cestovní pas doložen kopií", page: 1, left: 49.58, top: 83.31, group: null },
  { key: "fatcaGreenCardCopy", label: "Zelená karta doložena kopií", page: 1, left: 49.58, top: 84.6, group: null },
  { key: "fatcaW9", label: "Doloženo formulářem W9", page: 1, left: 63.87, top: 82.02, group: null },
  { key: "fatcaPassportValidity", label: "Platnost cestovního pasu", page: 1, left: 63.87, top: 83.31, group: null },
  { key: "fatcaGreenCardValidity", label: "Platnost zelené karty", page: 1, left: 63.87, top: 84.6, group: null },
  { key: "fatcaDocumentNumberProvided", label: "Číslo identifikačního dokladu", page: 1, left: 63.87, top: 85.89, group: null },
  { key: "fatcaNonUsPerson", label: "Neamerická osoba", page: 1, left: 6.41, top: 87.78, group: null },
  { key: "fatcaW8Ben", label: "Doloženo formulářem W-8BEN", page: 1, left: 32.86, top: 87.95, group: null },
] as const;

const STANDARD_TERMINATION_FIELD_DEFS = [
  { key: "contractNumber", label: "Číslo smlouvy", page: 0, left: 35.95, top: 13.39, width: 24.75 },
  { key: "bankAccount", label: "Číslo účtu", page: 0, left: 43.15, top: 17.23, width: 19.85 },
  { key: "bankCode", label: "Kód banky", page: 0, left: 83.0, top: 17.23, width: 11.2 },
  { key: "policyholderName", label: "Jméno a příjmení", page: 0, left: 19.45, top: 23.61, width: 44.05 },
  { key: "policyholderBirthNumber", label: "Rodné číslo", page: 0, left: 73.2, top: 23.61, width: 20.2 },
  { key: "policyholderBirthDate", label: "Datum narození", page: 0, left: 48.0, top: 26.2, width: 15.35 },
  { key: "policyholderResidence", label: "Trvalý pobyt", page: 0, left: 16.0, top: 28.79, width: 77.1 },
  { key: "policyholderForeignResidenceZip", label: "Stát trvalého pobytu / ZIP", page: 0, left: 35.7, top: 31.39, width: 19.8 },
  { key: "policyholderTaxResidenceState", label: "Stát daňového rezidenta", page: 0, left: 31.9, top: 33.99, width: 24.55 },
  { key: "policyholderTaxId", label: "DIČ", page: 0, left: 63.7, top: 33.99, width: 24.2 },
  { key: "representativeName", label: "Zástupce - jméno", page: 0, left: 20.8, top: 38.99, width: 22.7 },
  { key: "representativeBirthNumber", label: "Zástupce - rodné číslo", page: 0, left: 45.9, top: 38.99, width: 15.1 },
  { key: "representativeStreet", label: "Zástupce - ulice", page: 0, left: 12.6, top: 41.18, width: 36.5 },
  { key: "representativeHouseNumber", label: "Zástupce - číslo popisné", page: 0, left: 63.0, top: 41.18, width: 10.7 },
  { key: "representativeZip", label: "Zástupce - PSČ", page: 0, left: 80.6, top: 41.18, width: 13.6 },
  { key: "representativeCity", label: "Zástupce - obec", page: 0, left: 17.9, top: 43.22, width: 33.7 },
  { key: "representativeForeignResidenceZip", label: "Zástupce - stát pobytu / ZIP", page: 0, left: 79.1, top: 43.22, width: 14.2 },
  { key: "representativeOtherDocument", label: "Jiný doklad zástupce", page: 0, left: 26.0, top: 47.45, width: 24.6 },
  { key: "documentType", label: "Druh dokladu", page: 0, left: 6.3, top: 54.85, width: 21.0 },
  { key: "documentNumber", label: "Číslo dokladu", page: 0, left: 27.65, top: 54.85, width: 18.3 },
  { key: "documentValidTo", label: "Platnost do", page: 0, left: 46.85, top: 54.85, width: 13.6 },
  { key: "documentIssuer", label: "Vydal", page: 0, left: 60.9, top: 54.85, width: 33.35 },
  { key: "birthPlace", label: "Místo narození", page: 0, left: 6.3, top: 58.78, width: 32.2 },
  { key: "birthState", label: "Stát narození", page: 0, left: 41.25, top: 58.78, width: 18.55 },
  { key: "citizenship", label: "Státní občanství", page: 0, left: 60.9, top: 58.78, width: 33.35 },
  { key: "pepRelationDescription", label: "Vazba na PEP", page: 0, left: 8.65, top: 78.07, width: 85.7 },
  { key: "sourceEmploymentOccupation", label: "Zdroj prostředků - povolání", page: 0, left: 44.7, top: 89.46, width: 45.5 },
  { key: "sourceBusinessType", label: "Zdroj prostředků - druh podnikání", page: 0, left: 42.85, top: 92.33, width: 47.55 },
  { key: "sourceOtherDescription", label: "Zdroj prostředků - jiný zdroj", page: 0, left: 26.65, top: 95.21, width: 63.85 },
  { key: "tradePurpose", label: "Účel obchodu", page: 1, left: 5.7, top: 10.79, width: 88.5 },
  { key: "fatcaTin", label: "Daňové americké číslo (TIN)", page: 1, left: 30.55, top: 16.62, width: 17.0 },
  { key: "fatcaPassportNumber", label: "Cestovní pas USA číslo", page: 1, left: 28.25, top: 17.92, width: 19.45 },
  { key: "fatcaGreenCardNumber", label: "Zelená karta číslo", page: 1, left: 26.15, top: 19.2, width: 21.6 },
  { key: "fatcaOtherDocument", label: "Jiný identifikační doklad", page: 1, left: 31.05, top: 20.5, width: 16.8 },
  { key: "fatcaPassportValidTo", label: "Platnost cestovního pasu", page: 1, left: 76.7, top: 17.92, width: 8.5 },
  { key: "fatcaGreenCardValidTo", label: "Platnost zelené karty", page: 1, left: 76.7, top: 19.2, width: 8.5 },
  { key: "fatcaDocumentNumber", label: "Číslo identifikačního dokladu", page: 1, left: 71.35, top: 20.5, width: 14.2 },
  { key: "identifiedSignatureDate", label: "Datum podpisu identifikované osoby", page: 1, left: 76.3, top: 35.04, width: 15.2 },
  { key: "agentName", label: "Zprostředkovatel", page: 1, left: 21.0, top: 41.21, width: 38.0 },
  { key: "agentPhone", label: "Telefon zprostředkovatele", page: 1, left: 71.3, top: 41.21, width: 20.2 },
  { key: "agentNumber", label: "Číslo zprostředkovatele", page: 1, left: 31.6, top: 44.35, width: 16.8 },
  { key: "agentCompany", label: "Zastupuje společnost", page: 1, left: 63.5, top: 44.35, width: 27.8 },
  { key: "agentPlace", label: "Místo ověření", page: 1, left: 44.1, top: 48.44, width: 21.5 },
  { key: "agentDate", label: "Datum ověření", page: 1, left: 73.4, top: 48.44, width: 18.0 },
] as const;

const STANDARD_TERMINATION_CHECKBOX_DEFS = [
  { key: "policyholderGenderMale", label: "Pojistník - muž", page: 0, left: 72.41, top: 25.8, group: "policyholderGender" },
  { key: "policyholderGenderFemale", label: "Pojistník - žena", page: 0, left: 80.08, top: 25.8, group: "policyholderGender" },
  { key: "policyholderTaxResidentOther", label: "Daňový rezident jiného státu než ČR", page: 0, left: 89.86, top: 30.91, group: null },
  { key: "representativeLegalGuardian", label: "Zákonný zástupce", page: 0, left: 31.89, top: 36.46, group: "representativeType" },
  { key: "representativeProxy", label: "Zmocněnec", page: 0, left: 47.86, top: 36.44, group: "representativeType" },
  { key: "representativeGuardian", label: "Opatrovník", page: 0, left: 63.92, top: 36.44, group: "representativeType" },
  { key: "representativeGenderMale", label: "Zástupce - muž", page: 0, left: 67.02, top: 38.74, group: "representativeGender" },
  { key: "representativeGenderFemale", label: "Zástupce - žena", page: 0, left: 71.93, top: 38.74, group: "representativeGender" },
  { key: "representativeBirthCertificate", label: "Rodný list", page: 0, left: 12.2, top: 44.99, group: null },
  { key: "representativePowerOfAttorney", label: "Plná moc", page: 0, left: 27.09, top: 44.99, group: null },
  { key: "representativeCourtDecision", label: "Rozhodnutí soudu", page: 0, left: 43.89, top: 44.99, group: null },
  { key: "representativeOtherDocumentCheckbox", label: "Jiný doklad", page: 0, left: 7.16, top: 46.81, group: null },
  { key: "pepYes", label: "Politicky exponovaná osoba - ANO", page: 0, left: 34.12, top: 67.43, group: null },
  { key: "pepPublicFunction", label: "PEP - veřejná funkce", page: 0, left: 7.16, top: 70.58, group: null },
  { key: "pepClosePerson", label: "PEP - osoba blízká", page: 0, left: 7.16, top: 72.08, group: null },
  { key: "pepBusinessRelation", label: "PEP - společník nebo majitel", page: 0, left: 7.16, top: 73.31, group: null },
  { key: "sourceEmployment", label: "Zdroj prostředků - závislá činnost", page: 0, left: 8.04, top: 89.05, group: null },
  { key: "sourceBusiness", label: "Zdroj prostředků - podnikatelská činnost", page: 0, left: 8.04, top: 91.92, group: null },
  { key: "sourceOther", label: "Zdroj prostředků - jiný zdroj", page: 0, left: 8.04, top: 94.79, group: null },
  { key: "fatcaUsPerson", label: "Americká osoba", page: 1, left: 6.41, top: 14.82, group: null },
  { key: "fatcaTinProvided", label: "Daňové americké číslo (TIN)", page: 1, left: 7.9, top: 16.32, group: null },
  { key: "fatcaPassportProvided", label: "Cestovní pas USA číslo", page: 1, left: 7.9, top: 17.61, group: null },
  { key: "fatcaGreenCardProvided", label: "Zelená karta číslo", page: 1, left: 7.9, top: 18.9, group: null },
  { key: "fatcaOtherDocumentProvided", label: "Jiný identifikační doklad", page: 1, left: 7.9, top: 20.19, group: null },
  { key: "fatcaPassportCopy", label: "Cestovní pas doložen kopií", page: 1, left: 49.58, top: 17.61, group: null },
  { key: "fatcaGreenCardCopy", label: "Zelená karta doložena kopií", page: 1, left: 49.58, top: 18.9, group: null },
  { key: "fatcaW9", label: "Doloženo formulářem W9", page: 1, left: 63.87, top: 16.32, group: null },
  { key: "fatcaPassportValidity", label: "Platnost cestovního pasu", page: 1, left: 63.87, top: 17.61, group: null },
  { key: "fatcaGreenCardValidity", label: "Platnost zelené karty", page: 1, left: 63.87, top: 18.9, group: null },
  { key: "fatcaDocumentNumberProvided", label: "Číslo identifikačního dokladu", page: 1, left: 63.87, top: 20.19, group: null },
  { key: "fatcaNonUsPerson", label: "Neamerická osoba", page: 1, left: 6.41, top: 22.08, group: null },
  { key: "fatcaW8Ben", label: "Doloženo formulářem W-8BEN", page: 1, left: 32.86, top: 22.25, group: null },
] as const;

const AGREEMENT_FIELD_HEIGHTS: Partial<Record<string, number>> = {
  identifiedName: 1.75,
  identifiedBirthNumber: 1.75,
  identifiedBirthDate: 1.7,
  identifiedResidence: 1.75,
  foreignResidenceZip: 1.7,
  taxResidenceState: 1.65,
  taxId: 1.65,
  documentType: 1.45,
  documentNumber: 1.45,
  documentValidTo: 1.45,
  documentIssuer: 1.45,
  birthPlace: 1.45,
  birthState: 1.45,
  citizenship: 1.45,
  sourceEmploymentOccupation: 1.35,
  sourceBusinessType: 1.35,
  sourceOtherDescription: 1.35,
  tradePurpose: 1.35,
  fatcaTin: 1.25,
  fatcaPassportNumber: 1.25,
  fatcaGreenCardNumber: 1.25,
  fatcaOtherDocument: 1.25,
  fatcaPassportValidTo: 1.25,
  fatcaGreenCardValidTo: 1.25,
  fatcaDocumentNumber: 1.25,
};

const STANDARD_TERMINATION_FIELD_HEIGHTS: Partial<Record<string, number>> = {
  contractNumber: 1.72,
  bankAccount: 1.72,
  bankCode: 1.72,
  policyholderName: 1.72,
  policyholderBirthNumber: 1.72,
  policyholderBirthDate: 1.72,
  policyholderResidence: 1.72,
  policyholderForeignResidenceZip: 1.72,
  policyholderTaxResidenceState: 1.72,
  policyholderTaxId: 1.72,
  representativeName: 1.72,
  representativeBirthNumber: 1.72,
  representativeStreet: 1.72,
  representativeHouseNumber: 1.72,
  representativeZip: 1.72,
  representativeCity: 1.72,
  representativeForeignResidenceZip: 1.72,
  representativeOtherDocument: 1.72,
  documentType: 1.72,
  documentNumber: 1.72,
  documentValidTo: 1.72,
  documentIssuer: 1.72,
  birthPlace: 1.72,
  birthState: 1.72,
  citizenship: 1.72,
  pepRelationDescription: 1.72,
  sourceEmploymentOccupation: 1.72,
  sourceBusinessType: 1.72,
  sourceOtherDescription: 1.72,
  tradePurpose: 1.72,
  fatcaTin: 1.72,
  fatcaPassportNumber: 1.72,
  fatcaGreenCardNumber: 1.72,
  fatcaOtherDocument: 1.72,
  fatcaPassportValidTo: 1.72,
  fatcaGreenCardValidTo: 1.72,
  fatcaDocumentNumber: 1.72,
  identifiedSignatureDate: 1.72,
  agentName: 1.72,
  agentPhone: 1.72,
  agentNumber: 1.72,
  agentCompany: 1.72,
  agentPlace: 1.72,
  agentDate: 1.72,
};

const CPP_AGREEMENT_PDF_CONFIG: PdfPreviewConfig = {
  id: "cpp-agreement",
  pdfUrl: CPP_AGREEMENT_PDF_URL,
  pageCount: AGREEMENT_PAGE_COUNT,
  eyebrow: "ČPP dohodou",
  title: "Náhled a doplnění PDF",
  description: "Modré hodnoty můžeš doplnit přímo do náhledu. Tisk vytiskne dokument s doplněnými údaji.",
  fields: AGREEMENT_FIELD_DEFS,
  checkboxes: AGREEMENT_CHECKBOX_DEFS,
  fieldHeights: AGREEMENT_FIELD_HEIGHTS,
  fieldMinHeight: "19px",
  printRules: CPP_AGREEMENT_PRINT_RULES,
  printInstructionTitle: "STORNO Dohodou",
  printInstructionDescription: "Před tiskem potvrď dodržení pravidel pro výpověď dohodou.",
};

const CPP_STANDARD_TERMINATION_PDF_CONFIG: PdfPreviewConfig = {
  id: "cpp-standard-termination",
  pdfUrl: CPP_STANDARD_TERMINATION_PDF_URL,
  pageCount: STANDARD_TERMINATION_PAGE_COUNT,
  eyebrow: "ČPP výpověď",
  title: "Náhled a doplnění PDF",
  description: "Modré hodnoty můžeš doplnit přímo do náhledu. Tisk vytiskne dokument s doplněnými údaji.",
  fields: STANDARD_TERMINATION_FIELD_DEFS,
  checkboxes: STANDARD_TERMINATION_CHECKBOX_DEFS,
  fieldHeights: STANDARD_TERMINATION_FIELD_HEIGHTS,
  fieldMinHeight: "19px",
  fieldTranslateY: "-100%",
};

const GENERALI_NON_LIFE_PDF_CONFIG: FillablePdfPreviewConfig = {
  id: "generali-non-life",
  pdfUrl: GENERALI_NON_LIFE_PDF_URL,
  uploadUrl: GENERALI_UPLOAD_URL,
  eyebrow: "Generali neživotní pojištění",
  title: "Náhled a doplnění PDF",
  description: "PDF obsahuje vlastní formulářová pole. Údaje doplň přímo do náhledu nebo otevři dokument v nové kartě.",
};

const KOOPERATIVA_TERMINATION_PDF_CONFIG: FillablePdfPreviewConfig = {
  id: "kooperativa-termination",
  pdfUrl: KOOPERATIVA_TERMINATION_PDF_URL,
  eyebrow: "Kooperativa výpověď",
  title: "Náhled a doplnění PDF",
  description: "PDF obsahuje vlastní formulářová pole. Údaje doplň přímo do náhledu nebo otevři dokument v nové kartě.",
};

function createEmptyPdfFields(fieldDefs: readonly PdfFieldDef[]) {
  return Object.fromEntries(fieldDefs.map((field) => [field.key, ""]));
}

function createEmptyPdfCheckboxes(checkboxDefs: readonly PdfCheckboxDef[]) {
  return Object.fromEntries(checkboxDefs.map((field) => [field.key, false]));
}

export default function ContractTerminationPage() {
  const [step, setStep] = useState(0);
  const [insuranceType, setInsuranceType] = useState<InsuranceType | null>(null);
  const [reason, setReason] = useState<TerminationReason | null>(null);
  const [insurer, setInsurer] = useState<InsurerLabel | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const formSteps = useMemo<Array<{ id: StepId; label: string }>>(
    () => [
      { id: "type", label: "Typ pojištění" },
      ...(insuranceType === "life" ? [{ id: "reason" as const, label: "Důvod" }] : []),
      { id: "insurer", label: "Pojišťovna" },
    ],
    [insuranceType]
  );

  const currentStep = formSteps[step]?.id ?? "type";
  const lastStep = formSteps.length - 1;
  const selectedInsuranceType = INSURANCE_TYPES.find((item) => item.id === insuranceType);
  const selectedReason = LIFE_TERMINATION_REASONS.find((item) => item.id === reason);
  const availableInsurers = reason === "agreement"
    ? INSURERS.filter((item) => item.label === "ČPP")
    : INSURERS;
  const showCppAgreementDocument =
    completed && insuranceType === "life" && reason === "agreement" && insurer === "ČPP";
  const showCppStandardTerminationDocument =
    completed &&
    insuranceType === "life" &&
    insurer === "ČPP" &&
    (reason === "anniversary" || reason === "twoMonths");
  const showGeneraliNonLifeDocument =
    completed && insuranceType === "nonLife" && insurer === "Generali";
  const showKooperativaDocument =
    completed &&
    insurer === "Kooperativa" &&
    (insuranceType === "life" || insuranceType === "nonLife");
  const activePdfConfig = showCppAgreementDocument
    ? CPP_AGREEMENT_PDF_CONFIG
    : showCppStandardTerminationDocument
      ? CPP_STANDARD_TERMINATION_PDF_CONFIG
      : null;
  const activeFillablePdfConfig = showGeneraliNonLifeDocument
    ? GENERALI_NON_LIFE_PDF_CONFIG
    : showKooperativaDocument
      ? KOOPERATIVA_TERMINATION_PDF_CONFIG
      : null;
  const activeDocument = activePdfConfig ?? activeFillablePdfConfig;

  const validateCurrentStep = () => {
    if (currentStep === "type" && !insuranceType) {
      setFormError("Vyber typ pojištění.");
      return false;
    }

    if (currentStep === "reason" && !reason) {
      setFormError("Vyber důvod výpovědi.");
      return false;
    }

    if (currentStep === "insurer" && !insurer) {
      setFormError("Vyber pojišťovnu.");
      return false;
    }

    if (currentStep === "insurer" && reason === "agreement" && insurer !== "ČPP") {
      setFormError("Výpověď dohodou je zatím dostupná pouze pro ČPP.");
      return false;
    }

    setFormError(null);
    return true;
  };

  const goToNextStep = () => {
    if (!validateCurrentStep()) return;

    if (step < lastStep) {
      setStep((prev) => Math.min(prev + 1, lastStep));
      return;
    }

    setCompleted(true);
  };

  const goToPreviousStep = () => {
    setFormError(null);
    setCompleted(false);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6 px-2 pb-10 sm:px-3">
        <SplitTitle text="Výpověď smlouvy" />

        {!activeDocument ? (
          <section className="relative overflow-hidden rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.24),transparent_34%),linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-[#f8fafc] shadow-[0_34px_90px_rgba(7,6,25,0.7),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6 vizitka-anim-up">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                Pomůcka
              </p>
              <h2 className="text-xl font-bold tracking-[-0.02em] text-[#f8fafc]">
                Základní údaje k výpovědi
              </h2>
            </div>

          <div className="mt-5 rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${formSteps.length}, minmax(0, 1fr))` }}
            >
              {formSteps.map((stepItem, index) => {
                const stepDone = step > index || completed;
                const stepActive = step === index && !completed;

                return (
                  <div key={stepItem.id} className="flex flex-col items-center gap-1 text-center">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                        stepDone
                          ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                          : stepActive
                            ? "border-violet-200/70 bg-violet-400/30 text-[#f8fafc]"
                            : "border-white/20 bg-white/[0.03] text-violet-200/70"
                      }`}
                    >
                      {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        stepActive || stepDone ? "text-[#f4f0ff]" : "text-violet-200/60"
                      }`}
                    >
                      {stepItem.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)] transition-[width] duration-300"
                style={{
                  width: `${completed ? 100 : ((step + 1) / formSteps.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-5">
            {currentStep === "type" ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                  Co se vypovídá
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {INSURANCE_TYPES.map((item) => {
                    const Icon = item.icon;
                    const selected = insuranceType === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setInsuranceType(item.id);
                          setReason(item.id === "life" ? reason : null);
                          setCompleted(false);
                          setFormError(null);
                        }}
                        className={`group flex min-h-[92px] items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-violet-200/70 bg-violet-400/20 text-[#f8fafc] shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                            : "border-white/14 bg-white/[0.03] text-violet-100/90 hover:border-violet-300/40 hover:bg-white/[0.07]"
                        }`}
                      >
                        <span
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                            selected
                              ? "border-violet-200/70 bg-violet-300/35 text-[#f8fafc]"
                              : "border-white/20 bg-white/[0.03] text-violet-100/80"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-tight text-[#f8fafc]">{item.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-violet-100/65">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {currentStep === "reason" ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                  Důvod výpovědi
                </p>
                <div className="grid gap-3">
                  {LIFE_TERMINATION_REASONS.map((item) => {
                    const selected = reason === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setReason(item.id);
                          if (item.id === "agreement") {
                            setInsurer("ČPP");
                          }
                          setCompleted(false);
                          setFormError(null);
                        }}
                        className={`flex min-h-[64px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          selected
                            ? "border-violet-200/70 bg-violet-400/20 text-[#f8fafc] shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                            : "border-white/14 bg-white/[0.03] text-violet-100/90 hover:border-violet-300/40 hover:bg-white/[0.07]"
                        }`}
                      >
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                            selected
                              ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                              : "border-white/20 bg-white/[0.03] text-violet-100/80"
                          }`}
                        >
                          {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
                        </span>
                        <span className="text-sm font-medium leading-tight text-[#f8fafc]">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {currentStep === "insurer" ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                  Pojišťovna
                </p>
                {reason === "agreement" ? (
                  <p className="text-sm font-medium text-violet-100/78">
                    U výpovědi dohodou je dostupná pouze ČPP.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {availableInsurers.map((item) => {
                    const selected = insurer === item.label;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setInsurer(item.label);
                          setCompleted(false);
                          setFormError(null);
                        }}
                        aria-label={`Vybrat pojišťovnu ${item.label}`}
                        className={`group flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-semibold transition ${
                          selected
                            ? "border-violet-200/85 bg-violet-400/24 shadow-[0_12px_30px_rgba(139,92,246,0.32)]"
                            : "border-white/14 bg-white/[0.04] hover:border-violet-300/40 hover:bg-white/[0.08]"
                        }`}
                      >
                        <span className="relative flex h-12 w-full max-w-[126px] items-center justify-center rounded-xl border border-white/70 bg-white/95 shadow-[0_10px_20px_rgba(10,7,24,0.18)]">
                          <Image
                            src={item.logoPath}
                            alt={`Logo ${item.label}`}
                            fill
                            sizes="126px"
                            className={`object-contain ${item.logoClass}`}
                          />
                        </span>
                        <span className={selected ? "text-[#f8fafc]" : "text-violet-100/82"}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {formError ? (
            <p className="mt-4 rounded-2xl border border-rose-300/45 bg-rose-400/15 px-3 py-2 text-xs text-rose-100">
              {formError}
            </p>
          ) : null}

          <div className="mt-5 rounded-2xl border border-white/12 bg-white/[0.03] p-3">
            <div className="grid gap-2 text-xs text-violet-100/75 sm:grid-cols-3">
              <div>
                <span className="block font-semibold uppercase tracking-[0.14em] text-violet-200/80">
                  Typ
                </span>
                <span className="mt-1 block text-sm text-[#f8fafc]">
                  {selectedInsuranceType?.label ?? "Nevybráno"}
                </span>
              </div>
              <div>
                <span className="block font-semibold uppercase tracking-[0.14em] text-violet-200/80">
                  Důvod
                </span>
                <span className="mt-1 block text-sm text-[#f8fafc]">
                  {insuranceType === "life" ? selectedReason?.label ?? "Nevybráno" : "Nevyžadováno"}
                </span>
              </div>
              <div>
                <span className="block font-semibold uppercase tracking-[0.14em] text-violet-200/80">
                  Pojišťovna
                </span>
                <span className="mt-1 block text-sm text-[#f8fafc]">{insurer ?? "Nevybráno"}</span>
              </div>
            </div>
          </div>

          {completed ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Výběr je připravený pro další krok.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-violet-100/70">
              Krok {step + 1} / {formSteps.length}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  className="inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Zpět
                </button>
              ) : null}

              <button
                type="button"
                onClick={goToNextStep}
                className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110 vizitka-cta-glow"
              >
                {step < lastStep ? "Pokračovat" : "Dokončit výběr"}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          </section>
        ) : (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => {
                setCompleted(false);
                setFormError(null);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-[0_10px_26px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Zpět na výběr
            </button>
          </div>
        )}

        {activePdfConfig ? <LifeInsurancePdfPreview key={activePdfConfig.id} config={activePdfConfig} /> : null}
        {activeFillablePdfConfig ? (
          <FillablePdfPreview key={activeFillablePdfConfig.id} config={activeFillablePdfConfig} />
        ) : null}
      </div>
    </AppLayout>
  );
}

function FillablePdfPreview({ config }: { config: FillablePdfPreviewConfig }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [checkboxes, setCheckboxes] = useState<Record<string, boolean>>({});
  const [generatedFields, setGeneratedFields] = useState<GeneratedPdfField[]>([]);
  const [generatedCheckboxes, setGeneratedCheckboxes] = useState<GeneratedPdfCheckbox[]>([]);
  const [pages, setPages] = useState<GeneratedPdfPage[]>([]);
  const [renderStatus, setRenderStatus] = useState<"loading" | "ready" | "error">("loading");
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  useEffect(() => {
    let cancelled = false;

    const waitForCanvases = async (pageCount: number) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        if (canvasRefs.current.slice(0, pageCount).every(Boolean)) return;
      }
    };

    async function renderPdf() {
      setRenderStatus("loading");
      canvasRefs.current = [];

      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const doc = await pdfjsLib.getDocument({ url: config.pdfUrl }).promise;
        const nextPages: GeneratedPdfPage[] = [];
        const nextFields: GeneratedPdfField[] = [];
        const nextCheckboxes: GeneratedPdfCheckbox[] = [];

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });

          nextPages.push({ width: viewport.width, height: viewport.height });

          const annotations = await page.getAnnotations({ intent: "display" });
          annotations.forEach((annotation: { fieldName?: string; fieldType?: string; checkBox?: boolean; rect?: number[] }, index: number) => {
            if (!annotation.fieldType || !annotation.rect) return;

            const [x1, y1, x2, y2] = annotation.rect;
            const annotationName = annotation.fieldName ?? `Pole ${index + 1}`;
            const generatedField = {
              key: `p${pageNumber}-a${index}-${annotationName}`,
              label: annotationName,
              page: pageNumber - 1,
              left: (x1 / viewport.width) * 100,
              top: ((viewport.height - y2) / viewport.height) * 100,
              width: ((x2 - x1) / viewport.width) * 100,
              height: ((y2 - y1) / viewport.height) * 100,
            };

            if (annotation.fieldType === "Tx") {
              nextFields.push(generatedField);
              return;
            }

            if (annotation.fieldType === "Btn" && annotation.checkBox) {
              nextCheckboxes.push(generatedField);
            }
          });
        }

        if (!cancelled) {
          setPages(nextPages);
          setGeneratedFields(nextFields);
          setGeneratedCheckboxes(nextCheckboxes);
          setFields(Object.fromEntries(nextFields.map((field) => [field.key, ""])));
          setCheckboxes(Object.fromEntries(nextCheckboxes.map((field) => [field.key, false])));
        }

        await waitForCanvases(doc.numPages);

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await doc.getPage(pageNumber);
          const renderViewport = page.getViewport({ scale: 2 });
          const canvas = canvasRefs.current[pageNumber - 1];
          const context = canvas?.getContext("2d");

          if (!canvas || !context) continue;

          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
        }

        if (!cancelled) setRenderStatus("ready");
      } catch (error) {
        console.error("Náhled PDF se nepodařilo vykreslit.", error);
        if (!cancelled) setRenderStatus("error");
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
    };
  }, [config.pdfUrl]);

  const resetPdf = () => {
    setFields(Object.fromEntries(generatedFields.map((field) => [field.key, ""])));
    setCheckboxes(Object.fromEntries(generatedCheckboxes.map((field) => [field.key, false])));
  };

  const printPdf = () => {
    if (renderStatus !== "ready") return;
    window.setTimeout(() => window.print(), 0);
  };

  const openUploadPage = () => {
    if (!config.uploadUrl) return;

    const uploadWindow = window.open(config.uploadUrl, "_blank", "noopener,noreferrer");
    if (uploadWindow) {
      return;
    }

    window.location.href = config.uploadUrl;
  };

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: value.slice(0, 180),
    }));
  };

  const toggleCheckbox = (key: string) => {
    setCheckboxes((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <section
      id="generali-fillable-document"
      className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:p-5 vizitka-anim-up"
    >
      <style jsx global>{`
        #generali-fillable-document .generali-field {
          font-size: clamp(11.5px, 1.08vw, 13px);
          line-height: 1.16;
          min-height: 18px;
        }

        #generali-fillable-document .generali-checkbox {
          min-height: 13px;
          min-width: 13px;
        }

        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          body * {
            visibility: hidden !important;
          }

          #generali-fillable-document,
          #generali-fillable-document * {
            visibility: visible !important;
          }

          #generali-fillable-document {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: #fff !important;
          }

          #generali-fillable-document .generali-no-print {
            display: none !important;
          }

          #generali-fillable-document .generali-pages {
            gap: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          #generali-fillable-document .generali-page {
            width: 210mm !important;
            height: 297mm !important;
            max-width: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }

          #generali-fillable-document .generali-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          #generali-fillable-document .generali-field {
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            color: #111827 !important;
            font-size: 9pt !important;
            line-height: 4.4mm !important;
            min-height: 0 !important;
            padding: 0 1mm !important;
          }

          #generali-fillable-document .generali-checkbox {
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            color: #111827 !important;
            min-height: 0 !important;
            min-width: 0 !important;
          }
        }
      `}</style>

      <div className="generali-no-print flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            {config.eyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-950">
            {config.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {config.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={config.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Otevřít PDF
          </a>
          <button
            type="button"
            onClick={resetPdf}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Vymazat
          </button>
          <button
            type="button"
            onClick={printPdf}
            disabled={renderStatus !== "ready"}
            className="inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {renderStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Tisk
          </button>
          {config.uploadUrl ? (
            <button
              type="button"
              onClick={openUploadPage}
              className="inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.28)] transition hover:brightness-110"
            >
              <Send className="h-4 w-4" />
              Nahrát výpověď
            </button>
          ) : null}
        </div>
      </div>

      {renderStatus === "error" ? (
        <p className="generali-no-print mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          Náhled PDF se nepodařilo načíst. Otevři dokument v nové kartě.
        </p>
      ) : null}

      <div className="generali-pages mt-5 grid gap-5 bg-slate-100/80 p-3 sm:p-4">
        {(pages.length ? pages : [{ width: 595.276, height: 841.89 }]).map((page, pageIndex) => (
          <div
            key={pageIndex}
            className="generali-page relative mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
          >
            {renderStatus === "loading" ? (
              <div className="generali-no-print absolute inset-0 z-10 grid place-items-center bg-white/80 text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Načítám PDF
                </span>
              </div>
            ) : null}

            <canvas
              ref={(node) => {
                canvasRefs.current[pageIndex] = node;
              }}
              className="absolute inset-0 h-full w-full"
              aria-label={`Stránka PDF ${pageIndex + 1}`}
            />

            {generatedFields.filter((field) => field.page === pageIndex).map((field) => (
              <input
                key={field.key}
                aria-label={field.label}
                title={field.label}
                value={fields[field.key] ?? ""}
                onChange={(event) => updateField(field.key, event.target.value)}
                className="generali-field absolute rounded-[3px] border border-blue-500/25 bg-blue-50/35 px-1 font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:bg-blue-50 focus:ring-2 focus:ring-blue-500/20"
                style={{
                  left: `${field.left}%`,
                  top: `${field.top}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
              />
            ))}

            {generatedCheckboxes.filter((field) => field.page === pageIndex).map((field) => {
              const checked = checkboxes[field.key] ?? false;

              return (
                <button
                  key={field.key}
                  type="button"
                  aria-label={field.label}
                  aria-pressed={checked}
                  title={field.label}
                  onClick={() => toggleCheckbox(field.key)}
                  className="generali-checkbox absolute inline-flex items-center justify-center bg-transparent text-slate-950 outline-none transition hover:bg-blue-100/20 focus:ring-2 focus:ring-blue-500/25"
                  style={{
                    left: `${field.left}%`,
                    top: `${field.top}%`,
                    width: `${field.width}%`,
                    height: `${field.height}%`,
                  }}
                >
                  {checked ? (
                    <span className="block text-[10px] font-black leading-none sm:text-xs">×</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function LifeInsurancePdfPreview({ config }: { config: PdfPreviewConfig }) {
  const [fields, setFields] = useState<Record<string, string>>(() => createEmptyPdfFields(config.fields));
  const [checkboxes, setCheckboxes] = useState<Record<string, boolean>>(() => createEmptyPdfCheckboxes(config.checkboxes));
  const [renderStatus, setRenderStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showPrintInstructions, setShowPrintInstructions] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      setRenderStatus("loading");

      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const doc = await pdfjsLib.getDocument({ url: config.pdfUrl }).promise;

        for (let pageNumber = 1; pageNumber <= Math.min(doc.numPages, config.pageCount); pageNumber += 1) {
          if (cancelled) return;

          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = canvasRefs.current[pageNumber - 1];
          const context = canvas?.getContext("2d");

          if (!canvas || !context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }

        if (!cancelled) setRenderStatus("ready");
      } catch (error) {
        console.error("Náhled PDF výpovědi se nepodařilo vykreslit.", error);
        if (!cancelled) setRenderStatus("error");
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
    };
  }, [config.pageCount, config.pdfUrl]);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: value.slice(0, 140),
    }));
  };

  const resetFields = () => {
    setFields(createEmptyPdfFields(config.fields));
    setCheckboxes(createEmptyPdfCheckboxes(config.checkboxes));
  };

  const openPrintInstructions = () => {
    if (renderStatus !== "ready") return;
    if (!config.printRules?.length) {
      window.setTimeout(() => window.print(), 0);
      return;
    }

    setShowPrintInstructions(true);
  };

  const confirmPrint = () => {
    setShowPrintInstructions(false);
    window.setTimeout(() => window.print(), 0);
  };

  const toggleCheckbox = (key: string) => {
    const checkboxDef = config.checkboxes.find((item) => item.key === key);

    setCheckboxes((prev) => {
      const next = { ...prev, [key]: !prev[key] };

      if (checkboxDef?.group && next[key]) {
        config.checkboxes.forEach((item) => {
          if (item.group === checkboxDef.group && item.key !== key) {
            next[item.key] = false;
          }
        });
      }

      return next;
    });
  };

  return (
    <section
      id="cpp-agreement-document"
      className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:p-5 vizitka-anim-up"
    >
      <style jsx global>{`
        #cpp-agreement-document .agreement-field {
          font-size: clamp(12.5px, 1.32vw, 14.5px);
          font-weight: 700;
          height: 1.72%;
          line-height: 1.16;
          min-height: ${config.fieldMinHeight ?? "0"};
          transform: translateY(${config.fieldTranslateY ?? "-58%"});
        }

        #cpp-agreement-document .agreement-checkbox {
          height: 1.35%;
          width: 1.35%;
          transform: translate(-8%, -50%);
        }

        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          body * {
            visibility: hidden !important;
          }

          #cpp-agreement-document,
          #cpp-agreement-document * {
            visibility: visible !important;
          }

          #cpp-agreement-document {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: #fff !important;
          }

          #cpp-agreement-document .agreement-no-print {
            display: none !important;
          }

          #cpp-agreement-document .agreement-pages {
            gap: 0 !important;
          }

          #cpp-agreement-document .agreement-page {
            width: 210mm !important;
            height: 297mm !important;
            max-width: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }

          #cpp-agreement-document .agreement-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          #cpp-agreement-document .agreement-field {
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            color: #123c7c !important;
            height: 5.1mm !important;
            font-size: 10.8pt !important;
            line-height: 5.1mm !important;
            min-height: 0 !important;
            padding: 0 1mm !important;
            transform: translateY(${config.fieldTranslateY ?? "-58%"}) !important;
          }

          #cpp-agreement-document .agreement-checkbox {
            height: 4.2mm !important;
            width: 4.2mm !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            color: #123c7c !important;
            transform: translate(-8%, -50%) !important;
          }
        }
      `}</style>

      <div className="agreement-no-print flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            {config.eyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-slate-950">
            {config.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {config.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={config.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Otevřít PDF
          </a>
          <button
            type="button"
            onClick={resetFields}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Vymazat
          </button>
          <button
            type="button"
            onClick={openPrintInstructions}
            disabled={renderStatus !== "ready"}
            className="inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {renderStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Tisk
          </button>
        </div>
      </div>

      {showPrintInstructions && portalRoot
        ? createPortal(
            <div className="agreement-no-print fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/62 px-3 py-4 backdrop-blur-[2.5px] sm:px-6 sm:py-6">
              <div className="w-full max-w-4xl rounded-[30px] border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_55%,#eff6ff_100%)] p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
                      ČPP životní pojištění
                    </span>
                    <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                      {config.printInstructionTitle ?? "Instrukce před tiskem"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {config.printInstructionDescription ?? "Před tiskem potvrď, že je dokument připravený."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPrintInstructions(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Zavřít instrukce"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-800">
                  <p className="font-semibold">Vážení poradci,</p>
                  <p>
                    Od 3.12. 2025 platí následující pravidla pro storno dohodou pro smlouvy životního pojištění ČPP a.s.,
                    prosím o jejich důsledné dodržování:
                  </p>
                  <ol className="space-y-2">
                    {config.printRules?.map((rule, index) => (
                      <li key={rule} className="flex items-start gap-2.5">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-300 bg-white text-xs font-semibold text-cyan-700">
                          {index + 1}
                        </span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ol>
                  <p>Děkuji</p>
                  <p className="font-semibold">Jindřich Hájek.</p>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPrintInstructions(false)}
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Zpět
                  </button>
                  <button
                    type="button"
                    onClick={confirmPrint}
                    className="inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.28)] transition hover:brightness-110"
                  >
                    <Printer className="h-4 w-4" />
                    Rozumím, přejít k TISKU
                  </button>
                </div>
              </div>
            </div>,
            portalRoot
          )
        : null}

      {renderStatus === "error" ? (
        <p className="agreement-no-print mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          Náhled PDF se nepodařilo načíst. Otevři dokument v nové kartě.
        </p>
      ) : null}

      <div className="agreement-pages mt-5 grid gap-5 bg-slate-100/80 p-3 sm:p-4">
        {Array.from({ length: config.pageCount }).map((_, pageIndex) => (
          <div
            key={pageIndex}
            className="agreement-page relative mx-auto aspect-[595.32/841.92] w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
          >
            {renderStatus === "loading" ? (
              <div className="agreement-no-print absolute inset-0 z-10 grid place-items-center bg-white/80 text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Načítám stránku {pageIndex + 1}
                </span>
              </div>
            ) : null}
            <canvas
              ref={(node) => {
                canvasRefs.current[pageIndex] = node;
              }}
              className="absolute inset-0 h-full w-full"
              aria-label={`Stránka PDF ${pageIndex + 1}`}
            />

            {config.fields.filter((field) => field.page === pageIndex).map((field) => (
              <input
                key={field.key}
                aria-label={field.label}
                title={field.label}
                value={fields[field.key] ?? ""}
                onChange={(event) => updateField(field.key, event.target.value)}
                className="agreement-field absolute rounded-[3px] border border-blue-500/30 bg-blue-50/55 px-1 font-semibold text-[#123c7c] outline-none transition focus:border-blue-600 focus:bg-blue-50 focus:ring-2 focus:ring-blue-500/20"
                style={{
                  left: `${field.left}%`,
                  top: `${field.top}%`,
                  width: `${field.width}%`,
                  height: `${config.fieldHeights[field.key] ?? 1.72}%`,
                }}
              />
            ))}

            {config.checkboxes.filter((field) => field.page === pageIndex).map((field) => {
              const checked = checkboxes[field.key] ?? false;

              return (
                <button
                  key={field.key}
                  type="button"
                  aria-label={field.label}
                  aria-pressed={checked}
                  title={field.label}
                  onClick={() => toggleCheckbox(field.key)}
                  className="agreement-checkbox absolute inline-flex items-center justify-center bg-transparent text-[#123c7c] outline-none transition hover:bg-blue-100/20 focus:ring-2 focus:ring-blue-500/25"
                  style={{
                    left: `${field.left}%`,
                    top: `${field.top}%`,
                  }}
                >
                  {checked ? (
                    <span className="block text-[10px] font-black leading-none sm:text-xs">×</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
