"use client";

import type { LucideIcon } from "lucide-react";
import { SectionNavigation, SectionNavigationIcon, sectionNavigationItemClass } from "@/components/navigation/SectionNavigation";
import type { ToolCatalogCategory } from "./toolCatalog";

type FilterKey = "Všechny" | ToolCatalogCategory;
type ToolFilterNavigationProps = {
  options: { id: FilterKey; label: string; icon: LucideIcon; count: number }[];
  activeFilter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
};

export function ToolFilterNavigation({ options, activeFilter, onFilterChange }: ToolFilterNavigationProps) {
  return (
    <nav className="sticky top-1 z-30 rounded-[20px] bg-white/95 backdrop-blur-md sm:top-2" aria-label="Sekce pomůcek">
      <SectionNavigation activeKey={activeFilter} label="Kategorie pomůcek">
        {options.map((option) => {
          const active = option.id === activeFilter;
          return (
            <button
              key={option.id}
              type="button"
              data-active={active}
              aria-pressed={active}
              onClick={() => onFilterChange(option.id)}
              className={sectionNavigationItemClass(active)}
            >
              <SectionNavigationIcon icon={option.icon} active={active} />
              {option.label}
              <span className={`inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-bold leading-none tabular-nums ${active ? "bg-violet-100/80 text-violet-700" : "bg-slate-200/60 text-slate-500"}`}>
                {option.count}
              </span>
            </button>
          );
        })}
      </SectionNavigation>
    </nav>
  );
}
