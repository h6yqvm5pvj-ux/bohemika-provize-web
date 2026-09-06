import { Bell, Bookmark, BookOpenCheck, Check, CheckCircle2, LayoutList, Loader2, MailOpen, Search, ShieldCheck, X } from "lucide-react";
import type { WallPersonalAction, WallPersonalState, WallView } from "./wallPersonal";

const buttonClass = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-wait disabled:opacity-50";

export function SpecialistBadge({ specialist }: { specialist?: boolean }) {
  return specialist ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><ShieldCheck size={12} aria-hidden="true" />Specialista</span> : null;
}

export function WallFeedFilters({ view, onViewChange, search, onSearchChange, sectionLabel }: {
  view: WallView; onViewChange: (view: WallView) => void;
  search: string; onSearchChange: (query: string) => void; sectionLabel: string;
}) {
  const options = [
    { value: "all", label: "Všechny", Icon: LayoutList },
    { value: "saved", label: "Uložené", Icon: Bookmark },
    { value: "unread", label: "Nepřečtené", Icon: MailOpen },
    { value: "following", label: "Sledované", Icon: Bell },
  ] as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3">
      <div role="group" aria-label="Zobrazení příspěvků" className="flex flex-wrap gap-1.5">
        {options.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={view === value} onClick={() => onViewChange(value)} className={`${buttonClass} ${view === value ? "border-violet-200 bg-violet-50 text-violet-800" : "border-transparent text-slate-600 hover:bg-slate-100"}`}><Icon size={14} aria-hidden="true" />{label}</button>)}
      </div>
      <div className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-violet-200 sm:w-80">
        <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
        <input type="search" maxLength={120} aria-label="Hledat podle názvu, textu nebo autora" placeholder={`Hledat ${sectionLabel}`} value={search} onChange={event => onSearchChange(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-base text-slate-800 outline-none placeholder:text-slate-400 sm:text-sm" />
        {search && <button type="button" aria-label="Vymazat hledání" onClick={event => { onSearchChange(""); event.currentTarget.parentElement?.querySelector("input")?.focus(); }} className="p-1 text-slate-500"><X size={15} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

export function WallPostPersonalActions({ state, busy, onChange, disabled }: {
  state: WallPersonalState; busy: Partial<Record<WallPersonalAction["field"], boolean>>;
  onChange: (action: WallPersonalAction) => void; disabled: boolean;
}) {
  const actions = [
    { field: "saved", active: state.saved, Icon: Bookmark, label: state.saved ? "Uloženo" : "Uložit", title: state.saved ? "Odebrat z uložených příspěvků" : "Uložit do osobní sbírky" },
    { field: "following", active: state.following, Icon: Bell, label: state.following ? "Sleduji" : "Sledovat", title: state.following ? "Přestat sledovat diskusi" : "Upozorňovat na nové komentáře podle nastavení oznámení" },
    { field: "read", active: state.readAtMs !== null, Icon: BookOpenCheck, label: state.readAtMs !== null ? "Přečteno" : "Označit přečtené", title: state.readAtMs !== null ? "Označit jako nepřečtené" : "Označit příspěvek jako přečtený" },
  ] as const;
  return <div className="flex flex-wrap gap-1.5" role="group" aria-label="Moje příspěvky">
    {actions.map(({ field, active, Icon, label, title }) => <button type="button" key={field} aria-pressed={active} title={title} aria-label={title} disabled={disabled || busy[field]} onClick={() => onChange({ field, value: !active })} className={`${buttonClass} ${active ? "border-violet-200 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {busy[field] ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}{label}
    </button>)}
  </div>;
}

export function SolutionAction({ accepted, allowed, busy, onSelect }: { accepted: boolean; allowed: boolean; busy: boolean; onSelect: () => void }) {
  return <>
    {accepted && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800"><CheckCircle2 size={13} aria-hidden="true" />Vybrané řešení</span>}
    {allowed && <button type="button" disabled={busy} onClick={onSelect} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
      {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}{accepted ? "Zrušit označení řešení" : "Označit jako řešení"}
    </button>}
  </>;
}
