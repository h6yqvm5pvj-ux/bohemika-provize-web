"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { ArrowRight, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { createPasskeyForUser, getPasskeyAvailability, resolvePasskeyErrorMessage } from "@/app/lib/passkeys";
import styles from "./authSurface.module.css";

export function AccountSetupSuccess({ user, onContinue }: { user: User; onContinue: () => void }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void getPasskeyAvailability().then(result => { if (!cancelled) setSupported(result.supported); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const createPasskey = async () => {
    if (inFlight.current || created) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await createPasskeyForUser(user, "Moje zařízení");
      setCreated(true);
    } catch (error) {
      setError(resolvePasskeyErrorMessage(error, "Přístupový klíč se nepodařilo vytvořit. Můžeš to zkusit později v nastavení účtu."));
    } finally { inFlight.current = false; setBusy(false); }
  };

  return <section className={`${styles.card} ${styles.success}`}>
    <div className={styles.successMark}><CheckCircle2 size={32} aria-hidden="true" /></div>
    <h1 tabIndex={-1} data-setup-heading>Účet je připravený</h1>
    <p className={`${styles.muted} mt-3`}>Profil, kariéra i zabezpečení jsou nastavené. Můžeš začít používat aplikaci.</p>
    {supported && <div className={styles.passkeyOffer}>
      <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={18} aria-hidden="true" />{created ? "Přístupový klíč je uložený" : "Příště se přihlas přístupovým klíčem"}</div>
      <p className={`${styles.muted} mt-2 mb-4`}>{created ? "Při příštím přihlášení vyber přístupový klíč. Spravovat ho můžeš v nastavení účtu." : "Přihlašuj se otiskem prstu, rozpoznáním obličeje nebo PINem zařízení. Nastavení je volitelné."}</p>
      {created ? <p role="status" className="text-sm text-emerald-200">Připraveno pro příští přihlášení.</p> :
        <button type="button" className={`${styles.secondary} w-full`} disabled={busy} onClick={() => void createPasskey()}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{busy ? "Čekám na potvrzení…" : "Vytvořit přístupový klíč"}
        </button>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
    </div>}
    <button type="button" className={`${styles.primary} mt-6 w-full`} onClick={onContinue} disabled={busy}>Otevřít aplikaci <ArrowRight size={16} aria-hidden="true" /></button>
  </section>;
}
