// src/app/pomucky/zaznam/page.tsx
"use client";

import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import type { LucideIcon } from "lucide-react";
import { CarFront, HeartPulse, Home, Plane, ShieldCheck, Sparkles } from "lucide-react";
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
      <div className="w-full max-w-6xl space-y-7 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(165deg,#ffffff_0%,#f8fbff_56%,#edf6ff_100%)] px-4 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-sky-400 to-indigo-500" />
          <div className="relative space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              Klientský záznam
            </span>
            <h1 className="text-5xl font-semibold leading-none tracking-tight text-slate-900 sm:text-6xl">
              Záznam z jednání
            </h1>
            <p className="max-w-3xl text-xs text-slate-600 sm:text-sm">
              Vyber typ pojištění, zaklikni řešená rizika a doplň částky. Formulář je připravený
              jako tahák pro rychlé vyplnění výstupu z jednání.
            </p>
          </div>
        </header>

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Oblast jednání
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1.5">
          {RECORD_INSURANCE_TYPES.map((t: RecordInsuranceTypeConfig) => {
            const active = t.id === selectedType;
            const Icon = INSURANCE_TYPE_ICONS[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedType(t.id)}
                className={`inline-flex min-w-[170px] items-center justify-center gap-2.5 rounded-[22px] border px-5 py-3.5 text-base font-semibold tracking-tight transition-all sm:text-lg ${
                  active
                    ? "border-blue-500 bg-[linear-gradient(135deg,#60a5fa_0%,#2563eb_100%)] text-slate-950 shadow-[0_14px_32px_rgba(37,99,235,0.34)]"
                    : "border-slate-300 bg-white text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.08)] hover:-translate-y-[1px] hover:border-slate-400 hover:bg-slate-50/60 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-slate-900" : "text-slate-600"}`} />
                <span>{t.shortTitle}</span>
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
