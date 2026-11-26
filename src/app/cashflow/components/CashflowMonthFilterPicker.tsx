import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export type CashflowMonthFilter = "all" | "predicted" | "shifted";

const OPTIONS = [
  { value: "all", label: "Všechny položky" },
  { value: "predicted", label: "Pouze předpoklad" },
  { value: "shifted", label: "Pouze přesunuté" },
] as const;

export function CashflowMonthFilterPicker({ value, onChange }: {
  value: CashflowMonthFilter;
  onChange: (value: CashflowMonthFilter) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    containerRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  return <div ref={containerRef} className="relative" onKeyDown={event => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }}>
    <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(previous => !previous)}
      className={`ui-focus inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-sm transition sm:text-sm ${value === "all"
        ? "border-[#d7c3ed] bg-white text-[#71558f] hover:bg-[#f4ecff]"
        : "border-[#b591d6] bg-[#f0e4fc] text-[#67418d] hover:bg-[#e9d7fa]"}`}>
      <SlidersHorizontal size={15} aria-hidden="true" />
      Filtry{value !== "all" && <span className="rounded-full bg-[#71558f] px-1.5 text-[10px] text-white">1</span>}
      <ChevronDown size={14} aria-hidden="true" className={open ? "rotate-180" : ""} />
    </button>
    {open && <fieldset id={id} className="absolute left-0 top-full z-20 mt-2 w-56 rounded-2xl border border-[#dfd1ef] bg-white p-2 shadow-[0_12px_32px_rgba(54,30,78,0.16)]">
      <legend className="sr-only">Zobrazit položky měsíce</legend>
      {OPTIONS.map(option => <label key={option.value}
        className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-[#f8f3fd] ${value === option.value ? "bg-[#f4ecff]" : ""}`}>
        <input type="radio" name={`${id}-status`} value={option.value} checked={value === option.value}
          className="h-4 w-4 accent-[#8054a9]" onChange={() => onChange(option.value)} />
        {option.label}
      </label>)}
    </fieldset>}
  </div>;
}
