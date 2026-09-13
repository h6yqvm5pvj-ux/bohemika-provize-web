import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const scripts = [
  "backfill-manager-chain-timeline.ts",
  "fix-neon-immediate-split-items.mjs",
  "fix-flexi-immediate-split-items.mjs",
  "fix-legacy-manager-overrides-frequency.mjs",
  "fix-neon-manager-override-totals.mjs",
  "fix-allianz-auto-historical-coefficients.mjs",
  "fix-pillow-auto-historical-coefficients.mjs",
  "fix-csob-auto-historical-coefficients.mjs",
  "fix-uniqa-auto-historical-coefficients.mjs",
  "fix-kooperativa-auto-historical-coefficients.mjs",
  "backfill-domex-period-totals.mjs",
  "backfill-installment-commission-codes.mjs",
  "backfill-auto-subsequent-commission-items.mjs",
  "migrate-users-private-fields.mjs",
  "set-document-specialist.mjs",
  "set-online-card-slug.mjs",
  "backfill-contract-refs-team-overview.mjs",
  "backfill-neon-policy-end-dates.mjs",
  "backfill-contract-list-index-fields.mjs",
];

const namedCall = (node: ts.Node, name: string): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

describe("cashflow maintenance script coverage", () => {
  it("includes maintenance scripts that directly write the known source collections", () => {
    const discovered = readdirSync("scripts").filter(script => {
      if (!/\.(?:ts|mjs|cjs|js)$/.test(script)) return false;
      const file = `scripts/${script}`;
      const text = readFileSync(file, "utf8");
      if (!/\.collection(?:Group)?\(["'](?:users|usersPrivate|entries|tipPayouts|subscriptionPayments|commissionStatements)["']\)/.test(text)) return false;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      let writes = false;
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          if (["commit", "runTransaction"].includes(method) ||
            (ts.isAwaitExpression(node.parent) && ["set", "update", "delete", "add"].includes(method))) writes = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return writes;
    });
    expect(discovered.sort()).toEqual([...scripts].sort());
  });

  for (const script of scripts) {
    it(`fences the whole ${script} operation and every SDK commit`, () => {
      const file = `scripts/${script}`;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const errors: string[] = [];
      let mainCount = 0;
      let commits = 0;
      const visit = (node: ts.Node): void => {
        const isMain = (ts.isFunctionDeclaration(node) && node.name?.text === "main") ||
          (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent) && node.parent.name.getText(source) === "main");
        if (isMain && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node))) {
          mainCount += 1;
          const first = node.body && ts.isBlock(node.body) ? node.body.statements[0] : null;
          if (!first || !ts.isReturnStatement(first) || !first.expression || !namedCall(first.expression, "withCashflowScriptMutation")) {
            errors.push("main is outside the logical mutation barrier");
          }
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          const directWrite = ["commit", "runTransaction"].includes(method) ||
            (ts.isAwaitExpression(node.parent) && ["set", "update", "delete", "add"].includes(method));
          if (directWrite) {
            commits += 1;
            const callback = node.parent;
            const tracking = callback.parent;
            if (!ts.isArrowFunction(callback) || !namedCall(tracking, "trackCashflowScriptWrite")) {
              errors.push(`untracked ${method} on line ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
            } else {
              const expectedDatabase = ["backfill-neon-policy-end-dates.mjs", "backfill-contract-list-index-fields.mjs"].includes(script) ? "adminDb" : "db";
              if (tracking.arguments[1]?.getText(source) !== expectedDatabase) errors.push("write must track its own database");
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(mainCount).toBe(1);
      expect(commits).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }

  it("runs the expiry CLI through the already tracked shared lifecycle function", () => {
    const source = readFileSync("scripts/mark-expired-contracts-dozita.mjs", "utf8");
    expect(source).toContain("await markExpiredPolicyEndContractsDozita(");
    expect(source).not.toMatch(/\.(commit|runTransaction|set|update|delete)\(/);
  });
});
