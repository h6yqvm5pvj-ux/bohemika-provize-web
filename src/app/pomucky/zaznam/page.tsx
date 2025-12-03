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

export default function RecordOfMeetingPage() {
  const [selectedType, setSelectedType] =
    useState<RecordInsuranceType>("life");

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        {/* header… */}

        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 sm:px-5 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
          <p className="text-xs text-slate-300 mb-3">
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
                      ? "bg-sky-500/90 border-white/80 text-white shadow-lg shadow-sky-500/40"
                      : "bg-white/5 border-white/20 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  <div className="font-semibold">{t.shortTitle}</div>
                  <div className="text-[11px] text-slate-200/80">
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
          {/* ostatní typy necháme zatím jako placeholdery */}
        </section>
      </div>
    </AppLayout>
  );
}