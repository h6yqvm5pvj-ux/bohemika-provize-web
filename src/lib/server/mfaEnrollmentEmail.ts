import { sendAuthEmailMessage } from "./firebaseAuthEmail";

export function sendMfaEnrollmentCode(email: string, code: string, id: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid confirmation code.");
  const subject = "Potvrď nastavení 2FA v Bohemka.App";
  const intro = "Pro přidání nové ověřovací aplikace ke svému účtu zadej tento kód v Bohemka.App.";
  const validity = "Kód platí 10 minut a lze ho použít jen jednou. Nikomu ho nesděluj.";
  const warning = "Pokud jsi nastavení nezahájil/a, kód nikam nezadávej. Někdo mohl získat tvé heslo. Otevři přímo bohemka.app, změň heslo a kontaktuj správce.";
  return sendAuthEmailMessage(email, {
    subject,
    text: ["Bohemka.App", subject, intro, code, validity, warning].join("\n\n"),
    html: `<html lang="cs"><body style="font-family:Arial,sans-serif;background:#f3f1f8;padding:24px;color:#251d39"><main style="max-width:520px;margin:auto;background:white;border-radius:20px;padding:28px"><h1 style="font-size:24px">${subject}</h1><p>${intro}</p><p style="font-size:32px;letter-spacing:8px;text-align:center;padding:20px;background:#f3eff9;border-radius:12px">${code}</p><p>${validity}</p><p>${warning}</p></main></body></html>`,
  }, `mfa-enrollment-code-${id}`);
}
