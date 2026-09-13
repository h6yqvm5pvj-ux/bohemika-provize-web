#!/usr/bin/env node
// No messages, action links, account reads, or configuration writes.
// Default: local checks only. --remote also reads project-level Auth settings.
import nextEnv from "@next/env";
import { cert } from "firebase-admin/app";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const clean = (value) => (value ?? "").trim().replace(/^['"]+|['"]+$/g, "");

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--remote")) {
    throw new Error("Použití: node scripts/check-auth-email-config.mjs [--remote]");
  }
  let credentials;
  try {
    const raw = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS || "null");
    if (raw?.project_id && raw?.client_email && raw?.private_key) {
      credentials = { projectId: raw.project_id, clientEmail: raw.client_email, privateKey: raw.private_key };
    }
  } catch { /* Try the split configuration, as the app does. */ }
  credentials ??= {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
  const project = clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const authDomain = clean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  console.log(JSON.stringify({
    scope: "local-configuration",
    webApiKeyPresent: Boolean(clean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)),
    serverEmailApiKeyPresent: Boolean(clean(process.env.FIREBASE_AUTH_EMAIL_API_KEY)),
    adminCredentialsPresent: Boolean(credentials.projectId && credentials.clientEmail && credentials.privateKey),
    clientAndAdminProjectMatch: Boolean(project && project === credentials.projectId),
    authDomainPresent: Boolean(authDomain),
    verificationContinueUrlIgnored: Boolean(process.env.EMAIL_VERIFICATION_CONTINUE_URL),
    resetContinueUrlIgnored: Boolean(process.env.PASSWORD_RESET_CONTINUE_URL),
    remoteRead: process.argv.includes("--remote"),
  }, null, 2));
  if (!process.argv.includes("--remote")) return;
  if (!project || project !== credentials.projectId || !/^[a-z0-9-]+$/.test(project)) {
    throw new Error("REMOTE_READ_SKIPPED_PROJECT_MISMATCH");
  }
  // Same read-only endpoint the browser SDK uses to load authorized domains.
  // This catches web keys that cannot be used by the server due to referrer restrictions.
  const emailApiKey = clean(process.env.FIREBASE_AUTH_EMAIL_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const publicConfig = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(emailApiKey)}`,
    { method: "GET", redirect: "error", signal: AbortSignal.timeout(15_000) }
  );
  const publicSettings = publicConfig.ok ? await publicConfig.json() : null;
  console.log(JSON.stringify({
    scope: "firebase-email-api-key-read-only",
    serverAuthConfigReadAllowed: publicConfig.ok,
    httpStatus: publicConfig.status,
  }, null, 2));
  const access = await cert(credentials).getAccessToken();
  const fields = "name,monitoring/requestLogging/enabled,signIn/email,notification/sendEmail(method,callbackUri,dnsInfo(useCustomDomain,customDomainState),verifyEmailTemplate/customized,resetPasswordTemplate/customized),authorizedDomains,emailPrivacyConfig";
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?fields=${encodeURIComponent(fields)}`,
    { method: "GET", headers: { Authorization: `Bearer ${access.access_token}` }, redirect: "error", signal: AbortSignal.timeout(15_000) }
  );
  if (!response.ok) throw new Error(`FIREBASE_CONFIG_HTTP_${response.status}`);
  const config = await response.json();
  // Firebase returns a numeric project ID from /v1/projects. Compare canonical
  // resource names, not the human-readable NEXT_PUBLIC_FIREBASE_PROJECT_ID.
  const canonicalProjectId = /^projects\/([^/]+)\/config$/.exec(config.name ?? "")?.[1];
  const email = config.notification?.sendEmail ?? {};
  let defaultActionHandler = !email.callbackUri;
  try {
    const url = new URL(email.callbackUri);
    defaultActionHandler = url.protocol === "https:" && url.hostname === `${project}.firebaseapp.com` && url.pathname === "/__/auth/action";
  } catch { /* Report malformed or absent handler without printing its value. */ }
  console.log(JSON.stringify({
    scope: "firebase-project-settings-read-only",
    emailApiKeyProjectMatch: canonicalProjectId && publicSettings?.projectId
      ? canonicalProjectId === publicSettings.projectId : null,
    authRequestLoggingEnabled: config.monitoring?.requestLogging?.enabled === true,
    emailPasswordSignInEnabled: config.signIn?.email?.enabled === true,
    emailDeliveryMethod: ["DEFAULT", "CUSTOM_SMTP"].includes(email.method) ? email.method : "UNSPECIFIED",
    defaultFirebaseActionHandler: defaultActionHandler,
    clientAuthDomainAuthorized: config.authorizedDomains?.includes(authDomain) === true,
    customSenderDomainEnabled: email.dnsInfo?.useCustomDomain === true,
    verificationTemplateCustomized: email.verifyEmailTemplate?.customized === true,
    resetTemplateCustomized: email.resetPasswordTemplate?.customized === true,
    emailEnumerationProtection: config.emailPrivacyConfig?.enableImprovedEmailPrivacy === true,
  }, null, 2));
}

main().catch((error) => {
  const message = typeof error?.message === "string" && /^(FIREBASE_CONFIG_HTTP_\d{3}|REMOTE_READ_SKIPPED_PROJECT_MISMATCH|Použití: .*)$/.test(error.message)
    ? error.message : "CONFIG_CHECK_FAILED (podrobnosti skryté kvůli ochraně přístupových údajů)";
  console.error(message);
  process.exitCode = 1;
});
