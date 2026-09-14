"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Calculator,
  CalendarRange,
  Check,
  ChevronDown,
  Coins,
  FileText,
  Info,
  Play,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { systemSansFont } from "@/lib/fonts";
import {
  PAYMENT_FREQUENCIES,
  calculateReplacement,
  type PaymentFrequency,
  type ReplacementCalculation,
} from "./replacementCalculation";
import styles from "./replacement.module.css";

const pageFont = systemSansFont;

type FormState = {
  originalStartDate: string;
  originalPremium: string;
  originalFrequency: PaymentFrequency;
  replacementStartDate: string;
  replacementPremium: string;
  replacementFrequency: PaymentFrequency;
};

const EMPTY_FORM: FormState = {
  originalStartDate: "",
  originalPremium: "",
  originalFrequency: "annual",
  replacementStartDate: "",
  replacementPremium: "",
  replacementFrequency: "annual",
};

const EXAMPLE_FORM: FormState = {
  originalStartDate: "2025-03-25",
  originalPremium: "18158",
  originalFrequency: "annual",
  replacementStartDate: "2025-08-18",
  replacementPremium: "13383",
  replacementFrequency: "annual",
};

const moneyFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const pragueDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Prague",
});

const formatMoney = (value: number): string => moneyFormatter.format(value);

const formatDate = (value: string): string =>
  dateFormatter.format(new Date(`${value}T12:00:00.000Z`));

const getPragueTodayIso = (): string => {
  const parts = Object.fromEntries(
    pragueDateFormatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dayCountLabel = (value: number): string => {
  const absoluteValue = Math.abs(value);
  if (absoluteValue === 1) return "den";
  if (absoluteValue >= 2 && absoluteValue <= 4) return "dny";
  return "dní";
};

const parseAmount = (value: string): number | null => {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const frequencyLabel = (frequency: PaymentFrequency): string =>
  PAYMENT_FREQUENCIES.find((item) => item.id === frequency)?.label ?? "Roční";

const percentFormatter = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 });

function FrequencyPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: PaymentFrequency;
  onChange: (value: PaymentFrequency) => void;
}) {
  return (
    <fieldset className={styles.frequency}>
      <legend>Frekvence placení</legend>
      <div className={styles.frequencyOptions}>
        {PAYMENT_FREQUENCIES.map((frequency) => (
          <label key={frequency.id}>
            <input
              type="radio"
              name={name}
              value={frequency.id}
              checked={value === frequency.id}
              onChange={() => onChange(frequency.id)}
            />
            <span>{frequency.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ContractCard({
  kind,
  date,
  premium,
  frequency,
  dateError,
  onDateChange,
  onPremiumChange,
  onFrequencyChange,
}: {
  kind: "original" | "replacement";
  date: string;
  premium: string;
  frequency: PaymentFrequency;
  dateError?: string;
  onDateChange: (value: string) => void;
  onPremiumChange: (value: string) => void;
  onFrequencyChange: (value: PaymentFrequency) => void;
}) {
  const original = kind === "original";
  const invalidPremium = premium.trim() !== "" && parseAmount(premium) === null;

  return (
    <section className={styles.contract} data-kind={kind} aria-labelledby={`${kind}-heading`}>
      <header className={styles.contractHeader}>
        <span className={styles.contractIcon}>
          {original ? <ReceiptText size={21} aria-hidden="true" /> : <ShieldCheck size={21} aria-hidden="true" />}
        </span>
        <div>
          <p className={styles.eyebrow}>{original ? "Krok 01 · Odkud" : "Krok 02 · Kam"}</p>
          <h2 id={`${kind}-heading`}>{original ? "Původní smlouva" : "Nová smlouva"}</h2>
        </div>
      </header>
      <p className={styles.contractDescription}>
        {original ? "Pojistné, ze kterého se převede zůstatek." : "Pojistné, na které se zůstatek započítá."}
      </p>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${kind}-date`}>Datum počátku</label>
          <input
            id={`${kind}-date`}
            type="date"
            value={date}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? `${kind}-date-error` : undefined}
            onChange={(event) => onDateChange(event.target.value)}
          />
          {dateError && <p className={styles.fieldError} id={`${kind}-date-error`}>{dateError}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${kind}-premium`}>Pojistné za jednu platbu</label>
          <div className={styles.amountInput}>
            <input
              id={`${kind}-premium`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={premium}
              aria-invalid={invalidPremium}
              aria-describedby={invalidPremium ? `${kind}-premium-error` : undefined}
              onChange={(event) => onPremiumChange(event.target.value)}
              placeholder={original ? "18 158" : "13 383"}
            />
            <span aria-hidden="true">Kč</span>
          </div>
          {invalidPremium && (
            <p className={styles.fieldError} id={`${kind}-premium-error`}>Zadej částku větší než 0 Kč.</p>
          )}
        </div>
        <FrequencyPicker name={`${kind}-frequency`} value={frequency} onChange={onFrequencyChange} />
      </div>
      <div className={styles.contractFooter}>
        <span className={styles.smallDot} aria-hidden="true" />
        {frequencyLabel(frequency)} platba
        <span>{frequency === "monthly" ? "každý měsíc"
          : frequency === "quarterly" ? "každé 3 měsíce"
            : frequency === "semiannual" ? "každých 6 měsíců" : "každých 12 měsíců"}</span>
      </div>
    </section>
  );
}

function CalculationDetails({
  result,
  form,
  originalPremium,
  referenceDate,
}: {
  result: ReplacementCalculation;
  form: FormState;
  originalPremium: number;
  referenceDate: string;
}) {
  const elapsedSharePercent = (1 - result.unusedShare) * 100;
  const unusedPercent = percentFormatter.format(result.unusedShare * 100);

  return (
    <div className={styles.detailsGrid}>
      <section className={styles.detailCard} aria-labelledby="distribution-heading">
        <header className={styles.detailHeader}>
          <span className={styles.detailIcon}><Coins size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="distribution-heading">Rozdělení původní platby</h2>
            <p>Zaplacené pojistné {formatMoney(originalPremium)}</p>
          </div>
        </header>
        <div className={styles.distributionValues}>
          <div>
            <p><span className={styles.usedDot} />Zúčtováno</p>
            <strong>{formatMoney(originalPremium - result.transferredPremium)}</strong>
            <span>{result.nominalElapsedDays} modelových dní</span>
          </div>
          <div>
            <p><span className={styles.transferDot} />Převádí se</p>
            <strong>{formatMoney(result.transferredPremium)}</strong>
            <span>{result.nominalPeriodDays - result.nominalElapsedDays} modelových dní</span>
          </div>
        </div>
        <div
          className={styles.distributionBar}
          role="img"
          aria-label={`${percentFormatter.format(elapsedSharePercent)} procent zúčtováno a ${unusedPercent} procent převedeno`}
        >
          <span style={{ width: `${elapsedSharePercent}%` }} />
          <span style={{ width: `${result.unusedShare * 100}%` }} />
        </div>
        <div className={styles.periodDates}>
          <p>Počátek období<strong>{formatDate(result.paidPeriodStartDate)}</strong></p>
          <p>Datum náhrady<strong>{formatDate(form.replacementStartDate)}</strong></p>
          <p>Původní konec<strong>{formatDate(result.paidPeriodEndDate)}</strong></p>
        </div>
        <details className={styles.methodology}>
          <summary>Jak se převod počítá <ChevronDown size={15} aria-hidden="true" /></summary>
          <p>
            Z aktuálně zaplaceného období bylo vyčerpáno {result.nominalElapsedDays} z {result.nominalPeriodDays} modelových dní.
            Nevyčerpaných {unusedPercent} % původní platby se převede na novou smlouvu.
          </p>
          <div className={styles.formula}>
            {formatMoney(originalPremium)} × {unusedPercent} % ≈ <strong>{formatMoney(result.transferredPremium)}</strong>
          </div>
          <p>Převod se počítá z přesného podílu a zaokrouhluje na celé koruny.</p>
        </details>
      </section>

      <section className={styles.detailCard} aria-labelledby="payment-heading">
        <header className={styles.detailHeader}>
          <span className={styles.detailIcon}><CalendarRange size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="payment-heading">Nový platební cyklus</h2>
            <p>Nejbližší pravidelné platby k {formatDate(referenceDate)}</p>
          </div>
        </header>
        <div className={styles.paymentDates}>
          <div>
            <span>Další platba původně</span>
            <strong>{formatDate(result.originalNextPaymentDate)}</strong>
            <p>{frequencyLabel(form.originalFrequency)} platba</p>
          </div>
          <ArrowRight size={20} aria-hidden="true" />
          <div>
            <span>Další platba nově</span>
            <strong>{formatDate(result.replacementNextPaymentDate)}</strong>
            <p>{frequencyLabel(form.replacementFrequency)} platba</p>
          </div>
        </div>
        <p className={styles.paymentShift} data-earlier={result.paymentShiftDays < 0}>
          <CalendarRange size={16} aria-hidden="true" />
          {result.paymentShiftDays > 0
            ? `Další platba o ${result.paymentShiftDays} ${dayCountLabel(result.paymentShiftDays)} později`
            : result.paymentShiftDays < 0
              ? `Další platba o ${Math.abs(result.paymentShiftDays)} ${dayCountLabel(result.paymentShiftDays)} dříve`
              : "Termín další platby se nemění"}
        </p>
        <p className={styles.paymentExplanation}>
          {result.balanceType === "surcharge" ? (
            <>Doplatek <strong>{formatMoney(result.balance)}</strong> spolu s převodem pokryje první platbu nové smlouvy.</>
          ) : result.balanceType === "overpayment" ? (
            <>Převod pokryje první platbu nové smlouvy a klientovi zbývá <strong>{formatMoney(Math.abs(result.balance))}</strong>.</>
          ) : (
            <>Převod přesně pokryje první platbu nové smlouvy.</>
          )}
        </p>
      </section>
    </div>
  );
}

export default function ContractReplacementPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [referenceDate] = useState(getPragueTodayIso);
  const originalPremium = parseAmount(form.originalPremium);
  const replacementPremium = parseAmount(form.replacementPremium);
  const originalComplete = Boolean(form.originalStartDate) && originalPremium !== null;
  const replacementComplete = Boolean(form.replacementStartDate) && replacementPremium !== null;
  const hasAllInputs = originalComplete && replacementComplete;
  const hasChanges = Object.keys(EMPTY_FORM).some(
    (key) => form[key as keyof FormState] !== EMPTY_FORM[key as keyof FormState]
  );

  const result = useMemo(() => {
    if (!hasAllInputs || originalPremium === null || replacementPremium === null) return null;
    return calculateReplacement({
      originalStartDate: form.originalStartDate,
      replacementStartDate: form.replacementStartDate,
      referenceDate,
      originalPremium,
      originalFrequency: form.originalFrequency,
      replacementPremium,
      replacementFrequency: form.replacementFrequency,
    });
  }, [form, hasAllInputs, originalPremium, referenceDate, replacementPremium]);

  const setField = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const datesReversed = Boolean(form.originalStartDate && form.replacementStartDate)
    && form.replacementStartDate < form.originalStartDate;
  const balanceLabel = result?.ok
    ? result.balanceType === "surcharge" ? "Klient doplatí"
      : result.balanceType === "overpayment" ? "Klientovi zbývá" : "Pojistné je vyrovnané"
    : "Výsledek náhrady";

  return (
    <AppLayout active="tools">
      <div className={`${pageFont.className} ${styles.page}`}>
        <div className={styles.container}>
          <header className={styles.hero}>
            <div>
              <p className={styles.eyebrow}><ArrowRightLeft size={14} aria-hidden="true" /> Kalkulačka převodu pojistného</p>
              <h1>Náhrada smlouvy<span className={styles.titleDot}>.</span></h1>
              <p className={styles.intro}>
                Ze staré smlouvy na novou. Přehledně zjisti, kolik pojistného se převede a kolik klient doplatí.
              </p>
            </div>
            <div className={styles.heroFlow} aria-hidden="true">
              <div><FileText size={22} /><span>Původní smlouva</span></div>
              <span className={styles.flowArrow}><ArrowRight size={20} /></span>
              <div><ShieldCheck size={22} /><span>Nová smlouva</span></div>
            </div>
          </header>

          <div className={styles.toolbar}>
            <p><span className={styles.liveDot} aria-hidden="true" />Výpočet se aktualizuje automaticky</p>
            <div className={styles.actions}>
              <button type="button" className={styles.exampleButton} onClick={() => setForm(EXAMPLE_FORM)}>
                <Play size={14} aria-hidden="true" /> Vzorový příklad
              </button>
              <button type="button" className={styles.resetButton} disabled={!hasChanges} onClick={() => setForm(EMPTY_FORM)}>
                <RefreshCcw size={14} aria-hidden="true" /> Vymazat
              </button>
            </div>
          </div>

          <div className={styles.workspace}>
            <div className={styles.contracts}>
              <ContractCard
                kind="original"
                date={form.originalStartDate}
                premium={form.originalPremium}
                frequency={form.originalFrequency}
                onDateChange={(value) => setField("originalStartDate", value)}
                onPremiumChange={(value) => setField("originalPremium", value)}
                onFrequencyChange={(value) => setField("originalFrequency", value)}
              />
              <span className={styles.contractArrow} aria-hidden="true"><ArrowRight size={17} /></span>
              <ContractCard
                kind="replacement"
                date={form.replacementStartDate}
                premium={form.replacementPremium}
                frequency={form.replacementFrequency}
                dateError={datesReversed ? "Nová smlouva nemůže začít před původní." : undefined}
                onDateChange={(value) => setField("replacementStartDate", value)}
                onPremiumChange={(value) => setField("replacementPremium", value)}
                onFrequencyChange={(value) => setField("replacementFrequency", value)}
              />
            </div>

            <section className={styles.summary} aria-labelledby="result-heading">
              <header className={styles.summaryHeader}>
                <Calculator size={18} aria-hidden="true" />
                <h2 id="result-heading">Souhrn náhrady</h2>
                <span className={styles.summaryStatus}>{result?.ok ? "Spočítáno" : "Náhled"}</span>
              </header>
              <div className={styles.summaryLines}>
                <div><span>Nové pojistné</span><strong>{replacementPremium !== null ? formatMoney(Math.round(replacementPremium)) : "— Kč"}</strong></div>
                <div className={styles.transferLine}><span><span aria-hidden="true">−</span> Převod z původní smlouvy</span><strong>{result?.ok ? formatMoney(result.transferredPremium) : "— Kč"}</strong></div>
              </div>
              <div className={styles.balance} data-tone={result?.ok ? result.balanceType : "empty"}>
                <div className={styles.balanceLabel}><span>{balanceLabel}</span>{result?.ok && <Check size={17} aria-hidden="true" />}</div>
                <p className={styles.balanceAmount}>{result?.ok ? formatMoney(Math.abs(result.balance)) : <><span>—</span> Kč</>}</p>
                <p className={styles.balanceCaption}>
                  {result?.ok ? "Po započtení nevyčerpaného pojistného" : "Doplň údaje smluv a zjisti výslednou částku."}
                </p>
              </div>
              <div className={styles.summaryBottom}>
                {result?.ok ? (
                  <div className={styles.transferNote}>
                    <span><ArrowRightLeft size={17} aria-hidden="true" /></span>
                    <p>Převede se <strong>{percentFormatter.format(result.unusedShare * 100)} %</strong> z poslední platby původní smlouvy.</p>
                  </div>
                ) : result && !result.ok ? (
                  <div className={styles.resultError} role="alert">
                    <Info size={17} aria-hidden="true" />
                    <p><strong>Zkontroluj zadané údaje</strong>{result.error === "replacement-before-original"
                      ? "Počátek nové smlouvy musí být stejný nebo pozdější než počátek původní."
                      : "Datum nebo pojistné není ve správném formátu."}</p>
                  </div>
                ) : (
                  <div className={styles.checklist}>
                    <p>Pro výpočet potřebuješ</p>
                    <div data-complete={originalComplete}><span>{originalComplete ? <Check size={12} aria-hidden="true" /> : "1"}</span>Údaje původní smlouvy</div>
                    <div data-complete={replacementComplete}><span>{replacementComplete ? <Check size={12} aria-hidden="true" /> : "2"}</span>Údaje nové smlouvy</div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <p className={styles.screenReaderOnly} role="status" aria-atomic="true">
            {result?.ok ? `${balanceLabel}: ${formatMoney(Math.abs(result.balance))}. Převádí se ${formatMoney(result.transferredPremium)}.` : "Pro výpočet doplň platné údaje obou smluv."}
          </p>

          {result?.ok && originalPremium !== null && (
            <CalculationDetails result={result} form={form} originalPremium={originalPremium} referenceDate={referenceDate} />
          )}

          <aside className={styles.notice}>
            <Info size={17} aria-hidden="true" />
            <p><strong>Orientační výpočet.</strong> Počítáme s pojistnými měsíci po 30 dnech.
              Konkrétní pojišťovna může použít jinou metodiku nebo zaokrouhlení.
              Finální částku pro klienta ověř v jejích podmínkách.</p>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
