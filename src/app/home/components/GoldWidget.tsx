import styles from "./homeWidgets.module.css";
import Image from "next/image";
import { Coins, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { type AppLanguage } from "@/lib/appLanguage";
import { formatMoney } from "../homeUtils";

type Props = {
  language: AppLanguage;
  isLiteUI: boolean;
  goldLoading: boolean;
  goldData: { czkPerOz: number; ts: number; changePct: number | null } | null;
  goldChangePct: number | null;
  goldChangeAbs: number | null;
  goldDir: "up" | "down" | "flat";
  goldError: string | null;
};

const GOLD_WIDGET_COPY: Record<
  AppLanguage,
  {
    currentPrice: string;
    loading: string;
    dailyMove: string;
    noChange: string;
  }
> = {
  cs: {
    currentPrice: "Aktuální cena zlata / 1 oz",
    loading: "Načítám…",
    dailyMove: "Denní pohyb",
    noChange: "Bez změny",
  },
};

export function GoldWidget({
  language,
  isLiteUI,
  goldLoading,
  goldData,
  goldChangePct,
  goldChangeAbs,
  goldDir,
  goldError,
}: Props) {
  const copy = GOLD_WIDGET_COPY[language];
  const TrendIcon =
    goldDir === "up" ? TrendingUp : goldDir === "down" ? TrendingDown : Minus;

  return (
    <section className={`${styles.card} ${styles.gold} ${isLiteUI ? "" : styles.elevated}`} data-fixed-box-theme="slate">
      <Image src="/images/investicni-zlato-pamp.png" alt="" width={1536} height={1024} aria-hidden="true" priority className={`${styles.ghost} ${styles.goldGhost}`} />
      <div className={`${styles.content} ${styles.moneyLayout}`}>
        <div>
          <h2 className={styles.title}><span className={styles.icon}><Coins aria-hidden="true" /></span>{copy.currentPrice}</h2>
          <p className={styles.amount}>{goldLoading && !goldData ? copy.loading : goldData ? formatMoney(goldData.czkPerOz) : "—"}</p>
          {goldError && <p className={styles.error}>{goldError}</p>}
        </div>
        <aside className={styles.trend} data-direction={goldDir}>
          <TrendIcon aria-hidden="true" />
          <div>
            <p className={styles.label}>{copy.dailyMove}</p>
            <p className={styles.trendValues}>
              <span>{goldChangePct == null ? copy.noChange : `${goldChangePct > 0 ? "+" : ""}${goldChangePct.toFixed(2)} %`}</span>
              {goldChangeAbs != null && <small>{goldChangeAbs > 0 ? "+" : goldChangeAbs < 0 ? "−" : ""}{formatMoney(Math.abs(goldChangeAbs))}</small>}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
