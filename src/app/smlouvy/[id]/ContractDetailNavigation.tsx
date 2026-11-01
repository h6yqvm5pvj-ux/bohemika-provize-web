import styles from "./contractDetailNavigation.module.css";

export function ContractDetailNavigation({
  hasChanges,
  onOpenNotes,
}: {
  hasChanges: boolean;
  onOpenNotes: () => void;
}) {
  return (
    <nav className={styles.navigation} aria-label="Sekce detailu smlouvy">
      <a href="#contract-overview">Přehled</a>
      <a href="#contract-commissions">Provize</a>
      {hasChanges && <a href="#contract-changes">Dodatky</a>}
      <a href="#contract-notes" onClick={onOpenNotes}>Poznámky</a>
    </nav>
  );
}
