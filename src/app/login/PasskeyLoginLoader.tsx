import { Fingerprint, KeyRound } from "lucide-react";
import type { PasskeySignInStage } from "@/app/lib/passkeys";

import styles from "./passkeyLoginLoader.module.css";

export type PasskeyLoginStage = PasskeySignInStage;

export function PasskeyLoginLoader({ stage, onCancel }: { stage: PasskeyLoginStage; onCancel?: () => void }) {
  const verifying = stage === "verification";
  const preparing = stage === "preparation";

  return (
    <div className={styles.loader} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.visual} aria-hidden="true">
        <span className={styles.halo} />
        <span className={styles.orbit} />
        <svg className={styles.spinner} viewBox="0 0 144 144" fill="none">
          <circle className={styles.track} cx="72" cy="72" r="64" />
          <circle className={styles.arc} cx="72" cy="72" r="64" pathLength="100" />
        </svg>
        <span className={styles.icon}>
          {verifying ? <Fingerprint size={44} strokeWidth={1.4} /> : <KeyRound size={38} strokeWidth={1.5} />}
        </span>
      </div>
      <p className={styles.eyebrow}>Přístupový klíč</p>
      <h2 className={styles.title}>{preparing ? "Připravuji přihlášení" : verifying ? "Ověřuji přihlášení" : "Dokončuji přihlášení"}</h2>
      <p className={styles.description}>
        {preparing
          ? "Spojuji se se serverem. Výzva k ověření se zobrazí za chvíli."
          : verifying
          ? "Potvrď přihlášení otiskem prstu, Face ID nebo PINem svého zařízení."
          : "Chvilku strpení, připravuji tvůj účet."}
      </p>
      <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
      {onCancel && <button type="button" className={styles.cancel} onClick={onCancel}>Zrušit přihlášení</button>}
    </div>
  );
}
