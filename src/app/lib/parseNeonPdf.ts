// src/app/lib/parseNeonPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type NeonRiskFields = Partial<{
  version: string;
  deathType: string;
  deathAmount: string;
  death2Type: string;
  death2Amount: string;
  deathTerminalAmount: string;
  waiverInvalidity: boolean;
  waiverUnemployment: boolean;
  invalidityAType: string;
  invalidityA1: string;
  invalidityA2: string;
  invalidityA3: string;
  invalidityBType: string;
  invalidityB1: string;
  invalidityB2: string;
  invalidityB3: string;
  invalidityPension: boolean;
  criticalType: string;
  criticalAmount: string;
  childSurgeryAmount: string;
  vaccinationCompAmount: string;
  diabetesAmount: string;
  deathAccidentAmount: string;
  injuryPermanentAmount: string;
  hospitalizationAmount: string;
  hospitalizationIllnessAmount: string;
  hospitalizationInjuryAmount: string;
  accidentDailyBenefit: string;
  workIncapacityStart: string;
  workIncapacityBackpay: string;
  workIncapacityAmount: string;
   workIncapacityInjury: boolean;
   workIncapacityIllness: boolean;
  careDependencyAmount: string;
  specialAidAmount: string;
  caregivingAmount: string;
  reproductionCostAmount: string;
  cppHelp: boolean;
  liabilityCitizenLimit: string;
  liabilityEmployeeLimit: string;
  travelInsurance: boolean;
}>;

export type NeonPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  durationYears?: number | null;
  frequency?: PaymentFrequency | null;
  riskFields?: NeonRiskFields;
  risks?: { title: string; variant?: string | null; amount?: number | null }[];
};

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, dRaw, mRaw, yRaw] = m;
  const d = Number(dRaw);
  const mm = Number(mRaw);
  const y = Number(yRaw);
  if (!d || !mm || !y) return null;
  return `${y.toString().padStart(4, "0")}-${mm
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const digitsOnly = (val: string | null | undefined): string | null => {
  if (!val) return null;
  const digits = val.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
};

export async function parseNeonPdf(file: File): Promise<NeonPdfResult> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
    try {
      const workerSrc = "/pdf.worker.min.mjs";
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      }
    } catch (err) {
      console.warn("PDF worker src nebylo možné nastavit", err);
    }
  }

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pagesText: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pagesText.push(text);
  }

  const fullText = pagesText.join("\n");
  // Zachováme řádky, jen odstaníme diakritiku pro hledání.
  const asciiLines = fullText
    .split(/\n+/)
    .map((l) => stripDiacritics(l).toLowerCase().trim())
    .filter(Boolean);
  const asciiText = stripDiacritics(fullText).toLowerCase();

  const result: NeonPdfResult = {};
  const riskFields: NeonRiskFields = {};
  const risks: { title: string; variant?: string | null; amount?: number | null }[] = [];

  const findAmountAfter = (labelRegex: RegExp, maxLookahead = 6): number | null => {
    const idx = asciiLines.findIndex((l) => labelRegex.test(l));
    if (idx !== -1) {
      for (let i = idx + 1; i <= Math.min(asciiLines.length - 1, idx + maxLookahead); i++) {
        const m = asciiLines[i].match(/([\d\s]+)(k[cč])/);
        if (m?.[1]) {
          const val = parseAmount(m[1]);
          if (val != null) return val;
        }
      }
    }

    // fallback: v celém textu najdi číslo v dosahu 100 znaků po labelu
    const m2 = asciiText.match(new RegExp(`${labelRegex.source}[^\\d]{0,100}([\\d\\s]+)k[cč]`, "i"));
    if (m2?.[1]) {
      const val = parseAmount(m2[1]);
      if (val != null) return val;
    }

    return null;
  };

  const addRiskRow = (title: string | null | undefined, variant?: string | null, amount?: number | null) => {
    const t = title?.trim();
    if (!t) return;
    risks.push({ title: t, variant: variant?.trim() || null, amount: amount ?? null });
  };

  // Obecné čtení tabulky Pojisteni / Varianta / Pojistna castka
  const isHeader = (txt: string) =>
    /pojisteni si prenana pri|pojisteny|pojisteni|pojistna doba|pojistna castka|pojistne kc|mesicni pojistne|strana|verze|kalkulator|vytvoreno/i.test(
      txt
    );
  const isCurrency = (txt: string) => /[\d\s]+k[cč]/.test(txt);
  const isDateLike = (txt: string) => /\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{2,4}/.test(txt);
  const isPureNumber = (txt: string) => /^\d+([.,]\d+)?$/.test(txt);
  const hasLetters = (txt: string) => /[a-z]/i.test(txt);
  const normalize = (txt: string) => stripDiacritics(txt).toLowerCase();
  const allowedRiskTitles = [
    "zakladni pojisteni pro pripad smrti s konstantni pojistnou castkou",
    "invalidita iii. stupne s konstantni pc",
    "invalidita ii. stupne s konstantni pc",
    "invalidita i. stupne s konstantni pc",
    "invalidita iii. stupne s linearne klesajici pc",
    "invalidita ii. stupne s linearne klesajici pc",
    "invalidita i. stupne s linearne klesajici pc",
    "zavazna onemocneni a poraneni s konstantni pc",
    "zavazna onemocneni a poraneni s linearne klesajici pc",
    "zavazna onemocneni a poraneni s klesajici pc dle uroku z uveru",
    "operace ditete s vrozenou vadou",
    "zavazne nasledky ockovani",
    "cukrovka a jeji komplikace",
    "smrt urazem",
    "trvale nasledky urazu",
    "denni odskodne za dobu leceni urazu",
    "denni odskodne za pobyt v nemocnici z duvodu urazu",
    "denni odskodne za pobyt v nemocnici z duvodu nemoci",
    "denni odskodne za pracovni neschopnost nemoci",
    "denni odskodne za pracovni neschopnost urazem plus",
    "zavislost na peci ii. - iv. stupne",
    "prispevek na porizeni zvlastni pomucky",
    "celodenni osetrovani pojisteneho",
    "zdravotni a socialni asistence",
    "cpp pomoc",
    "cestovni pripojisteni vcetne covidu plus",
    "pripojisteni odpovednosti obcana v beznem obcanskem zivote vc. ujmy na mobilnim elektronickem zarizeni",
    "pripojisteni odpovednosti zamestnance pri vykonu povolani",
  ];

  let i = 0;
  while (i < asciiLines.length) {
    const line = asciiLines[i];
    if (
      !line ||
      !hasLetters(line) ||
      isHeader(line) ||
      isCurrency(line) ||
      isDateLike(line) ||
      isPureNumber(line)
    ) {
      i++;
      continue;
    }

    const title = line;
    const normTitle = normalize(title);
    const allowed = allowedRiskTitles.some((p) => normTitle.includes(p));
    if (!allowed) {
      i++;
      continue;
    }
    const variantParts: string[] = [];
    let cursor = i + 1;

    // posbírej variantu, ale zastav se na číslech/datel/částkách
    while (cursor < asciiLines.length && cursor <= i + 6) {
      const next = asciiLines[cursor];
      if (!next) {
        cursor++;
        continue;
      }
      if (isHeader(next) || isCurrency(next)) break;
      if (isDateLike(next) || isPureNumber(next)) break;
      if (hasLetters(next)) variantParts.push(next);
      cursor++;
    }

    // hledej pojistnou částku – první z více částek v řádku tabulky; jedinou částku bereme jen pokud je rozumně velká
    const currencyHits: number[] = [];
    for (let k = cursor; k < asciiLines.length && k <= i + 10; k++) {
      const txt = asciiLines[k];
      if (isHeader(txt)) break;
      if (isCurrency(txt)) {
        const m = txt.match(/([\d\s]+)k[cč]/);
        const val = parseAmount(m?.[1]);
        if (val != null) currencyHits.push(val);
      }
      if (isDateLike(txt)) continue;
    }

    let amount: number | null = null;
    if (currencyHits.length >= 2) {
      amount = currencyHits[0];
    } else if (currencyHits.length === 1 && currencyHits[0] >= 500) {
      // Jedna nízká částka bývá často měsíční pojistné – tu vynecháme.
      amount = currencyHits[0];
    }

    // Speciálně pro PN: částky bývají bez "Kč"
    if (
      amount == null &&
      /denni odskodne za pracovni neschopnost/.test(title) &&
      cursor < asciiLines.length
    ) {
      const numHits: number[] = [];
      for (let k = cursor; k <= Math.min(i + 8, asciiLines.length - 1); k++) {
        const t = asciiLines[k];
        if (isPureNumber(t)) {
          const val = parseAmount(t);
          if (val != null) numHits.push(val);
        }
        if (isCurrency(t)) break;
      }
      const overHundred = numHits.filter((n) => n >= 100);
      const candidate = overHundred[0] ?? numHits[0];
      if (candidate != null) amount = candidate;
    }

    addRiskRow(title, variantParts.length ? variantParts.join(" / ") : null, amount);
    i = Math.max(cursor, i + 1);
  }

  // Namapuj vybrané invalidity do pickerů
  const setInvalidity = (degree: 1 | 2 | 3, type: "konstantni" | "klesajici" | "klesajici_urok", amount?: number | null) => {
    const amountStr = amount != null ? String(amount) : undefined;
    if (!riskFields.invalidityAType) {
      riskFields.invalidityAType = type;
    }
    // nepřepisuj, pokud je už vyplněno
    if (degree === 1 && amountStr && !riskFields.invalidityA1) riskFields.invalidityA1 = amountStr;
    if (degree === 2 && amountStr && !riskFields.invalidityA2) riskFields.invalidityA2 = amountStr;
    if (degree === 3 && amountStr && !riskFields.invalidityA3) riskFields.invalidityA3 = amountStr;
  };

  for (const r of risks) {
    const norm = normalize(r.title);
    let degree: 1 | 2 | 3 | null = null;
    if (/iii|3\./.test(norm)) degree = 3;
    else if (/ii\b|2\./.test(norm)) degree = 2;
    else if (/\bi\b|1\./.test(norm)) degree = 1;

    if (degree) {
      if (/konstantn/i.test(norm)) {
        setInvalidity(degree, "konstantni", r.amount);
      } else if (/linearne|klesajici pc/.test(norm) && !/uroku/.test(norm)) {
        setInvalidity(degree, "klesajici", r.amount);
      } else if (/uroku/.test(norm)) {
        setInvalidity(degree, "klesajici_urok", r.amount);
      }
    }

    // Trvalé následky úrazu – nastav pojistnou částku z tabulky
    if (norm.includes("trvale nasledky urazu") && r.amount != null) {
      riskFields.injuryPermanentAmount = String(r.amount);
    }

    // Denní odškodné za dobu léčení úrazu – denní částka
    if (norm.includes("denni odskodne za dobu leceni urazu") && r.amount != null) {
      riskFields.accidentDailyBenefit = String(r.amount);
    }

    // Pracovní neschopnost – nemoc / úraz
    if (norm.includes("denni odskodne za pracovni neschopnost")) {
      const variantText = normalize(`${r.title} ${r.variant ?? ""}`);
      if (norm.includes("nemoc")) {
        riskFields.workIncapacityIllness = true;
      }
      if (norm.includes("uraz")) {
        riskFields.workIncapacityInjury = true;
      }
      if (r.amount != null) {
        riskFields.workIncapacityAmount = String(r.amount);
      } else {
        // fallback: PN tabulka často uvádí čísla bez "Kč" (např. 32 | 600 | 637)
        const nums = (r.variant ?? "")
          .split(/\s+/)
          .map((p) => parseAmount(p))
          .filter((n): n is number => n != null);
        if (nums.length === 0) {
          const nearbyNums = (asciiLines.slice(i, Math.min(i + 5, asciiLines.length)).join(" ").match(/\d{2,6}/g) ?? [])
            .map((n) => parseAmount(n))
            .filter((n): n is number => n != null);
          const nonDuration = nearbyNums.filter((n) => n >= 100); // preskoč 32 apod.
          const candidate = nonDuration.length > 0 ? nonDuration[0] : nearbyNums[0];
          if (candidate != null) riskFields.workIncapacityAmount = String(candidate);
        }
      }
      const startMatch = variantText.match(/plneni od\s*(\d{1,3})/);
      if (startMatch?.[1]) {
        riskFields.workIncapacityStart = startMatch[1];
      }
      if (/zpetne/.test(variantText)) {
        riskFields.workIncapacityBackpay = "zpetne";
      } else if (/nezpetne/.test(variantText)) {
        riskFields.workIncapacityBackpay = "nezpetne";
      }
    }

    // Základní pojištění pro případ smrti s konstantní PČ
    if (norm.includes("zakladni pojisteni pro pripad smrti s konstantni pojistnou castkou")) {
      if (r.amount != null) riskFields.deathAmount = String(r.amount);
      riskFields.deathType = riskFields.deathType ?? "konstantni";
    }
  }

  // Číslo pojistné smlouvy
  const contractMatch =
    fullText.match(/Číslo\s+pojistné\s+smlouvy:?\s*([\d\s]{6,30})/i)?.[1] ??
    asciiText.match(/cislo pojistne smlouvy:?\s*([\d\s]{6,30})/i)?.[1];
  const contractCandidate = digitsOnly(contractMatch);
  const numberCandidates = [
    ...(fullText.match(/\b\d{8,12}\b/g) ?? []),
    contractCandidate ?? "",
  ].filter(Boolean) as string[];

  if (numberCandidates.length > 0) {
    const unique = Array.from(new Set(numberCandidates));
    const sorted = unique.sort((a, b) => {
      // prefer délku 10, pak 9/11, pak kratší
      const pref = (len: number) => (len === 10 ? 3 : len === 9 || len === 11 ? 2 : 1);
      const da = pref(a.length);
      const db = pref(b.length);
      if (da !== db) return db - da;
      return b.length - a.length;
    });
    result.contractNumber = sorted[0];
  }

  // Jméno a příjmení (pojistník)
  const nameMatch =
    fullText.match(/Jméno\s+a\s+příjmení[, ]+titul\s*([^\n]+)/i)?.[1]?.trim() ??
    asciiText.match(/jmeno a prijmeni[, ]+titul\s*([^\n]+)/i)?.[1]?.trim();
  if (nameMatch) {
    result.clientName = nameMatch.replace(/\s+/g, " ").trim();
  }

  // Počátek pojištění
  const startMatch =
    fullText.match(/Počátek\s+pojištění\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    asciiText.match(/pocatek pojisteni\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const startIso = toDateInput(startMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Datum uzavření
  const signedMatch =
    fullText.match(/DATUM\s+UZAVŘENÍ\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    asciiText.match(/datum uzavreni\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const signedIso = toDateInput(signedMatch);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Doba trvání smlouvy
  const durationMatch =
    fullText.match(/Doba\s+trvání\s+smlouvy\s*([0-9]{1,3})/i)?.[1] ??
    asciiText.match(/doba trvani smlouvy\s*([0-9]{1,3})/i)?.[1];
  if (durationMatch) {
    const yrs = Number.parseInt(durationMatch, 10);
    if (Number.isFinite(yrs)) {
      result.durationYears = Math.max(1, yrs);
    }
  }

  // Měsíční pojistné včetně slev a přirážek
  const amountMatch =
    fullText.match(/Měsíční\s+pojistné\s+včetně\s+slev\s+a\s+přirážek\s+celkem\s+v\s+Kč\s*([0-9\s.,]+)/i)?.[1] ??
    asciiText.match(/mesicni pojistne vcetne slev a prirazek celkem v kc\s*([0-9\s.,]+)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  // NEON je měsíční frekvence
  result.frequency = "monthly";

  // ---------- Rizika ----------
  // Smrt
  const deathConst = findAmountAfter(/smrt s konstantni/i);
  if (deathConst != null) {
    riskFields.deathAmount = String(deathConst);
    riskFields.deathType = "konstantni";
  }
  const deathLinear = findAmountAfter(/klesajici pojistna castka line/i);
  if (deathLinear != null) {
    riskFields.death2Amount = String(deathLinear);
    riskFields.death2Type = "klesajici";
  }
  const deathInterest = findAmountAfter(/klesajici pojistna castka dle urok/i);
  if (deathInterest != null) {
    riskFields.death2Amount = String(deathInterest);
    riskFields.death2Type = "klesajici_urok";
  }
  const deathTerminal = findAmountAfter(/smrt nebo terminalni/i);
  if (deathTerminal != null) {
    riskFields.deathTerminalAmount = String(deathTerminal);
  }

  // Invalidity – konstantní
  const invConst3 = findAmountAfter(/invalidita iii.*konstantni/i);
  const invConst2 = findAmountAfter(/invalidita ii.*konstantni/i);
  const invConst1 = findAmountAfter(/invalidita i.*konstantni/i);
  if (invConst1 != null || invConst2 != null || invConst3 != null) {
    riskFields.invalidityAType = "konstantni";
    if (invConst1 != null) riskFields.invalidityA1 = String(invConst1);
    if (invConst2 != null) riskFields.invalidityA2 = String(invConst2);
    if (invConst3 != null) riskFields.invalidityA3 = String(invConst3);
  }

  // Invalidity – lineárně klesající
  const invLin3 = findAmountAfter(/invalidita iii.*linear/i);
  const invLin2 = findAmountAfter(/invalidita ii.*linear/i);
  const invLin1 = findAmountAfter(/invalidita i.*linear/i);
  if (invLin1 != null || invLin2 != null || invLin3 != null) {
    riskFields.invalidityAType = "klesajici";
    if (invLin1 != null) riskFields.invalidityA1 = String(invLin1);
    if (invLin2 != null) riskFields.invalidityA2 = String(invLin2);
    if (invLin3 != null) riskFields.invalidityA3 = String(invLin3);
  }

  // Invalidity – dle úroku
  const invInt3 = findAmountAfter(/invalidita iii.*dle uroku/i);
  const invInt2 = findAmountAfter(/invalidita ii.*dle uroku/i);
  const invInt1 = findAmountAfter(/invalidita i.*dle uroku/i);
  if (invInt1 != null || invInt2 != null || invInt3 != null) {
    riskFields.invalidityBType = "klesajici_urok";
    if (invInt1 != null) riskFields.invalidityB1 = String(invInt1);
    if (invInt2 != null) riskFields.invalidityB2 = String(invInt2);
    if (invInt3 != null) riskFields.invalidityB3 = String(invInt3);
  }

  // Invalidita s výplatou důchodu
  const invPension = findAmountAfter(/invalidity s vyplatou duchodu/i);
  if (invPension != null) {
    riskFields.invalidityPension = true;
  }

  // Závažná onemocnění
  const criticalConst = findAmountAfter(/zavazna onemocneni.*konstantni/i);
  const criticalLinear = findAmountAfter(/zavazna onemocneni.*linear/i);
  const criticalInterest = findAmountAfter(/zavazna onemocneni.*dle uroku/i);
  if (criticalConst != null) {
    riskFields.criticalType = "konstantni";
    riskFields.criticalAmount = String(criticalConst);
  } else if (criticalLinear != null) {
    riskFields.criticalType = "klesajici";
    riskFields.criticalAmount = String(criticalLinear);
  } else if (criticalInterest != null) {
    riskFields.criticalType = "klesajici_urok";
    riskFields.criticalAmount = String(criticalInterest);
  }

  const childSurgery = findAmountAfter(/operace ditete/i);
  if (childSurgery != null) riskFields.childSurgeryAmount = String(childSurgery);
  const vaccination = findAmountAfter(/nasledky ockovani/i);
  if (vaccination != null) riskFields.vaccinationCompAmount = String(vaccination);
  const diabetes = findAmountAfter(/cukrovka/i);
  if (diabetes != null) riskFields.diabetesAmount = String(diabetes);

  // Úrazová část
  const deathAcc = findAmountAfter(/smrt urazem/i);
  if (deathAcc != null) riskFields.deathAccidentAmount = String(deathAcc);

  const injuryPermanent = findAmountAfter(/trvale nasledky urazu/i);
  if (injuryPermanent != null) riskFields.injuryPermanentAmount = String(injuryPermanent);

  const accidentDaily = findAmountAfter(/denni odskodne za dobu leceni urazu/i);
  if (accidentDaily != null) riskFields.accidentDailyBenefit = String(accidentDaily);

  // Hospitalizace – nemoc / úraz zvlášť
  const hospitalLines = asciiLines.filter((l) => /denni odskodne za pobyt v nemocnici/.test(l));
  for (const line of hospitalLines) {
    const val = parseAmount(line.match(/([\d\s]+)k[cč]/)?.[1]);
    const isIllness = /nemoc/.test(line);
    const isInjury = /uraz/.test(line);
    if (isIllness && val != null) riskFields.hospitalizationIllnessAmount = String(val);
    if (isInjury && val != null) riskFields.hospitalizationInjuryAmount = String(val);
    if (!isIllness && !isInjury && val != null) {
      if (!riskFields.hospitalizationIllnessAmount) riskFields.hospitalizationIllnessAmount = String(val);
      else if (!riskFields.hospitalizationInjuryAmount) riskFields.hospitalizationInjuryAmount = String(val);
    }
  }
  if (!hospitalLines.length) {
    delete (riskFields as any).hospitalizationAmount;
  }

  // Pracovní neschopnost
  const workIncapacity = findAmountAfter(/denni odskodne za pracovni neschopnost(?!.*uraz)/i);
  if (workIncapacity != null) {
    riskFields.workIncapacityAmount = String(workIncapacity);
    const startMatch = asciiLines.find((l) => /plneni od/.test(l) && /dne/.test(l));
    const day = startMatch?.match(/(\d+)\./)?.[1];
    if (day) riskFields.workIncapacityStart = day;
    if (asciiLines.some((l) => /zpetne/.test(l))) riskFields.workIncapacityBackpay = "zpetne";
    if (asciiLines.some((l) => /nezpetne/.test(l))) riskFields.workIncapacityBackpay = "nezpetne";
  }
  if (asciiLines.some((l) => /denni odskodne za pracovni neschopnost.*nemoc/i.test(l))) {
    riskFields.workIncapacityIllness = true;
  }
  if (asciiLines.some((l) => /denni odskodne za pracovni neschopnost.*uraz/i.test(l))) {
    riskFields.workIncapacityInjury = true;
  }
  // zkus vytáhnout start/backpay přímo z řádků PN
  const pnLineIdx = asciiLines.findIndex((l) => /denni odskodne za pracovni neschopnost/.test(l));
  if (pnLineIdx !== -1) {
    const look = asciiLines.slice(pnLineIdx, pnLineIdx + 4).join(" ");
    const m = look.match(/plneni od\s*(\d{1,3})/);
    if (m?.[1]) riskFields.workIncapacityStart = riskFields.workIncapacityStart ?? m[1];
    if (/zpetne/.test(look)) riskFields.workIncapacityBackpay = riskFields.workIncapacityBackpay ?? "zpetne";
    if (/nezpetne/.test(look)) riskFields.workIncapacityBackpay = riskFields.workIncapacityBackpay ?? "nezpetne";
    const amt = look.match(/([\d\s]+)k[cč]/);
    const amtVal = amt?.[1] ? parseAmount(amt[1]) : null;
    if (amtVal != null && !riskFields.workIncapacityAmount) {
      riskFields.workIncapacityAmount = String(amtVal);
    }
  }
  if (!riskFields.workIncapacityStart) {
    const pnVariant = asciiLines.find((l) => /plneni od\s*\d{1,3}\.\s*dne/.test(l));
    const m = pnVariant?.match(/plneni od\s*(\d{1,3})/);
    if (m?.[1]) riskFields.workIncapacityStart = m[1];
    if (pnVariant?.includes("zpetne")) riskFields.workIncapacityBackpay = "zpetne";
    if (pnVariant?.includes("nezpetne")) riskFields.workIncapacityBackpay = "nezpetne";
  }
  if (!riskFields.workIncapacityAmount) {
    const pnAmtLine = asciiLines.find((l) => /denni odskodne za pracovni neschopnost/.test(l));
    const nums = pnAmtLine?.match(/\d{2,6}/g)?.map((n) => parseAmount(n) || null).filter((n): n is number => n != null);
    if (nums && nums.length > 0) {
      const nonDuration = nums.filter((n) => n >= 100);
      const candidate = nonDuration.length > 0 ? nonDuration[0] : nums[0];
      if (candidate != null) riskFields.workIncapacityAmount = String(candidate);
    }
  }
  if (!riskFields.workIncapacityAmount) {
    const illnessMatch = asciiText.match(/denni odskodne za pracovni neschopnost\s+nemoc[iy]?.{0,80}?(\d{1,3}).{0,30}?(\d{3,6})/i);
    const injuryMatch = asciiText.match(/denni odskodne za pracovni neschopnost\s+uraz.{0,80}?(\d{1,3}).{0,30}?(\d{3,6})/i);
    const pick = (m: RegExpMatchArray | null) => {
      if (!m) return null;
      const num1 = parseAmount(m[1]);
      const num2 = parseAmount(m[2]);
      const cand = num2 && num2 >= 100 ? num2 : num1;
      return cand ?? null;
    };
    const val = pick(illnessMatch) ?? pick(injuryMatch);
    if (val != null) riskFields.workIncapacityAmount = String(val);
  }

  // Explicitní dohledání částky PN z okolních řádků (číslo ve sloupci Pojistná částka)
  if (!riskFields.workIncapacityAmount) {
    for (let idx = 0; idx < asciiLines.length; idx++) {
      if (!/denni odskodne za pracovni neschopnost/.test(asciiLines[idx])) continue;
      const window = asciiLines.slice(idx, Math.min(idx + 6, asciiLines.length));
      const nums: number[] = [];
      for (const w of window) {
        if (isCurrency(w)) {
          const m = w.match(/([\d\s]+)k[cč]/);
          const v = parseAmount(m?.[1]);
          if (v != null) nums.push(v);
        } else if (isPureNumber(w)) {
          const v = parseAmount(w);
          if (v != null) nums.push(v);
        }
      }
      const nonDuration = nums.filter((n) => n >= 100);
      const candidate = nonDuration[0] ?? nums[0];
      if (candidate != null) {
        riskFields.workIncapacityAmount = String(candidate);
        break;
      }
    }
  }

  // Zproštění od placení – invalidita
  let waiverInvalidityFound = false;
  let waiverUnemploymentFound = false;
  if (
    asciiLines.some((l) => /zprosteni.*invalidn/i.test(l)) ||
    asciiText.includes("zprosteni z duvodu priznani invalidniho duchodu")
  ) {
    waiverInvalidityFound = true;
  }
  if (asciiLines.some((l) => /zprosteni.*ztrat[yu] zamestnani/i.test(l))) {
    waiverUnemploymentFound = true;
  }
  riskFields.waiverInvalidity = waiverInvalidityFound;
  riskFields.waiverUnemployment = waiverUnemploymentFound;

  // Péče a další připojištění
  const careDependency = findAmountAfter(/zavislost na peci/i);
  if (careDependency != null) riskFields.careDependencyAmount = String(careDependency);
  const specialAid = findAmountAfter(/prispevek na porizeni zvlastni pomucky/i);
  if (specialAid != null) {
    riskFields.specialAidAmount = String(specialAid);
  } else if (asciiLines.some((l) => /prispevek na porizeni zvlastni pomucky/i.test(l))) {
    // pokud částka není uvedena, nastav default 100000
    riskFields.specialAidAmount = "100000";
  }
  const caregiving = findAmountAfter(/celodenni osetrovani/i);
  if (caregiving != null) riskFields.caregivingAmount = String(caregiving);

  // Asistence a cestovní
  if (asciiLines.some((l) => /asistence .*cpp pomoc/i.test(l))) {
    riskFields.cppHelp = true;
  }
  if (asciiLines.some((l) => /cestovni pripojisteni/i.test(l))) {
    riskFields.travelInsurance = true;
  }

  // Odpovědnost
  const liabilityCitizen = findAmountAfter(/odpovednost obcana/i);
  if (liabilityCitizen != null) riskFields.liabilityCitizenLimit = String(liabilityCitizen);
  const liabilityEmployee = findAmountAfter(/odpovednost zamestnance/i);
  if (liabilityEmployee != null) riskFields.liabilityEmployeeLimit = String(liabilityEmployee);

  if (Object.keys(riskFields).length > 0) {
    riskFields.version = "neon_life";
    result.riskFields = riskFields;
  }

  if (risks.length > 0) {
    result.risks = risks;
  }

  return result;
}
