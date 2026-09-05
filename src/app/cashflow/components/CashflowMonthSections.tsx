import { Fragment, type ReactNode } from "react";
import {
  BriefcaseBusiness, CarFront, ChevronDown, Coins, CreditCard,
  Globe2, HeartPulse, House, Layers3, Plane, Tags, type LucideIcon,
} from "lucide-react";

import { formatMoney } from "@/app/lib/formatters";
import { formatCashflowGroupCount } from "../cashflowLabels";
import {
  buildCashflowMonthSections,
  type CashflowSectionGroup,
  type MonthSectionId,
} from "../monthSections";
import styles from "../monthSections.module.css";

const SECTION_ICONS: Record<MonthSectionId, LucideIcon> = {
  life: HeartPulse,
  property: House,
  entrepreneurs: BriefcaseBusiness,
  travel: Plane,
  gold: Coins,
  foreigners: Globe2,
  auto: CarFront,
  tip: Tags,
  subscription: CreditCard,
  other: Layers3,
};

export function CashflowMonthSections<T extends CashflowSectionGroup>({ groups, monthKey, children }: {
  groups: T[];
  monthKey: string;
  children: (group: T) => ReactNode;
}) {
  const sections = buildCashflowMonthSections(groups);

  return <div className={styles.sections}>
    {sections.map((section) => {
      const Icon = SECTION_ICONS[section.id];
      return (
        <details key={`${monthKey}:${section.id}`} data-cashflow-section={section.id} className={styles.section}>
          <summary className={styles.summary}>
            <span className={`${styles.icon} ${styles[section.id]}`}>
              <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className={styles.identity}>
              <span className={styles.title}>{section.label}</span>
              <span className={styles.count}>
                {formatCashflowGroupCount(section.groups)}
              </span>
            </span>
            <span className={styles.total}>
              <span className={styles.totalLabel}>{section.id === "subscription" ? "Součet plateb" : "Před odpočtem"}</span>
              <span className={`${styles.amount} ${section.total < 0 ? styles.negative : ""}`}>{formatMoney(section.total)}</span>
            </span>
            <span className={styles.chevron}><ChevronDown size={18} aria-hidden="true" /></span>
          </summary>
          <div className={styles.content}>
            {section.groups.map((group) => <Fragment key={group.id}>{children(group)}</Fragment>)}
          </div>
        </details>
      );
    })}
  </div>;
}
