"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Loader2,
  Search,
  Send,
  Smile,
  Users,
  X,
} from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "@/app/firebase";

type TargetMode = "all" | "selected";

type Subordinate = {
  email: string;
  name: string;
};

const MAX_MESSAGE_LENGTH = 200;
const QUICK_EMOJIS = [
  "👏",
  "🔥",
  "💪",
  "✅",
  "🚀",
  "🎯",
  "📈",
  "🙏",
  "🙂",
  "😄",
  "🤝",
  "🏆",
  "⭐",
  "💬",
  "❤️",
  "📣",
];

function formatNameFromEmail(email: string): string {
  const base = email.split("@")[0] ?? "";
  const parts = base.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;

  const cap = (value: string) =>
    value.length === 0
      ? value
      : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

  return parts.map(cap).join(" ");
}

export default function TeamMessagePage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [subordinatesModalOpen, setSubordinatesModalOpen] = useState(false);
  const [subordinateSearch, setSubordinateSearch] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setUserEmail(fbUser?.email?.trim().toLowerCase() ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userEmail) {
      setSubordinates([]);
      return;
    }

    const load = async () => {
      setLoadingSubs(true);
      setErrorText(null);

      try {
        const usersRef = collection(db, "users");
        const subsQ = query(usersRef, where("managerEmail", "==", userEmail));
        const snap = await getDocs(subsQ);

        const items = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const email =
            typeof data.email === "string" && data.email.trim().length > 0
              ? data.email.trim().toLowerCase()
              : docSnap.id.toLowerCase();
          const name =
            typeof data.name === "string" && data.name.trim().length > 0
              ? data.name.trim()
              : formatNameFromEmail(email);
          return { email, name };
        });

        const deduped = new Map<string, Subordinate>();
        items.forEach((item) => {
          if (!deduped.has(item.email)) deduped.set(item.email, item);
        });

        const sorted = Array.from(deduped.values()).sort((a, b) =>
          a.name.localeCompare(b.name, "cs")
        );
        setSubordinates(sorted);
      } catch (e) {
        console.error("Chyba při načítání podřízených:", e);
        setErrorText("Chyba při načítání podřízených. Zkus to prosím znovu.");
      } finally {
        setLoadingSubs(false);
      }
    };

    void load();
  }, [userEmail]);

  useEffect(() => {
    setSelectedEmails((prev) =>
      prev.filter((email) => subordinates.some((sub) => sub.email === email))
    );
  }, [subordinates]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!subordinatesModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSubordinatesModalOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [subordinatesModalOpen]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current != null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const subordinateCount = subordinates.length;

  const filteredSubordinates = useMemo(() => {
    const term = subordinateSearch.trim().toLowerCase();
    if (!term) return subordinates;
    return subordinates.filter(
      (sub) =>
        sub.name.toLowerCase().includes(term) ||
        sub.email.toLowerCase().includes(term)
    );
  }, [subordinateSearch, subordinates]);

  const trimmedMessage = messageText.trim();
  const hasSelectedRecipients =
    targetMode === "all" || selectedEmails.length > 0;
  const canSend =
    !!userEmail &&
    !loadingSubs &&
    subordinateCount > 0 &&
    hasSelectedRecipients &&
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= MAX_MESSAGE_LENGTH &&
    !sending;

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const source = messageText;
    const start = textarea?.selectionStart ?? source.length;
    const end = textarea?.selectionEnd ?? source.length;
    const next =
      source.slice(0, start) + emoji + source.slice(end, source.length);

    if (next.length > MAX_MESSAGE_LENGTH) return;

    setMessageText(next);
    setEmojiPickerOpen(false);
    setSendSuccess(false);
    setErrorText(null);

    const cursor = start + emoji.length;
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const toggleSelectedEmail = (email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email)
        ? prev.filter((item) => item !== email)
        : [...prev, email]
    );
    setSendSuccess(false);
    if (errorText) setErrorText(null);
  };

  const handleSend = async () => {
    if (!canSend || !userEmail) return;

    setSending(true);
    setErrorText(null);
    setSendSuccess(false);

    try {
      const payload: {
        managerEmail: string;
        message: string;
        target: TargetMode;
        recipients?: string[];
      } = {
        managerEmail: userEmail,
        message: trimmedMessage.slice(0, MAX_MESSAGE_LENGTH),
        target: targetMode,
      };

      if (targetMode === "selected") {
        payload.recipients = selectedEmails;
      }

      const res = await fetch(
        "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/sendTeamMessage",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const json = (await res.json()) as { ok?: boolean; error?: string } | null;
      if (!json?.ok) {
        throw new Error(json?.error || "Server nevrátil úspěšnou odpověď.");
      }

      setSendSuccess(true);
      setMessageText("");

      if (successTimerRef.current != null) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setSendSuccess(false);
      }, 3000);
    } catch (e) {
      console.error("Chyba při odesílání zprávy týmu:", e);
      setErrorText(
        e instanceof Error
          ? e.message
          : "Nepodařilo se odeslat notifikaci. Zkus to prosím znovu."
      );
    } finally {
      setSending(false);
    }
  };

  const statusText = !user
    ? "Musíš být přihlášený, aby šla zpráva odeslat."
    : loadingSubs
      ? "Načítám podřízené…"
      : subordinateCount === 0
        ? "Nemáš žádné podřízené s nastaveným managerEmail."
        : targetMode === "all"
          ? `Zpráva se odešle ${subordinateCount} podřízeným.`
          : selectedEmails.length === 0
            ? "Vyber alespoň jednoho podřízeného."
            : `Zpráva se odešle ${selectedEmails.length} vybraným podřízeným.`;

  return (
    <AppLayout active="tools">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Zpráva týmu
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Napiš krátkou zprávu a odešli ji všem nebo vybraným podřízeným.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.1)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Komu poslat</div>
            <div className="inline-flex rounded-full border border-slate-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setTargetMode("all")}
                className={`ui-focus rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  targetMode === "all"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Všem
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetMode("selected");
                  setSubordinatesModalOpen(true);
                }}
                className={`ui-focus rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  targetMode === "selected"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Vybraní podřízení
              </button>
            </div>
          </div>

          {targetMode === "selected" ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <button
                type="button"
                onClick={() => setSubordinatesModalOpen(true)}
                disabled={loadingSubs || subordinateCount === 0}
                className="ui-focus inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Users size={14} strokeWidth={2} aria-hidden="true" />
                Vybrat podřízené
              </button>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>Vybráno: {selectedEmails.length}</span>
                {selectedEmails.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedEmails([])}
                    className="ui-focus rounded-full border border-slate-300 px-2 py-1 font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Vyčistit
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Text zprávy</div>
            <span
              className={`text-xs font-medium ${
                messageText.length > MAX_MESSAGE_LENGTH
                  ? "text-rose-600"
                  : "text-slate-500"
              }`}
            >
              {messageText.length}/{MAX_MESSAGE_LENGTH}
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              setSendSuccess(false);
              if (errorText) setErrorText(null);
            }}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Napiš zprávu pro tým…"
            className="min-h-[210px] w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base leading-relaxed text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div ref={emojiPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setEmojiPickerOpen((open) => !open)}
                className="ui-focus inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                aria-label="Vložit emoji"
              >
                <Smile size={16} strokeWidth={2} aria-hidden="true" />
                Emoji
              </button>

              {emojiPickerOpen ? (
                <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.15)]">
                  <div className="grid grid-cols-8 gap-1">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-slate-100"
                        aria-label={`Vložit ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="ui-focus inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sending ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              ) : (
                <Send size={14} strokeWidth={2} aria-hidden="true" />
              )}
              {sending ? "Odesílám…" : "Odeslat zprávu"}
            </button>
          </div>

          <div className="mt-3 min-h-[20px] text-sm">
            {errorText ? (
              <p className="font-medium text-rose-600">{errorText}</p>
            ) : sendSuccess ? (
              <p className="font-medium text-emerald-700">
                Notifikace byla úspěšně odeslána.
              </p>
            ) : (
              <p className="text-slate-600">{statusText}</p>
            )}
          </div>
        </section>
      </div>

      {subordinatesModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onClick={() => setSubordinatesModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.25)] sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Vyber podřízené
              </h2>
              <button
                type="button"
                onClick={() => setSubordinatesModalOpen(false)}
                className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-50"
                aria-label="Zavřít"
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={subordinateSearch}
                onChange={(e) => setSubordinateSearch(e.target.value)}
                placeholder="Hledat podřízeného (jméno nebo e-mail)"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15"
              />
            </div>

            <div className="mt-3 max-h-[340px] space-y-2 overflow-auto pr-1">
              {loadingSubs ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Načítám podřízené…
                </div>
              ) : filteredSubordinates.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Pro tento filtr nebyli nalezeni podřízení.
                </div>
              ) : (
                filteredSubordinates.map((sub) => {
                  const selected = selectedEmails.includes(sub.email);
                  return (
                    <button
                      key={sub.email}
                      type="button"
                      onClick={() => toggleSelectedEmail(sub.email)}
                      className={`ui-focus flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-slate-900 bg-slate-100"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {sub.name}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {sub.email}
                        </div>
                      </div>
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          selected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Vybráno: {selectedEmails.length}
              </p>
              <button
                type="button"
                onClick={() => setSubordinatesModalOpen(false)}
                className="ui-focus rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Hotovo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
