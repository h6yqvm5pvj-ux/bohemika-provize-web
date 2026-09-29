// Vercel Hobby cannot schedule subdaily jobs. Keep their definitions in source
// control and provision them in the existing Firebase project's Cloud Scheduler.
// Default: read-only plan. --apply: create/update. --check: verify deployed jobs.
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { operatorCredential, operatorProjectId } from "./lib/google-operator-credentials.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const mode = process.argv[2] || "--plan";
if (!["--plan", "--apply", "--check"].includes(mode)) throw new Error("Use --plan, --apply or --check.");
const config = JSON.parse(await readFile("web-scheduler.json", "utf8"));
if (operatorProjectId() !== config.projectId || config.origin !== "https://bohemka.app" || config.location !== "europe-central2") {
  throw new Error("Unexpected scheduler project, origin or location.");
}
if (config.serviceAccountEmail !== "579896350733-compute@developer.gserviceaccount.com") throw new Error("Unexpected Scheduler identity.");
const managedDescription = "Bohemika web scheduler; managed by scripts/deploy-web-scheduler.mjs";
const allowedPaths = new Set(["/api/cron/admin-broadcasts", "/api/cron/mailbox-snooze-reminders"]);
for (const job of config.jobs) {
  if (!/^bohemika-web-[a-z-]+$/.test(job.id) || !allowedPaths.has(job.path) || !["* * * * *", "*/5 * * * *"].includes(job.schedule)) {
    throw new Error("Unexpected scheduler job definition.");
  }
}
if (config.jobs.length !== 2 || new Set(config.jobs.map(j => j.id)).size !== 2 || new Set(config.jobs.map(j => j.path)).size !== 2) {
  throw new Error("Expected exactly two distinct web scheduler jobs.");
}

const { access_token: accessToken } = await operatorCredential().getAccessToken();
const parent = `projects/${config.projectId}/locations/${config.location}`;

async function google(path, method = "GET", body) {
  const res = await fetch(`https://cloudscheduler.googleapis.com/v1/${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 404 && method === "GET") return null;
  if (!res.ok) throw new Error(`Cloud Scheduler ${method} failed (${res.status}); response suppressed.`);
  return res.json();
}
const results = [];
for (const definition of config.jobs) {
  const name = `${parent}/jobs/${definition.id}`;
  const desired = {
    name, description: managedDescription, schedule: definition.schedule, timeZone: "Etc/UTC",
    attemptDeadline: "180s", retryConfig: { retryCount: 0 },
    httpTarget: { uri: `${config.origin}${definition.path}`, httpMethod: "GET",
      oidcToken: { serviceAccountEmail: config.serviceAccountEmail, audience: `${config.origin}${definition.path}` } },
  };
  let current = await google(name);
  if (current && (current.description !== managedDescription || current.httpTarget?.uri !== desired.httpTarget.uri)) {
    throw new Error(`Refusing to overwrite an unmanaged job: ${definition.id}`);
  }
  if (mode === "--apply") {
    if (current) {
      await google(`${name}?updateMask=description,schedule,timeZone,attemptDeadline,retryConfig,httpTarget`, "PATCH", desired);
    } else {
      await google(`${parent}/jobs`, "POST", desired);
    }
    current = await google(name);
  }
  const matches = !!current && current.schedule === desired.schedule && current.timeZone === desired.timeZone &&
    current.httpTarget?.uri === desired.httpTarget.uri && current.httpTarget?.httpMethod === "GET" &&
    current.attemptDeadline === desired.attemptDeadline && (current.retryConfig?.retryCount || 0) === 0 &&
    current.state === "ENABLED" && current.httpTarget?.oidcToken?.serviceAccountEmail === config.serviceAccountEmail &&
    current.httpTarget?.oidcToken?.audience === desired.httpTarget.oidcToken.audience;
  if (mode !== "--plan" && !matches) throw new Error(`Scheduler verification failed: ${definition.id}`);
  results.push({ id: definition.id, path: definition.path, schedule: definition.schedule, exists: !!current, matches });
}
console.log(JSON.stringify({ mode, projectId: config.projectId, jobs: results }, null, 2));
