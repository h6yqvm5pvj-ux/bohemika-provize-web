// src/app/pomucky/TeamMessageToolCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../firebase";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { Position } from "../types/domain";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

export function TeamMessageToolCard() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

  type TeamOverviewApiResponse = {
    ok?: boolean;
    position?: Position | null;
    members?: Array<{
      email?: string | null;
      managerEmail?: string | null;
    }>;
  };

  const normalizeEmail = (value: unknown): string =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!user || !effectiveEmail) {
        setShouldShow(false);
        setChecked(true);
        return;
      }

      try {
        const payload = await fetchAuthedJsonOrThrow<TeamOverviewApiResponse>(
          user,
          "/api/team-overview",
          { method: "GET" }
        );
        if (!alive) return;
        const position = payload?.position ?? null;

        if (!isManagerPosition(position)) {
          setShouldShow(false);
          setChecked(true);
          return;
        }

        const members = Array.isArray(payload?.members) ? payload.members : [];
        const directSubCount = members.filter(
          (member) => normalizeEmail(member.managerEmail) === effectiveEmail
        ).length;

        setShouldShow(directSubCount > 0);
      } catch (err) {
        if (!alive) return;
        console.error("TeamMessageToolCard – chyba při ověřování:", err);
        setShouldShow(false);
      } finally {
        if (alive) setChecked(true);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [effectiveEmail, user]);

  // dokud nevíme, nebo nemá tým, nic nezobrazuj
  if (!checked || !shouldShow) return null;

  return (
    <Link
      href="/pomucky/zprava-tymu"
      className="rounded-3xl border border-slate-300 bg-white  px-5 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:bg-white hover:border-emerald-400/70 transition cursor-pointer"
    >
      <h2 className="text-lg font-semibold mb-2">Zpráva týmu</h2>
      <p className="text-sm text-slate-600">
        Odešli týmu krátkou motivační nebo informační zprávu jako push
        notifikaci do mobilní aplikace.
      </p>
    </Link>
  );
}
