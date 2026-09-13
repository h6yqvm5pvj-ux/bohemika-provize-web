/** Rebuild the home loading optimization with its exact production and frozen cashflow test baselines.
 * No secrets, deployment, package installation, database access or app changes.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(repo, "docs");
const manifest = JSON.parse(await readFile(join(docs, "home-loading-release-2026-09-12.json"), "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(message); };
check(/^[a-f0-9]{40}$/.test(manifest.baseline.gitCommit), "Invalid baseline commit");
for (const patch of [...manifest.baseline.patches, manifest.codePatch]) {
  check(/^[a-z0-9-]+\.patch$/.test(patch.file), "Invalid patch filename");
  check(hash(await readFile(join(docs, patch.file))) === patch.sha256, "Patch checksum mismatch");
}
const workspace = await mkdtemp(join(tmpdir(), "bohemika-home-release-reproduction-"));
const base = join(workspace, "base");
const productionBase = join(workspace, "production-base");
const work = join(workspace, "work");
check(manifest.baseline.patches.length === 3, "Expected exact three-patch production lineage");
await mkdir(base);
const run = async (command, args, cwd) => {
  const child = spawn(command, args, { cwd, stdio: "ignore", shell: false });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(code));
  });
  check(code === 0, `Local preparation failed: ${command}`);
};
const archiveFile = join(workspace, "baseline.tar");
const archive = spawn("git", ["archive", "--format=tar", manifest.baseline.gitCommit, "--",
  "src", "scripts", "tests", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "vitest.rules.config.ts", "next.config.ts", "eslint.config.mjs", "postcss.config.mjs", "public", "private", "README.md", "components.json", "firebase.json", "firebase.rules-test.json", "firestore.indexes.json", "firestore.rules", "storage.rules", "vercel.json"],
{ cwd: repo, stdio: ["ignore", "pipe", "ignore"], shell: false });
const archiveExit = new Promise((resolve, reject) => { archive.once("error", reject); archive.once("exit", resolve); });
await pipeline(archive.stdout, createWriteStream(archiveFile, { mode: 0o600 }));
check(await archiveExit === 0, "Could not export baseline source");
await run("tar", ["-xf", archiveFile, "-C", base], repo);
// The existing cashflow reference tests require the immutable pre-worker source in ../base.
for (const patch of manifest.baseline.patches.slice(0, 2)) {
  await run("git", ["apply", "--check", join(docs, patch.file)], base);
  await run("git", ["apply", join(docs, patch.file)], base);
}
await cp(base, productionBase, { recursive: true, errorOnExist: true, force: false });
await run("git", ["apply", "--check", join(docs, manifest.baseline.patches[2].file)], productionBase);
await run("git", ["apply", join(docs, manifest.baseline.patches[2].file)], productionBase);
await cp(productionBase, work, { recursive: true, errorOnExist: true, force: false });
await run("git", ["apply", "--check", join(docs, manifest.codePatch.file)], work);
await run("git", ["apply", join(docs, manifest.codePatch.file)], work);
for (const file of manifest.files) {
  check((["src/app/home/", "src/app/api/tip-payouts/list/"].some(prefix => file.path.startsWith(prefix)) || ["src/app/page.tsx", "tests/firestore/tipPayoutHome.test.ts"].includes(file.path)) && !file.path.includes(".."), "Invalid implementation file path");
  check(hash(await readFile(join(work, file.path))) === file.sha256, "Implementation source mismatch");
}
await symlink(join(repo, "node_modules"), join(work, "node_modules"), "dir");
console.log(JSON.stringify({ prepared: true, deployedBaseline: manifest.baseline.deploymentId, workspace,
  implementationFiles: manifest.files.length, productionChanged: false,
  nextWorkingDirectory: work, nextCommand: ["node", "node_modules/vitest/vitest.mjs", "run"] }));
