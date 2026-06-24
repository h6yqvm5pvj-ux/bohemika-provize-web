// src/app/klienti/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { FileText, IdCard, Mail, MapPin, Phone, Search, UserRound } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  TEST_CLIENT_NAME,
  TEST_CLIENT_SLUG,
  isTestClientName,
  normalizeClientIdentity,
} from "./clientAccess";
import {
  bestClientAddress,
  bestClientEmail,
  bestClientPhone,
  splitClientContracts,
  uniqueContracts,
  type ClientContractItem,
  type ClientContractsResponse,
} from "./clientCardHelpers";

async function loadMartinContracts(user: FirebaseUser): Promise<ClientContractItem[]> {
  const params = new URLSearchParams({
    scope: "my",
    q: TEST_CLIENT_NAME,
    limit: "50",
  });

  const ownPayload = (await fetchAuthedJsonOrThrow(
    user,
    `/api/contracts/list?${params.toString()}`
  )) as ClientContractsResponse;

  let teamContracts: ClientContractItem[] = [];
  const teamParams = new URLSearchParams(params);
  teamParams.set("scope", "team");

  try {
    const teamPayload = (await fetchAuthedJsonOrThrow(
      user,
      `/api/contracts/list?${teamParams.toString()}`
    )) as ClientContractsResponse;
    teamContracts = teamPayload.contracts ?? [];
  } catch {
    teamContracts = [];
  }

  return uniqueContracts([...(ownPayload.contracts ?? []), ...teamContracts]).filter(
    (contract) => isTestClientName(contract.clientName)
  );
}

export default function ClientsPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [search, setSearch] = useState("");
  const [contracts, setContracts] = useState<ClientContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await loadMartinContracts(user);
        if (!cancelled) setContracts(items);
      } catch (err) {
        console.error("Klienti: načtení smluv selhalo", err);
        if (!cancelled) {
          setContracts([]);
          setError("Klienty se nepodařilo načíst.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const client = useMemo(() => {
    const split = splitClientContracts(contracts);
    return {
      name: TEST_CLIENT_NAME,
      slug: TEST_CLIENT_SLUG,
      identifier: "Rodné číslo / IČ zatím neuvedeno",
      address: bestClientAddress(contracts) || "Trvalá adresa zatím neuvedena",
      phone: bestClientPhone(contracts) || "Telefon zatím neuveden",
      email: bestClientEmail(contracts) || "E-mail zatím neuveden",
      activeCount: split.active.length,
      archivedCount: split.archived.length,
      contractCount: contracts.length,
    };
  }, [contracts]);

  const visibleClients = useMemo(() => {
    const query = normalizeClientIdentity(search);
    const haystack = normalizeClientIdentity(
      `${client.name} ${client.identifier} ${client.address} ${client.phone} ${client.email}`
    );
    return query && !haystack.includes(query) ? [] : [client];
  }, [client, search]);

  return (
    <AppLayout active="clients">
      <div className="w-full bg-white px-2 pb-10 pt-4 sm:px-4">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="border-b border-slate-200 pb-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                  <IdCard className="h-3.5 w-3.5" />
                  Testovací klientská agenda
                </span>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  Klienti
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                  Zatím je karta klienta povolená pouze pro Martina Březinu. Ostatní klienti se v této testovací verzi nezobrazují.
                </p>
              </div>

              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:max-w-md">
                <label htmlFor="clients-search" className="sr-only">
                  Hledat klienta
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="clients-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Hledat klienta, IČ/RČ nebo adresu..."
                    className="h-10 w-full border-0 bg-transparent pl-7 pr-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>
          </header>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </p>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                  Seznam klientů
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Nalezeno <span className="font-semibold text-slate-900">{visibleClients.length}</span> z{" "}
                  <span className="font-semibold text-slate-900">1</span> testovacího klienta
                </p>
              </div>
              {loading ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  Načítám smlouvy...
                </span>
              ) : null}
            </div>

            {visibleClients.map((item) => (
              <Link
                key={item.slug}
                href={`/klienti/${item.slug}`}
                className="group block rounded-[24px] border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:bg-white">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-2xl font-bold tracking-tight text-slate-950">
                        {item.name}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          <IdCard className="h-3.5 w-3.5" />
                          {item.identifier}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {item.address}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          <Phone className="h-3.5 w-3.5" />
                          {item.phone}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          <Mail className="h-3.5 w-3.5" />
                          {item.email}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-[220px] grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-lg font-bold text-slate-950">{item.contractCount}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Smlouvy
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="text-lg font-bold text-emerald-800">{item.activeCount}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Aktivní
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-lg font-bold text-slate-700">{item.archivedCount}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Archiv
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {visibleClients.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-lg font-semibold text-slate-900">Žádný klient</h3>
                <p className="mt-1 text-sm text-slate-600">
                  V testovací verzi je dostupný jen Martin Březina.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
