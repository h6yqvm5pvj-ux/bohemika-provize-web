import { PAYOUT_EXCEPTION_POSITION } from "@/app/lib/payoutPositionException";

const exceptionAccount = "jindrich.hajek@bohemika.eu";
const normalize = (email: string | null | undefined) => email?.trim().toLowerCase();

export function commissionPayoutPositionForOwner(
  ownerEmail: string | null | undefined,
  contract: { commissionOwnerEmail?: string | null; servicingOwnerEmail?: string | null }
) {
  const owner = normalize(ownerEmail);
  const recipient = normalize(contract.commissionOwnerEmail) || normalize(contract.servicingOwnerEmail) || owner;
  return owner === exceptionAccount && recipient === owner ? PAYOUT_EXCEPTION_POSITION : null;
}
