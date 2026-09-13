import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// This architectural check prevents an existing mutation entry point from
// silently escaping the durable barrier. Runtime concurrency and failure
// behavior is tested separately in cashflowMutationTracking.test.ts.
const mutationSources = [
  ["src/app/api/contracts/_lib/contractsApi.ts", ["handleContractsPrecheck", "handleContractsCreate", "handleContractsPatch", "handleContractsDelete", "processScheduledContractTransfers"]],
  ["src/app/api/commission-statements/route.ts", ["POST"]],
  ["src/app/api/team-overview/route.ts", ["PATCH"]],
  ["src/app/api/user/profile/route.ts", ["PATCH"]],
  ["src/app/api/user/create/route.ts", ["POST"]],
  ["src/app/api/admin/users/route.ts", ["PATCH", "DELETE"]],
  ["src/app/api/admin/subscriptions/route.ts", ["PATCH"]],
  ["src/app/api/user-requests/route.ts", ["PATCH"]],
  ["src/app/api/admin/data-health/route.ts", ["DELETE"]],
  ["src/lib/server/contractLifecycleMaintenance.ts", ["markExpiredPolicyEndContractsDozita"]],
  ["src/app/api/contracts/notes/route.ts", ["POST", "PATCH", "DELETE"]],
  ["src/app/api/contracts/attachment/route.ts", ["POST"]],
  ["src/app/api/contracts/anniversary-review/history.ts", ["appendReviewHistory"]],
] as const;

// These writes update only requests, production goals or independent read
// models, never the cashflow input documents. Keep exceptions explicit so a
// newly introduced SDK write requires a coverage decision.
const excludedWrites: Record<string, string[]> = {
  "src/app/api/contracts/_lib/contractsApi.ts": [
    "markLinkedAdvisorTipAsContracted|batch|commit",
    "markTeamOverviewOwnersDirty/commitBatch|batch|commit",
    "handleContractsPatch|adminDb|runTransaction",
    "handleContractsPatch|adminDb|runTransaction",
    "processScheduledContractTransfers|item.ref|set",
  ],
  "src/app/api/team-overview/route.ts": [
    "persistContractStatsToReadModel/commit|batch|commit",
    "invalidateTeamOverviewOwners/commit|batch|commit",
    "createEndCollaborationRequest|db|runTransaction",
    "approveEndCollaborationRequest|db|runTransaction",
    "approveEndCollaborationRequest|requestRef|set",
    "approveEndCollaborationRequest|requestRef|set",
    "rejectEndCollaborationRequest|db|runTransaction",
    "PATCH|adminDb .collection(TEAM_PRODUCTION_GOALS_COLLECTION) .doc(productionGoalsDocId(email, yearMonth))|set",
  ],
  "src/app/api/user-requests/route.ts": [
    "POST|docRef|set",
    "PATCH|adminDb|runTransaction",
    "PUT|adminDb|runTransaction",
    "DELETE|requestRef|delete",
  ],
  "src/app/api/admin/data-health/route.ts": [
    "markTeamOverviewOwnersDirty|batch|commit",
    "rebuildTeamOverviewReadModels/commit|batch|commit",
  ],
};

function isNamedCall(node: ts.Node, name: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
}

function enclosingFunctions(node: ts.Node): string {
  const names: string[] = [];
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) names.unshift(current.name.text);
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) names.unshift(current.name.text);
  }
  return names.join("/");
}

function isTracked(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (isNamedCall(current, "trackCashflowWrite")) return true;
  }
  return false;
}

describe("cashflow mutation source coverage", () => {
  for (const [file, entryPoints] of mutationSources) {
    it(`keeps ${file} mutations inside tracking`, () => {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const wrappedEntryPoints: string[] = [];
      const untracked: string[] = [];
      let trackedWrites = 0;

      const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name && entryPoints.some(name => name === node.name!.text)) {
          const first = node.body?.statements[0];
          if (first && ts.isReturnStatement(first) && first.expression && isNamedCall(first.expression, "withCashflowMutation")) {
            wrappedEntryPoints.push(node.name.text);
          }
        }

        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          const receiver = node.expression.expression.getText(source).replace(/\s+/g, " ");
          const returnedToTracker = ts.isArrowFunction(node.parent) && isNamedCall(node.parent.parent, "trackCashflowWrite");
          const awaited = ts.isAwaitExpression(node.parent) || ts.isReturnStatement(node.parent) || returnedToTracker;
          const isWrite = ["commit", "runTransaction"].includes(method) ||
            (awaited && ["set", "update", "delete", "add"].includes(method));
          // batchWriter delegates to the checked createProcessingBatchWriter;
          // its set/commit methods do not perform a second raw SDK write.
          if (isWrite && receiver !== "batchWriter") {
            if (isTracked(node)) trackedWrites += 1;
            else untracked.push(`${enclosingFunctions(node)}|${receiver}|${method}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);

      expect(wrappedEntryPoints.sort()).toEqual([...entryPoints].sort());
      expect(trackedWrites).toBeGreaterThan(0);
      expect(untracked.sort()).toEqual([...(excludedWrites[file] ?? [])].sort());
    });
  }

  it("keeps failed TIP cleanup blocking even when the response remains successful", () => {
    const source = readFileSync("src/app/api/admin/data-health/route.ts", "utf8");
    expect(source).toMatch(/catch \(error\) \{\s+markCashflowMutationIncomplete\(\);\s+cleanupWarnings\.push\(`TIP payout cleanup/);
    const contracts = readFileSync("src/app/api/contracts/_lib/contractsApi.ts", "utf8");
    const swallowedTipFailures = [...contracts.matchAll(/catch \((?:tipSyncErr|refreshTipSyncErr|tipReadErr|tipDeleteErr)\) \{([^}]+)/g)];
    expect(swallowedTipFailures).toHaveLength(7);
    for (const [, body] of swallowedTipFailures) expect(body).toMatch(/^\s*markCashflowMutationIncomplete\(\);/);
  });

  it("keeps partial statement processing blocked after an operational lookup failure", () => {
    const source = readFileSync("src/app/api/commission-statements/route.ts", "utf8");
    expect(source).toMatch(/catch \(error\) \{\s+markCashflowMutationIncomplete\(\);\s+result\.errors\.push\(`Smlouva/);
  });
});
