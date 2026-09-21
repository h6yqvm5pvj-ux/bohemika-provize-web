import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { adminAccountAccessDescription, adminAccountAccessLabel, type AdminAccountAccess } from "@/lib/adminAccountAccess";
import styles from "../adminUsers.module.css";

export function AdminAccountAccessPanel({ access, isSelf, busy, confirming, onChange }: {
  access: AdminAccountAccess;
  isSelf: boolean;
  busy: boolean;
  confirming: boolean;
  onChange: (action: "activateAccount" | "blockAccount") => void;
}) {
  const blocked = access.state === "blocked";
  return <section className={styles.accessPanel} aria-label="Stav účtu">
    <div>
      <strong>Stav účtu</strong>
      <span className={styles.accessBadge} data-state={access.state}>
        {blocked ? <LockKeyhole size={13} aria-hidden="true" /> : <ShieldCheck size={13} aria-hidden="true" />}
        {adminAccountAccessLabel(access)}
      </span>
    </div>
    <p>{adminAccountAccessDescription(access)}</p>
    <button type="button" disabled={busy || isSelf || access.reason === "pending-revocation"}
      onClick={() => onChange(blocked ? "activateAccount" : "blockAccount")}
      className={styles.accessButton} data-action={blocked ? "activate" : "block"}>
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
      {busy ? "Ukládám…" : blocked ? "Aktivovat účet" : confirming ? "Potvrdit zablokování" : "Zablokovat účet"}
    </button>
    {isSelf ? <small>Stav vlastního administrátorského účtu zde nelze měnit.</small> : null}
  </section>;
}
