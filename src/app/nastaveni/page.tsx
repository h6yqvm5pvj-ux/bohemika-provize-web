// src/app/nastaveni/page.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AtSign,
  BellRing,
  Calculator,
  CircleHelp,
  ExternalLink,
  KeyRound,
  Palette,
  ShieldCheck,
  Snail,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";

import type { User as FirebaseUser } from "firebase/auth";
import {
  EmailAuthProvider,
  FactorId,
  getMultiFactorResolver,
  multiFactor,
  type MultiFactorError,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  type TotpSecret,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, getDocFromServer, setDoc } from "firebase/firestore";
import QRCode from "qrcode";

import { auth, db } from "../firebase";
import { AppLayout } from "@/components/AppLayout";
import {
  BOX_THEME_EVENT,
  BOX_THEME_LOCAL_STORAGE_KEY,
  BOX_THEME_OPTIONS,
  DEFAULT_BOX_THEME,
  applyBoxThemeToRoot,
  resolveBoxTheme,
  type BoxTheme,
} from "@/lib/boxTheme";
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

type PositionTimelineItem = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string;
};

const POSITION_SET = new Set<Position>(POSITIONS.map((p) => p.id));
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const createTimelineRowId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
};

const hasInvalidRangeOrder = (validFrom: string, validTo: string): boolean => {
  if (!validFrom || !validTo) return false;
  if (!isIsoDay(validFrom) || !isIsoDay(validTo)) return false;
  return validTo < validFrom;
};

const parsePositionTimeline = (value: unknown): PositionTimelineItem[] => {
  if (!Array.isArray(value)) return [];
  const rows: PositionTimelineItem[] = [];

  value.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const position = row.position as Position;
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || "";

    if (!POSITION_SET.has(position)) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : createTimelineRowId(),
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo || "9999-12-31";
    const bTo = b.validTo || "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
};

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
  boxTheme: BOX_THEME_LOCAL_STORAGE_KEY,
  reduceMotion: "settings.reduceMotion",
  tipsterMode: "settings.tipsterMode",
};

type SettingsTab = "account" | "career" | "notifications" | "design";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Účet" },
  { id: "career", label: "Kariéra" },
  { id: "notifications", label: "Notifikace" },
  { id: "design", label: "Design" },
];

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

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

const EXPECTED_MFA_ERROR_CODES = new Set<string>([
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/multi-factor-auth-required",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/requires-recent-login",
  "auth/too-many-requests",
  "auth/operation-not-allowed",
  "auth/unverified-email",
]);

const isExpectedMfaError = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return typeof code === "string" && EXPECTED_MFA_ERROR_CODES.has(code);
};

const logMfaIssue = (context: string, error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (isExpectedMfaError(error)) {
    console.warn(`[MFA] ${context}: ${code ?? "unknown"}`);
    return;
  }
  console.error(`[MFA] ${context}:`, error);
};

const resolveMfaErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as { code?: string };
  if (
    err?.code === "auth/wrong-password" ||
    err?.code === "auth/invalid-credential" ||
    err?.code === "auth/invalid-login-credentials"
  ) {
    return "Aktuální heslo není správné.";
  }
  if (err?.code === "auth/multi-factor-auth-required") {
    return "Pro tuto změnu zadej i aktuální kód z Microsoft Authenticator.";
  }
  if (err?.code === "auth/invalid-verification-code") {
    return "Neplatný 2FA kód. Zadej aktuální kód z aplikace.";
  }
  if (err?.code === "auth/code-expired") {
    return "2FA kód vypršel. Zadej nový aktuální kód.";
  }
  if (err?.code === "auth/requires-recent-login") {
    return "Pro tuto změnu je potřeba znovu ověřit heslo.";
  }
  if (err?.code === "auth/too-many-requests") {
    return "Příliš mnoho pokusů. Zkus to prosím později.";
  }
  if (err?.code === "auth/operation-not-allowed") {
    return "TOTP MFA není zapnuté ve Firebase Console (Authentication > Multi-factor).";
  }
  if (err?.code === "auth/unverified-email") {
    return "Nejdřív ověř e-mail účtu. Pak půjde 2FA zapnout.";
  }
  return fallback;
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
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaStatus, setMfaStatus] = useState<InlineStatus | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaForceVerifyingEmail, setMfaForceVerifyingEmail] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaTotpUid, setMfaTotpUid] = useState<string | null>(null);
  const [mfaTotpLabel, setMfaTotpLabel] = useState<string | null>(null);
  const [mfaReauthCode, setMfaReauthCode] = useState("");
  const [mfaEnrollmentSecret, setMfaEnrollmentSecret] = useState<TotpSecret | null>(null);
  const [mfaEnrollmentCode, setMfaEnrollmentCode] = useState("");
  const [mfaQrCodeDataUrl, setMfaQrCodeDataUrl] = useState("");
  const [mfaQrCodeLoading, setMfaQrCodeLoading] = useState(false);
  const [mfaQrCodeError, setMfaQrCodeError] = useState<string | null>(null);
  const [fcmActive, setFcmActive] = useState<boolean | null>(null);
  const [notifyMinutes, setNotifyMinutes] = useState<number>(60);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [testPushStatus, setTestPushStatus] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<BackgroundPreset>("white");
  const [boxTheme, setBoxTheme] = useState<BoxTheme>(DEFAULT_BOX_THEME);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tipsterMode, setTipsterMode] = useState(false);
  const [positionTimelineDraft, setPositionTimelineDraft] = useState<PositionTimelineItem[]>([]);
  const [positionTimelineSaving, setPositionTimelineSaving] = useState(false);
  const [positionTimelineSaved, setPositionTimelineSaved] = useState(false);
  const [positionTimelineError, setPositionTimelineError] = useState<string | null>(null);
  const [timelineSaveFlashVisible, setTimelineSaveFlashVisible] = useState(false);
  const [positionTimelineLocked, setPositionTimelineLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("career");
  const [showCareerTimelineHelp, setShowCareerTimelineHelp] = useState(false);

  const applyMotionPreference = (off: boolean) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (off) {
      root.setAttribute("data-motion", "off");
    } else {
      root.removeAttribute("data-motion");
    }
  };

  const applyBoxThemePreference = (value: unknown) => {
    const next = resolveBoxTheme(value);
    setBoxTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.boxTheme, next);
      applyBoxThemeToRoot(next);
    }
    return next;
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

  const clearMfaDraft = () => {
    setMfaEnrollmentSecret(null);
    setMfaEnrollmentCode("");
    setMfaQrCodeDataUrl("");
    setMfaQrCodeLoading(false);
    setMfaQrCodeError(null);
  };

  const syncMfaState = async (targetUser: FirebaseUser) => {
    await targetUser.reload();
    const activeUser = auth.currentUser ?? targetUser;
    const totpFactor =
      multiFactor(activeUser).enrolledFactors.find(
        (factor) => factor.factorId === FactorId.TOTP
      ) ?? null;

    setMfaEnabled(Boolean(totpFactor));
    setMfaTotpUid(totpFactor?.uid ?? null);
    setMfaTotpLabel(totpFactor?.displayName ?? null);
  };

  useEffect(() => {
    if (!user) {
      setMfaEnabled(false);
      setMfaTotpUid(null);
      setMfaTotpLabel(null);
      setMfaStatus(null);
      setMfaPassword("");
      setMfaReauthCode("");
      clearMfaDraft();
      return;
    }

    let isCancelled = false;

    const loadMfaState = async () => {
      try {
        await syncMfaState(user);
      } catch (error) {
        if (!isCancelled) {
          console.error("Chyba při načítání stavu 2FA:", error);
          setMfaStatus({
            type: "error",
            message: resolveMfaErrorMessage(
              error,
              "Nepodařilo se načíst stav 2FA."
            ),
          });
        }
      }
    };

    void loadMfaState();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!mfaEnrollmentSecret) {
      setMfaQrCodeDataUrl("");
      setMfaQrCodeLoading(false);
      setMfaQrCodeError(null);
      return;
    }

    let isCancelled = false;
    setMfaQrCodeLoading(true);
    setMfaQrCodeError(null);

    const accountName =
      normalizeEmail(user?.email) || user?.email || "bohemika-user";
    const qrUri = mfaEnrollmentSecret.generateQrCodeUrl(
      accountName,
      "Bohemka.App"
    );

    void QRCode.toDataURL(qrUri, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (isCancelled) return;
        setMfaQrCodeDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("Chyba při generování QR kódu:", error);
        if (isCancelled) return;
        setMfaQrCodeError("QR kód se nepodařilo vygenerovat.");
      })
      .finally(() => {
        if (isCancelled) return;
        setMfaQrCodeLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [mfaEnrollmentSecret, user]);

  // načtení metadat uživatele z Firestore
  useEffect(() => {
    const loadMeta = async () => {
      if (!user) return;

      const emailRaw = user.email;
      const email = normalizeEmail(emailRaw);
      if (!email) return; // email může být teoreticky null

      setLoadingMeta(true);

      try {
        const readUserDoc = async (docId: string) => {
          const userRef = doc(db, "users", docId);
          try {
            return await getDocFromServer(userRef);
          } catch {
            return await getDoc(userRef);
          }
        };

        const ref = doc(db, "users", email);
        let snap = await readUserDoc(email);
        let resolvedData = snap.exists() ? (snap.data() as any) : null;

        if (emailRaw && emailRaw !== email) {
          const rawSnap = await readUserDoc(emailRaw);
          const rawData = rawSnap.exists() ? (rawSnap.data() as any) : null;

          if (!snap.exists() && rawData) {
            snap = rawSnap;
            resolvedData = rawData;
            try {
              await setDoc(ref, rawData, { merge: true });
            } catch (e) {
              console.warn("Chyba při migraci uživatele na lowercase ID:", e);
            }
          } else if (resolvedData && rawData) {
            const normalizedTimeline = parsePositionTimeline(
              resolvedData.positionTimeline
            );
            const rawTimeline = parsePositionTimeline(rawData.positionTimeline);
            if (normalizedTimeline.length === 0 && rawTimeline.length > 0) {
              resolvedData = {
                ...resolvedData,
                positionTimeline: rawData.positionTimeline,
              };
              try {
                await setDoc(
                  ref,
                  { positionTimeline: rawData.positionTimeline },
                  { merge: true }
                );
              } catch (e) {
                console.warn(
                  "Chyba při dorovnání timeline z legacy user ID:",
                  e
                );
              }
            }
          }
        }

        if (resolvedData) {
          const data = resolvedData;

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

          if (typeof data.boxTheme === "string") {
            applyBoxThemePreference(data.boxTheme);
          } else if (typeof window !== "undefined") {
            applyBoxThemePreference(
              window.localStorage.getItem(SETTINGS_KEYS.boxTheme)
            );
          } else {
            setBoxTheme(DEFAULT_BOX_THEME);
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
          const parsedTimeline = parsePositionTimeline(data.positionTimeline);
          setPositionTimelineDraft(parsedTimeline);
          setPositionTimelineLocked(parsedTimeline.length > 0);
        } else {
          // user dokument neexistuje → zkusíme aspoň natáhnout z localStorage
          setPositionTimelineDraft([]);
          setPositionTimelineLocked(false);
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
            const storedBoxTheme = window.localStorage.getItem(
              SETTINGS_KEYS.boxTheme
            );

            if (storedPos) setPosition(storedPos);
            if (storedMode) setMode(storedMode);
            const n = storedGoal ? Number(storedGoal) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
            if (storedColor) {
              setBackgroundColor("white");
              window.localStorage.setItem(SETTINGS_KEYS.backgroundColor, "white");
            }
            applyBoxThemePreference(storedBoxTheme);
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

  useEffect(() => {
    if (!timelineSaveFlashVisible) return;
    const timeoutId = window.setTimeout(() => {
      setTimelineSaveFlashVisible(false);
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [timelineSaveFlashVisible]);

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

  const addPositionTimelineRow = () => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) => [
      ...prev,
      {
        id: createTimelineRowId(),
        position,
        validFrom: "",
        validTo: "",
      },
    ]);
  };

  const unlockPositionTimeline = () => {
    setPositionTimelineLocked(false);
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
  };

  const updatePositionTimelineRow = (
    rowId: string,
    patch: Partial<PositionTimelineItem>
  ) => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };

  const removePositionTimelineRow = (rowId: string) => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) => prev.filter((row) => row.id !== rowId));
  };

  const savePositionTimeline = async () => {
    setPositionTimelineSaving(true);
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);

    try {
      const normalized = positionTimelineDraft
        .map((row) => ({
          ...row,
          validFrom: row.validFrom.trim(),
          validTo: row.validTo.trim(),
        }))
        .filter(
          (row) =>
            row.position ||
            row.validFrom.length > 0 ||
            row.validTo.length > 0
        );

      for (let i = 0; i < normalized.length; i += 1) {
        const row = normalized[i];
        const rowNo = i + 1;
        if (!POSITION_SET.has(row.position)) {
          setPositionTimelineError(`Řádek ${rowNo}: vyber platnou pozici v timeline.`);
          return;
        }
        if (!row.validFrom) {
          setPositionTimelineError(`Řádek ${rowNo}: vyplň datum OD.`);
          return;
        }
        if (!isIsoDay(row.validFrom)) {
          setPositionTimelineError(`Řádek ${rowNo}: datum OD musí být platné.`);
          return;
        }
        if (row.validTo && !isIsoDay(row.validTo)) {
          setPositionTimelineError(`Řádek ${rowNo}: datum DO musí být platné.`);
          return;
        }
        if (hasInvalidRangeOrder(row.validFrom, row.validTo)) {
          setPositionTimelineError(`Řádek ${rowNo}: datum DO nemůže být dřív než datum OD.`);
          return;
        }
      }

      const sorted = [...normalized].sort((a, b) => {
        if (a.validFrom !== b.validFrom) {
          return a.validFrom.localeCompare(b.validFrom);
        }
        const aTo = a.validTo || "9999-12-31";
        const bTo = b.validTo || "9999-12-31";
        return aTo.localeCompare(bTo);
      });

      const openEndedIndexes = sorted
        .map((row, index) => (!row.validTo ? index : -1))
        .filter((index) => index >= 0);

      if (openEndedIndexes.length > 1) {
        setPositionTimelineError(
          "Současnost (prázdné datum DO) může být jen u jedné poslední pozice."
        );
        return;
      }

      if (
        openEndedIndexes.length === 1 &&
        openEndedIndexes[0] !== sorted.length - 1
      ) {
        setPositionTimelineError(
          "Současnost (prázdné datum DO) je povolena jen u poslední aktuální pozice."
        );
        return;
      }

      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const current = sorted[i];
        const prevTo = prev.validTo || "9999-12-31";
        if (prevTo > current.validFrom) {
          setPositionTimelineError(
            `Rozsahy se překrývají mezi řádky ${i} a ${i + 1}. Uprav datum OD/DO.`
          );
          return;
        }
      }

      const payload = sorted.map((row) => ({
        id: row.id,
        position: row.position,
        validFrom: row.validFrom,
        validTo: row.validTo || null,
      }));

      await saveUserFields({ positionTimeline: payload });
      setPositionTimelineDraft(
        payload.map((row) => ({
          id: row.id,
          position: row.position,
          validFrom: row.validFrom,
          validTo: row.validTo ?? "",
        }))
      );
      setPositionTimelineLocked(true);
      setPositionTimelineSaved(true);
      setTimelineSaveFlashVisible(true);
    } catch (e) {
      console.error("Chyba při ukládání timeline pozic:", e);
      setPositionTimelineError("Historii kariéry se nepodařilo uložit.");
    } finally {
      setPositionTimelineSaving(false);
    }
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

  const handleBoxThemeChange = async (nextTheme: BoxTheme) => {
    const resolved = applyBoxThemePreference(nextTheme);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(BOX_THEME_EVENT, {
          detail: { boxTheme: resolved },
        })
      );
    }
    await saveUserFields({ boxTheme: resolved });
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

  const reauthenticateForMfaChange = async (
    targetUser: FirebaseUser | null
  ): Promise<boolean> => {
    if (!targetUser || !targetUser.email) {
      setMfaStatus({ type: "error", message: "Uživatel není přihlášen." });
      return false;
    }

    if (!mfaPassword.trim()) {
      setMfaStatus({
        type: "error",
        message: "Zadej aktuální heslo pro potvrzení změny 2FA.",
      });
      return false;
    }

    const credential = EmailAuthProvider.credential(
      targetUser.email.trim(),
      mfaPassword
    );
    try {
      await reauthenticateWithCredential(targetUser, credential);
      return true;
    } catch (error) {
      const authError = error as { code?: string };
      if (authError?.code === "auth/multi-factor-auth-required") {
        const otp = mfaReauthCode.trim();
        if (!otp) {
          setMfaStatus({
            type: "error",
            message:
              "Pro potvrzení změny 2FA zadej i aktuální kód z Microsoft Authenticator.",
          });
          return false;
        }

        try {
          const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
          const totpHint = resolver.hints.find(
            (hint) => hint.factorId === FactorId.TOTP
          );

          if (!totpHint) {
            setMfaStatus({
              type: "error",
              message:
                "Účet vyžaduje 2FA, ale nebyl nalezen TOTP faktor. Zkus to znovu po přihlášení.",
            });
            return false;
          }

          const assertion = TotpMultiFactorGenerator.assertionForSignIn(
            totpHint.uid,
            otp
          );
          await resolver.resolveSignIn(assertion);
          return true;
        } catch (resolverError) {
          logMfaIssue("reauthenticateForMfaChangeResolver", resolverError);
          setMfaStatus({
            type: "error",
            message: resolveMfaErrorMessage(
              resolverError,
              "Nepodařilo se ověřit 2FA kód pro potvrzení změny."
            ),
          });
          return false;
        }
      }

      logMfaIssue("reauthenticateForMfaChange", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "Nepodařilo se ověřit aktuální heslo pro změnu 2FA."
        ),
      });
      return false;
    }
  };

  const handleForceVerifyMfaEmail = async () => {
    if (!user) return;
    setMfaForceVerifyingEmail(true);
    setMfaStatus(null);
    try {
      await user.reload();
      const currentUser = auth.currentUser ?? user;
      setUser(currentUser);

      if (currentUser.emailVerified) {
        setMfaStatus({
          type: "success",
          message: "E-mail je ověřený. Teď můžeš kliknout na Zapnout 2FA.",
        });
        return;
      }

      await sendEmailVerification(currentUser);
      setMfaStatus({
        type: "info",
        message:
          "Poslal jsem ověřovací e-mail. Otevři odkaz v e-mailu a potom klikni znovu na stejné tlačítko.",
      });
    } catch (error) {
      logMfaIssue("handleForceVerifyMfaEmail", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "Nepodařilo se připravit ověření e-mailu pro 2FA."
        ),
      });
    } finally {
      setMfaForceVerifyingEmail(false);
    }
  };

  const handleStartMfaEnrollment = async () => {
    if (!user) return;

    setMfaBusy(true);
    setMfaStatus(null);

    try {
      await user.reload();
      const activeUser = auth.currentUser ?? user;
      setUser(activeUser);

      if (!activeUser.emailVerified) {
        setMfaStatus({
          type: "error",
          message:
            "Nejdřív ověř e-mail účtu. Pak půjde 2FA zapnout.",
        });
        return;
      }

      const reauthenticated = await reauthenticateForMfaChange(activeUser);
      if (!reauthenticated) return;

      const session = await multiFactor(activeUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);

      setMfaEnrollmentSecret(secret);
      setMfaEnrollmentCode("");
      setMfaStatus({
        type: "info",
        message:
          "Otevři Microsoft Authenticator, přidej účet pomocí setup key a zadej ověřovací kód.",
      });
    } catch (error) {
      logMfaIssue("handleStartMfaEnrollment", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "Nepodařilo se spustit nastavení 2FA."
        ),
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleConfirmMfaEnrollment = async () => {
    if (!user || !mfaEnrollmentSecret) return;

    const otp = mfaEnrollmentCode.trim();
    if (!otp) {
      setMfaStatus({
        type: "error",
        message: "Zadej jednorázový kód z aplikace Microsoft Authenticator.",
      });
      return;
    }

    setMfaBusy(true);
    setMfaStatus(null);

    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        mfaEnrollmentSecret,
        otp
      );
      await multiFactor(user).enroll(assertion, "Microsoft Authenticator");
      await syncMfaState(user);

      setMfaPassword("");
      setMfaReauthCode("");
      clearMfaDraft();
      setMfaStatus({
        type: "success",
        message: "2FA bylo úspěšně zapnuto.",
      });
    } catch (error) {
      logMfaIssue("handleConfirmMfaEnrollment", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "2FA se nepodařilo dokončit. Zkus to prosím znovu."
        ),
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!user) return;
    if (!mfaTotpUid) {
      setMfaStatus({
        type: "error",
        message: "Aktivní TOTP faktor nebyl nalezen.",
      });
      return;
    }

    setMfaBusy(true);
    setMfaStatus(null);

    try {
      const reauthenticated = await reauthenticateForMfaChange(user);
      if (!reauthenticated) return;

      await multiFactor(user).unenroll(mfaTotpUid);
      await syncMfaState(user);

      setMfaPassword("");
      setMfaReauthCode("");
      clearMfaDraft();
      setMfaStatus({
        type: "success",
        message: "2FA bylo vypnuto.",
      });
    } catch (error) {
      logMfaIssue("handleDisableMfa", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "2FA se nepodařilo vypnout. Zkus to prosím znovu."
        ),
      });
    } finally {
      setMfaBusy(false);
    }
  };

  if (!user) {
    // redirect už běží, tady jen nic nerenderujeme
    return null;
  }

  const userEmail = user.email ?? "Neznámý e-mail";
  const normalizedUserEmail = normalizeEmail(user.email);
  const mfaIssuer = "Bohemka.App";
  const mfaAccountName = normalizedUserEmail || userEmail;
  const mfaQrCodeUri = mfaEnrollmentSecret
    ? mfaEnrollmentSecret.generateQrCodeUrl(mfaAccountName, mfaIssuer)
    : "";
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
        {timelineSaveFlashVisible && (
          <div aria-live="polite" className="fixed bottom-6 right-6 z-50 pointer-events-none">
            <div className="relative flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <path
                    fill="currentColor"
                    d="M9.5 15.6 6.4 12.5a1 1 0 0 0-1.4 1.4l3.8 3.8a1 1 0 0 0 1.45-.05l8-9a1 1 0 1 0-1.5-1.3l-7.25 8.2Z"
                  />
                </svg>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">Uloženo!</p>
                <p className="text-[11px] text-slate-600">Historie kariéry byla uložena.</p>
              </div>
            </div>
          </div>
        )}
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

            <div className="inline-flex w-full flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
              {SETTINGS_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "border border-slate-900 bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
              {activeTab === "career" && (
              <section className={`h-full space-y-4 lg:col-span-2 ${panelClass}`}>
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                  <Calculator size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                  <span>Výchozí kalkulačka</span>
                </h2>

                {canChangePosition ? (
                  <>
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

                  </>
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
              )}

              {activeTab === "career" && (
              <section
                id="timeline-kariery"
                className="h-full space-y-4 scroll-mt-24 lg:col-span-2 rounded-[24px] border border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_55%)] px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:px-6 sm:py-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      <Sparkles size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                      <span>Historie Kariéry</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Nastav období od-do. Kalkulačka pak sama předvyplní pozici podle data sjednání.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCareerTimelineHelp(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <CircleHelp size={13} strokeWidth={2.2} aria-hidden="true" />
                      Nápověda
                    </button>
                    {positionTimelineLocked ? (
                      <button
                        type="button"
                        onClick={unlockPositionTimeline}
                        className="rounded-full border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                      >
                        Změna
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={addPositionTimelineRow}
                        className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                      >
                        Přidat pozici
                      </button>
                    )}
                  </div>
                </div>

                {showCareerTimelineHelp && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4"
                    onClick={() => setShowCareerTimelineHelp(false)}
                  >
                    <div
                      className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.3)] sm:px-6"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900">
                          <CircleHelp size={14} strokeWidth={2.2} className="text-slate-600" />
                          Nápověda
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowCareerTimelineHelp(false)}
                          className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100"
                          aria-label="Zavřít nápovědu"
                        >
                          <X size={14} strokeWidth={2.4} />
                        </button>
                      </div>

                      <p className="text-sm leading-relaxed text-slate-700">
                        Zadej historii své kariéry, najdeš ji v Maxxu pod odkazem{" "}
                        <a
                          href="https://sjednatel.bohemiaservis.cz/broker-card"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 font-semibold text-slate-900 underline underline-offset-2"
                        >
                          https://sjednatel.bohemiaservis.cz/broker-card
                          <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
                        </a>
                        . Záložka kariéra.
                      </p>
                    </div>
                  </div>
                )}

                {positionTimelineDraft.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    Historii kariéry zatím nemáš nastavenou. Najdeš ji v Maxxu pod odkazem{" "}
                    <a
                      href="https://sjednatel.bohemiaservis.cz/broker-card"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-semibold text-slate-900 underline underline-offset-2"
                    >
                      https://sjednatel.bohemiaservis.cz/broker-card
                    </a>
                    . Záložka kariéra. Přidej stupně kliknutím na tlačítko Přidat pozici, přidávej od
                    nejstarší po aktuální tak jako v Maxxu.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                          {positionTimelineDraft.map((row, rowIndex) => {
                            const rowRangeError = hasInvalidRangeOrder(
                              row.validFrom.trim(),
                              row.validTo.trim()
                            );
                            const isLastDraftRow =
                              rowIndex === positionTimelineDraft.length - 1;
                            const rowOpenEndedNotLast =
                              !row.validTo.trim() && !isLastDraftRow;
                            return (
                            <div
                              key={row.id}
                              className={`rounded-2xl border bg-white px-3 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.05)] ${
                                rowRangeError || rowOpenEndedNotLast
                                  ? "border-rose-300"
                                  : "border-slate-300"
                              }`}
                            >
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
                          <select
                            value={row.position}
                            onChange={(e) =>
                              updatePositionTimelineRow(row.id, {
                                position: e.target.value as Position,
                              })
                            }
                            disabled={positionTimelineLocked}
                            className={`${fieldClass} ${
                              positionTimelineLocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : ""
                            }`}
                          >
                            {POSITIONS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={row.validFrom}
                            onChange={(e) =>
                              updatePositionTimelineRow(row.id, { validFrom: e.target.value })
                            }
                            disabled={positionTimelineLocked}
                            className={`${fieldClass} ${
                              positionTimelineLocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : ""
                            }`}
                            title="Platí od"
                          />
                          <input
                            type="date"
                            value={row.validTo}
                            onChange={(e) =>
                              updatePositionTimelineRow(row.id, { validTo: e.target.value })
                            }
                            disabled={positionTimelineLocked}
                            className={`${fieldClass} ${
                              positionTimelineLocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : ""
                            }`}
                            title="Platí do"
                          />
                          <button
                            type="button"
                            onClick={() => removePositionTimelineRow(row.id)}
                            disabled={positionTimelineLocked}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            Smazat
                              </button>
                              </div>
                              {rowRangeError && (
                                <p className="mt-2 text-xs font-medium text-rose-700">
                                  Datum DO nemůže být dřív než datum OD.
                                </p>
                              )}
                              {rowOpenEndedNotLast && (
                                <p className="mt-2 text-xs font-medium text-rose-700">
                                  Současnost (prázdné DO) může být jen u posledního řádku.
                                </p>
                              )}
                              {isLastDraftRow &&
                                (!row.validTo.trim() || !positionTimelineLocked) && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {row.validTo.trim() ? (
                                    positionTimelineLocked ? null : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updatePositionTimelineRow(row.id, { validTo: "" })
                                      }
                                      className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
                                    >
                                      Nastavit DO: současnost
                                    </button>
                                    )
                                  ) : (
                                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                      Poslední pozice běží do současnosti
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )})}
                        </div>
                      )}

                {positionTimelineError ? (
                  <p className="text-xs font-medium text-rose-700">{positionTimelineError}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {positionTimelineSaved ? (
                    <span className="text-xs font-semibold text-emerald-700">Uloženo</span>
                  ) : null}
                  {positionTimelineLocked ? (
                    <button
                      type="button"
                      onClick={unlockPositionTimeline}
                      className="rounded-xl border border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                    >
                      Změna
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void savePositionTimeline()}
                      disabled={positionTimelineSaving}
                      className="rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {positionTimelineSaving ? "Ukládám..." : "Uložit timeline"}
                    </button>
                  )}
                </div>
              </section>
              )}

              {activeTab === "notifications" && (
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
              )}
            </div>

            {activeTab === "design" && (
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

                  <div className="space-y-2.5">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        Barva tmavých boxů
                      </h3>
                      <p className="text-xs text-slate-500">
                        Změní barvu tmavých tlačítek a aktivních filtrů v celé aplikaci.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {BOX_THEME_OPTIONS.map((opt) => {
                        const isActive = boxTheme === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => void handleBoxThemeChange(opt.id)}
                            aria-pressed={isActive}
                            className={`flex flex-col items-start gap-2 rounded-2xl border px-3 py-2 text-left transition ${
                              isActive
                                ? "border-slate-900 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                                : "border-slate-300 bg-white hover:border-slate-500"
                            }`}
                          >
                            <span
                              className="h-8 w-full rounded-lg"
                              style={{
                                background: `linear-gradient(135deg, ${opt.swatchFrom}, ${opt.swatchTo})`,
                              }}
                            />
                            <span className="text-xs font-semibold text-slate-800">
                              {opt.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                              {isActive ? "Aktivní" : "Vybrat"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
            </section>
            )}

            {/* Účet */}
            {activeTab === "account" && (
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

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                        <ShieldCheck size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                        <span>2FA (Microsoft Authenticator)</span>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          mfaEnabled
                            ? "border-emerald-700 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {mfaEnabled ? "Zapnuto" : "Vypnuto"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">
                      Po zadání hesla budete při přihlášení potvrzovat ještě jednorázový kód z aplikace Microsoft Authenticator.
                    </p>

                    {!user.emailVerified && !mfaEnabled && (
                      <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                        <p className="text-xs text-amber-900">
                          Pro zapnutí 2FA je potřeba ověřit e-mail účtu. Klikni na hlavní tlačítko níže.
                        </p>
                      </div>
                    )}

                    <input
                      type="password"
                      autoComplete="current-password"
                      className={fieldClass}
                      placeholder="Aktuální heslo pro potvrzení"
                      value={mfaPassword}
                      onChange={(e) => setMfaPassword(e.target.value)}
                    />

                    {mfaEnabled && !mfaEnrollmentSecret && (
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className={fieldClass}
                        placeholder="Aktuální 2FA kód (pro vypnutí)"
                        value={mfaReauthCode}
                        onChange={(e) =>
                          setMfaReauthCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                        }
                      />
                    )}

                    {!mfaEnabled && !mfaEnrollmentSecret && (
                      <button
                        type="button"
                        onClick={() =>
                          void (
                            user.emailVerified
                              ? handleStartMfaEnrollment()
                              : handleForceVerifyMfaEmail()
                          )
                        }
                        disabled={
                          mfaBusy ||
                          mfaForceVerifyingEmail
                        }
                        className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {mfaForceVerifyingEmail
                          ? "Posílám ověření…"
                          : mfaBusy
                            ? "Spouštím 2FA…"
                            : user.emailVerified
                              ? "Zapnout 2FA"
                              : "Ověřit e-mail a pokračovat"}
                      </button>
                    )}

                    {mfaEnrollmentSecret && (
                      <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3">
                        <p className="text-xs text-slate-600">
                          V Microsoft Authenticator zvol Přidat účet a naskenuj QR kód.
                        </p>

                        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          {mfaQrCodeLoading && (
                            <p className="text-xs text-slate-500">Generuji QR kód…</p>
                          )}
                          {!mfaQrCodeLoading && mfaQrCodeDataUrl && (
                            <Image
                              src={mfaQrCodeDataUrl}
                              alt="QR kód pro Microsoft Authenticator"
                              width={220}
                              height={220}
                              unoptimized
                              className="rounded-lg border border-slate-300 bg-white p-1"
                            />
                          )}
                          {mfaQrCodeError && (
                            <p className="text-xs text-rose-700">{mfaQrCodeError}</p>
                          )}
                          <p className="text-[11px] text-slate-500">
                            Pokud skenování nefunguje, použij setup key níže.
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                            Setup key
                          </div>
                          <div className="mt-1 break-all text-xs font-semibold text-slate-900">
                            {mfaEnrollmentSecret.secretKey}
                          </div>
                        </div>

                        <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                            Zobrazit QR URI (pokročilé)
                          </summary>
                          <p className="mt-2 break-all text-[10px] text-slate-600">
                            {mfaQrCodeUri}
                          </p>
                        </details>

                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          className={fieldClass}
                          placeholder="6místný kód z aplikace"
                          value={mfaEnrollmentCode}
                          onChange={(e) =>
                            setMfaEnrollmentCode(
                              e.target.value.replace(/\D/g, "").slice(0, 8)
                            )
                          }
                        />

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConfirmMfaEnrollment()}
                            disabled={mfaBusy}
                            className="inline-flex items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {mfaBusy ? "Potvrzuji…" : "Potvrdit a zapnout"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              clearMfaDraft();
                              setMfaStatus(null);
                            }}
                            className="text-xs text-slate-500 hover:text-slate-900"
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    )}

                    {mfaEnabled && !mfaEnrollmentSecret && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">
                          {mfaTotpLabel
                            ? `Aktivní faktor: ${mfaTotpLabel}`
                            : "Aktivní faktor: Microsoft Authenticator"}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleDisableMfa()}
                          disabled={mfaBusy}
                          className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-700 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {mfaBusy ? "Vypínám 2FA…" : "Vypnout 2FA"}
                        </button>
                      </div>
                    )}

                    {mfaStatus && (
                      <div
                        className={`text-xs ${
                          mfaStatus.type === "success"
                            ? "text-emerald-700"
                            : mfaStatus.type === "info"
                              ? "text-slate-700"
                              : "text-rose-700"
                        }`}
                      >
                        {mfaStatus.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
            )}
          </>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
