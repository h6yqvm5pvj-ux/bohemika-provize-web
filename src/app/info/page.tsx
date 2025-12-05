// src/app/info/page.tsx
"use client";

import { AppLayout } from "@/components/AppLayout";

export default function InfoPage() {
  return (
    <AppLayout active="info">
      <div className="w-full max-w-3xl space-y-6">
        {/* Hlavní info box */}
        <section className="rounded-3xl border border-white/15 bg-slate-950/80 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl px-6 py-6 sm:px-8 sm:py-8 space-y-6">
          <header className="flex items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Informace &amp; upozornění
            </h1>
          </header>

          <div className="space-y-5 text-sm leading-relaxed text-slate-100">
            <p>
              <span className="font-semibold">Tato webová aplikace</span>{" "}
              slouží jako neoficiální nástroj pro Poradce a Manažery
              společnosti Bohemika a.s. Výpočty a přehledy slouží jako
              orientační pomůcka a mohou se lišit od finálních údajů
              ve systémech jednotlivých společností.
            </p>

            {/* Kalkulačka */}
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-slate-50">
                Kalkulačka
              </h2>
              <p className="text-slate-200">
                Kalkulačku vnímej jako orientační nástroj k výpočtům
                provizí. Může dojít k situaci, kdy se změní provizní
                podmínky a nebudou včas zaktualizovány, což by vedlo k
                nesprávnému výsledku. Vždy se proto v případě nejasností
                řiď oficiálními podklady a provizními řády.
              </p>
            </div>

            {/* Provizní kalendář */}
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-slate-50">
                Provizní kalendář
              </h2>
              <p className="text-slate-200">
                Provizní kalendář je orientační nástroj, který ukazuje
                následné provize v čase. Skutečná výplata provize závisí
                na více faktorech – včasné uhrazení smlouvy klientem,
                datum uzavření a počátku, konkrétní pojišťovna nebo jiná
                společnost. Proto se může stát, že aplikace zobrazí
                provizi v jiném měsíci, než bude reálně vyplacena.
              </p>
            </div>

            {/* Chyby a nápady */}
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-slate-50">
                Chyby a nápady
              </h2>
              <p className="text-slate-200">
                Všiml sis chyby, nebo máš nápad na přidání nějaké
                funkce či změnu? Napiš prosím e-mail na{" "}
                <a
                  href="mailto:jakub.rauscher@bohemika.eu"
                  className="underline underline-offset-2 decoration-sky-400 hover:text-sky-300"
                >
                  jakub.rauscher@bohemika.eu
                </a>
                . Každý návrh pomůže aplikaci vylepšit.
              </p>
            </div>
          </div>
        </section>

        {/* Mobilní aplikace */}
        <section className="rounded-3xl border border-emerald-400/40 bg-emerald-500/5 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl px-6 py-6 sm:px-8 sm:py-7 space-y-4">
          <header className="space-y-1">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-50">
              Mobilní aplikace
            </h2>
            <p className="text-sm text-slate-200">
              Aplikace Bohemika Provize.
            </p>
          </header>

          <p className="text-xs sm:text-sm text-slate-200">
            Aplikace je aktuálně dostupná{" "}
            <span className="font-semibold text-emerald-300">
              pouze pro iOS (iPhone a iPad)
            </span>
            . Umožňuje ti navíc získávat{" "}
            <span className="font-semibold">notifikace na blížící se výročí smluv</span>{" "}
            a{" "}
            <span className="font-semibold">
              doporučení na provedení servisu. Nelze ji veřejně najít a je tak přístupná
              pouze díky odkazu níže.
            </span>{" "}
            u klientů.
          </p>

          <div className="pt-2">
            <a
              href="https://apps.apple.com/cz/app/bohemika-provize/id6755092188?l=cs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/70 bg-emerald-500/20 px-6 py-2.5 text-sm sm:text-base font-semibold text-emerald-50 shadow-[0_0_25px_rgba(16,185,129,0.55)] hover:bg-emerald-500/30 hover:border-emerald-200 transition"
            >
              <span>📲</span>
              <span>Odkaz na App Store</span>
            </a>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}