import type { ReactNode } from "react";
import { ShieldCheck, type LucideIcon } from "lucide-react";
import styles from "./insuranceDetail.module.css";

export type InsuranceDetailTone = "violet" | "sky" | "emerald" | "amber" | "rose" | "cyan";

export function InsuranceDetailIllustration({ icon: Icon, className = "" }: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 84 64" fill="none" className={`${styles.illustration} ${className}`} aria-hidden="true" focusable="false">
      <rect x="7" y="8" width="66" height="49" rx="20" fill="var(--detail-soft, #f3edfc)" />
      <circle cx="66" cy="13" r="7" fill="var(--detail-tint, #e4d4f8)" />
      <ellipse cx="41" cy="56" rx="28" ry="3" fill="var(--detail-tint, #e4d4f8)" />
      <Icon x="19" y="14" width="42" height="42" strokeWidth={1.5} />
      <path d="M11 20v6m-3-3h6M72 39v6m-3-3h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
      <circle cx="15" cy="46" r="2" fill="currentColor" opacity=".25" />
    </svg>
  );
}

export function InsuranceDetailHeading({ icon = ShieldCheck, children, status, tone, className = "" }: {
  icon?: LucideIcon;
  children: ReactNode;
  status?: ReactNode;
  tone?: InsuranceDetailTone;
  className?: string;
}) {
  return (
    <div className={`${styles.heading} ${className}`} data-detail-tone={tone}>
      <InsuranceDetailIllustration icon={icon} />
      <h3 className={styles.title}>{children}</h3>
      {status && <span className={styles.status}>{status}</span>}
    </div>
  );
}
