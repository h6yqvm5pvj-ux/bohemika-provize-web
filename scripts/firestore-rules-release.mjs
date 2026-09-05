#!/usr/bin/env node
// Prepare a rules-only release with a recoverable previous ruleset. This script
// never reads/writes application documents, Storage objects or account claims.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { cert } from "firebase-admin/app";

const root = process.cwd();
const mode = process.argv[2] || "prepare";
const planDir = resolve(process.argv[3] || ".tmp/firestore-rules-release");
const hash = value => createHash("sha256").update(value).digest("hex");
const API = "https://firebaserules.googleapis.com/v1/";

async function main() {
  if (!["prepare", "deploy", "verify"].includes(mode)) throw new Error("Use prepare, deploy or verify, optionally followed by a plan directory.");
  nextEnv.loadEnvConfig(root, false, { info() {}, error() {} });
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS
    ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS)
    : {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      };
  const projectId = credentials.projectId || credentials.project_id;
  if (!projectId || !/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error("Missing or invalid Firebase project ID.");
  const access = await cert(credentials).getAccessToken();
  const call = async (path, method = "GET", body) => {
    const response = await fetch(API + path, {
      method, headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Rules API ${method} failed (${response.status}, ${data.error?.status || "unknown"}).`);
    return data;
  };
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const current = await call(releaseName);
  const ruleset = await call(current.rulesetName);
  const files = ruleset.source?.files;
  if (files?.length !== 1 || typeof files[0].content !== "string") throw new Error("Unexpected deployed rules source; inspect manually.");
  const before = files[0].content;
  const candidate = await readFile(resolve(root, "firestore.rules"), "utf8");
  const planFile = resolve(planDir, "plan.json");

  if (mode === "prepare") {
    await mkdir(planDir, { recursive: true, mode: 0o700 });
    const plan = {
      projectId, releaseName, previousRuleset: current.rulesetName,
      previousSha256: hash(before), candidateSha256: hash(candidate),
      preparedAt: new Date().toISOString(),
    };
    // Do not overwrite an earlier backup. Use a new directory for a new plan.
    await writeFile(resolve(planDir, "previous.rules"), before, { mode: 0o600, flag: "wx" });
    await writeFile(resolve(planDir, "candidate.rules"), candidate, { mode: 0o600, flag: "wx" });
    await writeFile(planFile, JSON.stringify(plan, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ mode, ...plan, planDir }, null, 2));
    return;
  }

  const plan = JSON.parse(await readFile(planFile, "utf8"));
  if (plan.projectId !== projectId || plan.releaseName !== releaseName || plan.candidateSha256 !== hash(candidate)) {
    throw new Error("Project or candidate changed since preparation; prepare and review a new plan.");
  }
  if (mode === "verify") {
    if (hash(before) !== plan.candidateSha256) throw new Error("Active Firestore rules do not match the prepared candidate.");
    console.log(JSON.stringify({ mode, projectId, matches: true, activeRuleset: current.rulesetName, sha256: hash(before) }, null, 2));
    return;
  }
  if (current.rulesetName !== plan.previousRuleset || hash(before) !== plan.previousSha256) {
    throw new Error("Active rules changed since preparation; do not overwrite another release.");
  }
  const created = await call(`projects/${projectId}/rulesets`, "POST", {
    source: { files: [{ name: "firestore.rules", content: candidate }] },
  });
  // Recheck immediately before switching the release; preserve concurrent work.
  const latest = await call(releaseName);
  if (latest.rulesetName !== plan.previousRuleset) throw new Error("Concurrent rules release detected; candidate was not activated.");
  await writeFile(resolve(planDir, "created-ruleset.json"), JSON.stringify({ rulesetName: created.name, previousRuleset: plan.previousRuleset }, null, 2), { mode: 0o600, flag: "wx" });
  await call(releaseName, "PATCH", { release: { name: releaseName, rulesetName: created.name }, updateMask: "rulesetName" });
  const active = await call(releaseName);
  const published = await call(active.rulesetName);
  if (published.source?.files?.length !== 1 || hash(published.source.files[0].content) !== plan.candidateSha256) {
    throw new Error("Release update returned, but verification failed; inspect active rules before any further action.");
  }
  const receipt = { projectId, previousRuleset: plan.previousRuleset, activeRuleset: active.rulesetName, sha256: plan.candidateSha256, deployedAt: new Date().toISOString(), verified: true };
  await writeFile(resolve(planDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(error => {
  // Never print SDK error objects: they may contain credential/request details.
  console.error(error instanceof Error && error.message.startsWith("Rules API ")
    ? error.message
    : `Rules release ${mode} failed: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`);
  process.exitCode = 1;
});
