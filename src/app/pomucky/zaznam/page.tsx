// src/app/pomucky/zaznam/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
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
import { MeetingRecordSession } from "./MeetingRecordSession";
import { writeMeetingRecord, type MeetingRecordContext } from "@/app/lib/meetingRecordPrivacy";
import { ClientGenderSelector } from "./ClientGenderSelector";
import { getRecordClientWords, type ClientGender } from "./recordClientTexts";
import { readRecordClientGender } from "./recordClientPreference";

const INSURANCE_TYPE_ICONS: Record<RecordInsuranceType, LucideIcon> = {
  life: HeartPulse,
  car: CarFront,
  property: Home,
  liability: ShieldCheck,
  business: Briefcase,
  travel: Plane,
};

export default function RecordOfMeetingPage() {
  return <MeetingRecordSession>{(owner) => <RecordOfMeeting owner={owner} />}</MeetingRecordSession>;
}

function RecordOfMeeting({ owner }: { owner: MeetingRecordContext }) {
  const [selectedType, setSelectedType] =
    useState<RecordInsuranceType>("life");
  const selectedInsurance = RECORD_INSURANCE_TYPES.find((type) => type.id === selectedType)!;
  const [clientGender, setClientGender] = useState(() => readRecordClientGender(owner));
  const texts = getRecordClientWords(clientGender);
  const changeClientGender = (gender: ClientGender) => {
    if (!writeMeetingRecord("clientPreferences", { clientGender: gender }, owner)) return;
    setClientGender(gender);
  };

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <Link href="/pomucky" className={styles.back}><ArrowLeft size={15} /> Zpět na pomůcky</Link>
        <header className={styles.masthead}>
          <div>
            <h1>Záznam z jednání.<br /><span>Jasně a přehledně.</span></h1>
          </div>
          <div className={styles.clientChoice}>
            <ClientGenderSelector value={clientGender} onChange={changeClientGender} />
            <p>Pro všechny oblasti pojištění</p>
          </div>
        </header>
        <div id="record-insurance" className={styles.pickerHeader}><h2>Co s {texts.clientInstrumental} řešíš?</h2><span>Vyber oblast pojištění</span></div>
        <div className={styles.picker} role="group" aria-label="Oblast jednání">
          {RECORD_INSURANCE_TYPES.map((t: RecordInsuranceTypeConfig) => {
            const active = t.id === selectedType;
            const Icon = INSURANCE_TYPE_ICONS[t.id];
            return (
              <button key={t.id} type="button" onClick={() => setSelectedType(t.id)}
                aria-pressed={active} aria-controls="record-form" className={styles.type} data-sector={t.id}>
                <span className={styles.typeIcon}><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
                {active && <Check size={14} className={styles.selectedMark} aria-hidden="true" />}
                <span className={styles.typeCopy}><strong>{t.shortTitle}</strong><small>{t.subtitle}</small></span>
              </button>
            );
          })}
        </div>

        <div className={styles.workspace}>
          <div className={styles.workspaceLabel}><span><FilePenLine size={15} aria-hidden="true" /> Podklady pro záznam</span><span aria-live="polite">{selectedInsurance.title}</span></div>
          <section id="record-form" className={styles.form} aria-label={selectedInsurance.title}>
            {selectedType === "life" && <LifeRecordForm owner={owner} clientGender={clientGender} />}
            {selectedType === "car" && <CarRecordForm owner={owner} clientGender={clientGender} />}
            {selectedType === "property" && <PropertyRecordForm clientGender={clientGender} />}
            {selectedType === "liability" && <LiabilityRecordForm clientGender={clientGender} />}
            {selectedType === "business" && <BusinessRecordForm clientGender={clientGender} />}
            {selectedType === "travel" && <TravelRecordForm clientGender={clientGender} />}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
