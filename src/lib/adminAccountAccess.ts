export type AdminAccountAccess = {
  state: "active" | "setup" | "blocked";
  reason: "disabled" | "persistent-block" | "pending-revocation" | "email-verification" | "mfa-enrollment" | "activation-required" | null;
};

export function adminAccountAccessLabel(access: AdminAccountAccess): string {
  if (access.state === "blocked") return "Blokovaný";
  if (access.state === "setup") return "Aktivní · nastavení 2FA";
  return "Aktivní";
}

export function adminAccountAccessDescription(access: AdminAccountAccess): string {
  if (access.reason === "activation-required") return "2FA je nastavené. Aktivací obnovíš přístup k aplikaci.";
  if (access.state === "setup") return "Uživatel se může přihlásit heslem a dokončit ověření e-mailu a nastavení 2FA. Přístup k datům je zatím uzavřený.";
  if (access.reason === "pending-revocation") return "Právě se mění zabezpečení účtu. Obnov přehled za chvíli.";
  if (access.state === "blocked") return "Přístup je zablokovaný. Aktivace umožní přihlášení; pokud chybí 2FA, uživatel pokračuje jeho nastavením.";
  return "Účet je aktivní. Zablokování ukončí jeho přístup a zneplatní přihlášené relace.";
}
