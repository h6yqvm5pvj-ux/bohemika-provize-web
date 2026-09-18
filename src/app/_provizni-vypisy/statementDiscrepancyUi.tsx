"use client";


import type {
  MarkedDiscrepancyItem,
  MarkingControls,
} from "./statementTypes";

export function MarkedDiscrepancyToggle({
  item,
  markingControls,
}: {
  item: MarkedDiscrepancyItem;
  markingControls?: MarkingControls;
}) {
  if (!markingControls?.markingMode) return null;

  const checked = Boolean(markingControls.markedItems[item.key]);

  return (
    <label
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        checked
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => markingControls.onToggleMarked(item, event.target.checked)}
        className="h-4 w-4 accent-rose-700"
      />
      Označit nesrovnalost
    </label>
  );
}
