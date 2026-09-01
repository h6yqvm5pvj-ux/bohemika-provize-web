import { describe, expect, it } from "vitest";

import {
  buildAdminBroadcastRecipientOptions,
  canSubmitAdminBroadcast,
  countAdminBroadcastGroups,
  isAdminBroadcastScheduleValid,
  prepareAdminBroadcastRequest,
  resolveAdminBroadcastRecipientLabel,
  resolveAdminBroadcastSchedule,
  resolveAdminBroadcastTarget,
} from "./adminBroadcast";
import type { AdminUsersRow } from "./adminUsers";

const userRow = (
  overrides: Partial<AdminUsersRow> & Pick<AdminUsersRow, "uid" | "email">
): AdminUsersRow => {
  const { uid, email, ...rest } = overrides;
  return {
    uid,
    email,
    fullName: null,
    agencyNumber: null,
    ico: null,
    phoneNumber: null,
    position: null,
    positionTimeline: [],
    accountType: null,
    managerEmail: null,
    tipRecipientEmail: null,
    commissionMode: null,
    specialist: false,
    accountSetupCompletedAt: null,
    disabled: false,
    emailVerified: false,
    createdAt: null,
    lastSignInAt: null,
    profileExists: false,
    privateProfileExists: false,
    mfa: {
      enabled: false,
      factorCount: 0,
      hasTotp: false,
      hasPhone: false,
      factors: [],
    },
    onlineCard: { enabled: false, slug: null, ready: false },
    ...rest,
  };
};

const users = [
  userRow({
    uid: "manager",
    email: " ZDENEK.VEDOUCI@example.cz ",
    fullName: "Zdeněk Vedoucí",
    accountType: "advisor",
    position: "manazer7",
    specialist: true,
  }),
  userRow({
    uid: "advisor",
    email: "alice.novakova@example.cz",
    fullName: "Alice Nováková",
    accountType: "advisor",
    position: "poradce4",
  }),
  userRow({
    uid: "tipster",
    email: "petr.tipster@example.cz",
    accountType: "tipster",
    position: "poradce1",
    specialist: true,
    disabled: true,
  }),
];

describe("admin broadcast rules", () => {
  it("builds normalized, labelled and Czech-sorted recipient options", () => {
    expect(buildAdminBroadcastRecipientOptions(users)).toEqual([
      {
        email: "alice.novakova@example.cz",
        label: "Alice Nováková",
        disabled: false,
      },
      {
        email: "petr.tipster@example.cz",
        label: "Petr Tipster",
        disabled: true,
      },
      {
        email: "zdenek.vedouci@example.cz",
        label: "Zdeněk Vedoucí",
        disabled: false,
      },
    ]);
  });

  it("keeps the existing advisor, manager and specialist group definitions", () => {
    expect(countAdminBroadcastGroups(users)).toEqual({
      advisors: 1,
      managers: 1,
      specialists: 1,
    });
  });

  it("resolves tool and custom targets with the same fallbacks", () => {
    expect(
      resolveAdminBroadcastTarget({
        targetPath: "/pomucky",
        toolTargetPath: "/pomucky/zlato",
        customTargetPath: "",
      })
    ).toEqual({ effectivePath: "/pomucky/zlato", label: "Pomůcky: Zlato" });
    expect(
      resolveAdminBroadcastTarget({
        targetPath: "__custom__",
        toolTargetPath: "/pomucky",
        customTargetPath: "   ",
      })
    ).toEqual({ effectivePath: "/", label: "Vlastní cesta" });
  });

  it("describes all, group and individual recipients", () => {
    const options = buildAdminBroadcastRecipientOptions(users);
    const groupCounts = countAdminBroadcastGroups(users);

    expect(
      resolveAdminBroadcastRecipientLabel({
        mode: "all",
        group: "advisors",
        email: "",
        options,
        groupCounts,
      })
    ).toBe("Všichni s aktivním push tokenem");
    expect(
      resolveAdminBroadcastRecipientLabel({
        mode: "group",
        group: "managers",
        email: "",
        options,
        groupCounts,
      })
    ).toBe("Manažeři (1 účtů)");
    expect(
      resolveAdminBroadcastRecipientLabel({
        mode: "single",
        group: "advisors",
        email: "ALICE.NOVAKOVA@EXAMPLE.CZ",
        options,
        groupCounts,
      })
    ).toBe("Alice Nováková (alice.novakova@example.cz)");
  });

  it("requires a scheduled send to be more than 30 seconds in the future", () => {
    const nowMs = new Date("2026-08-31T12:00:00.000Z").getTime();
    const schedule = resolveAdminBroadcastSchedule(
      "scheduled",
      "2026-08-31T12:01:00.000Z"
    );

    expect(schedule.scheduledAtIso).toBe("2026-08-31T12:01:00.000Z");
    expect(isAdminBroadcastScheduleValid("scheduled", schedule.scheduledAtMs, nowMs)).toBe(
      true
    );
    expect(isAdminBroadcastScheduleValid("scheduled", nowMs + 30_000, nowMs)).toBe(
      false
    );
  });

  it("allows submission only for a confirmed, complete and internal draft", () => {
    const base = {
      isAllowedAdmin: true,
      sending: false,
      confirmed: true,
      title: "Novinka",
      message: "Text zprávy",
      recipientMode: "all" as const,
      recipientEmail: "",
      recipientGroup: "advisors" as const,
      scheduleValid: true,
      targetPath: "/pomucky",
    };

    expect(canSubmitAdminBroadcast(base)).toBe(true);
    expect(canSubmitAdminBroadcast({ ...base, targetPath: "//example.com" })).toBe(false);
    expect(
      canSubmitAdminBroadcast({ ...base, recipientMode: "single", recipientEmail: "" })
    ).toBe(false);
    expect(canSubmitAdminBroadcast({ ...base, confirmed: false })).toBe(false);
  });

  it("prepares the exact normalized payload for a scheduled group send", () => {
    expect(
      prepareAdminBroadcastRequest({
        emoji: " 📣 ",
        title: " Nová pomůcka ",
        message: " Krátký text ",
        targetPath: " /pomucky/zlato ",
        recipientMode: "group",
        recipientEmail: "IGNORED@example.cz",
        recipientGroup: "managers",
        deliveryMode: "scheduled",
        scheduledAtIso: "2026-09-01T08:00:00.000Z",
        confirmed: true,
      })
    ).toEqual({
      error: null,
      body: {
        emoji: "📣",
        title: "Nová pomůcka",
        message: "Krátký text",
        targetPath: "/pomucky/zlato",
        targetMode: "group",
        recipientEmail: undefined,
        recipientGroup: "managers",
        scheduledAt: "2026-09-01T08:00:00.000Z",
      },
    });
  });

  it("keeps the existing validation order and confirmation messages", () => {
    const draft = {
      emoji: "📣",
      title: "",
      message: "",
      targetPath: "//external.example",
      recipientMode: "all" as const,
      recipientEmail: "",
      recipientGroup: "advisors" as const,
      deliveryMode: "now" as const,
      scheduledAtIso: null,
      confirmed: false,
    };

    expect(prepareAdminBroadcastRequest(draft).error).toBe("Vyplň nadpis notifikace.");
    expect(
      prepareAdminBroadcastRequest({
        ...draft,
        title: "Nadpis",
        message: "Text",
        targetPath: "/",
      }).error
    ).toBe("Potvrď, že chceš notifikaci odeslat všem uživatelům.");
  });
});
