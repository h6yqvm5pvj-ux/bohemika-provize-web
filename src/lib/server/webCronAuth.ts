import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import scheduler from "../../../web-scheduler.json";

const verifier = new OAuth2Client();

export async function isAuthorizedWebCronRequest(req: Request): Promise<boolean> {
  const path = new URL(req.url).pathname;
  if (!scheduler.jobs.some(job => job.path === path)) return false;
  const expected = (process.env.CRON_SECRET ?? "").trim();
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return !expected && process.env.NODE_ENV !== "production";
  }
  const received = header.slice(7).trim();
  if (expected && received) {
    const actualBytes = Buffer.from(received), expectedBytes = Buffer.from(expected);
    if (actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)) return true;
  }
  if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(received)) return false;
  try {
    // Google verifies the signature, issuer, expiry and exact destination.
    // Also pin the existing Scheduler identity; an ordinary Google/Firebase
    // user token must never authorize sending scheduled notifications.
    const ticket = await verifier.verifyIdToken({
      idToken: received,
      audience: `${scheduler.origin}${path}`,
    });
    const payload = ticket.getPayload();
    return payload?.email === scheduler.serviceAccountEmail && payload.email_verified === true;
  } catch {
    return false;
  }
}
