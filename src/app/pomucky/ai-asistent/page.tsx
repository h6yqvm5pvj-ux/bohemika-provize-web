"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Gem,
  MessageSquareText,
  RotateCcw,
  SendHorizontal,
  ShieldBan,
  Sparkles,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

const TOP_PREMIUM_CHAT_ENDPOINT = "/api/top-premium-chat";

const QUICK_PROMPTS = [
  "Jak jednoduše vysvětlit rozdíl mezi rizikovým a investičním životním pojištěním?",
  "Jaké argumenty použít pro pravidelné investování při kolísání trhu?",
  "Jak klientovi vysvětlit roli investičního zlata v dlouhodobém portfoliu?",
  "Připrav mi stručný checklist na schůzku k pojištění majetku a odpovědnosti.",
] as const;

type TopPremiumChatApiResponse = {
  ok?: boolean;
  reply?: string;
  error?: string;
};

type TopPremiumChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

function formatMessageTime(value: number): string {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export default function AiAsistentPage() {
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const maxHeight = 220;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, 56)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [chatQuestion]);

  const handleAskChat = async (quickPrompt?: string) => {
    if (chatLoading) return;

    const prompt = (quickPrompt ?? chatQuestion).trim();
    if (!prompt) {
      setChatError("Napiš dotaz pro AI asistenta.");
      return;
    }

    const activeUser = auth.currentUser;
    if (!activeUser) {
      setChatError("Pro AI asistenta je potřeba přihlášení.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text: prompt,
      createdAt: Date.now(),
    };

    const requestHistory: TopPremiumChatHistoryMessage[] = chatMessages
      .filter((message) => message.text.trim().length > 0)
      .slice(-16)
      .map((message) => ({
        role: message.role,
        content: message.text.trim().slice(0, 1500),
      }));

    setChatMessages((current) => [...current, userMessage]);
    setChatQuestion("");
    setChatLoading(true);
    setChatError(null);

    try {
      const payload = await fetchAuthedJsonOrThrow<TopPremiumChatApiResponse>(
        activeUser,
        TOP_PREMIUM_CHAT_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify({
            prompt,
            history: requestHistory,
          }),
        }
      );

      const reply = String(payload.reply ?? "").trim();
      if (payload?.ok === false) {
        throw new Error(payload.error || reply || "AI asistent nevrátil odpověď.");
      }
      if (!reply) {
        throw new Error("AI asistent nevrátil odpověď.");
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        text: reply,
        createdAt: Date.now(),
      };
      setChatMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.error("Top Premium Chat selhal:", error);
      setChatError(error instanceof Error ? error.message : "AI asistent není teď dostupný.");
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
    setChatQuestion("");
    setChatError(null);
  };

  const hasMessages = chatMessages.length > 0;

  return (
    <AppLayout active="tools">
      <div className="relative w-full px-2 pb-10 pt-2 sm:px-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_0%,rgba(2,132,199,0.18),transparent_55%),radial-gradient(circle_at_78%_10%,rgba(79,70,229,0.14),transparent_58%)]" />
        <div className="relative z-10 mx-auto max-w-6xl space-y-5 px-1 sm:px-2 lg:px-3">
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(138deg,#ffffff_0%,#f8fbff_50%,#eef6ff_100%)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-6">
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Top Premium Chat
                </span>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                  AI Asistent
                </h1>
                <p className="max-w-3xl text-sm text-slate-600 sm:text-base">
                  Interní pomocník se specializací na pojištění, investice a investiční zlato.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  <Gem className="h-3.5 w-3.5" />
                  Specializace: Pojištění · Investice · Zlato
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">
                  <ShieldBan className="h-3.5 w-3.5" />
                  Bez přístupu ke smlouvám
                </span>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#f7fbff_0%,#f8fafc_52%,#f1f5f9_100%)] text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.15)]">
            <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan-500/12 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 bottom-8 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />

            <div className="relative flex min-h-[calc(100vh-320px)] flex-col">
              <header className="border-b border-slate-200/90 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <MessageSquareText className="h-4 w-4 text-cyan-700" />
                      Konzole chatu
                    </p>
                    <p className="text-sm text-slate-600">
                      Ptej se na argumentaci, postupy a vysvětlení pro klientské schůzky.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearChat}
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-900 hover:shadow-md"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Nový chat
                  </button>
                </div>
              </header>

              <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
                {!hasMessages ? (
                  <div className="mx-auto mt-4 w-full max-w-4xl">
                    <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fbff_56%,#eef6ff_100%)] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.1)] sm:p-6">
                      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
                      <div className="pointer-events-none absolute -left-16 -bottom-16 h-36 w-36 rounded-full bg-indigo-500/10 blur-3xl" />
                      <div className="relative">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                          <Bot className="h-3.5 w-3.5" />
                          Rychlé starty
                        </div>
                        <p className="mt-3 text-xl font-bold tracking-tight text-slate-950">
                          Vyber dotaz a hned pokračuj
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Klikni na jednu z připravených otázek nebo napiš vlastní zadání níže.
                        </p>
                        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                          {QUICK_PROMPTS.map((promptExample) => (
                            <button
                              key={promptExample}
                              type="button"
                              onClick={() => void handleAskChat(promptExample)}
                              className="group rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-3 text-left text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-300/80 hover:bg-cyan-50/80 hover:text-slate-950"
                            >
                              <span className="inline-flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 transition group-hover:bg-cyan-600" />
                                <span>{promptExample}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-4xl space-y-3">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {message.role === "assistant" ? (
                          <article className="relative max-w-[96%] overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3.5 text-sm text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:max-w-[82%]">
                            <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#22d3ee_0%,#2563eb_100%)]" />
                            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700">
                                  <Bot className="h-3 w-3" />
                                </span>
                                Asistent
                              </span>
                              <span>{formatMessageTime(message.createdAt)}</span>
                            </div>
                            <div className="whitespace-pre-line leading-6">{message.text}</div>
                          </article>
                        ) : (
                          <article className="max-w-[96%] rounded-[22px] border border-blue-500/40 bg-[linear-gradient(135deg,#1d4ed8_0%,#1e3a8a_100%)] px-4 py-3.5 text-sm text-sky-50 shadow-[0_14px_30px_rgba(30,64,175,0.34)] sm:max-w-[82%]">
                            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-sky-100">
                              <span>Ty</span>
                              <span>{formatMessageTime(message.createdAt)}</span>
                            </div>
                            <div className="whitespace-pre-line leading-6 text-sky-50">
                              {message.text}
                            </div>
                          </article>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {chatLoading && (
                  <div className="mx-auto flex w-full max-w-4xl justify-start">
                    <div className="inline-flex items-center gap-2 rounded-[20px] border border-cyan-200/70 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700">
                        <Bot className="h-3 w-3" />
                      </span>
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:240ms]" />
                      </span>
                      Připravuju odpověď…
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200/90 bg-white/85 px-4 py-4 backdrop-blur sm:px-6">
                <div className="mx-auto w-full max-w-4xl space-y-3">
                  <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fbff_56%,#eef6ff_100%)] p-2.5 shadow-[0_18px_42px_rgba(15,23,42,0.12)]">
                    <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-white px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <textarea
                        ref={composerTextareaRef}
                        value={chatQuestion}
                        onChange={(event) => setChatQuestion(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (!chatLoading) void handleAskChat();
                          }
                        }}
                        rows={1}
                        placeholder="Napiš dotaz k pojištění, investicím nebo investičnímu zlatu…"
                        className="min-h-[56px] w-full resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAskChat()}
                        disabled={chatLoading}
                        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#047857_100%)] px-4 text-sm font-bold text-white shadow-[0_18px_44px_rgba(5,150,105,0.34)] transition hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(5,150,105,0.42)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      >
                        <SendHorizontal className="h-4 w-4" />
                        {chatLoading ? "Zpracovávám…" : "Odeslat"}
                      </button>
                    </div>
                  </div>

                  {chatError && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                      {chatError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
