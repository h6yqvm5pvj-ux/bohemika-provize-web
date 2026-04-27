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
        </header>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {RECORD_INSURANCE_TYPES.map((t: RecordInsuranceTypeConfig) => {
            const active = t.id === selectedType;
            const Icon = INSURANCE_TYPE_ICONS[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedType(t.id)}
                className={`min-w-[165px] rounded-3xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-emerald-500 bg-emerald-50 text-slate-900 shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
                    : "border-slate-300 bg-white text-slate-900 shadow-[0_6px_14px_rgba(15,23,42,0.08)] hover:-translate-y-[1px] hover:border-slate-500"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                      active
                        ? "border-emerald-300 bg-white text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="text-base font-semibold sm:text-lg">
                    {t.shortTitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

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
