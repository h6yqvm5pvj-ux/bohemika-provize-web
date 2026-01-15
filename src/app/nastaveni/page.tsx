// src/app/nastaveni/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { User as FirebaseUser } from "firebase/auth";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { AppLayout } from "@/components/AppLayout";
import type { Position, CommissionMode } from "../types/domain";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";

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

type NotificationSettings = {
  types: {
    newContract: boolean;
    anniversary: boolean;
    unpaid: boolean;
    team: boolean;
  };
  channels: {
    email: boolean;
    push: boolean;
  };
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  types: {
    newContract: true,
    anniversary: true,
    unpaid: true,
    team: true,
  },
  channels: {
    email: true,
    push: true,
  },
};

const SETTINGS_KEYS = {
  position: "settings.position",
  mode: "settings.mode",
  monthlyGoal: "settings.monthlyGoal",
  backgroundColor: "settings.backgroundColor",
  reduceMotion: "settings.reduceMotion",
};

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

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

  const [canChangePosition, setCanChangePosition] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [fcmActive, setFcmActive] = useState<boolean | null>(null);
  const [notifyMinutes, setNotifyMinutes] = useState<number>(60);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [testPushStatus, setTestPushStatus] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<"black" | "blue">("black");
  const [reduceMotion, setReduceMotion] = useState(false);

  const applyMotionPreference = (off: boolean) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (off) {
      root.setAttribute("data-motion", "off");
    } else {
      root.removeAttribute("data-motion");
    }
  };

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
      if (!user) return;

      const emailRaw = user.email;
      const email = normalizeEmail(emailRaw);
      if (!email) return; // email může být teoreticky null

      setLoadingMeta(true);

      try {
        const ref = doc(db, "users", email);
        let snap = await getDoc(ref);

        if (!snap.exists() && emailRaw && emailRaw !== email) {
          const rawRef = doc(db, "users", emailRaw);
          const rawSnap = await getDoc(rawRef);
          if (rawSnap.exists()) {
            snap = rawSnap;
            try {
              await setDoc(ref, rawSnap.data(), { merge: true });
            } catch (e) {
              console.warn("Chyba při migraci uživatele na lowercase ID:", e);
            }
          }
        }

        if (snap.exists()) {
          const data = snap.data() as any;

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

          if (typeof data.notifyMinutes === "number") {
            setNotifyMinutes(data.notifyMinutes);
          }
          if (typeof data.backgroundColor === "string") {
            const c = data.backgroundColor as "black" | "blue";
            setBackgroundColor(c);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(SETTINGS_KEYS.backgroundColor, c);
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.backgroundColor
            ) as "black" | "blue" | null;
            if (stored) setBackgroundColor(stored);
          } else {
            setBackgroundColor("black");
          }

          if (typeof data.reduceMotion === "boolean") {
            setReduceMotion(data.reduceMotion);
            applyMotionPreference(data.reduceMotion);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.reduceMotion,
                data.reduceMotion ? "1" : "0"
              );
            }
          } else if (typeof window !== "undefined") {
            const storedMotion = window.localStorage.getItem(
              SETTINGS_KEYS.reduceMotion
            );
            if (storedMotion === "1") {
              setReduceMotion(true);
              applyMotionPreference(true);
            }
          }
          if (typeof data.fcmToken === "string" && data.fcmToken.trim().length > 0) {
            setFcmActive(true);
          } else {
            setFcmActive(false);
          }

          if (data.notificationSettings) {
            const incoming = data.notificationSettings as NotificationSettings;
            setNotificationSettings({
              types: { ...DEFAULT_NOTIFICATION_SETTINGS.types, ...(incoming.types ?? {}) },
              channels: { ...DEFAULT_NOTIFICATION_SETTINGS.channels, ...(incoming.channels ?? {}) },
            });
          }

          setCanChangePosition(
            data.canChangePosition === false ? false : true
          );
        } else {
          // user dokument neexistuje → zkusíme aspoň natáhnout z localStorage
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
            const storedColor = window.localStorage.getItem(
              SETTINGS_KEYS.backgroundColor
            ) as "black" | "blue" | null;

            if (storedPos) setPosition(storedPos);
            if (storedMode) setMode(storedMode);
            const n = storedGoal ? Number(storedGoal) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
            if (storedColor) setBackgroundColor(storedColor);
            const storedMotion = window.localStorage.getItem(
              SETTINGS_KEYS.reduceMotion
            );
            if (storedMotion === "1") {
              setReduceMotion(true);
              applyMotionPreference(true);
            }
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

  useEffect(() => {
    applyMotionPreference(reduceMotion);
  }, [reduceMotion]);

  async function saveUserFields(partial: Record<string, any>) {
    const email = normalizeEmail(user?.email);
    if (!email) return;

    try {
      const ref = doc(db, "users", email);
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

  const handleNotifyMinutesChange = async (value: number) => {
    setNotifyMinutes(value);
    await saveUserFields({ notifyMinutes: value });
  };

  const persistNotificationSettings = async (
    next: NotificationSettings,
    additional?: Record<string, any>
  ) => {
    setNotificationSettings(next);
    await saveUserFields({
      notificationSettings: next,
      ...(additional ?? {}),
    });
  };

  const toggleNotificationType = async (key: keyof NotificationSettings["types"]) => {
    const next = {
      ...notificationSettings,
      types: { ...notificationSettings.types, [key]: !notificationSettings.types[key] },
    };
    await persistNotificationSettings(next);
  };

  const toggleNotificationChannel = async (key: keyof NotificationSettings["channels"]) => {
    const next = {
      ...notificationSettings,
      channels: { ...notificationSettings.channels, [key]: !notificationSettings.channels[key] },
    };
    await persistNotificationSettings(next);
  };

  const handleTestPush = async () => {
    if (!user) {
      setTestPushStatus("Nejsi přihlášený.");
      return;
    }
    setTestPushStatus("Posílám testovací notifikaci…");

    try {
      const idToken = await user.getIdToken();
      const res = await fetch(
        "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/sendTestPush",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ message: "Test push z Nastavení" }),
        }
      );

      const json = (await res.json()) as any;
      if (!res.ok || json?.ok !== true) {
        const msg = json?.error || json?.detail || "Odeslání selhalo.";
        setTestPushStatus(`Chyba: ${msg}`);
        return;
      }

      setTestPushStatus("Testovací notifikace odeslána.");
    } catch (err) {
      setTestPushStatus(`Chyba: ${(err as any)?.message || String(err)}`);
    }
  };

  const handleBackgroundPreset = async (preset: "black" | "blue") => {
    const color = preset;
    setBackgroundColor(color);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.backgroundColor, color);
      window.localStorage.removeItem("settings.simpleBackground");
      window.dispatchEvent(
        new CustomEvent("settings:updateBackground", {
          detail: { backgroundColor: color },
        })
      );
    }

    await saveUserFields({
      simpleBackground: true,
      backgroundColor: color,
    });
  };

  const handleReduceMotionChange = async (value: boolean) => {
    setReduceMotion(value);
    applyMotionPreference(value);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.reduceMotion, value ? "1" : "0");
    }

    await saveUserFields({ reduceMotion: value });
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      setPasswordStatus({
        type: "error",
        message: "Uživatel není přihlášen.",
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      setPasswordStatus({
        type: "error",
        message: "Vyplň původní i nové heslo.",
      });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordStatus({
        type: "error",
        message: "Nové heslo musí mít alespoň 6 znaků.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: "error",
        message: "Nové heslo a potvrzení se neshodují.",
      });
      return;
    }

    try {
      setChangingPassword(true);
      setPasswordStatus(null);

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setPasswordStatus({
        type: "success",
        message: "Heslo bylo úspěšně změněno.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      const err = error as { code?: string };
      let message = "Změna hesla se nepovedla. Zkus to prosím znovu.";
      if (err?.code === "auth/wrong-password") {
        message = "Původní heslo není správné.";
      } else if (err?.code === "auth/weak-password") {
        message = "Nové heslo je příliš slabé (min. 6 znaků).";
      } else if (err?.code === "auth/too-many-requests") {
        message = "Příliš mnoho pokusů. Zkus to prosím později.";
      }
      setPasswordStatus({ type: "error", message });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) {
    // redirect už běží, tady jen nic nerenderujeme
    return null;
  }

  const userEmail = user.email ?? "Neznámý e-mail";

  return (
    <AppLayout active="settings">
      <div className="w-full max-w-5xl space-y-6">
        {/* HEADER */}
        <header className="mb-2">
          <SplitTitle text="Nastavení" />
          <p className="mt-1 text-sm text-slate-300 max-w-xl">
            Uprav si výchozí pozici, režim provizí a svůj měsíční cíl.
          </p>
        </header>

        {loadingMeta ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl px-6 py-5 text-sm text-slate-200">
            Načítám nastavení…
          </div>
        ) : (
          <>
            {/* Pozice & režim provizí */}
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
                        handleModeChange(
                          e.target.value as CommissionMode
                        )
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

            <div className="grid gap-3 md:grid-cols-2">
              {/* Notifikace */}
              <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-4 py-4 sm:px-6 sm:py-5 space-y-3 shadow-[0_14px_40px_rgba(0,0,0,0.55)]">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Notifikace
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                        fcmActive
                          ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/40"
                          : "bg-rose-500/15 text-rose-100 border-rose-400/40"
                      }`}
                    >
                      {fcmActive ? "Aktivní" : "Neaktivní"}
                    </span>
                  </div>

                  {!fcmActive && (
                    <p className="text-sm text-slate-200">
                      Otevři mobilní appku a přihlas se – FCM token se uloží do profilu.
                    </p>
                  )}

                  <div className="space-y-1.5 max-w-sm">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Nastav kolik minut před událostí ti má přijít notifikace.
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={notifyMinutes}
                      onChange={(e) =>
                        handleNotifyMinutesChange(
                          Math.max(0, Math.min(1440, Number(e.target.value) || 0))
                        )
                      }
                      className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Použije se při odeslání push notifikace z kalendáře (výchozí 60 min).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Typy notifikací</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: "newContract", label: "Nová smlouva" },
                          { id: "anniversary", label: "Výročí" },
                          { id: "unpaid", label: "Nezaplaceno" },
                          { id: "team", label: "Týmové akce" },
                        ].map((t) => {
                          const active = notificationSettings.types[t.id as keyof NotificationSettings["types"]];
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleNotificationType(t.id as keyof NotificationSettings["types"])}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                active
                                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-50"
                                  : "border-white/20 bg-white/5 text-slate-200 hover:border-white/35"
                              }`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Kanály</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: "email", label: "E-mail" },
                          { id: "push", label: "Push" },
                        ].map((c) => {
                          const active = notificationSettings.channels[c.id as keyof NotificationSettings["channels"]];
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleNotificationChannel(c.id as keyof NotificationSettings["channels"])}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                active
                                  ? "border-sky-300/60 bg-sky-500/15 text-sky-50"
                                  : "border-white/20 bg-white/5 text-slate-200 hover:border-white/35"
                              }`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-0.5">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Testovací push</div>
                      <p className="text-[11px] text-slate-400">
                        Ověř, že push chodí. Pokud nepřijde, zkontroluj FCM token v mobilní appce.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      {testPushStatus && (
                        <span className="text-[11px] text-slate-300">{testPushStatus}</span>
                      )}
                      <button
                        type="button"
                        onClick={handleTestPush}
                        className="rounded-full border border-emerald-300/60 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/30 transition"
                      >
                        Odeslat test
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Vzhled */}
              <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-4 py-4 sm:px-6 sm:py-5 space-y-3 shadow-[0_14px_40px_rgba(0,0,0,0.55)]">
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Pozadí aplikace
                      </h2>
                      <p className="text-xs text-slate-400">
                        Vyber si jednoduché pozadí – černé nebo tmavě modré.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        Animace
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReduceMotionChange(!reduceMotion)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          reduceMotion
                            ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                            : "border-white/20 bg-white/5 text-slate-100 hover:border-white/35"
                        }`}
                        aria-pressed={reduceMotion}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            reduceMotion ? "bg-emerald-300" : "bg-slate-300"
                          }`}
                          aria-hidden="true"
                        />
                        {reduceMotion ? "Animace vypnuté" : "Animace zapnuté"}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 h-60">
                    {[
                      { id: "black" as const, label: "ČERNÁ", bg: "bg-black" },
                      { id: "blue" as const, label: "MODRÁ", bg: "bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900" },
                    ].map((opt) => {
                      const isActive = backgroundColor === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleBackgroundPreset(opt.id)}
                          className={`relative flex-1 overflow-hidden rounded-2xl border transition ${
                            isActive
                              ? "border-emerald-300/70 shadow-[0_10px_30px_rgba(16,185,129,0.35)]"
                              : "border-white/15 hover:border-white/30"
                          }`}
                        >
                          <div className={`absolute inset-0 ${opt.bg}`} />
                          <div className="absolute inset-0 bg-black/25" />
                          {isActive && (
                            <div className="absolute top-2 right-2 rounded-full border border-emerald-200/70 bg-emerald-500/70 text-[10px] font-semibold text-emerald-950 px-2 py-0.5">
                              Aktivní
                            </div>
                          )}
                          <span
                            className="relative h-full w-full flex items-center justify-center text-sm font-bold tracking-[0.4em] text-white/90"
                            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                          >
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            {/* Účet */}
            <section className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 space-y-4 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Účet
              </h2>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 text-sm">
                <div>
                  <div className="text-slate-300 text-xs uppercase tracking-wide">
                    E-mail účtu
                  </div>
                  <div className="mt-1 font-medium text-slate-50">
                    {userEmail}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Odhlásit se můžeš kdykoliv pomocí tlačítka v levém panelu
                    dole.
                  </p>
                </div>

                <div className="w-full sm:max-w-md space-y-3">
                  <div className="text-slate-300 text-xs uppercase tracking-wide">
                    Změna hesla
                  </div>

                  {!showPasswordForm && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(true)}
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400/90"
                    >
                      Změnit heslo
                    </button>
                  )}

                  {showPasswordForm && (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <input
                        type="password"
                        autoComplete="current-password"
                        className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        placeholder="Původní heslo"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        placeholder="Nové heslo (min. 6 znaků)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        placeholder="Potvrď nové heslo"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={changingPassword}
                          className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {changingPassword ? "Měním heslo…" : "Potvrdit změnu"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordForm(false);
                            setCurrentPassword("");
                            setNewPassword("");
                            setConfirmPassword("");
                            setPasswordStatus(null);
                          }}
                          className="text-xs text-slate-400 hover:text-slate-200"
                        >
                          Zrušit
                        </button>
                      </div>
                      {passwordStatus && (
                        <div
                          className={`text-xs ${
                            passwordStatus.type === "success"
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {passwordStatus.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
