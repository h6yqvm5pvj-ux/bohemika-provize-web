import { Banknote, CalendarDays, TrendingUp } from "lucide-react";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { formatMoney } from "./contractDetailHelpers";
import type { ContractFinancialOverviewModel } from "./contractFinancialOverviewModel";
import styles from "./contractFinancialOverview.module.css";

function dayLabel(day: string | null): string {
  if (!day) return "—";
  const [year, month, date] = day.split("-");
  return `${Number(date)}. ${Number(month)}. ${year}`;
}

function periodLastDay(exclusiveDay: string): string | null {
  const date = new Date(`${exclusiveDay}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function familyLabel(entriesCount: number): string {
  const amendments = Math.max(0, entriesCount - 1);
  return amendments === 0 ? "Původní smlouva"
    : `Smlouva + ${amendments} ${amendments === 1 ? "dodatek" : amendments < 5 ? "dodatky" : "dodatků"}`;
}

function paymentCount(count: number): string {
  return `${count} ${count === 1 ? "záznam z výpisu" : count < 5 ? "záznamy z výpisů" : "záznamů z výpisů"}`;
}

export function ContractFinancialOverview({ overview }: { overview: ContractFinancialOverviewModel }) {
  const unavailable = overview.recipient === "unavailable";
  const forecastAvailable = !unavailable && overview.expectedAmount !== null;
  const next = forecastAvailable ? overview.nextPayout : null;
  const nextDay = next ? endorsementCommissionDay(next.date) : null;
  const description = overview.recipient === "manager"
    ? "Tvoje meziprovize z týmové smlouvy, včetně všech dodatků."
    : overview.recipient === "own"
      ? "Tvoje provize z původní smlouvy i všech dodatků."
      : "Pro přihlášeného uživatele není dostupný provizní přehled.";

  return (
    <section id="contract-financial-overview" className={styles.overview} aria-labelledby="contract-financial-overview-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="contract-financial-overview-heading">Moje provize za celou smlouvu</h2>
          <p>{description}</p>
        </div>
        {overview.entriesCount > 0 && <span className={styles.family}>{familyLabel(overview.entriesCount)}</span>}
      </div>

      <div className={styles.metrics}>
        <article className={`${styles.card} ${styles.recorded}`} aria-labelledby="contract-overview-paid-label" data-overview-metric="recorded">
          <h3 id="contract-overview-paid-label"><Banknote size={17} aria-hidden="true" /> Zapsané výplaty</h3>
          <p className={styles.amount} data-negative={overview.paidAmount < 0}>
            {unavailable ? "—" : formatMoney(overview.paidAmount)}
          </p>
          <p className={styles.detail}>{unavailable ? "Výplaty nejsou k dispozici."
            : overview.payoutCount === 0 ? "Zatím bez zapsaných výplat."
              : paymentCount(overview.payoutCount)}</p>
          <p className={styles.footnote}>Skutečnost z výpisů po započtení oprav a storen.</p>
        </article>

        <article className={`${styles.card} ${styles.forecast}`} aria-labelledby="contract-overview-expected-label" data-overview-metric="expected">
          <h3 id="contract-overview-expected-label"><TrendingUp size={17} aria-hidden="true" /> Očekáváno za 12 měsíců</h3>
          <p className={styles.amount} data-negative={(overview.expectedAmount ?? 0) < 0}>
            {forecastAvailable ? formatMoney(overview.expectedAmount) : "—"}
          </p>
          <p className={styles.detail}>{forecastAvailable
            ? `${dayLabel(overview.periodFrom)} – ${dayLabel(periodLastDay(overview.periodUntil))}`
            : "Plán není k dispozici."}</p>
          <p className={styles.footnote}>Odhad nevyplacených provizí podle účinných změn.</p>
        </article>

        <article className={styles.card} aria-labelledby="contract-overview-next-label" data-overview-metric="next">
          <h3 id="contract-overview-next-label"><CalendarDays size={17} aria-hidden="true" /> {next && next.amount < 0 ? "Nejbližší očekávaná srážka" : "Nejbližší očekávaná výplata"}</h3>
          <p className={styles.amount} data-negative={(next?.amount ?? 0) < 0}>
            {next ? formatMoney(next.amount) : "—"}
          </p>
          <p className={styles.detail}>{next
            ? <><time dateTime={nextDay ?? undefined}>{dayLabel(nextDay)}</time>{next.count > 1 && ` · ${next.count} ${next.count < 5 ? "položky" : "položek"} plánu`}</>
            : forecastAvailable ? "V příštích 10 letech nejsou v plánu další výplaty." : "Plán není k dispozici."}</p>
          <p className={styles.footnote}>Předpokládaný termín podle výplatního kalendáře.</p>
        </article>
      </div>
      <p className={styles.basis}>Částky před odpočtem stornofondu.</p>
    </section>
  );
}
