import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Local rendering only; no environment files, network, credentials or real action codes.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(repo, "src/lib/server/authEmailTemplate.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { renderAuthEmail } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const output = resolve(process.argv[2] || join(repo, "docs/security-audit-2026-09-13/email-previews"));
await mkdir(output, { recursive: true });
for (const [kind, name] of [["VERIFY_EMAIL", "overeni-emailu"], ["PASSWORD_RESET", "obnova-hesla"]]) {
  const preview = renderAuthEmail(kind, "https://example.invalid/ukazkovy-odkaz?nahled=1&neodesila=true");
  await writeFile(join(output, `${name}.html`), preview.html);
  await writeFile(join(output, `${name}.txt`), `Předmět: ${preview.subject}\n\n${preview.text}\n`);
}
console.log(`Náhledy s nefunkčními ukázkovými odkazy: ${output}`);
