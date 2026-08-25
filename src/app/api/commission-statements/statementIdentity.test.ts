import { describe, expect, it } from "vitest";

import { commissionStatementIdentityKey } from "./statementIdentity";

describe("commissionStatementIdentityKey", () => {
  it("identifies the same statement across different uploaded file hashes", () => {
    const first = commissionStatementIdentityKey({
      statementId: "7f0aacedb0ec93acfdbed7cc38f92fae",
      statementNumber: "15",
      statementPeriod: "01.07.2026 - 31.07.2026",
      statementDate: "24.08.2026",
    });
    const reuploaded = commissionStatementIdentityKey({
      statementId: "699827369cb5c76734d05bd608d943c4",
      statementNumber: " 15 ",
      statementPeriod: "01.07.2026  -  31.07.2026",
      statementDate: "24.08.2026",
    });

    expect(reuploaded).toBe(first);
  });

  it("keeps statements for different advisors separate", () => {
    const first = commissionStatementIdentityKey({
      statementNumber: "15",
      statementPeriod: "07/2026",
      statementDate: "24.08.2026",
      advisorNumber: "1001",
    });
    const second = commissionStatementIdentityKey({
      statementNumber: "15",
      statementPeriod: "07/2026",
      statementDate: "24.08.2026",
      advisorNumber: "1002",
    });

    expect(second).not.toBe(first);
  });

  it("falls back to the document ID for incomplete legacy metadata", () => {
    expect(
      commissionStatementIdentityKey({
        statementId: "legacy-hash",
        statementNumber: null,
        statementPeriod: null,
        statementDate: null,
      })
    ).toBe("id:legacy-hash");
  });
});

