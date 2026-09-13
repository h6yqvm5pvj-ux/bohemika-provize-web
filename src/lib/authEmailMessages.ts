const EMAIL_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Zadej platný e-mail.",
  "auth/too-many-requests": "Příliš mnoho žádostí o e-mail. Počkej několik minut a zkus to znovu.",
  "auth/quota-exceeded": "Odesílání e-mailů je dočasně vyčerpané. Zkus to později nebo kontaktuj podporu.",
  "auth/network-request-failed": "E-mail se nepodařilo vyžádat kvůli připojení. Zkontroluj síť a zkus to znovu.",
  "auth/operation-not-allowed": "Odesílání e-mailů není pro aplikaci povolené. Kontaktuj podporu.",
  "auth/invalid-api-key": "Odesílání e-mailů není správně nastavené. Kontaktuj podporu.",
  "auth/app-not-authorized": "Odesílání e-mailů není pro tuto aplikaci povolené. Kontaktuj podporu.",
  "auth/configuration-not-found": "Odesílání e-mailů není správně nastavené. Kontaktuj podporu.",
  "auth/unauthorized-continue-uri": "Odkaz v e-mailu není správně nastavený. Kontaktuj podporu.",
  "auth/invalid-continue-uri": "Odkaz v e-mailu není správně nastavený. Kontaktuj podporu.",
  "auth/missing-continue-uri": "Odkaz v e-mailu není správně nastavený. Kontaktuj podporu.",
  "auth/user-token-expired": "Přihlas se znovu a potom znovu požádej o ověřovací e-mail.",
  "auth/invalid-user-token": "Přihlas se znovu a potom znovu požádej o ověřovací e-mail.",
  "auth/user-disabled": "Účet je deaktivovaný. Kontaktuj podporu.",
};

export const PASSWORD_RESET_REQUESTED_MESSAGE =
  "Pokud k tomuto e-mailu existuje účet, přijde ti odkaz pro obnovení hesla. Zkontroluj i spam. Doručení může trvat několik minut.";

export const MFA_VERIFICATION_SENT_MESSAGE =
  "Ověřovací e-mail byl vyžádán. Otevři odkaz ve schránce (zkontroluj i spam), vrať se sem, zadej heslo a znovu klikni na Zapnout 2FA. Doručení může trvat několik minut.";

export function resolveAuthEmailErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? EMAIL_ERROR_MESSAGES[code] ?? fallback : fallback;
}

// Log only known identifiers; SDK/SMTP messages may contain recipients or tokens.
export function safeAuthEmailErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && Object.hasOwn(EMAIL_ERROR_MESSAGES, code)
    ? code
    : "auth/email-request-failed";
}
