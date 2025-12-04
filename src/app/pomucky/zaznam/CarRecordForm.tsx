// src/app/pomucky/zaznam/CarRecordForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "srovnavac" | "portal";

const LIABILITY_LIMITS = [
  "50 / 50 mil. Kč",
  "70 / 70 mil. Kč",
  "100 / 100 mil. Kč",
  "150 / 150 mil. Kč",
  "200 / 200 mil. Kč",
  "250 / 250 mil. Kč",
];

const ANNUAL_MILEAGE = [
  "Do 5 000",
  "6 000",
  "7 000",
  "8 000",
  "9 000",
  "10 000",
  "11 000",
  "12 000",
  "13 000",
  "14 000",
  "15 000",
  "16 000",
  "17 000",
  "18 000",
  "19 000",
  "20 000",
  "21 000",
  "22 000",
  "23 000",
  "24 000",
  "25 000",
  "Nad 25 000",
];

const DEDUCTIBLES = [
  "2 000 Kč",
  "3 000 Kč",
  "5 000 Kč",
  "10 000 Kč",
  "20 000 Kč",
  "25 000 Kč",
  "50 000 Kč",
  "2 % min. 2 000 Kč",
  "3 % min. 3 000 Kč",
  "5 % min. 5 000 Kč",
  "10 % min. 10 000 Kč",
  "15 % min. 15 000 Kč",
  "20 % min. 20 000 Kč",
  "20 % min. 50 000 Kč",
  "30 % min. 50 000 Kč",
];

const ASSISTANCE_LEVELS = [
  "Základní",
  "Nižší střední",
  "Vyšší střední",
  "Nejvyšší",
];

const OWN_DAMAGE_LEVELS = ["Malá škoda", "Velká / totální škoda"];

type GlassSwitchProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

function GlassSwitch({ label, checked, onChange }: GlassSwitchProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
        checked
          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-100"
          : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] ${
          checked
            ? "border-emerald-300 bg-emerald-400/80 text-slate-900"
            : "border-white/40"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      <span>{label}</span>
    </button>
  );
}

type PillPickerProps = {
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
};

function PillPicker({ value, options, onChange }: PillPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3 py-1.5 text-xs sm:text-sm transition ${
              active
                ? "border-sky-400/80 bg-sky-500/20 text-sky-50"
                : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function CarRecordForm() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("srovnavac");

  const [hasLiability, setHasLiability] = useState(true);
  const [liabilityLimit, setLiabilityLimit] = useState<string | null>(
    "100 / 100 mil. Kč"
  );

  const [hasCasco, setHasCasco] = useState(false);
  const [cascoAmount, setCascoAmount] = useState("");
  const [cascoWithVat, setCascoWithVat] = useState<"sDPH" | "bezDPH">("sDPH");
  const [cascoDeductible, setCascoDeductible] = useState<string | null>(null);

  const [annualMileage, setAnnualMileage] = useState<string | null>(null);

  const [collisionAnimal, setCollisionAnimal] = useState(false);
  const [collisionAnimalLimit, setCollisionAnimalLimit] = useState("");

  const [animalDamage, setAnimalDamage] = useState(false);
  const [animalDamageLimit, setAnimalDamageLimit] = useState("");

  const [naturalHazard, setNaturalHazard] = useState(false);
  const [naturalHazardLimit, setNaturalHazardLimit] = useState("");

  const [glass, setGlass] = useState(false);
  const [glassLimit, setGlassLimit] = useState("");

  const [theft, setTheft] = useState(false);
  const [theftLimit, setTheftLimit] = useState("");

  const [vandalism, setVandalism] = useState(false);
  const [vandalismLimit, setVandalismLimit] = useState("");

  const [replacementCar, setReplacementCar] = useState(false);

  const [assistance, setAssistance] = useState(false);
  const [assistanceLevel, setAssistanceLevel] = useState<string | null>(null);

  const [luggage, setLuggage] = useState(false);
  const [luggageLimit, setLuggageLimit] = useState("");

  const [ownDamage, setOwnDamage] = useState(false);
  const [ownDamageLevel, setOwnDamageLevel] = useState<string | null>(null);

  // slevy
  const [discountCppProfi, setDiscountCppProfi] = useState(false);
  const [discountKoopSupport, setDiscountKoopSupport] = useState(false);
  const [discountOnlyCz, setDiscountOnlyCz] = useState(false);
  const [discountCsobBa, setDiscountCsobBa] = useState(false);
  const [discountSlaviaEmail, setDiscountSlaviaEmail] = useState(false);
  const [discountPillowGarage, setDiscountPillowGarage] = useState(false);
  const [discountUniqaHolderYear, setDiscountUniqaHolderYear] =
    useState(false);
  const [discountUniqaNonOemGlass, setDiscountUniqaNonOemGlass] =
    useState(false);
  const [discountUniqaCrossSell, setDiscountUniqaCrossSell] =
    useState(false);
  const [discountUniqaZtp, setDiscountUniqaZtp] = useState(false);

  const handleGoToResults = () => {
    if (typeof window !== "undefined") {
      const payload = {
        hasLiability,
        liabilityLimit,
        assistance,
        assistanceLevel,
        annualMileage,
        glass,
        collisionAnimal,
        naturalHazard,
        vandalism,
        animalDamage,
        theft,
        discountCppProfi,
        discountUniqaNonOemGlass,
      };
      window.localStorage.setItem(
        "carRecord.resultsInput",
        JSON.stringify(payload)
      );
    }
    router.push("/pomucky/zaznam/vysledky-auto");
  };

  return (
    <div className="space-y-6">
      {/* Hlavní header + přepínač SROVNÁVAČ / PORTÁL */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
              Výběr, jaký typ pojištění sjednáváš…
            </p>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-50">
              Pojištění vozidel – nastavení sjednávaného krytí
            </h2>
          </div>

          <div className="inline-flex rounded-full bg-slate-950/60 border border-white/15 p-1">
            <button
              type="button"
              onClick={() => setMode("srovnavac")}
              className={`px-4 py-1.5 text-xs sm:text-sm rounded-full transition ${
                mode === "srovnavac"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-200"
              }`}
            >
              SROVNÁVAČ
            </button>
            <button
              type="button"
              onClick={() => setMode("portal")}
              className={`px-4 py-1.5 text-xs sm:text-sm rounded-full transition ${
                mode === "portal"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-200"
              }`}
            >
              PORTÁL POJIŠŤOVNY
            </button>
          </div>
        </div>

        {mode === "portal" && (
          <p className="mt-3 text-xs sm:text-sm text-slate-300">
            Pro portály pojišťoven připravujeme samostatné šablony. Zatím
            používej srovnávačovou část níže jako tahák k vyplnění Záznamu
            z jednání.
          </p>
        )}
      </section>

      {/* Povinné ručení + Havarijní */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Povinné ručení */}
        <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-4 sm:px-6 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                Povinné ručení
              </p>
              <p className="text-sm text-slate-300">
                Zvol sjednávaný limit plnění.
              </p>
            </div>
            <GlassSwitch
              label="Sjednávám"
              checked={hasLiability}
              onChange={setHasLiability}
            />
          </div>

          {hasLiability && (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                Limit plnění (škody na zdraví / majetku)
              </label>
              <PillPicker
                value={liabilityLimit}
                options={LIABILITY_LIMITS}
                onChange={setLiabilityLimit}
              />
            </div>
          )}
        </div>

        {/* Havarijní */}
        <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-4 sm:px-6 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                Havarijní pojištění
              </p>
              <p className="text-sm text-slate-300">
                Pojistná částka, DPH a spoluúčast.
              </p>
            </div>
            <GlassSwitch
              label="Sjednávám"
              checked={hasCasco}
              onChange={setHasCasco}
            />
          </div>

          {hasCasco && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Pojistná částka
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="např. 350 000"
                    className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={cascoAmount}
                    onChange={(e) => setCascoAmount(e.target.value)}
                  />
                  <div className="flex items-center px-3 text-sm text-slate-200">
                    Kč
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  S DPH / bez DPH
                </label>
                <div className="inline-flex rounded-full bg-slate-950/60 border border-white/15 p-1">
                  <button
                    type="button"
                    onClick={() => setCascoWithVat("sDPH")}
                    className={`px-3 py-1.5 text-xs rounded-full transition ${
                      cascoWithVat === "sDPH"
                        ? "bg-white text-slate-900"
                        : "text-slate-200"
                    }`}
                  >
                    S DPH
                  </button>
                  <button
                    type="button"
                    onClick={() => setCascoWithVat("bezDPH")}
                    className={`px-3 py-1.5 text-xs rounded-full transition ${
                      cascoWithVat === "bezDPH"
                        ? "bg-white text-slate-900"
                        : "text-slate-200"
                    }`}
                  >
                    Bez DPH
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Spoluúčast
                </label>
                <PillPicker
                  value={cascoDeductible}
                  options={DEDUCTIBLES}
                  onChange={setCascoDeductible}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Roční nájezd */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-3 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
              Předpokládaný roční nájezd km
            </h3>
            <p className="text-xs text-slate-400">
              Zohledňuje pouze Allianz a Pillow.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Aktuálně:{" "}
            <span className="font-medium text-slate-100">
              {annualMileage ?? "Nezvolen"}
            </span>
          </div>
        </div>

        <PillPicker
          value={annualMileage}
          options={ANNUAL_MILEAGE}
          onChange={setAnnualMileage}
        />
      </section>

      {/* Doplňková krytí */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
          Doplňková krytí
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Střet se zvěří */}
          <div className="space-y-2">
            <GlassSwitch
              label="Střet se zvěří"
              checked={collisionAnimal}
              onChange={setCollisionAnimal}
            />
            {collisionAnimal && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={collisionAnimalLimit}
                onChange={(e) =>
                  setCollisionAnimalLimit(e.target.value)
                }
              />
            )}
          </div>

          {/* Poškození zvířetem */}
          <div className="space-y-2">
            <GlassSwitch
              label="Poškození zvířetem"
              checked={animalDamage}
              onChange={setAnimalDamage}
            />
            {animalDamage && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={animalDamageLimit}
                onChange={(e) =>
                  setAnimalDamageLimit(e.target.value)
                }
              />
            )}
          </div>

          {/* Živel */}
          <div className="space-y-2">
            <GlassSwitch
              label="Živel"
              checked={naturalHazard}
              onChange={setNaturalHazard}
            />
            {naturalHazard && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={naturalHazardLimit}
                onChange={(e) =>
                  setNaturalHazardLimit(e.target.value)
                }
              />
            )}
          </div>

          {/* Skla */}
          <div className="space-y-2">
            <GlassSwitch
              label="Skla"
              checked={glass}
              onChange={setGlass}
            />
            {glass && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={glassLimit}
                onChange={(e) => setGlassLimit(e.target.value)}
              />
            )}
          </div>

          {/* Odcizení */}
          <div className="space-y-2">
            <GlassSwitch
              label="Odcizení"
              checked={theft}
              onChange={setTheft}
            />
            {theft && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={theftLimit}
                onChange={(e) => setTheftLimit(e.target.value)}
              />
            )}
          </div>

          {/* Vandalismus */}
          <div className="space-y-2">
            <GlassSwitch
              label="Vandalismus"
              checked={vandalism}
              onChange={setVandalism}
            />
            {vandalism && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={vandalismLimit}
                onChange={(e) =>
                  setVandalismLimit(e.target.value)
                }
              />
            )}
          </div>

          {/* Náhradní vozidlo */}
          <div className="space-y-2">
            <GlassSwitch
              label="Náhradní vozidlo"
              checked={replacementCar}
              onChange={setReplacementCar}
            />
          </div>

          {/* Asistence */}
          <div className="space-y-2">
            <GlassSwitch
              label="Asistence"
              checked={assistance}
              onChange={setAssistance}
            />
            {assistance && (
              <PillPicker
                value={assistanceLevel}
                options={ASSISTANCE_LEVELS}
                onChange={setAssistanceLevel}
              />
            )}
          </div>

          {/* Zavazadla */}
          <div className="space-y-2">
            <GlassSwitch
              label="Zavazadla"
              checked={luggage}
              onChange={setLuggage}
            />
            {luggage && (
              <input
                type="text"
                className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Limit v Kč"
                value={luggageLimit}
                onChange={(e) => setLuggageLimit(e.target.value)}
              />
            )}
          </div>

          {/* Poškození vlastního vozidla */}
          <div className="space-y-2">
            <GlassSwitch
              label="Poškození vlastního vozidla"
              checked={ownDamage}
              onChange={setOwnDamage}
            />
            {ownDamage && (
              <PillPicker
                value={ownDamageLevel}
                options={OWN_DAMAGE_LEVELS}
                onChange={setOwnDamageLevel}
              />
            )}
          </div>
        </div>
      </section>

      {/* Slevy */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
          Uplatnil jsi některou z uvedených slev?
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              ČPP
            </p>
            <GlassSwitch
              label="Extrabenefit Profi"
              checked={discountCppProfi}
              onChange={setDiscountCppProfi}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Kooperativa
            </p>
            <GlassSwitch
              label="Mimořádné zvýhodnění – podpora prodeje"
              checked={discountKoopSupport}
              onChange={setDiscountKoopSupport}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              ČPP &amp; Kooperativa
            </p>
            <GlassSwitch
              label="Vozidlo provozováno jen v ČR"
              checked={discountOnlyCz}
              onChange={setDiscountOnlyCz}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              ČSOB
            </p>
            <GlassSwitch
              label="BA score"
              checked={discountCsobBa}
              onChange={setDiscountCsobBa}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Slavia
            </p>
            <GlassSwitch
              label="Akceptace elektronické komunikace"
              checked={discountSlaviaEmail}
              onChange={setDiscountSlaviaEmail}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Pillow
            </p>
            <GlassSwitch
              label="Garážované vozidlo"
              checked={discountPillowGarage}
              onChange={setDiscountPillowGarage}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              UNIQA
            </p>
            <GlassSwitch
              label="Držitelem déle než rok"
              checked={discountUniqaHolderYear}
              onChange={setDiscountUniqaHolderYear}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              UNIQA
            </p>
            <GlassSwitch
              label="Sleva za neoriginální sklo"
              checked={discountUniqaNonOemGlass}
              onChange={setDiscountUniqaNonOemGlass}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              UNIQA
            </p>
            <GlassSwitch
              label="Cross-sellová sleva"
              checked={discountUniqaCrossSell}
              onChange={setDiscountUniqaCrossSell}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              UNIQA
            </p>
            <GlassSwitch
              label="Držitel ZTP / ZTP-P"
              checked={discountUniqaZtp}
              onChange={setDiscountUniqaZtp}
            />
          </div>
        </div>
      </section>

      {/* Tlačítko Výsledky */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleGoToResults}
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_18px_40px_rgba(16,185,129,0.45)] hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          Výsledky
        </button>
      </div>
    </div>
  );
}

export default CarRecordForm;