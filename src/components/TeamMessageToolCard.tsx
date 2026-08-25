// src/components/TeamMessageToolCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";

type TeamOverviewApiResponse = {
  ok?: boolean;
  members?: Array<{
    managerEmail?: string | null;
  }>;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function TeamMessageToolCard() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [hasTeam, setHasTeam] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    const loadSubordinates = async () => {
      if (!user || !effectiveEmail) {
        setHasTeam(false);
        return;
      }

      try {
        const payload = await fetchAuthedJsonOrThrow<TeamOverviewApiResponse>(
          user,
          "/api/team-overview",
          { method: "GET" }
        );
        if (!alive) return;
        const members = Array.isArray(payload?.members) ? payload.members : [];
        const directSubCount = members.filter(
          (member) => normalizeEmail(member.managerEmail) === effectiveEmail
        ).length;
        setHasTeam(directSubCount > 0);
      } catch (e) {
        if (!alive) return;
        console.error("Chyba při načítání podřízených:", e);
        setHasTeam(false);
      }
    };

    if (user) {
      void loadSubordinates();
    }
    return () => {
      alive = false;
    };
  }, [effectiveEmail, user]);

  // není přihlášený nebo nemá tým → kartičku vůbec neukazujeme
  if (!user || !hasTeam) return null;

  return (
    <Link
      href="/pomucky/zprava-tymu"
      className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 sm:px-5 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)] flex flex-col justify-between hover:bg-white/10 transition"
    >
      <div>
        <h3 className="text-sm sm:text-base font-semibold text-slate-50">
          Odeslání notifikace týmu
        </h3>
        <p className="mt-1 text-xs sm:text-sm text-slate-300">
          Odešli krátkou zprávu podřízeným – zobrazí se jim jako push
          notifikace v mobilní aplikaci.
        </p>
      </div>
      <div className="mt-3 text-[11px] sm:text-xs text-emerald-300">
        Dostupné pouze pro manažery s nastaveným týmem.
      </div>
    </Link>
  );
}
