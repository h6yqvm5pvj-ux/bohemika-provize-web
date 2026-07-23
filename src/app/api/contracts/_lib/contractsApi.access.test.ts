import { describe, expect, it } from "vitest";

import { buildChildrenByManager } from "@/app/lib/teamHierarchy";

import type { ContractDoc, UserNode } from "./contractsApi.types";
import {
  buildFindAllowedOwnerSet,
  canManageContractOwner,
  extractEmailFromUnknown,
  hasContractAccess,
  isManagerPosition,
  normalizeAccessEmail,
  resolveAccountType,
  resolveContractFindScope,
  resolveContractListScope,
  resolveContractTeamAccess,
  selectedSubordinateEmailsFromParam,
  selectContractListOwners,
  shouldFetchTeamContractsInParallel,
} from "./contractsApi.access";

const user = (
  email: string,
  managerEmail: string | null,
  accountType: "advisor" | "tipster" = "advisor"
): UserNode => ({
  email,
  name: null,
  managerEmail,
  position: null,
  positionTimeline: null,
  accountType,
});

describe("contracts access helpers", () => {
  it("normalizes identity and profile inputs", () => {
    expect(normalizeAccessEmail(" Advisor@Example.COM ")).toBe(
      "advisor@example.com"
    );
    expect(extractEmailFromUnknown({ email: " Boss@Example.COM " })).toBe(
      "boss@example.com"
    );
    expect(extractEmailFromUnknown({ other: "x" })).toBe("");
    expect(resolveAccountType({ accountType: "TIPSTER" })).toBe("tipster");
    expect(resolveAccountType({ userRole: "tipster" })).toBe("tipster");
    expect(resolveAccountType({ userRole: "advisor" })).toBe("advisor");
    expect(isManagerPosition("manazer4")).toBe(true);
    expect(isManagerPosition("poradce5")).toBe(false);
  });

  it("allows contract access for owner, team members and manager snapshots", () => {
    const contract: ContractDoc = {
      userEmail: "owner@example.com",
      managerEmailSnapshot: "boss@example.com",
      managerChain: [{ email: "director@example.com" }],
      managerOverrides: [{ email: "override@example.com" }],
    };

    expect(
      hasContractAccess({
        viewerEmail: "owner@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
        contract: {},
      })
    ).toBe(true);
    expect(
      hasContractAccess({
        viewerEmail: "manager@example.com",
        teamEmails: [" owner@example.com "],
        ownerEmail: "OWNER@example.com",
        contract: {},
      })
    ).toBe(true);
    expect(
      hasContractAccess({
        viewerEmail: "boss@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
        contract,
      })
    ).toBe(true);
    expect(
      hasContractAccess({
        viewerEmail: "director@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
        contract,
      })
    ).toBe(true);
    expect(
      hasContractAccess({
        viewerEmail: "override@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
        contract,
      })
    ).toBe(true);
    expect(
      hasContractAccess({
        viewerEmail: "other@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
        contract,
      })
    ).toBe(false);
  });

  it("checks direct owner management for owner, team and admin", () => {
    expect(
      canManageContractOwner({
        viewerEmail: "owner@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
      })
    ).toBe(true);
    expect(
      canManageContractOwner({
        viewerEmail: "manager@example.com",
        teamEmails: ["owner@example.com"],
        ownerEmail: "OWNER@example.com",
      })
    ).toBe(true);
    expect(
      canManageContractOwner({
        viewerEmail: "admin@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
        canManageContractsAsAdmin: true,
      })
    ).toBe(true);
    expect(
      canManageContractOwner({
        viewerEmail: "advisor@example.com",
        teamEmails: [],
        ownerEmail: "owner@example.com",
      })
    ).toBe(false);
  });

  it("builds team access from hierarchy and admin advisor visibility", () => {
    const users = [
      user("manager@example.com", null),
      user("advisor@example.com", "manager@example.com"),
      user("junior@example.com", "advisor@example.com"),
      user("tipster@example.com", "manager@example.com", "tipster"),
      user("outside@example.com", null),
    ];
    const childrenByManager = buildChildrenByManager(users);

    expect(
      resolveContractTeamAccess({
        viewerEmail: "manager@example.com",
        position: null,
        childrenByManager,
        users,
        canManageContractsAsAdmin: false,
      })
    ).toEqual({
      teamEmails: [
        "advisor@example.com",
        "tipster@example.com",
        "junior@example.com",
      ],
      contractAccessEmails: [
        "advisor@example.com",
        "tipster@example.com",
        "junior@example.com",
      ],
    });

    expect(
      resolveContractTeamAccess({
        viewerEmail: "manager@example.com",
        position: null,
        childrenByManager,
        users,
        canManageContractsAsAdmin: true,
      }).contractAccessEmails
    ).toEqual([
      "advisor@example.com",
      "tipster@example.com",
      "junior@example.com",
      "outside@example.com",
    ]);
  });

  it("resolves list and find scopes without leaking outside selected team", () => {
    expect(resolveContractListScope("team")).toBe("team");
    expect(resolveContractListScope("other")).toBe("my");
    expect(resolveContractFindScope("tip")).toBe("tip");
    expect(resolveContractFindScope("team")).toBe("team");
    expect(resolveContractFindScope("other")).toBe("my");

    const selected = selectedSubordinateEmailsFromParam(
      " advisor@example.com, outside@example.com "
    );
    expect(
      selectContractListOwners({
        scope: "team",
        viewerEmail: "manager@example.com",
        teamEmails: ["advisor@example.com", "junior@example.com"],
        selectedSubordinates: selected,
      })
    ).toEqual(["advisor@example.com"]);
    expect(
      selectContractListOwners({
        scope: "my",
        viewerEmail: " Manager@Example.COM ",
        teamEmails: ["advisor@example.com"],
        selectedSubordinates: selected,
      })
    ).toEqual(["manager@example.com"]);

    expect(
      buildFindAllowedOwnerSet({
        scope: "team",
        viewerEmail: "manager@example.com",
        teamEmails: [" Advisor@Example.COM "],
      })
    ).toEqual(new Set(["advisor@example.com"]));
    expect(
      buildFindAllowedOwnerSet({
        scope: "my",
        viewerEmail: " Manager@Example.COM ",
        teamEmails: ["advisor@example.com"],
      })
    ).toEqual(new Set(["manager@example.com"]));
    expect(
      buildFindAllowedOwnerSet({
        scope: "tip",
        viewerEmail: "tipster@example.com",
        teamEmails: ["advisor@example.com"],
      })
    ).toBeNull();
  });

  it("fetches team contracts in parallel only for my scope with includeTeam", () => {
    expect(
      shouldFetchTeamContractsInParallel({
        scope: "my",
        includeTeam: true,
        teamEmails: ["advisor@example.com"],
      })
    ).toBe(true);
    expect(
      shouldFetchTeamContractsInParallel({
        scope: "team",
        includeTeam: true,
        teamEmails: ["advisor@example.com"],
      })
    ).toBe(false);
    expect(
      shouldFetchTeamContractsInParallel({
        scope: "my",
        includeTeam: true,
        teamEmails: [],
      })
    ).toBe(false);
  });
});
