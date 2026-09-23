"use client";

import { useRef, useState, type KeyboardEvent } from "react";

const CODE_LENGTH = 6;
const toDigits = (code: string) => Array.from({ length: CODE_LENGTH }, (_, index) => code[index] ?? "");

type MfaCodeInputProps = {
  id?: string;
  value: string;
  disabled: boolean;
  required?: boolean;
  describedBy?: string;
  label?: string;
  tone?: "dark" | "light";
  onChange: (value: string) => void;
};

export function MfaCodeInput({ id, value, disabled, required, describedBy, label = "2FA kódu", tone = "dark", onChange }: MfaCodeInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const code = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
  // Preserve empty boxes when correcting a digit without shifting the rest.
  const [draft, setDraft] = useState(() => ({ value: code, digits: toDigits(code) }));
  if (draft.value !== code) {
    setDraft({ value: code, digits: toDigits(code) });
  }

  const focusDigit = (index: number) => {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  };

  const changeDigits = (digits: string[]) => {
    const nextCode = digits.join("");
    setDraft({ value: nextCode, digits });
    onChange(nextCode);
  };

  const updateFromInput = (index: number, rawValue: string) => {
    const entered = rawValue.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (rawValue && !entered) return;
    const next = [...draft.digits];
    if (!entered) {
      next[index] = "";
      changeDigits(next);
      return;
    }
    // A complete pasted or autofilled code always fills all six boxes.
    const start = entered.length === CODE_LENGTH ? 0 : index;
    for (let offset = 0; offset < entered.length && start + offset < CODE_LENGTH; offset++) {
      next[start + offset] = entered[offset];
    }
    changeDigits(next);
    focusDigit(Math.min(start + entered.length, CODE_LENGTH - 1));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      updateFromInput(index, event.key);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      const target = event.key === "Backspace" && !draft.digits[index] ? Math.max(index - 1, 0) : index;
      const next = [...draft.digits];
      next[target] = "";
      changeDigits(next);
      focusDigit(target);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      focusDigit(Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), CODE_LENGTH - 1)));
    }
  };

  return (
    <div className="grid grid-cols-6 gap-2" role="group" aria-label={`Šest číslic ${label}`}>
      {draft.digits.map((digit, index) => (
        <input
          key={index}
          id={id ? (index === 0 ? id : `${id}-${index + 1}`) : undefined}
          ref={element => { inputRefs.current[index] = element; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Číslice ${index + 1} z ${CODE_LENGTH} ${label}`}
          aria-describedby={describedBy}
          value={digit}
          onChange={event => updateFromInput(index, event.target.value)}
          onPaste={event => {
            event.preventDefault();
            updateFromInput(index, event.clipboardData.getData("text"));
          }}
          onKeyDown={event => handleKeyDown(index, event)}
          onFocus={event => event.currentTarget.select()}
          onClick={event => event.currentTarget.select()}
          required={required}
          disabled={disabled}
          className={`h-12 min-w-0 w-full rounded-xl border p-0 text-center font-mono text-lg font-bold outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-55 sm:h-14 ${tone === "light"
            ? "border-violet-200 bg-white text-slate-900 focus:border-violet-600 focus:ring-violet-200"
            : "border-white/18 bg-white/[0.06] text-white focus:border-violet-200/70 focus:bg-white/[0.09] focus:ring-violet-200/20"}`}
        />
      ))}
    </div>
  );
}
