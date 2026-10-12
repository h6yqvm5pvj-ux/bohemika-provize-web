/** Local immutable release only. Does not read credentials/.env, install,
 * deploy, modify git or connect to any business data.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(repo, "docs/cashflow-server-pilot-timezone-2026-10-08.json"), "utf8"));
const digest = value => createHash("sha256").update(value).digest("hex");
assert(/^[a-z0-9-]+\.patch$/.test(manifest.codePatch.file));
const permitted = path => !path.includes("..") && (path.startsWith("src/app/cashflow/") || path.startsWith("src/app/api/cashflow/view/") ||
  ["package.json", "package-lock.json", "src/app/lib/calendarDates.ts", "src/app/lib/formatters.ts", "src/app/lib/kooperativaCPayoutMeaning.ts",
    "src/lib/server/cashflowCalendar.ts", "src/lib/server/cashflowCalendar.test.ts", "src/lib/server/cashflowShadowBudget.ts",
    "tests/security/api-authentication.test.ts", "scripts/check-cashflow-server-pilot.mjs", "scripts/check-cashflow-timezones.mjs"].includes(path));
assert(manifest.files.length && manifest.files.every(file => permitted(file.path)), "Unexpected timezone release scope");
assert(new Set(manifest.files.map(file => file.path)).size === manifest.files.length);
assert.equal(digest(await readFile(join(repo, "docs", manifest.codePatch.file))), manifest.codePatch.sha256);
const run = async (command, args, cwd, capture = false) => {
  const child = spawn(command, args, { cwd, stdio: ["ignore", capture ? "pipe" : "ignore", "ignore"], shell: false });
  let output = "";
  if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  assert.equal(code, 0, "Local release preparation failed");
  return output;
};
const prepared = JSON.parse(await run(process.execPath, ["scripts/prepare-cashflow-server-pilot-release.mjs"], repo, true));
assert.equal(prepared.baselineCommit, manifest.baseline.gitCommit);
const referenceDirectory = join(prepared.workspace, "pre-timezone");
await cp(prepared.nextWorkingDirectory, referenceDirectory, {
  recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true,
});
const patch = join(repo, "docs", manifest.codePatch.file);
await run("git", ["apply", "--check", patch], prepared.nextWorkingDirectory);
await run("git", ["apply", patch], prepared.nextWorkingDirectory);
for (const file of manifest.files) {
  assert.equal(digest(await readFile(join(prepared.nextWorkingDirectory, file.path))), file.sha256, "Release source checksum mismatch");
}
console.log(JSON.stringify({ prepared: true, workspace: prepared.workspace, nextWorkingDirectory: prepared.nextWorkingDirectory,
  referenceDirectory,
  originalPilotPatchSha256: manifest.baseline.previousPilotPatch.sha256, timezonePatchSha256: manifest.codePatch.sha256,
  files: manifest.files.length, productionChanged: false }));
