import type { CommissionMode, Position } from "@/app/types/domain";

export type TeamMember = {
  email: string;
  name: string;
  position: Position | null;
  commissionMode: CommissionMode | null;
  managerEmail: string | null;
  docId: string;
  lastActiveTs: number | null;
  adminFunction: boolean;
};

export type Category =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "foreigners"
  | "comfort"
  | "other";

export type AggregateMetrics = {
  contracts: number;
  annualPremium: number;
  monthlyPremium: number;
};

export type ContractStats = {
  total: number;
  month: number;
  categories: Record<Category, number>;
  categoryMetrics: Record<Category, AggregateMetrics>;
  institutionMetrics: Record<string, AggregateMetrics>;
  institutionByCategory: Record<Category, Record<string, AggregateMetrics>>;
};

export type TeamOverviewSuccess = {
  ok: true;
  position: Position | null;
  canManagePositions: boolean;
  members: Array<{
    email: string;
    name: string;
    position: Position | null;
    commissionMode: CommissionMode | null;
    managerEmail: string | null;
    docId: string;
  }>;
  lastActive: Record<string, number | null>;
  contractCounts: Record<string, ContractStats>;
};

export type TeamOverviewError = {
  ok: false;
  error: string;
};

export type EndCollaborationRequestStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "failed";

export type EndCollaborationRequestPayload = {
  id: string;
  status: EndCollaborationRequestStatus;
  requestedByEmail: string;
  targetEmail: string;
  targetName: string;
  expectedManagerEmail: string | null;
  successorEmail: string;
  transferableContracts: number;
  directSubordinates: number;
  createdAtMs: number;
  updatedAtMs: number;
  decidedAtMs: number | null;
  decidedByEmail: string | null;
  decisionReason: string | null;
  summary: {
    successorEmail: string;
    transferredContracts: number;
    reassignedSubordinates: number;
  } | null;
  failureReason: string | null;
};

export type TeamOverviewPatchSuccess = {
  ok: true;
  targetEmail: string;
  updated: Array<
    | "position"
    | "positionTimeline"
    | "collaborationEnded"
    | "collaborationPreview"
    | "positionTimelineRead"
    | "collaborationRequestQueued"
    | "collaborationRequestApproved"
    | "collaborationRequestRejected"
  >;
  summary?: {
    successorEmail: string;
    transferredContracts: number;
    reassignedSubordinates: number;
  };
  preview?: {
    successorEmail: string;
    transferableContracts: number;
    directSubordinates: number;
    generatedAtMs: number;
  };
  positionTimeline?: Array<{
    id: string;
    position: Position;
    validFrom: string;
    validTo: string | null;
  }>;
  request?: EndCollaborationRequestPayload;
};

export type TeamOverviewEndCollaborationRequestsSuccess = {
  ok: true;
  requests: EndCollaborationRequestPayload[];
};
