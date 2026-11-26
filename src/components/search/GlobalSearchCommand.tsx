"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User as FirebaseUser } from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  ChevronRight,
  ContactRound,
  FileText,
  Loader2,
  Search,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { setContractSearchHandoff } from "@/app/lib/contractSearchHandoff";
import { useAdminImpersonationState } from "@/app/lib/useAdminImpersonation";
import {
  CONTACT_DIRECTORY_CHANGED_EVENT,
  OPEN_CONTACT_DIRECTORY_EVENT,
  type DirectoryContact,
} from "@/app/lib/contactDirectory";
import {
  findContactSearchResults,
  findToolSearchResults,
  normalizeGlobalSearch,
  type ContactSearchResult,
} from "./globalSearchData";
import { createContactSearchSession } from "./contactSearchSession";

type ColleagueResult = {
  email: string;
  name: string;
};

type ContractResult = {
  id: string;
  clientName: string | null;
  contractNumber: string | null;
};

type IntranetPostResult = {
  id: string;
  title: string;
  section: string;
  sectionLabel: string;
  author: { name: string };
};

type UserSearchResponse = { ok: true; users: ColleagueResult[] };
type ContractSearchResponse = { ok: true; contracts: ContractResult[] };
type IntranetSearchResponse = { ok: true; posts: IntranetPostResult[] };
type ContactDirectoryResponse = { ok: true; contacts: DirectoryContact[] };

type CachedSearchResults = {
  expiresAtMs: number;
  colleagues: ColleagueResult[];
  contracts: ContractResult[];
  posts: IntranetPostResult[];
};

type SearchResults = Omit<CachedSearchResults, "expiresAtMs"> & {
  query: string;
  contacts: ContactSearchResult[];
};

const emptySearchResults = (query = ""): SearchResults => ({
  query, colleagues: [], contracts: [], posts: [], contacts: [],
});

type GlobalSearchCommandProps = {
  user: FirebaseUser;
  compact?: boolean;
  dialogBelowDesktopHeader?: boolean;
  triggerClassName?: string;
};

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 24;

function SearchGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function SearchResultButton({
  icon: Icon,
  title,
  subtitle,
  tone = "slate",
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone?: "slate" | "violet" | "pink" | "sky" | "amber";
  onClick: () => void;
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    pink: "border-pink-200 bg-pink-50 text-pink-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
    >
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClasses}`}>
        <Icon className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{title}</span>
        <span className="block truncate pt-0.5 text-xs text-slate-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" aria-hidden="true" />
    </button>
  );
}

export function GlobalSearchCommand(props: GlobalSearchCommandProps) {
  const impersonation = useAdminImpersonationState();
  // Remount search before any result from the prior account or view can render.
  return <AccountSearchCommand key={`${props.user.uid}:${impersonation?.email ?? ""}`} {...props} />;
}

function AccountSearchCommand({
  user,
  compact = false,
  dialogBelowDesktopHeader = true,
  triggerClassName,
}: GlobalSearchCommandProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchResultsCache = useRef(new Map<string, CachedSearchResults>());
  const [open, setOpen] = useState(false);
  const [activeQuery, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [results, setResults] = useState<SearchResults>(emptySearchResults);
  const [contactSession] = useState(createContactSearchSession);
  const [directoryVersion, setDirectoryVersion] = useState(0);
  const { colleagues, contracts, posts, contacts } = results.query === activeQuery
    ? results : emptySearchResults();

  const normalizedQuery = normalizeGlobalSearch(activeQuery);
  const tools = useMemo(() => findToolSearchResults(activeQuery), [activeQuery]);
  const clients = useMemo(() => {
    const unique = new Map<string, string>();
    contracts.forEach((contract) => {
      const clientName = contract.clientName?.trim();
      if (clientName) unique.set(clientName.toLocaleLowerCase("cs-CZ"), clientName);
    });
    return [...unique.values()].slice(0, 4);
  }, [contracts]);
  const hasResults =
    colleagues.length + contracts.length + posts.length + contacts.length + tools.length > 0;
  const isSearching = loading && open && normalizedQuery.length >= 2;

  const handleOpen = useCallback(() => {
    if (!open) {
      setResults(emptySearchResults());
    }
    const hasSearchQuery = normalizedQuery.length >= 2;
    setLoading(hasSearchQuery);
    setSearchProgress(hasSearchQuery ? 8 : 0);
    setOpen(true);
  }, [normalizedQuery, open]);

  useEffect(() => {
    if (!open) return;
    return () => contactSession.invalidate();
  }, [contactSession, open]);

  useEffect(() => {
    const invalidateContacts = () => {
      contactSession.invalidate();
      setResults((current) => ({ ...current, contacts: [] }));
      setDirectoryVersion((version) => version + 1);
    };
    window.addEventListener(CONTACT_DIRECTORY_CHANGED_EVENT, invalidateContacts);
    return () => window.removeEventListener(CONTACT_DIRECTORY_CHANGED_EVENT, invalidateContacts);
  }, [contactSession]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handleOpen();
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "/" && !isTyping && !open) {
        event.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpen, open]);

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const cache = searchResultsCache.current;
    let progressResetTimer: number | undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setSearchProgress(18);
        const query = activeQuery.trim();
        const cacheEntry = cache.get(query);
        const cached = cacheEntry && cacheEntry.expiresAtMs > Date.now() ? cacheEntry : null;
        let results = emptySearchResults(activeQuery);

        let completedSources = 0;
        const publish = <Key extends keyof Omit<SearchResults, "query">>(
          key: Key, request: Promise<SearchResults[Key]>,
        ) => request.then(rows => {
          if (signal.aborted) return;
          results = { ...results, [key]: rows };
          setResults(results);
        }).finally(() => {
          if (signal.aborted) return;
          completedSources++;
          setSearchProgress(Math.min(92, 18 + completedSources * 19));
        });
        const textRequest: RequestInit = {
          method: "POST", body: query, headers: { "Content-Type": "text/plain" }, signal,
        };
        const [usersResult, contractsResult, postsResult] = await Promise.allSettled([
          publish("colleagues", cached ? Promise.resolve(cached.colleagues) :
            fetchAuthedJsonOrThrow<UserSearchResponse>(user, "/api/user/search", textRequest)
              .then(({ users }) => users.slice(0, 5))),
          publish("contracts", cached ? Promise.resolve(cached.contracts) :
            fetchAuthedJsonOrThrow<ContractSearchResponse>(user, "/api/contracts/list", {
              method: "POST", signal,
              body: new URLSearchParams({ scope: "my", shape: "search", q: query }),
              headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            }).then(({ contracts }) => contracts.slice(0, 6))),
          publish("posts", cached ? Promise.resolve(cached.posts) :
            fetchAuthedJsonOrThrow<IntranetSearchResponse>(user, "/api/intranet/wall?search=1", textRequest)
              .then(({ posts }) => posts.slice(0, 5))),
          publish("contacts", contactSession.load(user.uid, async directorySignal => {
            const payload = await fetchAuthedJsonOrThrow<ContactDirectoryResponse>(user, "/api/contacts", { signal: directorySignal });
            return Array.isArray(payload.contacts) ? payload.contacts : [];
          }).then(contacts => findContactSearchResults(contacts, query))),
        ]);
        if (signal.aborted) return;
        if (!cached && [usersResult, contractsResult, postsResult].every(result => result.status === "fulfilled")) {
          const { colleagues, contracts, posts } = results;
          cache.delete(query);
          if (cache.size >= SEARCH_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
          cache.set(query, { expiresAtMs: Date.now() + SEARCH_CACHE_TTL_MS, colleagues, contracts, posts });
        }
        setSearchProgress(100);
        setLoading(false);
        progressResetTimer = window.setTimeout(() => setSearchProgress(0), 320);
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(progressResetTimer);
    };
  }, [activeQuery, contactSession, directoryVersion, normalizedQuery, open, user]);

  const closeAndNavigate = (href: string) => {
    setOpen(false);
    if (href.startsWith("/pomucky?open=")) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  };

  const closeAndOpenContacts = (contactId?: string) => {
    setOpen(false);
    if (window.location.pathname === "/") {
      window.dispatchEvent(
        new CustomEvent(OPEN_CONTACT_DIRECTORY_EVENT, {
          detail: { contactId: contactId ?? null },
        }),
      );
      return;
    }

    const search = new URLSearchParams({ contacts: "1" });
    if (contactId) search.set("contact", contactId);
    router.push(`/?${search.toString()}`);
  };

  const closeAndSearchContracts = (query: string) => {
    setContractSearchHandoff(user.uid, query);
    closeAndNavigate("/smlouvy");
  };

  const handleQueryChange = (value: string) => {
    setQuery(value.slice(0, 120));
    const hasSearchQuery = normalizeGlobalSearch(value).length >= 2;
    setLoading(hasSearchQuery);
    setSearchProgress(hasSearchQuery ? 8 : 0);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Globální vyhledávání"
        className={triggerClassName ?? (
          compact
            ? "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            : "flex h-10 w-full max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-500 shadow-sm transition hover:border-violet-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        )}
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={2.1} aria-hidden="true" />
        {!compact ? (
          <>
            <span className="min-w-0 flex-1 truncate">Hledat klienta, smlouvu, kontakt nebo pomůcku…</span>
            <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 xl:inline">
              ⌘ K
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className={`fixed inset-x-0 bottom-0 top-0 z-[100] flex items-start justify-center px-3 pt-4 sm:px-6 sm:pt-6 ${
            dialogBelowDesktopHeader ? "lg:top-[68px]" : "lg:top-0"
          }`}
        >
          <button
            type="button"
            aria-label="Zavřít vyhledávání"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-950/20"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Globální vyhledávání"
            className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.28)]"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-violet-700" strokeWidth={2.2} aria-hidden="true" />
              <input
                ref={inputRef}
                value={activeQuery}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="Klient, smlouva, kontakt, kolega nebo pomůcka…"
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400"
              />
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-violet-600" aria-label="Vyhledávám" /> : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {isSearching || searchProgress === 100 ? (
              <div className="border-b border-violet-100 bg-violet-50/70 px-4 py-2">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-violet-800">
                  <span>{searchProgress < 100 ? "Prohledávám zdroje" : "Vyhledávání dokončeno"}</span>
                  <span>{searchProgress} %</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed_0%,#c026d3_55%,#ec4899_100%)] transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.max(0, Math.min(100, searchProgress))}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="max-h-[62vh] overflow-y-auto px-2 pb-3">
              {normalizedQuery.length < 2 ? (
                <div className="px-4 py-9 text-center">
                  <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-800">Najdi vše na jednom místě</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                    Zadej alespoň dvě písmena. Prohledáme klienty, smlouvy, kontakty, kolegy, intranet i pomůcky.
                  </p>
                </div>
              ) : null}

              {normalizedQuery.length >= 2 && !isSearching && !hasResults ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Nic jsme nenašli.</p>
              ) : null}

              {clients.length ? (
                <SearchGroup label="Klienti">
                  {clients.map((client) => (
                    <SearchResultButton
                      key={client}
                      icon={UserRound}
                      title={client}
                      subtitle="Klient ve smlouvách"
                      tone="sky"
                      onClick={() => closeAndSearchContracts(client)}
                    />
                  ))}
                </SearchGroup>
              ) : null}

              {contracts.length ? (
                <SearchGroup label="Smlouvy">
                  {contracts.map((contract) => {
                    const searchValue = contract.contractNumber ? `=${contract.contractNumber}` : contract.clientName || activeQuery.trim();
                    return (
                      <SearchResultButton
                        key={contract.id}
                        icon={FileText}
                        title={contract.contractNumber ? `Smlouva ${contract.contractNumber}` : "Smlouva"}
                        subtitle={contract.clientName || "Bez uvedeného klienta"}
                        tone="violet"
                        onClick={() => closeAndSearchContracts(searchValue)}
                      />
                    );
                  })}
                </SearchGroup>
              ) : null}

              {contacts.length ? (
                <SearchGroup label="Kontakty">
                  {contacts.map((contact) => (
                    <SearchResultButton
                      key={contact.id}
                      icon={ContactRound}
                      title={contact.title}
                      subtitle={contact.subtitle}
                      tone="sky"
                      onClick={() => closeAndOpenContacts(contact.id)}
                    />
                  ))}
                </SearchGroup>
              ) : null}

              {colleagues.length ? (
                <SearchGroup label="Kolegové">
                  {colleagues.map((colleague) => (
                    <SearchResultButton
                      key={colleague.email}
                      icon={UserRound}
                      title={colleague.name}
                      subtitle={colleague.email}
                      tone="amber"
                      onClick={() => closeAndNavigate(`/muj-tym?search=${encodeURIComponent(colleague.email)}`)}
                    />
                  ))}
                </SearchGroup>
              ) : null}

              {posts.length ? (
                <SearchGroup label="Příspěvky na intranetu">
                  {posts.map((post) => (
                    <SearchResultButton
                      key={post.id}
                      icon={BriefcaseBusiness}
                      title={post.title}
                      subtitle={`${post.sectionLabel} · ${post.author.name}`}
                      tone="pink"
                      onClick={() =>
                        closeAndNavigate(
                          `/intranet?section=${encodeURIComponent(post.section)}&postId=${encodeURIComponent(post.id)}`
                        )
                      }
                    />
                  ))}
                </SearchGroup>
              ) : null}

              {tools.length ? (
                <SearchGroup label="Pomůcky">
                  {tools.map((tool) => (
                    <SearchResultButton
                      key={tool.href}
                      icon={Wrench}
                      title={tool.title}
                      subtitle={tool.description}
                      tone="violet"
                      onClick={() =>
                        tool.key === "kontakty"
                          ? closeAndOpenContacts()
                          : closeAndNavigate(tool.href)
                      }
                    />
                  ))}
                </SearchGroup>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-400">
              <span>Výsledky zohledňují tvoje přístupová oprávnění.</span>
              <span className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-medium sm:inline">Esc</span>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
