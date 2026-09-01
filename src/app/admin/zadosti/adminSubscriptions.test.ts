import { describe, expect, it } from "vitest";

import {
  filterAdminSubscriptionDirectory,
  formatDaysUntilDue,
  getSubscriptionPlanPillClass,
  getSubscriptionStateLabel,
  prepareAdminSubscriptionPaymentUpdate,
  summarizeAdminSubscriptionDirectory,
  type AdminSubscriptionDirectoryRow,
} from "./adminSubscriptions";

const directoryRow = (
  overrides: Partial<AdminSubscriptionDirectoryRow> &
    Pick<AdminSubscriptionDirectoryRow, "email">
): AdminSubscriptionDirectoryRow => {
  const { email, ...rest } = overrides;
  return {
    email,
    fullName: null,
    managerEmail: null,
    position: null,
    subscription: {},
    ...rest,
  };
};

const rows = [
  directoryRow({
    email: "jana.novakova@example.cz",
    fullName: "Jana Nováková",
    managerEmail: "manager@example.cz",
    subscription: { effectiveState: "active", plan: "yearly" },
  }),
  directoryRow({
    email: "petr.svoboda@example.cz",
    subscription: { effectiveState: "grace", plan: "monthly" },
    flags: { isOverdue: true },
  }),
  directoryRow({
    email: "eva.nova@example.cz",
    subscription: { effectiveState: "active", plan: "semiannual" },
    flags: { isDueSoon: true, daysUntilDue: 3 },
  }),
];

describe("admin subscription rules", () => {
  it("filters overdue and due-soon directory rows", () => {
    expect(
      filterAdminSubscriptionDirectory(rows, "overdue", "").map((row) => row.email)
    ).toEqual(["petr.svoboda@example.cz"]);
    expect(
      filterAdminSubscriptionDirectory(rows, "dueSoon", "").map((row) => row.email)
    ).toEqual(["eva.nova@example.cz"]);
  });

  it("searches names, e-mails and manager e-mails", () => {
    expect(filterAdminSubscriptionDirectory(rows, "all", "nováková")).toEqual([
      rows[0],
    ]);
    expect(filterAdminSubscriptionDirectory(rows, "all", "manager@" )).toEqual([
      rows[0],
    ]);
    expect(filterAdminSubscriptionDirectory(rows, "all", "petr.svoboda")).toEqual([
      rows[1],
    ]);
  });

  it("derives all four directory counters", () => {
    expect(summarizeAdminSubscriptionDirectory(rows)).toEqual({
      total: 3,
      overdue: 1,
      dueSoon: 1,
      active: 2,
    });
  });

  it("keeps existing state and due-date labels", () => {
    expect(getSubscriptionStateLabel(rows[0])).toBe("Aktivní");
    expect(getSubscriptionStateLabel(rows[1])).toBe("Po splatnosti");
    expect(formatDaysUntilDue(0)).toBe("Končí dnes");
    expect(formatDaysUntilDue(1)).toBe("Končí za 1 den");
    expect(formatDaysUntilDue(3)).toBe("Končí za 3 dny");
    expect(formatDaysUntilDue(8)).toBe("Končí za 8 dní");
  });

  it("keeps distinct plan badge variants", () => {
    expect(getSubscriptionPlanPillClass("unlimited")).toContain("amber");
    expect(getSubscriptionPlanPillClass("monthly")).toContain("sky");
    expect(getSubscriptionPlanPillClass("semiannual")).toContain("indigo");
    expect(getSubscriptionPlanPillClass("yearly")).toContain("cyan");
  });

  it("normalizes and rounds a valid payment update payload", () => {
    expect(
      prepareAdminSubscriptionPaymentUpdate({
        email: "user@example.cz",
        paymentId: "payment-1",
        plan: "semiannual",
        amount: " 1 249,60 ",
        periodFrom: "2026-01-01",
        periodUntil: "2026-06-30",
        note: "Převodem",
      })
    ).toEqual({
      error: null,
      body: {
        action: "updatePayment",
        email: "user@example.cz",
        paymentId: "payment-1",
        plan: "semiannual",
        amountCzk: 1250,
        periodFrom: "2026-01-01",
        periodUntil: "2026-06-30",
        note: "Převodem",
      },
    });
  });

  it("preserves payment validation order", () => {
    const draft = {
      email: "user@example.cz",
      paymentId: "payment-1",
      plan: "monthly" as const,
      amount: "0",
      periodFrom: "",
      periodUntil: "",
      note: "",
    };

    expect(prepareAdminSubscriptionPaymentUpdate(draft).error).toBe(
      "Částka musí být kladné číslo v Kč."
    );
    expect(
      prepareAdminSubscriptionPaymentUpdate({ ...draft, amount: "500" }).error
    ).toBe("Vyplň začátek i konec období platby.");
    expect(
      prepareAdminSubscriptionPaymentUpdate({
        ...draft,
        amount: "500",
        periodFrom: "2026-02-01",
        periodUntil: "2026-01-01",
      }).error
    ).toBe("Konec období nesmí být před začátkem.");
  });
});
