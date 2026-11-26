import { describe, expect, it } from "vitest";
import { planInvestmentArchiveImport } from "./investmentArchiveImport";
import { mergeInvestmentStatementPayouts } from "./investmentStatementPayouts";

function document(id: string, data: Record<string, unknown>) {
  return { id, data: () => data } as FirebaseFirestore.QueryDocumentSnapshot;
}

const row = (id: number, number: string, product: string, amount: number, client = "Testovací Jana") =>
  `<tr>${[id, number, "01.06.2020", "01.06.2020", client, "S", product, "BC101", 1000, "", "", "6", amount, 0]
    .map(value => `<td>${value}</td>`).join("")}</tr>`;

const statement = (id: string, day: string, ...rows: string[]) => document(id, {
  statementNumber: id,
  statementDate: day,
  html: `<div id="provize"><table>${rows.join("")}</table></div>`,
});

describe("investment archive import planning", () => {
  it("creates one current Investika contract and includes payments from every archived fund", () => {
    const old = statement("older", "31.08.2026",
      row(1, "100000001", "EFEKTIKA", 10), row(2, "100000002", "INVESTIKA", 100));
    const current = statement("current", "30.09.2026",
      row(1, "100000001", "INVESTIKA", 20), row(2, "100000001", "EFEKTIKA", -2),
      row(3, "100000003", "COLOS_NEMO", 3));
    const plan = planInvestmentArchiveImport([current, old], [], () => true);

    expect(plan.additions).toHaveLength(1);
    const candidate = plan.additions[0];
    expect(candidate).toMatchObject({
      contractNumber: "100000001", productKey: "investikaRealitniFond",
      clientName: "Jana Testovací", contractSignedDate: "2020-06-01",
    });
    expect(plan.review.unsupportedProduct).toBe(1);
    const payout = mergeInvestmentStatementPayouts({
      existing: [], statements: candidate.statements, viewer: "adviser@example.test", nowMs: 500,
    });
    expect(payout.incoming.map(entry => entry.amount).sort()).toEqual([-2, 10, 20]);
  });

  it("keeps existing contracts and skips conflicting clients or missing career positions", () => {
    const old = statement("older", "31.08.2026", row(1, "100000001", "INVESTIKA", 10));
    const current = statement("current", "30.09.2026",
      row(1, "100000001", "INVESTIKA", 20, "Jiný Klient"),
      row(2, "100000002", "EFEKTIKA", 2),
      row(3, "100000003", "INVESTIKA", 3));
    const existing = document("stored", { contractNumber: "100000003", productKey: "investikaRealitniFond" });
    const plan = planInvestmentArchiveImport([old, current], [existing], () => false);
    expect(plan.additions).toEqual([]);
    expect(plan.existing.map(item => item.entry.id)).toEqual(["stored"]);
    expect(plan.review).toMatchObject({ conflicting: 1, missingCareerPosition: 1 });
  });

  it("can create a contract from a complete zero-commission row without storing a payout", () => {
    const current = statement("current", "30.09.2026", row(1, "100000001", "INVESTIKA", 0));
    const plan = planInvestmentArchiveImport([current], [], () => true);
    expect(plan.additions).toHaveLength(1);
    expect(plan.additions[0].statements).toEqual([]);
  });
});
