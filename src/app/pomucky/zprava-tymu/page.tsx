// src/app/pomucky/zprava-tymu/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "../../firebase";
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

type Subordinate = {
  email: string;
  name: string;
};

type TargetMode = "all" | "selected";

function formatNameFromEmail(email: string): string {
  const base = email.split("@")[0] ?? "";
  const parts = base.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;

  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  return parts.map(cap).join(" ");
}

export default function TeamMessagePage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // přihlášený user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      const email = fbUser?.email?.trim().toLowerCase() ?? null;
      setUserEmail(email);
    });
    return () => unsub();
  }, []);

  // načtení podřízených
  useEffect(() => {
    if (!userEmail) return;

    const load = async () => {
      setLoadingSubs(true);
      setErrorText(null);

      try {
        const usersRef = collection(db, "users");
        const subsQ = query(
          usersRef,
          where("managerEmail", "==", userEmail)
        );
        const snap = await getDocs(subsQ);

        const list: Subordinate[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const email = (data.email as string | undefined)?.toLowerCase() ?? d.id.toLowerCase();
          const name =
            (data.name as string | undefined) ?? formatNameFromEmail(email);
          return { email, name };
        });

        setSubordinates(
          list.sort((a, b) => a.name.localeCompare(b.name, "cs"))
        );
      } catch (e: any) {
        console.error("Chyba při načítání podřízených:", e);
        setErrorText("Chyba při načítání podřízených. Zkus to prosím znovu.");
      } finally {
        setLoadingSubs(false);
      }
    };

    load();
  }, [userEmail]);

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : [...prev, email]
    );
  };

  const trimmedMessage = messageText.trim();
  const canSend =
    !!userEmail &&
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= 200 &&
    (!loadingSubs || subordinates.length > 0) &&
    (targetMode === "all" || selectedEmails.length > 0) &&
    !sending;

  const handleSend = async () => {
    if (!canSend || !userEmail) return;

    setSending(true);
    setErrorText(null);

    try {
      const body: any = {
        managerEmail: userEmail,
        message: trimmedMessage.slice(0, 240),
        target: targetMode === "all" ? "all" : "selected",
      };

      if (targetMode === "selected") {
        body.recipients = selectedEmails;
      }

      const res = await fetch(
        "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/sendTeamMessage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const json = (await res.json()) as any;

      if (!json || json.ok !== true) {
        const msg =
          (json && json.error) ||
          "Server nevrátil úspěšnou odpověď.";
        throw new Error(msg);
      }

      setSendSuccess(true);
      setMessageText("");
      if (targetMode === "selected") {
        setSelectedEmails([]);
      }

      // po chvíli schovej hlášku
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (e: any) {
      console.error("Chyba při odesílání zprávy týmu:", e);
      setErrorText(
        e?.message ??
          "Nepodařilo se odeslat notifikaci. Zkus to prosím znovu."
      );
    } finally {
      setSending(false);
    }
  };

  const noSubordinates = !loadingSubs && subordinates.length === 0;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <header>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Zpráva týmu
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Odešli krátkou motivační nebo informační zprávu podřízeným
            přes push notifikaci v mobilní aplikaci.
          </p>
        </header>

        {/* Info pro uživatele bez práv / bez podřízených */}
        {!user && (
          <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-4 text-sm text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            Musíš být přihlášený, aby bylo možné odeslat zprávu týmu.
          </section>
        )}

        {user && noSubordinates && (
          <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-4 text-sm text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            Nemám u tebe v databázi žádné podřízené. Zkontroluj, že mají
            v kolekci <code className="text-xs">users</code> nastavený{" "}
            <code className="text-xs">managerEmail</code> na tvůj e-mail.
          </section>
        )}

        {/* 1) Úvodní karta */}
        <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 border border-sky-400/70 text-sky-800 text-lg">
              👥
            </span>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              Broadcast zpráva týmu
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Odešli krátkou motivační nebo informační zprávu podřízeným přes
            push notifikaci v jejich mobilní aplikaci.
          </p>
          {errorText && (
            <p className="text-xs text-rose-700 mt-1">{errorText}</p>
          )}
        </section>

        {/* 2) Komu poslat */}
        <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] space-y-3">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">
            Komu zprávu poslat?
          </h2>

          <div className="inline-flex rounded-full bg-white border border-slate-900 p-0.5 text-[11px] sm:text-xs">
            <button
              type="button"
              onClick={() => setTargetMode("all")}
              className={`px-3 py-1.5 rounded-full transition ${
                targetMode === "all"
                  ? "bg-white text-slate-900"
                  : "text-slate-800"
              }`}
            >
              Všichni podřízení
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("selected")}
              className={`px-3 py-1.5 rounded-full transition ${
                targetMode === "selected"
                  ? "bg-white text-slate-900"
                  : "text-slate-800"
              }`}
            >
              Vybraní poradci
            </button>
          </div>

          {targetMode === "all" && (
            <p className="text-xs text-slate-600">
              Zpráva bude odeslána všem aktuálně evidovaným podřízeným.
            </p>
          )}
        </section>

        {/* 3) Výběr podřízených – jen pokud režim "vybraní" */}
        {targetMode === "selected" && (
          <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] space-y-3">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900">
              Vyber konkrétní podřízené
            </h2>

            {loadingSubs ? (
              <p className="text-xs text-slate-600">Načítám podřízené…</p>
            ) : subordinates.length === 0 ? (
              <p className="text-xs text-slate-600">
                Nemám v databázi žádné podřízené. Zkontroluj, že mají v
                dokumentu <code className="text-xs">users</code> nastavený{" "}
                <code className="text-xs">managerEmail</code>.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {subordinates.map((sub) => {
                    const active = selectedEmails.includes(sub.email);
                    return (
                      <button
                        key={sub.email}
                        type="button"
                        onClick={() => toggleEmail(sub.email)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-slate-300 px-3 py-2 hover:bg-slate-100 transition">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {sub.name}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              {sub.email}
                            </div>
                          </div>
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                              active
                                ? "border-emerald-400 bg-emerald-500/20 text-emerald-800"
                                : "border-slate-400 bg-white text-slate-600"
                            }`}
                          >
                            {active ? "✓" : ""}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-600 mt-2">
                  Vybráno:{" "}
                  <span className="font-semibold">
                    {selectedEmails.length}
                  </span>{" "}
                  poradců
                </p>
              </>
            )}
          </section>
        )}

        {/* 4) Text zprávy */}
        <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] space-y-3">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">
            Text zprávy
          </h2>

          <div className="relative">
            <textarea
              className="w-full min-h-[140px] rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80 resize-vertical"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              maxLength={240}
              placeholder="Napiš krátkou zprávu pro tým…"
            />
            <div className="mt-1 flex justify-end">
              <span
                className={`text-[11px] ${
                  messageText.length > 200
                    ? "text-rose-700"
                    : "text-slate-500"
                }`}
              >
                {messageText.length}/200
              </span>
            </div>
          </div>
        </section>

        {/* 5) Tlačítko odeslat */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/70 bg-emerald-500/20 px-7 py-2.5 text-sm sm:text-base font-semibold text-emerald-800 shadow-[0_0_25px_rgba(16,185,129,0.55)] hover:bg-emerald-500/30 hover:border-emerald-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "Odesílám…" : "Odeslat notifikaci"}
          </button>
        </div>

        {sendSuccess && (
          <p className="text-center text-xs text-emerald-800">
            Notifikace byla úspěšně odeslána ✅
          </p>
        )}
      </div>
    </AppLayout>
  );
}