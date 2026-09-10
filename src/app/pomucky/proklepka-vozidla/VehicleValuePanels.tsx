import { ArrowDownRight, ArrowUpRight, Gauge, Search } from "lucide-react";
import { VehicleReportIllustration } from "./VehicleReportIllustrations";
import { vehiclePriceScale, type MileageScenario } from "./vehicleValueDisplay";
import styles from "./vehicleReport.module.css";

const number = (value: number) => Math.round(value).toLocaleString("cs-CZ");
const money = (value: number) => `${number(value)} Kč`;

export function VehicleValuePanels({ price, low, high, marketMin, marketMax, mileage, scenarios, comparableCount, market, loading, canSearch, onMarketSearch, error }: {
  price: number; low: number; high: number; marketMin: number; marketMax: number;
  mileage: number | null; scenarios: MileageScenario[]; comparableCount: number;
  market: boolean; loading: boolean; canSearch: boolean; onMarketSearch: () => void; error: string | null;
}) {
  const scale = vehiclePriceScale(price, low, high, marketMin, marketMax);
  const maxPrice = Math.max(1, ...scenarios.map(row => row.price));
  return <section id="vehicle-value" className={styles.valueGrid} aria-label="Nacenění vozidla">
    <div className={`${styles.panel} ${styles.valuePanel}`}>
      <div className={styles.valueTop}>
        <div><span className={styles.eyebrow}>Hodnota vozidla</span><h3>Odhadovaná tržní cena</h3>
          <div className={styles.price} data-testid="vehicle-estimate">{money(price)}</div>
          <p className={styles.muted}>{mileage != null ? `Při nájezdu ${number(mileage)} km` : "Nájezd vozidla není známý"}</p>
        </div>
        <VehicleReportIllustration kind="value" className={styles.valueArt} />
      </div>
      <div className={styles.priceSource}><span className={styles.sourceDot} />{market ? "Podle nabídek SAUTO" : "Orientační odhad"}{market && comparableCount > 0 && <span>· {comparableCount} srovnatelných vozidel</span>}</div>
      <div className={styles.priceRange}>
        <div><span>{market ? "Rozmezí nabídek" : "Orientační rozmezí"}</span><strong>{money(low)} – {money(high)}</strong></div>
        <div className={styles.rangeTrack} role="img" aria-label={`Rozmezí ${money(low)} až ${money(high)}, odhad ${money(price)}`}>
          <span className={styles.rangeFill} style={{ left: `${scale.low}%`, width: `${scale.high - scale.low}%` }} />
          <span className={styles.rangeMarker} style={{ left: `${scale.estimate}%` }} />
        </div>
        <div className={styles.rangeLabels}><span>{money(scale.min)}</span><span>{money(scale.max)}</span></div>
      </div>
      <div className={styles.marketAction}>
        <p>{market ? "Inzerované ceny se mohou lišit od konečné prodejní ceny." : "Zpřesni odhad srovnáním s aktuálními nabídkami."}</p>
        <button type="button" onClick={onMarketSearch} disabled={loading || !canSearch} className={styles.primaryButton}><Search size={15} aria-hidden="true" />{loading ? "Načítám SAUTO…" : "Dopočítat ze SAUTO"}</button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
    <div className={`${styles.panel} ${styles.scenarioPanel}`}>
      <div className={styles.panelHeading}><span className={styles.headingIcon}><Gauge size={19} /></span><div><h3>Cena podle nájezdu</h3><p>Jak by jiný nájezd ovlivnil odhad</p></div></div>
      <div className={styles.scenarios}>
        {scenarios.map(row => <div key={row.km} className={`${styles.scenarioRow} ${row.highlighted ? styles.scenarioActive : ""}`}>
          <div className={styles.scenarioLabel}><span>{number(row.km)} <small>km</small>{row.highlighted && <em>Pro tento vůz</em>}</span><strong>{money(row.price)}</strong></div>
          <div className={styles.scenarioTrack}><span style={{ width: `${row.price / maxPrice * 100}%` }} /></div>
        </div>)}
      </div>
      {!scenarios.length && <p className={styles.empty}>Pro srovnání doplň nájezd vozidla.</p>}
      <div className={styles.scenarioLegend}><span><ArrowUpRight size={14} />Menší nájezd</span><span><ArrowDownRight size={14} />Větší nájezd</span></div>
      <p className={styles.footnote}>Modelové srovnání při stejném stáří, stavu a výbavě.</p>
    </div>
  </section>;
}
