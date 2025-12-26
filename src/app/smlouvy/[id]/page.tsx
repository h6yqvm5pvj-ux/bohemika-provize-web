// src/app/smlouvy/[id]/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { auth, db } from "../../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";

import Plasma from "@/components/Plasma";
import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
} from "../../types/domain";
import Image from "next/image";

import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculateMaxdomov,
  calculateCppAuto,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateAllianzAuto,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateComfortCC,
} from "../../lib/productFormulas";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type ContractDoc = {
  id: string;
  note?: string | null;
  paid?: boolean | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: CommissionMode | null;
  managerOverrides?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
    items: CommissionResultItemDTO[];
    total: number;
  }[];

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
  frequencyRaw?: PaymentFrequency | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
  total?: number;
  items?: CommissionResultItemDTO[];

  userEmail?: string | null;
  clientName?: string | null;
  contractNumber?: string | null;

  policyStartDate?: FirestoreTimestamp | Date | string | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
  createdAt?: FirestoreTimestamp | Date | string | null;

  durationYears?: number | null;
};

function nameFromEmail(email?: string | null): string {
  if (!email) return "Neznámý poradce";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.map(cap).join(" ");
}

// ---------- helpers ----------

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as any).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("cs-CZ");
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function productLabel(p?: Product): string {
  switch (p) {
    case "neon":
      return "ČPP ŽP NEON";
    case "flexi":
      return "Kooperativa ŽP FLEXI";
    case "maximaMaxEfekt":
      return "MAXIMA ŽP MaxEfekt";
    case "pillowInjury":
      return "Pillow Úraz / Nemoc";
    case "zamex":
      return "ČPP ZAMEX";
    case "domex":
      return "ČPP DOMEX";
    case "cppPPRbez":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "cppPPRs":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS";
    case "allianzAuto":
      return "Allianz Auto";
    case "csobAuto":
      return "ČSOB Auto";
    case "uniqaAuto":
      return "UNIQA Auto";
    case "pillowAuto":
      return "Pillow Auto";
    case "kooperativaAuto":
      return "Kooperativa Auto";
    case "cppcestovko":
      return "ČPP Cestovko";
    case "axacestovko":
      return "AXA Cestovko";
    case "comfortcc":
      return "Comfort Commodity";
    default:
      return "Neznámý produkt";
  }
}

function productIcon(p?: Product): string {
  if (
    p === "neon" ||
    p === "flexi" ||
    p === "maximaMaxEfekt" ||
    p === "pillowInjury"
  ) {
    return "/icons/zivot.png";
  }

  if (
    p === "cppAuto" ||
    p === "allianzAuto" ||
    p === "csobAuto" ||
    p === "uniqaAuto" ||
    p === "pillowAuto" ||
    p === "kooperativaAuto"
  ) {
    return "/icons/icon_auto.png";
  }

  if (p === "zamex") {
    return "/icons/icon_zamex.png";
  }

  if (p === "domex" || p === "maxdomov" || p === "cppPPRs" || p === "cppPPRbez") {
    return "/icons/icon_domex.png";
  }

  if (p === "cppcestovko" || p === "axacestovko") {
    return "/icons/icon_cestovko.png";
  }

  if (p === "comfortcc") {
    return "/icons/trezor.png";
  }

  return "/icons/produkt.png";
}

function positionLabel(pos?: Position | null): string {
  const map: Record<Position, string> = {
    poradce1: "Poradce 1",
    poradce2: "Poradce 2",
    poradce3: "Poradce 3",
    poradce4: "Poradce 4",
    poradce5: "Poradce 5",
    poradce6: "Poradce 6",
    poradce7: "Poradce 7",
    poradce8: "Poradce 8",
    poradce9: "Poradce 9",
    poradce10: "Poradce 10",
    manazer4: "Manažer 4",
    manazer5: "Manažer 5",
    manazer6: "Manažer 6",
    manazer7: "Manažer 7",
    manazer8: "Manažer 8",
    manazer9: "Manažer 9",
    manazer10: "Manažer 10",
  };
  return pos ? map[pos] ?? pos : "—";
}

function frequencyText(raw?: PaymentFrequency | null): string {
  switch (raw) {
    case "monthly":
      return "měsíční";
    case "quarterly":
      return "čtvrtletní";
    case "semiannual":
      return "pololetní";
    case "annual":
      return "roční";
    default:
      return "—";
  }
}

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function toDateInputValue(value: unknown): string {
  const d = toDate(value);
  if (!d) return "";
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

function normalizeTitleForCompare(title: string | undefined | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

// spočítá kompletní výsledek pro danou pozici (stejné formule jako v kalkulačce)
function calculateResultForPosition(
  c: ContractDoc,
  position: Position,
  mode: CommissionMode | null
): { items: CommissionResultItemDTO[]; total: number } | null {
  const product = c.productKey;
  if (!product) return null;

  const amount = c.inputAmount ?? 0;
  const freq = (c.frequencyRaw ?? "annual") as PaymentFrequency;
  const comfortPayment = c.comfortPayment ?? 0;
  const comfortGradual = !!c.comfortGradual;

  const years =
    typeof c.durationYears === "number" && !Number.isNaN(c.durationYears)
      ? c.durationYears
      : 30;

  const usedMode = (mode ?? "standard") as CommissionMode;

  switch (product) {
    case "neon":
      return calculateNeon(amount, position, years, usedMode);
    case "flexi":
      return calculateFlexi(amount, position, usedMode);
    case "maximaMaxEfekt":
      return calculateMaxEfekt(amount, years, position, usedMode);
    case "pillowInjury":
      return calculatePillowInjury(amount, position, usedMode);
    case "domex":
      return calculateDomex(amount, freq, position);
    case "cppPPRbez":
      return calculateCppPPRbez(amount, freq, position);
    case "maxdomov":
      return calculateMaxdomov(amount, freq, position);
    case "cppAuto":
      return calculateCppAuto(amount, freq, position);
    case "cppPPRs":
      return calculateCppPPRs(amount, freq, position);
    case "allianzAuto":
      return calculateAllianzAuto(amount, freq, position);
    case "csobAuto":
      return calculateCsobAuto(amount, freq, position);
    case "uniqaAuto":
      return calculateUniqaAuto(amount, freq, position);
    case "pillowAuto":
      return calculatePillowAuto(amount, freq, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, freq, position);
    case "zamex":
      return calculateZamex(amount, freq, position);
    case "cppcestovko":
      return calculateCppCestovko(amount, position);
    case "axacestovko":
      return calculateAxaCestovko(amount, position);
    case "comfortcc":
      return calculateComfortCC({
        fee: amount,
        payment: comfortGradual ? comfortPayment : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position,
      });
    default:
      return null;
  }
}

// ---------- PAGE ----------

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;

  // slug: email___entryId
  let ownerEmail: string | null = null;
  let entryId: string | null = null;

  if (typeof rawId === "string") {
    const decoded = decodeURIComponent(rawId);
    const parts = decoded.split("___");
    if (parts.length === 2) {
      ownerEmail = parts[0];
      entryId = parts[1];
    }
  }

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [managerPosition, setManagerPosition] = useState<Position | null>(
    null
  );
  const [managerMode, setManagerMode] = useState<CommissionMode | null>(
    null
  );

  const [contract, setContract] = useState<ContractDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overrideItems, setOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [overrideTotal, setOverrideTotal] = useState<number | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showAdvisorDetails, setShowAdvisorDetails] = useState(false);
  const [ownerPosition, setOwnerPosition] = useState<Position | null>(null);
  const [ownerManagerEmail, setOwnerManagerEmail] = useState<string | null>(null);
  const [ownerManagerPosition, setOwnerManagerPosition] = useState<Position | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [updatingPaid, setUpdatingPaid] = useState(false);
  const [paidError, setPaidError] = useState<string | null>(null);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // metadata přihlášeného usera
  useEffect(() => {
    const loadUserMeta = async () => {
      if (!user?.email) return;

      try {
        const ref = doc(db, "users", user.email);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data.position) {
            setManagerPosition(data.position as Position);
          }
          if (data.commissionMode) {
            setManagerMode(data.commissionMode as CommissionMode);
          }
        }
      } catch (e) {
        console.error("Chyba při načítání uživatele:", e);
      }
    };

    loadUserMeta();
  }, [user]);

  // načtení smlouvy – users/{email}/entries/{entryId}
  useEffect(() => {
    const load = async () => {
      if (!ownerEmail || !entryId) {
        setError("Neplatný odkaz na smlouvu.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const ref = doc(db, "users", ownerEmail, "entries", entryId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Smlouva nebyla nalezena.");
          setContract(null);
        } else {
          const data = snap.data() as any;
          const c: ContractDoc = {
            id: snap.id,
            ...data,
          };
          setContract(c);
          setNoteDraft((data.note as string | undefined) ?? "");

          // meta o poradci
          try {
            const userRef = doc(db, "users", ownerEmail);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const d = userSnap.data() as any;
              const pos = (d.position ?? null) as Position | null;
              const mgrEmail =
                ((d.managerEmail as string | undefined) ?? null)?.toLowerCase() ??
                null;
              setOwnerPosition(pos);
              setOwnerManagerEmail(mgrEmail);

              if (mgrEmail) {
                const mgrSnap = await getDoc(doc(db, "users", mgrEmail));
                if (mgrSnap.exists()) {
                  const md = mgrSnap.data() as any;
                  setOwnerManagerPosition(
                    (md.position ?? null) as Position | null
                  );
                }
              }
            }
          } catch (metaErr) {
            console.error("Chyba při načítání uživatele smlouvy:", metaErr);
          }
        }
      } catch (e) {
        console.error(e);
        setError("Při načítání smlouvy došlo k chybě.");
        setContract(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ownerEmail, entryId]);

  const premium = contract?.inputAmount ?? 0;
  const total = contract?.total ?? 0;
  const freq = contract?.frequencyRaw ?? null;
  const prod = contract?.productKey as Product | undefined;
  const durationYears =
    typeof contract?.durationYears === "number" && !Number.isNaN(contract.durationYears)
      ? contract.durationYears
      : null;
  const showDurationForNeon = prod === "neon" && durationYears;

  const isOwnContract = useMemo(() => {
    if (!user?.email || !contract?.userEmail) return false;
    return (
      user.email.trim().toLowerCase() ===
      contract.userEmail.trim().toLowerCase()
    );
  }, [user, contract]);

  const isManagerViewingSubordinate = useMemo(() => {
    if (!user?.email || !contract?.userEmail) return false;
    if (!isManagerPosition(managerPosition)) return false;

    const current = user.email.trim().toLowerCase();
    const owner = contract.userEmail.trim().toLowerCase();
    return current !== owner;
  }, [user, contract, managerPosition]);

  const effectiveManagerPosition =
    (contract as any)?.managerPositionSnapshot ?? managerPosition;
  const effectiveManagerMode =
    (contract as any)?.managerModeSnapshot ?? managerMode;

  const [editMode, setEditMode] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editContractNumber, setEditContractNumber] = useState("");
  const [editContractSigned, setEditContractSigned] = useState("");
  const [editPolicyStart, setEditPolicyStart] = useState("");
  const [editDuration, setEditDuration] = useState<number | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const resetEditFields = () => {
    if (!contract) return;
    setEditClientName(contract.clientName ?? "");
    setEditContractNumber(contract.contractNumber ?? "");
    setEditContractSigned(toDateInputValue(contract.contractSignedDate ?? contract.createdAt));
    setEditPolicyStart(toDateInputValue(contract.policyStartDate));
    setEditDuration(
      typeof contract.durationYears === "number" && !Number.isNaN(contract.durationYears)
        ? contract.durationYears
        : null
    );
  };

  useEffect(() => {
    if (!contract) return;
    resetEditFields();
    setDetailsSaved(false);
    setDetailsError(null);
  }, [contract]);

  const handleSaveDetails = async () => {
    if (!isOwnContract || !ownerEmail || !entryId) return;
    setSavingDetails(true);
    setDetailsError(null);
    setDetailsSaved(false);

    try {
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      const trimmedName = editClientName.trim();
      const trimmedNumber = editContractNumber.trim();
      const signedDate = editContractSigned ? new Date(editContractSigned) : null;
      const startDate = editPolicyStart ? new Date(editPolicyStart) : null;
      const durationVal =
        prod === "neon" && typeof editDuration === "number" && !Number.isNaN(editDuration)
          ? Math.max(1, Math.min(40, editDuration))
          : null;

      const updates: Record<string, any> = {
        clientName: trimmedName || null,
        contractNumber: trimmedNumber || null,
        contractSignedDate: signedDate ?? null,
        policyStartDate: startDate ?? null,
      };
      if (prod === "neon") {
        updates.durationYears = durationVal ?? null;
      }

      await updateDoc(ref, updates);

      setContract((prev) =>
        prev
          ? {
              ...prev,
              clientName: trimmedName || null,
              contractNumber: trimmedNumber || null,
              contractSignedDate: signedDate ?? null,
              policyStartDate: startDate ?? null,
              durationYears:
                prod === "neon"
                  ? durationVal ?? prev.durationYears ?? null
                  : prev.durationYears ?? null,
            }
          : prev
      );

      setEditMode(false);
      setDetailsSaved(true);
    } catch (e) {
      console.error("Chyba při ukládání detailů smlouvy:", e);
      setDetailsError("Nepodařilo se uložit změny. Zkus to prosím znovu.");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveNote = async () => {
    if (!ownerEmail || !entryId || !isOwnContract) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSaved(false);

    try {
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await updateDoc(ref, { note: noteDraft.trim() });
      setContract((prev) => (prev ? { ...prev, note: noteDraft.trim() } : prev));
      setNoteSaved(true);
    } catch (e) {
      console.error("Chyba při ukládání poznámky:", e);
      setNoteError("Poznámku se nepodařilo uložit. Zkus to prosím znovu.");
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!ownerEmail || !entryId || !isOwnContract) return;
    const nextValue = !(contract?.paid ?? false);
    setUpdatingPaid(true);
    setPaidError(null);
    try {
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await updateDoc(ref, { paid: nextValue });
      setContract((prev) => (prev ? { ...prev, paid: nextValue } : prev));
    } catch (e) {
      console.error("Chyba při ukládání stavu platby:", e);
      setPaidError("Nepodařilo se uložit stav platby. Zkus to prosím znovu.");
    } finally {
      setUpdatingPaid(false);
    }
  };

  // výpočet meziprovize
  useEffect(() => {
    const managerModeForOverride: CommissionMode =
      (effectiveManagerMode as CommissionMode | null) ??
      (managerMode as CommissionMode | null) ??
      "standard";

    if (!contract || !effectiveManagerPosition || !isManagerViewingSubordinate) {
      setOverrideItems(null);
      setOverrideTotal(null);
      return;
    }

    const storedOverride =
      (contract?.managerOverrides as ContractDoc["managerOverrides"])?.find(
        (o) => o.email?.toLowerCase() === user?.email?.toLowerCase()
      ) ?? null;

    if (storedOverride) {
      const advisorTitles = new Set(
        (contract.items ?? []).map((it) => normalizeTitleForCompare(it.title as string))
      );
      const overrideTitles = (storedOverride.items ?? []).map((it) =>
        normalizeTitleForCompare(it.title as string)
      );

      const hasSameCount = overrideTitles.length === advisorTitles.size;
      const allTitlesMatch =
        overrideTitles.length > 0 &&
        overrideTitles.every((t) => t && advisorTitles.has(t));

      if (hasSameCount && allTitlesMatch) {
        setOverrideItems(storedOverride.items ?? null);
        setOverrideTotal(storedOverride.total ?? null);
        return;
      }
    }

    const managerResult = calculateResultForPosition(
      contract,
      effectiveManagerPosition,
      managerModeForOverride
    );
    if (!managerResult) {
      setOverrideItems(null);
      setOverrideTotal(null);
      return;
    }

    const baselinePos =
      ownerPosition ?? ((contract.position as Position | null) ?? null);
    const baselineMode = managerModeForOverride;

    const baselineResult =
      baselinePos != null
        ? calculateResultForPosition(contract, baselinePos, baselineMode)
        : null;

    const subItems = baselineResult?.items ?? contract.items ?? [];
    const subTotal = baselineResult?.total ?? contract.total ?? 0;

    const diffItems: CommissionResultItemDTO[] = managerResult.items.map(
      (mgrItem, idx) => {
        const subAmount = subItems[idx]?.amount ?? 0;
        return {
          title: mgrItem.title,
          amount: mgrItem.amount - subAmount,
        };
      }
    );

    const diffTotal = managerResult.total - subTotal;

    setOverrideItems(diffItems);
    setOverrideTotal(diffTotal);
  }, [
    contract,
    managerPosition,
    managerMode,
    isManagerViewingSubordinate,
    ownerManagerPosition,
    ownerPosition,
  ]);

  // mazání smlouvy
  const handleDelete = async () => {
    if (!ownerEmail || !entryId) return;
    const confirmed = window.confirm(
      "Opravdu chceš tuto smlouvu smazat? Tuto akci nelze vrátit."
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await deleteDoc(ref);
      window.location.href = "/smlouvy";
    } catch (e) {
      console.error("Chyba při mazání smlouvy:", e);
      setDeleteError(
        "Smlouvu se nepodařilo smazat. Zkus to prosím znovu."
      );
      setDeleting(false);
    }
  };

  // vyfiltrované položky bez řádku "Celkem"
  const filterDomexItems = (arr: CommissionResultItemDTO[]) => {
    if (prod !== "domex") return arr;
    return arr.filter((it) =>
      (it.title ?? "").toLowerCase().includes("(z platby)")
    );
  };

  const adviserItems =
    filterDomexItems(
      (contract?.items ?? []).filter(
        (it) => !it.title.toLowerCase().includes("celkem")
      )
    ) ?? [];

  const managerItems =
    filterDomexItems(
      (overrideItems ?? []).filter(
        (it) => !it.title.toLowerCase().includes("celkem")
      )
    ) ?? [];

  const showMeziprovision =
    managerItems.length > 0 &&
    overrideTotal != null &&
    isManagerViewingSubordinate;

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-50">
      {/* Plasma pozadí jako na ostatních stránkách */}
      <div className="fixed inset-0 -z-10 bg-black">
        <Plasma
          color="#4f46e5"
          speed={0.6}
          direction="forward"
          scale={1.1}
          opacity={0.85}
          mouseInteractive={false}
          animated={false}
        />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <div className="rounded-3xl bg-white/5 border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-6 sm:p-8 space-y-6">
            {/* HEADER */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-1">
                  Detail smlouvy
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {isOwnContract && (
                  <button
                    type="button"
                    onClick={handleTogglePaid}
                    disabled={updatingPaid}
                    className={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold border transition ${
                      contract?.paid
                        ? "bg-emerald-500/80 border-emerald-400 text-emerald-900"
                        : "bg-rose-500/20 border-rose-400/70 text-rose-100"
                    } ${updatingPaid ? "opacity-60" : ""}`}
                  >
                    {contract?.paid ? "Zaplaceno" : "Nezaplaceno"}
                  </button>
                )}

                {isOwnContract && !editMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailsSaved(false);
                      setEditMode(true);
                    }}
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/15"
                  >
                    Upravit údaje
                  </button>
                )}

                {isOwnContract && editMode && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={savingDetails}
                      className="rounded-xl border border-emerald-300/50 bg-emerald-500/70 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-950 hover:bg-emerald-400 transition disabled:opacity-60"
                    >
                      {savingDetails ? "Ukládám…" : "Uložit změny"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetEditFields();
                        setEditMode(false);
                      }}
                      disabled={savingDetails}
                      className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/10 disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                  </>
                )}

                <Link
                  href="/smlouvy"
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/10"
                >
                  ← Zpět na smlouvy
                </Link>
              </div>
            </header>

            {detailsError && (
              <div className="rounded-xl border border-rose-400/60 bg-rose-500/15 px-4 py-2 text-sm text-rose-100">
                {detailsError}
              </div>
            )}
            {detailsSaved && (
              <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-100">
                Změny byly uloženy.
              </div>
            )}

            {/* Klient / Produkt boxy */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                  Klient
                </div>
                {editMode ? (
                  <input
                    type="text"
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-lg font-semibold text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="Jméno klienta"
                  />
                ) : (
                  <div className="text-2xl font-semibold text-slate-50">
                    {contract?.clientName ?? "—"}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                  Produkt
                </div>
                <div className="text-lg font-semibold text-slate-50">
                  <div className="flex items-center gap-3">
                    <Image
                      src={productIcon(prod)}
                      alt="Produkt"
                      width={56}
                      height={56}
                      className="h-12 w-auto"
                    />
                    <span>{productLabel(prod)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Info o poradci – zobraz pouze manažerovi na podřízené smlouvě */}
            {contract && isManagerViewingSubordinate && (
              <section className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                <h3 className="text-sm font-semibold text-slate-100 mb-2">
                  Poradce
                </h3>
                <dl className="space-y-1 text-sm text-slate-200">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-300">Sjednal</dt>
                    <dd className="font-semibold text-right">
                      {nameFromEmail(contract.userEmail)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-300">Pozice</dt>
                    <dd className="font-semibold text-right">
                      {positionLabel(
                        ownerPosition ?? (contract.position as Position | null)
                      )}
                    </dd>
                  </div>
                  {ownerManagerEmail && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-300">Nadřízený</dt>
                      <dd className="font-semibold text-right">
                        {nameFromEmail(ownerManagerEmail)}
                        {ownerManagerPosition && (
                          <span className="text-[11px] text-slate-400 block">
                            {positionLabel(ownerManagerPosition)}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {/* STAVY */}
            {loading && (
              <p className="text-sm text-slate-300">Načítám smlouvu…</p>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            {!loading && paidError && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {paidError}
              </div>
            )}

            {!loading && !error && contract && (
              <div className="space-y-6">
                {/* ZÁKLADNÍ INFO */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
                    <h3 className="text-base font-semibold text-slate-100 mb-3">
                      Základní údaje
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Sjednána jako</dt>
                        <dd className="font-semibold text-right">
                          {positionLabel(contract.position)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Pojistné</dt>
                        <dd className="font-semibold text-right">
                          {formatMoney(premium)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">
                          Frekvence platby
                        </dt>
                        <dd className="font-semibold text-right">
                          {frequencyText(freq)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* DATA SMLOUVY */}
                  <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
                    <h3 className="text-base font-semibold text-slate-100 mb-3">
                      Data smlouvy
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Datum sjednání</dt>
                        <dd className="font-semibold text-right">
                          {editMode ? (
                            <input
                              type="date"
                              value={editContractSigned}
                              onChange={(e) => setEditContractSigned(e.target.value)}
                              className="rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            />
                          ) : (
                            formatDate(contract.contractSignedDate ?? contract.createdAt)
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">
                          Počátek smlouvy
                        </dt>
                        <dd className="font-semibold text-right">
                          {editMode ? (
                            <input
                              type="date"
                              value={editPolicyStart}
                              onChange={(e) => setEditPolicyStart(e.target.value)}
                              className="rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            />
                          ) : (
                            formatDate(contract.policyStartDate)
                          )}
                        </dd>
                      </div>
                      {showDurationForNeon && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-300">Doba trvání (provize)</dt>
                          <dd className="font-semibold text-right">
                            {editMode ? (
                              <input
                                type="number"
                                min={1}
                                max={40}
                                value={editDuration ?? ""}
                                onChange={(e) =>
                                  setEditDuration(e.target.value ? Number(e.target.value) : null)
                                }
                                className="w-20 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                              />
                            ) : (
                              `${durationYears} ${durationYears === 1 ? "rok" : "let"}`
                            )}
                          </dd>
                        </div>
                      )}
                      {editMode ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-300">Číslo smlouvy</dt>
                          <dd className="font-semibold text-right w-40">
                            <input
                              type="text"
                              value={editContractNumber}
                              onChange={(e) => setEditContractNumber(e.target.value)}
                              className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1 text-xs text-slate-50 outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                              placeholder="Číslo smlouvy"
                            />
                          </dd>
                        </div>
                      ) : (
                        contract.contractNumber && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-300">
                              Číslo smlouvy
                            </dt>
                            <dd className="font-semibold text-right">
                              {contract.contractNumber}
                            </dd>
                          </div>
                        )
                      )}
                    </dl>
                  </div>
                </section>

                {/* MEZIPROVIZE – jen když manažer kouká na podřízeného */}
                {showMeziprovision && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-emerald-200">
                      Meziprovize pro {effectiveManagerPosition ?? "manažera"}
                    </h3>
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                      {managerItems.map((item) => (
                        <div
                          key={item.title}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <span className="text-sm text-slate-200">
                            {item.title}
                          </span>
                          <span className="text-sm font-semibold text-emerald-300">
                            {formatMoney(item.amount)}
                          </span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-3">
                        <span className="text-sm font-semibold">
                          Celkem meziprovize
                        </span>
                        <span className="text-base font-bold text-emerald-300">
                          {formatMoney(overrideTotal)}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* PROVIZE PORADCE */}
                {isOwnContract ? (
                  // VLASTNÍ SMLOUVA – vždy viditelné
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Výpočet provizí
                    </h3>
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                      {adviserItems.map((item) => (
                        <div
                          key={item.title}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <span className="text-sm text-slate-200">
                            {item.title}
                          </span>
                          <span className="text-sm font-medium text-slate-50">
                            {formatMoney(item.amount)}
                          </span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-3">
                        <span className="text-sm font-semibold">
                          Celkem
                        </span>
                        <span className="text-base font-bold">
                          {formatMoney(total)}
                        </span>
                      </div>
                    </div>
                  </section>
                ) : (
                  // MANAŽER NA SMLOUVĚ PODŘÍZENÉHO – collapsible
                  <section className="space-y-3">
                    <button
                      type="button"
                      onClick={() =>
                        setShowAdvisorDetails((v) => !v)
                      }
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100 hover:text-emerald-300 transition"
                    >
                      <span>
                        {showAdvisorDetails
                          ? "Skrýt provizi poradce"
                          : "Zobrazit provizi poradce"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {showAdvisorDetails ? "▲" : "▼"}
                      </span>
                    </button>

                    {showAdvisorDetails && (
                      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                        {adviserItems.map((item) => (
                          <div
                            key={item.title}
                            className="flex items-baseline justify-between gap-3 py-2"
                          >
                            <span className="text-sm text-slate-200">
                              {item.title}
                            </span>
                            <span className="text-sm font-medium text-slate-50">
                              {formatMoney(item.amount)}
                            </span>
                          </div>
                        ))}

                        <div className="flex items-center justify-between pt-3">
                          <span className="text-sm font-semibold">
                            Celkem
                          </span>
                          <span className="text-base font-bold">
                            {formatMoney(total)}
                          </span>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* POZNÁMKA */}
                <section className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-100">
                      Poznámka ke smlouvě
                    </h3>
                    {noteSaved && (
                      <span className="text-[11px] text-emerald-300">
                        Uloženo
                      </span>
                    )}
                  </div>

                  {noteError && (
                    <p className="text-xs text-amber-200 bg-amber-900/40 border border-amber-500/60 rounded-lg px-3 py-2">
                      {noteError}
                    </p>
                  )}

                  {isOwnContract ? (
                    <div className="space-y-3">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => {
                          setNoteDraft(e.target.value);
                          setNoteSaved(false);
                        }}
                        rows={4}
                        className="w-full rounded-2xl border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none"
                        placeholder="Sem si můžeš napsat poznámku jen pro sebe…"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={savingNote}
                          className="inline-flex items-center rounded-xl border border-emerald-400/70 bg-emerald-500/25 px-4 py-2 text-xs sm:text-sm font-semibold text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.4)] hover:bg-emerald-500/35 hover:border-emerald-200 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {savingNote ? "Ukládám…" : "Uložit poznámku"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                      {contract.note?.trim()
                        ? contract.note.trim()
                        : "Autor smlouvy zatím žádnou poznámku nepřidal."}
                    </div>
                  )}
                </section>

                {/* SMAZAT SMLOUVU */}
                <section className="pt-2">
                  {deleteError && (
                    <p className="mb-2 text-xs text-red-300">
                      {deleteError}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="inline-flex items-center rounded-xl border border-red-500/70 bg-red-600/80 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-lg shadow-red-500/40 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {deleting ? "Mažu…" : "Smazat smlouvu"}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
