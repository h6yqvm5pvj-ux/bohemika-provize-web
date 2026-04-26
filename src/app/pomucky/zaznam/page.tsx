// src/app/pomucky/zaznam/page.tsx
"use client";

import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import type { LucideIcon } from "lucide-react";
import { CarFront, HeartPulse, Home, Plane, ShieldCheck } from "lucide-react";
import {
  type RecordInsuranceType,
  RECORD_INSURANCE_TYPES,
  type RecordInsuranceTypeConfig,
} from "./types";

import { LifeRecordForm } from "./LifeRecordForm";
import { CarRecordForm } from "./CarRecordForm";
import { PropertyRecordForm } from "./PropertyRecordForm";

const INSURANCE_TYPE_ICONS: Record<RecordInsuranceType, LucideIcon> = {
  life: HeartPulse,
  car: CarFront,
  property: Home,
  liability: ShieldCheck,
  travel: Plane,
};

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
              const Icon = INSURANCE_TYPE_ICONS[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id)}
                  className={`min-w-[150px] rounded-2xl border px-3 py-2.5 text-left text-xs sm:text-sm transition ${
                    active
                      ? "border-slate-900 bg-gradient-to-br from-slate-950 to-slate-800 text-white shadow-[0_10px_18px_rgba(15,23,42,0.3)]"
                      : "bg-white border-slate-400/80 text-slate-900 hover:-translate-y-[1px] hover:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border ${
                        active
                          ? "border-slate-500 bg-slate-800 text-emerald-300"
                          : "border-slate-300 bg-slate-100 text-slate-700"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="font-semibold">{t.shortTitle}</div>
                  </div>
                  <div
                    className={`mt-1 text-[11px] leading-tight ${
                      active ? "text-slate-200" : "text-slate-600"
                    }`}
                  >
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
