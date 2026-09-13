"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import {
  getContractTerminationContext,
  subscribeContractTerminationContext,
  type ContractTerminationContext,
} from "@/app/lib/contractTerminationPrivacy";

export function ContractTerminationSession({ children, fallback = null }: {
  children: (context: ContractTerminationContext) => ReactNode;
  fallback?: ReactNode;
}) {
  const context = useSyncExternalStore(subscribeContractTerminationContext, getContractTerminationContext, () => null);
  // Remount all fields and previews when the account or impersonation changes.
  return context ? <Fragment key={context.generation}>{children(context)}</Fragment> : fallback;
}
