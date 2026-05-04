// src/app/pomucky/TeamMessageToolCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { Position } from "../types/domain";

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

export function TeamMessageToolCard() {
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user?.email) {
        setShouldShow(false);
        setChecked(true);
        return;
      }

      try {
        const email = normalizeEmail(user.email);
        const payload = await fetchAuthedJsonOrThrow<TeamOverviewApiResponse>(
          user,
          "/api/team-overview",
          { method: "GET" }
        );
        const position = payload?.position ?? null;

        if (!isManagerPosition(position)) {
          setShouldShow(false);
          setChecked(true);
          return;
        }

        const members = Array.isArray(payload?.members) ? payload.members : [];
        const directSubCount = members.filter(
          (member) => normalizeEmail(member.managerEmail) === email
        ).length;

        setShouldShow(directSubCount > 0);
      } catch (err) {
        console.error("TeamMessageToolCard – chyba při ověřování:", err);
        setShouldShow(false);
      } finally {
        setChecked(true);
      }
    });

    return () => unsub();
  }, []);

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
