/** Local immutable context refresh release only: no credentials, install, network or deployment. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-context-2026-10-08.json"), "utf8"));
const previous = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-schedule-2026-10-08.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const allowed = new Set(["src/app/cashflow/cashflowServerPilot.client.ts", "src/app/cashflow/cashflowServerPilot.client.test.ts", "src/app/cashflow/useCashflowView.ts", "src/app/cashflow/useCashflowView.test.tsx", "src/app/api/cashflow/view/route.test.ts"]);
assert(manifest.contextFiles.length === allowed.size && manifest.contextFiles.every(file => allowed.has(file)));
assert(new Set(manifest.contextFiles).size === allowed.size);
assert.deepEqual(manifest.baseline.previousSchedulePatch, previous.codePatch);
assert.deepEqual([...manifest.files.map(file => file.path)].sort(),
  [...previous.files.map(file => file.path)].sort());
assert(/^[a-z0-9-]+\.patch$/.test(manifest.codePatch.file));
const patch = join(repo, "docs", manifest.codePatch.file);
assert.equal(hash(await readFile(patch)), manifest.codePatch.sha256);
const run = async (command, args, cwd, capture = false) => {
  const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", capture ? "pipe" : "ignore", "ignore"] });
  let output = "";
  if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  assert.equal(code, 0, "Local context release preparation failed");
  return output;
};
const prepared = JSON.parse(await run(process.execPath, ["scripts/prepare-cashflow-schedule-release.mjs"], repo, true));
await run("git", ["apply", "--check", patch], prepared.nextWorkingDirectory);
await run("git", ["apply", patch], prepared.nextWorkingDirectory);
for (const file of manifest.files) {
  assert.equal(hash(await readFile(join(prepared.nextWorkingDirectory, file.path))), file.sha256, "Context release source mismatch");
}
console.log(JSON.stringify({ prepared: true, workspace: prepared.workspace, nextWorkingDirectory: prepared.nextWorkingDirectory,
  referenceDirectory: prepared.referenceDirectory, files: manifest.files.length,
  contextPatchSha256: manifest.codePatch.sha256, productionChanged: false }));
