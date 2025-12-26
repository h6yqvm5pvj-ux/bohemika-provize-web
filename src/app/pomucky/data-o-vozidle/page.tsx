// src/app/pomucky/data-o-vozidle/page.tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";
import { auth } from "@/app/firebase";
import { rsvVehicleLookupByVin } from "@/app/lib/rsv";

function safeStr(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}


function fmtDateCZ(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("cs-CZ");
}

function fmtKg(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number" && Number.isFinite(v)) return `${v} kg`;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return "—";
  return s.toLowerCase().includes("kg") ? s : `${s} kg`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-100">{value}</div>
    </div>
  );
}

export default function VehicleDataPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const canSearch = useMemo(() => !!user && vin.trim().length >= 11, [user, vin]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setShowJson(false);

    try {
      const data = await rsvVehicleLookupByVin(vin);
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message || "Nepodařilo se načíst data."));
    } finally {
      setLoading(false);
    }
  };

  const payload = result?.payload;
  const d = payload?.Data;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="space-y-1.5">
          <SplitTitle text="Data o vozidle" />
          <p className="text-sm text-slate-300">
            Přehled technických údajů, VIN a praktických odkazů pro rychlou práci s pojistkou vozidla.
          </p>
          <Link
            href="/pomucky"
            className="inline-flex items-center text-xs text-slate-300 hover:text-white transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <div className="flex justify-start">
          <section className="w-full lg:w-1/2 relative z-30 isolate rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_14px_50px_rgba(0,0,0,0.8)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white">Vyhledávání vozidla</h2>
                <p className="text-xs text-slate-300">Zadej VIN a načti technické údaje.</p>
              </div>

              {!user && (
                <span className="text-[11px] text-amber-200 bg-amber-900/40 border border-amber-500/50 rounded-full px-3 py-1">
                  Přihlaš se, aby šlo volat API.
                </span>
              )}
            </div>

            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  className="w-full rounded-lg bg-slate-900/70 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder='např. "TMB..."'
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {error && (
                  <p className="text-xs text-amber-200 bg-amber-900/40 border border-amber-500/60 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={loading || !canSearch}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-sky-500/25 px-5 py-2 text-sm font-semibold text-sky-50 shadow-[0_0_18px_rgba(56,189,248,0.45)] hover:bg-sky-500/35 hover:border-sky-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Načítám…" : "Vyhledat"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="relative z-0 rounded-2xl border border-white/15 bg-slate-950/65 backdrop-blur-2xl px-4 py-4 shadow-[0_14px_50px_rgba(0,0,0,0.85)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Výsledek</h2>
            {payload?.Status != null && (
              <span className="text-[11px] text-slate-400">Status: {safeStr(payload.Status)}</span>
            )}
          </div>

          {!result ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-300">
              Zatím nic nezobrazuji. Zadej VIN a dej „Vyhledat“.
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                <Field label="VIN" value={safeStr(result?.vin)} />
                <Field label="Uživatel" value={safeStr(result?.forUser)} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 space-y-2.5">
                <div className="text-sm font-semibold text-white">Údaje o vozidle</div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  <Field label="Tovární značka" value={safeStr(d?.TovarniZnacka)} />
                  <Field label="Obchodní označení" value={safeStr(d?.ObchodniOznaceni)} />

                  <Field label="Datum 1. registrace" value={fmtDateCZ(d?.DatumPrvniRegistrace)} />
                  <Field label="Datum 1. registrace v ČR" value={fmtDateCZ(d?.DatumPrvniRegistraceVCr)} />

                  <Field label="Číslo ORV" value={safeStr(d?.CisloOrv)} />
                  <Field label="Číslo TP" value={safeStr(d?.CisloTp)} />

                  <Field
                    label="Zdvihový objem"
                    value={d?.MotorZdvihObjem != null ? `${d.MotorZdvihObjem} cm³` : "—"}
                  />
                  <Field label="Max výkon" value={safeStr(d?.MotorMaxVykon)} />

                  <Field label="Palivo" value={safeStr(d?.Palivo)} />
                  <Field
                    label="Provozní hmotnost"
                    value={d?.HmotnostiProvozni != null ? `${d.HmotnostiProvozni} kg` : "—"}
                  />
                  <Field
                    label="Největší technicky přípustná/povolená hmotnost"
                    value={fmtKg(d?.HmotnostiPripPov ?? d?.HmotnostiPripPovJS)}
                  />

                  <Field label="Místa" value={safeStr(d?.VozidloKaroserieMist)} />
                  <Field label="Barva" value={safeStr(d?.VozidloKaroserieBarva)} />

                  <Field label="Plně elektrické" value={safeStr(d?.VozidloElektricke)} />
                  <Field label="Hybridní" value={safeStr(d?.VozidloHybridni)} />

                  <Field label="Typ" value={safeStr(d?.Typ)} />
                  <Field label="Kategorie" value={safeStr(d?.Kategorie)} />
                </div>
              </div>

            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
