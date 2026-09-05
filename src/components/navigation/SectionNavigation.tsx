"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function sectionNavigationItemClass(active: boolean, disabled = false) {
  return `group relative flex min-h-[46px] flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] border px-3.5 py-3 text-[13px] font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset motion-reduce:transition-none sm:px-4 sm:text-sm ${
    active
      ? "border-violet-200/70 bg-white text-violet-700 shadow-[0_2px_8px_rgba(76,29,149,0.08)]"
      : disabled
        ? "cursor-not-allowed border-transparent text-slate-400"
        : "border-transparent text-slate-600 hover:border-white hover:bg-white/80 hover:text-slate-950"
  }`;
}

export function SectionNavigationIcon({ icon: Icon, active = false, disabled = false }: {
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Icon
      size={18}
      strokeWidth={active ? 2.1 : 1.8}
      aria-hidden="true"
      className={`shrink-0 ${active ? "text-violet-600" : disabled ? "text-slate-300" : "text-slate-400 group-hover:text-slate-600"}`}
    />
  );
}

type SectionNavigationProps = {
  activeKey: string;
  label: string;
  role?: "tablist" | "group";
  className?: string;
  children: ReactNode;
};

export function SectionNavigation({ activeKey, label, role = "group", className = "", children }: SectionNavigationProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !selected) return;
    const revealSelection = () => {
      const left = selected.offsetLeft - 6;
      const right = selected.offsetLeft + selected.offsetWidth + 6;
      if (left < list.scrollLeft) list.scrollLeft = left;
      else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    };
    // Reveal the active item on selection / resize without scrolling the page.
    revealSelection();
    const observer = new ResizeObserver(revealSelection);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeKey, children]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = buttons.findIndex((button) => button === event.target || button.contains(event.target as Node));
    // Links retain their native keyboard behavior and are reached with Tab.
    if (index < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex].click();
    buttons[nextIndex].focus({ preventScroll: true });
  }

  return (
    <div
      ref={listRef}
      role={role}
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`relative flex w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain rounded-[20px] border border-slate-200/80 bg-slate-100/70 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}
