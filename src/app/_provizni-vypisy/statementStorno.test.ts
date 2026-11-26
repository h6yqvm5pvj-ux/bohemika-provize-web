import { describe, expect, it } from "vitest";

import {
  compareStatementStorno,
  groupStornoItemsByContract,
  groupStornoRowsByContract,
  indexStornoStatementPayments,
  stornoSystemUncertainty,
  statementReportsContractTermination,
  fullAutoStornoInferenceForGroup,
} from "./statementStorno";
import type {
  OtherPayment,
  StornoCommissionRow,
  ContractStatusRule,
  ParsedStatement,
  MatchedSystemContract,
} from "./statementTypes";

const stornoRow = (overrides: Partial<StornoCommissionRow> = {}): StornoCommissionRow => ({
  id: "row-1",
  detailUrl: null,
  contractNumber: "123 456",
  signedAt: "01. 05. 2026",
  client: "Jana Nováková",
  role: "",
  product: "KOO_AUTO",
  type: "A101",
  statusCode: "STORNO",
  base: 1_000,
  percent: "10",
  career: "Kar. 3",
  commission: -10.111,
  reserveFund: 1.111,
  ...overrides,
});

const otherPayment = (overrides: Partial<OtherPayment> = {}): OtherPayment => ({
  description: "Vratka provize",
  contractNumber: "123456",
  amount: -3.333,
  isB36Half: false,
  isStorno: true,
  ...overrides,
});

describe("storno helpers", () => {
  it("groups statement rows by normalized contract number and rounds their totals", () => {
    const groups = groupStornoRowsByContract([
      stornoRow(),
      stornoRow({ id: "row-2", contractNumber: "123456", commission: -2.222, reserveFund: -0.222 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      contractNumber: "123 456",
      totalCommission: -12.33,
      totalReserveFund: 0.89,
    });
  });

  it("merges statement stornos and other payments for the same contract", () => {
    const groups = groupStornoItemsByContract([stornoRow()], [otherPayment()]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      totalCommission: -10.11,
      totalOtherPayments: -3.33,
      totalAmount: -13.44,
    });
    expect(groups[0].payments[0]).toMatchObject({ index: 0, description: "Vratka provize" });
  });

  it("keeps no-contract rows separate and does not infer termination from an active system match", () => {
    const groups = groupStornoItemsByContract(
      [stornoRow({ id: "first", contractNumber: "" }), stornoRow({ id: "second", contractNumber: "" })],
      []
    );

    expect(groups).toHaveLength(2);
    expect(stornoSystemUncertainty({ status: "not_found", contracts: [] })).toBe(true);
    expect(
      stornoSystemUncertainty({
        status: "matched",
        contracts: [{ id: "active", adviserEmail: "a@example.com", status: "active" }],
      })
    ).toBe(false);
    expect(
      stornoSystemUncertainty({
        status: "matched",
        contracts: [{ id: "storno", adviserEmail: "a@example.com", status: "storno" }],
      })
    ).toBe(false);
  });

  const statusRules: ContractStatusRule[] = [
    { code: "A001", label: "Aktivní smlouva", category: "active", importDecision: "" },
    { code: "S001", label: "Stornovaná smlouva", category: "storno", importDecision: "" },
    { code: "C001", label: "Čekající smlouva", category: "pending", importDecision: "" },
  ];

  it.each([
    [[], false], [["A001"], false], [["UNKNOWN"], false], [["S999"], false], [["C001"], false],
    [["S001"], true], [[" s001 "], true], [["S001", "A001"], false], [["S001", "UNKNOWN"], false],
  ] as Array<[string[], boolean]>)("requires explicit, unambiguous contract termination for status codes %j", (codes, expected) => {
    expect(statementReportsContractTermination(codes.map(statusCode => ({ statusCode })), statusRules)).toBe(expected);
  });

  it("flags an active contract only when the statement explicitly reports termination", () => {
    const match = { status: "matched" as const, contracts: [{ id: "active", adviserEmail: "adviser@example.test", status: "active" }] };
    expect(stornoSystemUncertainty(match)).toBe(false);
    expect(stornoSystemUncertainty(match, true)).toBe(true);
  });

  it("compares the current and saved deductions by code without counting an imported statement twice", () => {
    const owner = "adviser@example.test";
    const group = groupStornoItemsByContract([
      stornoRow({ id: "1", product: "CPP_ACPIII", type: "AP101", commission: -600 }),
      stornoRow({ id: "2", product: "CPP_ACPIII", type: "A102", commission: -50 }),
      stornoRow({ id: "3", product: "KOO_AUTO", type: "A101", commission: -900 }),
    ], [])[0];
    const statement: ParsedStatement = { fileName: "synthetic.html", header: {
      advisorNumber: null, statementNumber: "test", statementDate: "31.07.2026", period: "07/2026",
    }, commissionRows: [], deductionRows: [], stornoRows: group.rows, otherPayments: [], contractStatusRules: statusRules,
    managerCommissions: [], lifeSplitContracts: [], otherProductContracts: [], unmatchedB36Payments: [], parseWarnings: [], payoutTotal: null };
    const contract: MatchedSystemContract = { id: "auto", adviserEmail: owner, status: "storno", productKey: "cppAuto",
      policyStartDate: "2026-05-01", stornoDate: "2026-06-15", commissionPayouts: [
        { code: "A101", amount: 1_000, writtenBy: owner, statementDate: "31.05.2026" },
        { code: "A102", amount: 50, writtenBy: owner, statementDate: "31.05.2026" },
        { code: "A101", amount: -400, writtenBy: owner, statementDate: "30.06.2026" },
      ] };
    const input = { group, header: statement.header, contract, statementId: "current", currentUserEmail: owner,
      payments: indexStornoStatementPayments(statement.commissionRows) };
    const expected = [
      { code: "A101", paid: 100_000, estimated: 100_000, deducted: 100_000, difference: 0 },
      { code: "A102", paid: 5_000, estimated: 5_000, deducted: 5_000, difference: 0 },
    ];
    expect(compareStatementStorno(input)).toEqual(expected);
    const imported = { ...contract, commissionPayouts: [...contract.commissionPayouts!,
      { code: "A101", amount: -600, writtenBy: owner, statementDate: "31.07.2026", statementId: "current" },
    ] };
    expect(compareStatementStorno({ ...input, contract: imported })).toEqual(expected);
    expect(compareStatementStorno({ ...input, currentUserEmail: "unrelated@example.test" })).toEqual([]);
    expect(compareStatementStorno({ ...input, contract: { ...contract, status: "active" } })).toEqual([]);
    expect(compareStatementStorno({ ...input, contract: { ...contract, contractNumber: "987654" } })).toEqual([]);
  });

  it.each(["A001", "UNKNOWN"])("does not suggest terminating a contract after a full commission reversal with status %s", statusCode => {
    const group = groupStornoItemsByContract([stornoRow({ statusCode, commission: -100, product: "CPP_ACPIII" })], [])[0];
    const statement: ParsedStatement = { fileName: "synthetic.html", header: { advisorNumber: null, statementNumber: "test", statementDate: "31.05.2026", period: "05/2026" },
      commissionRows: [], deductionRows: [], stornoRows: group.rows, otherPayments: [], contractStatusRules: statusRules,
      managerCommissions: [], lifeSplitContracts: [], otherProductContracts: [], unmatchedB36Payments: [], parseWarnings: [], payoutTotal: -100 };
    expect(fullAutoStornoInferenceForGroup({ statement, group, systemContract: {
      id: "active", adviserEmail: "adviser@example.test", status: "active", productKey: "cppAuto", policyStartDate: "2026-05-01",
      items: [{ code: "A101", title: "Okamžitá provize", amount: 100 }],
    } })).toBeNull();
  });
});
