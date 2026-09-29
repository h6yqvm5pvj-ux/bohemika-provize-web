import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { formatMoneyValue, moneyInputValue } from "./money";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string; onChange: (value: string) => void; unit?: string; showUnit?: boolean;
};

export function MoneyInput({ value, onChange, unit = "Kč", showUnit = true, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const selectOnFocus = useRef(false);
  const editing = moneyInputValue(value, unit);
  const display = focused || !showUnit ? editing : formatMoneyValue(value, unit);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input || input !== document.activeElement) return;
    if (selectOnFocus.current) {
      input.select();
      selectOnFocus.current = false;
      return;
    }
    if (caret.current !== null) {
      input.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  return <input {...props} ref={ref} inputMode="decimal" value={display}
    onFocus={event => {
      // Select an existing value for quick replacement; the currency suffix is
      // display-only, so typing and deleting never get stuck on it.
      setFocused(true);
      selectOnFocus.current = true;
      onFocus?.(event);
    }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    onChange={event => {
      const input = event.currentTarget;
      const raw = input.value, position = input.selectionStart ?? raw.length;
      const next = moneyInputValue(raw, unit);
      if (next !== raw) {
        // Keep the cursor next to the same digit when grouping inserts spaces.
        const characters = raw.slice(0, position).replace(/\s/g, "").length;
        let seen = 0, index = 0;
        while (index < next.length && seen < characters) {
          if (!/\s/.test(next[index])) seen++;
          index++;
        }
        if ((event.nativeEvent as InputEvent).inputType === "deleteContentForward") {
          while (next[index] === " ") index++;
        }
        caret.current = index;
      } else caret.current = position;
      onChange(next);
    }}
  />;
}
