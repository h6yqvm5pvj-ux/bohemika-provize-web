import { describe, expect, it } from "vitest";

import {
  filterAdminSecurityRows,
  getMfaFactorLabel,
  summarizeAdminSecurityRows,
  type AdminSecurityUserRow,
} from "./adminSecurity";

const securityRow = (
  overrides: Partial<AdminSecurityUserRow> & Pick<AdminSecurityUserRow, "uid" | "email">
): AdminSecurityUserRow => {
  const { uid, email, ...rest } = overrides;
  return {
    uid,
    email,
    fullName: null,
    position: null,
    accountType: null,
    disabled: false,
    emailVerified: false,
    createdAt: null,
    lastSignInAt: null,
    lastRefreshAt: null,
    mfa: {
      enabled: false,
      factorCount: 0,
      hasTotp: false,
      hasPhone: false,
      factors: [],
    },
    ...rest,
  };
};

const rows: AdminSecurityUserRow[] = [
  securityRow({
    uid: "enabled",
    email: "jana.novakova@example.cz",
    fullName: "Jana Nováková",
    position: "manazer7",
    accountType: "advisor",
    emailVerified: true,
    mfa: {
      enabled: true,
      factorCount: 1,
      hasTotp: true,
      hasPhone: false,
      factors: [],
    },
  }),
  securityRow({
    uid: "disabled",
    email: "petr.svoboda@example.cz",
    position: "poradce3",
    accountType: "tipster",
  }),
];

describe("admin security presentation", () => {
  it("filters users by MFA state without changing their order", () => {
    expect(filterAdminSecurityRows(rows, "enabled", "").map((row) => row.uid)).toEqual([
      "enabled",
    ]);
    expect(filterAdminSecurityRows(rows, "disabled", "").map((row) => row.uid)).toEqual([
      "disabled",
    ]);
  });

  it("searches the same visible identity fields as the admin page", () => {
    expect(filterAdminSecurityRows(rows, "all", "nováková")).toEqual([rows[0]]);
    expect(filterAdminSecurityRows(rows, "all", "jana.novakova")).toEqual([rows[0]]);
    expect(filterAdminSecurityRows(rows, "all", "manažer 7")).toEqual([rows[0]]);
    expect(filterAdminSecurityRows(rows, "all", "tipař")).toEqual([rows[1]]);
  });

  it("derives the four dashboard metrics from rows", () => {
    expect(summarizeAdminSecurityRows(rows)).toEqual({
      total: 2,
      mfaEnabled: 1,
      mfaMissing: 1,
      emailVerified: 1,
    });
  });

  it("keeps existing labels for known and unknown factors", () => {
    expect(
      getMfaFactorLabel({
        uid: "totp",
        factorId: "totp",
        displayName: null,
        enrollmentTime: null,
        phoneNumber: null,
      })
    ).toBe("TOTP");
    expect(
      getMfaFactorLabel({
        uid: "custom",
        factorId: "custom",
        displayName: "Bezpečnostní klíč",
        enrollmentTime: null,
        phoneNumber: null,
      })
    ).toBe("Bezpečnostní klíč");
  });
});
