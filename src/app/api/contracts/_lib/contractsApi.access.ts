import type { Position } from "@/app/types/domain";
import { collectSubordinateHierarchy } from "@/app/lib/teamHierarchy";

import type { ContractDoc, UserNode } from "./contractsApi.types";

export type ContractListScope = "my" | "team";
export type ContractFindScope = "my" | "team" | "tip";

export const normalizeAccessEmail = (
  email: string | null | undefined
): string => (email ?? "").trim().toLowerCase();

/**
 * Zápisy z provizních výpisů patří autorovi výpisu. Manažer může vidět
 * zápisy své i celého svého podřízeného stromu, nikdy však zápisy nadřízených.
 * Výjimkou je správce smluv, který má oprávnění k celému systému smluv.
 */
export const canViewStatementDerivedRecord = ({
  viewerEmail,
  teamEmails,
  writtenBy,
  canViewAllStatementDerivedRecords = false,
}: {
  viewerEmail: string | null | undefined;
  teamEmails: Iterable<string | null | undefined>;
  writtenBy: string | null | undefined;
  canViewAllStatementDerivedRecords?: boolean;
}): boolean => {
  const normalizedWriter = normalizeAccessEmail(writtenBy);
  if (!normalizedWriter) return false;

  if (canViewAllStatementDerivedRecords) return true;

  const normalizedViewer = normalizeAccessEmail(viewerEmail);
  if (normalizedWriter === normalizedViewer) return true;

  return uniqueNormalizedEmails(teamEmails).includes(normalizedWriter);
};

const uniqueNormalizedEmails = (emails: Iterable<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      Array.from(emails)
        .map((email) => normalizeAccessEmail(email))
        .filter(Boolean)
    )
  );

export const isManagerPosition = (
  pos: Position | null | undefined
): boolean => typeof pos === "string" && pos.startsWith("manazer");

export const resolveAccountType = (
  data: Record<string, unknown> | null | undefined
): "advisor" | "tipster" => {
  const raw =
    typeof data?.accountType === "string"
      ? data.accountType
      : typeof data?.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

export const extractEmailFromUnknown = (value: unknown): string => {
  if (typeof value === "string") return normalizeAccessEmail(value);
  if (value && typeof value === "object") {
    const nested = (value as { email?: string | null }).email;
    return normalizeAccessEmail(nested);
  }
  return "";
};

const includesEmailInCollection = (value: unknown, targetEmail: string): boolean => {
  if (!Array.isArray(value) || !targetEmail) return false;
  return value.some((item) => extractEmailFromUnknown(item) === targetEmail);
};

export const hasContractAccess = ({
  viewerEmail,
  teamEmails,
  ownerEmail,
  contract,
}: {
  viewerEmail: string;
  teamEmails: string[];
  ownerEmail: string;
  contract: ContractDoc;
}): boolean => {
  const normalizedViewer = normalizeAccessEmail(viewerEmail);
  const normalizedOwner = normalizeAccessEmail(ownerEmail);
  if (!normalizedViewer || !normalizedOwner) return false;
  if (normalizedViewer === normalizedOwner) return true;
  if (uniqueNormalizedEmails(teamEmails).includes(normalizedOwner)) return true;

  const contractOwnerEmail = normalizeAccessEmail(contract.userEmail);
  if (contractOwnerEmail && contractOwnerEmail === normalizedViewer) return true;

  const managerEmailSnapshot = normalizeAccessEmail(contract.managerEmailSnapshot);
  if (managerEmailSnapshot && managerEmailSnapshot === normalizedViewer) return true;

  if (includesEmailInCollection(contract.managerChain, normalizedViewer)) return true;
  if (includesEmailInCollection(contract.managerOverrides, normalizedViewer)) {
    return true;
  }

  return false;
};

export const canManageContractOwner = ({
  viewerEmail,
  teamEmails,
  ownerEmail,
  canManageContractsAsAdmin,
}: {
  viewerEmail: string;
  teamEmails: string[];
  ownerEmail: string;
  canManageContractsAsAdmin?: boolean;
}): boolean => {
  const normalizedViewer = normalizeAccessEmail(viewerEmail);
  const normalizedOwner = normalizeAccessEmail(ownerEmail);
  if (!normalizedViewer || !normalizedOwner) return false;
  if (normalizedViewer === normalizedOwner) return true;
  if (uniqueNormalizedEmails(teamEmails).includes(normalizedOwner)) return true;
  return canManageContractsAsAdmin === true;
};

export const resolveContractTeamAccess = ({
  viewerEmail,
  position,
  childrenByManager,
  users,
  canManageContractsAsAdmin,
}: {
  viewerEmail: string;
  position: Position | null;
  childrenByManager: Map<string, UserNode[]>;
  users: UserNode[];
  canManageContractsAsAdmin: boolean;
}): { teamEmails: string[]; contractAccessEmails: string[] } => {
  const normalizedViewer = normalizeAccessEmail(viewerEmail);
  const hasDirectSubs = (childrenByManager.get(normalizedViewer) ?? []).length > 0;
  const hierarchyTeamEmails =
    isManagerPosition(position) || hasDirectSubs
      ? collectSubordinateHierarchy(normalizedViewer, childrenByManager)
          .subordinateEmails
      : [];
  const teamEmails = uniqueNormalizedEmails(hierarchyTeamEmails);
  const adminContractAccessEmails = canManageContractsAsAdmin
    ? users
        .filter((user) => user.accountType === "advisor")
        .map((user) => user.email)
        .filter((userEmail) => normalizeAccessEmail(userEmail) !== normalizedViewer)
    : [];
  const contractAccessEmails = uniqueNormalizedEmails([
    ...teamEmails,
    ...adminContractAccessEmails,
  ]);

  return { teamEmails, contractAccessEmails };
};

export const resolveContractListScope = (
  value: string | null | undefined
): ContractListScope => (value === "team" ? "team" : "my");

export const selectedSubordinateEmailsFromParam = (
  value: string | null | undefined
): Set<string> =>
  new Set(
    (value ?? "")
      .split(",")
      .map((item) => normalizeAccessEmail(item))
      .filter(Boolean)
  );

export const selectContractListOwners = ({
  scope,
  viewerEmail,
  teamEmails,
  selectedSubordinates,
}: {
  scope: ContractListScope;
  viewerEmail: string;
  teamEmails: string[];
  selectedSubordinates: Set<string>;
}): string[] => {
  const normalizedViewer = normalizeAccessEmail(viewerEmail);
  const normalizedTeamEmails = uniqueNormalizedEmails(teamEmails);
  if (scope !== "team") return normalizedViewer ? [normalizedViewer] : [];
  if (selectedSubordinates.size === 0) return normalizedTeamEmails;
  return normalizedTeamEmails.filter((teamEmail) =>
    selectedSubordinates.has(teamEmail)
  );
};

export const shouldFetchTeamContractsInParallel = ({
  scope,
  includeTeam,
  teamEmails,
}: {
  scope: ContractListScope;
  includeTeam: boolean;
  teamEmails: string[];
}): boolean => scope === "my" && includeTeam && teamEmails.length > 0;

export const resolveContractFindScope = (
  value: string | null | undefined
): ContractFindScope =>
  value === "team" ? "team" : value === "tip" ? "tip" : "my";

export const buildFindAllowedOwnerSet = ({
  scope,
  viewerEmail,
  teamEmails,
}: {
  scope: ContractFindScope;
  viewerEmail: string;
  teamEmails: string[];
}): Set<string> | null => {
  if (scope === "tip") return null;
  if (scope === "team") return new Set(uniqueNormalizedEmails(teamEmails));
  return new Set(uniqueNormalizedEmails([viewerEmail]));
};
