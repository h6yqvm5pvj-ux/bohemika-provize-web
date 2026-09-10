// src/app/pomucky/zaznam/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { RecordIllustration } from "./RecordIllustration";
import styles from "./record.module.css";
import { AppLayout } from "@/components/AppLayout";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  CarFront,
  HeartPulse,
  Home,
  Plane,
  ShieldCheck,
  ArrowLeft,
  Check,
  FilePenLine,
} from "lucide-react";
import {
  type RecordInsuranceType,
  RECORD_INSURANCE_TYPES,
  type RecordInsuranceTypeConfig,
} from "./types";

import { LifeRecordForm } from "./LifeRecordForm";
import { CarRecordForm } from "./CarRecordForm";
import { PropertyRecordForm } from "./PropertyRecordForm";
import { LiabilityRecordForm } from "./LiabilityRecordForm";
import { TravelRecordForm } from "./TravelRecordForm";
import { BusinessRecordForm } from "./BusinessRecordForm";

const INSURANCE_TYPE_ICONS: Record<RecordInsuranceType, LucideIcon> = {
  life: HeartPulse,
  car: CarFront,
  property: Home,
  liability: ShieldCheck,
  business: Briefcase,
  travel: Plane,
};

export default function RecordOfMeetingPage() {
  const [selectedType, setSelectedType] =
    useState<RecordInsuranceType>("life");

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <Link href="/pomucky" className={styles.back}><ArrowLeft size={15} /> Zpět na pomůcky</Link>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}><FilePenLine size={14} /> Podklady pro jednání</span>
            <h1>Záznam z jednání</h1>
            <p>Od potřeb klienta k přehlednému zápisu. Vyber oblast pojištění a připrav si texty pro záznam z jednání.</p>
            <div className={styles.steps} aria-label="Jak postupovat">
              <span><b>1</b> Vyber oblast</span><span><b>2</b> Doplň podklady</span><span><b>3</b> Zkopíruj texty</span>
            </div>
          </div>
          <div className={styles.illustration}><RecordIllustration /></div>
        </header>
        <div className={styles.pickerHeader}><h2>Co s klientem řešíš?</h2><span>Vyber oblast jednání</span></div>
        <div className={styles.picker} role="group" aria-label="Oblast jednání">
          {RECORD_INSURANCE_TYPES.map((t: RecordInsuranceTypeConfig) => {
            const active = t.id === selectedType;
            const Icon = INSURANCE_TYPE_ICONS[t.id];
            return (
              <button key={t.id} type="button" onClick={() => setSelectedType(t.id)}
                aria-pressed={active} aria-controls="record-form" className={styles.type}>
                <span className={styles.typeIcon}><Icon size={19} strokeWidth={1.7} /></span>
                {active && <Check size={13} className={styles.selectedMark} />}
                <strong>{t.shortTitle}</strong><small>{t.subtitle}</small>
              </button>
            );
          })}
        </div>

        <section id="record-form" className={styles.form} aria-label={RECORD_INSURANCE_TYPES.find((type) => type.id === selectedType)?.title}>
          {selectedType === "life" && <LifeRecordForm />}
          {selectedType === "car" && <CarRecordForm />}
          {selectedType === "property" && <PropertyRecordForm />}
          {selectedType === "liability" && <LiabilityRecordForm />}
          {selectedType === "business" && <BusinessRecordForm />}
          {selectedType === "travel" && <TravelRecordForm />}
        </section>
      </div>
    </AppLayout>
  );
}
