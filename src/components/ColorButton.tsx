import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const colorButtonVariants = cva(
  "group inline-flex items-center justify-center gap-2 border font-semibold !text-white shadow-sm transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 [&_svg]:!text-white",
  {
    variants: {
      tone: {
        magenta:
          "border-fuchsia-900/20 bg-[linear-gradient(135deg,#020617_0%,#a21caf_48%,#d946ef_100%)] shadow-[0_14px_30px_rgba(192,38,211,0.32)] focus-visible:ring-fuchsia-200",
        blue:
          "border-blue-700/20 bg-[linear-gradient(135deg,#2563eb_0%,#06b6d4_100%)] shadow-[0_10px_20px_rgba(37,99,235,0.28)] focus-visible:ring-blue-200",
        orange:
          "border-orange-700/20 bg-[linear-gradient(135deg,#f59e0b_0%,#f97316_100%)] shadow-[0_10px_20px_rgba(249,115,22,0.28)] focus-visible:ring-orange-200",
        emerald:
          "border-emerald-700/20 bg-[linear-gradient(135deg,#059669_0%,#10b981_55%,#34d399_100%)] shadow-[0_14px_28px_rgba(16,185,129,0.32)] focus-visible:ring-emerald-200",
        violet:
          "border-violet-700/20 bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_55%,#c084fc_100%)] shadow-[0_14px_28px_rgba(124,58,237,0.32)] focus-visible:ring-violet-200",
        rose:
          "border-rose-700/20 bg-[linear-gradient(135deg,#e11d48_0%,#f43f5e_55%,#fb7185_100%)] shadow-[0_14px_28px_rgba(225,29,72,0.32)] focus-visible:ring-rose-200",
        slate:
          "border-slate-700/20 bg-[linear-gradient(135deg,#0f172a_0%,#334155_100%)] shadow-[0_14px_28px_rgba(15,23,42,0.28)] focus-visible:ring-slate-300",
      },
      size: {
        sm: "h-11 rounded-xl px-4 text-sm",
        md: "h-12 rounded-2xl px-5 text-base",
        lg: "h-14 rounded-[18px] px-5 text-lg",
        hero: "h-16 rounded-[22px] px-8 text-lg tracking-tight",
      },
    },
    defaultVariants: {
      tone: "magenta",
      size: "md",
    },
  }
);

export type ColorButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof colorButtonVariants>;

/**
 * Shared primary action button for saturated or gradient backgrounds.
 * It deliberately locks the foreground to white so global theme overrides
 * cannot reduce contrast of labels or icons.
 */
export const ColorButton = forwardRef<HTMLButtonElement, ColorButtonProps>(
  ({ className, tone, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(colorButtonVariants({ tone, size }), className)}
      {...props}
    />
  )
);

ColorButton.displayName = "ColorButton";
