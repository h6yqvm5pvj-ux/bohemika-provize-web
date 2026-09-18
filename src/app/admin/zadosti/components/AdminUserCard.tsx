import { AlertCircle, CheckCircle2, ChevronRight, ShieldCheck } from "lucide-react";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { formatAccountTypeLabel, formatPositionLabel, nameFromEmail } from "../adminFormatters";
import type { AdminUserSummary } from "../adminUsers";
import styles from "../adminUsers.module.css";

export function AdminUserCard({ user, selected, missingCount, onSelect }: {
  user: AdminUserSummary;
  selected: boolean;
  missingCount: number;
  onSelect: () => void;
}) {
  const name = user.fullName || nameFromEmail(user.email);
  const status = user.disabled ? "Deaktivovaný účet" : missingCount ? `K doplnění: ${missingCount}` : "Kompletní profil";
  return (
    <button
      type="button"
      className={styles.userCard}
      aria-pressed={selected}
      aria-controls="admin-user-detail"
      onClick={onSelect}
    >
      <span className={styles.cardIdentity}>
        <ProfileAvatar src={user.profileAvatar} name={name} alt="" sizes="46px" className={styles.cardAvatar} />
        <span className={styles.cardName}>
          <strong title={name}>{name}</strong>
          <span title={user.email}>{user.email}</span>
        </span>
        <ChevronRight className={styles.cardArrow} size={16} aria-hidden="true" />
      </span>
      <span className={styles.cardMeta}>
        <span className={styles.cardRole}>
          {user.accountType === "tipster" ? "Tipař" : formatPositionLabel(user.position) || formatAccountTypeLabel(user.accountType)}
          {user.specialist && <ShieldCheck size={13} aria-label="Specialista dokumentů" />}
        </span>
        <span className={styles.cardStatus} data-tone={user.disabled ? "muted" : missingCount ? "warning" : "success"}>
          {user.disabled ? <span className={styles.statusDot} /> : missingCount ? <AlertCircle size={12} aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
          {status}
        </span>
      </span>
    </button>
  );
}
