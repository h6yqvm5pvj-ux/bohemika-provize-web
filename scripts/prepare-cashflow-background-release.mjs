/** Local immutable release only: no credentials, install, network or deployment. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-background-2026-10-08.json"), "utf8"));
const previous = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-timezone-2026-10-08.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const allowed = new Set(["src/app/cashflow/cashflowServerPilot.client.ts", "src/app/cashflow/cashflowServerPilot.client.test.ts",
  "src/app/cashflow/useCashflowView.test.tsx", "src/app/api/cashflow/view/route.test.ts"]);
assert(manifest.backgroundFiles.length === allowed.size && manifest.backgroundFiles.every(file => allowed.has(file)));
assert(new Set(manifest.backgroundFiles).size === allowed.size);
assert.deepEqual(manifest.baseline.previousTimezonePatch, previous.codePatch);
assert.deepEqual(manifest.files.map(file => file.path), previous.files.map(file => file.path));
assert(/^[a-z0-9-]+\.patch$/.test(manifest.codePatch.file));
const patch = join(repo, "docs", manifest.codePatch.file);
assert.equal(hash(await readFile(patch)), manifest.codePatch.sha256);
const run = async (command, args, cwd, capture = false) => {
  const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", capture ? "pipe" : "ignore", "ignore"] });
  let output = "";
  if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  assert.equal(code, 0, "Local background release preparation failed");
  return output;
};
const prepared = JSON.parse(await run(process.execPath, ["scripts/prepare-cashflow-timezone-release.mjs"], repo, true));
await run("git", ["apply", "--check", patch], prepared.nextWorkingDirectory);
await run("git", ["apply", patch], prepared.nextWorkingDirectory);
for (const file of manifest.files) {
  assert.equal(hash(await readFile(join(prepared.nextWorkingDirectory, file.path))), file.sha256, "Background release source mismatch");
}
console.log(JSON.stringify({ prepared: true, workspace: prepared.workspace, nextWorkingDirectory: prepared.nextWorkingDirectory,
  referenceDirectory: prepared.referenceDirectory, files: manifest.files.length,
  backgroundPatchSha256: manifest.codePatch.sha256, productionChanged: false }));
