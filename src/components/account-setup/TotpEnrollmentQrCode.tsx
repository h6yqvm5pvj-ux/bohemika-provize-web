"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import type { TotpSecret } from "firebase/auth";
import styles from "./authSurface.module.css";

type QrSecret = Pick<TotpSecret, "secretKey" | "generateQrCodeUrl">;
export function TotpEnrollmentQrCode({ secret, accountName }: { secret: QrSecret; accountName: string }) {
  const [result, setResult] = useState<{
    secret: QrSecret;
    accountName: string;
    dataUrl: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Encode locally: the enrollment URI contains the shared TOTP secret.
    void import("qrcode")
      .then(module => module.default.toDataURL(secret.generateQrCodeUrl(accountName, "Bohemka.App"), {
        width: 240,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }))
      .then(dataUrl => {
        if (!cancelled) setResult({ secret, accountName, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setResult({ secret, accountName, dataUrl: null });
      });
    return () => { cancelled = true; };
  }, [secret, accountName]);

  if (!result || result.secret !== secret || result.accountName !== accountName) {
    return <p role="status" className={styles.qrLoading}>
      <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" /> Připravuji QR kód…
    </p>;
  }
  if (!result.dataUrl) {
    return <p role="status" className={styles.notice}>
      QR kód se nepodařilo vytvořit. Níže rozbal ruční zadání a zkopíruj klíč do ověřovací aplikace.
    </p>;
  }
  return <Image src={result.dataUrl} alt="QR kód pro přidání účtu do ověřovací aplikace"
    width={240} height={240} unoptimized className={styles.qrCode} />;
}
