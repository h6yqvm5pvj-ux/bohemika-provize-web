// Runs inside the production build. Only high-entropy key fingerprints and
// security booleans are emitted; never credential values or message contents.
import { createHash } from "node:crypto";

if (process.env.VERCEL_ENV === "production") {
  const raw = process.env.MAILBOX_ENCRYPTION_KEY?.trim() || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw) || Buffer.from(raw, "base64").length !== 32) {
    throw new Error("Production mailbox encryption key is missing or invalid");
  }
  const memoryFallback = ["1", "true", "yes", "on"].includes(process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK?.trim().toLowerCase() || "");
  if (memoryFallback) throw new Error("Production rate limiting must not fall back to process memory");
  if (process.env.RATE_LIMIT_TRUSTED_IP_HEADERS?.trim() !== "x-vercel-forwarded-for") {
    throw new Error("Production rate limiting must use the platform-controlled IP header");
  }
  console.log(JSON.stringify({ productionSecurityConfig: true,
    mailboxKeyFingerprint: createHash("sha256").update(Buffer.from(raw, "base64")).digest("hex"),
    mailboxKeyId: process.env.MAILBOX_ENCRYPTION_KEY_ID?.trim() || "v1",
    rateLimitTrustedIpHeader: "x-vercel-forwarded-for", memoryFallback: false,
    sessionSigningConfigured: !!(process.env.APP_SESSION_SECRET || process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    cronSecretConfigured: !!process.env.CRON_SECRET,
  }));
}
