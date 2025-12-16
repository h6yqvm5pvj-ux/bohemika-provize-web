// src/app/pomucky/argumenty/page.tsx
"use client";

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";

type ObjectionCategory = "life" | "nonLife" | "investment" | "gold" | "general";
type FilterCategory = "all" | ObjectionCategory;

type Objection = {
  id: string;
  category: ObjectionCategory;
  title: string;
  bullets: string[];
};

const CATEGORY_META: {
  id: FilterCategory;
  label: string;
  shortLabel: string;
}[] = [
  { id: "all", label: "Vše", shortLabel: "Vše" },
  { id: "life", label: "Životní pojištění", shortLabel: "Život" },
  { id: "nonLife", label: "Neživotní pojištění", shortLabel: "Neživot" },
  { id: "investment", label: "Investice", shortLabel: "Investice" },
  { id: "gold", label: "Zlato", shortLabel: "Zlato" },
  { id: "general", label: "Obecné námitky", shortLabel: "Obecné" },
];

const OBJECTIONS: Objection[] = [
  // -------- Obecné --------
  {
    id: "general-drahe",
    category: "general",
    title: "Je to drahé.",
    bullets: [
      "Ukážu ti, kolik tě to vychází v přepočtu na den – většinou jsou to desítky korun.",
      "Porovnáme **současný stav vs. pojištěno / investováno** – co se stane, když se něco stane teď.",
      "Najdeme variantu, která se vejde do rozpočtu, i kdybychom začali menší částkou a později ji navýšili.",
    ],
  },
  {
    id: "general-rozmyslet",
    category: "general",
    title: "Chci si to ještě rozmyslet.",
    bullets: [
      "Shrnu, na čem jsme se shodli (rizika / cíle / částky).",
      "Dobře, promysli si to a pojďme se domluvit, že ti za týden zavolám.",
      "Mezitím ti můžu poslat shrnutí třeba e-mailem.",
    ],
  },

  // -------- Život --------
  {
    id: "life-proc-neon",
    category: "life",
    title: "Proč zrovna Životní pojištění NEON?",
    bullets: [
      "ČPP přebírá čekací doby ze smluv od jiných pojišťoven.",
      "Protože vám zajistí spolehlivou a kvalitní ochranu.",
      "Invaliditu si pojistíte bez čekacích dob, což není běžné.",
      "Úraz si sjednáváte včetně neúrazového děje ÚRAZ PLUS, možnost progresivního plnění.",
      "Trvalé následky s bezkonkurenčním progresivním plněním.",
      "Za úraz vyplatí peníze už za první lékařskou zprávu.",
      "Krytí úrazu pro klienty trpící cukrovkou bez omezení.",
      "Možnost připojistit cukrovku a její komplikace.",
      "ČPP POMOC až pro 5 blízkých – eRecept, zajištění lékaře atd.",
    ],
  },
  {
    id: "life-proc-zivotko",
    category: "life",
    title: "Proč bych měl mít životko?",
    bullets: [
      "Z pár stovek měsíčně můžete mít krytí v milionech, to žádná investice krátkodobě neumí.",
      "Můžete to riziko, že se něco stane, nést sám, nebo ho přenesete na pojišťovnu.",
      "Zajištění příjmu, když zdravotní stav způsobí krátkodobý či dlouhodobý výpadek příjmu.",
      "Největší jistota pro vaše děti je to, že nepřijdou o domov a životní úroveň, když se něco stane rodičům.",
      "Banka má své peníze jisté, a co vaše rodina? Životka má zajistit, aby v případě problému byly závazky splacené a o nic jste nepřišli.",
      "Smrt je pro rodinu tragédie, ale nejdražší je situace, kdy člověk zůstane naživu, ale nemůže pracovat.",
    ],
  },
  {
    id: "life-uz-mam",
    category: "life",
    title: "Už mám životko jinde.",
    bullets: [
      "Super, musím tě pochválit, že už smlouvu máš. Pojďme udělat revizi, jestli opravdu funguje ve tvůj prospěch.",
      "Ty se v pojistných podmínkách nevyznáš, ale já ano. Uděláme nezávazné porovnání toho, co máš a co ti můžu nabídnout.",
      "Třeba zjistíme, že to, co máš, je skvělé – anebo že to dokážeme nastavit lépe.",
    ],
  },
  {
    id: "life-nic-se-nestane",
    category: "life",
    title: "Mně se nemůže nic stát, jsem zdravý.",
    bullets: [
      "To je dobře – pojištění se sjednává ideálně **dokud je člověk zdravý**.",
      "Neřešíme jen zdraví, ale i **výpadek příjmu**, rodinu, hypotéku a závazky.",
      "Můžeš se mi podepsat pod to, že se tvůj zdravotní stav nikdy nezmění?",
      "Máte doma pojistky v rozvaděči? Ne proto, že plánujete zkrat, ale kdyby náhodou. Stejné je to u životka.",
      "Představ si, že ti včera řekli, že už nemůžeš pracovat – jak to máš dnes zařízené?",
      "Auto máš pojištěné, dům/byt taky, ale vlastní příjem bez zdraví prostě nenahradíš.",
    ],
  },

  // -------- Neživot --------
  {
    id: "nonlife-auto-levneji",
    category: "nonLife",
    title: "Auto mám jinde levněji.",
    bullets: [
      "Podíváme se nejen na cenu, ale i na **rozsah krytí** – limity, připojištění, asistence.",
      "Porovnáme konkrétně: limity, skla, střet se zvěří, náhradní vozidlo, asistence, spoluúčasti atd.",
      "Chceš hlavně ušetřit, nebo být **kvalitně zajištěný**, když se něco stane?",
      "Pojďme vedle sebe dát tvoji smlouvu a moji nabídku – pojištění není jen o ceně, ale hlavně o tom, co ti reálně zaplatí.",
    ],
  },
  {
    id: "nonlife-majetek-netreba",
    category: "nonLife",
    title: "Pojištění majetku nepotřebuju.",
    bullets: [
      "Spočítáme, kolik by stálo znovu postavit dům nebo vybavit byt, kdyby se něco stalo.",
      "Ukážeme rozdíl mezi variantou **„nic se nestane“ a „vyhořím / vytopím sousedy“**.",
      "Často stačí **rozumné krytí za pár stokorun měsíčně** – nemusí to být nejdražší balík.",
    ],
  },

  // -------- Investice --------
  {
    id: "inv-rizikove",
    category: "investment",
    title: "Investice jsou moc rizikové.",
    bullets: [
      "Riziko je i vyrazit ven na procházku nebo za volant – ale přesto to děláme.",
      "Ukážu ti, jak **diverzifikovat** a tím rizika rozložit a zmírnit.",
      "Větší riziko je často **neinvestovat vůbec** – inflace peníze pomalu „požírá“ každý rok.",
    ],
  },
  {
    id: "inv-penize-v-bance",
    category: "investment",
    title: "Radši mám peníze v bance.",
    bullets: [
      "Část peněz je super mít v bance jako **rezervu pro nenadálé výdaje**.",
      "Banka je skvělá na příjmy a platby, ale na dlouhodobé uchování hodnoty existují efektivnější nástroje.",
      "Věříš státu? A víš, že tvoji banku řídí právě stát?",
      "Proč investovat přes banku, když není investiční společnost – jen přeposílá peníze dál a ubírá ti z výnosu na poplatcích.",
    ],
  },

  // -------- Zlato --------
  {
    id: "gold-mrtva-investice",
    category: "gold",
    title: "Zlato nic nevydělává, je to mrtvá investice.",
    bullets: [
      "Je pravda, že zlato nevyplácí **úrok ani dividendu** – jeho úloha je jiná.",
      "Používá se hlavně jako **pojistka proti krizi a inflaci** – doplněk k portfoliu, ne jediná investice.",
      "Ukážeme si, jak může **5–15 % portfolia ve zlatě** snížit výkyvy při pádech na trzích.",
      "Naopak zlato poskytuje velice atraktivní, často až bezkonkurenční zhodnocení v poměru k rizikovosti.",
    ],
  },
  {
    id: "gold-proc-zlato",
    category: "gold",
    title: "Proč bych měl investovat do zlata?",
    bullets: [
      "Je to reálné aktivum, ne jen slib na papíře nebo číslo v aplikaci.",
      "Chrání finance před úpadkem, inflací a umí je atraktivně zhodnotit.",
      "Bezpečný přístav v krizích – války, finanční krize, pád banky, měnová reforma. V nejistotě roste zájem o zlato.",
      "Likvidita – zlato lze snadno kdykoliv směnit zpět na peníze.",
      "Diskrétnost – zlato je váš fyzický majetek, máte nad ním kontrolu pouze vy.",
      "Investiční slitky a mince jsou osvobozené od 21% DPH.",
    ],
  },
];

// jednoduchý markdown: **tučné**
function renderWithBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <strong key={idx}>{part}</strong>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}

export default function ArgumentsPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<FilterCategory>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return OBJECTIONS.filter((obj) => {
      const catMatch =
        selectedCategory === "all" || obj.category === selectedCategory;

      if (!catMatch) return false;
      if (!query) return true;

      const inTitle = obj.title.toLowerCase().includes(query);
      const inBullets = obj.bullets
        .join(" ")
        .toLowerCase()
        .includes(query);

      return inTitle || inBullets;
    });
  }, [search, selectedCategory]);

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Argumenty & námitky
          </h1>
          <p className="text-sm text-slate-300">
            Rychlý tahák k nejčastějším námitkám klientů – Život, Neživot,
            Investice, Zlato a obecné situace.
          </p>
        </header>

        {/* Vyhledávání */}
        <section className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Vyhledej námitku…"
              className="w-full bg-transparent border-none outline-none text-sm text-slate-50 placeholder:text-slate-400"
            />
          </div>
        </section>

        {/* Kategorie */}
        <section className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Kategorie
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_META.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition ${
                  selectedCategory === cat.id
                    ? "bg-white text-slate-900 shadow-md"
                    : "bg-slate-900/40 text-slate-200 hover:bg-slate-900/70"
                }`}
              >
                <span>{cat.shortLabel}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Seznam námitek */}
        <section className="space-y-3">
          {filtered.map((obj) => {
            const catMeta = CATEGORY_META.find(
              (c) => c.id === obj.category
            );
            const open = openId === obj.id;

            return (
              <article
                key={obj.id}
                className="rounded-3xl bg-white/5 border border-white/15 backdrop-blur-2xl px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.85)]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenId((prev) => (prev === obj.id ? null : obj.id))
                  }
                  className="w-full flex items-center gap-2 text-left"
                >
                  <div className="flex-1 flex items-center gap-2">
                    <span className="relative inline-flex h-3.5 w-3.5">
                      <span className="absolute inset-0 rounded-full bg-emerald-300 opacity-70 blur-[2px]" />
                      <span className="relative inline-block h-full w-full rounded-full bg-emerald-400" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-50">
                        {obj.title}
                      </p>
                      {catMeta && (
                        <p className="text-[11px] text-slate-400">
                          {catMeta.label}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">
                    {open ? "▴" : "▾"}
                  </span>
                </button>

                {open && (
                  <div className="pt-3 space-y-2">
                    {obj.bullets.map((b, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-sm text-slate-100"
                      >
                        <span className="mt-[6px] inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
                        <p className="leading-snug">
                          {renderWithBold(b)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-xs text-slate-300 text-center pt-2">
              Nenašel jsem žádnou námitku, která by odpovídala hledání.
            </p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
