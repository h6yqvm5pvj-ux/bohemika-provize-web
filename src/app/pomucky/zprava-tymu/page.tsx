"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  Search,
  Send,
  Smile,
  Users,
  X,
} from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

type TargetMode = "all" | "selected";

type TeamMember = {
  email: string;
  name: string;
  managerEmail: string;
};

type Subordinate = TeamMember & {
  depth: number;
  subtreeSize: number;
};

type TeamOverviewApiResponse = {
  ok?: boolean;
  error?: string;
  members?: Array<{
    email?: string | null;
    name?: string | null;
    managerEmail?: string | null;
  }>;
};

type TeamMessageApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  detail?: string;
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

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildSubordinateTree(
  members: TeamMember[],
  rootManagerEmail: string
): Subordinate[] {
  const membersByEmail = new Map<string, TeamMember>();
  members.forEach((member) => {
    if (member.email) membersByEmail.set(member.email, member);
  });

  const childrenByManager = new Map<string, string[]>();
  members.forEach((member) => {
    if (!member.email || !member.managerEmail || member.email === member.managerEmail) {
      return;
    }
    const bucket = childrenByManager.get(member.managerEmail) ?? [];
    bucket.push(member.email);
    childrenByManager.set(member.managerEmail, bucket);
  });

  const nameFor = (email: string) =>
    membersByEmail.get(email)?.name || formatNameFromEmail(email);
  childrenByManager.forEach((children, manager) => {
    const uniqueSorted = [...new Set(children)].sort((a, b) =>
      nameFor(a).localeCompare(nameFor(b), "cs")
    );
    childrenByManager.set(manager, uniqueSorted);
  });

  const descendants: Array<Omit<Subordinate, "subtreeSize">> = [];
  const visited = new Set<string>();
  const stack = [...(childrenByManager.get(rootManagerEmail) ?? [])]
    .reverse()
    .map((email) => ({ email, depth: 0 }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const { email, depth } = current;
    if (!email || visited.has(email) || email === rootManagerEmail) continue;

    const member = membersByEmail.get(email);
    if (!member) continue;

    visited.add(email);
    descendants.push({
      email: member.email,
      name: member.name,
      managerEmail: member.managerEmail,
      depth,
    });

    const children = childrenByManager.get(email) ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (!visited.has(child)) {
        stack.push({ email: child, depth: depth + 1 });
      }
    }
  }

  const descendantSet = new Set(descendants.map((item) => item.email));

  const subtreeSizeFor = (rootEmail: string): number => {
    const localVisited = new Set<string>();
    const queue = [rootEmail];

    while (queue.length > 0) {
      const email = queue.shift() ?? "";
      if (!email || localVisited.has(email) || !descendantSet.has(email)) continue;
      localVisited.add(email);

      const children = childrenByManager.get(email) ?? [];
      children.forEach((child) => {
        if (!localVisited.has(child) && descendantSet.has(child)) queue.push(child);
      });
    }

    return localVisited.size;
  };

  return descendants.map((item) => ({
    ...item,
    subtreeSize: subtreeSizeFor(item.email),
  }));
}

function expandSelectedToDescendants(
  selectedRoots: string[],
  subordinates: Subordinate[]
): string[] {
  if (selectedRoots.length === 0 || subordinates.length === 0) return [];

  const allowed = new Set(subordinates.map((sub) => sub.email));
  const childrenByManager = new Map<string, string[]>();

  subordinates.forEach((sub) => {
    const bucket = childrenByManager.get(sub.managerEmail) ?? [];
    bucket.push(sub.email);
    childrenByManager.set(sub.managerEmail, bucket);
  });

  const queue = [...new Set(selectedRoots.map((email) => normalizeEmail(email)))].filter(
    (email) => allowed.has(email)
  );
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < allowed.size) {
    const email = queue.shift() ?? "";
    if (!email || visited.has(email) || !allowed.has(email)) continue;

    visited.add(email);

    const children = childrenByManager.get(email) ?? [];
    children.forEach((child) => {
      if (!visited.has(child) && allowed.has(child)) {
        queue.push(child);
      }
    });
  }

  return [...visited];
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
    if (!user || !userEmail) {
      setSubordinates([]);
      return;
    }

    const load = async () => {
      setLoadingSubs(true);
      setErrorText(null);

      try {
        const payload = await fetchAuthedJsonOrThrow<TeamOverviewApiResponse>(
          user,
          "/api/team-overview",
          { method: "GET" }
        );

        const membersRaw = Array.isArray(payload?.members) ? payload.members : [];
        const normalizedMembers = membersRaw
          .map((member) => {
            const email = normalizeEmail(member.email);
            const managerEmail = normalizeEmail(member.managerEmail);
            if (!email || !managerEmail || email === managerEmail) return null;

            const nameRaw =
              typeof member.name === "string" && member.name.trim().length > 0
                ? member.name.trim()
                : formatNameFromEmail(email);

            return {
              email,
              name: nameRaw,
              managerEmail,
            } satisfies TeamMember;
          })
          .filter((item): item is TeamMember => item !== null);

        const tree = buildSubordinateTree(normalizedMembers, userEmail);
        setSubordinates(tree);
      } catch (e) {
        console.error("Chyba při načítání podřízených:", e);
        setErrorText("Chyba při načítání podřízených. Zkus to prosím znovu.");
      } finally {
        setLoadingSubs(false);
      }
    };

    void load();
  }, [user, userEmail]);

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

  const subordinatesByEmail = useMemo(
    () => new Map(subordinates.map((sub) => [sub.email, sub])),
    [subordinates]
  );

  const filteredSubordinates = useMemo(() => {
    const term = subordinateSearch.trim().toLowerCase();
    if (!term) return subordinates;
    return subordinates.filter(
      (sub) =>
        sub.name.toLowerCase().includes(term) ||
        sub.email.toLowerCase().includes(term)
    );
  }, [subordinateSearch, subordinates]);

  const expandedSelectedEmails = useMemo(
    () => expandSelectedToDescendants(selectedEmails, subordinates),
    [selectedEmails, subordinates]
  );

  const selectedPreview = useMemo(
    () =>
      selectedEmails
        .map((email) => subordinatesByEmail.get(email))
        .filter((item): item is Subordinate => Boolean(item))
        .slice(0, 4),
    [selectedEmails, subordinatesByEmail]
  );

  const trimmedMessage = messageText.trim();
  const selectedResolvedCount = expandedSelectedEmails.length;
  const hasSelectedRecipients =
    targetMode === "all" || selectedResolvedCount > 0;
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
    if (!canSend || !user || !userEmail) return;

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

      const json = await fetchAuthedJsonOrThrow<TeamMessageApiResponse>(
        user,
        "/api/team-message",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      if (!json?.ok) {
        throw new Error(
          json?.error || json?.message || json?.detail || "Server nevrátil úspěšnou odpověď."
        );
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
      ? "Načítám strukturu pod tebou…"
      : subordinateCount === 0
        ? "Nemáš pod sebou žádné podřízené."
        : targetMode === "all"
          ? `Zpráva se odešle všem ${subordinateCount} lidem v tvé struktuře.`
          : selectedEmails.length === 0
            ? "Vyber alespoň jednoho podřízeného. Zahrnou se i jeho podřízení."
            : `Zpráva se odešle ${selectedResolvedCount} lidem (${selectedEmails.length} vybraných větví).`;

  return (
    <AppLayout active="tools">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,#020617_0%,#14071f_48%,#5b21b6_100%)] px-5 py-5 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <div className="relative z-10">
              <span className="mb-3 inline-flex rounded-full border border-fuchsia-200/35 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-fuchsia-100 backdrop-blur">
                Týmová komunikace
              </span>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Zpráva týmu
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-white/68">
                Napiš krátkou zprávu a odešli ji všem nebo jen vybraným větvím svého týmu.
              </p>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(236,72,153,0.85),rgba(168,85,247,0.75),rgba(255,255,255,0))]" />
          </div>
          <div className="relative overflow-hidden rounded-[24px] border border-violet-200/70 bg-white/72 px-4 py-4 shadow-[0_18px_46px_rgba(76,29,149,0.14)] backdrop-blur-xl">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Pod tebou celkem
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{subordinateCount}</div>
            <div className="mt-3 h-1 rounded-full bg-[linear-gradient(90deg,#020617_0%,#7c3aed_52%,#ec4899_100%)]" />
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/68 p-5 shadow-[0_28px_86px_rgba(76,29,149,0.16)] backdrop-blur-xl sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.85)_0%,rgba(250,245,255,0.58)_42%,rgba(244,244,245,0.76)_100%)]" />

          <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-950">Komu poslat</div>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Ve výběru se vždy odešle i celý podstrom pod vybraným člověkem.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-violet-200/80 bg-white/72 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur">
              <button
                type="button"
                onClick={() => setTargetMode("all")}
                className={`ui-focus rounded-full px-3 py-1.5 text-sm font-bold transition ${
                  targetMode === "all"
                    ? "bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
                    : "text-slate-600 hover:bg-white hover:text-slate-950"
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
                className={`ui-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${
                  targetMode === "selected"
                    ? "bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
                    : "text-slate-600 hover:bg-white hover:text-slate-950"
                }`}
              >
                <Users size={14} strokeWidth={2.2} aria-hidden="true" />
                Vybraní podřízení
              </button>
            </div>
          </div>

          {targetMode === "selected" ? (
            <div className="relative z-10 mb-5 rounded-2xl border border-violet-200/75 bg-white/72 p-3 shadow-[0_16px_42px_rgba(76,29,149,0.10)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSubordinatesModalOpen(true)}
                  disabled={loadingSubs || subordinateCount === 0}
                  className="ui-focus inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-violet-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Users size={14} strokeWidth={2} aria-hidden="true" />
                  Vybrat podřízené
                </button>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 font-bold text-slate-700">
                    Vybrané větve: {selectedEmails.length}
                  </span>
                  <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 font-bold text-fuchsia-700">
                    Celkem příjemců: {selectedResolvedCount}
                  </span>
                  {selectedEmails.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedEmails([])}
                      className="ui-focus rounded-full border border-slate-300 bg-white/70 px-2 py-1 font-bold text-slate-700 transition hover:bg-white"
                    >
                      Vyčistit
                    </button>
                  ) : null}
                </div>
              </div>

              {selectedEmails.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPreview.map((sub) => (
                    <span
                      key={sub.email}
                      className="inline-flex items-center gap-1 rounded-full border border-violet-100 bg-white/82 px-2.5 py-1 text-xs font-bold text-slate-700"
                    >
                      {sub.name}
                      {sub.subtreeSize > 1 ? (
                        <span className="text-slate-500">(+{sub.subtreeSize - 1})</span>
                      ) : null}
                    </span>
                  ))}
                  {selectedEmails.length > selectedPreview.length ? (
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                      +{selectedEmails.length - selectedPreview.length} dalších
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Vyber kořenové podřízené, pod kterými se mají zahrnout celé větve.
                </p>
              )}
            </div>
          ) : null}

          <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-950">Text zprávy</div>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                messageText.length > MAX_MESSAGE_LENGTH
                  ? "border-rose-200 bg-rose-50 text-rose-600"
                  : "border-violet-100 bg-white/80 text-slate-600"
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
            className="relative z-10 min-h-[240px] w-full resize-y rounded-2xl border border-violet-200/90 bg-white/76 px-4 py-3 text-base leading-relaxed text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_34px_rgba(15,23,42,0.05)] outline-none backdrop-blur transition placeholder:text-slate-400 focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-500/15"
          />

          <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3">
            <div ref={emojiPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setEmojiPickerOpen((open) => !open)}
                className="ui-focus inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/78 px-3 py-2 text-sm font-bold text-slate-800 shadow-sm backdrop-blur transition hover:border-violet-300 hover:bg-white"
                aria-label="Vložit emoji"
              >
                <Smile size={16} strokeWidth={2} aria-hidden="true" />
                Emoji
              </button>

              {emojiPickerOpen ? (
                <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[280px] rounded-2xl border border-violet-200/80 bg-white/88 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.20)] backdrop-blur-xl">
                  <div className="grid grid-cols-8 gap-1">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="ui-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-fuchsia-50"
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
              className="ui-focus inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#020617_0%,#4c1d95_52%,#ec4899_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_34px_rgba(76,29,149,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.32)] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:bg-none disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0"
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

          <div className="relative z-10 mt-3 min-h-[20px] rounded-2xl border border-white/70 bg-white/48 px-3 py-2 text-sm backdrop-blur">
            {errorText ? (
              <p className="font-medium text-rose-600">{errorText}</p>
            ) : sendSuccess ? (
              <p className="font-bold text-fuchsia-700">
                Notifikace byla úspěšně odeslána.
              </p>
            ) : (
              <p className="font-medium text-slate-600">{statusText}</p>
            )}
          </div>
        </section>
      </div>

      {subordinatesModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
          onClick={() => setSubordinatesModalOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/75 bg-white/88 p-4 shadow-[0_30px_80px_rgba(15,23,42,0.34)] backdrop-blur-xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Vyber podřízené</h2>
                <p className="text-xs font-medium text-slate-500">
                  Když vybereš člověka, přidají se i všichni pod ním.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubordinatesModalOpen(false)}
                className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-black"
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
                className="w-full rounded-xl border border-violet-200 bg-white/80 py-2 pl-9 pr-3 text-sm font-medium text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-500/15"
              />
            </div>

            <div className="mt-3 max-h-[380px] space-y-2 overflow-auto pr-1">
              {loadingSubs ? (
                <div className="rounded-xl border border-violet-100 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600">
                  Načítám podřízené…
                </div>
              ) : filteredSubordinates.length === 0 ? (
                <div className="rounded-xl border border-violet-100 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600">
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
                      className={`ui-focus flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                        selected
                          ? "border-violet-300 bg-violet-50/90"
                          : "border-violet-100 bg-white/76 hover:border-violet-200 hover:bg-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1" style={{ paddingLeft: `${sub.depth * 18}px` }}>
                        <div className="flex items-center gap-2">
                          {sub.depth > 0 ? (
                            <ChevronRight
                              size={14}
                              strokeWidth={2.5}
                              className="shrink-0 text-slate-400"
                              aria-hidden="true"
                            />
                          ) : null}
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {sub.name}
                          </div>
                          {sub.subtreeSize > 1 ? (
                            <span className="rounded-full border border-fuchsia-100 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-700">
                              +{sub.subtreeSize - 1} pod ním
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-xs text-slate-500">{sub.email}</div>
                      </div>
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          selected
                            ? "border-slate-950 bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)]"
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
              <p className="text-sm font-medium text-slate-600">
                Vybrané větve: {selectedEmails.length} | Celkem příjemců: {selectedResolvedCount}
              </p>
              <button
                type="button"
                onClick={() => setSubordinatesModalOpen(false)}
                className="ui-focus rounded-full bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5"
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
