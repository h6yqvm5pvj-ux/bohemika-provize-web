export type AuthEmailKind = "PASSWORD_RESET" | "VERIFY_EMAIL";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

/** No recipient names, client data, remote images, fonts or tracking resources. */
export function renderAuthEmail(kind: AuthEmailKind, actionUrl: string) {
  const reset = kind === "PASSWORD_RESET";
  const subject = reset ? "Obnovení hesla do Bohemka.App" : "Ověření e-mailu pro Bohemka.App";
  const title = reset ? "Nastav si nové heslo" : "Potvrď svůj e-mail";
  const button = reset ? "Nastavit nové heslo" : "Potvrdit e-mail";
  const intro = reset
    ? "Obdrželi jsme žádost o obnovení hesla k tvému účtu v Bohemka.App. Nové heslo si nastavíš pomocí tlačítka níže."
    : "Pro potvrzení své e-mailové adresy v Bohemka.App použij tlačítko níže.";
  const next = reset
    ? "Po nastavení nového hesla se vrať do aplikace a přihlas se."
    : "Po ověření se vrať do původní karty aplikace a pokračuj podle pokynů na obrazovce. Pokud už ji nemáš otevřenou, přihlas se znovu.";
  const validity = "Odkaz je jednorázový. Pokud jeho platnost vypršela, vyžádej si v aplikaci nový.";
  const ignore = reset
    ? "Pokud jsi o změnu hesla nežádal/a, tuto zprávu ignoruj. Samotným doručením e-mailu se heslo nezmění."
    : "Pokud jsi o ověření e-mailu nežádal/a, tuto zprávu můžeš ignorovat.";
  const href = escapeHtml(actionUrl);
  const text = ["Bohemka.App", title, "Ahoj,", intro, `${button}:`, actionUrl, next, validity, ignore,
    "Automatická zpráva z Bohemka.App. Na tento e-mail neodpovídej.", "bohemka.app"].join("\n\n");
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background-color:#f3f1f8;color:#251d39;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${title} v Bohemka.App. ${validity}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f1f8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:26px 28px;background-color:#181122;border-radius:20px 20px 0 0;">
<p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Bohemka.App</p>
<p style="margin:7px 0 0;color:#ded4f2;font-size:12px;letter-spacing:1.2px;">ZABEZPEČENÍ ÚČTU</p>
</td></tr>
<tr><td style="padding:32px 28px;background-color:#ffffff;border-radius:0 0 20px 20px;">
<h1 style="margin:0 0 24px;font-size:28px;line-height:1.2;letter-spacing:-0.7px;color:#251d39;">${title}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#493f5b;">Ahoj,</p>
<p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#493f5b;">${intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#8550db" style="border-radius:12px;mso-padding-alt:16px 24px;">
<a href="${href}" style="display:inline-block;padding:16px 24px;border:1px solid #8550db;border-radius:12px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;line-height:1.3;">${button}</a>
</td></tr></table>
<p style="margin:26px 0 14px;font-size:14px;line-height:1.6;color:#493f5b;">${next}</p>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#746a83;">${validity}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e9e3f1;padding-top:22px;">
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#746a83;">${ignore}</p>
<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#746a83;">Nefunguje tlačítko? Zkopíruj celý odkaz do prohlížeče:</p>
<p style="margin:0;font-size:11px;line-height:1.7;word-break:break-all;overflow-wrap:anywhere;"><a href="${href}" style="color:#8550db;text-decoration:underline;word-break:break-all;">${href}</a></p>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:22px 20px;color:#81758e;font-size:11px;line-height:1.8;">Automatická zpráva z Bohemka.App. Na tento e-mail neodpovídej.<br><span style="color:#635771;">bohemka.app</span></td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, text, html };
}
