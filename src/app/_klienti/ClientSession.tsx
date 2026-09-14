"use client";

import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { AppLayout } from "@/components/AppLayout";
import { canAccessClientCards } from "./clientAccess";
import { LoaderCircle } from "lucide-react";

export function ClientSession({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    const hide = () => flushSync(() => setUser(null));
    const show = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, []);
  if (!user || !canAccessClientCards(user.email)) return (
    <AppLayout active="clients"><p role="status" aria-busy={!user} className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-slate-600">
      {!user && <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-violet-600 motion-reduce:animate-none" />}
      {user ? "Klientská agenda není pro tento účet dostupná." : "Ověřuji přihlášení…"}
    </p></AppLayout>
  );
  return <div key={user.uid}>{children(user)}</div>;
}
