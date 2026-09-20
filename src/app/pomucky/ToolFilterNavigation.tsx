"use client";

import type { LucideIcon } from "lucide-react";
import { SectionNavigation } from "@/components/navigation/SectionNavigation";
import type { ToolCatalogCategory } from "./toolCatalog";
import styles from "./toolHub.module.css";

type FilterKey = "Všechny" | ToolCatalogCategory;
type ToolFilterNavigationProps = {
  options: { id: FilterKey; label: string; icon: LucideIcon; count: number }[];
  activeFilter: FilterKey;
  onFilterChange: (filter: FilterKey) => void;
};

export function ToolFilterNavigation({ options, activeFilter, onFilterChange }: ToolFilterNavigationProps) {
  return (
    <nav className={styles.categories} aria-label="Sekce pomůcek">
      <SectionNavigation activeKey={activeFilter} label="Kategorie pomůcek" className={styles.categoryList}>
        {options.map((option) => {
          const active = option.id === activeFilter;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              data-active={active}
              aria-pressed={active}
              onClick={() => onFilterChange(option.id)}
            >
              <Icon size={16} aria-hidden="true" />
              {option.label}
              <small>{option.count}</small>
            </button>
          );
        })}
      </SectionNavigation>
    </nav>
  );
}
