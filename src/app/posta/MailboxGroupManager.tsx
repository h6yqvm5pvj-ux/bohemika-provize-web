"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Crown,
  Loader2,
  Pencil,
  Search,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { EMAIL_RE } from "./postaConstants";
import { nameFromEmail, normalizeEmail } from "./postaHelpers";
import type {
  MailboxConversationParticipant,
  MailboxConversationResponse,
  RecipientOption,
  UserSearchResponse,
} from "./postaTypes";

type MailboxGroupManagerProps = {
  user: FirebaseUser;
  conversation: MailboxConversationResponse;
  currentUserEmail: string;
  onClose: () => void;
  onChanged: (conversation: MailboxConversationResponse) => void;
};

export function MailboxGroupManager({
  user,
  conversation,
  currentUserEmail,
  onClose,
  onChanged,
}: MailboxGroupManagerProps) {
  const [groupName, setGroupName] = useState(conversation.groupName ?? "");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RecipientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lookupSequence = useRef(0);

  const participants = useMemo(
    () => (Array.isArray(conversation.participants) ? conversation.participants : []),
    [conversation.participants]
  );
  const participantEmails = useMemo(
    () => new Set(participants.map((participant) => normalizeEmail(participant.email))),
    [participants]
  );

  useEffect(() => {
    setGroupName(conversation.groupName ?? "");
  }, [conversation.groupName]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const sequence = ++lookupSequence.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(search)}`,
          { method: "GET" }
        );
        if (sequence !== lookupSequence.current) return;
        const next = (payload.users ?? [])
          .map((row) => {
            const email = normalizeEmail(row.email);
            if (!email || !EMAIL_RE.test(email) || participantEmails.has(email)) return null;
            return {
              email,
              name:
                typeof row.name === "string" && row.name.trim()
                  ? row.name.trim()
                  : nameFromEmail(email),
            };
          })
          .filter((row): row is RecipientOption => row !== null);
        setSuggestions(next);
      } catch {
        if (sequence === lookupSequence.current) setSuggestions([]);
      } finally {
        if (sequence === lookupSequence.current) setSearching(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [participantEmails, query, user]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyAction) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busyAction, onClose]);

  const patchConversation = async (
    action: "rename" | "add" | "remove",
    values: Record<string, unknown>,
    successText: string
  ) => {
    if (!conversation.conversationId || busyAction) return;
    setBusyAction(action === "remove" ? `remove:${String(values.email)}` : action);
    setError(null);
    setSuccess(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<MailboxConversationResponse>(
        user,
        "/api/mailbox/conversation",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.conversationId,
            action,
            ...values,
          }),
        }
      );
      onChanged(payload);
      setSuccess(successText);
      if (action === "add") {
        setQuery("");
        setSuggestions([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Změnu skupiny se nepodařilo uložit.");
    } finally {
      setBusyAction("");
    }
  };

  const removeParticipant = (participant: MailboxConversationParticipant) => {
    if (
      !window.confirm(
        `Odebrat ${participant.name} ze skupiny? Dosavadní historii uvidí, ale nové zprávy už nedostane.`
      )
    ) return;
    void patchConversation(
      "remove",
      { email: participant.email },
      `${participant.name} byl ze skupiny odebrán.`
    );
  };

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="group-manager-title">
      <button
        type="button"
        aria-label="Zavřít správu skupiny"
        onClick={() => {
          if (!busyAction) onClose();
        }}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
      />
      <section className="relative z-[161] max-h-[min(760px,90dvh)] w-full max-w-xl overflow-y-auto rounded-[28px] border border-violet-200 bg-white p-5 shadow-[0_30px_85px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <UsersRound className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Skupinový chat</p>
              <h2 id="group-manager-title" className="truncate text-xl font-bold text-slate-950">Správa skupiny</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busyAction)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            aria-label="Zavřít"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <section>
            <label htmlFor="group-manager-name" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
              Název skupiny
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="group-manager-name"
                value={groupName}
                maxLength={80}
                onChange={(event) => {
                  setGroupName(event.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              />
              <button
                type="button"
                onClick={() => void patchConversation("rename", { groupName: groupName.trim() }, "Název skupiny byl změněn.")}
                disabled={Boolean(busyAction) || !groupName.trim() || groupName.trim() === conversation.groupName}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-50"
              >
                {busyAction === "rename" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Uložit
              </button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Členové</h3>
              <span className="text-xs font-semibold text-slate-500">{participants.length}/12</span>
            </div>
            <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
              {participants.map((participant) => {
                const email = normalizeEmail(participant.email);
                const owner = email === normalizeEmail(conversation.ownerEmail);
                const self = email === normalizeEmail(currentUserEmail);
                const removing = busyAction === `remove:${email}`;
                return (
                  <div key={email} className="flex items-center gap-3 bg-white px-3 py-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {participant.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                        {participant.name}
                        {owner ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Zakladatel" /> : null}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{email}{self ? " · Ty" : ""}</span>
                    </span>
                    {!owner ? (
                      <button
                        type="button"
                        onClick={() => removeParticipant(participant)}
                        disabled={Boolean(busyAction)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                        aria-label={`Odebrat ${participant.name}`}
                      >
                        {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {participants.length < 12 ? (
            <section>
              <label htmlFor="group-member-search" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                Přidat člověka
              </label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="group-member-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Jméno nebo e-mail…"
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-9 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                />
                {searching ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-500" /> : null}
              </div>
              {query.trim().length >= 2 && !searching ? (
                <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
                  {suggestions.length > 0 ? suggestions.map((suggestion) => (
                    <button
                      key={suggestion.email}
                      type="button"
                      onClick={() => void patchConversation("add", { email: suggestion.email }, `${suggestion.name} byl přidán do skupiny.`)}
                      disabled={Boolean(busyAction)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-violet-50 disabled:opacity-50"
                    >
                      <UserPlus className="h-4 w-4 shrink-0 text-violet-700" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">{suggestion.name}</span>
                        <span className="block truncate text-xs text-slate-500">{suggestion.email}</span>
                      </span>
                      {busyAction === "add" ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> : null}
                    </button>
                  )) : (
                    <p className="px-3 py-3 text-xs text-slate-500">Žádný další uživatel nebyl nalezen.</p>
                  )}
                </div>
              ) : null}
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                Nový člen uvidí zprávy odeslané až po svém přidání.
              </p>
            </section>
          ) : null}

          {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">{error}</p> : null}
          {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" role="status">{success}</p> : null}
        </div>
      </section>
    </div>
  );
}
