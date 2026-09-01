import type { AdminSecurityFactorRow } from "./adminSecurity";

export type AdminUsersRow = {
  uid: string;
  email: string;
  fullName: string | null;
  agencyNumber: string | null;
  ico: string | null;
  phoneNumber: string | null;
  position: string | null;
  positionTimeline: Array<{
    id: string;
    position: string;
    validFrom: string;
    validTo: string | null;
  }>;
  accountType: string | null;
  managerEmail: string | null;
  tipRecipientEmail: string | null;
  commissionMode: string | null;
  specialist: boolean;
  accountSetupCompletedAt: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  profileExists: boolean;
  privateProfileExists: boolean;
  mfa: {
    enabled: boolean;
    factorCount: number;
    hasTotp: boolean;
    hasPhone: boolean;
    factors: AdminSecurityFactorRow[];
  };
  onlineCard: {
    enabled: boolean;
    slug: string | null;
    ready: boolean;
  };
};

export type AdminUsersResponse = {
  ok?: boolean;
  users?: AdminUsersRow[];
  summary?: {
    total?: number;
    disabled?: number;
    missingProfile?: number;
  };
};
