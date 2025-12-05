// src/app/pomucky/TeamMessageToolCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import type { Position } from "../types/domain";

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

export function TeamMessageToolCard() {
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user?.email) {
        setShouldShow(false);
        setChecked(true);
        return;
      }

      try {
        const email = user.email.trim().toLowerCase();
        const usersRef = collection(db, "users");

        // načtení pozice
        const meSnap = await getDoc(doc(usersRef, email));
        const position = meSnap.exists()
          ? (meSnap.data().position as Position | undefined)
          : undefined;

        if (!isManagerPosition(position)) {
          setShouldShow(false);
          setChecked(true);
          return;
        }

        // kontrola, jestli máš podřízené
        const subsQ = query(usersRef, where("managerEmail", "==", email));
        const subsSnap = await getDocs(subsQ);

        setShouldShow(subsSnap.docs.length > 0);
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
      className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:bg-white/10 hover:border-emerald-400/70 transition cursor-pointer"
    >
      <h2 className="text-lg font-semibold mb-2">Zpráva týmu</h2>
      <p className="text-sm text-slate-300">
        Odešli týmu krátkou motivační nebo informační zprávu jako push
        notifikaci do mobilní aplikace.
      </p>
    </Link>
  );
}