// src/components/TeamMessageToolCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "../app/firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

export function TeamMessageToolCard() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [hasTeam, setHasTeam] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const loadSubordinates = async () => {
      if (!user?.email) {
        setHasTeam(false);
        return;
      }

      try {
        const email = user.email.trim().toLowerCase();
        const usersRef = collection(db, "users");
        const subsQ = query(usersRef, where("managerEmail", "==", email));
        const snap = await getDocs(subsQ);

        setHasTeam(!snap.empty); // true jen když máš alespoň jednoho podřízeného
      } catch (e) {
        console.error("Chyba při načítání podřízených:", e);
        setHasTeam(false);
      }
    };

    if (user) {
      loadSubordinates();
    }
  }, [user]);

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