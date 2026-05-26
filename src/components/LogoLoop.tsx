"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type LogoLoopItem = {
  id: string;
  title: string;
  node: ReactNode;
  href?: string;
};

type LogoLoopProps = {
  items: LogoLoopItem[];
  speed?: number;
  direction?: "left" | "right";
  pauseOnHover?: boolean;
  gap?: number;
  className?: string;
  itemClassName?: string;
};

export function LogoLoop({
  items,
  speed = 28,
  direction = "left",
  pauseOnHover = true,
  gap = 42,
  className,
  itemClassName,
}: LogoLoopProps) {
  if (!items.length) return null;

  const doubled = [...items, ...items];
  const style = {
    "--logo-loop-duration": `${speed}s`,
    gap: `${gap}px`,
  } as CSSProperties;

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className
      )}
    >
      <div
        className={cn(
          "logo-loop-track flex w-max min-w-full shrink-0 items-center",
          direction === "right" ? "logo-loop-track--reverse" : "",
          pauseOnHover ? "group-hover:[animation-play-state:paused]" : ""
        )}
        style={style}
      >
        {doubled.map((item, idx) => {
          const content = (
            <div
              className={cn(
                "flex min-h-[56px] min-w-[132px] items-center justify-center opacity-80 transition duration-200 hover:opacity-100",
                itemClassName
              )}
              aria-label={item.title}
              title={item.title}
            >
              {item.node}
            </div>
          );

          if (item.href) {
            return (
              <a
                key={`${item.id}-${idx}`}
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                {content}
              </a>
            );
          }

          return <div key={`${item.id}-${idx}`}>{content}</div>;
        })}
      </div>
    </div>
  );
}

