export const ACCOUNT_BLOCKED_MESSAGE =
  "Přístup k účtu je zablokován. Pro obnovení přístupu kontaktuj administrátora.";

export const ACCOUNT_BLOCKED_CODE = "auth/account-blocked";
export const ACCOUNT_SETUP_REQUIRED_CODE = "auth/security-setup-required";
export const ACCOUNT_SETUP_REQUIRED_MESSAGE = "Dokonči potvrzení e-mailu a nastavení 2FA. Účet není zablokovaný.";
export const MFA_REAUTH_REQUIRED_CODE = "auth/mfa-reauth-required";
export const MFA_REAUTH_REQUIRED_MESSAGE = "Z bezpečnostních důvodů se znovu přihlas heslem a kódem z ověřovací aplikace nebo přístupovým klíčem. Účet není zablokovaný.";
export const TOTP_CUSTOM_TOKEN_CLAIM = "app_totp_enrolled";

export function hasTotpFactor(user: {
  multiFactor?: { enrolledFactors?: ReadonlyArray<{ factorId: string }> };
}): boolean {
  return user.multiFactor?.enrolledFactors?.some(factor => factor.factorId === "totp") === true;
}

export function isAccountBlockedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === ACCOUNT_BLOCKED_CODE || code === "auth/user-disabled";
}
