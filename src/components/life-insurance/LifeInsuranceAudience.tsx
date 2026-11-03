"use client";

import { Check, ArrowUpRight } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import type { OnlineCardLocale } from "@/lib/onlineCardI18n";
import styles from "./lifeInsuranceTheme.module.css";

export type LifeInsuranceAudience = "uninsured" | "insured";

const COPY = {
  cs: {
    label: "Začněme vaší situací",
    uninsured: "Ještě nemám životní pojištění",
    insured: "Již mám životní pojištění",
    uninsuredStatus: "Zobrazeny informace k výběru životního pojištění.",
    insuredStatus: "Zobrazeny informace ke kontrole stávající smlouvy.",
  },
  en: {
    label: "Let us start with your situation",
    uninsured: "I do not have life insurance yet",
    insured: "I already have life insurance",
    uninsuredStatus: "Showing information about choosing life insurance.",
    insuredStatus: "Showing information about reviewing an existing policy.",
  },
  uk: {
    label: "Почнімо з вашої ситуації",
    uninsured: "У мене ще немає страхування життя",
    insured: "У мене вже є страхування життя",
    uninsuredStatus: "Показано інформацію про вибір страхування життя.",
    insuredStatus: "Показано інформацію про перевірку чинного договору.",
  },
} as const;

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function LifeInsuranceAudienceSelector({ locale, value, onChange }: {
  locale: OnlineCardLocale;
  value: LifeInsuranceAudience;
  onChange: (value: LifeInsuranceAudience) => void;
}) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const id = useId();
  const copy = COPY[locale];
  if (!ready) return null;

  return <div className={styles.audienceSelector}>
    <p id={id} className={styles.audienceLabel}>{copy.label}</p>
    <div className={styles.audienceChoices} role="group" aria-labelledby={id}>
      {(["uninsured", "insured"] as const).map(audience => <button
        key={audience}
        type="button"
        aria-pressed={value === audience}
        aria-controls="life-audience-content"
        onClick={() => onChange(audience)}
      >
        <span className={styles.audienceCheck} aria-hidden="true">{value === audience ? <Check /> : null}</span>
        <span>{copy[audience]}</span>
        <ArrowUpRight className={styles.audienceArrow} aria-hidden="true" />
      </button>)}
    </div>
    <p role="status" className={styles.srOnly}>{value === "insured" ? copy.insuredStatus : copy.uninsuredStatus}</p>
  </div>;
}
