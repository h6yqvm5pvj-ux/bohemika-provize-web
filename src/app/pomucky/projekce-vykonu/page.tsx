"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import { POSITION_LABELS } from "@/app/lib/formatters";
import type { Position } from "@/app/types/domain";
import { ProjectionPlanner } from "./ProjectionPlanner";
import styles from "./projection.module.css";

export default function ProjectionPage() {
  const [user, setUser] = useState<User | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [profile, setProfile] = useState<{ email: string; position: Position } | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user || !effectiveEmail) return;
    let alive = true;
    const email = effectiveEmail;
    void fetchAuthedJsonOrThrow<{ profile?: { position?: string } }>(user, "/api/user/profile", { method: "GET" })
      .then(payload => {
        if (!alive) return;
        const value = payload.profile?.position;
        setProfile({ email, position: value && Object.hasOwn(POSITION_LABELS, value) ? value as Position : "poradce1" });
      })
      .catch(() => { if (alive) setProfile({ email, position: "poradce1" }); });
    return () => { alive = false; };
  }, [user, effectiveEmail]);

  return <AppLayout active="tools">
    {user && effectiveEmail && profile?.email === effectiveEmail ? <ProjectionPlanner key={`${user.uid}:${effectiveEmail}`} storageKey={`bohemika:projection:v1:${user.uid}:${effectiveEmail}`} initialPosition={profile.position} /> : <div className={styles.loading} role="status">{user ? "Připravuji tvůj plán…" : "Projekce výkonu je dostupná po přihlášení."}</div>}
  </AppLayout>;
}
