// src/app/pomucky/zaznam/page.tsx
"use client";

import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  type RecordInsuranceType,
  RECORD_INSURANCE_TYPES,
  type RecordInsuranceTypeConfig,
} from "./types";

import { LifeRecordForm } from "./LifeRecordForm";
import { CarRecordForm } from "./CarRecordForm";
import { PropertyRecordForm } from "./PropertyRecordForm";

export default function RecordOfMeetingPage() {
  const [selectedType, setSelectedType] =
    useState<RecordInsuranceType>("life");

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="space-y-1">
          <h1 className="text-5xl font-semibold leading-none tracking-tight text-slate-900 sm:text-6xl">
            Záznam z jednání
          </h1>
          <p className="text-sm text-slate-600">
            Vyber typ sjednávaného pojištění a vyplň parametry ve stejném stylu jako zbytek aplikace.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-900 bg-white  px-4 py-4 sm:px-5 sm:py-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
          <p className="text-xs text-slate-600 mb-3">
            Vyber, jaký typ pojištění sjednáváš…
          </p>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {RECORD_INSURANCE_TYPES.map((t: RecordInsuranceTypeConfig) => {
              const active = t.id === selectedType;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id)}
                  className={`min-w-[130px] rounded-2xl px-3 py-2 text-left text-xs sm:text-sm transition border ${
                    active
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-slate-900 text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold">{t.shortTitle}</div>
                  <div className="text-[11px] text-slate-900">
                    {t.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          {selectedType === "life" && <LifeRecordForm />}
          {selectedType === "car" && <CarRecordForm />}
          {selectedType === "property" && <PropertyRecordForm />}
          {/* ostatní typy necháme zatím jako placeholdery */}
        </section>
      </div>
    </AppLayout>
  );
}
