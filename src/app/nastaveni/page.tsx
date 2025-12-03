// src/app/nastaveni/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { User as FirebaseUser } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { AppLayout } from "@/components/AppLayout";
import type { Position, CommissionMode } from "../types/domain";

const POSITIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

const COMMISSION_MODES: { id: CommissionMode; label: string }[] = [
  { id: "accelerated", label: "Zrychlený" },
  { id: "standard", label: "Běžný" },
];

const GOAL_STEPS: number[] = Array.from(
  { length: (300_000 - 5_000) / 5_000 + 1 },
  (_, i) => 5_000 + i * 5_000
);

const SETTINGS_KEYS = {
  position: "settings.position",
  mode: "settings.mode",
  monthlyGoal: "settings.monthlyGoal",
  animatedBackground: "settings.animatedBackground",
};

function formatMoney(value: number): string {
  if (!value || Number.isNaN(value)) return "Nezvolen";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);
  const [animatedBackground, setAnimatedBackground] = useState<boolean>(true);

  const [canChangePosition, setCanChangePosition] = useState(true);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        router.push("/login");
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, [router]);

  // načtení metadat uživatele z Firestore
  useEffect(() => {
    const loadMeta = async () => {
      if (!user?.email) return;
      setLoadingMeta(true);

      try {
        const ref = doc(db, "users", user.email);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as any;

          // Pozice
          if (data.position) {
            setPosition(data.position as Position);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.position,
                data.position as string
              );
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.position
            ) as Position | null;
            if (stored) setPosition(stored);
          }

          // Režim provize
          if (data.commissionMode) {
            setMode(data.commissionMode as CommissionMode);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.mode,
                data.commissionMode as string
              );
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.mode
            ) as CommissionMode | null;
            if (stored) setMode(stored);
          }

          // Měsíční cíl
          if (typeof data.monthlyGoal === "number") {
            setMonthlyGoal(data.monthlyGoal);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.monthlyGoal,
                String(data.monthlyGoal)
              );
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.monthlyGoal
            );
            const n = stored ? Number(stored) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
          }

          // Animované pozadí
          if (typeof data.animatedBackground === "boolean") {
            setAnimatedBackground(data.animatedBackground);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.animatedBackground,
                data.animatedBackground ? "1" : "0"
              );
            }
          } else if (typeof window !== "undefined") {
            const storedAnim = window.localStorage.getItem(
              SETTINGS_KEYS.animatedBackground
            );
            // defaultně zapnuto, pokud nic není
            setAnimatedBackground(storedAnim === "0" ? false : true);
          }

          setCanChangePosition(
            data.canChangePosition === false ? false : true
          );
        } else {
          // user dokument neexistuje → fallback na localStorage
          if (typeof window !== "undefined") {
            const storedPos = window.localStorage.getItem(
              SETTINGS_KEYS.position
            ) as Position | null;
            const storedMode = window.localStorage.getItem(
              SETTINGS_KEYS.mode
            ) as CommissionMode | null;
            const storedGoal = window.localStorage.getItem(
              SETTINGS_KEYS.monthlyGoal
            );
            const storedAnim = window.localStorage.getItem(
              SETTINGS_KEYS.animatedBackground
            );

            if (storedPos) setPosition(storedPos);
            if (storedMode) setMode(storedMode);
            const n = storedGoal ? Number(storedGoal) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);

            setAnimatedBackground(storedAnim === "0" ? false : true);
          }
        }
      } catch (e) {
        console.error("Chyba při načítání nastavení:", e);
      } finally {
        setLoadingMeta(false);
      }
    };

    loadMeta();
  }, [user]);

  async function saveUserFields(partial: Record<string, any>) {
    if (!user?.email) return;
    try {
      const ref = doc(db, "users", user.email);
      await setDoc(ref, partial, { merge: true });
    } catch (e) {
      console.error("Chyba při ukládání nastavení:", e);
    }
  }

  const handlePositionChange = async (value: Position) => {
    setPosition(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.position, value);
    }
    await saveUserFields({ position: value });
  };

  const handleModeChange = async (value: CommissionMode) => {
    setMode(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.mode, value);
    }
    await saveUserFields({ commissionMode: value });
  };

  const handleMonthlyGoalChange = async (value: number) => {
    setMonthlyGoal(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SETTINGS_KEYS.monthlyGoal,
        String(value || 0)
      );
    }
    await saveUserFields({ monthlyGoal: value || 0 });
  };

  const handleAnimatedBackgroundChange = async (value: boolean) => {
    setAnimatedBackground(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SETTINGS_KEYS.animatedBackground,
        value ? "1" : "0"
      );
    }
    await saveUserFields({ animatedBackground: value });
  };

  if (!user) {
    // redirect už běží, tady jen nerenderujeme nic
    return null;
  }

  return (
    <AppLayout active="settings">
      <div className="w-full max-w-5xl space-y-6">
        {/* HEADER */}
        <header className="mb-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Nastavení
          </h1>
          <p className="mt-1 text-sm text-slate-300 max-w-xl">
            Uprav si výchozí pozici, režim provizí, vzhled a svůj měsíční cíl.
          </p>
        </header>

        {loadingMeta ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl px-6 py-5 text-sm text-slate-200">
            Načítám nastavení…
          </div>
        ) : (
          <>
            {/* Pozice & režim provizí – jen když canChangePosition === true */}
            {canChangePosition && (
              <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Pozice &amp; režim provizí
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Pozice */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Výchozí pozice
                    </label>
                    <select
                      className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      value={position}
                      onChange={(e) =>
                        handlePositionChange(e.target.value as Position)
                      }
                    >
                      {POSITIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">
                      Tahle pozice se použije jako výchozí v kalkulačce.
                    </p>
                  </div>

                  {/* Režim provizí */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Výchozí režim provizí
                    </label>
                    <select
                      className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      value={mode}
                      onChange={(e) =>
                        handleModeChange(e.target.value as CommissionMode)
                      }
                    >
                      {COMMISSION_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">
                      Zrychlený / běžný režim se používá u životního pojištění.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Vzhled – animované pozadí */}
            <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Vzhled
              </h2>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Animované pozadí (plasma)
                  </div>
                  <p className="mt-1 text-xs text-slate-400 max-w-md">
                    Když animaci vypneš, pozadí „zamrzne“ a u slabších
                    zařízení to může zlepšit plynulost aplikace.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleAnimatedBackgroundChange(!animatedBackground)
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                    animatedBackground
                      ? "bg-emerald-400/80 border-emerald-300"
                      : "bg-slate-700 border-slate-500"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      animatedBackground ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* Výkon & cíle */}
            <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Výkon &amp; cíle
              </h2>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Měsíční cíl provizí
                  </label>
                  <span className="text-xs text-slate-400">
                    Aktuálně:{" "}
                    <span className="font-medium text-slate-100">
                      {monthlyGoal ? formatMoney(monthlyGoal) : "Žádný cíl"}
                    </span>
                  </span>
                </div>

                <select
                  className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={monthlyGoal}
                  onChange={(e) =>
                    handleMonthlyGoalChange(Number(e.target.value))
                  }
                >
                  <option value={0}>Žádný cíl</option>
                  {GOAL_STEPS.map((v) => (
                    <option key={v} value={v}>
                      {formatMoney(v)}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-slate-400">
                  Cíl se používá v přehledu na domovské stránce. Hodnota se
                  ukládá k tvému účtu.
                </p>
              </div>
            </section>

            {/* Účet */}
            <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Účet
              </h2>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                <div>
                  <div className="text-slate-300 text-xs uppercase tracking-wide">
                    E-mail účtu
                  </div>
                  <div className="mt-1 font-medium text-slate-50">
                    {user.email}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Odhlásit se můžeš kdykoliv pomocí tlačítka v levém panelu
                    dole.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}