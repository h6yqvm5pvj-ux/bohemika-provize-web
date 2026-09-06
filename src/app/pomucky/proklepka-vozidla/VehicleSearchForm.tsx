import type { Ref } from "react";
import { ChevronRight, Gauge, Search, X } from "lucide-react";
import styles from "./vehicleAudit.module.css";

export function VehicleSearchForm({ vin, onVinChange, inputRef, onSearch, canSearch, loading, compact, onReset, mileage, onMileageChange, showMileage, onToggleMileage }: {
  vin: string;
  onVinChange: (value: string) => void;
  inputRef: Ref<HTMLInputElement>;
  onSearch: () => void;
  canSearch: boolean;
  loading: boolean;
  compact: boolean;
  onReset: () => void;
  mileage: string;
  onMileageChange: (value: string) => void;
  showMileage: boolean;
  onToggleMileage: () => void;
}) {
  return (
    <form className={`${styles.searchForm} ${compact ? styles.compactForm : ""}`} onSubmit={(event) => { event.preventDefault(); if (canSearch && !loading) onSearch(); }}>
      <label className={styles.searchLabel} htmlFor="vehicle-vin">VIN vozidla</label>
      <div className={styles.searchRow}>
        <div className={styles.searchBox}>
          <Search size={19} strokeWidth={1.7} aria-hidden="true" />
          <input id="vehicle-vin" ref={inputRef} type="text" value={vin} onChange={(event) => onVinChange(event.target.value)} disabled={loading} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby={compact ? undefined : "vehicle-vin-hint"} placeholder="Zadej VIN vozidla" />
          <button type="submit" className={styles.submit} disabled={loading || !canSearch}>{loading ? "Načítáme…" : "Prověřit vozidlo"}<ChevronRight size={16} aria-hidden="true" /></button>
        </div>
        {compact && <button type="button" className={styles.reset} onClick={onReset} disabled={loading}><X size={16} aria-hidden="true" />Vyčistit</button>}
      </div>
      {!compact && <p id="vehicle-vin-hint" className={styles.inputHint}>Najdeš ho v technickém průkazu nebo pod čelním sklem.</p>}
      <button type="button" className={styles.refineToggle} onClick={onToggleMileage} disabled={loading} aria-expanded={showMileage} aria-controls="vehicle-mileage-field"><Gauge size={15} aria-hidden="true" /><span>{mileage && !showMileage ? `Nájezd: ${mileage} km` : "Zpřesnit odhad nájezdem"}</span><ChevronRight size={13} className={showMileage ? styles.expanded : ""} aria-hidden="true" /></button>
      {showMileage && <div id="vehicle-mileage-field" className={styles.mileageField}>
        <label htmlFor="vehicle-mileage">Aktuální nájezd <span>volitelné</span></label>
        <div><input id="vehicle-mileage" type="text" inputMode="numeric" value={mileage} onChange={(event) => onMileageChange(event.target.value)} disabled={loading} placeholder="Např. 120 000" /><span>km</span></div>
        <p>Pomůže upřesnit orientační cenu vozidla.</p>
      </div>}
    </form>
  );
}
