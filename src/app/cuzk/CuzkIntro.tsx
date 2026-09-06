import type { ReactNode } from "react";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { ArrowUpLeft, Building2, Grid2X2, Layers3, MapPin, Navigation, ScanLine } from "lucide-react";
import styles from "@/components/tools/toolIntro.module.css";
import { CuzkPropertyMap } from "./CuzkPropertyMap";

function PropertyIllustration() {
  return (
    <div className={styles.illustration} aria-hidden="true">
      <div className={styles.mapHeading}><span><Layers3 size={14} /> Pohled na nemovitost</span><ScanLine size={17} /></div>
      <CuzkPropertyMap className={styles.map} />
      <div className={styles.propertyLabel}><span className={styles.propertyIcon}><Building2 size={19} strokeWidth={1.7} /></span><div><strong>Každý detail na jednom místě</strong><span>Stavba · parcely · jednotky</span></div><span className={styles.labelDot} /></div>
      <div className={styles.mapFooter}><span><i /> Ilustrační pohled</span><span className={styles.compass}><Navigation size={13} /> S</span></div>
    </div>
  );
}

const DETAILS = [
  { icon: Building2, title: "Stavba", text: "Využití a údaje o budově" },
  { icon: Layers3, title: "Parcely", text: "Výměra a druh pozemku" },
  { icon: Grid2X2, title: "Jednotky", text: "Přehled jednotek v budově" },
];

export function CuzkIntro({ children, onExample }: { children: ReactNode; onExample: () => void }) {
  return (
    <ToolIntro
      name="Katastr nemovitostí"
      titleId="cuzk-intro-title"
      icon={MapPin}
      title={<>Najdi adresu.<br /><span>Poznej nemovitost.</span></>}
      description="Od první adresy k detailům stavby, pozemků a jednotek. Vše přehledně na jednom místě."
      source="Údaje z registrů ČÚZK a RÚIAN"
      features={DETAILS}
      scene={<PropertyIllustration />}
    >
      {children}
      <div className={styles.example}><span>Zkus například</span><button type="button" onClick={onExample}>Tyršova 133, Kadaň <ArrowUpLeft size={13} /></button></div>
    </ToolIntro>
  );
}
