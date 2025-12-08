// src/app/pomucky/zaznam/PropertyRecordForm.tsx
"use client";

import { useState } from "react";

type RiskOption = {
  key: string;
  label: string;
};

const BUILDING_RISKS: RiskOption[] = [
  { key: "naturalBasic", label: "Živel mimo povodeň a záplavu" },
  { key: "naturalFlood", label: "Živel včetně povodně a záplavy" },
  { key: "theft", label: "Odcizení" },
  { key: "vandalism", label: "Vandalismus" },
];

const BUILDING_APT_RISKS: RiskOption[] = [
  { key: "naturalBasic", label: "Živel mimo povodeň a záplavu" },
  { key: "naturalFlood", label: "Živel včetně povodně a záplavy" },
  { key: "theftVandal", label: "Odcizení a vandalismus" },
];

const HOUSEHOLD_RISKS: RiskOption[] = [
  { key: "naturalBasic", label: "Živel mimo povodeň a záplavu" },
  { key: "naturalFlood", label: "Živel včetně povodně a záplavy" },
  { key: "theftVandal", label: "Odcizení a vandalismus" },
];

type RoleOption = "vlastnik" | "spoluvlastnik" | "najemce";

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-emerald-400/80 bg-emerald-500/20 text-emerald-50 shadow-sm shadow-emerald-400/40"
          : "border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function RiskRow({
  title,
  amount,
  onAmountChange,
  options,
  selected,
  onToggle,
}: {
  title: string;
  amount: string;
  onAmountChange: (v: string) => void;
  options: RiskOption[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <input
          type="number"
          min={0}
          placeholder="Pojistná částka v Kč"
          className="w-full sm:w-56 rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <ToggleChip
            key={opt.key}
            active={selected.has(opt.key)}
            label={opt.label}
            onClick={() => onToggle(opt.key)}
          />
        ))}
      </div>
    </div>
  );
}

export function PropertyRecordForm() {
  const [openBuilding, setOpenBuilding] = useState(true);
  const [openHousehold, setOpenHousehold] = useState(false);
  const [openExtra, setOpenExtra] = useState(false);

  const [buildingHouseAmount, setBuildingHouseAmount] = useState("");
  const [buildingHouseSelected, setBuildingHouseSelected] = useState<
    Set<string>
  >(new Set());
  const [buildingFlatAmount, setBuildingFlatAmount] = useState("");
  const [buildingFlatSelected, setBuildingFlatSelected] = useState<
    Set<string>
  >(new Set());
  const [buildingSideAmount, setBuildingSideAmount] = useState("");
  const [buildingSideSelected, setBuildingSideSelected] = useState<
    Set<string>
  >(new Set());
  const [buildingRecreationAmount, setBuildingRecreationAmount] =
    useState("");
  const [buildingRecreationSelected, setBuildingRecreationSelected] =
    useState<Set<string>>(new Set());
  const [buildingApartmentAmount, setBuildingApartmentAmount] =
    useState("");
  const [buildingApartmentSelected, setBuildingApartmentSelected] =
    useState<Set<string>>(new Set());

  const [householdPermanentAmount, setHouseholdPermanentAmount] =
    useState("");
  const [householdRecreationalAmount, setHouseholdRecreationalAmount] =
    useState("");
  const [householdPermanentSelected, setHouseholdPermanentSelected] =
    useState<Set<string>>(new Set());
  const [householdRecreationalSelected, setHouseholdRecreationalSelected] =
    useState<Set<string>>(new Set());

  const [extraAssist, setExtraAssist] = useState(false);
  const [extraLiability, setExtraLiability] = useState(false);
  const [extraLiabilityAmount, setExtraLiabilityAmount] = useState("");

  const [extraPropertyLiability, setExtraPropertyLiability] =
    useState(false);
  const [extraPropertyLiabilityAmount, setExtraPropertyLiabilityAmount] =
    useState("");
  const [extraPropertyRoles, setExtraPropertyRoles] = useState<Set<RoleOption>>(
    new Set()
  );

  const [extraAnimalLiability, setExtraAnimalLiability] = useState(false);
  const [extraAnimalAmount, setExtraAnimalAmount] = useState("");

  const toggleSet = (setState: (v: Set<string>) => void, key: string) => {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleRole = (role: RoleOption) => {
    setExtraPropertyRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Stavba */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-3">
        <button
          type="button"
          onClick={() => setOpenBuilding((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm sm:text-base font-semibold text-white">
            Stavba
          </span>
          <span className="text-xs text-slate-300">
            {openBuilding ? "▲" : "▼"}
          </span>
        </button>
        {openBuilding && (
          <div className="space-y-3">
            <RiskRow
              title="Rodinný dům"
              amount={buildingHouseAmount}
              onAmountChange={setBuildingHouseAmount}
              options={BUILDING_RISKS}
              selected={buildingHouseSelected}
              onToggle={(key) =>
                toggleSet(setBuildingHouseSelected, key)
              }
            />
            <RiskRow
              title="Bytová jednotka"
              amount={buildingFlatAmount}
              onAmountChange={setBuildingFlatAmount}
              options={BUILDING_RISKS}
              selected={buildingFlatSelected}
              onToggle={(key) =>
                toggleSet(setBuildingFlatSelected, key)
              }
            />
            <RiskRow
              title="Vedlejší stavby"
              amount={buildingSideAmount}
              onAmountChange={setBuildingSideAmount}
              options={BUILDING_RISKS}
              selected={buildingSideSelected}
              onToggle={(key) =>
                toggleSet(setBuildingSideSelected, key)
              }
            />
            <RiskRow
              title="Rekreační stavba"
              amount={buildingRecreationAmount}
              onAmountChange={setBuildingRecreationAmount}
              options={BUILDING_RISKS}
              selected={buildingRecreationSelected}
              onToggle={(key) =>
                toggleSet(setBuildingRecreationSelected, key)
              }
            />
            <RiskRow
              title="Bytový dům"
              amount={buildingApartmentAmount}
              onAmountChange={setBuildingApartmentAmount}
              options={BUILDING_APT_RISKS}
              selected={buildingApartmentSelected}
              onToggle={(key) =>
                toggleSet(setBuildingApartmentSelected, key)
              }
            />
          </div>
        )}
      </section>

      {/* Domácnost */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-3">
        <button
          type="button"
          onClick={() => setOpenHousehold((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm sm:text-base font-semibold text-white">
            Domácnost
          </span>
          <span className="text-xs text-slate-300">
            {openHousehold ? "▲" : "▼"}
          </span>
        </button>
        {openHousehold && (
          <div className="space-y-3">
            <RiskRow
              title="Trvale obydlená domácnost"
              amount={householdPermanentAmount}
              onAmountChange={setHouseholdPermanentAmount}
              options={HOUSEHOLD_RISKS}
              selected={householdPermanentSelected}
              onToggle={(key) =>
                toggleSet(setHouseholdPermanentSelected, key)
              }
            />
            <RiskRow
              title="Rekreační domácnost"
              amount={householdRecreationalAmount}
              onAmountChange={setHouseholdRecreationalAmount}
              options={HOUSEHOLD_RISKS}
              selected={householdRecreationalSelected}
              onToggle={(key) =>
                toggleSet(setHouseholdRecreationalSelected, key)
              }
            />
          </div>
        )}
      </section>

      {/* Připojištění */}
      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-3">
        <button
          type="button"
          onClick={() => setOpenExtra((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm sm:text-base font-semibold text-white">
            Připojištění
          </span>
          <span className="text-xs text-slate-300">
            {openExtra ? "▲" : "▼"}
          </span>
        </button>

        {openExtra && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100">
                Asistenční služby
              </div>
              <ToggleChip
                active={extraAssist}
                label={extraAssist ? "Zapnuto" : "Zapnout"}
                onClick={() => setExtraAssist((v) => !v)}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100">
                  Odpovědnost v běžném občanském životě
                </div>
                <ToggleChip
                  active={extraLiability}
                  label={extraLiability ? "Zapnuto" : "Zapnout"}
                  onClick={() => setExtraLiability((v) => !v)}
                />
              </div>
              {extraLiability && (
                <input
                  type="number"
                  min={0}
                  placeholder="Pojistná částka v Kč"
                  className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={extraLiabilityAmount}
                  onChange={(e) => setExtraLiabilityAmount(e.target.value)}
                />
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100">
                  Odpovědnost vlastníka, držitele nebo nájemce nemovité věci
                </div>
                <ToggleChip
                  active={extraPropertyLiability}
                  label={extraPropertyLiability ? "Zapnuto" : "Zapnout"}
                  onClick={() => setExtraPropertyLiability((v) => !v)}
                />
              </div>
              {extraPropertyLiability && (
                <div className="space-y-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Pojistná částka v Kč"
                    className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    value={extraPropertyLiabilityAmount}
                    onChange={(e) =>
                      setExtraPropertyLiabilityAmount(e.target.value)
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <ToggleChip
                      active={extraPropertyRoles.has("vlastnik")}
                      label="Vlastník"
                      onClick={() => toggleRole("vlastnik")}
                    />
                    <ToggleChip
                      active={extraPropertyRoles.has("spoluvlastnik")}
                      label="Spoluvlastník"
                      onClick={() => toggleRole("spoluvlastnik")}
                    />
                    <ToggleChip
                      active={extraPropertyRoles.has("najemce")}
                      label="Nájemce"
                      onClick={() => toggleRole("najemce")}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100">
                  Odpovědnost vlastníka nebo opatrovatele zvířete
                </div>
                <ToggleChip
                  active={extraAnimalLiability}
                  label={extraAnimalLiability ? "Zapnuto" : "Zapnout"}
                  onClick={() => setExtraAnimalLiability((v) => !v)}
                />
              </div>
              {extraAnimalLiability && (
                <input
                  type="number"
                  min={0}
                  placeholder="Pojistná částka v Kč"
                  className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={extraAnimalAmount}
                  onChange={(e) => setExtraAnimalAmount(e.target.value)}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
