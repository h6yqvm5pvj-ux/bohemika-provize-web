import Image from "next/image";
import { type ReactNode } from "react";
import {
  Activity,
  Baby,
  Bone,
  CalendarClock,
  ChartNoAxesColumn,
  CheckCircle2,
  CircleHelp,
  CircleX,
  Coins,
  Hand,
  Hospital,
  Info,
  Mars,
  PowerOff,
  RefreshCw,
  Scissors,
  ShieldPlus,
  Stethoscope,
  TrendingUp,
  Venus,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromInsurerName,
} from "@/app/lib/institutionLogoDisplay";
import { InSituExplanation } from "./InSituExplanation";
import { OneGuardTermsDownload } from "./OneGuardTermsDownload";
import { ProgressivePayoutComparison } from "./ProgressivePayoutComparison";

type ComparisonRow = {
  id: string;
  topic: ReactNode;
  neonLife?: ReactNode;
  neonLifeTone?: "neutral";
  oneGuard: ReactNode;
};

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    id: "uraz-neurazovy-dej",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Úrazové pojištění
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Úraz – neúrazový děj
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Rozhoduje, jestli definice úrazu zahrnuje i působení vlastní tělesné síly
          závislé na vůli pojištěného.
        </p>
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-violet-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span>Modelový příklad</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-violet-900/80">
            Poranění lokte při zvedání těžkého břemene.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Plní
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Plní i za neúrazový děj
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Úraz PLUS zahrnuje působení vlastní tělesné síly závislé i nezávislé na
          vůli pojištěného.
        </p>
        <blockquote className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm leading-5 text-emerald-950/80">
          „…vlastní tělesné síly závislé i nezávislé na vůli pojištěného…“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Zvedání těžkého břemene může při splnění ostatních podmínek spadat pod
            úraz PLUS.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          Neplní
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Neúrazový děj se nezohlední
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Definice vyžaduje působení vlastní tělesné síly nezávislé na vůli
          pojištěného. Nemoc se za úraz nepovažuje.
        </p>
        <blockquote className="mt-3 border-l-2 border-rose-400 pl-3 text-sm leading-5 text-rose-950/80">
          „…vlastní tělesné síly nezávisle na vůli pojištěného…“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            U neúrazového děje se na vlastní tělesnou sílu závislou na vůli
            pojištěného nebere ohled.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "obecne-vyluky",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">
          <ShieldPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Neživotní připojištění
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Obecné výluky
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Pojistná událost v případě neživotního pojištění nenastává v následujících
          případech.
        </p>
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-amber-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>V čem je rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-amber-950/80">
            Klíčové je, jak se posuzují nové příznaky nebo diagnóza vzniklé v čekací
            době.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Plní
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Nové příznaky v čekací době plnění neblokují
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Pokud v čekací době vznikne onemocnění nebo jsou diagnostikovány jeho
          příznaky, plnění z neživotních připojištění bude poskytnuto.
        </p>
        <blockquote className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm leading-5 text-emerald-950/80">
          „…v čekací době vznikne nějaké onemocnění nebo budou diagnostikovány jeho
          příznaky, plnění … bude poskytnuto.“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Týká se například pracovní neschopnosti, hospitalizace a invalidity.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          Výluka
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Pojistná událost nenastává až 2 roky od počátku pojištění
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Výluka se vztahuje na nemoc, úraz nebo vrozenou vadu, pro které byl
          pojištěný v posledních 5 letech před počátkem pojištění léčen, sledován
          nebo si jich byl vědom.
        </p>
        <blockquote className="mt-3 border-l-2 border-rose-400 pl-3 text-sm leading-5 text-rose-950/80">
          „…a/nebo u něj v tomto období nebo <mark className="rounded bg-rose-200 px-1 font-bold text-rose-950">v období čekací doby byly přítomny či diagnostikovány jejich příznaky</mark>.“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            Diagnostikované či přítomné příznaky v čekací době se do výluky také
            započítávají.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "invalidita-cekaci-doba",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Invalidita
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Čekací doba a první příznaky nemoci
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Rozhoduje, zda byla nemoc diagnostikována nebo se její příznaky projevily
          během čekací doby.
        </p>
        <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-sky-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-emerald-200 bg-white px-2 py-2">
              <span className="block text-sm font-black text-emerald-700">Nemoc 0 · Úraz 0</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/70">
                měsíců · ČPP
              </span>
            </div>
            <div className="rounded-lg border border-rose-200 bg-white px-2 py-2">
              <span className="block text-sm font-black text-rose-700">Nemoc 2 · Úraz 0</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-rose-900/70">
                měsíce · MetLife
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Nemoc 0 · Úraz 0 měsíců
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Nemoc i úraz jsou bez čekací doby
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          U NEON Life je čekací doba pro invaliditu z důvodu nemoci i úrazu
          nastavena na 0 měsíců.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Nevzniká dvouměsíční čekací období, během kterého by diagnóza nebo první
            projevy příznaků zablokovaly plnění z invalidity.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          Nemoc 2 · Úraz 0 měsíců
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Úraz bez čekací doby, nemoc 2 měsíce
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pro invaliditu následkem úrazu je čekací doba 0 měsíců. U invalidity
          následkem nemoci trvá 2 měsíce a pojištění I1+, I2+ a/nebo I3 musí trvat
          nepřetržitě od vzniku příčiny až do dne pojistné události.
        </p>
        <blockquote className="mt-3 border-l-2 border-rose-400 pl-3 text-sm leading-5 text-rose-950/80">
          „…nemoc, která vedla k invaliditě, <mark className="rounded bg-rose-200 px-1 font-bold text-rose-950">nebyla diagnostikována, nebo se její příznaky neprojevily v čekací době</mark>.“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            U invalidity následkem nemoci nebude plnění poskytnuto, pokud byla nemoc
            diagnostikována nebo se její příznaky projevily během dvouměsíční čekací
            doby.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "snizena-sobestacnost",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-800">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          Dlouhodobá péče
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Snížená soběstačnost
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání stupňů závislosti na péči jiné osoby, při kterých vzniká nárok
          na pojistné plnění.
        </p>
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-indigo-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-indigo-950/80">
            NEON Life zahrnuje navíc také II. stupeň závislosti.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          II.–IV. stupeň
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Kryje tři stupně závislosti
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Sjednaná pojistná částka je vyplacena při uznání závislosti na péči jiné
          osoby z důvodu dlouhodobě nepříznivého zdravotního stavu, který vede k
          přiznání II.–IV. stupně dle zákona o sociálních službách.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {["II.", "III.", "IV."].map((degree) => (
            <div
              key={degree}
              className="rounded-xl border border-emerald-200 bg-white/80 px-2 py-2.5"
            >
              <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span className="mt-1 block text-sm font-black text-emerald-950">
                {degree}
              </span>
            </div>
          ))}
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          III.–IV. stupeň
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          II. stupeň není zahrnutý
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojistným nebezpečím je závažný zdravotní stav pojištěného, který vede ke
          snížené soběstačnosti ve III. nebo IV. stupni závislosti.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-rose-200 bg-white/80 px-2 py-2.5">
            <CircleX className="mx-auto h-4 w-4 text-rose-600" aria-hidden="true" />
            <span className="mt-1 block text-sm font-black text-rose-950">II.</span>
          </div>
          {["III.", "IV."].map((degree) => (
            <div
              key={degree}
              className="rounded-xl border border-emerald-200 bg-white/80 px-2 py-2.5"
            >
              <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span className="mt-1 block text-sm font-black text-emerald-950">
                {degree}
              </span>
            </div>
          ))}
        </div>
      </article>
    ),
  },
  {
    id: "invalidita-zavislost-dite",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800">
          <Baby className="h-3.5 w-3.5" aria-hidden="true" />
          Pojištění dítěte
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Invalidita a závislost na péči
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání krytých stupňů invalidity dítěte a závislosti na péči jiné osoby.
        </p>
        <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-cyan-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" aria-hidden="true" />
            <span>U MetLife rozhoduje zvolená varianta</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-cyan-950/80">
            Varianta I3SS3+ kryje závislost od III. stupně, zatímco I3SS2+ už od
            II. stupně.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Baby className="h-3.5 w-3.5" aria-hidden="true" />
          Pojištění dítěte
        </span>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 p-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-emerald-950">
            <ShieldPlus className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Invalidita
          </h3>
          <p className="mt-1.5 text-sm font-medium leading-5 text-emerald-950/75">
            Lze pojistit invaliditu 1., 2. i 3. stupně.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {["1.", "2.", "3."].map((degree) => (
              <div
                key={degree}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2"
              >
                <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span className="mt-1 block text-xs font-black text-emerald-950">
                  {degree} stupeň
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-white/80 p-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-emerald-950">
            <Hand className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Závislost na péči
          </h3>
          <p className="mt-1.5 text-sm font-medium leading-5 text-emerald-950/75">
            Krytý je 2.–4. stupeň závislosti na péči.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {["II.", "III.", "IV."].map((degree) => (
              <div
                key={degree}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2"
              >
                <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span className="mt-1 block text-xs font-black text-emerald-950">
                  {degree} stupeň
                </span>
              </div>
            ))}
          </div>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Baby className="h-3.5 w-3.5" aria-hidden="true" />
          Pojištění dítěte
        </span>
        <div className="mt-4 rounded-xl border border-rose-200 bg-white/85 p-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-rose-950">
            <ShieldPlus className="h-4 w-4 text-rose-600" aria-hidden="true" />
            Invalidita
          </h3>
          <p className="mt-1.5 text-sm font-medium leading-5 text-rose-950/75">
            Lze pojistit pouze invaliditu 3. stupně.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {["1.", "2."].map((degree) => (
              <div
                key={degree}
                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2"
              >
                <CircleX className="mx-auto h-4 w-4 text-rose-600" aria-hidden="true" />
                <span className="mt-1 block text-xs font-black text-rose-950">
                  {degree} stupeň
                </span>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2">
              <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span className="mt-1 block text-xs font-black text-emerald-950">
                3. stupeň
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-sky-200 bg-white/85 p-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-sky-950">
            <Hand className="h-4 w-4 text-sky-600" aria-hidden="true" />
            Závislost na péči
          </h3>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-amber-950">I3SS3+</strong>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
                  III.–IV. stupeň
                </span>
              </div>
              <p className="mt-1.5 text-xs font-medium leading-5 text-amber-950/75">
                Zahrnuje pouze 3. a 4. stupeň závislosti.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-emerald-950">I3SS2+</strong>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-900">
                  II.–IV. stupeň
                </span>
              </div>
              <p className="mt-1.5 text-xs font-medium leading-5 text-emerald-950/75">
                Zahrnuje 2., 3. a 4. stupeň závislosti.
              </p>
            </div>
          </div>
        </div>
      </article>
    ),
  },
  {
    id: "invalidita-zavislost-dite-povinnosti",
    topic: (
      <div className="border-l-4 border-cyan-400 pl-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800">
          <Baby className="h-3.5 w-3.5" aria-hidden="true" />
          Invalidita a závislost · dítě
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Stethoscope className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" />
          Povinnosti plynoucí z pojištění
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Jaké dokumenty je nutné předložit při uplatnění nároku na pojistné plnění.
        </p>
        <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-cyan-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" aria-hidden="true" />
            <span>Podstatný rozdíl v dokládání invalidity</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-cyan-950/80">
            ČPP připouští také odborný posudek lékaře určeného pojistitelem, tedy
            cestu nezávislou na přiznání státního invalidního důchodu.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Tři možné způsoby doložení
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Pro invaliditu stačí jedna z uvedených cest
        </h3>
        <div className="mt-4 space-y-2">
          {[
            [
              "1",
              "Pravomocný posudek o invaliditě vydaný Okresní správou sociálního zabezpečení.",
            ],
            [
              "2",
              "Rozhodnutí České správy sociálního zabezpečení o nároku na invalidní důchod podle českého zákona o důchodovém pojištění.",
            ],
            [
              "3",
              "Odborný posudek lékaře, kterého určí pojistitel.",
            ],
          ].map(([number, text]) => (
            <div
              key={number}
              className="flex gap-3 rounded-xl border border-emerald-200 bg-white/85 p-3 text-sm font-medium leading-5 text-emerald-950/80"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">
                {number}
              </span>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
          <div className="flex gap-2 text-sm font-black leading-5 text-violet-950">
            <ShieldPlus className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span>Mezera v systému u I. a II. stupně</span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-violet-200 bg-white/85 p-3">
              <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-800">
                Uznání ≠ výplata
              </span>
              <p className="mt-1.5 text-xs font-medium leading-5 text-violet-950/80">
                Uznání invalidity samo o sobě nezakládá automatický nárok na invalidní
                důchod. Obecně musí být splněna také potřebná doba pojištění.
              </p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-white/85 p-3">
              <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-800">
                Invalidita z mládí
              </span>
              <p className="mt-1.5 text-xs font-medium leading-5 text-violet-950/80">
                Zvláštní nárok bez potřebné doby pojištění vzniká od 18 let pouze při
                invaliditě III. stupně, která vznikla před dosažením 18 let.
              </p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-white/85 p-3">
              <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-800">
                Budoucí starobní důchod
              </span>
              <p className="mt-1.5 text-xs font-medium leading-5 text-violet-950/80">
                Samotná doba pobírání invalidního důchodu I. nebo II. stupně se
                nepočítá jako náhradní doba důchodového pojištění.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-5 text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>
              Posudek lékaře určeného ČPP umožňuje posoudit pokles pracovní
              schopnosti i bez rozhodnutí o státním invalidním důchodu. Může tak
              zachovat cestu k pojistnému plnění, vždy při splnění ostatních
              pojistných podmínek.
            </span>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3">
          <div className="flex gap-2 text-xs font-bold leading-5 text-slate-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <div>
              <span className="block">
                Příspěvek na péči a další veřejné dávky jsou samostatné systémy s
                vlastními podmínkami; tento rozdíl proto neznamená, že dítě nemůže
                mít nárok na jinou formu státní podpory.
              </span>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <a
                  href="https://ppropo.mpsv.cz/zakon_155_1995"
                  target="_blank"
                  rel="noreferrer"
                  className="font-black text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-950"
                >
                  § 38, § 40 a § 42 zákona
                </a>
                <a
                  href="https://www.cssz.cz/documents/20143/99584/2025_03_kdy_a_jak_zadat_o_invalidni_duchod.pdf/02f947cb-a528-ff49-04c3-b26aab2f0cfe"
                  target="_blank"
                  rel="noreferrer"
                  className="font-black text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-950"
                >
                  Průvodce ČSSZ
                </a>
              </div>
            </div>
          </div>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Požadované dokumenty
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-sky-950">
          Co je nutné doložit
        </h3>
        <div className="mt-4 space-y-2">
          {[
            "Posudek o invaliditě pojištěného dítěte a/nebo rozhodnutí o přiznání příspěvku na péči.",
            "Lékařskou zprávu uvádějící přesnou diagnózu.",
            "Všechny lékařské zprávy a dokumenty o předchozím zdravotním stavu pojištěného dítěte.",
          ].map((text, index) => (
            <div
              key={text}
              className="flex gap-3 rounded-xl border border-sky-200 bg-white/85 p-3 text-sm font-medium leading-5 text-sky-950/80"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-black text-white">
                {index + 1}
              </span>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-5 text-amber-950">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            Vedle rozhodnutí či posudku je požadována také aktuální diagnostická
            zpráva a kompletní dokumentace předchozího zdravotního stavu dítěte.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "zavazna-onemocneni",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-800">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Závažná onemocnění
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Rozsah diagnóz a rakovina in-situ
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          U obou produktů musí zdravotní stav přesně odpovídat definici konkrétní
          diagnózy uvedené v pojistných podmínkách.
        </p>
        <div className="mt-4 rounded-xl border border-fuchsia-100 bg-fuchsia-50/75 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2 text-sm font-bold leading-5 text-fuchsia-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-600" aria-hidden="true" />
              <span>Rakovina ve formě in-situ</span>
            </div>
            <InSituExplanation />
          </div>
          <p className="mt-1.5 text-sm leading-5 text-fuchsia-950/80">
            NEON Life ji zahrnuje, zatímco OneGuard ji řadí mezi výluky.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          In-situ zahrnuto
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Nutné splnit přesnou definici diagnózy
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Pro vznik nároku na plnění musí diagnóza odpovídat definici uvedené v
          pojistných podmínkách NEON Life.
        </p>
        <section className="mt-4 rounded-xl border border-emerald-200 bg-white/80 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <h4 className="text-sm font-black text-emerald-950">
              Rakovina ve formě in-situ
            </h4>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-emerald-950/80">
            Ano, varianta in-situ je zahrnuta ve všech třech variantách
            připojištění závažných onemocnění.
          </p>
        </section>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Širší seznam diagnóz
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-sky-950">
          Více nemocí, ale stále přesné definice
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-sky-950/75">
          Seznam závažných onemocnění je větší než u NEON Life a FLEXI od
          Kooperativy. Také zde musí diagnóza přesně odpovídat definici v pojistných
          podmínkách.
        </p>
        <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-3">
          <div className="flex items-center gap-2">
            <CircleX className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <h4 className="text-sm font-black text-rose-950">
              Rakovina ve formě in-situ
            </h4>
          </div>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white">
            <CircleX className="h-3 w-3" aria-hidden="true" />
            Výluka v základním krytí
          </span>
          <blockquote className="mt-2 border-l-2 border-rose-400 pl-3 text-sm font-semibold leading-5 text-rose-950/85">
            „Nádory klasifikované jako pre-maligní či <mark className="rounded bg-rose-200 px-1 font-black text-rose-950">in situ</mark>.“
          </blockquote>
          <div className="mt-3 flex gap-2 rounded-lg border border-emerald-200 bg-white/90 p-3 text-sm font-semibold leading-5 text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>
              Krytí je možné sjednat samostatným připojištěním
              <strong className="font-black"> Karcinom in situ</strong>, které tuto
              diagnózu zahrnuje.
            </span>
          </div>
        </section>
      </article>
    ),
  },
  {
    id: "zavazna-zenska-onemocneni",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-pink-800">
          <Venus className="h-3.5 w-3.5" aria-hidden="true" />
          Závažná onemocnění
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Závažná ženská onemocnění
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Produkty zařazují krytí ženských onemocnění do rozdílně pojmenovaných
          skupin pojištění.
        </p>
        <div className="mt-4 rounded-xl border border-pink-100 bg-pink-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-pink-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" aria-hidden="true" />
            <span>Rozdíl v zařazení</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-pink-950/80">
            NEON Life je zahrnuje do závažných onemocnění a poranění, OneGuard je
            váže na vyjmenovaná onemocnění zhoubného nádoru.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Lze pojistit
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          V rámci závažných onemocnění a poranění
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Závažná ženská onemocnění lze u NEON Life pojistit v rámci připojištění
          závažných onemocnění a poranění.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>Krytí je součástí této skupiny připojištění.</span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Vyjmenované onemocnění
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-sky-950">
          Vyjmenované onemocnění zhoubného nádoru
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-sky-950/75">
          U OneGuard se jedná o vyjmenované onemocnění zhoubného nádoru. Nárok na
          plnění se posuzuje podle konkrétní definice uvedené v pojistných
          podmínkách.
        </p>
        <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-3">
          <div className="flex items-center gap-2">
            <CircleX className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <h4 className="text-sm font-black text-rose-950">
              Na co se pojištění nevztahuje
            </h4>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-rose-950/85">
            Na nádory, které se rozšířily nebo metastázovaly do prsu, pochvy,
            děložního čípku, dělohy, vejcovodu, vaječníku nebo vulvy, pokud se
            prvotní nádor nenacházel v jednom z těchto orgánů.
          </p>
        </section>
      </article>
    ),
  },
  {
    id: "zavazna-muzska-onemocneni",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-800">
          <Mars className="h-3.5 w-3.5" aria-hidden="true" />
          Závažná onemocnění
        </span>
        <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">
          Závažná mužská onemocnění
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Produkty zařazují krytí mužských onemocnění do rozdílně pojmenovaných
          skupin pojištění.
        </p>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-blue-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
            <span>Rozdíl v zařazení</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-blue-950/80">
            NEON Life je zahrnuje do závažných onemocnění a poranění, OneGuard je
            váže na vyjmenovaná onemocnění zhoubného nádoru.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Lze pojistit
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          V rámci závažných onemocnění a poranění
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Závažná mužská onemocnění lze u NEON Life pojistit v rámci připojištění
          závažných onemocnění a poranění.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/75 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>Krytí je součástí této skupiny připojištění.</span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Vyjmenované onemocnění
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-sky-950">
          Vyjmenované onemocnění zhoubného nádoru
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-sky-950/75">
          U OneGuard se jedná o vyjmenované onemocnění zhoubného nádoru. Nárok na
          plnění se posuzuje podle konkrétní definice uvedené v pojistných
          podmínkách.
        </p>
        <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-3">
          <div className="flex items-center gap-2">
            <CircleX className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <h4 className="text-sm font-black text-rose-950">
              Na co se pojištění nevztahuje
            </h4>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-rose-950/85">
            Na nádory, které se rozšířily nebo metastázovaly do penisu, prostaty,
            varlat, nadvarlete, míchy nebo prsu, pokud se prvotní nádor nenacházel v
            jednom z těchto orgánů.
          </p>
        </section>
      </article>
    ),
  },
  {
    id: "asistovana-reprodukce",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-pink-800">
          <Venus className="h-3.5 w-3.5" aria-hidden="true" />
          Pro ženy
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Baby className="h-5 w-5 shrink-0 text-pink-600" aria-hidden="true" />
          Asistovaná reprodukce
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání věku, při jehož dosažení pojištění asistované reprodukce zaniká.
        </p>
        <div className="mt-4 rounded-xl border border-pink-100 bg-pink-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-pink-950">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" aria-hidden="true" />
            <span>Rozdíl v maximálním věku</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-pink-950/80">
            U NEON Life může pojištění trvat o 5 let déle.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Do 45 let
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Zánik pojištění při dosažení 45 let
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Pojištění zaniká dnem, kdy pojištěná dosáhne věku 45 let.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-center">
          <span className="block text-3xl font-black text-emerald-700">45</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-950/65">
            let
          </span>
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            NEON Life nemá uvedené omezení spojené s umělým přerušením těhotenství
            před počátkem pojištění nebo v čekací době.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Do 40 let
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Zánik pojištění při dosažení 40 let
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojištění zaniká dnem, kdy pojištěná dosáhne věku 40 let.
        </p>
        <div className="mt-4 rounded-xl border border-rose-200 bg-white/80 px-4 py-3 text-center">
          <span className="block text-3xl font-black text-rose-700">40</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-950/65">
            let
          </span>
        </div>
        <section className="mt-4 rounded-xl border border-rose-200 bg-white/80 p-3">
          <div className="flex items-center gap-2">
            <CircleX className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <h4 className="text-sm font-black text-rose-950">
              Omezení pojistného plnění
            </h4>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-rose-950/85">
            Pojistná událost nenastává v případech uvedených ve VPP v odstavci 12.2.
            V rámci Skupiny 1 (Asistovaná reprodukce) pojišťovna dále neposkytne
            plnění, pokud pojištěná
            <mark className="mx-1 rounded bg-rose-200 px-1 font-black text-rose-950">
              před počátkem pojištění nebo v čekací době podstoupila umělé přerušení
              těhotenství.
            </mark>
          </p>
        </section>
      </article>
    ),
  },
  {
    id: "pracovni-neschopnost-tehotenstvi",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Pracovní neschopnost
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Baby className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
          Těhotenství a porod
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání maximální doby plnění za pracovní neschopnost související s
          těhotenstvím, porodem a jejich komplikacemi.
        </p>
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-violet-950">
            <Hospital className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-violet-950/80">
            NEON Life poskytuje až 90 dní bez podmínky hospitalizace. OneGuard
            prodlouží plnění z 30 na 90 dní pouze při hospitalizaci alespoň 3 dny.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Až 90 dní
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Bez podmínky hospitalizace
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Za pracovní neschopnost v souvislosti s těhotenstvím a porodem poskytuje
          NEON Life plnění nejvýše za 90 dní pro každé těhotenství.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-center">
          <span className="block text-3xl font-black text-emerald-700">90</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-950/65">
            dní bez nutné hospitalizace
          </span>
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>Pro plnění až 90 dní není stanovena podmínka hospitalizace.</span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          30 dní · až 90 dní
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Pro 90 dní je nutná hospitalizace
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Za pracovní neschopnost při rizikovém těhotenství, souvisejících stavech a
          komplikacích, porodu, lékařsky nezbytném umělém přerušení těhotenství nebo
          potratu poskytne OneGuard plnění nejvýše za 30 dní pro každé těhotenství.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-rose-200 bg-white/80 px-3 py-3">
            <span className="block text-2xl font-black text-rose-700">30</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-950/65">
              dní standardně
            </span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white/80 px-3 py-3">
            <span className="block text-2xl font-black text-amber-700">90</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-950/65">
              dní při hospitalizaci
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-rose-950">
          <Hospital className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            Prodloužení na 90 dní vyžaduje souvislou hospitalizaci alespoň 3 dny.
            Den přijetí a den ukončení hospitalizace se společně započítávají jako 1
            den.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "pracovni-neschopnost-soubeh-plneni",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Pracovní neschopnost
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Scissors className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
          Krácení při souběhu pojištění
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání možnosti snížit plnění, pokud pojištěný čerpá dávku také z
          obdobného pojištění u jiné pojišťovny.
        </p>
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-violet-950">
            <Coins className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-violet-950/80">
            NEON Life uvádí limit 2 000 Kč denní dávky. OneGuard si vyhrazuje právo
            plnění při souběhu s obdobným pojištěním snížit.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Coins className="h-3.5 w-3.5" aria-hidden="true" />
          Limit 2 000 Kč denně
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Stanovený limit pro případné krácení
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          NEON Life má limit pro případné krácení pojistného plnění nastaven na
          2 000 Kč denní dávky.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-center">
          <span className="block text-3xl font-black text-emerald-700">2 000 Kč</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-950/65">
            denní dávka
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
          Možnost krácení
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Plnění může být při souběhu sníženo
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojišťovna má právo snížit pojistné plnění, pokud pojištěný za stejnou
          pojistnou událost obdržel plnění od ostatních pojišťoven z obdobného typu
          pojištění.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            Souběžně vyplacené plnění z obdobného pojištění může ovlivnit výslednou
            výši dávky OneGuard.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "pracovni-neschopnost-zanik-vycerpanim-limitu",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Pracovní neschopnost
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <PowerOff className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
          Zánik vyčerpáním limitu
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Co se stane s pojištěním po vyplacení maximálního plnění z jedné pojistné
          události.
        </p>
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-violet-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-violet-950/80">
            U NEON Life pojištění pokračuje, zatímco u OneGuard maximální výplatou
            z jedné pojistné události zaniká.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Nezaniká
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Pojištění dále pokračuje
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Pojištění pracovní neschopnosti maximální výplatou z jedné pojistné
          události nezaniká.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>Vyčerpání limitu jedné události samo o sobě pojištění neukončí.</span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
          Zaniká
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Maximální výplata pojištění ukončí
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojištění pracovní neschopnosti maximální výplatou z jedné pojistné
          události zaniká.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>Po vyčerpání maximální výplaty z jedné události pojištění končí.</span>
        </div>
      </article>
    ),
  },
  {
    id: "pracovni-neschopnost-diagnozy-m",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
          Pracovní neschopnost
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Bone className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
          Páteř a diagnózy M
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání omezení plnění u ploténkového syndromu, funkční bolesti a
          dorzopatií bez objektivního nálezu.
        </p>
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-violet-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-violet-950/80">
            OneGuard u vyjmenovaných potíží vyžaduje objektivní postižení nebo
            neurologický nález. NEON Life nemá uvedené omezení diagnóz M.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Bez omezení diagnóz M
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Uvedenou výluku NEON Life nemá
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          NEON Life nemá uvedené omezení diagnóz M pro pracovní neschopnost.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Není zde stanovena stejná podmínka objektivního postižení míchy,
            míšních kořenů nebo neurologického nálezu.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          Výluka
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Bez objektivního nálezu se neplní
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojištění se nevztahuje na pracovní neschopnost vzniklou plně nebo
          částečně v souvislosti s následujícími obtížemi:
        </p>
        <ul className="mt-3 space-y-2 text-sm font-semibold leading-5 text-rose-950/85">
          <li className="flex gap-2 rounded-lg border border-rose-200 bg-white/80 p-2.5">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>
              Náhlý ploténkový páteřní syndrom bez objektivního postižení míchy
              a/nebo míšních kořenů.
            </span>
          </li>
          <li className="flex gap-2 rounded-lg border border-rose-200 bg-white/80 p-2.5">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>
              Jakákoli funkční bolest a/nebo dorzopatie bez objektivního
              neurologického nálezu.
            </span>
          </li>
        </ul>
      </article>
    ),
  },
  {
    id: "hospitalizace-dite-vrozene-vady",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800">
          <Hospital className="h-3.5 w-3.5" aria-hidden="true" />
          Hospitalizace
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Baby className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden="true" />
          Hospitalizace dítěte
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Porovnání omezení plnění při hospitalizaci dítěte v souvislosti s
          vrozenými vadami a potížemi, které z nich vyplývají.
        </p>
        <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-cyan-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-cyan-950/80">
            OneGuard má výluku podle doby diagnózy nebo prvního projevu příznaků.
            NEON Life stejné omezení nemá.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Bez tohoto omezení
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Uvedenou výluku NEON Life nemá
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          NEON Life nemá uvedené omezení hospitalizace dítěte v souvislosti s
          vrozenými vadami podle věku při diagnóze nebo projevu příznaků.
        </p>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Není zde stanovena stejná hranice prvních 3 let života ani podmínka
            projevu před počátkem pojištění.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          Výluka
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Vrozené vady a související potíže
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojištění se u dítěte nevztahuje na hospitalizaci v souvislosti s
          jakýmikoli vrozenými vadami a potížemi, které z nich vyplývají, pokud:
        </p>
        <ul className="mt-3 space-y-2 text-sm font-semibold leading-5 text-rose-950/85">
          <li className="flex gap-2 rounded-lg border border-rose-200 bg-white/80 p-2.5">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>
              byly diagnostikovány nebo se jejich příznaky projevily
              <mark className="ml-1 rounded bg-rose-200 px-1 font-black text-rose-950">
                v prvních 3 letech života,
              </mark>
            </span>
          </li>
          <li className="flex gap-2 rounded-lg border border-rose-200 bg-white/80 p-2.5">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>
              nebo byly diagnostikovány či se jejich příznaky projevily
              <mark className="ml-1 rounded bg-rose-200 px-1 font-black text-rose-950">
                před počátkem pojištění.
              </mark>
            </span>
          </li>
        </ul>
      </article>
    ),
  },
  {
    id: "trvale-nasledky-urazu-definice",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-orange-800">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Úrazové pojištění
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <ShieldPlus className="h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
          Trvalé následky úrazu
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Rozsah krytí závisí na tom, jak pojistné podmínky definují samotný úraz.
          Tato definice nemusí odpovídat medicínskému označení úrazu.
        </p>
        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-orange-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
            <span>Hlavní rozdíl</span>
          </div>
          <p className="mt-1.5 text-sm leading-5 text-orange-950/80">
            OneGuard pracuje s úrazem pojištěného. NEON Life používá širší definici
            Úraz PLUS.
          </p>
        </div>
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <ShieldPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Úraz PLUS
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Širší definice úrazu
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Pro trvalé následky se u NEON Life používá stejná definice Úrazu PLUS jako
          u ostatních úrazových připojištění.
        </p>
        <blockquote className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm leading-5 text-emerald-950/80">
          „…neočekávané a náhlé působení vlastní tělesné síly závislé i nezávislé na
          vůli pojištěného nebo zevních sil nezávislých na vůli pojištěného…“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Definice může zahrnout i děj vyvolaný vlastní tělesnou silou závislou na
            vůli pojištěného, pokud splní ostatní podmínky Úrazu PLUS.
          </span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Úraz pojištěného
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Pojistným nebezpečím je úraz
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-rose-950/75">
          Pojistným nebezpečím v rámci pojištění trvalých následků je úraz
          pojištěného podle definice uvedené v podmínkách OneGuard.
        </p>
        <blockquote className="mt-3 border-l-2 border-rose-400 pl-3 text-sm leading-5 text-rose-950/80">
          „…působení zevních sil nebo vlastní tělesné síly nezávisle na vůli
          pojištěného…“
        </blockquote>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            Vlastní tělesná síla závislá na vůli pojištěného není v definici úrazu
            zahrnuta.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "trvale-nasledky-progresivni-plneni",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-orange-800">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          Trvalé následky
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <ChartNoAxesColumn className="h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
          Progresivní plnění
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Oba produkty nabízejí až 10× progresi, ale násobení pojistné částky
          spouštějí od jiného procenta rozsahu trvalých následků.
        </p>
        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/75 p-3">
          <div className="flex items-start gap-2 text-sm font-bold leading-5 text-orange-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
            <span>Stejný rozsah, jiný násobek</span>
          </div>
          <div className="mt-3 space-y-2">
            {[
              ["15 % TN", "NEON 2×", "OneGuard 1×"],
              ["50 % TN", "NEON 5×", "OneGuard 4,5×"],
              ["95 % TN", "NEON 10×", "OneGuard 9×"],
              ["100 % TN", "NEON 10×", "OneGuard 10×"],
            ].map(([range, neon, oneGuard]) => (
              <div
                key={range}
                className="grid grid-cols-[0.8fr_1fr_1fr] items-center gap-1.5 rounded-lg border border-orange-100 bg-white/85 px-2 py-2 text-center text-[11px] font-black"
              >
                <span className="text-slate-700">{range}</span>
                <span className="rounded-md bg-emerald-100 px-1.5 py-1 text-emerald-800">
                  {neon}
                </span>
                <span className="rounded-md bg-sky-100 px-1.5 py-1 text-sky-800">
                  {oneGuard}
                </span>
              </div>
            ))}
          </div>
        </div>
        <ProgressivePayoutComparison />
      </div>
    ),
    neonLife: (
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/75 p-4 shadow-[0_8px_18px_rgba(5,150,105,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          10× progrese
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-emerald-950">
          Násobení začíná nad 10 %
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-emerald-950/75">
          Do 10 % rozsahu TN se plní bez násobení. Nad 10 % se násobek zvyšuje o
          1× za každých dalších 10 procentních bodů.
        </p>
        <div className="mt-4 space-y-2 text-sm font-bold">
          {[
            ["0–10 %", "1×"],
            ["> 10–20 %", "2×"],
            ["> 20–30 %", "3×"],
            ["> 50–60 %", "6×"],
            ["> 80–90 %", "9×"],
            ["> 90–100 %", "10×"],
          ].map(([range, multiplier]) => (
            <div
              key={range}
              className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2"
            >
              <span className="text-emerald-950/75">{range}</span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-black text-emerald-800">
                {multiplier}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>Maximální 10× násobek se uplatní už při rozsahu nad 90 %.</span>
        </div>
      </article>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/75 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          10× progrese
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-sky-950">
          Násobení začíná nad 15 %
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-sky-950/75">
          Do 15 % rozsahu TN se plní bez násobení. Nad 15 % se násobek zvyšuje o
          0,5× za každých dalších 5 procentních bodů.
        </p>
        <div className="mt-4 space-y-2 text-sm font-bold">
          {[
            ["0–15 %", "1×"],
            ["> 15–20 %", "1,5×"],
            ["> 20–25 %", "2×"],
            ["> 50–55 %", "5×"],
            ["> 90–95 %", "9×"],
            ["> 95–99 %", "9,5×"],
            ["100 %", "10×"],
          ].map(([range, multiplier]) => (
            <div
              key={range}
              className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white/80 px-3 py-2"
            >
              <span className="text-sky-950/75">{range}</span>
              <span className="rounded-md bg-sky-100 px-2 py-0.5 font-black text-sky-800">
                {multiplier}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-sky-200 bg-white/80 p-3 text-sm font-semibold leading-5 text-sky-950">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          <span>Maximální 10× násobek se uplatní až při rozsahu 100 %.</span>
        </div>
      </article>
    ),
  },
  {
    id: "horni-koncetiny-vyluka",
    topic: (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          Úrazové pojištění
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Hand className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          Horní končetiny
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Výluka pro pojištění trvalých následků a poranění horních končetin.
        </p>
      </div>
    ),
    neonLifeTone: "neutral",
    neonLife: (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/75 p-5 text-center">
        <div>
          <PowerOff className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-black text-slate-700">Není v nabídce</p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
            ČPP toto připojištění nenabízí.
          </p>
        </div>
      </div>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-rose-200 bg-rose-50/75 p-4 shadow-[0_8px_18px_rgba(225,29,72,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
          Na co se pojištění nevztahuje
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-rose-950">
          Onemocnění vzniklé následkem úrazu
        </h3>
        <div className="mt-4 space-y-2">
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm font-bold leading-5 text-rose-950">
            <Hand className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-rose-600">
                Skupina 1
              </span>
              Trvalé následky horních končetin
            </span>
          </div>
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm font-bold leading-5 text-rose-950">
            <Hand className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-rose-600">
                Skupina 2
              </span>
              Poranění horních končetin
            </span>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium leading-6 text-rose-950/80">
          Pojistná událost nenastává v souvislosti s onemocněním, které vzniklo
          a/nebo se projevilo následkem úrazu.
        </p>
        <div className="mt-4 rounded-xl border border-rose-300 bg-rose-100/70 p-3">
          <div className="flex items-center gap-2 text-sm font-black text-rose-950">
            <CircleX className="h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
            Další výluky pro Skupinu 2
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex gap-2 rounded-lg border border-rose-200 bg-white/85 p-3 text-sm font-medium leading-5 text-rose-950/85">
              <Bone className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>
                <strong className="text-rose-950">Zlomeniny:</strong> pojistná událost
                nenastává, pokud pojištěný trpí vrozenou lomivostí kostí,
                osteoporózou, nádorem a/nebo cystou pojivové tkáně v místě úrazu,
                ani v případě únavových zlomenin.
              </span>
            </div>
            <div className="flex gap-2 rounded-lg border border-rose-200 bg-white/85 p-3 text-sm font-medium leading-5 text-rose-950/85">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>
                <strong className="text-rose-950">Distenze:</strong> pojistná událost
                nenastává při jakémkoli natažení svalů, šlach a/nebo kloubních vazů,
                pokud není uvedeno v Oceňovací tabulce HK.
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-5 text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            <strong>Výjimka:</strong> pouze pyogenní infekce rány.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "horni-koncetiny-karpalni-tunel",
    topic: (
      <div className="border-l-4 border-sky-400 pl-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          Horní končetiny · Skupina 3
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Scissors className="h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
          Syndrom karpálního tunelu
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Nemoc horních končetin označovaná také jako syndrom zúžení nebo léze
          středního nervu.
        </p>
      </div>
    ),
    neonLifeTone: "neutral",
    neonLife: (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/75 p-5 text-center">
        <div>
          <PowerOff className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-black text-slate-700">Není v nabídce</p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
            ČPP toto připojištění nenabízí.
          </p>
        </div>
      </div>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 shadow-[0_8px_18px_rgba(2,132,199,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
          Skupina 3 · Nemoci horních končetin
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-sky-950">
          Podmínkou je chirurgická léčba
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-sky-950/75">
          Pojištění se vztahuje na syndrom karpálního tunelu vyžadující chirurgickou
          léčbu.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-sky-200 bg-white/85 p-3">
            <span className="block text-2xl font-black text-sky-700">25 %</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-sky-950/60">
              z pojistné částky
            </span>
          </div>
          <div className="rounded-xl border border-sky-200 bg-white/85 p-3">
            <span className="block text-2xl font-black text-sky-700">1×</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-sky-950/60">
              maximální plnění
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-5 text-rose-950">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            Pokud se syndrom karpálního tunelu projeví také na druhé ruce, další
            pojistné plnění se neposkytne.
          </span>
        </div>
      </article>
    ),
  },
  {
    id: "horni-koncetiny-tenisovy-loket",
    topic: (
      <div className="border-l-4 border-indigo-400 pl-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-800">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          Horní končetiny · Skupina 3
        </span>
        <h2 className="mt-3 flex items-center gap-2 text-lg font-black leading-tight text-slate-950">
          <Activity className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
          Tenisový loket
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          Radiální neboli laterální epikondylitida, v podmínkách popsaná jako zánět
          zevního hrbolu pažní kosti.
        </p>
      </div>
    ),
    neonLifeTone: "neutral",
    neonLife: (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/75 p-5 text-center">
        <div>
          <PowerOff className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-black text-slate-700">Není v nabídce</p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
            ČPP toto připojištění nenabízí.
          </p>
        </div>
      </div>
    ),
    oneGuard: (
      <article className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-[0_8px_18px_rgba(79,70,229,0.07)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Skupina 3 · Nemoci horních končetin
        </span>
        <h3 className="mt-3 text-base font-black leading-5 text-indigo-950">
          Podmínkou je chirurgická léčba
        </h3>
        <p className="mt-2 text-sm font-medium leading-6 text-indigo-950/75">
          Pojištění se vztahuje na tenisový loket vyžadující chirurgickou léčbu.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-indigo-200 bg-white/85 p-3">
            <span className="block text-2xl font-black text-indigo-700">25 %</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-indigo-950/60">
              z pojistné částky
            </span>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-white/85 p-3">
            <span className="block text-2xl font-black text-indigo-700">1×</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-indigo-950/60">
              maximální plnění
            </span>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex gap-2 text-sm font-semibold leading-5 text-amber-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <strong className="block">Medicínský kontext</strong>
              <span className="mt-1 block font-medium text-amber-950/80">
                Tenisový loket je přetěžovací tendinopatie. Potíže se mohou vracet,
                zejména po návratu k zatěžující činnosti; recidiva však není
                automatická u každého pacienta.
              </span>
              <a
                href="https://www.ncbi.nlm.nih.gov/books/NBK431092/"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-black text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
              >
                Odborný zdroj: NCBI Bookshelf
              </a>
            </div>
          </div>
        </div>
      </article>
    ),
  },
];

const PRODUCTS = [
  {
    insurer: "MetLife",
    product: "OneGuard",
    logoPath: "/icons/metlife.png",
  },
  {
    insurer: "ČPP",
    product: "NEON Life",
    logoPath: "/icons/cpp.png",
  },
] as const;

export default function NeonLifeVsMetLifeOneGuardPage() {
  return (
    <AppLayout active="tools">
      <div className="neon-oneguard-comparison relative w-full max-w-[1500px] space-y-4 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_45%,#ffffff_100%)] px-0 pb-8 sm:space-y-5 sm:px-3">
        <header className="px-0 pt-0 sm:px-2 sm:pt-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 shadow-[0_8px_18px_rgba(217,70,239,0.08)] sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.18em]">
            <ChartNoAxesColumn className="h-3.5 w-3.5" />
            Srovnání životního pojištění
          </div>
          <h1 className="mt-3 text-3xl font-black leading-[0.98] tracking-tight text-slate-950 sm:mt-4 sm:text-5xl lg:text-6xl">
            NEON Life vs. MetLife OneGuard
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 sm:text-base">
            Přehled rozdílů mezi produkty na jednom místě.
          </p>
          <div className="mt-4">
            <OneGuardTermsDownload />
          </div>
        </header>

        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.07)] sm:rounded-[24px] lg:overflow-visible">
          <div className="min-w-[840px]">
            <div
              className="sticky top-3 z-40 isolate grid border-b border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.97)_100%)] shadow-[0_16px_38px_rgba(15,23,42,0.14)] lg:rounded-2xl lg:border lg:border-white"
              style={{
                gridTemplateColumns:
                  "minmax(250px, 0.8fr) repeat(2, minmax(290px, 1fr))",
              }}
            >
              <div className="flex min-h-[76px] items-center border-r border-slate-200 px-4 py-3 sm:px-5">
                <span className="inline-flex items-center gap-2 text-sm font-black text-slate-900">
                  <CircleHelp className="h-4 w-4 text-violet-600" />
                  O co jde
                </span>
              </div>
              {PRODUCTS.map((product) => {
                const logoKey = institutionLogoKeyFromInsurerName(product.insurer);
                const isMetLife = product.insurer === "MetLife";

                return (
                  <div
                    key={product.product}
                    className={`relative flex min-h-[76px] items-center gap-3 overflow-hidden border-r border-white/80 px-4 py-3 last:border-r-0 sm:px-5 ${
                      isMetLife
                        ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.82)_0%,rgba(239,246,255,0.72)_100%)]"
                        : "bg-[linear-gradient(135deg,rgba(255,255,255,0.82)_0%,rgba(236,253,245,0.70)_100%)]"
                    }`}
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-1 ${
                        isMetLife
                          ? "bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_100%)]"
                          : "bg-[linear-gradient(90deg,#064e3b_0%,#0f766e_100%)]"
                      }`}
                      aria-hidden="true"
                    />
                    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.08)] ${institutionLogoFrameClass(logoKey, "compact")}`}>
                      <Image
                        src={product.logoPath}
                        alt={product.insurer}
                        fill
                        sizes="64px"
                        className={institutionLogoImageClass(logoKey)}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        {product.insurer}
                      </span>
                      <span className="mt-0.5 block text-base font-black leading-tight text-slate-900">
                        {product.product}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {COMPARISON_ROWS.map((row) => (
                <div
                  key={row.id}
                  className="grid border-b border-slate-100 last:border-b-0"
                  style={{ gridTemplateColumns: "minmax(250px, 0.8fr) repeat(2, minmax(290px, 1fr))" }}
                >
                  <div className="border-r border-slate-100 px-4 py-5 sm:px-5">
                    {row.topic}
                  </div>
                  <div className="comparison-product-cell comparison-product-cell--metlife relative overflow-hidden border-r border-slate-100 bg-[linear-gradient(145deg,#f8fafc_0%,#eff6ff_52%,#ffffff_100%)] px-4 py-5 sm:px-5">
                    <div className="relative [&>article]:relative [&>article]:overflow-hidden [&>article]:!border-white/90 [&>article]:!bg-white/65 [&>article]:ring-1 [&>article]:ring-slate-900/[0.04] [&>article]:before:absolute [&>article]:before:inset-x-0 [&>article]:before:top-0 [&>article]:before:h-1 [&>article]:before:bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_100%)] [&>article]:before:content-['']">
                      {row.oneGuard}
                    </div>
                  </div>
                  <div
                    className={`comparison-product-cell comparison-product-cell--neon px-4 py-5 sm:px-5 ${
                      row.neonLife == null || row.neonLifeTone === "neutral"
                        ? "bg-slate-50/70"
                        : "relative overflow-hidden bg-[linear-gradient(145deg,#f8fafc_0%,#ecfdf5_52%,#ffffff_100%)]"
                    }`}
                  >
                    <div className="relative [&>article]:relative [&>article]:overflow-hidden [&>article]:!border-white/90 [&>article]:!bg-white/65 [&>article]:ring-1 [&>article]:ring-slate-900/[0.04] [&>article]:before:absolute [&>article]:before:inset-x-0 [&>article]:before:top-0 [&>article]:before:h-1 [&>article]:before:bg-[linear-gradient(90deg,#064e3b_0%,#0f766e_100%)] [&>article]:before:content-['']">
                      {row.neonLife}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
