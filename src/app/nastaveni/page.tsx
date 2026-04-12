// src/app/nastaveni/page.tsx
"use client";

import { useEffect, useState } from "react";
import {
  AtSign,
  BellRing,
  Calculator,
  KeyRound,
  Palette,
  Snail,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";

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
type BackgroundPreset = "white";

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
  tipsterMode: "settings.tipsterMode",
};

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

const hasNonEmptyToken = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

const hasAnyPushToken = (data: Record<string, unknown>): boolean => {
  if (hasNonEmptyToken(data.fcmToken)) return true;
  if (hasNonEmptyToken(data.pushToken)) return true;
  if (hasNonEmptyToken(data.notificationToken)) return true;

  const tokenArrays = [data.fcmTokens, data.pushTokens, data.notificationTokens];
  for (const raw of tokenArrays) {
    if (Array.isArray(raw) && raw.some((item) => hasNonEmptyToken(item))) {
      return true;
    }
  }

  const tokenMaps = [data.fcmTokensByDevice, data.pushTokensByDevice];
  for (const raw of tokenMaps) {
    if (raw && typeof raw === "object") {
      const values = Object.values(raw as Record<string, unknown>);
      if (values.some((item) => hasNonEmptyToken(item))) {
        return true;
      }
    }
  }

  return false;
};

export default function SettingsPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [, setMonthlyGoal] = useState<number>(0);

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
  const [backgroundColor, setBackgroundColor] = useState<BackgroundPreset>("white");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tipsterMode, setTipsterMode] = useState(false);

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
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

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
            const c: BackgroundPreset = "white";
            setBackgroundColor(c);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(SETTINGS_KEYS.backgroundColor, c);
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.backgroundColor
            );
            if (stored) {
              setBackgroundColor("white");
              window.localStorage.setItem(SETTINGS_KEYS.backgroundColor, "white");
            }
          } else {
            setBackgroundColor("white");
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

          if (typeof data.tipsterCollaborationMode === "boolean") {
            setTipsterMode(data.tipsterCollaborationMode);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.tipsterMode,
                data.tipsterCollaborationMode ? "1" : "0"
              );
            }
          } else if (typeof window !== "undefined") {
            const storedTipsterMode = window.localStorage.getItem(
              SETTINGS_KEYS.tipsterMode
            );
            if (storedTipsterMode === "1" || storedTipsterMode === "0") {
              setTipsterMode(storedTipsterMode === "1");
            }
          }

          setFcmActive(hasAnyPushToken(data as Record<string, unknown>));

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
            );

            if (storedPos) setPosition(storedPos);
            if (storedMode) setMode(storedMode);
            const n = storedGoal ? Number(storedGoal) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
            if (storedColor) {
              setBackgroundColor("white");
              window.localStorage.setItem(SETTINGS_KEYS.backgroundColor, "white");
            }
            const storedMotion = window.localStorage.getItem(
              SETTINGS_KEYS.reduceMotion
            );
            if (storedMotion === "1") {
              setReduceMotion(true);
              applyMotionPreference(true);
            }
            const storedTipsterMode = window.localStorage.getItem(
              SETTINGS_KEYS.tipsterMode
            );
            if (storedTipsterMode === "1" || storedTipsterMode === "0") {
              setTipsterMode(storedTipsterMode === "1");
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

  const handleTipsterModeChange = async (value: boolean) => {
    setTipsterMode(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterMode, value ? "1" : "0");
    }
    await saveUserFields({ tipsterCollaborationMode: value });
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

  const handleBackgroundPreset = async (preset: BackgroundPreset) => {
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
  const positionDisplay = POSITIONS.find((p) => p.id === position)?.label ?? position;
  const modeDisplay = COMMISSION_MODES.find((m) => m.id === mode)?.label ?? mode;
  const enabledNotificationTypes = Object.values(notificationSettings.types).filter(Boolean).length;
  const panelClass =
    "rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:px-8 sm:py-6";
  const compactPanelClass =
    "rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:px-6 sm:py-5";
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
  const toggleOffClass =
    "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <AppLayout active="settings">
      <div className="w-full bg-slate-50 px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        {/* HEADER */}
        <header className="mb-2">
          <SplitTitle text="Nastavení" className="font-mono !text-slate-900" />
        </header>

        {loadingMeta ? (
          <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 text-sm text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
            Načítám nastavení…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                <UserRound size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                Pozice: {positionDisplay}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                <Calculator size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                Režim: {modeDisplay}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  tipsterMode ? "border-slate-900 bg-slate-900 text-white" : toggleOffClass
                }`}
              >
                <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
                Tipař: {tipsterMode ? "ON" : "OFF"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                <BellRing size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                Notifikace: {enabledNotificationTypes}/4
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
              <section className={`h-full space-y-4 ${panelClass}`}>
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                  <Calculator size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                  <span>Výchozí kalkulačka</span>
                </h2>

                {canChangePosition ? (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Výchozí pozice
                      </label>
                      <select
                        className={fieldClass}
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
                      <p className="text-xs text-slate-500">
                        Tahle pozice se použije jako výchozí v kalkulačce.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Výchozí režim provizí
                      </label>
                      <div
                        className="inline-flex w-full max-w-md rounded-2xl border border-slate-300 bg-slate-100 p-1"
                        role="radiogroup"
                        aria-label="Výchozí režim provizí"
                      >
                        {COMMISSION_MODES.map((m) => {
                          const active = mode === m.id;
                          const isAccelerated = m.id === "accelerated";
                          const isStandard = m.id === "standard";

                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => void handleModeChange(m.id)}
                              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                active
                                  ? "border border-slate-900 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.1)]"
                                  : "border border-transparent text-slate-600 hover:text-slate-900"
                              }`}
                              role="radio"
                              aria-checked={active}
                            >
                              {isAccelerated && (
                                <Zap
                                  size={14}
                                  strokeWidth={2.2}
                                  className={active ? "text-amber-500" : "text-amber-600"}
                                  aria-hidden="true"
                                />
                              )}
                              {isStandard && (
                                <Snail
                                  size={14}
                                  strokeWidth={2.2}
                                  className={active ? "text-slate-600" : "text-slate-500"}
                                  aria-hidden="true"
                                />
                              )}
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500">
                        Zrychlený / běžný režim se používá u životního pojištění.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Pozice je nastavena administrátorem.
                  </p>
                )}

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      Režim tipařské spolupráce
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTipsterModeChange(!tipsterMode)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        tipsterMode
                          ? "border-slate-900 bg-slate-900 text-white"
                          : toggleOffClass
                      }`}
                      aria-pressed={tipsterMode}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          tipsterMode ? "bg-white" : "bg-slate-400"
                        }`}
                        aria-hidden="true"
                      />
                      {tipsterMode ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              </section>

              <section className={`h-full space-y-3 ${compactPanelClass}`}>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      <BellRing size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                      <span>Notifikace</span>
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                        fcmActive
                          ? "border-emerald-700 bg-emerald-600 text-white"
                          : "border-rose-700 bg-rose-600 text-white"
                      }`}
                    >
                      {fcmActive ? "Aktivní" : "Neaktivní"}
                    </span>
                  </div>

                  {!fcmActive && (
                    <p className="text-sm text-slate-700">
                      Otevři mobilní appku a přihlas se – FCM token se uloží do profilu.
                    </p>
                  )}

                  <div className="space-y-1.5 max-w-sm">
                    <label className="text-xs uppercase tracking-wide text-slate-500">
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
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    />
                    <p className="text-[11px] text-slate-500">
                      Použije se při odeslání push notifikace z kalendáře (výchozí 60 min).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Typy notifikací</div>
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
                                ? "border-slate-900 bg-slate-900 text-white"
                                : toggleOffClass
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-0.5">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Testovací push</div>
                      <p className="text-[11px] text-slate-500">
                        Ověř, že push chodí. Pokud nepřijde, zkontroluj FCM token v mobilní appce.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      {testPushStatus && (
                        <span className="text-[11px] text-slate-600">{testPushStatus}</span>
                      )}
                      <button
                        type="button"
                        onClick={handleTestPush}
                        className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                      >
                        Odeslat test
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className={`space-y-3 ${compactPanelClass}`}>
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                        <Palette size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                        <span>Pozadí aplikace</span>
                      </h2>
                      <p className="text-xs text-slate-500">
                        Používáme jednoduché bílé pozadí.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Animace
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReduceMotionChange(!reduceMotion)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          reduceMotion
                            ? "border-slate-900 bg-slate-900 text-white"
                            : toggleOffClass
                        }`}
                        aria-pressed={reduceMotion}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            reduceMotion ? "bg-white" : "bg-slate-400"
                          }`}
                          aria-hidden="true"
                        />
                        {reduceMotion ? "Animace vypnuté" : "Animace zapnuté"}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 h-60">
                    {[
                      { id: "white" as const, label: "BÍLÁ", bg: "bg-white" },
                    ].map((opt) => {
                      const isActive = backgroundColor === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleBackgroundPreset(opt.id)}
                          className={`settings-bg-preview relative flex-1 overflow-hidden rounded-2xl border transition ${
                            isActive
                              ? "border-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                              : "border-slate-300 hover:border-slate-500"
                          }`}
                        >
                          <div className={`settings-bg-preview-layer absolute inset-0 ${opt.bg}`} />
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(15,23,42,0.06),transparent_55%)]" />
                          {isActive && (
                            <div className="absolute top-2 right-2 rounded-full border border-slate-900 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Aktivní
                            </div>
                          )}
                          <span
                            className="settings-bg-preview-label relative h-full w-full flex items-center justify-center text-sm font-bold tracking-[0.4em] text-[#0f172a]"
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

            {/* Účet */}
            <section className={`space-y-4 ${panelClass}`}>
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                <UserRound size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Účet</span>
              </h2>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 text-sm">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                    <AtSign size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                    <span>E-mail účtu</span>
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {userEmail}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Odhlásit se můžeš kdykoliv pomocí tlačítka v levém panelu
                    dole.
                  </p>
                </div>

                <div className="w-full sm:max-w-md space-y-3">
                  <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                    <KeyRound size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                    <span>Změna hesla</span>
                  </div>

                  {!showPasswordForm && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(true)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black"
                    >
                      <KeyRound size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      Změnit heslo
                    </button>
                  )}

                  {showPasswordForm && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <input
                        type="password"
                        autoComplete="current-password"
                        className={fieldClass}
                        placeholder="Původní heslo"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className={fieldClass}
                        placeholder="Nové heslo (min. 6 znaků)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className={fieldClass}
                        placeholder="Potvrď nové heslo"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={changingPassword}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
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
                          className="text-xs text-slate-500 hover:text-slate-900"
                        >
                          Zrušit
                        </button>
                      </div>
                      {passwordStatus && (
                        <div
                          className={`text-xs ${
                            passwordStatus.type === "success"
                              ? "text-emerald-700"
                              : "text-rose-700"
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
      </div>
    </AppLayout>
  );
}
