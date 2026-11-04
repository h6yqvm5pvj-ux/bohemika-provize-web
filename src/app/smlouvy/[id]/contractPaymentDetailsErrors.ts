const messages = {
  session: "Přihlášení se mezitím změnilo. Obnov stránku a otevři platební údaje znovu.",
  invalidContractNumber: "U uložené smlouvy chybí platné číslo pro variabilní symbol.",
  pdfDownload: "PDF smlouvy se nepodařilo stáhnout. Ověř přístup k přiložené smlouvě a zkus to znovu.",
  pdfReaderLoad: "Čtečku PDF se nepodařilo načíst. Obnov stránku a zkus to znovu.",
  pdfRead: "Text přiloženého PDF se nepodařilo přečíst. Zkus načtení znovu.",
  contractMismatch: "Číslo smlouvy v přiloženém PDF neodpovídá otevřené smlouvě. Zkontroluj přiložené PDF.",
  paymentMissing: "V přiloženém PDF se nepodařilo ověřit úplné platební údaje. Otevři smlouvu a zkontroluj je.",
} as const;

export class ContractPaymentDetailsError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "ContractPaymentDetailsError";
  }
}

export function contractPaymentDetailsErrorMessage(error: unknown): string {
  return error instanceof ContractPaymentDetailsError && Object.hasOwn(messages, error.code)
    ? messages[error.code]
    : "Platební údaje se v PDF nepodařilo načíst. Otevři PDF smlouvy a zkontroluj je.";
}
