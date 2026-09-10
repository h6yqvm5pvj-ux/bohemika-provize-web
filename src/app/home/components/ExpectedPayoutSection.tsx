import styles from "./homeWidgets.module.css";
import Image from "next/image";
import { WalletCards } from "lucide-react";

import { type AppLanguage } from "@/lib/appLanguage";
import { formatMoney } from "../homeUtils";
import { LoadingProgressPanel } from "./LoadingProgressPanel";

type Props = {
  language: AppLanguage;
  loading: boolean;
  grossAmount: number;
  stornoFundAmount: number;
  netAmount: number;
  periodLabel: string;
  isLiteUI: boolean;
};

const EXPECTED_PAYOUT_COPY: Record<
  AppLanguage,
  {
    currentMonth: string;
    title: string;
    loadingTitle: string;
    loadingAccent: string;
    loadingDescription: string;
    netPayout: string;
    gross: string;
    stornoFund: string;
  }
> = {
  cs: {
    currentMonth: "aktuální měsíc",
    title: "Očekávaná výplata",
    loadingTitle: "Načítám data výplaty",
    loadingAccent: "Výplata",
    loadingDescription: "Připravuji přehled provizí a storno fondu.",
    netPayout: "Čistá výplata",
    gross: "Hrubá",
    stornoFund: "StornoFond",
  },
};

export function ExpectedPayoutSection({
  language,
  loading,
  grossAmount,
  stornoFundAmount,
  netAmount,
  periodLabel,
  isLiteUI,
}: Props) {
  const copy = EXPECTED_PAYOUT_COPY[language];
  const safeGross = Number.isFinite(grossAmount) ? Math.max(0, grossAmount) : 0;
  const safeStorno = Number.isFinite(stornoFundAmount) ? Math.max(0, stornoFundAmount) : 0;
  const payoutPeriodLabel =
    typeof periodLabel === "string" && periodLabel.trim().length > 0
      ? periodLabel.trim()
      : copy.currentMonth;

  return (
    <section className={`${styles.card} ${styles.dark} ${isLiteUI ? "" : styles.elevated}`} data-fixed-box-theme="slate">
      {!loading && <Image src="/images/money-wallet.png" alt="" width={1268} height={1241} aria-hidden="true" className={`${styles.ghost} ${styles.walletGhost}`} />}
      <div className={styles.content}>
        <h2 className={styles.title}><span className={styles.icon}><WalletCards aria-hidden="true" /></span>{copy.title}</h2>
        {loading ? <div className="mt-5"><LoadingProgressPanel title={copy.loadingTitle} description={copy.loadingDescription} accentLabel={copy.loadingAccent} visual="money" /></div> : (
          <div className={styles.moneyLayout}>
            <div>
              <p className={`${styles.label} ${styles.payoutPeriod}`}>{copy.netPayout} · {payoutPeriodLabel}</p>
              <p className={styles.amount}>{formatMoney(netAmount)}</p>
            </div>
            <dl className={styles.breakdown}>
              <div><dt>{copy.gross}</dt><dd>{formatMoney(safeGross)}</dd></div>
              <div><dt>{copy.stornoFund}</dt><dd>− {formatMoney(safeStorno)}</dd></div>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
