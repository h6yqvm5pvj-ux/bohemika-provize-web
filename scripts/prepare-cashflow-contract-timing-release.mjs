/** Local immutable contract-timing release: no credentials, install, network or deployment. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-contract-timing-2026-10-10.json"), "utf8"));
const previous = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-timing-2026-10-09.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const allowed = new Set(["src/app/api/contracts/_lib/contractsApi.ts", "src/app/api/contracts/_lib/contractsApi.types.ts", "src/app/api/contracts/_lib/contractsApi.freshContext.test.ts", "src/app/cashflow/candidateCheckProtocol.ts", "src/app/cashflow/candidateCheckProtocol.test.ts", "src/app/cashflow/cashflowServerPilot.client.test.ts", "src/app/api/cashflow/view/route.test.ts", "src/lib/server/cashflowDiagnosticHttp.test.ts", "src/lib/server/cashflowContractTiming.ts", "src/lib/server/cashflowContractTiming.test.ts", "src/lib/server/cashflowShadowInputs.ts", "src/lib/server/cashflowShadowInputs.test.ts"]);
assert.deepEqual([...manifest.reviewFiles].sort(), [...allowed].sort());
assert.deepEqual(manifest.baseline.previousTimingPatch, previous.codePatch);
assert.deepEqual([...manifest.files.map(file => file.path)].sort(), [...previous.files.map(file => file.path),
  ...manifest.baseline.additionalSources.map(file => file.path), ...manifest.addedSources].sort());
assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
for (const file of previous.files.filter(file => !allowed.has(file.path))) {
  assert.equal(manifest.files.find(next => next.path === file.path)?.sha256, file.sha256, "Unrelated release source changed");
}
assert(/^[a-z0-9-]+\.patch$/.test(manifest.codePatch.file));
const patch = join(repo, "docs", manifest.codePatch.file);
assert.equal(hash(await readFile(patch)), manifest.codePatch.sha256);
const run = async (command, args, cwd, capture = false) => {
  const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", capture ? "pipe" : "ignore", "ignore"] });
  let output = "";
  if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  assert.equal(code, 0, "Local contract-timing release preparation failed");
  return output;
};
const changedPaths = (await run("git", ["apply", "--numstat", patch], repo, true)).trim().split("\n").map(line => line.split("\t")[2]);
assert.deepEqual([...changedPaths].sort(), [...allowed].sort(), "Patch changes an unapproved source");
const prepared = JSON.parse(await run(process.execPath, ["scripts/prepare-cashflow-timing-release.mjs"], repo, true));
for (const file of manifest.baseline.additionalSources) {
  assert.equal(hash(await readFile(join(prepared.nextWorkingDirectory, file.path))), file.sha256, "Original contract source mismatch");
}
for (const path of manifest.addedSources) {
  let present = false;
  try { await readFile(join(prepared.nextWorkingDirectory, path)); present = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  assert(!present, "New source unexpectedly exists in the original release");
}
await run("git", ["apply", "--check", patch], prepared.nextWorkingDirectory);
await run("git", ["apply", patch], prepared.nextWorkingDirectory);
for (const file of manifest.files) assert.equal(hash(await readFile(join(prepared.nextWorkingDirectory, file.path))), file.sha256, "Contract-timing source mismatch");
console.log(JSON.stringify({ prepared: true, workspace: prepared.workspace, nextWorkingDirectory: prepared.nextWorkingDirectory,
  referenceDirectory: prepared.referenceDirectory, files: manifest.files.length,
  contractTimingPatchSha256: manifest.codePatch.sha256, productionChanged: false }));
