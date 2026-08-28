"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarRange,
  CircleDollarSign,
  Coins,
  Info,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { systemSansFont } from "@/lib/fonts";
import {
  PAYMENT_FREQUENCIES,
  calculateReplacement,
  type PaymentFrequency,
} from "./replacementCalculation";

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

const formatMoney = (value: number): string => moneyFormatter.format(value);

const formatDate = (value: string): string =>
  dateFormatter.format(new Date(`${value}T12:00:00.000Z`));

const parseAmount = (value: string): number | null => {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const frequencyLabel = (frequency: PaymentFrequency): string =>
  PAYMENT_FREQUENCIES.find((item) => item.id === frequency)?.label ?? "Roční";

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
    <fieldset>
      <legend className="text-sm font-bold text-slate-800">Frekvence placení</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {PAYMENT_FREQUENCIES.map((frequency) => {
          const active = value === frequency.id;
          return (
            <button
              key={frequency.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(frequency.id)}
              className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 ${
                active
                  ? "border-violet-600 bg-violet-600 text-white shadow-[0_8px_18px_rgba(124,58,237,0.22)]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
              }`}
              name={name}
            >
              {frequency.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ContractCard({
  kind,
  date,
  premium,
  frequency,
  onDateChange,
  onPremiumChange,
  onFrequencyChange,
}: {
  kind: "original" | "replacement";
  date: string;
  premium: string;
  frequency: PaymentFrequency;
  onDateChange: (value: string) => void;
  onPremiumChange: (value: string) => void;
  onFrequencyChange: (value: PaymentFrequency) => void;
}) {
  const original = kind === "original";
  const title = original ? "Původní smlouva" : "Nová smlouva";
  const description = original
    ? "Z této smlouvy se vypočítá nevyčerpané pojistné."
    : "Na její první pojistné se převede zůstatek."
  const accent = original ? "text-slate-700" : "text-violet-700";

  return (
    <section className="rounded-[28px] border border-white/90 bg-white/95 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.09)] sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            original ? "bg-slate-100 text-slate-700" : "bg-violet-100 text-violet-700"
          }`}
        >
          {original ? (
            <ReceiptText className="h-5 w-5" strokeWidth={2.2} />
          ) : (
            <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
          )}
        </span>
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${accent}`}>
            {original ? "Krok 1" : "Krok 2"}
          </p>
          <h2 className="mt-0.5 text-xl font-black tracking-[-0.02em] text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Datum počátku</span>
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-200/75"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Pojistné za jednu platbu</span>
          <span className="relative mt-2 block">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={premium}
              onChange={(event) => onPremiumChange(event.target.value)}
              placeholder={original ? "např. 18 158" : "např. 13 383"}
              className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 pr-12 text-base font-bold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-200/75"
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-black text-slate-500">
              Kč
            </span>
          </span>
        </label>

        <FrequencyPicker
          name={`${kind}-frequency`}
          value={frequency}
          onChange={onFrequencyChange}
        />
      </div>
    </section>
  );
}

export default function ContractReplacementPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const originalPremium = parseAmount(form.originalPremium);
  const replacementPremium = parseAmount(form.replacementPremium);
  const hasAllInputs =
    Boolean(form.originalStartDate) &&
    Boolean(form.replacementStartDate) &&
    originalPremium !== null &&
    replacementPremium !== null;

  const result = useMemo(() => {
    if (!hasAllInputs || originalPremium === null || replacementPremium === null) {
      return null;
    }
    return calculateReplacement({
      originalStartDate: form.originalStartDate,
      replacementStartDate: form.replacementStartDate,
      originalPremium,
      originalFrequency: form.originalFrequency,
      replacementPremium,
      replacementFrequency: form.replacementFrequency,
    });
  }, [form, hasAllInputs, originalPremium, replacementPremium]);

  const setField = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <AppLayout active="tools">
      <main className={`${pageFont.className} relative w-full overflow-visible px-2 pb-10 pt-2 sm:px-3`}>
        <div className="mx-auto max-w-6xl space-y-5 px-1 sm:px-2 lg:px-3">
          <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(135deg,#ffffff_0%,#f5f3ff_48%,#ecfeff_100%)] px-5 py-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:px-8 sm:py-9">
            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-300/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/85 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-violet-800">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Kalkulačka převodu pojistného
                </span>
                <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Náhrada smlouvy
                </h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg">
                  Spočítej, kolik nevyčerpaného pojistného se převede z původní
                  smlouvy a zda na nové smlouvě vznikne přeplatek, nebo doplatek.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm(EXAMPLE_FORM)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
                >
                  <CircleDollarSign className="h-4 w-4" />
                  Načíst vzorový příklad
                </button>
                <button
                  type="button"
                  onClick={() => setForm(EMPTY_FORM)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Vymazat
                </button>
              </div>
            </div>
          </section>

          <section className="relative rounded-[32px] border border-violet-100 bg-[linear-gradient(180deg,rgba(250,250,255,0.98)_0%,rgba(245,243,255,0.92)_100%)] p-3 shadow-[0_24px_70px_rgba(88,28,135,0.1)] sm:p-5">
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-sm font-semibold leading-6 text-cyan-950">
              <Info className="mt-0.5 h-4.5 w-4.5 shrink-0" strokeWidth={2.2} />
              <p>
                Obě smlouvy se počítají jako roční. Frekvence určuje pouze výši a
                délku jedné platby — měsíční, čtvrtletní, pololetní nebo roční.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <ContractCard
                kind="original"
                date={form.originalStartDate}
                premium={form.originalPremium}
                frequency={form.originalFrequency}
                onDateChange={(value) => setField("originalStartDate", value)}
                onPremiumChange={(value) => setField("originalPremium", value)}
                onFrequencyChange={(value) => setField("originalFrequency", value)}
              />

              <span className="mx-auto inline-flex h-11 w-11 rotate-90 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_12px_28px_rgba(124,58,237,0.3)] lg:rotate-0">
                <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
              </span>

              <ContractCard
                kind="replacement"
                date={form.replacementStartDate}
                premium={form.replacementPremium}
                frequency={form.replacementFrequency}
                onDateChange={(value) => setField("replacementStartDate", value)}
                onPremiumChange={(value) => setField("replacementPremium", value)}
                onFrequencyChange={(value) => setField("replacementFrequency", value)}
              />
            </div>
          </section>

          {!hasAllInputs ? (
            <section className="rounded-[28px] border border-dashed border-violet-200 bg-white/85 px-6 py-9 text-center shadow-[0_16px_44px_rgba(88,28,135,0.07)]">
              <Coins className="mx-auto h-8 w-8 text-violet-500" strokeWidth={1.9} />
              <h2 className="mt-3 text-lg font-black text-slate-950">Doplň údaje obou smluv</h2>
              <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-600">
                Po zadání obou dat, pojistného a frekvence placení se výsledek
                zobrazí automaticky.
              </p>
            </section>
          ) : result && !result.ok ? (
            <section className="rounded-[26px] border border-amber-200 bg-amber-50 px-5 py-5 text-amber-950 shadow-[0_16px_40px_rgba(146,64,14,0.08)]">
              <h2 className="font-black">Zkontroluj zadané údaje</h2>
              <p className="mt-1 text-sm leading-6">
                {result.error === "replacement-before-original"
                  ? "Počátek nové smlouvy nemůže být před počátkem původní smlouvy."
                  : "Datum nebo pojistné není zadané ve správném formátu."}
              </p>
            </section>
          ) : result?.ok ? (
            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.10)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-7">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">
                    Souhrn kalkulace
                  </p>
                  <h2 className="mt-0.5 text-xl font-black text-slate-950">Výsledek náhrady</h2>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    result.balanceType === "surcharge"
                      ? "bg-amber-100 text-amber-800"
                      : result.balanceType === "overpayment"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {result.balanceType === "surcharge"
                    ? "Vzniká doplatek"
                    : result.balanceType === "overpayment"
                      ? "Vzniká přeplatek"
                      : "Pojistné je vyrovnané"}
                </span>
              </div>

              <div className="p-5 sm:p-7">
                <div className="grid grid-cols-1 gap-2 rounded-[22px] bg-slate-50 p-2 md:grid-cols-3 lg:grid-cols-[1fr_28px_1fr_28px_1.08fr] lg:items-stretch">
                  <div className="rounded-[18px] border border-slate-200 bg-white p-4 sm:p-5">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                      Nové pojistné
                    </p>
                    <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">
                      {formatMoney(result.replacementPremium)}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold text-slate-500">
                      {frequencyLabel(form.replacementFrequency)} platba
                    </p>
                  </div>

                  <span
                    className="hidden items-center justify-center text-xl font-semibold text-slate-300 lg:flex"
                    aria-hidden="true"
                  >
                    −
                  </span>

                  <div className="rounded-[18px] border border-violet-200 bg-white p-4 sm:p-5">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-violet-600">
                      Převede se
                    </p>
                    <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-violet-950 sm:text-3xl">
                      {formatMoney(result.transferredPremium)}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold text-violet-600">
                      {new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(
                        result.unusedShare * 100
                      )} % z poslední platby
                    </p>
                  </div>

                  <span
                    className="hidden items-center justify-center text-xl font-semibold text-slate-300 lg:flex"
                    aria-hidden="true"
                  >
                    =
                  </span>

                  <div
                    className={`rounded-[18px] border p-4 sm:p-5 ${
                      result.balanceType === "surcharge"
                        ? "border-amber-300 bg-amber-50"
                        : result.balanceType === "overpayment"
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-300 bg-white"
                    }`}
                  >
                    <p
                      className={`text-xs font-black uppercase tracking-[0.1em] ${
                        result.balanceType === "surcharge"
                          ? "text-amber-800"
                          : result.balanceType === "overpayment"
                            ? "text-emerald-800"
                            : "text-slate-600"
                      }`}
                    >
                      {result.balanceType === "surcharge"
                        ? "Klient doplatí"
                        : result.balanceType === "overpayment"
                          ? "Klientovi zbývá"
                          : "Vyrovnáno"}
                    </p>
                    <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">
                      {formatMoney(Math.abs(result.balance))}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold text-slate-500">
                      Po započtení převodu
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[18px] border border-slate-200 p-4 sm:p-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">Rozdělení původní platby</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Celkem {formatMoney(originalPremium ?? 0)}
                        </p>
                      </div>
                      <p className="text-xs font-semibold text-slate-500">
                        {result.nominalElapsedDays} dní vyčerpáno ·{" "}
                        {result.nominalPeriodDays - result.nominalElapsedDays} dní zbývá
                      </p>
                    </div>

                    <div
                      className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(
                        (1 - result.unusedShare) * 100
                      )} procent zúčtováno a ${new Intl.NumberFormat("cs-CZ", {
                        maximumFractionDigits: 1,
                      }).format(result.unusedShare * 100)} procent převedeno`}
                    >
                      <span
                        className="bg-slate-300"
                        style={{ width: `${(1 - result.unusedShare) * 100}%` }}
                      />
                      <span className="flex-1 bg-violet-500" />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Zúčtováno</p>
                        <p className="mt-0.5 font-black text-slate-800">
                          {formatMoney((originalPremium ?? 0) - result.transferredPremium)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-violet-600">Převádí se</p>
                        <p className="mt-0.5 font-black text-violet-800">
                          {formatMoney(result.transferredPremium)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <dl className="overflow-hidden rounded-[18px] border border-slate-200">
                    <div className="border-b border-slate-200 p-4">
                      <dt className="flex items-center gap-2 text-xs font-bold text-slate-500">
                        <CalendarRange className="h-4 w-4" /> Konec původní smlouvy
                      </dt>
                      <dd className="mt-1.5 font-black text-slate-950">
                        {formatDate(result.originalEndDate)}
                      </dd>
                    </div>
                    <div className="p-4">
                      <dt className="flex items-center gap-2 text-xs font-bold text-slate-500">
                        <ReceiptText className="h-4 w-4" /> Poslední placené období
                      </dt>
                      <dd className="mt-1.5 text-sm font-black text-slate-950">
                        {formatDate(result.paidPeriodStartDate)} –{" "}
                        {formatDate(result.paidPeriodEndDate)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-5 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-600">
                  <p className="font-black text-slate-800">Jak jsme k výsledku došli</p>
                  <p className="mt-1">
                    Z posledního{" "}
                    {frequencyLabel(form.originalFrequency).toLocaleLowerCase("cs-CZ")}ho
                    pojistného bylo vyčerpáno {result.nominalElapsedDays} z{" "}
                    {result.nominalPeriodDays} modelových dní. Nevyčerpaná část je proto{" "}
                    {formatMoney(originalPremium ?? 0)} ×{" "}
                    {new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(
                      result.unusedShare * 100
                    )} % = {formatMoney(result.transferredPremium)} po zaokrouhlení.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <aside className="flex items-start gap-3 rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm leading-6 text-amber-950 shadow-[0_14px_34px_rgba(146,64,14,0.08)]">
            <Info className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.1} />
            <p>
              Kalkulačka používá model pojistných měsíců po 30 dnech, který odpovídá
              uvedenému vzorovému příkladu. Výsledek je orientační — konkrétní pojišťovna
              může použít jinou metodiku nebo zaokrouhlení. Před sdělením finální částky
              klientovi ji ověř v podmínkách pojišťovny.
            </p>
          </aside>
        </div>
      </main>
    </AppLayout>
  );
}
