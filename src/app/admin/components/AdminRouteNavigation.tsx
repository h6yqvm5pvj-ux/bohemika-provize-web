"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { adminRoleAtLeast, canCreateUserAccounts, resolveAdminRoleFromClaims } from "@/lib/adminAccess";
import { AdminNavigation } from "../zadosti/components/AdminNavigation";
import type { AdminPage } from "./adminSections";

export function AdminRouteNavigation({ user, page }: { user: User | null; page: AdminPage }) {
  const [result, setResult] = useState<{ user: User; isAllowedAdmin: boolean; canCreateUsers: boolean; isOwnerAdmin: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (user) void user.getIdTokenResult().then(({ claims }) => {
      if (cancelled) return;
      const role = resolveAdminRoleFromClaims(user.email, claims);
      setResult({ user, isAllowedAdmin: adminRoleAtLeast(role, "admin"), canCreateUsers: canCreateUserAccounts(user.email, claims), isOwnerAdmin: role === "owner" });
    }).catch(() => { /* The page's authenticated API reports access errors. */ });
    return () => { cancelled = true; };
  }, [user]);
  if (!result || result.user !== user || (!result.isAllowedAdmin && !result.canCreateUsers)) return null;
  return <AdminNavigation activeSection={page} isAllowedAdmin={result.isAllowedAdmin} canCreateUsers={result.canCreateUsers} isOwnerAdmin={result.isOwnerAdmin} />;
}
