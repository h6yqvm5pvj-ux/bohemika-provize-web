import Image from "next/image";
import { useState } from "react";
import { CarFront } from "lucide-react";
import { vehicleBrandLogo } from "./vehicleBrandAssets";
import styles from "./vehicleReport.module.css";

export function VehicleBrandLogo({ brand }: { brand: string }) {
  const src = vehicleBrandLogo(brand);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <span className={styles.brandLogo}>
    {src && src !== failedSrc ? <Image src={src} alt={`Logo ${brand}`} width={42} height={42} unoptimized onError={() => setFailedSrc(src)} /> : <CarFront size={28} strokeWidth={1.4} aria-hidden="true" />}
  </span>;
}
