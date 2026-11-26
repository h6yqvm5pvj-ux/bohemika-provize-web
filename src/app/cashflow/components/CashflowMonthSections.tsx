import { Fragment, type ReactNode } from "react";
import {
  BriefcaseBusiness, CarFront, ChevronDown, Coins, CreditCard,
  Gift, Globe2, HeartPulse, House, Layers3, Plane, RotateCcw, Tags, type LucideIcon,
} from "lucide-react";

import { formatCashflowAmount, formatCashflowGroupCount } from "../cashflowLabels";
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
  pension: Coins,
  foreigners: Globe2,
  auto: CarFront,
  tip: Tags,
  subscription: CreditCard,
  extra: Gift,
  office: House,
  other: Layers3,
  cancelled: RotateCcw,
};

export function CashflowMonthSections<T extends CashflowSectionGroup>({ groups, monthKey, expandSections, children }: {
  groups: T[];
  monthKey: string;
  expandSections?: boolean;
  children: (group: T) => ReactNode;
}) {
  const sections = buildCashflowMonthSections(groups);

  return <>
    {sections.length > 0 && <div className={styles.listHeading}>
      <span>Kategorie</span>
      {sections.some(section => section.id !== "extra" && section.id !== "subscription") &&
        <span>Částky před odpočtem stornofondu</span>}
    </div>}
    <div className={styles.sections}>
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        return (
          <details key={`${monthKey}:${section.id}`} open={expandSections} data-cashflow-section={section.id} className={styles.section}>
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
                <span className={section.id === "extra" || section.id === "subscription" ? styles.totalLabel : "sr-only"}>{section.id === "extra" ? "Vyplaceno" : section.id === "subscription" ? "Součet plateb" : "Před odpočtem"}</span>
                <span className={`${styles.amount} ${section.total < 0 ? styles.negative : ""}`}>{formatCashflowAmount(section.total, section.groups.some(group => group.items.some(item => item.amountUnknown)))}</span>
              </span>
              <span className={styles.chevron}><ChevronDown size={18} aria-hidden="true" /></span>
            </summary>
            <div className={styles.content}>
              {section.groups.map((group) => <Fragment key={group.id}>{children(group)}</Fragment>)}
            </div>
          </details>
        );
      })}
    </div>
  </>;
}
