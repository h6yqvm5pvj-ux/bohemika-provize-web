"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowUpRight, Star, type LucideIcon } from "lucide-react";
import type { ToolCatalogCategory, ToolCatalogNews } from "./toolCatalog";
import styles from "./ToolCard.module.css";

export type ToolCardData = {
  category: ToolCatalogCategory;
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  news?: ToolCatalogNews;
};

const CATEGORY_LABELS: Record<ToolCatalogCategory, string> = {
  "Pojištění vozidel": "Auto",
  "Životní pojištění": "Životní pojištění",
  "Pojištění majetku": "Majetek",
  "Cestovní pojištění": "Cestovní pojištění",
  Finance: "Finance",
  Investice: "Investice",
  Obecné: "Obecné",
};

type ToolCardProps = {
  tool: ToolCardData;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite: () => void;
  onOpenNews: () => void;
  onOpen: () => void;
};

export function ToolCard({ tool, favorite, favoriteDisabled, onToggleFavorite, onOpenNews, onOpen }: ToolCardProps) {
  const titleId = useId();
  const Icon = tool.icon;
  const newsLabel = tool.news?.kind === "new" ? "Nové" : "Aktualizováno";
  const actionLabel = `Otevřít pomůcku ${tool.title}${tool.external ? " (nová karta)" : ""}`;
  const actionContent = <>
    <span>Otevřít</span>
    <span className={styles.actionArrow}><ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" /></span>
  </>;
  const handleOpen = () => {
    onOpen();
    tool.onClick?.();
  };

  return (
    <article className={styles.card} data-category={tool.category} data-favorite={favorite} aria-labelledby={titleId}>
      <div className={styles.header}>
        <span className={styles.icon}><Icon size={23} strokeWidth={1.7} aria-hidden="true" /></span>
        <span className={styles.category}>{CATEGORY_LABELS[tool.category]}</span>
        <button
          type="button"
          className={styles.favorite}
          aria-pressed={favorite}
          aria-label={favorite ? `Odebrat ${tool.title} z oblíbených` : `Přidat ${tool.title} do oblíbených`}
          title={favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
          disabled={favoriteDisabled}
          onClick={onToggleFavorite}
        >
          <Star size={19} strokeWidth={1.7} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.body}>
        <h2 id={titleId} className={`${styles.title} tool-card-title`}>{tool.title}</h2>
        <p className={styles.description}>{tool.description}</p>
      </div>

      <div className={styles.footer}>
        {tool.onClick ? (
          <button type="button" className={styles.open} aria-label={actionLabel} onClick={handleOpen}>
            {actionContent}
          </button>
        ) : tool.external ? (
          <a href={tool.href ?? "#"} target="_blank" rel="noopener noreferrer" className={styles.open} aria-label={actionLabel} onClick={handleOpen}>
            {actionContent}
          </a>
        ) : (
          <Link href={tool.href ?? "#"} className={styles.open} aria-label={actionLabel} onClick={handleOpen}>
            {actionContent}
          </Link>
        )}
        {tool.news ? (
          <button
            type="button"
            className={styles.news}
            data-kind={tool.news.kind}
            aria-label={`${newsLabel}: ${tool.title}. Zobrazit podrobnosti`}
            aria-haspopup="dialog"
            onClick={onOpenNews}
            title="Zobrazit, co se změnilo"
          >
            <span className={styles.newsBadge}><span className={styles.newsDot} aria-hidden="true" />{newsLabel}</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
