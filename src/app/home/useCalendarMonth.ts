import { useEffect, useState } from "react";

const monthKey = () => { const now = new Date(); return `${now.getFullYear()}-${now.getMonth()}`; };

/** Local calendar boundaries match the existing home filters, including DST. */
export function useCalendarMonth() {
  const [month, setMonth] = useState(monthKey);
  useEffect(() => {
    const check = () => setMonth(monthKey());
    const timer = window.setInterval(check, 30_000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, []);
  return month;
}
