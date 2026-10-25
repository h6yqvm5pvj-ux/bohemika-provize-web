"use client";

import { useState } from "react";
import Image from "next/image";
import { CalendarDays, FileCheck2, TrendingUp, WalletCards } from "lucide-react";
import type { Category, ContractStats, ProductionGoal } from "@/app/api/team-overview/teamOverview.types";
import { formatMoney } from "@/app/lib/formatters";
import { institutionLogoFrameClass, institutionLogoImageClass, institutionLogoKeyFromPath } from "@/app/lib/institutionLogoDisplay";
import type { TeamDashboardSummary } from "./teamDashboard";
import { PRODUCTION_CATEGORY_TABS, insurerLogoPath, productionRowsForStats } from "./teamProduction";
import { ProductionGoalProgress } from "./ProductionGoalProgress";
import styles from "./team.module.css";

type Props = {
  stats: ContractStats | null;
  summary: TeamDashboardSummary;
  statsUnavailable: boolean;
  contractScope: "all" | "active";
  onContractScopeChange: (scope: "all" | "active") => void;
  goal: ProductionGoal;
  canEditGoal: boolean;
  onEditGoal: () => void;
};

const money = (amount: number) => formatMoney(amount, { nonPositiveAsEmpty: true }) || "0 Kč";
const count = (amount: number) => amount.toLocaleString("cs-CZ");

export function PersonalProductionDashboard({ stats, summary, statsUnavailable, contractScope, onContractScopeChange, goal, canEditGoal, onEditGoal }: Props) {
  const [category, setCategory] = useState<Category | "all">("all");
  const rows = productionRowsForStats(stats, category);
  const totals = rows.reduce((sum, row) => ({
    contracts: sum.contracts + row.contracts,
    annualPremium: sum.annualPremium + row.annualPremium,
    monthlyPremium: sum.monthlyPremium + row.monthlyPremium,
  }), { contracts: 0, annualPremium: 0, monthlyPremium: 0 });
  const annualPremium = Object.values(stats?.categoryMetrics ?? {}).reduce((sum, metrics) => sum + metrics.annualPremium, 0);
  const tabs: { key: Category | "all"; label: string }[] = [
    { key: "all", label: "Všechny produkty" }, ...PRODUCTION_CATEGORY_TABS, { key: "other", label: "Ostatní" },
  ];
  const hasGoal = goal.totalAnnualPremium > 0 || Object.values(goal.categories).some(value => value > 0);
  const period = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(new Date());
  const metrics = [
    { label: contractScope === "active" ? "Aktivní smlouvy celkem" : "Celkem smluv", value: count(stats?.total ?? 0), detail: "Napříč všemi pojišťovnami a produkty", Icon: FileCheck2 },
    { label: "Smlouvy tento měsíc", value: count(summary.current.contracts), detail: `Minule ke stejnému dni: ${count(summary.previousToDate.contracts)}`, Icon: CalendarDays },
    { label: "Roční pojistné celkem", value: money(annualPremium), detail: "Produkce za zobrazené smlouvy", Icon: WalletCards },
    { label: "Roční pojistné tento měsíc", value: money(summary.current.annualPremium), detail: `Minule ke stejnému dni: ${money(summary.previousToDate.annualPremium)}`, Icon: TrendingUp },
  ];

  return (
    <section className={styles.summary} aria-label="Přehled mých smluv">
      <div className={styles.summaryHeader}>
        <div>
          <h2 className={styles.summaryTitle}>Moje smlouvy v číslech</h2>
          <div className={styles.period}><CalendarDays size={13} aria-hidden="true" /><span>{period}</span></div>
        </div>
        <div className={styles.scope} role="group" aria-label="Rozsah mých smluv">
          <button type="button" aria-pressed={contractScope === "all"} onClick={() => onContractScopeChange("all")}>Všechny smlouvy</button>
          <button type="button" aria-pressed={contractScope === "active"} onClick={() => onContractScopeChange("active")}>Aktivní smlouvy</button>
        </div>
      </div>

      {statsUnavailable && <p className={styles.empty} role="status">Přehled smluv se nepodařilo načíst. Zkus stránku obnovit.</p>}
      <div className={styles.metrics}>
        {metrics.map(({ label, value, detail, Icon }, index) => (
          <article key={label} className={`${styles.metric} ${index === 0 ? styles.personalTotal : ""}`}>
            <div className={styles.metricTop}><span className={styles.metricIcon}><Icon size={17} aria-hidden="true" /></span></div>
            <h3 className={styles.metricLabel}>{label}</h3>
            <div className={`${styles.metricValue} ${index > 1 ? styles.moneyValue : ""}`}>{statsUnavailable ? "—" : value}</div>
            <p className={styles.metricFoot}>{statsUnavailable ? "Data nejsou dostupná" : detail}</p>
          </article>
        ))}
      </div>

      <section className={styles.panel} aria-label="Moje smlouvy podle pojišťoven a produktů">
        <div className={styles.personalBreakdownHeading}>
          <div>
            <h3 className={styles.panelTitle}>Pojišťovny a produkty</h3>
            <p className={styles.description}>Vyber produktovou skupinu a porovnej počty smluv i pojistné.</p>
          </div>
          <span className={styles.personalScopeLabel}>{contractScope === "active" ? "Bez stornovaných a dožitých smluv" : "Včetně stornovaných a dožitých smluv"}</span>
        </div>
        <div className={styles.personalCategories} role="group" aria-label="Produktové skupiny">
          {tabs.map(tab => (
            <button key={tab.key} type="button" aria-pressed={category === tab.key} onClick={() => setCategory(tab.key)}>
              {tab.label}<span>{statsUnavailable ? "—" : count(tab.key === "all" ? stats?.total ?? 0 : stats?.categories?.[tab.key] ?? 0)}</span>
            </button>
          ))}
        </div>
        {statsUnavailable ? null : rows.length === 0 ? (
          <div className={styles.empty}>
            <FileCheck2 size={24} aria-hidden="true" />
            <strong>{category === "all" ? "Zatím tu nejsou žádné smlouvy" : "V této skupině zatím nejsou smlouvy"}</strong>
            {contractScope === "active" ? "Další smlouvy můžeš zobrazit přepnutím na Všechny smlouvy." : "Po přidání smlouvy se zde objeví její pojišťovna a produkce."}
          </div>
        ) : (
          <div className={styles.personalTableScroll} role="region" aria-label="Počty smluv podle pojišťoven" tabIndex={0}>
            <table className={styles.personalTable}>
              <thead><tr><th scope="col">Pojišťovna</th><th scope="col">Počet smluv</th>{category === "life" && <th scope="col">Měsíční pojistné</th>}<th scope="col">Roční pojistné</th></tr></thead>
              <tbody>{rows.map(row => {
                const logo = insurerLogoPath(row.name), logoKey = institutionLogoKeyFromPath(logo);
                return (
                  <tr key={row.name}>
                    <th scope="row"><span className={styles.personalInstitution}>
                      {logo && <span className={`relative shrink-0 ${institutionLogoFrameClass(logoKey, "compact")}`}><Image src={logo} alt="" fill sizes="64px" className={institutionLogoImageClass(logoKey)} /></span>}
                      {row.name}
                    </span></th>
                    <td>{count(row.contracts)}</td>{category === "life" && <td>{money(row.monthlyPremium)}</td>}<td>{money(row.annualPremium)}</td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr><th scope="row">Celkem</th><td>{count(totals.contracts)}</td>{category === "life" && <td>{money(totals.monthlyPremium)}</td>}<td>{money(totals.annualPremium)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      {(hasGoal || canEditGoal) && <ProductionGoalProgress title="Můj měsíční cíl" subtitle="Moje produkce a výhled podle aktuálního tempa."
        goal={goal} currentByCategory={summary.currentByCategory} projectedByCategory={summary.projectedByCategory}
        canEdit={canEditGoal} onEdit={onEditGoal} statsUnavailable={statsUnavailable} />}
    </section>
  );
}
