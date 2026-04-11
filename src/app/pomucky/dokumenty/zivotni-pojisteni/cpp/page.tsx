// src/app/pomucky/dokumenty/zivotni-pojisteni/cpp/page.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, X } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../../../plan-produkce/SplitTitle";

const CPP_DOCUMENT_GROUPS = [
  {
    key: "sjednani",
    title: "Sjednání",
    items: [
      "Vstupní checklist klienta",
      "Podklady před uzavřením smlouvy",
      "Kontrolní body před podpisem",
    ],
  },
  {
    key: "servis",
    title: "Servis smlouvy",
    items: [
      "Postup změny parametrů smlouvy",
      "Přehled nejčastějších změn",
      "Kontrola návaznosti krytí",
    ],
  },
  {
    key: "komunikace",
    title: "Klientská komunikace",
    items: [
      "Šablona e-mailu po uzavření smlouvy",
      "Vzor shrnutí doporučení",
      "Připomínka výročí smlouvy",
    ],
  },
] as const;

const STORNO_RULES = [
  "Storno dohodou může být akceptováno s datem účinnosti až 1 měsíc zpětně, doporučuji ponechat pravidlo vždy k výročnímu dni počátku pojištění.",
  "Storno dohodu lze již zasílat i na smlouvy životního pojištění.",
  "Žádost může být bez uvedení důvodu.",
  "Žádost musí být na formuláři ŽP DOKUMENTY Žádanky Výpověď_dohodou_062023, naleznete ji pod tlačítkem Stáhnout.",
  "Neřeší se pojistné události (počet pojistných událostí na dané pojistné smlouvě nemá vliv na povolení storna dohodou).",
  "Pokud bylo storno dohodou k určitému datu již jednou zamítnuto, pak jej už k tomuto datu provést nelze. Řešením je dodat nové storno dohodu k jinému datu (např. o 1 den dříve nebo později).",
  "Storno dohodou zasílejte vždy nejdříve na můj mail jindrich.hajek@bohemika.eu a až týden po zaslání dokument nahrajte k pojistné smlouvě do SUSu.",
  "Pokud storno dohodou nahrajete nejdříve do SUSu k pojistné smlouvě a na můj mail ho zašlete až poté, nebo ho vůbec na můj mail nepošlete, bude zpracováno jako standardní žádost, nikoliv jako storno dohodou.",
] as const;

export default function CppLifeDocumentsPage() {
  const [activeTab, setActiveTab] = useState<"prehled" | "vypoved">("prehled");
  const [activeModal, setActiveModal] = useState<"storno" | "vypoved" | null>(null);

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="space-y-2">
          <SplitTitle text="ČPP Dokumenty" className="!text-slate-900" />
          <p className="max-w-3xl text-sm text-slate-600">
            Rozcestník dokumentů pro životní pojištění ČPP.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/pomucky/dokumenty/zivotni-pojisteni"
              className="inline-flex items-center text-slate-600 transition hover:text-slate-900"
            >
              ← Zpět na životní pojištění
            </Link>
            <Link
              href="/pomucky/dokumenty"
              className="inline-flex items-center text-slate-600 transition hover:text-slate-900"
            >
              Zpět na dokumenty
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-300 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-300 bg-white">
              <Image
                src="/icons/cpp.png"
                alt="ČPP logo"
                width={42}
                height={42}
                className="h-10 w-10 object-contain"
              />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">ČPP</h2>
              <p className="text-xs text-slate-500">Životní pojištění</p>
            </div>
          </div>
        </section>

        <section className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-300 bg-white p-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab("prehled");
              setActiveModal(null);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === "prehled"
                ? "border border-slate-900 bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Přehled dokumentů
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vypoved")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === "vypoved"
                ? "border border-slate-900 bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Výpověď smlouvy
          </button>
        </section>

        {activeTab === "prehled" ? (
          <section className="grid gap-4 md:grid-cols-3">
            {CPP_DOCUMENT_GROUPS.map((group) => (
              <article
                key={group.key}
                className="rounded-3xl border border-slate-300 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              >
                <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {group.items.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        ) : (
          <section className="space-y-3">
            <div className="rounded-3xl border border-slate-300 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <h3 className="text-sm font-semibold text-slate-900">Výpověď smlouvy</h3>
              <p className="mt-2 text-sm text-slate-600">
                Klikni na kartu a otevře se detailní instrukce ke storno dohodou.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModal("storno")}
              className="w-full rounded-3xl border border-slate-900 bg-slate-900 px-4 py-4 text-left text-white shadow-[0_12px_26px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5 hover:bg-black sm:w-auto sm:min-w-[300px]"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Karta</div>
              <div className="mt-1 text-lg font-semibold">STORNO Dohodou</div>
              <div className="mt-1 text-xs text-slate-300">Otevřít detail pravidel</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal("vypoved")}
              className="w-full rounded-3xl border border-slate-900 bg-white px-4 py-4 text-left text-slate-900 shadow-[0_12px_26px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:border-slate-900 hover:bg-slate-50 sm:w-auto sm:min-w-[300px]"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Karta</div>
              <div className="mt-1 text-lg font-semibold">Výpověď smlouvy</div>
              <div className="mt-1 text-xs text-slate-500">Otevřít formulář ke stažení</div>
            </button>
          </section>
        )}
      </div>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-3 py-6 sm:px-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {activeModal === "storno" ? "STORNO Dohodou" : "Výpověď smlouvy"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">Výpověď smlouvy - ČPP Životní pojištění</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={
                    activeModal === "storno"
                      ? "/dokumenty/zpneonstornodohodou.pdf"
                      : "/dokumenty/Výpověď_PS_ŽP_062023.pdf"
                  }
                  download
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                >
                  <Download className="h-4 w-4" />
                  Stáhnout
                </a>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Zavřít"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {activeModal === "storno" ? (
              <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-800">
                <p className="font-semibold">Vážení poradci,</p>
                <p>
                  Od 3.12. 2025 platí následující pravidla pro storno dohodou pro smlouvy životního pojištění ČPP a.s.,
                  prosím o jejich důsledné dodržování:
                </p>
                <ol className="list-decimal space-y-2 pl-6">
                  {STORNO_RULES.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ol>
                <p>Děkuji</p>
                <p className="font-semibold">Jindřich Hájek.</p>
              </div>
            ) : (
              <div className="mt-5 text-[15px] leading-7 text-slate-800">
                Formulář k Výpovědi pojistné smlouvy
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
