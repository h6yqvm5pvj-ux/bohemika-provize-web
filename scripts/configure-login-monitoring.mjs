#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { operatorCredential, operatorProjectId } from "./lib/google-operator-credentials.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const project = operatorProjectId(), mode = process.argv[2] || "prepare";
const directory = resolve(process.argv[3] || ".tmp/login-monitoring-release");
const view = `projects/${project}/locations/global/buckets/_Default/views/bohemika_auth_activity`;
const viewFilter = `source("projects/${project}") AND log_id("identitytoolkit.googleapis.com/requests")`;
const account = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const field = `projects/${project}/databases/(default)/collectionGroups/_authActivity/fields/expiresAt`;
async function main() {
  if (!["prepare", "apply", "verify"].includes(mode) || !account?.endsWith(`@${project}.iam.gserviceaccount.com`)) throw new Error("Invalid monitoring configuration.");
  const access = await operatorCredential().getAccessToken();
  async function api(url, method = "GET", body, allowMissing = false) {
    const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json", "x-goog-user-project": project },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Monitoring API failed (${response.status}).`);
    return response.json();
  }
  const identityUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
  const viewUrl = `https://logging.googleapis.com/v2/${view}`;
  const fieldUrl = `https://firestore.googleapis.com/v1/${field}`;
  const viewPolicyUrl = `${viewUrl}:getIamPolicy`;
  const snapshot = async () => {
    const config = await api(`${identityUrl}?fields=name,monitoring`), currentView = await api(viewUrl, "GET", undefined, true);
    return { config, view: currentView, policy: currentView ? await api(viewPolicyUrl, "POST", {}) : null, ttl: await api(fieldUrl) };
  };
  if (mode === "prepare") {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(directory, "monitoring-plan.json"), JSON.stringify({ project, account, view, viewFilter, preparedAt: new Date().toISOString(), before: await snapshot(),
      changes: ["Enable Identity Platform activity logs in existing 30-day log bucket", "Read access only to authentication log view", "90-day application audit TTL"] }, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Prepared monitoring configuration and saved previous settings."); return;
  }
  const plan = JSON.parse(await readFile(resolve(directory, "monitoring-plan.json"), "utf8"));
  if (plan.project !== project || plan.account !== account || plan.view !== view) throw new Error("Prepared project/identity changed.");
  if (mode === "apply") {
    let currentView = await api(viewUrl, "GET", undefined, true);
    if (!currentView) currentView = await api(`https://logging.googleapis.com/v2/projects/${project}/locations/global/buckets/_Default/views?viewId=bohemika_auth_activity`, "POST", { description: "Authentication activity only for the Bohemika admin panel", filter: viewFilter });
    if (currentView.filter !== viewFilter) throw new Error("Existing view has a different scope; refusing a broad grant.");
    const policy = await api(viewPolicyUrl, "POST", {});
    policy.bindings ||= [];
    let binding = policy.bindings.find(b => b.role === "roles/logging.viewAccessor" && !b.condition);
    if (!binding) { binding = { role: "roles/logging.viewAccessor", members: [] }; policy.bindings.push(binding); }
    const member = `serviceAccount:${account}`; if (!binding.members.includes(member)) binding.members.push(member);
    await api(`${viewUrl}:setIamPolicy`, "POST", { policy });
    await api(`${identityUrl}?updateMask=monitoring.requestLogging.enabled`, "PATCH", { monitoring: { requestLogging: { enabled: true } } });
    const operation = await api(`${fieldUrl}?updateMask=ttlConfig`, "PATCH", { ttlConfig: {} });
    const now = Date.now();
    // Record provider coverage without declaring the web release active yet.
    const settingsUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/_securityMonitoring/loginActivity`;
    const settings = await api(settingsUrl, "GET", undefined, true);
    if (!settings?.fields?.providerStartedAtMs?.integerValue) {
      await api(`${settingsUrl}?updateMask.fieldPaths=providerStartedAtMs`, "PATCH", { fields: { providerStartedAtMs: { integerValue: String(now) } } });
    }
    await writeFile(resolve(directory, "monitoring-applied.json"), JSON.stringify({ project, appliedAt: new Date(now).toISOString(), ttlOperation: operation.name, view }, null, 2), { mode: 0o600 });
    console.log("Authentication logging enabled; read access scoped to its view; audit TTL requested."); return;
  }
  const current = await snapshot();
  const valid = current.config.monitoring?.requestLogging?.enabled === true && current.view?.filter === viewFilter &&
    current.policy?.bindings?.some(b => b.role === "roles/logging.viewAccessor" && b.members.includes(`serviceAccount:${account}`));
  await writeFile(resolve(directory, "monitoring-verified.json"), JSON.stringify({ checkedAt: new Date().toISOString(), valid, current }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ valid, ttlState: current.ttl.ttlConfig?.state }));
  if (!valid) throw new Error("Monitoring configuration verification failed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Monitoring configuration failed."); process.exitCode = 1; });
