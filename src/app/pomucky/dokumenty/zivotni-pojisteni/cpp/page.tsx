// src/app/pomucky/dokumenty/zivotni-pojisteni/cpp/page.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import { ArrowLeft, ArrowUpRight, Download, FileText, ShieldCheck, Sparkles, X } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";
import {
  SECURE_DOCUMENT_FILE_NAMES,
  type SecureDocumentId,
  useSecureDocumentBlob,
} from "@/app/lib/secureDocuments";
import SplitTitle from "../../../plan-produkce/SplitTitle";

const documentsFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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

const DOCUMENT_BY_MODAL: Record<"storno" | "vypoved" | "maxdenni", SecureDocumentId> = {
  storno: "cpp-storno-dohodou",
  vypoved: "cpp-vypoved-zp",
  maxdenni: "max-denni-cpp",
};

export default function CppLifeDocumentsPage() {
  const [activeTab, setActiveTab] = useState<"prehled" | "vypoved">("prehled");
  const [activeModal, setActiveModal] = useState<"storno" | "vypoved" | "maxdenni" | null>(null);
  const activeDocumentId = activeModal ? DOCUMENT_BY_MODAL[activeModal] : null;
  const activeDocument = useSecureDocumentBlob(activeDocumentId);
  const activeDownloadName = activeDocumentId
    ? SECURE_DOCUMENT_FILE_NAMES[activeDocumentId]
    : "dokument";

  return (
    <AppLayout active="tools">
      <div className={`${documentsFont.className} w-full px-4 pb-10 pt-2 sm:px-5`}>
        <div
          className={`mx-auto max-w-[1040px] space-y-5 transition-[filter,opacity] duration-200 ${
            activeModal ? "pointer-events-none select-none blur-[2px] opacity-90" : ""
          }`}
        >
          <header className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f7fbff_55%,#eef6ff_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.1)] sm:px-8 sm:py-8">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  ČPP Život • Dokumenty
                </span>
                <Link
                  href="/pomucky/dokumenty/zivotni-pojisteni"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zpět na životní pojištění
                </Link>
                <Link
                  href="/pomucky/dokumenty"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Zpět na dokumenty
                </Link>
              </div>

              <SplitTitle text="ČPP Dokumenty" className="!text-4xl !text-slate-900 sm:!text-5xl" />
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Rozcestník dokumentů pro životní pojištění ČPP. Vyber režim práce, otevři náhledy a stáhni potřebné podklady.
              </p>
            </div>
          </header>

          <section className="relative rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`relative inline-flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white ${institutionLogoFrameClass(
                    "cpp",
                    "compact"
                  )}`}
                >
                  <Image
                    src="/icons/cpp.png"
                    alt="ČPP logo"
                    fill
                    sizes="64px"
                    className={institutionLogoImageClass("cpp")}
                  />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">ČPP</h2>
                  <p className="text-sm text-slate-600">Životní pojištění</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <FileText className="h-3.5 w-3.5" />
                Náhled + formuláře
              </span>
            </div>
          </section>

          <section className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            <button
              type="button"
              onClick={() => {
                setActiveTab("prehled");
                setActiveModal(null);
              }}
              className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
                activeTab === "prehled"
                  ? "border border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.24)]"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Přehled dokumentů
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("vypoved")}
              className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
                activeTab === "vypoved"
                  ? "border border-slate-900 bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.24)]"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Výpověď smlouvy
            </button>
          </section>

          {activeTab === "prehled" ? (
            <section className="space-y-4">
              <article className="relative overflow-hidden rounded-[24px] border border-cyan-200/85 bg-[linear-gradient(135deg,#f8fafc_0%,#eff6ff_56%,#ffffff_100%)] px-6 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.1)]">
                <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">Náhled dokumentu</p>
                <h3 className="mt-2 text-[2rem] font-bold leading-tight tracking-[-0.015em] text-slate-900 sm:text-[2.2rem]">
                  MAXIMÁLNÍ POJISTNÉ ČÁSTKY DENNÍHO ODŠKODNÉHO
                </h3>
                <p className="mt-2 text-sm text-slate-600">Otevřít náhled JPEG a stáhnout.</p>
                <button
                  type="button"
                  onClick={() => setActiveModal("maxdenni")}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-cyan-400 hover:bg-cyan-50"
                >
                  Otevřít dokument
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </article>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setActiveModal("storno")}
                  className="group relative overflow-hidden rounded-[24px] border border-rose-200/85 bg-[linear-gradient(135deg,#fff1f2_0%,#ffe4e6_42%,#ffffff_100%)] px-5 py-5 text-left shadow-[0_14px_28px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:border-rose-300"
                >
                  <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500" aria-hidden="true" />
                  <div className="text-xs uppercase tracking-[0.18em] text-rose-700">Karta</div>
                  <div className="mt-1 text-2xl font-bold leading-tight text-slate-900">STORNO Dohodou</div>
                  <div className="mt-2 text-sm text-slate-600">Otevřít detail pravidel</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal("vypoved")}
                  className="group relative overflow-hidden rounded-[24px] border border-cyan-200/85 bg-[linear-gradient(135deg,#f8fafc_0%,#eff6ff_56%,#ffffff_100%)] px-5 py-5 text-left shadow-[0_14px_28px_rgba(15,23,42,0.1)] transition hover:-translate-y-0.5 hover:border-cyan-300"
                >
                  <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-700">Karta</div>
                  <div className="mt-1 text-2xl font-bold leading-tight text-slate-900">Výpověď smlouvy</div>
                  <div className="mt-2 text-sm text-slate-600">Otevřít formulář ke stažení</div>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/62 px-3 py-6 backdrop-blur-[2.5px] sm:px-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_55%,#eff6ff_100%)] p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  ČPP Životní pojištění
                </span>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                  {activeModal === "storno"
                    ? "STORNO Dohodou"
                    : activeModal === "vypoved"
                      ? "Výpověď smlouvy"
                      : "MAXIMÁLNÍ POJISTNÉ ČÁSTKY DENNÍHO ODŠKODNÉHO"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {activeModal === "maxdenni"
                    ? "Náhled interní tabulky pro denní odškodné"
                    : "Výpověď smlouvy - ČPP Životní pojištění"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={activeDocument.url ?? "#"}
                  download={activeDownloadName}
                  onClick={(event) => {
                    if (!activeDocument.url) event.preventDefault();
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black ${
                    activeDocument.url ? "" : "pointer-events-none opacity-60"
                  }`}
                  aria-disabled={!activeDocument.url}
                >
                  <Download className="h-4 w-4" />
                  {activeDocument.loading ? "Načítám..." : "Stáhnout"}
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
                <ol className="space-y-2">
                  {STORNO_RULES.map((rule, index) => (
                    <li key={rule} className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-300 bg-white text-xs font-semibold text-cyan-700">
                        {index + 1}
                      </span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ol>
                <p>Děkuji</p>
                <p className="font-semibold">Jindřich Hájek.</p>
              </div>
            ) : activeModal === "vypoved" ? (
              <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-800">
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-3">
                  <p className="inline-flex items-center gap-2 font-semibold text-slate-900">
                    <ShieldCheck className="h-4 w-4 text-cyan-700" />
                    Formulář k výpovědi pojistné smlouvy
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Použij tlačítko <span className="font-semibold">Stáhnout</span> vpravo nahoře.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {activeDocument.loading ? (
                    <div className="flex min-h-[360px] items-center justify-center text-sm font-medium text-slate-600">
                      Načítám dokument...
                    </div>
                  ) : activeDocument.error ? (
                    <div className="flex min-h-[360px] items-center justify-center px-4 text-center text-sm font-medium text-rose-700">
                      {activeDocument.error}
                    </div>
                  ) : activeDocument.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeDocument.url}
                      alt="Maximální pojistné částky denního odškodného"
                      className="h-auto w-full object-contain"
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
