"use client";

import { Check } from "lucide-react";
import type { ClientGender } from "./lifeRecordTexts";
import styles from "./clientGenderSelector.module.css";

function ClientSilhouette({ gender }: { gender: ClientGender }) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className={styles.silhouette}>
      {gender === "female" ? (
        <>
          <path opacity=".3" d="M17 27c0-13 6-20 15-20s15 7 15 20c0 9 2 13 5 16-8 5-32 5-40 0 3-3 5-7 5-16Z" />
          <path d="M22 23c0-5 2-9 5-11 3 5 8 7 15 8v5c0 6-4 11-10 11S22 31 22 25v-2Zm4 12v6l-10 5c-5 3-8 8-8 14h48c0-6-3-11-8-14l-10-5v-6c-2 2-4 3-6 3s-4-1-6-3Z" />
        </>
      ) : (
        <>
          <path opacity=".3" d="M20 25c-2-9 1-16 8-17 5-4 13-1 17 3l-3 5c3 4 2 8 1 11l-5-7-14-1-4 6Z" />
          <path d="M22 21c5 0 9-2 13-4 2 3 4 4 7 5v4c0 6-4 11-10 11S22 32 22 26v-5Zm4 15v5l-12 5c-5 2-8 7-8 14h52c0-7-3-12-8-14l-12-5v-5c-2 2-4 3-6 3s-4-1-6-3Z" />
        </>
      )}
    </svg>
  );
}

export function ClientGenderSelector({ value, onChange }: { value: ClientGender; onChange: (value: ClientGender) => void }) {
  return (
    <div className={styles.selector} role="group" aria-labelledby="life-client-gender-label">
      <span id="life-client-gender-label" className={styles.label}>Klient je</span>
      <div className={styles.options}>
        {([{ value: "male", label: "Muž" }, { value: "female", label: "Žena" }] as const).map(option => (
          <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={styles.option}>
            <span className={styles.portrait}><ClientSilhouette gender={option.value} /></span>
            <span className={styles.optionLabel}>{option.label}</span>
            <span className={styles.selectedMark}><Check size={10} strokeWidth={3} aria-hidden="true" /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
