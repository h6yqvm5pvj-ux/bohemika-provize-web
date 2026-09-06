import { ToolLoader } from "@/components/tools/ToolLoader";
import { Building2, Grid2X2, Layers3, MapPin, ScanLine } from "lucide-react";
import { CuzkPropertyMap } from "./CuzkPropertyMap";
import styles from "@/components/tools/toolLoader.module.css";

const DETAILS = [
  { title: "Stavba", icon: Building2, text: "" },
  { title: "Parcely", icon: Layers3, text: "" },
  { title: "Jednotky", icon: Grid2X2, text: "" },
];

export function CuzkLoader({ query }: { query: string }) {
  return (
    <ToolLoader
      name="Katastr nemovitostí"
      title={<>Načítáme<br /><span>tvou nemovitost.</span></>}
      description="Připravujeme přehled stavby, parcel a jednotek z dostupných údajů v registrech."
      query={query.trim() || "Vybraná nemovitost"}
      queryLabel="Vyhledávaná adresa"
      queryIcon={MapPin}
      status="Načítáme údaje z registrů…"
      features={DETAILS}
      scene={
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.sceneHeading}><span><Layers3 size={14} /> Od adresy k souvislostem</span><ScanLine size={17} /></div>
          <CuzkPropertyMap animated className={styles.map} />
          <div className={styles.sceneCard}>
            <span className={styles.sceneCardIcon}><Building2 size={19} strokeWidth={1.7} /></span>
            <div><strong>Detail nemovitosti</strong><span className={styles.skeletonLine} /></div>
            <span className={styles.miniSpinner} />
          </div>
          <div className={styles.sceneFooter}><span><i /> Ilustrační pohled</span><span>ČÚZK · RÚIAN</span></div>
        </div>
      }
    />
  );
}
