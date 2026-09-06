import type { ReactNode } from "react";
import { CarFront, Gauge, History, ScanLine, Search, Users } from "lucide-react";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { ToolLoader } from "@/components/tools/ToolLoader";
import introStyles from "@/components/tools/toolIntro.module.css";
import loaderStyles from "@/components/tools/toolLoader.module.css";
import { VehicleIllustration } from "./VehicleIllustration";
import styles from "./vehicleAudit.module.css";

const FEATURES = [
  { icon: History, title: "Historie vozidla", text: "STK a záznamy o nájezdu" },
  { icon: Users, title: "Majitelé a provoz", text: "Dostupné údaje z registru" },
  { icon: Gauge, title: "Odhad ceny", text: "Orientační tržní hodnota" },
];

export function VehicleIntro({ children }: { children: ReactNode }) {
  return (
    <ToolIntro
      name="Proklepka vozidla"
      icon={CarFront}
      title={<>Zadej VIN.<br /><span>Poznej vozidlo.</span></>}
      description="Od historie a technických údajů až k odhadu ceny. Vše důležité o autě na jednom místě."
      source="Údaje z registru silničních vozidel"
      features={FEATURES}
      scene={
        <div className={introStyles.illustration} aria-hidden="true">
          <div className={introStyles.mapHeading}><span><CarFront size={15} /> Vozidlo pod lupou</span><ScanLine size={17} /></div>
          <VehicleIllustration className={styles.car} />
          <div className={introStyles.propertyLabel}>
            <span className={introStyles.propertyIcon}><Search size={19} strokeWidth={1.7} /></span>
            <div><strong>Každé auto má svůj příběh</strong><span>Historie · technika · hodnota</span></div>
            <span className={introStyles.labelDot} />
          </div>
          <div className={introStyles.mapFooter}><span><i /> Ilustrační pohled</span><span>Detail vozidla</span></div>
        </div>
      }
    >{children}</ToolIntro>
  );
}

export function VehicleLoader({ vin }: { vin: string }) {
  return (
    <ToolLoader
      name="Proklepka vozidla"
      title={<>Načítáme<br /><span>příběh vozidla.</span></>}
      description="Připravujeme přehled historie, technických údajů a podklady pro odhad ceny tvého auta."
      query={vin}
      queryLabel="VIN vozidla"
      queryIcon={CarFront}
      status="Načítáme dostupné záznamy o vozidle…"
      features={FEATURES}
      scene={
        <div className={loaderStyles.scene} aria-hidden="true">
          <div className={loaderStyles.sceneHeading}><span><ScanLine size={15} /> Od VIN k detailům</span><CarFront size={17} /></div>
          <VehicleIllustration animated className={styles.car} />
          <div className={loaderStyles.sceneCard}>
            <span className={loaderStyles.sceneCardIcon}><History size={19} strokeWidth={1.7} /></span>
            <div><strong>Skládáme přehled vozidla</strong><span className={loaderStyles.skeletonLine} /></div>
            <span className={loaderStyles.miniSpinner} />
          </div>
          <div className={loaderStyles.sceneFooter}><span><i /> Ilustrační pohled</span><span>Registr vozidel</span></div>
        </div>
      }
    />
  );
}
