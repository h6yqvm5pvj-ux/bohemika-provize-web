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
  if (access.reason === "activation-required") return "Uživatel musí dokončit potvrzení e-mailu a 2FA. Po dokončení pokračuje automaticky.";
  if (access.state === "setup") return "Účet je aktivní. Uživatel se přihlásí heslem, potvrdí kód z e-mailu a nastaví 2FA. Potom pokračuje bez ruční aktivace.";
  if (access.reason === "pending-revocation") return "Právě se mění zabezpečení účtu. Obnov přehled za chvíli.";
  if (access.state === "blocked") return "Přístup je zablokovaný. Aktivace umožní přihlášení; pokud chybí 2FA, uživatel pokračuje jeho nastavením.";
  return "Účet je aktivní. Zablokování ukončí jeho přístup a zneplatní přihlášené relace.";
}
