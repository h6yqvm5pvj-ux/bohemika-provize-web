"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Info,
  Loader2,
  MessageSquare,
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
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import styles from "./teamMessage.module.css";

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

function recipientLabel(count: number): string {
  return `${count} ${count === 1 ? "příjemce" : count >= 2 && count <= 4 ? "příjemci" : "příjemců"}`;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
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
  const userEmail = useEffectiveUserEmail(user?.email) || null;
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
  const recipientsDialogRef = useRef<HTMLDialogElement | null>(null);
  const successTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !userEmail) {
      setSubordinates([]);
      return;
    }

    let alive = true;
    const scopeEmail = userEmail;
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

        if (!alive) return;
        const tree = buildSubordinateTree(normalizedMembers, scopeEmail);
        setSubordinates(tree);
      } catch (e) {
        if (!alive) return;
        console.error("Chyba při načítání podřízených:", e);
        setErrorText("Chyba při načítání podřízených. Zkus to prosím znovu.");
      } finally {
        if (alive) setLoadingSubs(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
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
    const dialog = recipientsDialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector("input")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
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
  const recipientCount = targetMode === "all" ? subordinateCount : selectedResolvedCount;
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
    if (effectiveUserEmail(user.email) !== userEmail) {
      setErrorText("Přepnutí uživatele se změnilo. Zprávu odešli znovu.");
      return;
    }

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
      ? "Načítám členy týmu…"
      : subordinateCount === 0
        ? "Ve tvém týmu zatím nejsou žádní příjemci."
        : targetMode === "all"
          ? "Zprávu dostanou všichni členové tvého týmu."
          : selectedEmails.length === 0
            ? "Vyber alespoň jednoho člena týmu."
            : "Do výběru jsou zahrnuti i podřízení vybraných členů.";

  return (
    <AppLayout active="tools">
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            <span className={styles.headingIcon}><MessageSquare size={25} strokeWidth={1.7} aria-hidden="true" /></span>
            <div>
              <p className={styles.eyebrow}>TÝMOVÁ KOMUNIKACE</p>
              <h1 className={styles.title}>Zpráva týmu</h1>
              <p className={styles.subtitle}>Povzbuzení, novinka nebo důležitá informace. Dej svému týmu vědět.</p>
            </div>
          </div>
          <div className={styles.teamTotal}>
            <Users size={20} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <strong>{loadingSubs ? "…" : subordinateCount}</strong>
              <span>členů v týmu</span>
            </div>
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.composer} aria-labelledby="composer-title">
            <div className={styles.sectionHeading}>
              <h2 id="composer-title">Nová zpráva</h2>
              <span className={styles.channelBadge}><Bell size={13} aria-hidden="true" /> Oznámení týmu</span>
            </div>

            <fieldset className={styles.recipientsField}>
              <legend className={styles.fieldLabel}>Komu chceš napsat?</legend>
              <div className={styles.targetOptions}>
                <button
                  type="button"
                  aria-pressed={targetMode === "all"}
                  onClick={() => setTargetMode("all")}
                  className={styles.targetOption}
                >
                  <span className={styles.optionIcon}><Users size={20} strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className={styles.optionText}><strong>Celý tým</strong><small>Všichni členové pod tebou</small></span>
                  <span className={styles.radioMark} aria-hidden="true">{targetMode === "all" ? <Check size={12} strokeWidth={3} /> : null}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={targetMode === "selected"}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setTargetMode("selected");
                    setSubordinatesModalOpen(true);
                  }}
                  className={styles.targetOption}
                >
                  <span className={styles.optionIcon}><GitBranch size={20} strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className={styles.optionText}><strong>Vybrat členy</strong><small>Vybraní lidé a jejich týmy</small></span>
                  <span className={styles.radioMark} aria-hidden="true">{targetMode === "selected" ? <Check size={12} strokeWidth={3} /> : null}</span>
                </button>
              </div>
            </fieldset>

            {targetMode === "selected" ? (
              <div className={styles.selection}>
                <div className={styles.selectionHeading}>
                  <span><strong>{recipientLabel(selectedResolvedCount)}</strong> včetně jejich podřízených</span>
                  <button type="button" onClick={() => setSubordinatesModalOpen(true)} className={styles.textButton} aria-haspopup="dialog">Upravit výběr <ChevronRight size={14} aria-hidden="true" /></button>
                </div>
                {selectedEmails.length > 0 ? (
                  <div className={styles.selectedChips}>
                    {selectedPreview.map((sub) => (
                      <span key={sub.email} className={styles.selectedChip}>
                        {sub.name}
                        {sub.subtreeSize > 1 ? <span>+{sub.subtreeSize - 1}</span> : null}
                        <button type="button" onClick={() => toggleSelectedEmail(sub.email)} aria-label={`Odebrat ${sub.name}`}><X size={12} aria-hidden="true" /></button>
                      </span>
                    ))}
                    {selectedEmails.length > selectedPreview.length ? <span className={styles.moreSelected}>+{selectedEmails.length - selectedPreview.length} dalších</span> : null}
                    <button type="button" onClick={() => setSelectedEmails([])} className={styles.textButton}>Zrušit výběr</button>
                  </div>
                ) : <p className={styles.selectionHint}>Vyber členy, kterým chceš zprávu poslat.</p>}
              </div>
            ) : null}

            <div className={styles.messageHeading}>
              <label htmlFor="team-message" className={styles.fieldLabel}>Text zprávy</label>
              <span>Stačí pár slov.</span>
            </div>
            <div className={styles.editor}>
              <textarea
                id="team-message"
                ref={textareaRef}
                value={messageText}
                onChange={(e) => {
                  setMessageText(e.target.value);
                  setSendSuccess(false);
                  if (errorText) setErrorText(null);
                }}
                maxLength={MAX_MESSAGE_LENGTH}
                aria-describedby="team-message-length"
                placeholder="Co dnes potřebuje tvůj tým vědět?"
                className={styles.textarea}
              />
              <div className={styles.editorToolbar}>
                <div ref={emojiPickerRef} className={styles.emojiControl} onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setEmojiPickerOpen(false);
                    emojiPickerRef.current?.querySelector("button")?.focus();
                  }
                }}>
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen((open) => !open)}
                    className={styles.emojiButton}
                    aria-label="Vložit emoji"
                    aria-expanded={emojiPickerOpen}
                    aria-controls="team-message-emojis"
                  >
                    <Smile size={18} strokeWidth={1.8} aria-hidden="true" /> Emoji
                  </button>
                  {emojiPickerOpen ? (
                    <div id="team-message-emojis" className={styles.emojiPicker} role="group" aria-label="Výběr emoji">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} aria-label={`Vložit ${emoji}`}>{emoji}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span id="team-message-length" className={styles.characterCount} data-limit={messageText.length >= MAX_MESSAGE_LENGTH}>
                  <strong>{messageText.length}</strong> / {MAX_MESSAGE_LENGTH} znaků
                </span>
              </div>
            </div>

            <div className={styles.sendFooter}>
              <div className={styles.deliverySummary} aria-live="polite">
                {loadingSubs ? <Loader2 size={17} className={styles.spinner} aria-hidden="true" /> : <Users size={17} aria-hidden="true" />}
                <span>{loadingSubs ? "Načítám příjemce…" : recipientLabel(recipientCount)}</span>
              </div>
              <button type="button" onClick={handleSend} disabled={!canSend} className={styles.sendButton}>
                {sending ? <Loader2 size={17} className={styles.spinner} aria-hidden="true" /> : <Send size={17} strokeWidth={1.8} aria-hidden="true" />}
                {sending ? "Odesílám…" : "Odeslat zprávu"}
              </button>
            </div>
            <div className={styles.status} data-state={errorText ? "error" : sendSuccess ? "success" : "default"} role={errorText ? "alert" : "status"}>
              {sendSuccess && !errorText ? <CheckCircle2 size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
              <p>{errorText || (sendSuccess ? "Zpráva byla úspěšně odeslána." : statusText)}</p>
            </div>
          </section>

          <aside className={styles.preview} aria-labelledby="preview-title">
            <div className={styles.previewHeading}>
              <span className={styles.previewIcon}><Bell size={18} strokeWidth={1.7} aria-hidden="true" /></span>
              <div><h2 id="preview-title">Náhled zprávy</h2><p>Takto může vypadat oznámení.</p></div>
            </div>
            <div className={styles.previewStage}>
              <div className={styles.notification}>
                <div className={styles.notificationMeta}>
                  <span className={styles.appIcon}><MessageSquare size={15} strokeWidth={2} aria-hidden="true" /></span>
                  <span>Bohemka.App</span>
                  <span className={styles.notificationTime}>právě teď</span>
                </div>
                <strong className={styles.notificationTitle}>Zpráva od nadřízeného</strong>
                <p className={styles.notificationBody} data-empty={!trimmedMessage}>{trimmedMessage || "Tady se objeví tvoje zpráva. Napiš pár slov a sleduj náhled."}</p>
              </div>
              <div className={styles.previewCaption}><span /> Průběžný náhled</div>
            </div>
            <div className={styles.previewNote}>
              <MessageSquare size={18} strokeWidth={1.7} aria-hidden="true" />
              <p>Krátce a osobně.<br /><span>Na pochvalu nebo důležitou novinku máš {MAX_MESSAGE_LENGTH} znaků.</span></p>
            </div>
          </aside>
        </div>
      </div>

      {subordinatesModalOpen ? (
        <dialog
          ref={recipientsDialogRef}
          className={styles.dialog}
          aria-labelledby="recipients-title"
          aria-describedby="recipients-description"
          onCancel={() => setSubordinatesModalOpen(false)}
          onClick={(event) => { if (event.target === event.currentTarget) setSubordinatesModalOpen(false); }}
        >
          <div className={styles.dialogContent}>
            <header className={styles.dialogHeader}>
              <div>
                <p className={styles.eyebrow}>PŘÍJEMCI ZPRÁVY</p>
                <h2 id="recipients-title">Vyber členy týmu</h2>
                <p id="recipients-description">S každým vybraným člověkem se přidají i všichni jeho podřízení.</p>
              </div>
              <button type="button" onClick={() => setSubordinatesModalOpen(false)} className={styles.closeButton} aria-label="Zavřít výběr příjemců"><X size={19} aria-hidden="true" /></button>
            </header>
            <div className={styles.dialogSearch}>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={subordinateSearch}
                onChange={(e) => setSubordinateSearch(e.target.value)}
                placeholder="Hledat jméno nebo e-mail…"
                aria-label="Hledat člena týmu"
              />
            </div>
            <div className={styles.memberList}>
              {loadingSubs ? <p className={styles.emptyState}>Načítám členy týmu…</p> : filteredSubordinates.length === 0 ? (
                <p className={styles.emptyState}>{subordinateCount === 0 ? "Ve tvém týmu zatím nejsou žádní příjemci." : "Tomuto hledání neodpovídá žádný člen týmu."}</p>
              ) : filteredSubordinates.map((sub) => {
                const selected = selectedEmails.includes(sub.email);
                const included = expandedSelectedEmails.includes(sub.email);
                return (
                  <button
                    key={sub.email}
                    type="button"
                    onClick={() => toggleSelectedEmail(sub.email)}
                    className={styles.member}
                    aria-pressed={selected}
                    aria-label={`${sub.name}, ${sub.email}${sub.subtreeSize > 1 ? `, včetně ${sub.subtreeSize - 1} podřízených` : ""}${included && !selected ? ", zahrnutý ve vybrané větvi" : ""}`}
                    data-included={included}
                  >
                    <span className={styles.memberIdentity} style={{ paddingLeft: `${Math.min(sub.depth, 3) * 12}px` }}>
                      {sub.depth > 0 ? <ChevronRight size={13} className={styles.memberBranch} aria-hidden="true" /> : null}
                      <span className={styles.memberAvatar} aria-hidden="true">{initials(sub.name)}</span>
                      <span className={styles.memberText}>
                        <strong>{sub.name}</strong>
                        <small>{sub.email}</small>
                        {sub.subtreeSize > 1 || (included && !selected) ? <span className={styles.memberDetail}>{included && !selected ? "Zahrnutý ve vybrané větvi" : `+${sub.subtreeSize - 1} podřízených`}</span> : null}
                      </span>
                    </span>
                    <span className={styles.memberCheck} aria-hidden="true">{included ? <Check size={14} strokeWidth={2.5} /> : null}</span>
                  </button>
                );
              })}
            </div>
            <footer className={styles.dialogFooter}>
              <div><strong>{recipientLabel(selectedResolvedCount)}</strong><span>včetně podřízených ve vybraných týmech</span></div>
              <button type="button" onClick={() => setSubordinatesModalOpen(false)} className={styles.sendButton}><Check size={16} aria-hidden="true" /> Potvrdit výběr</button>
            </footer>
          </div>
        </dialog>
      ) : null}
    </AppLayout>
  );
}
