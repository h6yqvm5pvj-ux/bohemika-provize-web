import { randomUUID } from "node:crypto";
import { sendAuthEmailMessage } from "./firebaseAuthEmail";
import { adminDb } from "./firebaseAdmin";

function message(title: string, paragraphs: string[], code?: string) {
  const text = ["BohemkaApp", title, ...paragraphs, ...(code ? [`Potvrzovací kód: ${code}`] : []),
    "Automatická zpráva z BohemkaApp. Na tento e-mail neodpovídej.", "https://bohemka.app"].join("\n\n");
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f1f8;font-family:Arial,Helvetica,sans-serif;color:#251d39"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="background:#352058;color:white;padding:26px 28px;border-radius:20px 20px 0 0;font-size:22px;font-weight:bold">BohemkaApp.</td></tr><tr><td style="padding:30px 28px;background:white;border-radius:0 0 20px 20px"><h1 style="font-size:26px;line-height:1.3;margin:0 0 24px">${title}</h1>${paragraphs.map(p => `<p style="font-size:15px;line-height:1.7;color:#493f5b">${p}</p>`).join("")}${code ? `<p style="padding:20px;background:#f3eff9;border-radius:12px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#5d329a">${code}</p>` : ""}<p style="margin-top:28px;font-size:12px;line-height:1.6;color:#81758e">Automatická zpráva z BohemkaApp. Na tento e-mail neodpovídej.<br>bohemka.app</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: title, text, html };
}

export function renderPasswordChangeCode(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid confirmation code format.");
  return message("Potvrzení změny hesla v BohemkaApp", [
    "V nastavení účtu byla zahájena změna hesla. Pro její potvrzení zadej v aplikaci tento kód.",
    "Kód platí 10 minut a lze jej použít pouze jednou. Nikomu ho nesděluj.",
    "Pokud jsi změnu nezahájil/a, kód nepoužívej. Heslo zatím nebylo změněno. Zkontroluj zabezpečení svého účtu.",
  ], code);
}

export function renderPasswordChanged() {
  return message("Vaše heslo v BohemkaApp bylo změněno", [
    "Heslo k tvému účtu v BohemkaApp bylo změněno. Pro další přihlášení použij nové heslo.",
    "Pokud jsi tuto změnu neprovedl/a, otevři přímo bohemka.app, použij Zapomenuté heslo a kontaktuj správce aplikace.",
    "Své heslo ani ověřovací kódy nikomu nesděluj. V této zprávě žádné heslo neposíláme.",
  ]);
}

/** Job contains no password, OTP, token, or client data. Accepted jobs are deleted. */
export async function deliverPasswordChanged(jobId: string): Promise<boolean> {
  if (!adminDb) return false;
  const ref = adminDb.collection("authPasswordChangeNotices").doc(jobId);
  const job = (await ref.get()).data();
  if (!job || typeof job.email !== "string" || !Number.isFinite(job.createdAtMs)) return false;
  try {
    await sendAuthEmailMessage(job.email, renderPasswordChanged(), `password-changed-${jobId}`);
    await ref.delete();
    return true;
  } catch {
    // Resend deduplicates retries using the stable key. Never log the job or recipient.
    return false;
  }
}

export async function queuePasswordChanged(email: string): Promise<{ jobId: string; sent: boolean }> {
  const jobId = randomUUID();
  if (!adminDb) throw new Error("Notification storage unavailable.");
  try {
    await adminDb.collection("authPasswordChangeNotices").doc(jobId).set({ email, createdAtMs: Date.now() });
  } catch {
    // The password is already changed; still attempt notification if the queue is unavailable.
    await sendAuthEmailMessage(email, renderPasswordChanged(), `password-changed-${jobId}`);
    return { jobId, sent: true };
  }
  return { jobId, sent: await deliverPasswordChanged(jobId) };
}

export async function retryPasswordChangedNotices() {
  if (!adminDb) throw new Error("Notification storage unavailable.");
  const jobs = await adminDb.collection("authPasswordChangeNotices").orderBy("createdAtMs").limit(20).get();
  let sent = 0;
  const deadline = Date.now() + 40_000;
  for (const job of jobs.docs) {
    if (Date.now() >= deadline) break;
    if (await deliverPasswordChanged(job.id)) sent++;
  }
  return { checked: jobs.size, sent };
}
