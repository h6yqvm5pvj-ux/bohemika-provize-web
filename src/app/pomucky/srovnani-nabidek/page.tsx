"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { useAdminImpersonationState } from "@/app/lib/useAdminImpersonation";
import { ComparisonEditor } from "./ComparisonEditor";
import styles from "./comparison.module.css";

export default function ComparisonPage() {
  const [session, setSession] = useState<{ user: User | null } | null>(null);
  const impersonation = useAdminImpersonationState();
  useEffect(() => onAuthStateChanged(auth, user => setSession({ user })), []);
  return <AppLayout active="tools"><div className={styles.workspace}>
    {!session ? <p role="status">Načítám editor…</p> : !session.user ? <p>Pro vytvoření srovnání se přihlas ke svému účtu.</p>
      : impersonation ? <p>Pro práci s klientským srovnáním ukonči režim zastoupení.</p>
        : <ComparisonEditor key={session.user.uid} user={session.user} />}
  </div></AppLayout>;
}
