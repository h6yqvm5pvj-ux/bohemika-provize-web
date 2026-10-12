/** Prepare an immutable cashflow-only release against the inspected production
 * commit. Local files only; no .env, credentials, install, deployment or writes
 * to application data. Reinspect the production commit before a later rollout.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(repo, "docs");
const manifest = JSON.parse(await readFile(join(docs, "cashflow-server-pilot-release-2026-10-08.json"), "utf8"));
const check = (value, message) => { if (!value) throw new Error(message); };
const hash = value => createHash("sha256").update(value).digest("hex");
check(/^[a-f0-9]{40}$/.test(manifest.baseline.gitCommit), "Invalid baseline commit");
check(/^[a-z0-9-]+\.patch$/.test(manifest.codePatch.file), "Invalid patch filename");
check(hash(await readFile(join(docs, manifest.codePatch.file))) === manifest.codePatch.sha256, "Patch checksum mismatch");
const permitted = file => !file.includes("..") && (
  file.startsWith("src/app/cashflow/") || file.startsWith("src/app/api/cashflow/view/") ||
  file === "tests/security/api-authentication.test.ts" || file === "scripts/check-cashflow-server-pilot.mjs");
check(manifest.files.length > 0 && manifest.files.every(file => permitted(file.path)), "Invalid release scope");
check(new Set(manifest.files.map(file => file.path)).size === manifest.files.length, "Duplicate source file");
const workspace = await mkdtemp(join(tmpdir(), "bohemika-cashflow-server-release-"));
const base = join(workspace, "base");
const work = join(workspace, "work");
await mkdir(base);
const run = async (command, args, cwd) => {
  const child = spawn(command, args, { cwd, stdio: "ignore", shell: false });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  check(code === 0, `Local preparation failed: ${command}`);
};
const archiveFile = join(workspace, "baseline.tar");
const archive = spawn("git", ["archive", "--format=tar", manifest.baseline.gitCommit, "--",
  "src", "scripts", "tests", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "vitest.rules.config.ts",
  "next.config.ts", "eslint.config.mjs", "postcss.config.mjs", "public", "private", "README.md", "AGENTS.md", "components.json",
  "firebase.json", "firebase.rules-test.json", "firestore.indexes.json", "firestore.rules", "storage.rules", "vercel.json", "web-scheduler.json", ".vercelignore"],
{ cwd: repo, stdio: ["ignore", "pipe", "ignore"], shell: false });
const archiveExit = new Promise((resolve, reject) => { archive.once("error", reject); archive.once("exit", resolve); });
await pipeline(archive.stdout, createWriteStream(archiveFile, { mode: 0o600 }));
check(await archiveExit === 0, "Could not export baseline source");
await run("tar", ["-xf", archiveFile, "-C", base], repo);
await cp(base, work, { recursive: true, errorOnExist: true, force: false });
await run("git", ["apply", "--check", join(docs, manifest.codePatch.file)], work);
await run("git", ["apply", join(docs, manifest.codePatch.file)], work);
for (const file of manifest.files) {
  check(hash(await readFile(join(work, file.path))) === file.sha256, "Implementation source mismatch");
}
await symlink(join(repo, "node_modules"), join(base, "node_modules"), "dir");
await symlink(join(repo, "node_modules"), join(work, "node_modules"), "dir");
console.log(JSON.stringify({ prepared: true, workspace, baselineCommit: manifest.baseline.gitCommit,
  inspectedDeployment: manifest.baseline.deploymentId, files: manifest.files.length, productionChanged: false,
  nextWorkingDirectory: work, comparisonCommand: ["node", "scripts/check-cashflow-server-pilot.mjs", base] }));
